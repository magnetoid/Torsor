package server

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type projectFile struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Filename  string    `json:"filename"`
	Language  *string   `json:"language"`
	Content   *string   `json:"content"`
	Version   int       `json:"version"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

const fileCols = `id, project_id, filename, language, content, version, created_at, updated_at`

func scanFile(row pgx.Row) (projectFile, error) {
	var f projectFile
	err := row.Scan(&f.ID, &f.ProjectID, &f.Filename, &f.Language, &f.Content, &f.Version, &f.CreatedAt, &f.UpdatedAt)
	return f, err
}

func (s *Server) handleListFiles(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	owns, err := s.ownsProject(r, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !owns {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}

	rows, err := s.pool.Query(r.Context(),
		`SELECT `+fileCols+` FROM project_files WHERE project_id = $1 ORDER BY updated_at DESC, filename ASC`, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	items := []projectFile{}
	for rows.Next() {
		f, err := scanFile(rows)
		if err != nil {
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

func (s *Server) handleUpsertFile(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	var body struct {
		Filename string  `json:"filename"`
		Language *string `json:"language"`
		Content  *string `json:"content"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	filename := strings.TrimSpace(body.Filename)
	if filename == "" {
		writeError(w, http.StatusBadRequest, "filename is required")
		return
	}

	owns, err := s.ownsProject(r, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !owns {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}

	content := ""
	if body.Content != nil {
		content = *body.Content
	}

	f, err := scanFile(s.pool.QueryRow(r.Context(),
		`INSERT INTO project_files (project_id, filename, language, content, version)
		 VALUES ($1, $2, $3, $4, 1)
		 ON CONFLICT (project_id, filename)
		 DO UPDATE SET language = EXCLUDED.language,
		               content = EXCLUDED.content,
		               version = project_files.version + 1,
		               updated_at = NOW()
		 RETURNING `+fileCols,
		projectID, filename, body.Language, content))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, f)
}
