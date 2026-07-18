package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
)

// Notifications feed — a real per-user list backed by the notifications table,
// replacing the frontend mock. Every query is scoped to the authenticated user.

type notification struct {
	ID        string          `json:"id"`
	Type      string          `json:"type"`
	Title     string          `json:"title"`
	Message   string          `json:"message"`
	Link      *string         `json:"link,omitempty"`
	Metadata  json.RawMessage `json:"metadata"`
	IsRead    bool            `json:"isRead"`
	Timestamp time.Time       `json:"timestamp"`
}

func (s *Server) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT id, type, title, message, link, metadata, is_read, created_at
		   FROM notifications
		  WHERE user_id = $1
		  ORDER BY created_at DESC
		  LIMIT 100`, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	items := []notification{}
	for rows.Next() {
		var n notification
		var meta []byte
		if err := rows.Scan(&n.ID, &n.Type, &n.Title, &n.Message, &n.Link, &meta, &n.IsRead, &n.Timestamp); err != nil {
			s.fail(w, r, err)
			return
		}
		if len(meta) == 0 {
			meta = []byte("{}")
		}
		n.Metadata = meta
		items = append(items, n)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleMarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "notificationID")
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`, id, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Notification not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleMarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	if _, err := s.pool.Exec(r.Context(),
		`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`, userID(r)); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleDeleteNotification(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "notificationID")
	if _, err := s.pool.Exec(r.Context(),
		`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, id, userID(r)); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleClearNotifications(w http.ResponseWriter, r *http.Request) {
	if _, err := s.pool.Exec(r.Context(),
		`DELETE FROM notifications WHERE user_id = $1`, userID(r)); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// emitNotification inserts a notification for a user. Best-effort: it never
// blocks or fails the caller's primary operation (e.g. sending an invite), so
// errors are swallowed with a log.
func (s *Server) emitNotification(ctx context.Context, userID, nType, title, message, link string, metadata map[string]any) {
	meta, err := json.Marshal(metadata)
	if err != nil || metadata == nil {
		meta = []byte("{}")
	}
	var linkArg any
	if link != "" {
		linkArg = link
	}
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO notifications (user_id, type, title, message, link, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		userID, nType, title, message, linkArg, meta); err != nil {
		s.logger.Warn("failed to emit notification", "err", err, "type", nType, "user", userID)
	}
}
