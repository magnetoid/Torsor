package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// checkpointFile is one file captured in a checkpoint snapshot.
type checkpointFile struct {
	Path          string `json:"path"`
	ContentBase64 string `json:"contentBase64"`
}

// checkpointMeta is the value-free summary returned to clients (never the file contents).
type checkpointMeta struct {
	ID        string    `json:"id"`
	Label     string    `json:"label"`
	FileCount int       `json:"fileCount"`
	CreatedAt time.Time `json:"createdAt"`
}

// maxCheckpointFiles bounds a snapshot so a runaway workspace can't blow up a DB row.
const maxCheckpointFiles = 2000

// snapshotWorkspace walks the workspace file tree (bounded BFS) and captures every file's
// path + base64 content. Runtime-agnostic (works with mock or docker), so a checkpoint can
// be restored even after the workspace container is destroyed and recreated.
func snapshotWorkspace(ctx context.Context, rt plugin.WorkspaceRuntime, projectID string) ([]checkpointFile, error) {
	files := []checkpointFile{}
	queue := []string{""}
	visited := 0
	for len(queue) > 0 && visited < 1000 {
		dir := queue[0]
		queue = queue[1:]
		visited++
		entries, err := rt.ListFiles(ctx, projectID, dir)
		if err != nil {
			return nil, err
		}
		for _, e := range entries {
			if e.IsDir {
				queue = append(queue, e.Path)
				continue
			}
			content, err := rt.ReadFile(ctx, projectID, e.Path)
			if err != nil {
				return nil, err
			}
			files = append(files, checkpointFile{
				Path:          e.Path,
				ContentBase64: base64.StdEncoding.EncodeToString(content),
			})
			if len(files) >= maxCheckpointFiles {
				return files, nil
			}
		}
	}
	return files, nil
}

// handleCreateCheckpoint snapshots the current workspace into a new checkpoint row.
func (s *Server) handleCreateCheckpoint(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Label string `json:"label"`
	}
	_ = decodeJSON(r, &body) // label is optional
	label := strings.TrimSpace(body.Label)
	if len(label) > 255 {
		label = label[:255]
	}
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	files, err := snapshotWorkspace(r.Context(), rt, ws.ProjectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	filesJSON, err := json.Marshal(files)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var id string
	var createdAt time.Time
	if err := s.pool.QueryRow(r.Context(),
		`INSERT INTO checkpoints (project_id, user_id, label, files, file_count)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
		ws.ProjectID, userID(r), label, filesJSON, len(files)).
		Scan(&id, &createdAt); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, checkpointMeta{ID: id, Label: label, FileCount: len(files), CreatedAt: createdAt})
}

// handleListCheckpoints lists a project's checkpoints (metadata only), ownership-scoped.
func (s *Server) handleListCheckpoints(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	rows, err := s.pool.Query(r.Context(),
		`SELECT c.id, c.label, c.file_count, c.created_at
		   FROM checkpoints c
		   JOIN projects p ON p.id = c.project_id
		  WHERE c.project_id = $1 AND p.user_id = $2
		  ORDER BY c.created_at DESC`, projectID, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	items := []checkpointMeta{}
	for rows.Next() {
		var m checkpointMeta
		if err := rows.Scan(&m.ID, &m.Label, &m.FileCount, &m.CreatedAt); err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, m)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleRestoreCheckpoint writes a checkpoint's files back into the workspace. This is an
// overwrite/restore, not a hard reset: files created AFTER the checkpoint are left in place
// (the runtime has no bulk-delete). Ownership-scoped: 404 if the checkpoint isn't the
// caller's for this project.
func (s *Server) handleRestoreCheckpoint(w http.ResponseWriter, r *http.Request) {
	checkpointID := chi.URLParam(r, "checkpointID")
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	var filesJSON []byte
	err := s.pool.QueryRow(r.Context(),
		`SELECT files FROM checkpoints WHERE id = $1 AND project_id = $2 AND user_id = $3`,
		checkpointID, ws.ProjectID, userID(r)).Scan(&filesJSON)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Checkpoint not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var files []checkpointFile
	if err := json.Unmarshal(filesJSON, &files); err != nil {
		s.fail(w, r, err)
		return
	}
	restored := 0
	for _, f := range files {
		content, decErr := base64.StdEncoding.DecodeString(f.ContentBase64)
		if decErr != nil {
			continue // skip a corrupt entry rather than fail the whole restore
		}
		if err := rt.WriteFile(r.Context(), ws.ProjectID, f.Path, content, true); err != nil {
			s.fail(w, r, err)
			return
		}
		restored++
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "restored": restored})
}
