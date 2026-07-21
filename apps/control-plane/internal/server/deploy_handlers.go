package server

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
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

// handleDeploy marks a project deployed (public) and brings its app online. For a templated
// project it runs a REAL production build + serve (see launchTemplateDeploy); otherwise it
// best-effort ensures whatever is already running stays up. Owner-only. Exposes the app at
// deployPath(projectID).
func (s *Server) handleDeploy(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}

	// Deploy gate: refuse to publish a workspace that contains credential material (finding
	// locations only — values are never echoed). Disable with TORSOR_DEPLOY_SCAN=off.
	if deployScanEnabled() {
		if findings := scanWorkspaceSecrets(r.Context(), rt, ws.ProjectID); len(findings) > 0 {
			s.logger.Warn("deploy blocked by secret scan", "project", ws.ProjectID, "findings", len(findings))
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
				"error":    "Deploy blocked: possible secrets found in the project. Remove them (or store them under Settings → Secrets and reference them as {{secret:NAME}}), then deploy again.",
				"findings": findings,
			})
			return
		}
	}

	// A templated project deploys its production build. A template-less project gets
	// zero-config detection over the workspace's real files (agent-written apps, imports)
	// so it deploys with a real build+serve too; only when nothing is detectable do we
	// fall back to keeping whatever is already running up.
	var templateID *string
	_ = s.pool.QueryRow(r.Context(), `SELECT template FROM projects WHERE id = $1`, ws.ProjectID).Scan(&templateID)
	tmpl, templated := Template{}, false
	if templateID != nil {
		if t, found := templateByID(*templateID); found && t.Serve != "" {
			tmpl, templated = t, true
		}
	}
	if !templated {
		if t, ok := detectWorkspacePlan(r.Context(), rt, ws.ProjectID); ok && t.Serve != "" {
			tmpl, templated = t, true
			s.logger.Info("deploy: zero-config detection", "project", ws.ProjectID, "kind", t.ID)
		}
	}

	if templated {
		// Real production deploy in the background: restart the container to free the shared
		// app port from the dev server, then build && serve the production output. The public
		// /d/ URL shows a self-refreshing "starting" page until the build finishes and serve
		// binds. Detached context so it outlives this request.
		pid := ws.ProjectID
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
			defer cancel()
			if err := s.launchTemplateDeploy(ctx, rt, pid, tmpl); err != nil {
				s.logger.Warn("deploy launch failed", "err", err, "project", pid)
			}
		}()
	} else if st, err := rt.StartWorkspace(r.Context(), ws.ProjectID); err == nil {
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

// launchTemplateDeploy brings a templated project's PRODUCTION build online. It restarts the
// workspace container — docker stop/start kills the dev server holding the shared app port
// while the container filesystem (built output, node_modules) persists — then writes and runs
// `build && serve` detached, so the deployed app serves its production output on the preview
// port. Returns quickly (the build runs in the background inside the container); the public
// /d/ URL shows a "starting" page until serve binds.
func (s *Server) launchTemplateDeploy(ctx context.Context, rt plugin.WorkspaceRuntime, projectID string, tmpl Template) error {
	if _, err := rt.StopWorkspace(ctx, projectID, 5); err != nil {
		return err
	}
	if _, err := rt.StartWorkspace(ctx, projectID); err != nil {
		return err
	}
	inner := tmpl.Serve
	if tmpl.Build != "" {
		inner = tmpl.Build + " && " + tmpl.Serve
	}
	script := "cd " + workspaceDir + " && " + inner + "\n"
	if err := rt.WriteFile(ctx, projectID, workspaceDir+"/.torsor-deploy.sh", []byte(script), true); err != nil {
		return err
	}
	launch := "nohup sh " + workspaceDir + "/.torsor-deploy.sh >/tmp/torsor-deploy.log 2>&1 & echo launched"
	return rt.Exec(ctx, plugin.ExecSpec{
		WorkspaceID: projectID,
		WorkingDir:  workspaceDir,
		Command:     []string{"sh", "-c", launch},
	}, func(plugin.ExecChunk) error { return nil })
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

// handleDeployProxy publicly reverse-proxies a deployed project's workspace app at the stable
// /d/{projectID}/ path. No auth: access is gated on an active ('running') deployment row.
func (s *Server) handleDeployProxy(w http.ResponseWriter, r *http.Request) {
	s.serveDeployment(w, r, chi.URLParam(r, "projectID"), "/"+chi.URLParam(r, "*"))
}

// handleCustomDomainProxy resolves the request's Host to a project via custom_domains and
// serves that project's deployment. Registered as the router's NotFound handler, so a request
// arriving on a custom domain (forwarded here by the reverse proxy) that matches no other route
// is served the mapped project's app; unmatched requests on other hosts still 404.
func (s *Server) handleCustomDomainProxy(w http.ResponseWriter, r *http.Request) {
	host := stripPort(r.Host)
	var projectID string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT project_id FROM custom_domains WHERE domain = $1`, host).Scan(&projectID); err != nil {
		// Not a custom domain → the ordinary "no route matched" 404 (same shape as before).
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not Found", "path": r.URL.Path})
		return
	}
	s.serveDeployment(w, r, projectID, r.URL.Path)
}

// serveDeployment reverse-proxies to projectID's running deployment, forwarding upstreamPath to
// the app. The proxy target comes from the runtime's live status, never from the client (no
// SSRF). A booting app shows the self-refreshing "starting" page instead of a raw 502.
func (s *Server) serveDeployment(w http.ResponseWriter, r *http.Request, projectID, upstreamPath string) {
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
	proxy.ErrorHandler = func(rw http.ResponseWriter, _ *http.Request, _ error) {
		rw.Header().Set("Content-Type", "text/html; charset=utf-8")
		rw.WriteHeader(http.StatusServiceUnavailable)
		_, _ = rw.Write([]byte(previewStartingHTML))
	}
	r.URL.Path = upstreamPath
	r.Host = target.Host
	proxy.ServeHTTP(w, r)
}

// stripPort returns the host without any ":port" suffix.
func stripPort(host string) string {
	if i := strings.LastIndexByte(host, ':'); i >= 0 && !strings.Contains(host[i:], "]") {
		return host[:i]
	}
	return host
}
