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
	// Rewrite the path: everything after `/preview` is forwarded to the app at its root.
	rest := chi.URLParam(r, "*")
	r.URL.Path = "/" + rest
	r.Host = target.Host
	proxy.ServeHTTP(w, r)
}
