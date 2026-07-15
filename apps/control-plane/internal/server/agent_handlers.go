package server

import (
	"encoding/json"
	"net/http"

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

	// Enforces project ownership and requires a provisioned workspace.
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
