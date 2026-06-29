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

func (s *Server) handleUpdateFile(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	fileID := chi.URLParam(r, "fileID")

	var body struct {
		Filename *string `json:"filename"`
		Language *string `json:"language"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Filename != nil && strings.TrimSpace(*body.Filename) == "" {
		writeError(w, http.StatusBadRequest, "filename cannot be empty")
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

	current, err := scanFile(s.pool.QueryRow(r.Context(),
		`SELECT `+fileCols+` FROM project_files WHERE id = $1 AND project_id = $2`, fileID, projectID))
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "File not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}

	filename := current.Filename
	if body.Filename != nil {
		filename = strings.TrimSpace(*body.Filename)
	}
	language := current.Language
	if body.Language != nil {
		language = body.Language
	}

	updated, err := scanFile(s.pool.QueryRow(r.Context(),
		`UPDATE project_files SET filename = $3, language = $4, version = version + 1, updated_at = NOW()
		 WHERE id = $1 AND project_id = $2
		 RETURNING `+fileCols, fileID, projectID, filename, language))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "A file with that name already exists")
			return
		}
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteFile(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	fileID := chi.URLParam(r, "fileID")

	owns, err := s.ownsProject(r, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !owns {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}

	var deletedID string
	err = s.pool.QueryRow(r.Context(),
		`DELETE FROM project_files WHERE id = $1 AND project_id = $2 RETURNING id`, fileID, projectID).Scan(&deletedID)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "File not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
