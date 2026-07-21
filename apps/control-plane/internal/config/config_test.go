package config

import (
	"testing"
	"time"
)

func TestParseExpiry(t *testing.T) {
	def := 7 * 24 * time.Hour
	cases := []struct {
		in   string
		want time.Duration
	}{
		{"7d", 7 * 24 * time.Hour},
		{"1d", 24 * time.Hour},
		{"30m", 30 * time.Minute},
		{"2h", 2 * time.Hour},
		{"", def},
		{"garbage", def},
	}
	for _, c := range cases {
		if got := parseExpiry(c.in, def); got != c.want {
			t.Errorf("parseExpiry(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestCSV(t *testing.T) {
	got := csv(" a, b ,,c ")
	want := []string{"a", "b", "c"}
	if len(got) != len(want) {
		t.Fatalf("csv len = %d, want %d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("csv[%d] = %q, want %q", i, got[i], want[i])
		}
	}
	if csv("") != nil {
		t.Error("csv(\"\") should be nil")
	}
}

func TestLowerAll(t *testing.T) {
	got := lowerAll([]string{"Foo", "BAR"})
	if got[0] != "foo" || got[1] != "bar" {
		t.Errorf("lowerAll = %v", got)
	}
}

// An unset NODE_ENV must NOT count as development — otherwise a bare `docker run` boots
// with the well-known dev JWT secret + a seeded demo user. Only explicit "development" is dev.
func TestEnvFailsClosed(t *testing.T) {
	cases := []struct {
		env     string
		wantDev bool
	}{
		{"development", true},
		{"", false}, // unset → NOT dev (fail closed)
		{"production", false},
		{"staging", false},
		{"Development", false}, // case-sensitive; only exact "development"
	}
	for _, tc := range cases {
		if got := (Config{Env: tc.env}).IsDevelopment(); got != tc.wantDev {
			t.Errorf("Env=%q IsDevelopment()=%v, want %v", tc.env, got, tc.wantDev)
		}
	}
}
