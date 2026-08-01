package server

import (
	"context"
	"errors"
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

// handleDeploy publishes a project. A buildable project is cut as a RELEASE — snapshot the
// workspace, fork it into its own container, build+serve there (see launchRelease) — so the
// live site is an immutable artifact that survives editing the workspace, and can be rolled
// back. A project with nothing buildable keeps the legacy "publish what's already running"
// behaviour. Owner-only. Exposes the app at deployPath(projectID).
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

	tmpl, templated := s.deployPlan(r.Context(), rt, ws.ProjectID)

	pid, uid := ws.ProjectID, userID(r)

	// A buildable project deploys as a RELEASE: snapshot the workspace, fork it into its own
	// container, build+serve there. Production stops sharing a container with the editor, so
	// the workspace can be stopped, restarted, or edited without taking the site down — and
	// the snapshot makes rollback possible.
	if templated {
		rel, err := s.createRelease(r.Context(), pid, uid, ws.Runtime, "Deploy")
		if err != nil {
			s.fail(w, r, err)
			return
		}
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
			defer cancel()
			s.launchRelease(ctx, rt, pid, uid, rel.ID, tmpl)
		}()
		// 202: the artifact is not live yet. Reporting 200/"running" here is what used to make
		// the UI claim success before the build had even started.
		writeJSON(w, http.StatusAccepted, map[string]any{
			"status":  "building",
			"url":     deployPath(pid),
			"release": rel,
		})
		return
	}

	// Nothing buildable was detected: keep the legacy behaviour of publishing whatever the
	// workspace is already serving. No artifact, so no release row and no rollback.
	if st, err := rt.StartWorkspace(r.Context(), pid); err == nil {
		s.persistStatus(r, ws, st)
	}
	var updatedAt time.Time
	if err := s.pool.QueryRow(r.Context(),
		`INSERT INTO deployments (project_id, user_id, status, release_id) VALUES ($1, $2, 'running', NULL)
		 ON CONFLICT (project_id) DO UPDATE SET status = 'running', release_id = NULL, updated_at = NOW()
		 RETURNING updated_at`, pid, uid).Scan(&updatedAt); err != nil {
		s.fail(w, r, err)
		return
	}
	s.logDeploymentEvent(r.Context(), pid, uid, "deploy", "running", deployPath(pid))
	writeJSON(w, http.StatusOK, deploymentDTO{Status: "running", URL: deployPath(pid), UpdatedAt: updatedAt})
}

// deployPlan decides how a project is built and served. A declared template wins; otherwise
// zero-config detection reads the workspace's real files, so agent-written apps and imports
// deploy with a real build+serve too. Not-ok means nothing buildable was found.
//
// Shared by deploy and rollback: a rollback must serve its artifact the same way the original
// deploy did, and duplicating this was how the two could silently drift apart.
func (s *Server) deployPlan(ctx context.Context, rt plugin.WorkspaceRuntime, projectID string) (Template, bool) {
	var templateID *string
	_ = s.pool.QueryRow(ctx, `SELECT template FROM projects WHERE id = $1`, projectID).Scan(&templateID)
	if templateID != nil {
		if t, found := templateByID(*templateID); found && t.Serve != "" {
			return t, true
		}
	}
	if t, ok := detectWorkspacePlan(ctx, rt, projectID); ok && t.Serve != "" {
		s.logger.Info("deploy: zero-config detection", "project", projectID, "kind", t.ID)
		return t, true
	}
	return Template{}, false
}

// (The old launchTemplateDeploy built and served inside the DEV workspace, restarting it to
// free the shared app port. That is what made production a hostage of the editor. It is
// replaced by launchRelease in release.go — kept out of the tree rather than left behind as a
// second, divergent deploy path.)

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
	// Stop the release container too — otherwise "unpublished" would leave the app running and
	// consuming resources, reachable by anyone who learns the container's port.
	if _, rt, ok := s.resolveWorkspaceRuntime(r.Context(), projectID); ok {
		s.stopRelease(r.Context(), rt, projectID)
	}
	s.logDeploymentEvent(r.Context(), projectID, userID(r), "stop", "stopped", "")
	s.auditFromRequest(r, "deploy_stop", "project", projectID, "", "Stopped the deployment")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": "stopped"})
}

