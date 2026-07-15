package server

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/agent"
	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// agentBody is the request for an agent run: a task plus an optional provider override.
type agentBody struct {
	Task     string `json:"task"`
	Provider string `json:"provider"`
	MaxSteps int    `json:"maxSteps"`
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

// loadOrCreateWorkspace returns the owned project's workspace + runtime, provisioning one
// with the default runtime if the project has none yet. Writes the appropriate error and
// returns ok=false on failure (not owned / no runtime / provision failure).
func (s *Server) loadOrCreateWorkspace(w http.ResponseWriter, r *http.Request) (workspace, plugin.WorkspaceRuntime, bool) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return workspace{}, nil, false
	}

	ws, err := scanWorkspace(s.pool.QueryRow(r.Context(),
		`SELECT `+workspaceCols+` FROM workspaces WHERE project_id = $1`, projectID))
	if err == nil {
		rt, _, ok := s.pickRuntime(ws.Runtime)
		if !ok {
			writeError(w, http.StatusServiceUnavailable, "Workspace runtime '"+ws.Runtime+"' is not available")
			return workspace{}, nil, false
		}
		return ws, rt, true
	}
	if err != pgx.ErrNoRows {
		s.fail(w, r, err)
		return workspace{}, nil, false
	}

	// No workspace yet: provision one with the default runtime.
	rt, runtimeName, ok := s.pickRuntime("")
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "No workspace runtime available")
		return workspace{}, nil, false
	}
	st, err := rt.CreateWorkspace(r.Context(), plugin.WorkspaceSpec{ID: projectID})
	if err != nil {
		s.fail(w, r, err)
		return workspace{}, nil, false
	}
	var containerID *string
	if st.ContainerID != "" {
		containerID = &st.ContainerID
	}
	ws, err = scanWorkspace(s.pool.QueryRow(r.Context(),
		`INSERT INTO workspaces (project_id, user_id, runtime, container_id, image, status)
		 VALUES ($1, $2, $3, $4, NULL, $5)
		 ON CONFLICT (project_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
		 RETURNING `+workspaceCols,
		projectID, userID(r), runtimeName, containerID, st.Status))
	if err != nil {
		s.fail(w, r, err)
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

	runner := agent.NewRunner(provider, rt, agent.Config{
		WorkspaceID: ws.ProjectID,
		MaxSteps:    body.MaxSteps,
	})
	result, err := runner.Run(r.Context(), body.Task, send)
	// Record whatever usage accrued, even on a mid-run error (partial steps still cost).
	s.recordUsage(userID(r), providerName, result.Model, result.TokensIn, result.TokensOut)
	if err != nil {
		payload, _ := json.Marshal(map[string]string{"error": err.Error()})
		_, _ = w.Write([]byte("event: error\ndata: " + string(payload) + "\n\n"))
		flusher.Flush()
	}
}
