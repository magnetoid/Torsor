package server

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/magnetoid/torsor/control-plane/internal/auth"
	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// Live preview proxying, two modes:
//
//   - Path mode (always on): /api/v1/projects/{id}/preview/* — the iframe URL carries
//     ?access_token (an iframe can't set an Authorization header); a scoped cookie is then
//     set so the page's SUB-requests (scripts, styles, fetches — which never inherit the
//     query string) authenticate too. Paths are stripped, so apps that serve root-relative
//     module URLs (Vite dev) still break out of the prefix — which is why host mode exists.
//
//   - Host mode (TORSOR_PREVIEW_DOMAIN, e.g. "preview.torsor.dev"): <projectID>.<domain>
//     serves the app at "/" on its OWN origin — root-absolute URLs, module imports, and the
//     HMR WebSocket all just work, and the auth cookie is first-party to that origin. This
//     is the standard 2026 preview architecture (wildcard DNS + wildcard TLS terminate at
//     the reverse proxy; see docs/PRODUCTION-HARDENING.md).
//
// Both modes authenticate query-token-then-cookie and enforce project ownership; the proxy
// target (preview_host:preview_port) comes from the runtime's live status, never the client.

// previewCookie carries the session token for preview sub-requests. Path mode scopes it to
// the project's /preview path; host mode scopes it to the preview subdomain (its own
// origin). HttpOnly always — the previewed app's JS must not be able to read it.
const previewCookie = "torsor_preview"

// previewToken resolves the auth token for a preview request: explicit query param wins
// (first load from the IDE), then the scoped cookie (every sub-request after that).
// Returns the token and whether it arrived via the query (and so should be re-set as a
// cookie for the requests that follow).
func previewToken(r *http.Request) (string, bool) {
	if t := strings.TrimSpace(r.URL.Query().Get("access_token")); t != "" {
		return t, true
	}
	if c, err := r.Cookie(previewCookie); err == nil && c.Value != "" {
		return c.Value, false
	}
	return "", false
}

// setPreviewCookie persists the token for sub-requests, scoped as narrowly as the mode
// allows. Secure tracks the (proxied) scheme so local plain-HTTP dev still works.
func setPreviewCookie(w http.ResponseWriter, r *http.Request, token, path string) {
	http.SetCookie(w, &http.Cookie{
		Name:     previewCookie,
		Value:    token,
		Path:     path,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https"),
	})
}

// serveWorkspacePreview proxies a request to the workspace's live app. stripPrefix is the
// mount point to remove from the path ("" = host mode, forward as-is).
func (s *Server) serveWorkspacePreview(w http.ResponseWriter, r *http.Request, rt plugin.WorkspaceRuntime, projectID, restPath string) {
	st, err := rt.StatusWorkspace(r.Context(), projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if st.PreviewHost == "" || st.PreviewPort == 0 {
		writeError(w, http.StatusServiceUnavailable, "No live preview for this workspace (is the app running and exposing a port?)")
		return
	}

	// The global securityHeaders middleware sets X-Frame-Options: SAMEORIGIN, which would
	// block the frontend (a different origin) from framing the preview. Drop it here so the
	// IDE can embed the user's own running app in an iframe.
	w.Header().Del("X-Frame-Options")

	target := &url.URL{Scheme: "http", Host: fmt.Sprintf("%s:%d", st.PreviewHost, st.PreviewPort)}
	proxy := httputil.NewSingleHostReverseProxy(target)
	// Also strip it from the upstream response in case the app itself sets one.
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("X-Frame-Options")
		return nil
	}
	// The container's port is published as soon as it's created, so this route is reachable
	// before the dev server inside actually listens (npm install + boot can take 30-90s). The
	// default proxy would surface a raw 502 in the iframe during that window; instead serve a
	// friendly, self-refreshing "starting" page so the preview recovers on its own.
	proxy.ErrorHandler = func(rw http.ResponseWriter, _ *http.Request, _ error) {
		rw.Header().Del("X-Frame-Options")
		rw.Header().Set("Content-Type", "text/html; charset=utf-8")
		rw.WriteHeader(http.StatusServiceUnavailable)
		_, _ = rw.Write([]byte(previewStartingHTML))
	}
	r.URL.Path = restPath
	r.Host = target.Host
	proxy.ServeHTTP(w, r)
}

