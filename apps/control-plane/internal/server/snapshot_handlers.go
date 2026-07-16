package server

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// Workspace snapshot / restore / fork (Phase 6): the 2027 microVM sandbox pattern, exposed
// as ownership-scoped HTTP over the WorkspaceRuntime capability. Runtimes that predate the
// snapshot RPCs return gRPC Unimplemented, which we map to 501 so the UI can hide the actions.

type snapshotDTO struct {
	ID         string    `json:"id"`
	SnapshotID string    `json:"snapshotId"`
	Runtime    string    `json:"runtime"`
	Label      string    `json:"label"`
	CreatedAt  time.Time `json:"createdAt"`
}

// writeRuntimeError maps a runtime error to a response: gRPC Unimplemented → 501 (capability
// absent), everything else → 500.
func (s *Server) writeRuntimeError(w http.ResponseWriter, r *http.Request, err error) {
	if status.Code(err) == codes.Unimplemented {
		writeError(w, http.StatusNotImplemented, "This workspace runtime does not support snapshots")
		return
	}
	s.fail(w, r, err)
}

func (s *Server) handleSnapshotWorkspace(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	var body struct {
		Label string `json:"label"`
	}
	_ = decodeJSON(r, &body)

	res, err := rt.SnapshotWorkspace(r.Context(), ws.ProjectID, body.Label)
	if err != nil {
		s.writeRuntimeError(w, r, err)
		return
	}

	var dto snapshotDTO
	if err := s.pool.QueryRow(r.Context(),
		`INSERT INTO workspace_snapshots (project_id, user_id, runtime, snapshot_id, label)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, snapshot_id, runtime, label, created_at`,
		ws.ProjectID, userID(r), ws.Runtime, res.SnapshotID, body.Label).
		Scan(&dto.ID, &dto.SnapshotID, &dto.Runtime, &dto.Label, &dto.CreatedAt); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, dto)
}

func (s *Server) handleListWorkspaceSnapshots(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	rows, err := s.pool.Query(r.Context(),
		`SELECT id, snapshot_id, runtime, label, created_at
		   FROM workspace_snapshots WHERE project_id = $1 ORDER BY created_at DESC`, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	items := []snapshotDTO{}
	for rows.Next() {
		var d snapshotDTO
		if err := rows.Scan(&d.ID, &d.SnapshotID, &d.Runtime, &d.Label, &d.CreatedAt); err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, d)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleRestoreWorkspace(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	var body struct {
		SnapshotID string `json:"snapshotId"`
	}
	if err := decodeJSON(r, &body); err != nil || body.SnapshotID == "" {
		writeError(w, http.StatusBadRequest, "snapshotId is required")
		return
	}
	// The client sends our snapshot row id; resolve it to the runtime-native handle (and
	// enforce it belongs to this project).
	handle, ok2, err := s.resolveSnapshotHandle(r, ws.ProjectID, body.SnapshotID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !ok2 {
		writeError(w, http.StatusNotFound, "Snapshot not found")
		return
	}
	st, err := rt.RestoreWorkspace(r.Context(), ws.ProjectID, handle)
	if err != nil {
		s.writeRuntimeError(w, r, err)
		return
	}
	s.persistWorkspaceStatus(r, ws.ProjectID, st)
	writeJSON(w, http.StatusOK, statusJSON(st))
}

func (s *Server) handleForkWorkspace(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	var body struct {
		SnapshotID string `json:"snapshotId"` // optional; "" forks from live state
		Name       string `json:"name"`
	}
	_ = decodeJSON(r, &body)

	handle := ""
	if body.SnapshotID != "" {
		h, ok2, err := s.resolveSnapshotHandle(r, ws.ProjectID, body.SnapshotID)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		if !ok2 {
			writeError(w, http.StatusNotFound, "Snapshot not found")
			return
		}
		handle = h
	}

	// A fork is a new owned project; the runtime workspace id is that new project id.
	name := body.Name
	if name == "" {
		name = "Fork"
	}
	var newProjectID string
	if err := s.pool.QueryRow(r.Context(),
		`INSERT INTO projects (user_id, name, description) VALUES ($1, $2, $3) RETURNING id`,
		userID(r), name, "Forked workspace").Scan(&newProjectID); err != nil {
		s.fail(w, r, err)
		return
	}

	st, err := rt.ForkWorkspace(r.Context(), ws.ProjectID, handle, newProjectID)
	if err != nil {
		// Roll back the empty project so a failed fork doesn't leave an orphan.
		_, _ = s.pool.Exec(r.Context(), `DELETE FROM projects WHERE id = $1 AND user_id = $2`, newProjectID, userID(r))
		s.writeRuntimeError(w, r, err)
		return
	}

	// Persist a workspace row for the fork so it's a first-class, restart-surviving workspace.
	var containerID *string
	if st.ContainerID != "" {
		containerID = &st.ContainerID
	}
	if _, err := s.pool.Exec(r.Context(),
		`INSERT INTO workspaces (project_id, user_id, runtime, container_id, image, status)
		 VALUES ($1, $2, $3, $4, NULL, $5)
		 ON CONFLICT (project_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
		newProjectID, userID(r), ws.Runtime, containerID, st.Status); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"projectId": newProjectID,
		"status":    statusJSON(st),
	})
}

// resolveSnapshotHandle maps a workspace_snapshots row id (ownership-scoped to the project)
// to its runtime-native handle.
func (s *Server) resolveSnapshotHandle(r *http.Request, projectID, rowID string) (string, bool, error) {
	var handle string
	err := s.pool.QueryRow(r.Context(),
		`SELECT snapshot_id FROM workspace_snapshots WHERE id = $1 AND project_id = $2 AND user_id = $3`,
		rowID, projectID, userID(r)).Scan(&handle)
	if err == pgx.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return handle, true, nil
}

// persistWorkspaceStatus best-effort updates the workspace row after a runtime state change.
func (s *Server) persistWorkspaceStatus(r *http.Request, projectID string, st plugin.WorkspaceStatus) {
	var containerID any
	if st.ContainerID != "" {
		containerID = st.ContainerID
	}
	_, _ = s.pool.Exec(r.Context(),
		`UPDATE workspaces SET status = $2, container_id = COALESCE($3, container_id), updated_at = NOW() WHERE project_id = $1`,
		projectID, st.Status, containerID)
}

func statusJSON(st plugin.WorkspaceStatus) map[string]any {
	return map[string]any{
		"workspaceId": st.WorkspaceID,
		"status":      st.Status,
		"message":     st.Message,
	}
}
