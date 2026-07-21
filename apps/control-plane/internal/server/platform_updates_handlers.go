package server

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// Central update & feedback system:
//   - Super admins broadcast notifications to every user (one insert per user into the
//     existing notifications table, so they surface in the normal notification feed).
//   - Super admins publish platform updates (the "What's New" changelog), optionally
//     broadcasting each release as a notification.
//   - Every user can read the changelog (/updates), see build/version info (/about), and
//     send feedback (/feedback); super admins triage feedback in the admin panel.

// --- version / about ---------------------------------------------------------------------

// buildVersion resolves the running build's version for the About page: TORSOR_VERSION
// wins (set it to the image tag / commit sha at deploy), then SOURCE_COMMIT (set by
// Coolify/nixpacks-style builders), else "dev".
func buildVersion() string {
	for _, k := range []string{"TORSOR_VERSION", "SOURCE_COMMIT"} {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			if len(v) > 12 {
				v = v[:12]
			}
			return v
		}
	}
	return "dev"
}

// handleAbout returns platform identity + build info for the About page (authed users).
func (s *Server) handleAbout(w http.ResponseWriter, r *http.Request) {
	var latestVersion string
	var latestAt *time.Time
	_ = s.pool.QueryRow(r.Context(),
		`SELECT version, published_at FROM platform_updates ORDER BY published_at DESC LIMIT 1`).
		Scan(&latestVersion, &latestAt)
	writeJSON(w, http.StatusOK, map[string]any{
		"name":          "Torsor",
		"description":   "Open-source, self-hostable vibe-coding cloud IDE",
		"build":         buildVersion(),
		"uptimeSeconds": int64(time.Since(s.metrics.start).Seconds()),
		"latestUpdate":  latestVersion,
		"repository":    "https://github.com/magnetoid/Torsor",
	})
}

// --- platform updates (changelog) --------------------------------------------------------

type platformUpdate struct {
	ID          string    `json:"id"`
	Version     string    `json:"version"`
	Title       string    `json:"title"`
	Body        string    `json:"body"`
	PublishedAt time.Time `json:"publishedAt"`
}

const updateCols = `id, version, title, body, published_at`

func scanUpdate(row pgx.Row) (platformUpdate, error) {
	var u platformUpdate
	err := row.Scan(&u.ID, &u.Version, &u.Title, &u.Body, &u.PublishedAt)
	return u, err
}

// handleListUpdates returns the changelog, newest first (any authed user).
func (s *Server) handleListUpdates(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT `+updateCols+` FROM platform_updates ORDER BY published_at DESC LIMIT 50`)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	items := []platformUpdate{}
	for rows.Next() {
		u, err := scanUpdate(rows)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, u)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handlePublishUpdate creates a changelog entry (super admin), optionally broadcasting it
// to all users as a notification.
func (s *Server) handlePublishUpdate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Version   string `json:"version"`
		Title     string `json:"title"`
		Body      string `json:"body"`
		Broadcast bool   `json:"broadcast"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	body.Version, body.Title = strings.TrimSpace(body.Version), strings.TrimSpace(body.Title)
	if body.Version == "" || body.Title == "" {
		writeError(w, http.StatusBadRequest, "version and title are required")
		return
	}
	u, err := scanUpdate(s.pool.QueryRow(r.Context(),
		`INSERT INTO platform_updates (version, title, body, created_by)
		 VALUES ($1, $2, $3, $4) RETURNING `+updateCols,
		body.Version, body.Title, body.Body, userID(r)))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	broadcast := 0
	if body.Broadcast {
		broadcast = s.broadcastNotification(r, "platform_update",
			"New in Torsor "+u.Version+": "+u.Title,
			firstLine(u.Body, 200), "/updates")
	}
	writeJSON(w, http.StatusCreated, map[string]any{"update": u, "notified": broadcast})
}

