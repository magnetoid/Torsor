package server

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

// task mirrors the legacy raw-row JSON shape (snake_case) returned by apps/api.
type task struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"project_id"`
	TaskType  string    `json:"task_type"`
	Status    string    `json:"status"`
	Prompt    string    `json:"prompt"`
	Result    *string   `json:"result"`
	Error     *string   `json:"error"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

const taskCols = `id, project_id, task_type, status, prompt, result, error, created_at, updated_at`

func scanTask(row pgx.Row) (task, error) {
	var t task
	err := row.Scan(&t.ID, &t.ProjectID, &t.TaskType, &t.Status, &t.Prompt, &t.Result, &t.Error, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT t.id, t.project_id, t.task_type, t.status, t.prompt, t.result, t.error, t.created_at, t.updated_at
		   FROM ai_tasks t
		   INNER JOIN projects p ON p.id = t.project_id
		  WHERE p.user_id = $1
		  ORDER BY t.created_at DESC
		  LIMIT 20`, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	items := []task{}
	for rows.Next() {
		t, err := scanTask(rows)
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

func (s *Server) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ProjectID string `json:"projectId"`
		Prompt    string `json:"prompt"`
		TaskType  string `json:"taskType"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.ProjectID == "" || body.Prompt == "" {
		writeError(w, http.StatusBadRequest, "projectId and prompt are required")
		return
	}
	taskType := body.TaskType
	if taskType == "" {
		taskType = "generate"
	}

	owns, err := s.ownsProject(r, body.ProjectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !owns {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}

	t, err := scanTask(s.pool.QueryRow(r.Context(),
		`INSERT INTO ai_tasks (project_id, task_type, prompt, status)
		 VALUES ($1, $2, $3, 'pending')
		 RETURNING `+taskCols,
		body.ProjectID, taskType, body.Prompt))
	if err != nil {
		s.fail(w, r, err)
		return
	}

	// Best-effort wake of the worker; the polling worker will pick it up regardless.
	if err := s.redis.Publish(r.Context(), "torsor:jobs", `{"taskId":"`+t.ID+`"}`); err != nil {
		s.logger.Warn("redis publish failed, polling worker will pick up task", "err", err)
	}

	writeJSON(w, http.StatusCreated, t)
}
