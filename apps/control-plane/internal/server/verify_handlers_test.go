package server

import (
	"strings"
	"testing"
	"time"
)

// Every mission plan must end with a verification step unless it already has one.
func TestEnsureVerifyObjective(t *testing.T) {
	// No verify step → canonical objective appended.
	out := ensureVerifyObjective([]string{"build the form", "wire the API"}, 10)
	if len(out) != 3 || !strings.Contains(out[2], "Final verification") {
		t.Errorf("expected appended verify objective, got %v", out)
	}

	// Plan already verifies → untouched.
	in := []string{"build the form", "run the tests and verify"}
	out = ensureVerifyObjective(in, 10)
	if len(out) != 2 {
		t.Errorf("plan with a verify step must be untouched, got %v", out)
	}

	// At the cap → last step evicted to make room for verification.
	out = ensureVerifyObjective([]string{"a", "b", "c"}, 3)
	if len(out) != 3 || !strings.Contains(out[2], "Final verification") || out[1] != "b" {
		t.Errorf("expected eviction+append at cap, got %v", out)
	}

	// Cap of 1 → left alone (a verify-only mission would do no work).
	out = ensureVerifyObjective([]string{"a"}, 1)
	if len(out) != 1 || out[0] != "a" {
		t.Errorf("cap of 1 must leave the plan alone, got %v", out)
	}

	// No cap (0) → plain append.
	out = ensureVerifyObjective([]string{"a"}, 0)
	if len(out) != 2 {
		t.Errorf("expected append with no cap, got %v", out)
	}
}

// The preview error ring is bounded and snapshot-safe.
func TestPreviewErrRingBounded(t *testing.T) {
	r := &previewErrRing{}
	for i := 0; i < previewErrCap+50; i++ {
		r.push(previewErr{Level: "error", Text: "boom", At: time.Now()})
	}
	if got := len(r.snapshot()); got != previewErrCap {
		t.Errorf("ring size = %d, want %d", got, previewErrCap)
	}
}

// The agent-facing preview-errors tool reports honestly when nothing was captured, and
// formats captured entries with level + text.
func TestPreviewErrorsTool(t *testing.T) {
	s := &Server{}
	tool := s.previewErrorsTool("p1")

	obs, err := tool(t.Context())
	if err != nil {
		t.Fatalf("tool error: %v", err)
	}
	if !strings.Contains(obs, "no preview errors captured") {
		t.Errorf("empty ring must report honestly, got %q", obs)
	}

	s.previewRing("p1").push(previewErr{Level: "error", Text: "TypeError: boom", At: time.Now()})
	obs, err = tool(t.Context())
	if err != nil {
		t.Fatalf("tool error: %v", err)
	}
	if !strings.Contains(obs, "TypeError: boom") || !strings.Contains(obs, "error]") {
		t.Errorf("captured error not formatted, got %q", obs)
	}
	// Rings are per-project.
	obs, _ = s.previewErrorsTool("other")(t.Context())
	if strings.Contains(obs, "TypeError") {
		t.Errorf("preview errors leaked across projects: %q", obs)
	}
}
