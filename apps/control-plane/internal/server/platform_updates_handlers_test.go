package server

import (
	"strings"
	"testing"
)

func TestFirstLine(t *testing.T) {
	if got := firstLine("\n\n- added agent verify\n- more", 200); got != "- added agent verify" {
		t.Errorf("firstLine = %q", got)
	}
	long := strings.Repeat("x", 300)
	if got := firstLine(long, 200); got != long[:200]+"…" {
		t.Errorf("long line not capped correctly: %d chars", len(got))
	}
	if got := firstLine("", 200); got != "" {
		t.Errorf("empty body should give empty line, got %q", got)
	}
}

func TestBuildVersion(t *testing.T) {
	t.Setenv("TORSOR_VERSION", "")
	t.Setenv("SOURCE_COMMIT", "")
	if got := buildVersion(); got != "dev" {
		t.Errorf("default build = %q, want dev", got)
	}
	t.Setenv("SOURCE_COMMIT", "abcdef1234567890")
	if got := buildVersion(); got != "abcdef123456" {
		t.Errorf("SOURCE_COMMIT build = %q, want 12-char prefix", got)
	}
	t.Setenv("TORSOR_VERSION", "1.4.0")
	if got := buildVersion(); got != "1.4.0" {
		t.Errorf("TORSOR_VERSION must win, got %q", got)
	}
}
