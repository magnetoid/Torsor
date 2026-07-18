package agent

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// scriptedModel returns a fixed sequence of responses, one per Complete call. It records
// the prompts it received so tests can assert observations were fed back.
type scriptedModel struct {
	responses []string
	call      int
	prompts   []string
	systems   []string
}

func (m *scriptedModel) Complete(_ context.Context, req plugin.CompleteRequest) (plugin.CompleteResult, error) {
	m.prompts = append(m.prompts, req.Prompt)
	m.systems = append(m.systems, req.System)
	if m.call >= len(m.responses) {
		return plugin.CompleteResult{}, fmt.Errorf("scriptedModel: no response for call %d", m.call)
	}
	r := m.responses[m.call]
	m.call++
	// Fixed per-call token counts so tests can assert usage is summed across the loop.
	return plugin.CompleteResult{Text: r, Model: "scripted-1", TokensIn: 10, TokensOut: 5}, nil
}

// memWorkspace is an in-memory Workspace: a flat file map plus a scripted exec result.
type memWorkspace struct {
	files    map[string]string
	execOut  string
	execExit int32
	execCmds [][]string
}

func newMemWorkspace() *memWorkspace { return &memWorkspace{files: map[string]string{}} }

func (w *memWorkspace) ListFiles(_ context.Context, _, path string) ([]plugin.FileEntry, error) {
	var out []plugin.FileEntry
	for p := range w.files {
		if path == "" || strings.HasPrefix(p, path) {
			out = append(out, plugin.FileEntry{Name: p, Path: p})
		}
	}
	return out, nil
}

func (w *memWorkspace) ReadFile(_ context.Context, _, path string) ([]byte, error) {
	c, ok := w.files[path]
	if !ok {
		return nil, fmt.Errorf("no such file: %s", path)
	}
	return []byte(c), nil
}

func (w *memWorkspace) WriteFile(_ context.Context, _, path string, content []byte, _ bool) error {
	w.files[path] = string(content)
	return nil
}

func (w *memWorkspace) Exec(_ context.Context, spec plugin.ExecSpec, onChunk func(plugin.ExecChunk) error) error {
	w.execCmds = append(w.execCmds, spec.Command)
	return onChunk(plugin.ExecChunk{Stdout: w.execOut, ExitCode: w.execExit, Done: true})
}

func collect(events *[]Event) func(Event) {
	return func(e Event) { *events = append(*events, e) }
}

func kinds(events []Event) []EventKind {
	var k []EventKind
	for _, e := range events {
		k = append(k, e.Kind)
	}
	return k
}

// A full happy path: the model inspects the tree, writes a file, runs it, then finishes.
func TestRunHappyPath(t *testing.T) {
	model := &scriptedModel{responses: []string{
		`{"thought":"look around","action":{"tool":"list_files","args":{"path":""}}}`,
		`{"thought":"create the script","action":{"tool":"write_file","args":{"path":"app.js","content":"console.log('hi')"}}}`,
		`{"thought":"run it","action":{"tool":"run","args":{"command":"node app.js"}}}`,
		`{"thought":"done","final":"Created app.js and ran it successfully."}`,
	}}
	ws := newMemWorkspace()
	ws.execOut = "hi\n"

	var events []Event
	result, err := NewRunner(model, ws, Config{WorkspaceID: "p1"}).Run(context.Background(), "make a hello script", collect(&events))
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if !strings.Contains(result.Final, "Created app.js") {
		t.Errorf("unexpected final: %q", result.Final)
	}
	// Usage is summed across the 4 model calls (10 in / 5 out each).
	if result.TokensIn != 40 || result.TokensOut != 20 {
		t.Errorf("token totals = %d in / %d out, want 40/20", result.TokensIn, result.TokensOut)
	}
	if result.Steps != 4 {
		t.Errorf("steps = %d, want 4", result.Steps)
	}
	if ws.files["app.js"] != "console.log('hi')" {
		t.Errorf("file not written: %q", ws.files["app.js"])
	}
	if len(ws.execCmds) != 1 || ws.execCmds[0][0] != "sh" {
		t.Errorf("expected one sh -c exec, got %v", ws.execCmds)
	}
	// The write observation must be fed back into the model's 3rd prompt.
	if len(model.prompts) < 3 || !strings.Contains(model.prompts[2], "wrote 17 bytes to app.js") {
		t.Errorf("write observation not fed back; 3rd prompt: %q", model.prompts[len(model.prompts)-1])
	}
	wantKinds := []EventKind{
		EventThought, EventToolCall, EventToolResult,
		EventThought, EventToolCall, EventToolResult,
		EventThought, EventToolCall, EventToolResult,
		EventThought, EventFinal,
	}
	if fmt.Sprint(kinds(events)) != fmt.Sprint(wantKinds) {
		t.Errorf("event sequence = %v, want %v", kinds(events), wantKinds)
	}
}