// handleDeleteUpdate removes a changelog entry (super admin).
func (s *Server) handleDeleteUpdate(w http.ResponseWriter, r *http.Request) {
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM platform_updates WHERE id = $1`, chi.URLParam(r, "updateID"))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Update not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// --- broadcast notifications -------------------------------------------------------------

// broadcastNotification inserts one notification per user in a single statement and
// returns how many users were notified (0 on failure — broadcast is best-effort).
func (s *Server) broadcastNotification(r *http.Request, nType, title, message, link string) int {
	var linkArg any
	if link != "" {
		linkArg = link
	}
	tag, err := s.pool.Exec(r.Context(),
		`INSERT INTO notifications (user_id, type, title, message, link, metadata)
		 SELECT id, $1, $2, $3, $4, '{}'::jsonb FROM users`,
		nType, title, message, linkArg)
	if err != nil {
		s.logger.Warn("broadcast notification failed", "err", err)
		return 0
	}
	return int(tag.RowsAffected())
}

// handleAdminBroadcast sends an announcement notification to every user (super admin).
func (s *Server) handleAdminBroadcast(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title   string `json:"title"`
		Message string `json:"message"`
		Link    string `json:"link"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	body.Title = strings.TrimSpace(body.Title)
	if body.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	n := s.broadcastNotification(r, "announcement", body.Title, strings.TrimSpace(body.Message), strings.TrimSpace(body.Link))
	if n == 0 {
		writeError(w, http.StatusInternalServerError, "Broadcast failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "notified": n})
}

// --- feedback ----------------------------------------------------------------------------

type feedbackItem struct {
	ID        string    `json:"id"`
	UserEmail string    `json:"userEmail,omitempty"`
	Category  string    `json:"category"`
	Message   string    `json:"message"`
	Page      string    `json:"page"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

// handleCreateFeedback stores one feedback entry from the calling user.
func (s *Server) handleCreateFeedback(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Category string `json:"category"`
		Message  string `json:"message"`
		Page     string `json:"page"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	msg := strings.TrimSpace(body.Message)
	if msg == "" {
		writeError(w, http.StatusBadRequest, "message is required")
		return
	}
	if len(msg) > 4000 {
		msg = msg[:4000]
	}
	cat := body.Category
	if cat != "bug" && cat != "idea" {
		cat = "other"
	}
	var id string
	if err := s.pool.QueryRow(r.Context(),
		`INSERT INTO feedback (user_id, category, message, page) VALUES ($1, $2, $3, $4) RETURNING id`,
		userID(r), cat, msg, strings.TrimSpace(body.Page)).Scan(&id); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "id": id})
}

// handleAdminListFeedback returns feedback for triage, newest first (super admin).
func (s *Server) handleAdminListFeedback(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT f.id, u.email, f.category, f.message, f.page, f.status, f.created_at
		   FROM feedback f JOIN users u ON u.id = f.user_id
		  ORDER BY f.created_at DESC LIMIT 200`)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	items := []feedbackItem{}
	for rows.Next() {
		var f feedbackItem
		if err := rows.Scan(&f.ID, &f.UserEmail, &f.Category, &f.Message, &f.Page, &f.Status, &f.CreatedAt); err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, f)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleAdminUpdateFeedback sets a feedback entry's triage status (super admin).
func (s *Server) handleAdminUpdateFeedback(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status string `json:"status"`
	}
	if err := decodeJSON(r, &body); err != nil || (body.Status != "new" && body.Status != "reviewed") {
		writeError(w, http.StatusBadRequest, "status must be 'new' or 'reviewed'")
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE feedback SET status = $2 WHERE id = $1`, chi.URLParam(r, "feedbackID"), body.Status)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Feedback not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// firstLine returns the first non-empty line of s, capped at max chars (notification body).
func firstLine(s string, max int) string {
	for _, line := range strings.Split(s, "\n") {
		if l := strings.TrimSpace(line); l != "" {
			if len(l) > max {
				return l[:max] + "…"
			}
			return l
		}
	}
	return ""
}
