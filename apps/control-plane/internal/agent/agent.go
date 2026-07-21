// Package agent implements the Torsor coding agent: a ReAct-style loop that turns a
// user's prompt into real work inside a project workspace. Each turn the model is asked
// for one JSON step — a thought plus either a tool action (read/write/list files, run a
// command) or a final answer. Tool results are fed back and the loop repeats until the
// model finishes or a step budget is hit.
//
// The loop is deliberately model- and runtime-agnostic: it depends on the two narrow
// interfaces below (Model, Workspace), which the plugin ModelProvider and
// WorkspaceRuntime satisfy in production and tiny fakes satisfy in tests. The single
// JSON-step protocol (rather than native tool-calling) is chosen because it is the most
// reliable shape across local open models, which the "free by default" charter targets.
package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// Model is the slice of a ModelProvider the agent needs. plugin.ModelProvider satisfies it.
type Model interface {
	Complete(ctx context.Context, req plugin.CompleteRequest) (plugin.CompleteResult, error)
}

// Workspace is the slice of a WorkspaceRuntime the agent needs as its tools.
// plugin.WorkspaceRuntime satisfies it.
type Workspace interface {
	ListFiles(ctx context.Context, workspaceID, path string) ([]plugin.FileEntry, error)
	ReadFile(ctx context.Context, workspaceID, path string) ([]byte, error)
	WriteFile(ctx context.Context, workspaceID, path string, content []byte, createDirs bool) error
	Exec(ctx context.Context, spec plugin.ExecSpec, onChunk func(plugin.ExecChunk) error) error
}

// EventKind classifies a step event streamed to the caller.
type EventKind string

const (
	EventThought    EventKind = "thought"     // the model's reasoning for this step
	EventPlan       EventKind = "plan"        // a proposed plan (spec-mode), awaiting approval
	EventToolCall   EventKind = "tool_call"   // a tool is about to run
	EventToolResult EventKind = "tool_result" // the tool's observation
	EventFinal      EventKind = "final"       // the agent's final answer to the user
	EventError      EventKind = "error"       // a non-recoverable loop error
)

// Event is one streamed step of an agent run. Consumers (an SSE handler, a test) receive
// these in order via the Runner's onEvent callback.
type Event struct {
	Kind   EventKind         `json:"kind"`
	Text   string            `json:"text,omitempty"`   // thought / final text / error message
	Tool   string            `json:"tool,omitempty"`   // tool name for tool_call / tool_result
	Args   map[string]string `json:"args,omitempty"`   // tool arguments for tool_call
	Result string            `json:"result,omitempty"` // observation for tool_result
	Plan   []string          `json:"plan,omitempty"`   // proposed plan steps (EventPlan)
	Step   int               `json:"step"`             // 1-based step index
	// Seq is a 1-based monotonic index assigned when a background run persists this event,
	// used by the reattach SSE stream to de-duplicate replayed vs. live-tailed events. It is
	// unset (0, omitted) for the synchronous /agent/stream path.
	Seq int `json:"seq,omitempty"`
}

