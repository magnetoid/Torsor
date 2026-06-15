package server

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// workspace is a persisted, project-scoped workspace row. Operations are always gated on
// the caller owning the parent project — the runtime workspace id is the project id, never
// taken from a client-supplied value, so a user can't act on another user's workspace.
type workspace struct {
	ID          string    `json:"id"`
	ProjectID   string    `json:"projectId"`
	Runtime     string    `json:"runtime"`
	ContainerID *string   `json:"containerId"`
	Image       *string   `json:"image"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

const workspaceCols = `id, project_id, runtime, container_id, image, status, created_at, updated_at`

func scanWorkspace(row pgx.Row) (workspace, error) {
	var ws workspace
	err := row.Scan(&ws.ID, &ws.ProjectID, &ws.Runtime, &ws.ContainerID, &ws.Image, &ws.Status, &ws.CreatedAt, &ws.UpdatedAt)
	return ws, err
}

// requireOwnedProject returns the projectID if the caller owns it, else writes 404/500 and
// returns ok=false.
func (s *Server) requireOwnedProject(w http.ResponseWriter, r *http.Request) (string, bool) {
	projectID := chi.URLParam(r, "projectID")
	owns, err := s.ownsProject(r, projectID)
	if err != nil {
		s.fail(w, r, err)
		return "", false
	}
	if !owns {
		writeError(w, http.StatusNotFound, "Project not found")
		return "", false
	}
	return projectID, true
}

// loadWorkspace fetches the workspace for an owned project and resolves its runtime. It
// writes the appropriate error (404 no project / 404 no workspace / 503 runtime gone) and
// returns ok=false on any failure.
func (s *Server) loadWorkspace(w http.ResponseWriter, r *http.Request) (workspace, plugin.WorkspaceRuntime, bool) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return workspace{}, nil, false
	}
	ws, err := scanWorkspace(s.pool.QueryRow(r.Context(),
		`SELECT `+workspaceCols+` FROM workspaces WHERE project_id = $1`, projectID))
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Workspace not found for this project")
		return workspace{}, nil, false
	}
	if err != nil {
		s.fail(w, r, err)
		return workspace{}, nil, false
	}
	rt, _, ok := s.pickRuntime(ws.Runtime)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "Workspace runtime '"+ws.Runtime+"' is not available")
		return workspace{}, nil, false
	}
	return ws, rt, true
}

// persistStatus updates a workspace row's status (and container id when present).
func (s *Server) persistStatus(r *http.Request, ws workspace, st plugin.WorkspaceStatus) {
	containerID := ws.ContainerID
	if st.ContainerID != "" {
		containerID = &st.ContainerID
	}
	_, _ = s.pool.Exec(r.Context(),
		`UPDATE workspaces SET status = $2, container_id = $3, updated_at = NOW() WHERE id = $1`,
		ws.ID, st.Status, containerID)
}

// handleCreateProjectWorkspace provisions (or re-provisions) the workspace for a project
// the caller owns, using an explicit/default/sole runtime.
func (s *Server) handleCreateProjectWorkspace(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	var body struct {
		Image   string `json:"image"`
		Runtime string `json:"runtime"`
	}
	_ = decodeJSON(r, &body)

	rt, runtimeName, ok := s.pickRuntime(body.Runtime)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "No workspace runtime available")
		return
	}

	st, err := rt.CreateWorkspace(r.Context(), plugin.WorkspaceSpec{ID: projectID, Image: body.Image})
	if err != nil {
		s.fail(w, r, err)
		return
	}

	var image *string
	if body.Image != "" {
		image = &body.Image
	}
	var containerID *string
	if st.ContainerID != "" {
		containerID = &st.ContainerID
	}

	ws, err := scanWorkspace(s.pool.QueryRow(r.Context(),
		`INSERT INTO workspaces (project_id, user_id, runtime, container_id, image, status)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (project_id) DO UPDATE SET
		   runtime = EXCLUDED.runtime,
		   container_id = EXCLUDED.container_id,
		   image = EXCLUDED.image,
		   status = EXCLUDED.status,
		   updated_at = NOW()
		 RETURNING `+workspaceCols,
		projectID, userID(r), runtimeName, containerID, image, st.Status))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, ws)
}

// handleGetProjectWorkspace returns the persisted workspace plus its live runtime status.
func (s *Server) handleGetProjectWorkspace(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	st, err := rt.StatusWorkspace(r.Context(), ws.ProjectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	s.persistStatus(r, ws, st)
	writeJSON(w, http.StatusOK, map[string]any{"workspace": ws, "runtimeStatus": toStatusResponse(st)})
}

// workspaceLifecycle runs a start/stop/destroy transition on an owned workspace.
func (s *Server) workspaceLifecycle(w http.ResponseWriter, r *http.Request, fn func(plugin.WorkspaceRuntime, string) (plugin.WorkspaceStatus, error), destroy bool) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	st, err := fn(rt, ws.ProjectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if destroy {
		_, _ = s.pool.Exec(r.Context(), `DELETE FROM workspaces WHERE id = $1`, ws.ID)
	} else {
		s.persistStatus(r, ws, st)
	}
	writeJSON(w, http.StatusOK, toStatusResponse(st))
}

func (s *Server) handleStartProjectWorkspace(w http.ResponseWriter, r *http.Request) {
	s.workspaceLifecycle(w, r, func(rt plugin.WorkspaceRuntime, id string) (plugin.WorkspaceStatus, error) {
		return rt.StartWorkspace(r.Context(), id)
	}, false)
}

func (s *Server) handleStopProjectWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TimeoutSeconds int32 `json:"timeoutSeconds"`
	}
	_ = decodeJSON(r, &body)
	s.workspaceLifecycle(w, r, func(rt plugin.WorkspaceRuntime, id string) (plugin.WorkspaceStatus, error) {
		return rt.StopWorkspace(r.Context(), id, body.TimeoutSeconds)
	}, false)
}

func (s *Server) handleDestroyProjectWorkspace(w http.ResponseWriter, r *http.Request) {
	s.workspaceLifecycle(w, r, func(rt plugin.WorkspaceRuntime, id string) (plugin.WorkspaceStatus, error) {
		return rt.DestroyWorkspace(r.Context(), id)
	}, true)
}

// handleExecProjectWorkspace streams a command's output as SSE for an owned workspace.
func (s *Server) handleExecProjectWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Command    []string `json:"command"`
		WorkingDir string   `json:"workingDir"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if len(body.Command) == 0 {
		writeError(w, http.StatusBadRequest, "command is required")
		return
	}
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	err := rt.Exec(r.Context(), plugin.ExecSpec{
		WorkspaceID: ws.ProjectID,
		Command:     body.Command,
		WorkingDir:  body.WorkingDir,
	}, func(c plugin.ExecChunk) error {
		payload, _ := json.Marshal(map[string]any{
			"stdout":   c.Stdout,
			"stderr":   c.Stderr,
			"exitCode": c.ExitCode,
			"done":     c.Done,
		})
		if _, err := w.Write([]byte("data: " + string(payload) + "\n\n")); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	})
	if err != nil {
		payload, _ := json.Marshal(map[string]string{"error": err.Error()})
		_, _ = w.Write([]byte("event: error\ndata: " + string(payload) + "\n\n"))
		flusher.Flush()
	}
}

