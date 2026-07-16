package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/agent"
	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// agentBody is the request for an agent run: a task plus an optional provider override.
type agentBody struct {
	Task     string `json:"task"`
	Provider string `json:"provider"`
	MaxSteps int    `json:"maxSteps"`
	// Mode "plan" proposes a plan and pauses; "" / "direct" acts immediately.
	Mode string `json:"mode"`
	// ApprovedPlan, when set, executes a previously-proposed plan (spec-driven flow).
	ApprovedPlan []string `json:"approvedPlan"`
}

// pickModelProvider resolves the model provider for an agent run: the named one, else the
// sole loaded provider. Returns the provider, its name, and ok.
func (s *Server) pickModelProvider(name string) (plugin.ModelProvider, string, bool) {
	if name != "" {
		p, ok := s.host.ModelProvider(name)
		return p, name, ok
	}
	infos := s.host.ModelProviders()
	if len(infos) == 1 {
		p, ok := s.host.ModelProvider(infos[0].Name)
		return p, infos[0].Name, ok
	}
	return nil, "", false
}

// runtimeUnavailableError signals the requested (or default) workspace runtime plugin is
// not loaded — an HTTP 503, distinct from an internal failure. Used so the same
// workspace-resolution core can serve both the request path and the background worker.
type runtimeUnavailableError struct{ msg string }

func (e runtimeUnavailableError) Error() string { return e.msg }

// loadOrCreateWorkspaceCtx resolves the workspace + runtime for a project, provisioning one
// with the default runtime if none exists yet. It is HTTP-independent so both the request
// handler and the background worker share the exact provisioning logic. Callers MUST have
// already verified that uid owns projectID — this does not re-check ownership.
func (s *Server) loadOrCreateWorkspaceCtx(ctx context.Context, projectID, uid string) (workspace, plugin.WorkspaceRuntime, error) {
	ws, err := scanWorkspace(s.pool.QueryRow(ctx,
		`SELECT `+workspaceCols+` FROM workspaces WHERE project_id = $1`, projectID))
	if err == nil {
		rt, _, ok := s.pickRuntime(ws.Runtime)
		if !ok {
			return workspace{}, nil, runtimeUnavailableError{"Workspace runtime '" + ws.Runtime + "' is not available"}
		}
		return ws, rt, nil
	}
	if err != pgx.ErrNoRows {
		return workspace{}, nil, err
	}

	// No workspace yet: provision one with the default runtime.
	rt, runtimeName, ok := s.pickRuntime("")
	if !ok {
		return workspace{}, nil, runtimeUnavailableError{"No workspace runtime available"}
	}
	st, err := rt.CreateWorkspace(ctx, plugin.WorkspaceSpec{ID: projectID})
	if err != nil {
		return workspace{}, nil, err
	}
	var containerID *string
	if st.ContainerID != "" {
		containerID = &st.ContainerID
	}
	ws, err = scanWorkspace(s.pool.QueryRow(ctx,
		`INSERT INTO workspaces (project_id, user_id, runtime, container_id, image, status)
		 VALUES ($1, $2, $3, $4, NULL, $5)
		 ON CONFLICT (project_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
		 RETURNING `+workspaceCols,
		projectID, uid, runtimeName, containerID, st.Status))
	if err != nil {
		return workspace{}, nil, err
	}
	return ws, rt, nil
}

// loadOrCreateWorkspace is the HTTP wrapper around loadOrCreateWorkspaceCtx: it enforces
// project ownership and maps errors to responses (503 for a missing runtime, 500 otherwise).
func (s *Server) loadOrCreateWorkspace(w http.ResponseWriter, r *http.Request) (workspace, plugin.WorkspaceRuntime, bool) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return workspace{}, nil, false
	}
	ws, rt, err := s.loadOrCreateWorkspaceCtx(r.Context(), projectID, userID(r))
	if err != nil {
		var rue runtimeUnavailableError
		if errors.As(err, &rue) {
			writeError(w, http.StatusServiceUnavailable, rue.Error())
		} else {
			s.fail(w, r, err)
		}
		return workspace{}, nil, false
	}
	return ws, rt, true
}