// Config controls a single run.
type Config struct {
	WorkspaceID  string
	MaxSteps     int    // hard cap on model turns (default 12)
	MaxTokens    int32  // per-model-call output cap (default 2048)
	MaxObservLen int    // truncate a tool observation fed back to the model (default 4000 chars)
	APIKey       string // optional per-user BYO key forwarded to the model provider
	// Mode selects the loop's behavior: "direct" (default) acts immediately; "plan" first
	// proposes a plan and pauses for approval (spec-driven flow).
	Mode string
	// Plan, when non-empty, is a user-approved plan pinned into the transcript so the
	// execution run follows it. Set on the approved-execution call.
	Plan []string
	// Tools, when set, supplies external tools (e.g. from connected MCP servers) that are
	// advertised to the model alongside the built-ins and dispatched via CallExternal. Nil
	// means built-in tools only.
	Tools ToolRouter
	// CheckApp, when set, enables the check_app tool: an HTTP probe of the project's
	// running app (the same target the live preview proxies to). It returns a short
	// observation like "status=200\n<body head>"; probe failures should come back as
	// observation text (nil error) so the agent can react and fix rather than abort.
	// Wired by the server from the workspace runtime's status; nil hides the tool.
	CheckApp func(ctx context.Context) (string, error)
	// VerifyApp, when set, enables the verify_app tool: a real headless-browser check of
	// the running app (page load, console errors, uncaught exceptions, failed requests,
	// interactive-element audit) with an optional agent-supplied JS expression. Like
	// CheckApp, failures should come back as observation text so the agent reacts and
	// fixes rather than aborting. Wired by the server (internal/verify); nil hides the tool.
	VerifyApp func(ctx context.Context, js string) (string, error)
	// PreviewErrors, when set, enables the read_preview_errors tool: recent console
	// errors/warnings captured from the user's live preview session (forwarded by the IDE),
	// so the agent can see what actually broke in the user's browser. Nil hides the tool.
	PreviewErrors func(ctx context.Context) (string, error)
	// PreviewPort is the container port the live preview watches (TORSOR_WS_APP_PORT).
	// The agent is told to bind its web/dev server to 0.0.0.0:PreviewPort so the app
	// shows up in the preview and is deployable. Empty = no preview-port guidance.
	PreviewPort string
	// Memory, when set, enables the remember/recall tools so the agent can persist and
	// retrieve durable project context across runs. Wired by the server from the project's
	// memories; nil hides both tools.
	Memory MemoryStore
	// Skills are user-defined instructions injected into the system prompt so the project's
	// conventions shape both planning and execution. Empty = none.
	Skills []Skill
	// Secrets, when set, lets the agent USE the user's stored secrets without ever seeing
	// them: {{secret:NAME}} placeholders in run commands and written files are expanded at
	// exec time, and every stored secret value is scrubbed back to its placeholder in tool
	// observations before they reach the model (so even `cat .env` can't leak a stored
	// value into context). Nil disables both expansion and scrubbing.
	Secrets SecretVault
	// GuardCommands, when true, blocks destructive run commands (rm -rf outside the
	// workspace, DROP DATABASE, force-push, curl|sh, …) — the block comes back as an
	// observation so the agent adapts instead of aborting. Wired on by the server for all
	// runs; the user can always run such commands themselves in the terminal.
	GuardCommands bool
}

// SecretVault gives the agent placeholder-based access to the user's stored secrets. It
// follows the same narrow-interface design as Model/Workspace: the server backs it with
// the encrypted secrets table; tests use a fake. The agent loop guarantees values returned
// by Value/All never enter a model prompt.
type SecretVault interface {
	// Value returns the decrypted secret for name ("" , false when absent).
	Value(ctx context.Context, name string) (string, bool)
	// All returns every stored (name → value) pair, used to scrub observations.
	All(ctx context.Context) map[string]string
}

// ExternalTool is a tool contributed from outside the built-in set (an MCP server today).
// Name is the exact string the model must emit to invoke it — Torsor uses the
// "mcp:<server>.<tool>" convention so external calls are unambiguous.
type ExternalTool struct {
	Name        string
	Description string
}

// ToolRouter supplies and executes external tools for a run. It keeps the loop ignorant of
// where a tool comes from (the same narrow-interface design as Model/Workspace), so MCP —
// or any future tool source — plugs in without the agent knowing its origin.
type ToolRouter interface {
	ExternalTools() []ExternalTool
	CallExternal(ctx context.Context, name string, args map[string]string) (string, error)
}

// MemoryStore gives the agent durable, cross-run project memory via the remember/recall
// tools. It follows the same narrow-interface design as Model/Workspace, so the loop stays
// ignorant of the DB (the server backs it with the memories table; tests use a fake). Nil
// hides both tools.
type MemoryStore interface {
	// Remember persists a memory and returns a short confirmation observation.
	Remember(ctx context.Context, content, kind string) (string, error)
	// Recall returns memories matching query (or the most recent when empty) as text.
	Recall(ctx context.Context, query string) (string, error)
}

// Skill is a user-defined, reusable capability injected into the system prompt for a run: a
// named instruction that shapes how the agent works (e.g. "always validate forms with Zod").
// The server loads the project's enabled skills; empty means none.
type Skill struct {
	Name        string
	Instruction string
}

