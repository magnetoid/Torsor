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
	model Model
	ws    Workspace
	cfg   Config
}

// NewRunner builds a Runner. The model and workspace must be non-nil.
func NewRunner(model Model, ws Workspace, cfg Config) *Runner {
	cfg.withDefaults()
	return &Runner{model: model, ws: ws, cfg: cfg}
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
	system := systemPrompt
	if planning {
		system = planSystemPrompt
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
		trimmed := truncate(obs, r.cfg.MaxObservLen)
		emit(Event{Kind: EventToolResult, Step: i, Tool: st.Action.Tool, Result: trimmed})
		fmt.Fprintf(&transcript, "\nAction: %s %v\nObservation: %s\n", st.Action.Tool, st.Action.Args, trimmed)
	}

	msg := fmt.Sprintf("Stopped after the %d-step budget was reached without finishing.", r.cfg.MaxSteps)
	emit(Event{Kind: EventFinal, Step: r.cfg.MaxSteps, Text: msg})
	result.Final = msg
	return result, nil
}

// runTool executes one tool action against the workspace and returns a text observation.
// Tool errors are returned as observation text (not Go errors) so the agent can react and
// recover rather than aborting the whole run.
func (r *Runner) runTool(ctx context.Context, a action) string {
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
		err := r.ws.WriteFile(ctx, r.cfg.WorkspaceID, a.Args["path"], []byte(a.Args["content"]), true)
		if err != nil {
			return "error: " + err.Error()
		}
		return fmt.Sprintf("wrote %d bytes to %s", len(a.Args["content"]), a.Args["path"])

	case "run":
		cmd := strings.TrimSpace(a.Args["command"])
		if cmd == "" {
			return "error: run requires a non-empty command"
		}
		var out strings.Builder
		exit := 0
		err := r.ws.Exec(ctx, plugin.ExecSpec{
			WorkspaceID: r.cfg.WorkspaceID,
			Command:     []string{"sh", "-c", cmd},
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
		return fmt.Sprintf("exit=%d\n%s", exit, out.String())

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
