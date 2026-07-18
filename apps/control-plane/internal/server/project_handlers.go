package server

import (
	"errors"
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
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

const projectCols = `id, user_id, name, description, vibe, is_public, created_at, updated_at`

func scanProject(row pgx.Row) (project, error) {
	var p project
	err := row.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Vibe, &p.IsPublic, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

func userID(r *http.Request) string {
	claims, _ := auth.FromContext(r.Context())
	return claims.UserID
}

func (s *Server) handleListProjects(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT `+projectCols+` FROM projects WHERE user_id = $1 ORDER BY updated_at DESC`, userID(r))
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

	p, err := scanProject(s.pool.QueryRow(r.Context(),
		`INSERT INTO projects (user_id, name, description, vibe, is_public)
		 VALUES ($1, $2, $3, $4, $5) RETURNING `+projectCols,
		userID(r), name, desc, vibe, body.IsPublic))
	if err != nil {
		// UNIQUE(user_id, name) violation → 409, not a generic 500 that leaks the constraint.
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
		`SELECT `+projectCols+` FROM projects WHERE id = $1 AND user_id = $2`,
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
		`SELECT `+projectCols+` FROM projects WHERE id = $1 AND user_id = $2`, projectID, userID(r)))
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

	p, err := scanProject(s.pool.QueryRow(r.Context(),
		`UPDATE projects SET name = $3, description = $4, vibe = $5, is_public = $6, updated_at = NOW()
		 WHERE id = $1 AND user_id = $2 RETURNING `+projectCols,
		projectID, userID(r), name, desc, vibe, isPublic))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleDeleteProject(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if _, err := s.pool.Exec(r.Context(),
		`DELETE FROM projects WHERE id = $1 AND user_id = $2`,
		projectID, userID(r)); err != nil {
		s.fail(w, r, err)
		return
	}
	s.auditFromRequest(r, "project_delete", "project", projectID, "", "Deleted project")
	w.WriteHeader(http.StatusNoContent)
}

// ownsProject reports whether the current user owns the given project.
func (s *Server) ownsProject(r *http.Request, projectID string) (bool, error) {
	var id string
	err := s.pool.QueryRow(r.Context(),
		`SELECT id FROM projects WHERE id = $1 AND user_id = $2`, projectID, userID(r)).Scan(&id)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}