func (c *Config) withDefaults() {
	if c.MaxSteps <= 0 {
		c.MaxSteps = 12
	}
	if c.MaxTokens <= 0 {
		c.MaxTokens = 2048
	}
	if c.MaxObservLen <= 0 {
		c.MaxObservLen = 4000
	}
}

// Runner drives the agent loop for one project workspace.
type Runner struct {
	model    Model
	ws       Workspace
	cfg      Config
	extNames map[string]bool // external tool names (for O(1) dispatch routing)
}

// NewRunner builds a Runner. The model and workspace must be non-nil.
func NewRunner(model Model, ws Workspace, cfg Config) *Runner {
	cfg.withDefaults()
	ext := map[string]bool{}
	if cfg.Tools != nil {
		for _, t := range cfg.Tools.ExternalTools() {
			ext[t.Name] = true
		}
	}
	return &Runner{model: model, ws: ws, cfg: cfg, extNames: ext}
}

// step is the model's structured output for one turn. Exactly one of Action / Final is set.
type step struct {
	Thought string   `json:"thought"`
	Action  *action  `json:"action,omitempty"`
	Final   string   `json:"final,omitempty"`
	Plan    []string `json:"plan,omitempty"`
}

type action struct {
	Tool string            `json:"tool"`
	Args map[string]string `json:"args"`
}

const systemPrompt = `You are Torsor Agent, an autonomous coding agent working inside a real project workspace.

You work in a loop. On EACH turn you respond with exactly ONE JSON object and nothing else — no prose, no markdown fences. The object has this shape:

{"thought": "<brief reasoning>", "action": {"tool": "<name>", "args": {<string args>}}}

or, when the task is complete:

{"thought": "<brief reasoning>", "final": "<message to the user summarizing what you did>"}

Available tools (all args are strings):
- list_files   {"path": "<dir, empty for root>"}          -> lists files/dirs
- read_file    {"path": "<file>"}                          -> returns file contents
- write_file   {"path": "<file>", "content": "<content>"}  -> creates/overwrites the file
- run          {"command": "<shell command>"}              -> runs a command, returns output+exit code

Rules:
- Respond with ONE JSON object only. Do not wrap it in code fences.
- Take the smallest useful step; inspect before editing.
- After a build/test command fails, read the error and fix it, then re-run.
- VERIFY your work before finishing: if the project has tests, run them; if it has a dev
  server or build, run it and (with the run tool) curl the app's local port to confirm it
  responds. Fix what you find, then re-verify. Only then return "final".
- When the task is done and verified, return a "final" message. Do not loop forever.`

// previewPortPromptFmt tells the agent how to make its app visible in the live preview.
// The single %[1]s is the preview port (indexed so one arg fills every slot). Appended to
// the system prompt.
const previewPortPromptFmt = `

LIVE PREVIEW: the workspace has a live preview that shows a web server running on port %[1]s. To make your app appear there (and be deployable), your app MUST listen on 0.0.0.0:%[1]s. Start the server in the BACKGROUND so this loop can continue, e.g.:
- Node/Vite: run with --host 0.0.0.0 --port %[1]s (append " &" so it runs in the background)
- Static files: python3 -m http.server %[1]s --bind 0.0.0.0 &  (or: npx --yes serve -l %[1]s &)
Always background the server (end the command with &) and then continue — never let a foreground server block the loop. After starting it, use check_app to confirm it responds.`

// checkAppPrompt advertises the self-verification probe when the server wires one up.
// Appended to the system prompt (models treat appendices as part of the tool list).
const checkAppPrompt = `

One more tool is available in this run:
- check_app    {}                                          -> HTTP-probes the project's running app (the live-preview target) and returns its status code + the first bytes of the response

Self-verification rule: after your edits, run the build/tests if the project has them, then call check_app to confirm the app actually responds (status 2xx/3xx). If it fails or errors, fix the cause and re-verify. Only return "final" after check_app succeeds — and mention the verification result in your final message.`