// handlePreviewProxy is the path-mode preview (see the file header).
func (s *Server) handlePreviewProxy(w http.ResponseWriter, r *http.Request) {
	token, fromQuery := previewToken(r)
	if t := bearerOrQueryToken(r); t != "" { // bearer still wins when a client can send it
		token = t
	}
	if token == "" {
		writeError(w, http.StatusUnauthorized, "Authentication required")
		return
	}
	claims, err := s.auth.Authenticate(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid or expired token")
		return
	}
	// Attach the claims so loadWorkspace's ownership check (userID/ownsProject) works.
	r = r.WithContext(auth.WithClaims(r.Context(), claims))

	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	if fromQuery {
		// Scope the cookie to exactly this project's preview mount, so the page's
		// sub-requests (which never inherit the query string) can authenticate.
		setPreviewCookie(w, r, token, "/api/v1/projects/"+ws.ProjectID+"/preview")
	}
	s.serveWorkspacePreview(w, r, rt, ws.ProjectID, "/"+chi.URLParam(r, "*"))
}

// handleHostPreview is the host-mode preview: <projectID>.<PreviewDomain> served at "/".
// Ownership is enforced exactly like path mode; the project id comes from the subdomain.
func (s *Server) handleHostPreview(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	if i := strings.IndexByte(host, ':'); i >= 0 {
		host = host[:i]
	}
	projectID := strings.TrimSuffix(host, "."+s.cfg.PreviewDomain)
	if projectID == host || projectID == "" || strings.Contains(projectID, ".") {
		writeError(w, http.StatusNotFound, "Unknown preview host")
		return
	}

	token, fromQuery := previewToken(r)
	if token == "" {
		writeError(w, http.StatusUnauthorized, "This preview requires authentication — open it from the Torsor IDE")
		return
	}
	claims, err := s.auth.Authenticate(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid or expired token")
		return
	}
	// Ownership: the subdomain names the project; verify the caller owns it.
	var one int
	if err := s.pool.QueryRow(r.Context(),
		`SELECT 1 FROM projects WHERE id = $1 AND user_id = $2`, projectID, claims.UserID).Scan(&one); err != nil {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}
	ws, rt, ok := s.resolveWorkspaceRuntime(r.Context(), projectID)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "No workspace for this project")
		return
	}
	if fromQuery {
		// First-party cookie on the preview origin: every sub-request — scripts, fetches,
		// and the HMR WebSocket — authenticates automatically from here on.
		setPreviewCookie(w, r, token, "/")
	}
	s.serveWorkspacePreview(w, r, rt, ws.ProjectID, r.URL.Path)
}

// previewStartingHTML is shown in the preview iframe while the workspace's dev server is
// still booting (the published port is reachable before the app inside listens). It refreshes
// itself every 3s so the real app replaces it automatically once it responds. Self-contained
// (inline styles) and theme-neutral.
const previewStartingHTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="3" />
  <title>Starting your app…</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
           font-family: system-ui, -apple-system, sans-serif; background: #0b0b0f; color: #e5e7eb; }
    @media (prefers-color-scheme: light) { body { background: #f8fafc; color: #1e293b; } }
    .card { text-align: center; padding: 2rem; }
    .spinner { width: 34px; height: 34px; margin: 0 auto 1.25rem; border-radius: 50%;
               border: 3px solid rgba(127,127,127,.25); border-top-color: #6366f1; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 1rem; font-weight: 600; margin: 0 0 .4rem; }
    p { font-size: .85rem; opacity: .7; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Starting your app…</h1>
    <p>Installing dependencies and booting the dev server. This preview will refresh automatically.</p>
  </div>
</body>
</html>`
