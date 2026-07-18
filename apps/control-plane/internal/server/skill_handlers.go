package server

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/agent"
)

// Agent skills — user-defined, reusable instructions injected into the coding agent's system
// prompt when enabled. This replaces the frontend's mock skills list with a real, persisted,
// per-project registry. Every route is scoped to an owned project.

type skill struct {
	ID          string    `json:"id"`
	ProjectID   string    `json:"projectId"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Instruction string    `json:"instruction"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

const skillCols = `id, project_id, name, description, instruction, enabled, created_at, updated_at`

func scanSkill(row pgx.Row) (skill, error) {
	var sk skill
	err := row.Scan(&sk.ID, &sk.ProjectID, &sk.Name, &sk.Description, &sk.Instruction, &sk.Enabled, &sk.CreatedAt, &sk.UpdatedAt)
	return sk, err
}

func (s *Server) handleListSkills(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	rows, err := s.pool.Query(r.Context(),
		`SELECT `+skillCols+` FROM skills WHERE project_id = $1 ORDER BY created_at DESC`, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	items := []skill{}
	for rows.Next() {
		sk, err := scanSkill(rows)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, sk)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleCreateSkill(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Instruction string `json:"instruction"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	name := strings.TrimSpace(body.Name)
	instruction := strings.TrimSpace(body.Instruction)
	if name == "" || instruction == "" {
		writeError(w, http.StatusBadRequest, "Skill name and instruction are required")
		return
	}
	sk, err := scanSkill(s.pool.QueryRow(r.Context(),
		`INSERT INTO skills (project_id, user_id, name, description, instruction)
		 VALUES ($1, $2, $3, $4, $5) RETURNING `+skillCols,
		projectID, userID(r), name, strings.TrimSpace(body.Description), instruction))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, sk)
}

func (s *Server) handleUpdateSkill(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	skillID := chi.URLParam(r, "skillID")
	var body struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Instruction *string `json:"instruction"`
		Enabled     *bool   `json:"enabled"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	var name *string
	if body.Name != nil {
		n := strings.TrimSpace(*body.Name)
		if n == "" {
			writeError(w, http.StatusBadRequest, "Skill name cannot be empty")
			return
		}
		name = &n
	}
	var instruction *string
	if body.Instruction != nil {
		in := strings.TrimSpace(*body.Instruction)
		if in == "" {
			writeError(w, http.StatusBadRequest, "Skill instruction cannot be empty")
			return
		}
		instruction = &in
	}
	var desc *string
	if body.Description != nil {
		d := strings.TrimSpace(*body.Description)
		desc = &d
	}
	sk, err := scanSkill(s.pool.QueryRow(r.Context(),
		`UPDATE skills
		    SET name = COALESCE($3, name),
		        description = COALESCE($4, description),
		        instruction = COALESCE($5, instruction),
		        enabled = COALESCE($6, enabled),
		        updated_at = NOW()
		  WHERE id = $1 AND project_id = $2
		  RETURNING `+skillCols,
		skillID, projectID, name, desc, instruction, body.Enabled))
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Skill not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, sk)
}

func (s *Server) handleDeleteSkill(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	skillID := chi.URLParam(r, "skillID")
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM skills WHERE id = $1 AND project_id = $2`, skillID, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Skill not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// loadEnabledSkills returns the enabled skills for a project as agent.Skill values to inject
// into the run's system prompt. Best-effort: on error it returns nil so a skills-table hiccup
// never blocks an agent run (the agent just runs without the extra instructions).
func (s *Server) loadEnabledSkills(ctx context.Context, projectID string) []agent.Skill {
	rows, err := s.pool.Query(ctx,
		`SELECT name, instruction FROM skills
		  WHERE project_id = $1 AND enabled = TRUE
		  ORDER BY created_at ASC`, projectID)
	if err != nil {
		s.logger.Warn("failed to load skills for agent run", "err", err, "project", projectID)
		return nil
	}
	defer rows.Close()

	var out []agent.Skill
	for rows.Next() {
		var name, instruction string
		if err := rows.Scan(&name, &instruction); err != nil {
			s.logger.Warn("failed to scan skill", "err", err)
			return out
		}
		out = append(out, agent.Skill{Name: name, Instruction: instruction})
	}
	return out
}