// verifyAppPrompt advertises the headless-browser verification tool when the server wires
// one up. Appended to the system prompt (models treat appendices as part of the tool list).
const verifyAppPrompt = `

One more tool is available in this run:
- verify_app   {"js": "<optional JS expression to evaluate in the page>"}  -> loads the running app in a REAL headless browser and reports: page title, console errors, uncaught exceptions, failed network requests (>=400 or connection errors), and a count of interactive elements. The optional js expression runs in the page after load (e.g. probe app state, or drive a flow with a small script) and its value is returned.

Browser-verification rules:
- After building or changing UI, call verify_app — check_app only proves the server responds; verify_app proves the PAGE actually works in a browser.
- Treat any reported console error, uncaught exception, or failed request as a bug to fix, then re-run verify_app.
- Potemkin check: if the report shows zero interactive elements (or your feature's element is missing), the UI is a static shell — wire up the real handlers/data and re-verify.
- Only return "final" when verify_app is clean (or the remaining findings are genuinely expected), and mention the verification result in your final message.`

// previewErrorsPrompt advertises the live-preview error feed when the server wires one up.
const previewErrorsPrompt = `

One more tool is available in this run:
- read_preview_errors  {}                                  -> returns recent console errors/warnings captured from the user's live preview of this app (what the USER actually saw break in their browser)

Use read_preview_errors when the user reports something broken, and after UI changes, to see errors from the real preview session. An empty result means no errors were captured.`

// memoryPrompt advertises the durable-memory tools when the server wires a MemoryStore.
// Appended to the system prompt (models treat appendices as part of the tool list).
const memoryPrompt = `

This project has a durable memory you can use across runs:
- recall     {"query": "<optional search terms>"}          -> returns saved memories (most recent if query is empty)
- remember   {"content": "<fact to keep>", "kind": "<note|fact|decision|preference>"}  -> saves a memory for future runs

Memory rules: near the START of a task, use recall to load prior decisions/context. When you learn something durable (a project convention, an intentional decision, the user's stated preference, a non-obvious fact), remember it concisely so future runs benefit. Keep memories short and factual; don't remember transient state or secrets.`

// planSystemPrompt drives the spec-mode planning phase: the model proposes a short plan and
// nothing else, so the user can approve/refine before any file is touched.
const planSystemPrompt = `You are Torsor Agent in PLANNING mode. Do NOT take any action or edit any files yet.

Read the user's task and respond with exactly ONE JSON object and nothing else:

{"thought": "<brief reasoning>", "plan": ["<step 1>", "<step 2>", "<step 3>", ...]}

Rules:
- 2 to 6 concrete, ordered steps. Each step is a short imperative sentence.
- The plan should end by verifying the result (run tests / check the app responds).
- Respond with ONE JSON object only. No prose, no code fences, no actions.`

// RunResult summarizes a completed agent run.
type RunResult struct {
	Final     string   // the final user-facing message
	Steps     int      // model turns taken
	Mutations int      // count of workspace-mutating tool calls (write_file / run) this run
	Model     string   // model id reported by the provider
	TokensIn  int32    // summed across all model calls
	TokensOut int32    // summed across all model calls
	Plan      []string // proposed plan (plan-mode planning phase); empty otherwise
}

