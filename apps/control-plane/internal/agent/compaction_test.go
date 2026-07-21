package agent

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestTranscriptCompaction(t *testing.T) {
	var log transcriptLog
	for i := 0; i < 20; i++ {
		log.addExchange(
			action{Tool: "run", Args: map[string]string{"command": fmt.Sprintf("echo step-%d", i)}},
			fmt.Sprintf("exit=0\n%s\n", strings.Repeat("output ", 100)), // ~700 chars each
		)
	}
	// Big budget: everything verbatim, no compaction banner.
	full := log.render(1 << 20)
	if strings.Contains(full, "compacted") {
		t.Errorf("large budget must not compact")
	}
	if strings.Count(full, "Observation:") != 20 {
		t.Errorf("expected all 20 observations verbatim")
	}

	// Tight budget: old exchanges become digest lines; recent stay verbatim; the digest
	// must reference early steps without their full output.
	small := log.render(3000)
	if !strings.Contains(small, "Earlier actions (compacted") {
		t.Errorf("tight budget must compact:\n%s", small[:200])
	}
	if !strings.Contains(small, "echo step-0") {
		t.Errorf("digest must keep early action identity")
	}
	if strings.Count(small, "Observation:") == 20 || strings.Count(small, "Observation:") == 0 {
		t.Errorf("expected a mix of digest + verbatim, got %d verbatim", strings.Count(small, "Observation:"))
	}
	if len(small) > 6000 {
		t.Errorf("render exceeded reasonable bound: %d chars", len(small))
	}
	// The LAST exchange is always verbatim, even under an absurdly small budget.
	tiny := log.render(10)
	if !strings.Contains(tiny, "echo step-19") || !strings.Contains(tiny, "Observation:") {
		t.Errorf("last exchange must stay verbatim under any budget")
	}
}

// A long run keeps working: the model sees compacted history and still finishes.
func TestRunCompactsLongHistory(t *testing.T) {
	responses := make([]string, 0, 13)
	for i := 0; i < 12; i++ {
		responses = append(responses,
			fmt.Sprintf(`{"thought":"step %d","action":{"tool":"run","args":{"command":"echo %d"}}}`, i, i))
	}
	responses[11] = `{"thought":"done","final":"finished the long run"}`
	model := &scriptedModel{responses: responses}
	ws := newMemWorkspace()
	ws.execOut = strings.Repeat("filler ", 400) // ~2.8k chars per observation

	cfg := Config{WorkspaceID: "p1", MaxTranscriptChars: 6000}
	res, err := NewRunner(model, ws, cfg).Run(context.Background(), "long task", nil)
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if res.Final != "finished the long run" {
		t.Errorf("final = %q", res.Final)
	}
	last := model.prompts[len(model.prompts)-1]
	if !strings.Contains(last, "Earlier actions (compacted") {
		t.Errorf("late prompts must carry compacted history")
	}
	if len(last) > 20000 {
		t.Errorf("prompt grew unbounded: %d chars", len(last))
	}
	// The pinned header survives compaction.
	if !strings.Contains(last, "Task: long task") {
		t.Errorf("task header must never be compacted away")
	}
}

func TestRulesDocInjected(t *testing.T) {
	model := &scriptedModel{responses: []string{`{"thought":"done","final":"ok"}`}}
	cfg := Config{WorkspaceID: "p1", RulesDoc: "Use tabs.\nNever commit secrets."}
	if _, err := NewRunner(model, newMemWorkspace(), cfg).Run(context.Background(), "t", nil); err != nil {
		t.Fatalf("Run error: %v", err)
	}
	sys := model.systems[0]
	if !strings.Contains(sys, "AGENTS.md") || !strings.Contains(sys, "Never commit secrets.") {
		t.Errorf("AGENTS.md rules not injected into system prompt")
	}
	// Oversized docs are truncated, not dropped.
	model2 := &scriptedModel{responses: []string{`{"thought":"done","final":"ok"}`}}
	cfg2 := Config{WorkspaceID: "p1", RulesDoc: strings.Repeat("r", 9000)}
	if _, err := NewRunner(model2, newMemWorkspace(), cfg2).Run(context.Background(), "t", nil); err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if !strings.Contains(model2.systems[0], "AGENTS.md truncated") {
		t.Errorf("oversized rules doc must be truncated with a marker")
	}
}