// The model reads a failing build, then fixes and re-runs — the self-heal loop.
func TestRunSelfHealsAfterFailedCommand(t *testing.T) {
	model := &scriptedModel{responses: []string{
		`{"thought":"run tests","action":{"tool":"run","args":{"command":"npm test"}}}`,
		`{"thought":"fix the bug","action":{"tool":"write_file","args":{"path":"index.js","content":"export const add=(a,b)=>a+b"}}}`,
		`{"thought":"re-run","action":{"tool":"run","args":{"command":"npm test"}}}`,
		`{"thought":"green","final":"Fixed the failing test."}`,
	}}
	ws := newMemWorkspace()
	ws.execOut = "1 passing"

	var events []Event
	result, err := NewRunner(model, ws, Config{WorkspaceID: "p1"}).Run(context.Background(), "fix failing tests", collect(&events))
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if !strings.Contains(result.Final, "Fixed") {
		t.Errorf("unexpected final: %q", result.Final)
	}
	if len(ws.execCmds) != 2 {
		t.Errorf("expected 2 exec calls (run, re-run), got %d", len(ws.execCmds))
	}
}

// A malformed step is recovered from: the loop re-prompts and continues.
func TestRunRecoversFromMalformedStep(t *testing.T) {
	model := &scriptedModel{responses: []string{
		"Sure! I'll help with that.", // no JSON — should trigger a re-prompt
		`{"thought":"done","final":"ok"}`,
	}}
	ws := newMemWorkspace()

	var events []Event
	result, err := NewRunner(model, ws, Config{WorkspaceID: "p1"}).Run(context.Background(), "do a thing", collect(&events))
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if result.Final != "ok" {
		t.Errorf("final = %q, want ok", result.Final)
	}
	// The re-prompt observation must appear in the second model prompt.
	if len(model.prompts) != 2 || !strings.Contains(model.prompts[1], "not a single valid JSON step") {
		t.Errorf("expected re-prompt with protocol nudge; prompts=%v", model.prompts)
	}
}

// The step budget bounds runaway loops.
func TestRunStopsAtStepBudget(t *testing.T) {
	// Always asks to list files, never finishes.
	loop := `{"thought":"again","action":{"tool":"list_files","args":{"path":""}}}`
	model := &scriptedModel{responses: []string{loop, loop, loop, loop, loop}}
	ws := newMemWorkspace()

	result, err := NewRunner(model, ws, Config{WorkspaceID: "p1", MaxSteps: 3}).Run(context.Background(), "loop", nil)
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if !strings.Contains(result.Final, "3-step budget") {
		t.Errorf("expected budget message, got %q", result.Final)
	}
	if model.call != 3 {
		t.Errorf("expected exactly 3 model calls, got %d", model.call)
	}
}

