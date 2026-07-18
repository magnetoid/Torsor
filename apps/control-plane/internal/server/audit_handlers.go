package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// Audit log — real, server-written events (never client-reported, so entries
// can't be spoofed). writeAudit records an action; handleListAudit returns the
// current user's events. Backed by the audit_logs table.

type auditEntry struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	UserName  string    `json:"userName"`
	Action    string    `json:"action"`
	Resource  string    `json:"resource"`
	Details   string    `json:"details"`
	IPAddress string    `json:"ipAddress"`
	Timestamp time.Time `json:"timestamp"`
}

// writeAudit records an audit event. Best-effort: failures are logged, never
// propagated to the caller's primary operation. resourceID must be a real UUID
// (or empty); resource/details/ip travel in the details jsonb.
func (s *Server) writeAudit(ctx context.Context, uid, action, resourceType, resourceID, resource, details, ip string) {
	payload, _ := json.Marshal(map[string]any{
		"resource": resource,
		"message":  details,
		"ip":       ip,
	})
	var rid any
	if resourceID != "" {
		rid = resourceID
	}
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
		 VALUES ($1, $2, $3, $4, $5)`,
		uid, action, resourceType, rid, payload); err != nil {
		s.logger.Warn("audit write failed", "err", err, "action", action)
	}
}

// auditFromRequest is the common case: record an action performed by the
// authenticated user, capturing their IP.
func (s *Server) auditFromRequest(r *http.Request, action, resourceType, resourceID, resource, details string) {
	s.writeAudit(r.Context(), userID(r), action, resourceType, resourceID, resource, details, clientIP(r))
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return xff
	}
	return r.RemoteAddr
}

func (s *Server) handleListAudit(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT a.id, a.action, a.details, a.created_at, COALESCE(u.email, '')
		   FROM audit_logs a
		   LEFT JOIN users u ON u.id = a.user_id
		  WHERE a.user_id = $1
		  ORDER BY a.created_at DESC
		  LIMIT 100`, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	items := []auditEntry{}
	uid := userID(r)
	for rows.Next() {
		var e auditEntry
		var details []byte
		var email string
		if err := rows.Scan(&e.ID, &e.Action, &details, &e.Timestamp, &email); err != nil {
			s.fail(w, r, err)
			return
		}
		var d struct {
			Resource string `json:"resource"`
			Message  string `json:"message"`
			IP       string `json:"ip"`
		}
		_ = json.Unmarshal(details, &d)
		e.UserID = uid
		e.UserName = email
		e.Resource = d.Resource
		e.Details = d.Message
		e.IPAddress = d.IP
		items = append(items, e)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}
