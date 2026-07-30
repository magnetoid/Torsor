package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/magnetoid/torsor/control-plane/internal/auth"
)

type project struct {
	ID          string    `json:"id"`
	UserID      string    `json:"userId"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	Vibe        *string   `json:"vibe"`
	IsPublic    bool      `json:"isPublic"`
	Template    *string   `json:"template"`
	Starred     bool      `json:"starred"`
	Archived    bool      `json:"archived"`
	TeamID      *string   `json:"teamId"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

const projectCols = `id, user_id, name, description, vibe, is_public, template, starred, archived, team_id, created_at, updated_at`

func scanProject(row pgx.Row) (project, error) {
	var p project
	err := row.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Vibe, &p.IsPublic, &p.Template, &p.Starred, &p.Archived, &p.TeamID, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

// projectAccessSQL returns a WHERE fragment granting access to a project row when the
// requester owns it directly OR is an active, non-viewer member of its team. The
// direct-ownership branch is belt-and-braces: an owner can never be locked out of
// their own project even if team backfill data is incomplete. Viewers are deliberately
// excluded until a read-only enforcement layer exists — without one, "invite a viewer"
// would grant full write/deploy/delete on every team project.
// alias prefixes the project columns (e.g. "p." in joined queries); userParam is the
// 1-based placeholder index carrying the requester's user id.
func projectAccessSQL(alias string, userParam int) string {
	return fmt.Sprintf(
		`(%[1]suser_id = $%[2]d OR %[1]steam_id IN (SELECT team_id FROM team_members WHERE user_id = $%[2]d AND status = 'active' AND role <> 'viewer'))`,
		alias, userParam)
}

func userID(r *http.Request) string {
	claims, _ := auth.FromContext(r.Context())
	return claims.UserID
}

func (s *Server) handleListProjects(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT `+projectCols+` FROM projects WHERE `+projectAccessSQL("", 1)+` ORDER BY updated_at DESC`, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	items := []project{}
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, p)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string  `json:"name"`
		Description *string `json:"description"`
		Vibe        *string `json:"vibe"`
		IsPublic    bool    `json:"isPublic"`
		Template    *string `json:"template"`
		TeamID      *string `json:"teamId"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "Project name is required")
		return
	}

	var desc *string
	if body.Description != nil {
		if d := strings.TrimSpace(*body.Description); d != "" {
			desc = &d
		}
	}
	vibe := "builder"
	if body.Vibe != nil && *body.Vibe != "" {
		vibe = *body.Vibe
	}
	// Only accept a known template id; ignore anything else so a bad value can't wedge
	// provisioning later (null = blank workspace).
	var template *string
	if body.Template != nil {
		if _, ok := templateByID(*body.Template); ok {
			template = body.Template
		}
	}

	// Resolve the workspace (team) the project lives in: the requested one if the
	// caller can use it, else their personal team. Every new project carries a team.
	teamID, err := s.resolveProjectTeam(r.Context(), userID(r), body.TeamID)
	if err != nil {
		if errors.Is(err, errTeamForbidden) {
			writeError(w, http.StatusForbidden, "You are not a member of that workspace")
			return
		}
		s.fail(w, r, err)
		return
	}

	p, err := scanProject(s.pool.QueryRow(r.Context(),
		`INSERT INTO projects (user_id, name, description, vibe, is_public, template, team_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING `+projectCols,
		userID(r), name, desc, vibe, body.IsPublic, template, teamID))
	if err != nil {
		// UNIQUE(team_id, name) violation → 409, not a generic 500 that leaks the constraint.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "A project with that name already exists")
			return
		}
		s.fail(w, r, err)
		return
	}

	if _, err := s.pool.Exec(r.Context(),
		`INSERT INTO project_files (project_id, filename, language, content)
		 VALUES ($1, 'README.md', 'markdown', $2)
		 ON CONFLICT (project_id, filename) DO NOTHING`,
		p.ID, "# "+p.Name+"\n\nCreated in Torsor."); err != nil {
		s.fail(w, r, err)
		return
	}

	s.auditFromRequest(r, "project_create", "project", p.ID, p.Name, "Created project "+p.Name)

	writeJSON(w, http.StatusCreated, p)
}

