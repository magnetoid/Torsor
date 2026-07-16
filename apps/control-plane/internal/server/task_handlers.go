package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// task mirrors the legacy raw-row JSON shape (snake_case) returned by apps/api, extended
// (additively) with the Phase-4 run accounting so the Agent Runs list renders from one row.
type task struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"project_id"`
	TaskType  string    `json:"task_type"`
	Status    string    `json:"status"`
	Prompt    string    `json:"prompt"`
	Result    *string   `json:"result"`
	Error     *string   `json:"error"`
	Steps     int       `json:"steps"`
	Model     string    `json:"model"`
	TokensIn  int       `json:"tokens_in"`
	TokensOut int       `json:"tokens_out"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

const taskCols = `id, project_id, task_type, status, prompt, result, error, steps, model, tokens_in, tokens_out, created_at, updated_at`

// taskSelectT is taskCols aliased to the ai_tasks row `t` for queries that join projects
// (where bare id/created_at/updated_at would be ambiguous).
const taskSelectT = `t.id, t.project_id, t.task_type, t.status, t.prompt, t.result, t.error, t.steps, t.model, t.tokens_in, t.tokens_out, t.created_at, t.updated_at`

func scanTask(row pgx.Row) (task, error) {
	var t task
	err := row.Scan(&t.ID, &t.ProjectID, &t.TaskType, &t.Status, &t.Prompt, &t.Result, &t.Error,
		&t.Steps, &t.Model, &t.TokensIn, &t.TokensOut, &t.CreatedAt, &t.UpdatedAt)
	return t, err
}

// taskDetail is a single task plus its persisted step transcript (the events jsonb column).
type taskDetail struct {
	task
	Events []json.RawMessage `json:"events"`
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT `+taskSelectT+`
		   FROM ai_tasks t
		   INNER JOIN projects p ON p.id = t.project_id
		  WHERE p.user_id = $1
		  ORDER BY t.created_at DESC
		  LIMIT 50`, userID(r))
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

	// Wake the worker pool; the poll fallback picks it up regardless if the signal is lost.
	if err := s.redis.Publish(r.Context(), jobsChannel, `{"taskId":"`+t.ID+`"}`); err != nil {
		s.logger.Warn("redis publish failed, polling worker will pick up task", "err", err)
	}

	writeJSON(w, http.StatusCreated, t)
}

// handleCreateAgentTask enqueues a background coding-agent run for an owned project. Unlike
// the synchronous /agent/stream path, this returns immediately with a task id; the worker
// pool runs it and the client attaches via GET /tasks/{id}/events/stream.
func (s *Server) handleCreateAgentTask(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	var body struct {
		Task string `json:"task"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	prompt := strings.TrimSpace(body.Task)
	if prompt == "" {
		writeError(w, http.StatusBadRequest, "task is required")
		return
	}

	t, err := scanTask(s.pool.QueryRow(r.Context(),
		`INSERT INTO ai_tasks (project_id, task_type, prompt, status)
		 VALUES ($1, 'agent', $2, 'pending')
		 RETURNING `+taskCols,
		projectID, prompt))
	if err != nil {
		s.fail(w, r, err)
		return
	}

	if err := s.redis.Publish(r.Context(), jobsChannel, `{"taskId":"`+t.ID+`"}`); err != nil {
		s.logger.Warn("redis publish failed, polling worker will pick up task", "err", err)
	}
	writeJSON(w, http.StatusCreated, t)
}

// handleGetTask returns a single owned task including its persisted step transcript.
func (s *Server) handleGetTask(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskID")
	var (
		t          task
		eventsJSON []byte
	)
	err := s.pool.QueryRow(r.Context(),
		`SELECT `+taskSelectT+`, t.events
		   FROM ai_tasks t
		   INNER JOIN projects p ON p.id = t.project_id
		  WHERE t.id = $1 AND p.user_id = $2`, taskID, userID(r)).
		Scan(&t.ID, &t.ProjectID, &t.TaskType, &t.Status, &t.Prompt, &t.Result, &t.Error,
			&t.Steps, &t.Model, &t.TokensIn, &t.TokensOut, &t.CreatedAt, &t.UpdatedAt, &eventsJSON)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Task not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var events []json.RawMessage
	_ = json.Unmarshal(eventsJSON, &events)
	writeJSON(w, http.StatusOK, taskDetail{task: t, Events: events})
}