// handleAgentRunSSE runs the coding agent against an owned project's workspace and streams
// each step (thought / tool_call / tool_result / final / error) as Server-Sent Events.
//
// This is the real vibe-coding loop: the model edits files and runs commands inside the
// project workspace until the task is done. Ownership is enforced by loadWorkspace (the
// runtime workspace id is the project id), so a user can only drive their own workspace.
func (s *Server) handleAgentRunSSE(w http.ResponseWriter, r *http.Request) {
	var body agentBody
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Task == "" {
		writeError(w, http.StatusBadRequest, "task is required")
		return
	}

	provider, providerName, ok := s.pickModelProvider(body.Provider)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "No model provider available (specify 'provider')")
		return
	}

	// Enforces project ownership and provisions a workspace on first run so the agent
	// "just works" from a project without a separate setup step.
	ws, rt, ok := s.loadOrCreateWorkspace(w, r)
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
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx proxy buffering
	w.WriteHeader(http.StatusOK)

	send := func(e agent.Event) {
		payload, _ := json.Marshal(e)
		if _, err := w.Write([]byte("data: " + string(payload) + "\n\n")); err != nil {
			return
		}
		flusher.Flush()
	}

	// Persist the run as an ai_task so it shows up in durable, ownership-scoped history.
	taskID := s.createAgentTask(r, ws.ProjectID, body.Task)

	// Approved-plan executions get a larger step budget (multi-step plans need room).
	maxSteps := body.MaxSteps
	if maxSteps <= 0 && len(body.ApprovedPlan) > 0 {
		maxSteps = 24
	}
	// Connect any MCP servers the user has enabled so their tools are available this run.
	mcpRouter, toolRouter := s.buildMCPRouter(r.Context(), userID(r))
	if mcpRouter != nil {
		defer mcpRouter.Close()
	}
	runner := agent.NewRunner(provider, rt, agent.Config{
		WorkspaceID: ws.ProjectID,
		MaxSteps:    maxSteps,
		APIKey:      s.providerAPIKey(r.Context(), userID(r), providerName),
		Mode:        body.Mode,
		Plan:        body.ApprovedPlan,
		Tools:       toolRouter,
	})
	result, err := runner.Run(r.Context(), body.Task, send)
	// Record whatever usage accrued, even on a mid-run error (partial steps still cost).
	s.recordUsage(userID(r), providerName, result.Model, result.TokensIn, result.TokensOut)
	if err != nil {
		s.finishAgentTask(taskID, "failed", "", err.Error())
		payload, _ := json.Marshal(map[string]string{"error": err.Error()})
		_, _ = w.Write([]byte("event: error\ndata: " + string(payload) + "\n\n"))
		flusher.Flush()
		return
	}
	s.finishAgentTask(taskID, "completed", result.Final, "")
}

// createAgentTask inserts a 'processing' ai_task row for an agent run and returns its id
// (empty on failure — persistence is best-effort and must not block the run). Status uses
// the ai_tasks vocabulary: pending/processing/completed/failed/cancelled.
func (s *Server) createAgentTask(r *http.Request, projectID, prompt string) string {
	var id string
	_ = s.pool.QueryRow(r.Context(),
		`INSERT INTO ai_tasks (project_id, task_type, prompt, status) VALUES ($1, 'agent', $2, 'processing') RETURNING id`,
		projectID, prompt).Scan(&id)
	return id
}

// finishAgentTask marks an agent ai_task terminal. Uses a fresh short-lived context
// because the request context is often already cancelled once the SSE stream ends.
func (s *Server) finishAgentTask(taskID, status, result, errMsg string) {
	if taskID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var resultArg, errArg any
	if result != "" {
		resultArg = result
	}
	if errMsg != "" {
		errArg = errMsg
	}
	_, _ = s.pool.Exec(ctx,
		`UPDATE ai_tasks SET status = $2, result = $3, error = $4, updated_at = NOW() WHERE id = $1`,
		taskID, status, resultArg, errArg)
}