// Run executes the agent loop until the model returns a final answer or the step budget
// is exhausted. Every step is reported through onEvent (in order). Run returns a RunResult
// (final message + summed token usage), or an error if the loop failed irrecoverably. A
// nil onEvent is ok.
func (r *Runner) Run(ctx context.Context, task string, onEvent func(Event)) (RunResult, error) {
	emit := func(e Event) {
		if onEvent != nil {
			onEvent(e)
		}
	}
	var result RunResult

	// The transcript accumulates the task and each observation as plain text, ending with
	// a marker that asks for the next JSON step. Kept as text so it works with any model.
	var transcript strings.Builder
	fmt.Fprintf(&transcript, "Task: %s\n", task)
	// Executing a user-approved plan: pin the agreed steps so the loop follows them.
	if len(r.cfg.Plan) > 0 {
		transcript.WriteString("\nApproved plan — follow these steps in order:\n")
		for i, s := range r.cfg.Plan {
			fmt.Fprintf(&transcript, "%d. %s\n", i+1, s)
		}
	}
	// Planning phase: propose a plan and pause for approval (no actions taken yet).
	planning := r.cfg.Mode == "plan" && len(r.cfg.Plan) == 0
	// Stored secret values for observation scrubbing (loaded once below when a vault is
	// wired; values must never reach a prompt).
	var secretVals map[string]string
	system := systemPrompt
	if planning {
		system = planSystemPrompt
	} else {
		if r.cfg.PreviewPort != "" {
			// Tell the agent how to make its app appear in the live preview (and be
			// deployable): serve on 0.0.0.0:<PreviewPort>, in the background so the loop
			// continues. This is the difference between a running env and a visible app.
			system += fmt.Sprintf(previewPortPromptFmt, r.cfg.PreviewPort)
		}
		if r.cfg.CheckApp != nil {
			// Advertise the self-verification probe (reflection loop): edit → verify → fix.
			system += checkAppPrompt
		}
		if r.cfg.VerifyApp != nil {
			// Advertise the real-browser verification loop (see the app, not just the port).
			system += verifyAppPrompt
		}
		if r.cfg.PreviewErrors != nil {
			// Advertise the user's live-preview error feed.
			system += previewErrorsPrompt
		}
		if r.cfg.Tools != nil {
			// Advertise connected external (MCP) tools to the model alongside the built-ins.
			system += externalToolsPrompt(r.cfg.Tools.ExternalTools())
		}
		if r.cfg.Memory != nil {
			// Advertise the durable remember/recall tools.
			system += memoryPrompt
		}
		if r.cfg.Secrets != nil {
			// Load the vault once per run: names feed the prompt (values never do), and
			// the values scrub every observation back to placeholders.
			secretVals = r.cfg.Secrets.All(ctx)
			system += fmt.Sprintf(secretsPromptFmt, secretNames(secretVals))
		}
	}
	// Skills (user-defined conventions) shape both planning and execution, so they're
	// appended regardless of mode.
	if len(r.cfg.Skills) > 0 {
		system += skillsPrompt(r.cfg.Skills)
	}

	for i := 1; i <= r.cfg.MaxSteps; i++ {
		result.Steps = i
		if err := ctx.Err(); err != nil {
			return result, err
		}

		prompt := transcript.String() + "\nRespond with your next JSON step."
		res, err := r.model.Complete(ctx, plugin.CompleteRequest{
			Prompt:    prompt,
			System:    system,
			MaxTokens: r.cfg.MaxTokens,
			APIKey:    r.cfg.APIKey,
		})
		if err != nil {
			emit(Event{Kind: EventError, Step: i, Text: err.Error()})
			return result, fmt.Errorf("model call failed on step %d: %w", i, err)
		}
		result.TokensIn += res.TokensIn
		result.TokensOut += res.TokensOut
		if res.Model != "" {
			result.Model = res.Model
		}

		st, perr := parseStep(res.Text)
		if perr != nil {
			// Nudge the model back to protocol instead of aborting: feed the parse error
			// as an observation. This recovers from an occasional malformed turn.
			emit(Event{Kind: EventThought, Step: i, Text: "(unparseable model output; re-prompting)"})
			fmt.Fprintf(&transcript, "\nSystem: your last output was not a single valid JSON step (%s). Respond with ONE JSON object only.\n", perr)
			continue
		}

		// Planning phase: emit the proposed plan and pause for approval (the handler
		// persists it; the user approves, and a follow-up run executes with Plan set).
		if planning {
			if len(st.Plan) == 0 {
				emit(Event{Kind: EventThought, Step: i, Text: "(no plan proposed; re-prompting)"})
				transcript.WriteString("\nSystem: respond with a JSON object containing a non-empty \"plan\" array.\n")
				continue
			}
			if st.Thought != "" {
				emit(Event{Kind: EventThought, Step: i, Text: st.Thought})
			}
			emit(Event{Kind: EventPlan, Step: i, Plan: st.Plan})
			result.Plan = st.Plan
			return result, nil
		}

		if st.Thought != "" {
			emit(Event{Kind: EventThought, Step: i, Text: st.Thought})
		}

		if st.Final != "" || st.Action == nil {
			final := st.Final
			if final == "" {
				final = st.Thought
			}
			emit(Event{Kind: EventFinal, Step: i, Text: final})
			result.Final = final
			return result, nil
		}

		emit(Event{Kind: EventToolCall, Step: i, Tool: st.Action.Tool, Args: st.Action.Args})
		obs := r.runTool(ctx, *st.Action)
		if st.Action.Tool == "write_file" || st.Action.Tool == "run" {
			result.Mutations++
		}
		// Scrub BEFORE truncating: truncation could split a secret value in half and let
		// the fragment evade replacement.
		obs = scrubSecrets(obs, secretVals)
		trimmed := truncate(obs, r.cfg.MaxObservLen)
		emit(Event{Kind: EventToolResult, Step: i, Tool: st.Action.Tool, Result: trimmed})
		fmt.Fprintf(&transcript, "\nAction: %s %v\nObservation: %s\n", st.Action.Tool, st.Action.Args, trimmed)
	}

	msg := fmt.Sprintf("Stopped after the %d-step budget was reached without finishing.", r.cfg.MaxSteps)
	emit(Event{Kind: EventFinal, Step: r.cfg.MaxSteps, Text: msg})
	result.Final = msg
	return result, nil
}