// ownsTask returns the task's project id if the caller owns the task's project.
func (s *Server) ownsTask(ctx context.Context, taskID, uid string) (string, bool, error) {
	var projectID string
	err := s.pool.QueryRow(ctx,
		`SELECT t.project_id FROM ai_tasks t
		   INNER JOIN projects p ON p.id = t.project_id
		  WHERE t.id = $1 AND p.user_id = $2`, taskID, uid).Scan(&projectID)
	if err == pgx.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return projectID, true, nil
}

func isTerminalStatus(s string) bool {
	return s == "completed" || s == "failed" || s == "cancelled"
}

// handleTaskEventsSSE streams a task's steps as Server-Sent Events. It replays the persisted
// transcript, then (if the run is still active) live-tails new steps from Redis until the run
// finishes or the client disconnects — so attach / detach / reattach all work. De-duplication
// by the per-event seq keeps replayed and live-tailed events from doubling up.
func (s *Server) handleTaskEventsSSE(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskID")

	var (
		status0    string
		eventsJSON []byte
	)
	err := s.pool.QueryRow(r.Context(),
		`SELECT t.status, t.events FROM ai_tasks t
		   INNER JOIN projects p ON p.id = t.project_id
		  WHERE t.id = $1 AND p.user_id = $2`, taskID, userID(r)).Scan(&status0, &eventsJSON)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Task not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	// Subscribe BEFORE replaying so no live event is lost in the gap between the initial
	// read and the subscription (a re-read below covers events appended during that gap).
	var (
		live   <-chan string
		cancel func()
	)
	if !isTerminalStatus(status0) {
		live, cancel = s.redis.SubscribeChan(r.Context(), taskChannel(taskID))
		defer cancel()
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	send := func(payload string) {
		_, _ = w.Write([]byte("data: " + payload + "\n\n"))
		flusher.Flush()
	}
	sendDone := func() {
		_, _ = w.Write([]byte("event: done\ndata: {}\n\n"))
		flusher.Flush()
	}

	// replay emits each event in raw whose seq exceeds minSeq, returning the new max seq.
	replay := func(raw []byte, minSeq int) int {
		maxSeq := minSeq
		var events []json.RawMessage
		if json.Unmarshal(raw, &events) != nil {
			return maxSeq
		}
		for _, e := range events {
			var probe struct {
				Seq int `json:"seq"`
			}
			_ = json.Unmarshal(e, &probe)
			if probe.Seq != 0 && probe.Seq <= minSeq {
				continue
			}
			send(string(e))
			if probe.Seq > maxSeq {
				maxSeq = probe.Seq
			}
		}
		return maxSeq
	}

	maxSeq := replay(eventsJSON, 0)

	if isTerminalStatus(status0) {
		sendDone()
		return
	}

	// Re-read after subscribing: catches steps appended between the first read and subscribe.
	var (
		status2 string
		events2 []byte
	)
	if err := s.pool.QueryRow(r.Context(),
		`SELECT status, events FROM ai_tasks WHERE id = $1`, taskID).Scan(&status2, &events2); err == nil {
		maxSeq = replay(events2, maxSeq)
		if isTerminalStatus(status2) {
			sendDone()
			return
		}
	}

	// Live-tail until the run finishes or the client goes away.
	for {
		select {
		case <-r.Context().Done():
			return
		case payload, ok := <-live:
			if !ok {
				return
			}
			if payload == taskDoneSentinel {
				sendDone()
				return
			}
			var probe struct {
				Seq int `json:"seq"`
			}
			_ = json.Unmarshal([]byte(payload), &probe)
			if probe.Seq != 0 && probe.Seq <= maxSeq {
				continue // already replayed
			}
			if probe.Seq > maxSeq {
				maxSeq = probe.Seq
			}
			send(payload)
		}
	}
}

// handleCancelTask requests cancellation of an owned task: a still-pending task is flipped
// straight to cancelled; a running one is signalled via Redis to the worker holding it.
func (s *Server) handleCancelTask(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskID")
	_, ok, err := s.ownsTask(r.Context(), taskID, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "Task not found")
		return
	}
	if _, err := s.pool.Exec(r.Context(),
		`UPDATE ai_tasks SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
		taskID); err != nil {
		s.logger.Warn("cancel pending task failed", "id", taskID, "err", err)
	}
	_ = s.redis.Publish(r.Context(), cancelChannel, taskID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "cancelling"})
}
