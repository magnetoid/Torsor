package main

import (
	"strings"
	"testing"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

func argString(args []string) string { return " " + strings.Join(args, " ") + " " }

func TestBuildCreateArgsAppliesLimitsAndHardening(t *testing.T) {
	lim := limits{memory: "512m", cpus: "1", pids: "256", network: "bridge", hardened: true}
	args := buildCreateArgs("torsor-p1", plugin.WorkspaceSpec{ID: "p1", Image: "node:20", WorkingDir: "/app"}, lim)
	s := argString(args)

	for _, want := range []string{
		" create ", " --name torsor-p1 ", " -w /app ",
		" --memory 512m ", " --cpus 1 ", " --pids-limit 256 ", " --network bridge ",
		" --cap-drop ALL ", " --security-opt no-new-privileges ",
		" node:20 tail -f /dev/null ",
	} {
		if !strings.Contains(s, want) {
			t.Errorf("buildCreateArgs missing %q in: %s", want, s)
		}
	}
	// The image must come after all flags (it's the positional arg before the command).
	if idx, mem := indexOf(args, "node:20"), indexOf(args, "--memory"); idx < mem {
		t.Errorf("image at %d should come after flags (--memory at %d)", idx, mem)
	}
}

func TestBuildCreateArgsEnvSortedAndDefaultImage(t *testing.T) {
	args := buildCreateArgs("c", plugin.WorkspaceSpec{ID: "x", Env: map[string]string{"B": "2", "A": "1"}}, limits{})
	s := argString(args)
	// Env iterated in sorted key order for determinism.
	if strings.Index(s, "-e A=1") > strings.Index(s, "-e B=2") {
		t.Errorf("env not sorted: %s", s)
	}
	// Empty image falls back to alpine:3.
	if !strings.Contains(s, " alpine:3 tail -f /dev/null ") {
		t.Errorf("expected default image alpine:3: %s", s)
	}
	// No hardening flags when limits are zero-valued.
	if strings.Contains(s, "--cap-drop") {
		t.Errorf("did not expect hardening flags with zero limits: %s", s)
	}
}

func indexOf(args []string, want string) int {
	for i, a := range args {
		if a == want {
			return i
		}
	}
	return -1
}

func TestContainerName(t *testing.T) {
	cases := map[string]string{
		"proj-123":          "torsor-proj-123",
		"a/b c":             "torsor-a-b-c",
		"UUID_1.2-3":        "torsor-UUID_1.2-3",
		"weird$%name":       "torsor-weird--name",
		"3f9c-1a2b-project": "torsor-3f9c-1a2b-project",
	}
	for in, want := range cases {
		if got := containerName(in); got != want {
			t.Errorf("containerName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestParseLs(t *testing.T) {
	out := "src/\npackage.json\nREADME.md\n.env\nnode_modules/\n"
	entries := parseLs("", out)
	if len(entries) != 5 {
		t.Fatalf("got %d entries, want 5: %+v", len(entries), entries)
	}

	byName := map[string]bool{}
	for _, e := range entries {
		byName[e.Name] = e.IsDir
		if e.Path != e.Name {
			t.Errorf("with empty dir, Path %q should equal Name %q", e.Path, e.Name)
		}
	}
	if !byName["src"] || !byName["node_modules"] {
		t.Errorf("expected src and node_modules to be directories: %+v", entries)
	}
	if byName["package.json"] || byName["README.md"] || byName[".env"] {
		t.Errorf("expected files to not be directories: %+v", entries)
	}
}

func TestParseLsWithDirPrefix(t *testing.T) {
	entries := parseLs("src", "index.ts\nlib/\n")
	want := map[string]bool{"src/index.ts": false, "src/lib": true}
	if len(entries) != 2 {
		t.Fatalf("got %d entries, want 2: %+v", len(entries), entries)
	}
	for _, e := range entries {
		isDir, ok := want[e.Path]
		if !ok {
			t.Errorf("unexpected path %q", e.Path)
			continue
		}
		if e.IsDir != isDir {
			t.Errorf("%q IsDir = %v, want %v", e.Path, e.IsDir, isDir)
		}
	}
}

func TestShellQuote(t *testing.T) {
	if got := shellQuote("a b"); got != "'a b'" {
		t.Errorf("shellQuote(%q) = %q", "a b", got)
	}
	// An embedded single quote must be escaped so the script can't break out.
	if got := shellQuote("it's"); got != `'it'\''s'` {
		t.Errorf("shellQuote(%q) = %q", "it's", got)
	}
}
