package server

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// deploymentDTO is the deploy state returned to the owner's UI.
type deploymentDTO struct {
	Status    string    `json:"status"` // "running" | "stopped" | "none"
	URL       string    `json:"url"`    // stable public path for the deployed app
	Live      bool      `json:"live"`   // is the workspace app actually reachable right now
	UpdatedAt time.Time `json:"updatedAt,omitempty"`
}

// deployPath is the stable public route a deployed project is served at. Front it with a
// subdomain via reverse proxy (e.g. myapp.torsor.dev -> /d/{id}/) for a production URL.
func deployPath(projectID string) string { return "/d/" + projectID + "/" }

// resolveWorkspaceRuntime loads a project's workspace row + its runtime WITHOUT auth or
// ownership checks and WITHOUT writing to the response. Used by the public deploy proxy,
// which gates on the deployments row instead of on the caller's identity.
func (s *Server) resolveWorkspaceRuntime(ctx context.Context, projectID string) (workspace, plugin.WorkspaceRuntime, bool) {
	ws, err := scanWorkspace(s.pool.QueryRow(ctx,
		`SELECT `+workspaceCols+` FROM workspaces WHERE project_id = $1`, projectID))
	if err != nil {
		return workspace{}, nil, false
	}
	rt, _, ok := s.pickRuntime(ws.Runtime)
	if !ok {
		return workspace{}, nil, false
	}
	return ws, rt, true
}

// handleDeploy marks a project deployed (public) and best-effort ensures its workspace app
// is running. Owner-only. Exposes the app at deployPath(projectID).
func (s *Server) handleDeploy(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	if st, err := rt.StartWorkspace(r.Context(), ws.ProjectID); err == nil {
		s.persistStatus(r, ws, st)
	}
	var updatedAt time.Time
	if err := s.pool.QueryRow(r.Context(),
		`INSERT INTO deployments (project_id, user_id, status) VALUES ($1, $2, 'running')
		 ON CONFLICT (project_id) DO UPDATE SET status = 'running', updated_at = NOW()
		 RETURNING updated_at`, ws.ProjectID, userID(r)).Scan(&updatedAt); err != nil {
		s.fail(w, r, err)
		return
	}
	s.logDeploymentEvent(r.Context(), ws.ProjectID, userID(r), "deploy", "running", deployPath(ws.ProjectID))
	writeJSON(w, http.StatusOK, deploymentDTO{Status: "running", URL: deployPath(ws.ProjectID), UpdatedAt: updatedAt})
}

// logDeploymentEvent appends to the deployment history log. Best-effort: a failed insert
// must not fail the deploy/stop it records, so the error is swallowed (the append-only log
// is observability, not the source of truth for current visibility — that's `deployments`).
func (s *Server) logDeploymentEvent(ctx context.Context, projectID, uid, action, status, url string) {
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO deployment_events (project_id, user_id, action, status, url) VALUES ($1, $2, $3, $4, $5)`,
		projectID, uid, action, status, url)
}

// deploymentEventDTO is one row of a project's deploy history.
type deploymentEventDTO struct {
	ID        string    `json:"id"`
	Action    string    `json:"action"` // "deploy" | "stop"
	Status    string    `json:"status"` // "running" | "stopped" | "error"
	URL       string    `json:"url"`
	CreatedAt time.Time `json:"createdAt"`
}

// handleListDeployments returns a project's recent deploy history (most recent first),
// ownership-scoped like every other project route.
func (s *Server) handleListDeployments(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	rows, err := s.pool.Query(r.Context(),
		`SELECT id, action, status, url, created_at FROM deployment_events
		 WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	items := make([]deploymentEventDTO, 0)
	for rows.Next() {
		var e deploymentEventDTO
		if err := rows.Scan(&e.ID, &e.Action, &e.Status, &e.URL, &e.CreatedAt); err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, e)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleGetDeployment returns the project's deployment state + a live reachability check.
func (s *Server) handleGetDeployment(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	var status string
	var updatedAt time.Time
	err := s.pool.QueryRow(r.Context(),
		`SELECT status, updated_at FROM deployments WHERE project_id = $1`, projectID).Scan(&status, &updatedAt)
	if err == pgx.ErrNoRows {
		writeJSON(w, http.StatusOK, deploymentDTO{Status: "none", URL: deployPath(projectID)})
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	live := false
	if ws, rt, ok := s.resolveWorkspaceRuntime(r.Context(), projectID); ok {
		if st, e := rt.StatusWorkspace(r.Context(), ws.ProjectID); e == nil && st.PreviewHost != "" && st.PreviewPort != 0 {
			live = true
		}
	}
	writeJSON(w, http.StatusOK, deploymentDTO{Status: status, URL: deployPath(projectID), Live: live, UpdatedAt: updatedAt})
}

// handleStopDeployment makes the project private again. It does NOT stop the workspace
// container (dev keeps working); it only flips public visibility off.
func (s *Server) handleStopDeployment(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	if _, err := s.pool.Exec(r.Context(),
		`UPDATE deployments SET status = 'stopped', updated_at = NOW() WHERE project_id = $1`,
		projectID); err != nil {
		s.fail(w, r, err)
		return
	}
	s.logDeploymentEvent(r.Context(), projectID, userID(r), "stop", "stopped", "")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": "stopped"})
}

// handleDeployProxy publicly reverse-proxies a deployed project's workspace app. No auth:
// access is gated on an active ('running') deployment row (created by the owner). The proxy
// target comes from the runtime's live status, never from the client (no SSRF).
func (s *Server) handleDeployProxy(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	var status string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT status FROM deployments WHERE project_id = $1`, projectID).Scan(&status); err != nil || status != "running" {
		writeError(w, http.StatusNotFound, "Not found")
		return
	}
	ws, rt, ok := s.resolveWorkspaceRuntime(r.Context(), projectID)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "Deployment backend unavailable")
		return
	}
	st, err := rt.StatusWorkspace(r.Context(), ws.ProjectID)
	if err != nil || st.PreviewHost == "" || st.PreviewPort == 0 {
		writeError(w, http.StatusServiceUnavailable, "Deployed app is not running (does it expose a port?)")
		return
	}
	w.Header().Del("X-Frame-Options")
	target := &url.URL{Scheme: "http", Host: fmt.Sprintf("%s:%d", st.PreviewHost, st.PreviewPort)}
	proxy := httputil.NewSingleHostReverseProxy(target)
	rest := chi.URLParam(r, "*")
	r.URL.Path = "/" + rest
	r.Host = target.Host
	proxy.ServeHTTP(w, r)
}
