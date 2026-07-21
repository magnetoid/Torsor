package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/agent"
	"github.com/magnetoid/torsor/control-plane/internal/plugin"
	"github.com/magnetoid/torsor/control-plane/internal/textsafe"
)

// previewPort is the container port the live preview watches (TORSOR_WS_APP_PORT),
// defaulting to 3000 to match the docker-runtime default. Passed to the agent so it knows
// which port to serve on for its app to appear in the preview.
func previewPort() string {
	if p := strings.TrimSpace(os.Getenv("TORSOR_WS_APP_PORT")); p != "" {
		return p
	}
	return "3000"
}

// checkAppProbe builds the agent's check_app tool: an HTTP GET against the workspace's
// preview target (the exact address the live preview proxies to), so the agent can verify
// "the app actually responds" after its edits. Probe failures return as observation text
// (nil error) so the agent reacts and fixes instead of aborting the run — and on failure
// the observation includes which ports ARE listening inside the workspace, so the classic
// "server bound to the wrong port" mistake is self-diagnosable in one step.
func checkAppProbe(rt plugin.WorkspaceRuntime, projectID string) func(ctx context.Context) (string, error) {
	return func(ctx context.Context) (string, error) {
		st, err := rt.StatusWorkspace(ctx, projectID)
		if err != nil {
			return "app status unavailable: " + err.Error(), nil
		}
		if st.PreviewHost == "" || st.PreviewPort == 0 {
			return "app is not reachable yet: the workspace exposes no preview address. Start the dev server with the run tool (in the background) and try check_app again.", nil
		}
		cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(cctx, http.MethodGet, fmt.Sprintf("http://%s:%d/", st.PreviewHost, st.PreviewPort), nil)
		if err != nil {
			return "", err
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return "app did not respond: " + err.Error() + portHint(ctx, rt, projectID), nil
		}
		defer resp.Body.Close()
		head, _ := io.ReadAll(io.LimitReader(resp.Body, 600))
		return fmt.Sprintf("status=%d\n%s", resp.StatusCode, string(head)), nil
	}
}

// portHint reports which TCP ports are LISTENING inside the workspace by reading
// /proc/net/tcp{,6} (present in every Linux container; no ss/netstat needed) and parsing
// the hex socket table here. Empty string when nothing is listening or the exec fails —
// the hint is best-effort color on a probe failure, never a failure itself.
func portHint(ctx context.Context, rt plugin.WorkspaceRuntime, projectID string) string {
	var out strings.Builder
	err := rt.Exec(ctx, plugin.ExecSpec{
		WorkspaceID: projectID,
		Command:     []string{"sh", "-c", "cat /proc/net/tcp /proc/net/tcp6 2>/dev/null"},
	}, func(c plugin.ExecChunk) error {
		out.WriteString(c.Stdout)
		return nil
	})
	if err != nil {
		return ""
	}
	ports := listeningPorts(out.String())
	if len(ports) == 0 {
		return "\nNo TCP port is listening inside the workspace at all — the server is not running (or exited). Start it in the background and re-check."
	}
	return fmt.Sprintf("\nPorts currently LISTENING inside the workspace: %s. The preview only watches port %s on 0.0.0.0 — restart your server on that port (e.g. --host 0.0.0.0 --port %s).",
		strings.Join(ports, ", "), previewPort(), previewPort())
}

// listeningPorts parses /proc/net/tcp(6) content and returns the distinct local ports in
// LISTEN state (st == 0A), sorted ascending as strings.
func listeningPorts(procNetTCP string) []string {
	seen := map[int]bool{}
	for _, line := range strings.Split(procNetTCP, "\n") {
		f := strings.Fields(line)
		// sl local_address rem_address st ... — LISTEN is state 0A.
		if len(f) < 4 || f[3] != "0A" {
			continue
		}
		i := strings.LastIndex(f[1], ":")
		if i < 0 {
			continue
		}
		var port int
		if _, err := fmt.Sscanf(f[1][i+1:], "%X", &port); err != nil || port <= 0 {
			continue
		}
		seen[port] = true
	}
	ports := make([]int, 0, len(seen))
	for p := range seen {
		ports = append(ports, p)
	}
	sort.Ints(ports)
	out := make([]string, len(ports))
	for i, p := range ports {
		out[i] = strconv.Itoa(p)
	}
	return out
}

// loadRulesDoc reads the project's AGENTS.md (the ecosystem-standard rules file every
// major agent honors) from the workspace root, sanitized against hidden-Unicode injection
// before it can reach a system prompt. Best-effort: absent file or read error = "".
func (s *Server) loadRulesDoc(ctx context.Context, rt plugin.WorkspaceRuntime, projectID string) string {
	content, err := rt.ReadFile(ctx, projectID, "AGENTS.md")
	if err != nil || len(content) == 0 {
		return ""
	}
	clean, removed := textsafe.Sanitize(string(content))
	if removed > 0 {
		s.logger.Warn("AGENTS.md contained hidden unicode; stripped before prompt injection",
			"project", projectID, "removed_runes", removed)
	}
	return clean
}

