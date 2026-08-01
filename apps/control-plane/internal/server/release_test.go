package server

import (
	"errors"
	"strings"
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestReleaseWorkspaceIDIsDerivedAndDistinct(t *testing.T) {
	const pid = "cac3ae44-7b41-4d1b-b2b7-800210b910d6"
	rel := releaseWorkspaceID(pid)

	if rel == pid {
		t.Fatal("release workspace id collides with the dev workspace id")
	}
	if !strings.HasPrefix(rel, pid) {
		t.Fatalf("release id %q should be derived from the project id so it is stable across restarts", rel)
	}
	// A UUID contains no such suffix, so a release container can never be mistaken for a dev
	// workspace (or vice versa) when the runtime maps ids to container names.
	if got, want := rel, pid+"-release"; got != want {
		t.Fatalf("releaseWorkspaceID = %q, want %q", got, want)
	}
	// Derivation must be pure: rollback and the proxy compute it independently.
	if releaseWorkspaceID(pid) != rel {
		t.Fatal("releaseWorkspaceID is not deterministic")
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
