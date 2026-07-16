package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// Presence (Phase 7): live multiplayer awareness. Each project is a room; a WebSocket per
// client joins it, and join/leave/cursor events fan out through Redis pub/sub
// (torsor:presence:{projectID}) so presence works across control-plane instances. Identity is
// server-stamped from the authenticated token — a client can only report its own cursor/tab,
// never spoof another user. This is the lightweight layer under full Yjs co-editing.

type presenceMessage struct {
	Type       string `json:"type"` // join | leave | cursor
	UserID     string `json:"userId"`
	Username   string `json:"username"`
	ClientID   string `json:"clientId"`
	ActiveTab  string `json:"activeTab,omitempty"`
	CursorFile string `json:"cursorFile,omitempty"`
	At         int64  `json:"at"`
}

func presenceChannel(projectID string) string { return "torsor:presence:" + projectID }

// handlePresenceWS is a WebSocket presence room for a project. Authenticated via the
// access_token query param (browsers can't set WS headers) and scoped to project ownership.
func (s *Server) handlePresenceWS(w http.ResponseWriter, r *http.Request) {
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
	// This route sits outside the Bearer-auth middleware, so check ownership directly.
	var owned string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT id FROM projects WHERE id = $1 AND user_id = $2`, projectID, claims.UserID).Scan(&owned); err != nil {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}
	username := claims.UserID
	var uname string
	if err := s.pool.QueryRow(r.Context(), `SELECT username FROM users WHERE id = $1`, claims.UserID).Scan(&uname); err == nil && uname != "" {
		username = uname
	}

	upgrader := s.wsUpgrader()
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade already wrote a response
	}
	defer conn.Close()

	clientID := uuid.NewString()
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	channel := presenceChannel(projectID)
	live, unsub := s.redis.SubscribeChan(ctx, channel)
	defer unsub()

	// Single writer goroutine: forwards room messages and sends keepalive pings. Keeping all
	// writes here avoids concurrent-write races on the gorilla connection.
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-live:
				if !ok {
					return
				}
				if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
					cancel()
					return
				}
			case <-ticker.C:
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					cancel()
					return
				}
			}
		}
	}()

	publish := func(c context.Context, m presenceMessage) {
		m.UserID = claims.UserID
		m.Username = username
		m.ClientID = clientID
		m.At = time.Now().Unix()
		payload, _ := json.Marshal(m)
		_ = s.redis.Publish(c, channel, string(payload))
	}

	publish(ctx, presenceMessage{Type: "join"})

	conn.SetReadLimit(4096)
	_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error { return conn.SetReadDeadline(time.Now().Add(70 * time.Second)) })
	for {
		_, data, rErr := conn.ReadMessage()
		if rErr != nil {
			break
		}
		_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
		var in presenceMessage
		if json.Unmarshal(data, &in) != nil {
			continue
		}
		// Only cursor/tab updates are honored from clients; identity is server-stamped above.
		publish(ctx, presenceMessage{Type: "cursor", ActiveTab: in.ActiveTab, CursorFile: in.CursorFile})
	}
	cancel()
	// Announce departure on a fresh context — the request context is already done.
	publish(context.Background(), presenceMessage{Type: "leave"})
}