// externalToolsPrompt renders the connected external tools as a system-prompt appendix so
// the model knows it may call them. Empty when there are none.
func externalToolsPrompt(tools []ExternalTool) string {
	if len(tools) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\n\nAdditional tools from connected MCP servers (call them exactly like the built-in tools; all args are strings):\n")
	for _, t := range tools {
		desc := t.Description
		if desc == "" {
			desc = "(no description)"
		}
		fmt.Fprintf(&b, "- %s   %s\n", t.Name, desc)
	}
	b.WriteString("Use an MCP tool when the task needs the external data or actions it provides.")
	return b.String()
}

// skillsPrompt renders the project's enabled skills as a system-prompt appendix so the agent
// follows the user's conventions. Empty when there are none.
func skillsPrompt(skills []Skill) string {
	if len(skills) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\n\nProject skills — conventions you MUST follow for this project:\n")
	for _, sk := range skills {
		name := strings.TrimSpace(sk.Name)
		instruction := strings.TrimSpace(sk.Instruction)
		if instruction == "" {
			continue
		}
		if name != "" {
			fmt.Fprintf(&b, "- %s: %s\n", name, instruction)
		} else {
			fmt.Fprintf(&b, "- %s\n", instruction)
		}
	}
	return b.String()
}

// runTool executes one tool action against the workspace and returns a text observation.
// Tool errors are returned as observation text (not Go errors) so the agent can react and
// recover rather than aborting the whole run.
func (r *Runner) runTool(ctx context.Context, a action) string {
	// External (MCP) tools are dispatched through the ToolRouter before the built-ins.
	if r.extNames[a.Tool] {
		if r.cfg.Tools == nil {
			return "error: no tool router configured"
		}
		obs, err := r.cfg.Tools.CallExternal(ctx, a.Tool, a.Args)
		if err != nil {
			return "error: " + err.Error()
		}
		return obs
	}

	switch a.Tool {
	case "list_files":
		entries, err := r.ws.ListFiles(ctx, r.cfg.WorkspaceID, a.Args["path"])
		if err != nil {
			return "error: " + err.Error()
		}
		var b strings.Builder
		for _, e := range entries {
			if e.IsDir {
				fmt.Fprintf(&b, "%s/\n", e.Path)
			} else {
				fmt.Fprintf(&b, "%s\n", e.Path)
			}
		}
		if b.Len() == 0 {
			return "(empty)"
		}
		return b.String()

	case "read_file":
		content, err := r.ws.ReadFile(ctx, r.cfg.WorkspaceID, a.Args["path"])
		if err != nil {
			return "error: " + err.Error()
		}
		return string(content)

	case "write_file":
		if a.Args["path"] == "" {
			return "error: write_file requires a non-empty path"
		}
		// {{secret:NAME}} placeholders expand at write time (e.g. composing a .env), so the
		// file holds the real value while the model only ever handled the placeholder.
		content, missing := expandSecrets(ctx, r.cfg.Secrets, a.Args["content"])
		err := r.ws.WriteFile(ctx, r.cfg.WorkspaceID, a.Args["path"], []byte(content), true)
		if err != nil {
			return "error: " + err.Error()
		}
		return fmt.Sprintf("wrote %d bytes to %s", len(content), a.Args["path"]) + missingSecretsNote(missing)

	case "check_app":
		if r.cfg.CheckApp == nil {
			return "error: check_app is not available in this run"
		}
		obs, err := r.cfg.CheckApp(ctx)
		if err != nil {
			return "error: " + err.Error()
		}
		return obs

	case "verify_app":
		if r.cfg.VerifyApp == nil {
			return "error: verify_app is not available in this run"
		}
		obs, err := r.cfg.VerifyApp(ctx, a.Args["js"])
		if err != nil {
			return "error: " + err.Error()
		}
		return obs

	case "read_preview_errors":
		if r.cfg.PreviewErrors == nil {
			return "error: read_preview_errors is not available in this run"
		}
		obs, err := r.cfg.PreviewErrors(ctx)
		if err != nil {
			return "error: " + err.Error()
		}
		return obs

	case "remember":
		if r.cfg.Memory == nil {
			return "error: remember is not available in this run"
		}
		obs, err := r.cfg.Memory.Remember(ctx, a.Args["content"], a.Args["kind"])
		if err != nil {
			return "error: " + err.Error()
		}
		return obs

	case "recall":
		if r.cfg.Memory == nil {
			return "error: recall is not available in this run"
		}
		obs, err := r.cfg.Memory.Recall(ctx, a.Args["query"])
		if err != nil {
			return "error: " + err.Error()
		}
		return obs

	case "run":
		cmd := strings.TrimSpace(a.Args["command"])
		if cmd == "" {
			return "error: run requires a non-empty command"
		}
		// Destructive-action gate: irreversible commands are refused (as an observation, so
		// the agent adapts); the user can always run them manually in the Terminal.
		if r.cfg.GuardCommands {
			if reason := destructiveReason(cmd); reason != "" {
				return "BLOCKED by safety policy — this command was NOT run (" + reason + "). If it is genuinely required, tell the user in your final message to run it manually in the Terminal; otherwise achieve the goal another way."
			}
		}
		execCmd, missing := expandSecrets(ctx, r.cfg.Secrets, cmd)
		var out strings.Builder
		exit := 0
		err := r.ws.Exec(ctx, plugin.ExecSpec{
			WorkspaceID: r.cfg.WorkspaceID,
			Command:     []string{"sh", "-c", execCmd},
		}, func(c plugin.ExecChunk) error {
			out.WriteString(c.Stdout)
			out.WriteString(c.Stderr)
			if c.Done {
				exit = int(c.ExitCode)
			}
			return nil
		})
		if err != nil {
			return "error: " + err.Error()
		}
		return fmt.Sprintf("exit=%d\n%s", exit, out.String()) + missingSecretsNote(missing)

	default:
		return fmt.Sprintf("error: unknown tool %q", a.Tool)
	}
}