// handleListReleases returns the project's release history, newest first, with the live one
// flagged from deployments.release_id rather than from a release's own status.
func (s *Server) handleListReleases(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	var liveID *string
	_ = s.pool.QueryRow(r.Context(),
		`SELECT release_id FROM deployments WHERE project_id = $1`, projectID).Scan(&liveID)

	rows, err := s.pool.Query(r.Context(),
		`SELECT `+releaseCols+` FROM releases WHERE project_id = $1 ORDER BY number DESC LIMIT 50`, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	items := []release{}
	for rows.Next() {
		rel, err := scanRelease(rows)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		rel.Live = liveID != nil && *liveID == rel.ID
		items = append(items, rel)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleGetRelease returns one release, re-reading the build log from the container while the
// build is still running so the UI can follow it instead of showing a stale snapshot.
func (s *Server) handleGetRelease(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	rel, err := scanRelease(s.pool.QueryRow(r.Context(),
		`SELECT `+releaseCols+` FROM releases WHERE id = $1 AND project_id = $2`,
		chi.URLParam(r, "releaseID"), projectID))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Release not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if rel.Status == "building" {
		if live, ok := s.liveBuildLog(r.Context(), projectID); ok && live != "" {
			rel.BuildLog = live
		}
	}
	var liveID *string
	_ = s.pool.QueryRow(r.Context(),
		`SELECT release_id FROM deployments WHERE project_id = $1`, projectID).Scan(&liveID)
	rel.Live = liveID != nil && *liveID == rel.ID
	writeJSON(w, http.StatusOK, rel)
}

// handleRollbackRelease re-forks an earlier release's snapshot and makes it live again.
//
// This is a re-fork, not a rebuild: the artifact that goes live is byte-identical to what was
// live before, which is the only thing that makes rollback trustworthy during an incident.
func (s *Server) handleRollbackRelease(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	target, err := scanRelease(s.pool.QueryRow(r.Context(),
		`SELECT `+releaseCols+` FROM releases WHERE id = $1 AND project_id = $2`,
		chi.URLParam(r, "releaseID"), ws.ProjectID))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Release not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if target.SnapshotID == "" {
		writeError(w, http.StatusConflict, "That release has no snapshot to roll back to (its build never completed).")
		return
	}

	tmpl, ok := s.deployPlan(r.Context(), rt, ws.ProjectID)
	if !ok {
		writeError(w, http.StatusConflict, "Cannot determine how to serve this project.")
		return
	}

	pid, uid, snap := ws.ProjectID, userID(r), target.SnapshotID
	relID := target.ID
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		defer cancel()
		if err := s.bootReleaseContainer(ctx, rt, pid, releaseWorkspaceID(pid), snap, tmpl); err != nil {
			s.updateReleaseStatus(ctx, relID, "failed", "Rollback failed: "+err.Error())
			return
		}
		if err := s.activateRelease(ctx, pid, uid, relID); err != nil {
			s.logger.Warn("rollback activate failed", "err", err, "project", pid)
			return
		}
		s.logDeploymentEventRelease(ctx, pid, uid, "rollback", "running", deployPath(pid), relID)
	}()

	s.auditFromRequest(r, "deploy_rollback", "project", ws.ProjectID, target.ID,
		fmt.Sprintf("Rolled back to release v%d", target.Number))
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "rolling-back", "release": target})
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
	// verified_at IS NOT NULL is the security boundary: attaching a hostname is only a claim,
	// and an unproven claim must never make this instance answer for someone else's domain.
	// An unverified row is indistinguishable from "no such domain" here, deliberately — it
	// leaks nothing about which hostnames other users have attached.
	if err := s.pool.QueryRow(r.Context(),
		`SELECT project_id FROM custom_domains WHERE domain = $1 AND verified_at IS NOT NULL`,
		host).Scan(&projectID); err != nil {
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
	// Where traffic goes is decided by the release, not by the dev workspace: a published
	// project is served by its release container so editing or stopping the workspace cannot
	// take the site down. Pre-0026 deployments have no release and keep the old target.
	targetWS, _, ok := s.releaseTarget(r.Context(), projectID)
	if !ok {
		writeError(w, http.StatusNotFound, "Not found")
		return
	}
	_, rt, ok := s.resolveWorkspaceRuntime(r.Context(), projectID)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "Deployment backend unavailable")
		return
	}
	st, err := rt.StatusWorkspace(r.Context(), targetWS)
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
