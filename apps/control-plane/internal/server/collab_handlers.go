package server

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

// Collab (Phase 7): the control plane proxies a project's Yjs co-editing WebSocket to the
// torsor-collab sidecar (a y-websocket server), adding the one thing the sidecar can't do
// itself — ownership enforcement. The room name is the project id, so a user can only join
// the co-editing document for a project they own. CRDT convergence and awareness live in the
// sidecar (Go CRDT libs are immature; a Node sidecar matches the plugin philosophy and stays
// swappable). Enabled by setting TORSOR_COLLAB_URL to the sidecar's ws:// base URL.

func (s *Server) handleCollabWS(w http.ResponseWriter, r *http.Request) {
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
	projectID := chi.URLParam(r, "projectID")
	var owned string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT id FROM projects WHERE id = $1 AND user_id = $2`, projectID, claims.UserID).Scan(&owned); err != nil {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}
	if strings.TrimSpace(s.cfg.CollabURL) == "" {
		writeError(w, http.StatusServiceUnavailable, "Co-editing is not configured (set TORSOR_COLLAB_URL)")
		return
	}

	upgrader := s.wsUpgrader()
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer clientConn.Close()

	// Dial the sidecar; the room (y-websocket doc name) is the ownership-checked project id.
	upstreamURL := strings.TrimRight(s.cfg.CollabURL, "/") + "/" + url.PathEscape(projectID)
	upstream, _, err := websocket.DefaultDialer.DialContext(r.Context(), upstreamURL, nil)
	if err != nil {
		_ = clientConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "collab sidecar unreachable"))
		return
	}
	defer upstream.Close()

	// Pipe both directions, preserving message type (Yjs uses binary frames). Each connection
	// has exactly one reader and one writer across the two goroutines — no concurrent writes.
	done := make(chan struct{}, 2)
	pipe := func(dst, src *websocket.Conn) {
		defer func() { done <- struct{}{} }()
		for {
			mt, msg, err := src.ReadMessage()
			if err != nil {
				return
			}
			if err := dst.WriteMessage(mt, msg); err != nil {
				return
			}
		}
	}
	go pipe(upstream, clientConn)
	go pipe(clientConn, upstream)
	<-done // first side to close tears down the proxy (defers close both)
}
