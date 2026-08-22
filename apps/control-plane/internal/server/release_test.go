package server

import (
	"errors"
	"strings"
	"testing"
	"unicode/utf8"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestReleaseWorkspaceIDIsDerivedAndDistinct(t *testing.T) {
	const pid = "cac3ae44-7b41-4d1b-b2b7-800210b910d6"
	rel := releaseWorkspaceID(pid, 4)

	if rel == pid {
		t.Fatal("release workspace id collides with the dev workspace id")
	}
	if !strings.HasPrefix(rel, pid) {
		t.Fatalf("release id %q should be derived from the project id so it is stable across restarts", rel)
	}
	if got, want := rel, pid+"-rel-4"; got != want {
		t.Fatalf("releaseWorkspaceID = %q, want %q", got, want)
	}
	// Derivation must be pure: the proxy, deploy and rollback each compute it independently.
	if releaseWorkspaceID(pid, 4) != rel {
		t.Fatal("releaseWorkspaceID is not deterministic")
	}
}

// Blue/green depends entirely on consecutive releases getting DIFFERENT container ids. When the
// id was keyed only by project, booting a new release destroyed the one currently serving, so
// every deploy took the site down for the length of its build.
func TestReleaseWorkspaceIDIsUniquePerRelease(t *testing.T) {
	const pid = "cac3ae44-7b41-4d1b-b2b7-800210b910d6"
	seen := map[string]bool{}
	for n := 1; n <= 50; n++ {
		id := releaseWorkspaceID(pid, n)
		if seen[id] {
			t.Fatalf("release %d reuses container id %q — a deploy would clobber the live release", n, id)
		}
		seen[id] = true
	}
	if releaseWorkspaceID(pid, 1) == releaseWorkspaceID(pid, 2) {
		t.Fatal("consecutive releases must not share a container")
	}
	// Two different projects must never collide either.
	other := "11111111-2222-3333-4444-555555555555"
	if releaseWorkspaceID(pid, 1) == releaseWorkspaceID(other, 1) {
		t.Fatal("release ids collide across projects")
	}
}

func TestIsUnimplementedDistinguishesCapabilityFromFailure(t *testing.T) {
	if !isUnimplemented(status.Error(codes.Unimplemented, "no snapshots here")) {
		t.Fatal("Unimplemented must be recognised as a missing capability")
	}
	// A real failure must NOT be swallowed as "capability absent" — that would let a broken
	// runtime look like an old one and silently skip release isolation.
	for _, err := range []error{
		status.Error(codes.Internal, "disk full"),
		status.Error(codes.Unavailable, "daemon down"),
		errors.New("plain error"),
		nil,
	} {
		if isUnimplemented(err) {
			t.Errorf("isUnimplemented(%v) = true, want false", err)
		}
	}
}

func TestSummarizeBuildFailurePicksTheErrorLine(t *testing.T) {
	cases := []struct {
		name string
		log  string
		want string
	}{
		{
			name: "finds the error line among noise",
			log:  "npm install\nadded 402 packages\nError: Cannot find module 'vite'\n",
			want: "Error: Cannot find module 'vite'",
		},
		{
			// Scanning backwards matters: builds print progress after early warnings, and the
			// LAST error is the one that actually stopped the build.
			name: "prefers the last error when several appear",
			log:  "Error: deprecated warning\nbuilding…\nError: exit status 1\n",
			want: "Error: exit status 1",
		},
		{
			name: "falls back to the final line when nothing looks like an error",
			log:  "vite build\ndist/index.html 0.5 kB\n",
			want: "dist/index.html 0.5 kB",
		},
		{"empty log yields nothing", "", ""},
		{"whitespace only yields nothing", "\n  \n\t\n", ""},
		{"command not found is recognised", "sh: vite: not found\n", "sh: vite: not found"},
		{"trailing blank lines are skipped", "Error: boom\n\n\n", "Error: boom"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := summarizeBuildFailure(tc.log); got != tc.want {
				t.Fatalf("summarizeBuildFailure() = %q, want %q", got, tc.want)
			}
		})
	}
}

// One deploy at a time per project. Concurrent deploys previously raced on the same container
// name and the same deployments row, so the release recorded as live could disagree with the
// artifact actually serving.
func TestBeginDeployIsExclusivePerProject(t *testing.T) {
	s := &Server{}
	const a, b = "project-a", "project-b"

	doneA, ok := s.beginDeploy(a)
	if !ok {
		t.Fatal("first claim on an idle project must succeed")
	}
	if _, ok := s.beginDeploy(a); ok {
		t.Fatal("a second deploy for the same project must be refused while one is in flight")
	}
	// A different project is unaffected — the lock is per project, not global.
	doneB, ok := s.beginDeploy(b)
	if !ok {
		t.Fatal("a different project must not be blocked by another project's deploy")
	}
	doneB()

	doneA()
	if _, ok := s.beginDeploy(a); !ok {
		t.Fatal("the claim must be released when the deploy finishes")
	}
}

func TestBeginDeployReleaseIsIdempotent(t *testing.T) {
	s := &Server{}
	done, _ := s.beginDeploy("p")
	done()
	done() // a deferred release running twice must not panic or corrupt state
	if _, ok := s.beginDeploy("p"); !ok {
		t.Fatal("project should be claimable after release")
	}
}

// truncate feeds CopyFrom, so one oversized or malformed value aborts a whole batch of log
// entries — and the failure is swallowed by design, so logging would silently stop.
func TestTruncateFitsCharacterLimit(t *testing.T) {
	cases := []struct {
		name, in string
		n        int
	}{
		{"ascii over limit", strings.Repeat("a", 100), 64},
		{"exactly at limit", strings.Repeat("a", 64), 64},
		{"under limit", "short", 64},
		{"multibyte over limit", strings.Repeat("é", 100), 10},
		{"emoji over limit", strings.Repeat("🔥", 40), 10},
		{"mixed width", strings.Repeat("aé🔥", 30), 12},
		{"limit of one", "abcdef", 1},
		{"limit of two", "abcdef", 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := truncate(tc.in, tc.n)
			if n := utf8.RuneCountInString(got); n > tc.n {
				t.Errorf("truncate(%d runes, n=%d) returned %d runes — VARCHAR(%d) would reject it",
					utf8.RuneCountInString(tc.in), tc.n, n, tc.n)
			}
			if !utf8.ValidString(got) {
				t.Errorf("truncate produced invalid UTF-8 — Postgres rejects it (SQLSTATE 22021)")
			}
		})
	}
	if got := truncate("anything", 0); got != "" {
		t.Errorf("truncate(_, 0) = %q, want empty", got)
	}
}

// nullUUID guards two attacker-influenced columns; a 36-char non-UUID used to pass the length
// check and then kill the entire CopyFrom batch it rode in on.
func TestNullUUIDRejectsNonUUIDs(t *testing.T) {
	valid := "cac3ae44-7b41-4d1b-b2b7-800210b910d6"
	if got := nullUUID(valid); got != valid {
		t.Errorf("nullUUID(%q) = %v, want the id preserved", valid, got)
	}
	for _, bad := range []string{
		"",
		"not-a-uuid",
		strings.Repeat("z", 36),                // right length, not hex
		"cac3ae44-7b41-4d1b-b2b7-800210b910dZ", // right shape, bad char
		"cac3ae447b414d1bb2b7800210b910d6xxxx", // 36 chars, no dashes
	} {
		if got := nullUUID(bad); got != nil {
			t.Errorf("nullUUID(%q) = %v, want nil — a bad id must not reach the uuid column", bad, got)
		}
	}
}
