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
}

func (m *scriptedModel) Complete(_ context.Context, req plugin.CompleteRequest) (plugin.CompleteResult, error) {
	m.prompts = append(m.prompts, req.Prompt)
	if m.call >= len(m.responses) {
		return plugin.CompleteResult{}, fmt.Errorf("scriptedModel: no response for call %d", m.call)
	}
	r := m.responses[m.call]
	m.call++
	return plugin.CompleteResult{Text: r}, nil
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
	final, err := NewRunner(model, ws, Config{WorkspaceID: "p1"}).Run(context.Background(), "make a hello script", collect(&events))
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if !strings.Contains(final, "Created app.js") {
		t.Errorf("unexpected final: %q", final)
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
	final, err := NewRunner(model, ws, Config{WorkspaceID: "p1"}).Run(context.Background(), "fix failing tests", collect(&events))
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if !strings.Contains(final, "Fixed") {
		t.Errorf("unexpected final: %q", final)
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
	final, err := NewRunner(model, ws, Config{WorkspaceID: "p1"}).Run(context.Background(), "do a thing", collect(&events))
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if final != "ok" {
		t.Errorf("final = %q, want ok", final)
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

	final, err := NewRunner(model, ws, Config{WorkspaceID: "p1", MaxSteps: 3}).Run(context.Background(), "loop", nil)
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if !strings.Contains(final, "3-step budget") {
		t.Errorf("expected budget message, got %q", final)
	}
	if model.call != 3 {
		t.Errorf("expected exactly 3 model calls, got %d", model.call)
	}
}

func TestExtractJSONObject(t *testing.T) {
	cases := map[string]string{
		`{"a":1}`:                                  `{"a":1}`,
		"```json\n{\"a\":1}\n```":                  `{"a":1}`,
		`prefix {"a":{"b":2}} suffix`:              `{"a":{"b":2}}`,
		`{"s":"has } brace","x":1}`:                `{"s":"has } brace","x":1}`,
		`{"s":"esc \" quote","y":2}`:               `{"s":"esc \" quote","y":2}`,
		`no json here`:                             ``,
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