// Model routing (TORSOR_MODEL_ROUTING): per-role provider selection so cheap/fast models
// handle the tool loop while a stronger model plans and reflects — the dual-model pattern
// (e.g. "plan=anthropic,step=ollama,reflect=ollama"). An explicit user-picked provider
// always wins; unrouted roles fall back to the normal default resolution.
func routedProviderName(role string) string {
	for _, pair := range strings.Split(os.Getenv("TORSOR_MODEL_ROUTING"), ",") {
		k, v, ok := strings.Cut(strings.TrimSpace(pair), "=")
		if ok && strings.TrimSpace(k) == role {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// pickModelProviderFor resolves a provider for a routing role: explicit name > routed
// role > default resolution (sole provider / TORSOR_DEFAULT_MODEL).
func (s *Server) pickModelProviderFor(role, explicit string) (plugin.ModelProvider, string, bool) {
	if explicit != "" {
		return s.pickModelProvider(explicit)
	}
	if routed := routedProviderName(role); routed != "" {
		if p, name, ok := s.pickModelProvider(routed); ok {
			return p, name, ok
		}
		// A routed-but-unloaded provider falls back to the default rather than failing
		// the run — routing is an optimization, not a gate.
	}
	return s.pickModelProvider("")
}

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

// pickModelProvider resolves the model provider for an agent run:
//  1. the explicitly named provider (frontend dropdown), else
//  2. the sole loaded provider, else
//  3. TORSOR_DEFAULT_MODEL if it names a loaded provider (the free-local default is
//     "ollama"), else
//  4. failure.
//
// Step 3 is essential: background/delegated runs (worker.go) and any run where the user
// hasn't picked a provider pass name=="" — without a default they'd fail whenever more
// than one provider plugin is loaded (the shipped image loads six).
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
	if def := strings.TrimSpace(os.Getenv("TORSOR_DEFAULT_MODEL")); def != "" {
		if p, ok := s.host.ModelProvider(def); ok {
			return p, def, true
		}
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

// resolveAgentRun resolves everything a Runner needs for an owned project: the model provider,
// the workspace runtime, the workspace row, the per-user API key, and the resolved provider
// name. Extracted so handleAgentRunSSE and mission planning share one path. It does NOT check
// ownership — callers MUST have verified that userID(r) owns projectID first (e.g. via
// requireOwnedProject). A missing provider/runtime surfaces as runtimeUnavailableError (503).
func (s *Server) resolveAgentRun(ctx context.Context, r *http.Request, projectID, providerName, role string) (agent.Model, plugin.WorkspaceRuntime, workspace, string, string, error) {
	return s.resolveAgentRunCtx(ctx, projectID, userID(r), providerName, role)
}

// resolveAgentRunCtx is the request-independent core of resolveAgentRun: given a project the
// caller has already verified ownership of and the owner's user id, it resolves the model
// provider, the workspace runtime, the workspace row, the per-user API key, and the resolved
// provider name. The background mission runner uses this variant because it has no
// *http.Request; resolveAgentRun wraps it for the request path. Like resolveAgentRun it does
// NOT check ownership — callers must have verified that uid owns projectID first.
func (s *Server) resolveAgentRunCtx(ctx context.Context, projectID, uid, providerName, role string) (agent.Model, plugin.WorkspaceRuntime, workspace, string, string, error) {
	provider, resolvedName, ok := s.pickModelProviderFor(role, providerName)
	if !ok {
		return nil, nil, workspace{}, "", "", runtimeUnavailableError{"No model provider available (specify 'provider')"}
	}
	ws, rt, err := s.loadOrCreateWorkspaceCtx(ctx, projectID, uid)
	if err != nil {
		return nil, nil, workspace{}, "", "", err
	}
	apiKey := s.providerAPIKey(ctx, uid, resolvedName)
	return provider, rt, ws, apiKey, resolvedName, nil
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

	// Enforces project ownership; a workspace is provisioned on first run so the agent
	// "just works" from a project without a separate setup step.
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	provider, rt, ws, apiKey, providerName, err := s.resolveAgentRun(r.Context(), r, projectID, body.Provider, "step")
	if err != nil {
		var rue runtimeUnavailableError
		if errors.As(err, &rue) {
			writeError(w, http.StatusServiceUnavailable, rue.Error())
		} else {
			s.fail(w, r, err)
		}
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

	// Accumulate a compact action log + a "did real work" flag from the streamed events, so a
	// substantive run (one that wrote files or ran commands) can trigger a reflection pass.
	var actionLog strings.Builder
	mutated := false
	send := func(e agent.Event) {
		if e.Kind == agent.EventToolCall {
			if e.Tool == "write_file" || e.Tool == "run" {
				mutated = true
			}
			if actionLog.Len() < 3000 {
				args := fmt.Sprintf("%v", e.Args)
				if len(args) > 120 {
					args = args[:120]
				}
				fmt.Fprintf(&actionLog, "- %s %s\n", e.Tool, args)
			}
		}
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
		WorkspaceID:   ws.ProjectID,
		MaxSteps:      maxSteps,
		APIKey:        apiKey,
		Mode:          body.Mode,
		Plan:          body.ApprovedPlan,
		Tools:         toolRouter,
		CheckApp:      checkAppProbe(rt, ws.ProjectID),
		VerifyApp:     s.verifyAppTool(rt, ws.ProjectID),
		PreviewErrors: s.previewErrorsTool(ws.ProjectID),
		PreviewPort:   previewPort(),
		Memory:        &projectMemoryStore{s: s, projectID: ws.ProjectID, userID: userID(r)},
		Skills:        s.loadEnabledSkills(r.Context(), ws.ProjectID),
		Secrets:       &userSecretVault{s: s, uid: userID(r)},
		GuardCommands: true,
		RulesDoc:      s.loadRulesDoc(r.Context(), rt, ws.ProjectID),
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

	// Reflection (auto-learning): after a substantive run (one that wrote files or ran
	// commands), stage durable memories/skills as proposals for the user to review. Skipped
	// for plan-mode and read-only runs. Best-effort and fully detached from this request.
	if mutated && body.Mode != "plan" {
		s.reflectAsync(ws.ProjectID, userID(r), provider, s.providerAPIKey(r.Context(), userID(r), providerName),
			body.Task, actionLog.String(), result.Final)
	}
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