func (s *Server) handleGetProject(w http.ResponseWriter, r *http.Request) {
	p, err := scanProject(s.pool.QueryRow(r.Context(),
		`SELECT `+projectCols+` FROM projects WHERE id = $1 AND `+projectAccessSQL("", 2),
		chi.URLParam(r, "projectID"), userID(r)))
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleUpdateProject(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	current, err := scanProject(s.pool.QueryRow(r.Context(),
		`SELECT `+projectCols+` FROM projects WHERE id = $1 AND `+projectAccessSQL("", 2), projectID, userID(r)))
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}

	var body struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Vibe        *string `json:"vibe"`
		IsPublic    *bool   `json:"isPublic"`
		Starred     *bool   `json:"starred"`
		Archived    *bool   `json:"archived"`
		TeamID      *string `json:"teamId"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	name := current.Name
	if body.Name != nil {
		name = *body.Name
	}
	desc := current.Description
	if body.Description != nil {
		desc = body.Description
	}
	vibe := current.Vibe
	if body.Vibe != nil {
		vibe = body.Vibe
	}
	isPublic := current.IsPublic
	if body.IsPublic != nil {
		isPublic = *body.IsPublic
	}
	starred := current.Starred
	if body.Starred != nil {
		starred = *body.Starred
	}
	archived := current.Archived
	if body.Archived != nil {
		archived = *body.Archived
	}
	teamID := current.TeamID
	if body.TeamID != nil && (current.TeamID == nil || *body.TeamID != *current.TeamID) {
		// Moving a project between workspaces is owner-only, and the target must be a
		// team the owner can use (their own, or one they're an active non-viewer member of).
		if current.UserID != userID(r) {
			writeError(w, http.StatusForbidden, "Only the project owner can move it to another workspace")
			return
		}
		target := *body.TeamID
		var ok bool
		if err := s.pool.QueryRow(r.Context(),
			`SELECT EXISTS (
				SELECT 1 FROM teams t
				LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2 AND tm.status = 'active' AND tm.role <> 'viewer'
				WHERE t.id = $1 AND (t.owner_id = $2 OR tm.id IS NOT NULL)
			)`, target, userID(r)).Scan(&ok); err != nil {
			s.fail(w, r, err)
			return
		}
		if !ok {
			writeError(w, http.StatusForbidden, "You are not a member of the target workspace")
			return
		}
		teamID = &target
	}

	p, err := scanProject(s.pool.QueryRow(r.Context(),
		`UPDATE projects SET name = $3, description = $4, vibe = $5, is_public = $6, starred = $7, archived = $8, team_id = $9, updated_at = NOW()
		 WHERE id = $1 AND `+projectAccessSQL("", 2)+` RETURNING `+projectCols,
		projectID, userID(r), name, desc, vibe, isPublic, starred, archived, teamID))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "A project with that name already exists in that workspace")
			return
		}
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleDeleteProject(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	// Deliberately owner-only (not team-wide): deleting a shared project is destructive
	// beyond a member's mandate until per-role permissions exist.
	if _, err := s.pool.Exec(r.Context(),
		`DELETE FROM projects WHERE id = $1 AND user_id = $2`,
		projectID, userID(r)); err != nil {
		s.fail(w, r, err)
		return
	}
	s.auditFromRequest(r, "project_delete", "project", projectID, "", "Deleted project")
	w.WriteHeader(http.StatusNoContent)
}

var errTeamForbidden = errors.New("not a member of the requested team")

// resolveProjectTeam picks the team a new project belongs to. A requested team is
// honored only if the caller owns it or is an active non-viewer member; with no
// request, the caller's personal team (oldest owned, preferring the auto-created
// personal slug) is used. Returns nil only for users who somehow own no team.
func (s *Server) resolveProjectTeam(ctx context.Context, uid string, requested *string) (*string, error) {
	if requested != nil && strings.TrimSpace(*requested) != "" {
		target := strings.TrimSpace(*requested)
		var ok bool
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS (
				SELECT 1 FROM teams t
				LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2 AND tm.status = 'active' AND tm.role <> 'viewer'
				WHERE t.id = $1 AND (t.owner_id = $2 OR tm.id IS NOT NULL)
			)`, target, uid).Scan(&ok); err != nil {
			return nil, err
		}
		if !ok {
			return nil, errTeamForbidden
		}
		return &target, nil
	}
	var personal *string
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM teams WHERE owner_id = $1
		 ORDER BY (slug LIKE 'personal-%') DESC, created_at ASC LIMIT 1`, uid).Scan(&personal)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return personal, nil
}

// canAccessProject reports whether the current user may act on the given project —
// as its owner or as an active, non-viewer member of its team. This replaced the
// owner-only ownsProject; every project-scoped route funnels through it (directly or
// via requireOwnedProject/loadWorkspace) and keeps 404-on-miss semantics.
func (s *Server) canAccessProject(r *http.Request, projectID string) (bool, error) {
	return s.canAccessProjectAs(r.Context(), projectID, userID(r))
}

// canAccessProjectAs is the claims-agnostic primitive, for WebSocket handlers that
// authenticate via access_token and carry an explicit user id.
func (s *Server) canAccessProjectAs(ctx context.Context, projectID, uid string) (bool, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM projects WHERE id = $1 AND `+projectAccessSQL("", 2), projectID, uid).Scan(&id)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}