func (s *Server) handleListProjectWorkspaceFiles(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	entries, err := rt.ListFiles(r.Context(), ws.ProjectID, r.URL.Query().Get("path"))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	type fileEntry struct {
		Name  string `json:"name"`
		Path  string `json:"path"`
		IsDir bool   `json:"isDir"`
		Size  int64  `json:"size"`
	}
	items := make([]fileEntry, 0, len(entries))
	for _, e := range entries {
		items = append(items, fileEntry{Name: e.Name, Path: e.Path, IsDir: e.IsDir, Size: e.Size})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleReadProjectWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("path")
	if p == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return
	}
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	content, err := rt.ReadFile(r.Context(), ws.ProjectID, p)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":          p,
		"contentBase64": base64.StdEncoding.EncodeToString(content),
		"size":          len(content),
	})
}

func (s *Server) handleWriteProjectWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path          string `json:"path"`
		ContentBase64 string `json:"contentBase64"`
		Content       string `json:"content"`
		CreateDirs    bool   `json:"createDirs"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Path == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return
	}
	content := []byte(body.Content)
	if body.ContentBase64 != "" {
		decoded, err := base64.StdEncoding.DecodeString(body.ContentBase64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "contentBase64 is not valid base64")
			return
		}
		content = decoded
	}
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	if err := rt.WriteFile(r.Context(), ws.ProjectID, body.Path, content, body.CreateDirs); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "path": body.Path})
}
