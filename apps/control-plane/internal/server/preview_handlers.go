package server

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/go-chi/chi/v5"

	"github.com/magnetoid/torsor/control-plane/internal/auth"
)

// handlePreviewProxy reverse-proxies to a workspace's live app (a published container
// port) so the IDE can show a running preview in an iframe.
//
// Because a browser can't set an Authorization header on an iframe request, this route
// authenticates from the access_token query param (same pattern as the WebSocket route)
// and then reuses the standard ownership-scoped workspace load. The proxy target
// (preview_host:preview_port) comes from the runtime's live status, never from the client.
func (s *Server) handlePreviewProxy(w http.ResponseWriter, r *http.Request) {
	token := bearerOrQueryToken(r)
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
	st, err := rt.StatusWorkspace(r.Context(), ws.ProjectID)
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
	// Rewrite the path: everything after `/preview` is forwarded to the app at its root.
	rest := chi.URLParam(r, "*")
	r.URL.Path = "/" + rest
	r.Host = target.Host
	proxy.ServeHTTP(w, r)
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
