package server

import (
	"strings"
	"testing"
	"time"
)

func TestRenderMissionSpec(t *testing.T) {
	m := mission{ID: "m-1", Goal: "Build a todo app", Status: "running", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	tasks := []missionTask{
		{Ordinal: 0, Objective: "Scaffold the app", Status: "done", Result: "created files\nmore detail"},
		{Ordinal: 1, Objective: "Wire the API", Status: "running"},
		{Ordinal: 2, Objective: "Verify", Status: "pending"},
		{Ordinal: 3, Objective: "Broken step", Status: "failed", Result: "boom"},
	}
	out := renderMissionSpec(m, tasks)
	for _, want := range []string{
		"# Mission: Build a todo app",
		"Status: running",
		"- [x] 1. Scaffold the app",
		"result: created files", // first line only
		"- [>] 2. Wire the API",
		"- [ ] 3. Verify",
		"- [!] 4. Broken step",
		"source of truth",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("spec missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "more detail") {
		t.Errorf("result must be first-line only")
	}
}

func TestMissionSpecPath(t *testing.T) {
	if got := missionSpecPath("abc"); got != ".torsor/specs/abc/plan.md" {
		t.Errorf("path = %q", got)
	}
}

func TestRoutedProviderName(t *testing.T) {
	t.Setenv("TORSOR_MODEL_ROUTING", "plan=anthropic, step=ollama ,reflect=ollama")
	if got := routedProviderName("plan"); got != "anthropic" {
		t.Errorf("plan = %q", got)
	}
	if got := routedProviderName("step"); got != "ollama" {
		t.Errorf("step = %q", got)
	}
	if got := routedProviderName("missing"); got != "" {
		t.Errorf("unrouted role must be empty, got %q", got)
	}
	t.Setenv("TORSOR_MODEL_ROUTING", "")
	if got := routedProviderName("plan"); got != "" {
		t.Errorf("empty routing must be empty, got %q", got)
	}
}
