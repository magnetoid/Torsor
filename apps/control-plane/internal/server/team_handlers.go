package server

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type team struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	LogoURL   *string   `json:"logoUrl"`
	OwnerID   string    `json:"ownerId"`
	Plan      string    `json:"plan"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

const teamCols = `id, name, slug, logo_url, owner_id, plan, created_at, updated_at`

func scanTeam(row pgx.Row) (team, error) {
	var t team
	err := row.Scan(&t.ID, &t.Name, &t.Slug, &t.LogoURL, &t.OwnerID, &t.Plan, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

func (s *Server) handleListTeams(w http.ResponseWriter, r *http.Request) {
	// A user can list teams they own OR teams they are a member of.
	rows, err := s.pool.Query(r.Context(),
		`SELECT t.id, t.name, t.slug, t.logo_url, t.owner_id, t.plan, t.created_at, t.updated_at 
		 FROM teams t
		 LEFT JOIN team_members tm ON t.id = tm.team_id
		 WHERE t.owner_id = $1 OR tm.user_id = $1
		 GROUP BY t.id
		 ORDER BY t.updated_at DESC`, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	items := []team{}
	for rows.Next() {
		t, err := scanTeam(rows)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, t)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleCreateTeam(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string  `json:"name"`
		Slug string  `json:"slug"`
		Logo *string `json:"logoUrl"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	name := strings.TrimSpace(body.Name)
	slug := strings.TrimSpace(body.Slug)
	if name == "" || slug == "" {
		writeError(w, http.StatusBadRequest, "Team name and slug are required")
		return
	}

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer tx.Rollback(r.Context())

	t, err := scanTeam(tx.QueryRow(r.Context(),
		`INSERT INTO teams (name, slug, logo_url, owner_id)
		 VALUES ($1, $2, $3, $4) RETURNING `+teamCols,
		name, slug, body.Logo, userID(r)))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "A team with that slug already exists")
			return
		}
		s.fail(w, r, err)
		return
	}

	// Add owner as a member automatically
	if _, err := tx.Exec(r.Context(),
		`INSERT INTO team_members (team_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')`,
		t.ID, userID(r)); err != nil {
		s.fail(w, r, err)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		s.fail(w, r, err)
		return
	}

	s.auditFromRequest(r, "workspace_create", "team", t.ID, t.Name, "Created workspace "+t.Name)

	writeJSON(w, http.StatusCreated, t)
}