func TestExtractJSONObject(t *testing.T) {
	cases := map[string]string{
		`{"a":1}`:                     `{"a":1}`,
		"```json\n{\"a\":1}\n```":     `{"a":1}`,
		`prefix {"a":{"b":2}} suffix`: `{"a":{"b":2}}`,
		`{"s":"has } brace","x":1}`:   `{"s":"has } brace","x":1}`,
		`{"s":"esc \" quote","y":2}`:  `{"s":"esc \" quote","y":2}`,
		`no json here`:                ``,
	}
	for in, want := range cases {
		if got := extractJSONObject(in); got != want {
			t.Errorf("extractJSONObject(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestUnknownToolBecomesObservation(t *testing.T) {
	model := &scriptedModel{responses: []string{
		`{"thought":"try","action":{"tool":"teleport","args":{}}}`,
		`{"thought":"give up","final":"could not"}`,
	}}
	ws := newMemWorkspace()
	var events []Event
	_, err := NewRunner(model, ws, Config{WorkspaceID: "p1"}).Run(context.Background(), "x", collect(&events))
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	var toolResult string
	for _, e := range events {
		if e.Kind == EventToolResult {
			toolResult = e.Result
		}
	}
	if !strings.Contains(toolResult, "unknown tool") {
		t.Errorf("expected unknown-tool observation, got %q", toolResult)
	}
}

// fakeToolRouter is an in-memory ToolRouter exposing one external (MCP-style) tool.
type fakeToolRouter struct {
	tools  []ExternalTool
	calls  []string
	result string
}

func (f *fakeToolRouter) ExternalTools() []ExternalTool { return f.tools }

func (f *fakeToolRouter) CallExternal(_ context.Context, name string, _ map[string]string) (string, error) {
	f.calls = append(f.calls, name)
	return f.result, nil
}

// The agent advertises a connected external tool in its system prompt and dispatches a call
// to it through the ToolRouter (the MCP integration seam), surfacing the result as an
// observation — all without the loop knowing the tool's origin.
func TestRunDispatchesExternalTool(t *testing.T) {
	router := &fakeToolRouter{
		tools:  []ExternalTool{{Name: "mcp:demo.search", Description: "search the demo server"}},
		result: "found 3 results",
	}
	model := &scriptedModel{responses: []string{
		`{"thought":"use the mcp tool","action":{"tool":"mcp:demo.search","args":{"q":"widgets"}}}`,
		`{"thought":"done","final":"Searched via MCP."}`,
	}}
	runner := NewRunner(model, newMemWorkspace(), Config{WorkspaceID: "p1", Tools: router})

	var events []Event
	res, err := runner.Run(context.Background(), "find widgets", collect(&events))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(router.calls) != 1 || router.calls[0] != "mcp:demo.search" {
		t.Fatalf("expected one external call to mcp:demo.search, got %v", router.calls)
	}
	var gotResult bool
	for _, e := range events {
		if e.Kind == EventToolResult && strings.Contains(e.Result, "found 3 results") {
			gotResult = true
		}
	}
	if !gotResult {
		t.Errorf("external tool result not surfaced in events: %v", events)
	}
	// The tool must have been advertised to the model in the system prompt.
	if len(model.systems) == 0 || !strings.Contains(model.systems[0], "mcp:demo.search") {
		t.Errorf("external tool not advertised in system prompt: %q", model.systems)
	}
	if res.Final == "" {
		t.Errorf("expected a final message")
	}
}

// The self-verification (reflection) flow: the agent edits, then probes the running app
// with check_app before finishing. The probe is Config-injected so tests fake it freely.
func TestRunSelfVerifiesWithCheckApp(t *testing.T) {
	model := &scriptedModel{responses: []string{
		`{"thought":"create the page","action":{"tool":"write_file","args":{"path":"index.html","content":"<h1>hi</h1>"}}}`,
		`{"thought":"verify the app responds","action":{"tool":"check_app","args":{}}}`,
		`{"thought":"verified","final":"Wrote index.html; check_app returned status 200."}`,
	}}
	ws := newMemWorkspace()

	probeCalls := 0
	cfg := Config{
		WorkspaceID: "p1",
		CheckApp: func(_ context.Context) (string, error) {
			probeCalls++
			return "status=200\n<h1>hi</h1>", nil
		},
	}

	var events []Event
	result, err := NewRunner(model, ws, cfg).Run(context.Background(), "make a page", collect(&events))
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if probeCalls != 1 {
		t.Errorf("check_app probe called %d times, want 1", probeCalls)
	}
	// The probe observation must be fed back to the model's next prompt.
	if len(model.prompts) < 3 || !strings.Contains(model.prompts[2], "status=200") {
		t.Errorf("check_app observation not fed back; got %q", model.prompts[len(model.prompts)-1])
	}
	// The tool must be advertised only because CheckApp was configured.
	if len(model.systems) == 0 || !strings.Contains(model.systems[0], "check_app") {
		t.Errorf("check_app not advertised in system prompt")
	}
	var sawResult bool
	for _, e := range events {
		if e.Kind == EventToolResult && e.Tool == "check_app" && strings.Contains(e.Result, "status=200") {
			sawResult = true
		}
	}
	if !sawResult {
		t.Errorf("check_app tool_result not surfaced in events: %v", events)
	}
	if !strings.Contains(result.Final, "status 200") {
		t.Errorf("unexpected final: %q", result.Final)
	}
}

// Without a configured probe, calling check_app degrades to an observation (the agent can
// route around it), and the tool is not advertised in the system prompt.
func TestCheckAppUnavailable(t *testing.T) {
	model := &scriptedModel{responses: []string{
		`{"thought":"try to verify","action":{"tool":"check_app","args":{}}}`,
		`{"thought":"no probe here","final":"Done without app verification."}`,
	}}
	ws := newMemWorkspace()

	var events []Event
	_, err := NewRunner(model, ws, Config{WorkspaceID: "p1"}).Run(context.Background(), "verify", collect(&events))
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if len(model.systems) == 0 || strings.Contains(model.systems[0], "check_app") {
		t.Errorf("check_app should not be advertised when no probe is configured")
	}
	var sawUnavailable bool
	for _, e := range events {
		if e.Kind == EventToolResult && strings.Contains(e.Result, "not available") {
			sawUnavailable = true
		}
	}
	if !sawUnavailable {
		t.Errorf("expected an 'not available' observation, events: %v", events)
	}
}

// fakeMemory is an in-memory MemoryStore that records what was remembered and returns a
// canned recall result.
type fakeMemory struct {
	remembered []string // "kind:content" of each Remember
	recallOut  string
	recalls    []string // queries passed to Recall
}

func (m *fakeMemory) Remember(_ context.Context, content, kind string) (string, error) {
	m.remembered = append(m.remembered, kind+":"+content)
	return "remembered", nil
}

func (m *fakeMemory) Recall(_ context.Context, query string) (string, error) {
	m.recalls = append(m.recalls, query)
	return m.recallOut, nil
}

// With a MemoryStore configured, the agent can recall prior context and remember new facts;
// both tools are advertised and dispatched to the store.
func TestRunUsesMemoryTools(t *testing.T) {
	model := &scriptedModel{responses: []string{
		`{"thought":"load context","action":{"tool":"recall","args":{"query":"api base url"}}}`,
		`{"thought":"note the decision","action":{"tool":"remember","args":{"content":"API base is /api/v1","kind":"decision"}}}`,
		`{"thought":"done","final":"Recalled context and saved the API base decision."}`,
	}}
	ws := newMemWorkspace()
	mem := &fakeMemory{recallOut: "- [fact] uses postgres\n"}

	var events []Event
	_, err := NewRunner(model, ws, Config{WorkspaceID: "p1", Memory: mem}).Run(context.Background(), "wire the client", collect(&events))
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	// Both tools advertised only because a store was configured.
	if len(model.systems) == 0 || !strings.Contains(model.systems[0], "recall") || !strings.Contains(model.systems[0], "remember") {
		t.Errorf("memory tools not advertised in system prompt")
	}
	// recall query reached the store and its result was fed back to the next prompt.
	if len(mem.recalls) != 1 || mem.recalls[0] != "api base url" {
		t.Errorf("recall queries = %v, want [\"api base url\"]", mem.recalls)
	}
	if len(model.prompts) < 2 || !strings.Contains(model.prompts[1], "uses postgres") {
		t.Errorf("recall observation not fed back; 2nd prompt: %q", model.prompts[len(model.prompts)-1])
	}
	// remember persisted the decision with its kind.
	if len(mem.remembered) != 1 || mem.remembered[0] != "decision:API base is /api/v1" {
		t.Errorf("remembered = %v, want [\"decision:API base is /api/v1\"]", mem.remembered)
	}
}

// Without a MemoryStore, remember/recall are neither advertised nor functional — they
// degrade to an observation the agent can route around.
func TestMemoryToolsUnavailable(t *testing.T) {
	model := &scriptedModel{responses: []string{
		`{"thought":"try to recall","action":{"tool":"recall","args":{"query":"x"}}}`,
		`{"thought":"no memory here","final":"Done without memory."}`,
	}}
	ws := newMemWorkspace()

	var events []Event
	if _, err := NewRunner(model, ws, Config{WorkspaceID: "p1"}).Run(context.Background(), "x", collect(&events)); err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if len(model.systems) == 0 || strings.Contains(model.systems[0], "remember") {
		t.Errorf("memory tools should not be advertised when no store is configured")
	}
	var sawUnavailable bool
	for _, e := range events {
		if e.Kind == EventToolResult && strings.Contains(e.Result, "not available") {
			sawUnavailable = true
		}
	}
	if !sawUnavailable {
		t.Errorf("expected a 'not available' observation, events: %v", events)
	}
}

// Configured skills are injected into the system prompt (both their name and instruction) so
// the project's conventions shape the run.
func TestRunInjectsSkills(t *testing.T) {
	model := &scriptedModel{responses: []string{
		`{"thought":"done","final":"ok"}`,
	}}
	cfg := Config{
		WorkspaceID: "p1",
		Skills: []Skill{
			{Name: "Zod validation", Instruction: "Always validate forms with Zod."},
			{Name: "", Instruction: "Prefer server components."},
		},
	}
	if _, err := NewRunner(model, newMemWorkspace(), cfg).Run(context.Background(), "build a form", nil); err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if len(model.systems) == 0 {
		t.Fatal("no system prompt captured")
	}
	sys := model.systems[0]
	for _, want := range []string{"Project skills", "Zod validation", "Always validate forms with Zod.", "Prefer server components."} {
		if !strings.Contains(sys, want) {
			t.Errorf("system prompt missing %q; got:\n%s", want, sys)
		}
	}
}

// Skills also apply in planning mode (they shape the plan, not just execution).
func TestSkillsApplyInPlanningMode(t *testing.T) {
	model := &scriptedModel{responses: []string{
		`{"thought":"plan","plan":["step one","step two"]}`,
	}}
	cfg := Config{
		WorkspaceID: "p1",
		Mode:        "plan",
		Skills:      []Skill{{Name: "TDD", Instruction: "Write tests first."}},
	}
	if _, err := NewRunner(model, newMemWorkspace(), cfg).Run(context.Background(), "add a feature", nil); err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if len(model.systems) == 0 || !strings.Contains(model.systems[0], "Write tests first.") {
		t.Errorf("skills not injected in planning mode; got:\n%s", model.systems[0])
	}
}