// parseStep extracts the single JSON step object from a model response, tolerating code
// fences and surrounding prose that models sometimes add despite instructions.
func parseStep(text string) (step, error) {
	raw := extractJSONObject(text)
	if raw == "" {
		return step{}, fmt.Errorf("no JSON object found")
	}
	var st step
	if err := json.Unmarshal([]byte(raw), &st); err != nil {
		return step{}, fmt.Errorf("invalid JSON: %w", err)
	}
	if st.Action == nil && st.Final == "" && st.Thought == "" && len(st.Plan) == 0 {
		return step{}, fmt.Errorf("empty step")
	}
	return st, nil
}

// extractJSONObject returns the first balanced {..} object in s, ignoring braces inside
// JSON strings. Returns "" if none is found.
func extractJSONObject(s string) string {
	start := strings.IndexByte(s, '{')
	if start < 0 {
		return ""
	}
	depth := 0
	inStr := false
	esc := false
	for i := start; i < len(s); i++ {
		c := s[i]
		if inStr {
			switch {
			case esc:
				esc = false
			case c == '\\':
				esc = true
			case c == '"':
				inStr = false
			}
			continue
		}
		switch c {
		case '"':
			inStr = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return s[start : i+1]
			}
		}
	}
	return ""
}

func truncate(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	return s[:max] + fmt.Sprintf("\n…(truncated, %d bytes total)", len(s))
}