func (s *Server) handleGetTeam(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamID")
	// Verify access (owner or member)
	var t team
	err := s.pool.QueryRow(r.Context(),
		`SELECT t.id, t.name, t.slug, t.logo_url, t.owner_id, t.plan, t.created_at, t.updated_at 
		 FROM teams t
		 LEFT JOIN team_members tm ON t.id = tm.team_id
		 WHERE t.id = $1 AND (t.owner_id = $2 OR tm.user_id = $2)
		 GROUP BY t.id`, teamID, userID(r)).Scan(&t.ID, &t.Name, &t.Slug, &t.LogoURL, &t.OwnerID, &t.Plan, &t.CreatedAt, &t.UpdatedAt)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Team not found or access denied")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) handleUpdateTeam(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamID")
	// Only owner or admin can update. For simplicity, check owner.
	var owner string
	err := s.pool.QueryRow(r.Context(), `SELECT owner_id FROM teams WHERE id = $1`, teamID).Scan(&owner)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Team not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if owner != userID(r) {
		writeError(w, http.StatusForbidden, "Only team owner can update settings")
		return
	}

	var body struct {
		Name    *string `json:"name"`
		Slug    *string `json:"slug"`
		LogoURL *string `json:"logoUrl"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Fetch current to merge
	t, err := scanTeam(s.pool.QueryRow(r.Context(), `SELECT `+teamCols+` FROM teams WHERE id = $1`, teamID))
	if err != nil {
		s.fail(w, r, err)
		return
	}

	name := t.Name
	if body.Name != nil {
		name = *body.Name
	}
	slug := t.Slug
	if body.Slug != nil {
		slug = *body.Slug
	}
	logo := t.LogoURL
	if body.LogoURL != nil {
		logo = body.LogoURL
	}

	updated, err := scanTeam(s.pool.QueryRow(r.Context(),
		`UPDATE teams SET name = $2, slug = $3, logo_url = $4, updated_at = NOW() WHERE id = $1 RETURNING `+teamCols,
		teamID, name, slug, logo))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "A team with that slug already exists")
			return
		}
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteTeam(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamID")
	res, err := s.pool.Exec(r.Context(), `DELETE FROM teams WHERE id = $1 AND owner_id = $2`, teamID, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if res.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Team not found or you do not have permission")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type teamMember struct {
	ID           string    `json:"id"`
	TeamID       string    `json:"teamId"`
	UserID       string    `json:"userId"`
	Role         string    `json:"role"`
	Status       string    `json:"status"`
	JoinedAt     time.Time `json:"joinedAt"`
	LastActiveAt time.Time `json:"lastActiveAt"`
	User         struct {
		Name      string  `json:"name"`
		Email     string  `json:"email"`
		AvatarURL *string `json:"avatarUrl"`
	} `json:"user"`
}

func (s *Server) handleListTeamMembers(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamID")
	// Verify access
	var hasAccess bool
	err := s.pool.QueryRow(r.Context(),
		`SELECT EXISTS(
			SELECT 1 FROM teams t LEFT JOIN team_members tm ON t.id = tm.team_id 
			WHERE t.id = $1 AND (t.owner_id = $2 OR tm.user_id = $2)
		)`, teamID, userID(r)).Scan(&hasAccess)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !hasAccess {
		writeError(w, http.StatusNotFound, "Team not found or access denied")
		return
	}

	rows, err := s.pool.Query(r.Context(),
		`SELECT tm.id, tm.team_id, tm.user_id, tm.role, tm.status, tm.joined_at, tm.last_active_at,
		        u.username, u.email, u.avatar_url
		 FROM team_members tm
		 JOIN users u ON tm.user_id = u.id
		 WHERE tm.team_id = $1
		 ORDER BY tm.joined_at ASC`, teamID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	var members []teamMember
	for rows.Next() {
		var m teamMember
		err := rows.Scan(&m.ID, &m.TeamID, &m.UserID, &m.Role, &m.Status, &m.JoinedAt, &m.LastActiveAt,
			&m.User.Name, &m.User.Email, &m.User.AvatarURL)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		members = append(members, m)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": members})
}

func (s *Server) handleCreateTeamInvite(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamID")
	// Verify access (owner or admin). We'll check owner for simplicity right now.
	var owner string
	err := s.pool.QueryRow(r.Context(), `SELECT owner_id FROM teams WHERE id = $1`, teamID).Scan(&owner)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Team not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if owner != userID(r) {
		writeError(w, http.StatusForbidden, "Only team owner can invite members")
		return
	}

	var body struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Email == "" || body.Role == "" {
		writeError(w, http.StatusBadRequest, "Email and role are required")
		return
	}

	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	var inviteID string
	err = s.pool.QueryRow(r.Context(),
		`INSERT INTO team_invites (team_id, email, role, invited_by, expires_at)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		teamID, body.Email, body.Role, userID(r), expiresAt).Scan(&inviteID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "An invite for this email already exists")
			return
		}
		s.fail(w, r, err)
		return
	}

	// If the invitee already has an account, drop a real notification into their
	// feed carrying the invite id so the Accept/Decline actions can act on it.
	var teamName string
	_ = s.pool.QueryRow(r.Context(), `SELECT name FROM teams WHERE id = $1`, teamID).Scan(&teamName)
	var inviteeID string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT id FROM users WHERE lower(email) = lower($1)`, body.Email).Scan(&inviteeID); err == nil && inviteeID != "" {
		title := "Workspace invitation"
		msg := "You've been invited to join " + teamName
		s.emitNotification(r.Context(), inviteeID, "invite_received", title, msg, "", map[string]any{
			"inviteId":    inviteID,
			"workspaceId": teamID,
		})
	}

	s.auditFromRequest(r, "member_invite", "team", teamID, teamName, "Invited "+body.Email+" as "+body.Role)

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":        inviteID,
		"email":     body.Email,
		"role":      body.Role,
		"expiresAt": expiresAt,
	})
}

func (s *Server) handleRemoveTeamMember(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamID")
	targetUserID := chi.URLParam(r, "userID")

	// Verify access (owner)
	var owner string
	err := s.pool.QueryRow(r.Context(), `SELECT owner_id FROM teams WHERE id = $1`, teamID).Scan(&owner)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Team not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if owner != userID(r) {
		writeError(w, http.StatusForbidden, "Only team owner can remove members")
		return
	}

	if owner == targetUserID {
		writeError(w, http.StatusBadRequest, "Owner cannot be removed")
		return
	}

	res, err := s.pool.Exec(r.Context(), `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, teamID, targetUserID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if res.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Member not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUpdateTeamMemberRole(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamID")
	targetUserID := chi.URLParam(r, "userID")

	// Verify access (owner)
	var owner string
	err := s.pool.QueryRow(r.Context(), `SELECT owner_id FROM teams WHERE id = $1`, teamID).Scan(&owner)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Team not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if owner != userID(r) {
		writeError(w, http.StatusForbidden, "Only team owner can update member roles")
		return
	}

	if owner == targetUserID {
		writeError(w, http.StatusBadRequest, "Owner role cannot be changed")
		return
	}

	var body struct {
		Role string `json:"role"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	res, err := s.pool.Exec(r.Context(),
		`UPDATE team_members SET role = $3, last_active_at = NOW() WHERE team_id = $1 AND user_id = $2`,
		teamID, targetUserID, body.Role)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if res.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Member not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleAcceptTeamInvite(w http.ResponseWriter, r *http.Request) {
	inviteID := chi.URLParam(r, "inviteID")

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer tx.Rollback(r.Context())

	var teamID string
	var email string
	var role string
	var status string
	var expiresAt time.Time

	err = tx.QueryRow(r.Context(),
		`SELECT team_id, email, role, status, expires_at FROM team_invites WHERE id = $1 FOR UPDATE`,
		inviteID).Scan(&teamID, &email, &role, &status, &expiresAt)

	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Invite not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}

	if status != "pending" {
		writeError(w, http.StatusBadRequest, "Invite is no longer pending")
		return
	}

	if time.Now().After(expiresAt) {
		writeError(w, http.StatusBadRequest, "Invite has expired")
		return
	}

	// Make sure the user accepting the invite has the matching email.
	var userEmail string
	err = tx.QueryRow(r.Context(), `SELECT email FROM users WHERE id = $1`, userID(r)).Scan(&userEmail)
	if err != nil {
		s.fail(w, r, err)
		return
	}

	if userEmail != email {
		writeError(w, http.StatusForbidden, "Invite email does not match your account email")
		return
	}

	// Add to team members
	_, err = tx.Exec(r.Context(),
		`INSERT INTO team_members (team_id, user_id, role, status) VALUES ($1, $2, $3, 'active')
		 ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'`,
		teamID, userID(r), role)
	if err != nil {
		s.fail(w, r, err)
		return
	}

	// Update invite status
	_, err = tx.Exec(r.Context(), `UPDATE team_invites SET status = 'accepted' WHERE id = $1`, inviteID)
	if err != nil {
		s.fail(w, r, err)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		s.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleRevokeTeamInvite(w http.ResponseWriter, r *http.Request) {
	inviteID := chi.URLParam(r, "inviteID")

	// Must be team owner to revoke
	var owner string
	err := s.pool.QueryRow(r.Context(),
		`SELECT t.owner_id FROM team_invites ti JOIN teams t ON ti.team_id = t.id WHERE ti.id = $1`,
		inviteID).Scan(&owner)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Invite not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}

	if owner != userID(r) {
		writeError(w, http.StatusForbidden, "Only team owner can revoke invites")
		return
	}

	_, err = s.pool.Exec(r.Context(), `DELETE FROM team_invites WHERE id = $1`, inviteID)
	if err != nil {
		s.fail(w, r, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
