package main

import (
	"strings"
	"testing"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

func argString(args []string) string { return " " + strings.Join(args, " ") + " " }

func TestBuildCreateArgsAppliesLimitsAndHardening(t *testing.T) {
	lim := limits{memory: "512m", cpus: "1", pids: "256", network: "bridge", hardened: true, keepAlive: true}
	args, err := buildCreateArgs("torsor-p1", plugin.WorkspaceSpec{ID: "p1", Image: "node:20", WorkingDir: "/app"}, lim)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	s := argString(args)

	for _, want := range []string{
		" create ", " --name torsor-p1 ", " -w /app ",
		" --memory 512m ", " --cpus 1 ", " --pids-limit 256 ", " --network bridge ",
		" --cap-drop ALL ", " --security-opt no-new-privileges ",
		" --restart unless-stopped ",
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
	// keepAlive dev workspace: image kept alive with tail.
	args, err := buildCreateArgs("c", plugin.WorkspaceSpec{ID: "x", Env: map[string]string{"B": "2", "A": "1"}}, limits{keepAlive: true})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
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

func TestBuildCreateArgsAppModePublishesPortAndRunsImageCommand(t *testing.T) {
	// App deploy: keepAlive false, appPort set — publish the port, run the image's own cmd.
	lim := limits{keepAlive: false, appPort: "80"}
	args, err := buildCreateArgs("torsor-web", plugin.WorkspaceSpec{ID: "web", Image: "nginx"}, lim)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	s := argString(args)
	if !strings.Contains(s, " -p 127.0.0.1::80 ") {
		t.Errorf("expected loopback port publish, got: %s", s)
	}
	// The image must be the final positional arg (no tail override in app mode).
	if !strings.HasSuffix(strings.TrimSpace(s), "nginx") {
		t.Errorf("app mode should run the image's own command (image last), got: %s", s)
	}
	if strings.Contains(s, "tail -f /dev/null") {
		t.Errorf("app mode must not override the command with tail: %s", s)
	}
}

func TestResolveImageAllowlistAndValidation(t *testing.T) {
	// No allowlist: any well-formed image passes; empty falls back to alpine:3.
	if img, err := resolveImage("node:20", "", nil); err != nil || img != "node:20" {
		t.Errorf("permissive resolveImage(node:20) = %q, %v", img, err)
	}
	if img, err := resolveImage("", "", nil); err != nil || img != "alpine:3" {
		t.Errorf("resolveImage(\"\") = %q, %v; want alpine:3", img, err)
	}
	// Malformed references are rejected regardless of allowlist.
	for _, bad := range []string{"node:20; rm -rf /", "a b", "img$(whoami)", "x`id`"} {
		if _, err := resolveImage(bad, "", nil); err == nil {
			t.Errorf("resolveImage(%q) should have been rejected", bad)
		}
	}
	// Allowlist set: only listed images pass.
	allow := []string{"node:20", "python:3.12"}
	if _, err := resolveImage("node:20", "", allow); err != nil {
		t.Errorf("allowlisted image rejected: %v", err)
	}
	if _, err := resolveImage("ubuntu:latest", "", allow); err == nil {
		t.Errorf("non-allowlisted image ubuntu:latest should be rejected")
	}
	// With an allowlist, the empty->alpine:3 fallback must itself be allowlisted.
	if _, err := resolveImage("", "", allow); err == nil {
		t.Errorf("default alpine:3 should be rejected when not in the allowlist")
	}
}

func TestBuildCreateArgsRejectsDisallowedImage(t *testing.T) {
	lim := limits{allowlist: []string{"node:20"}}
	if _, err := buildCreateArgs("c", plugin.WorkspaceSpec{ID: "x", Image: "evil:latest"}, lim); err == nil {
		t.Errorf("buildCreateArgs should reject a non-allowlisted image")
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

func TestResolveImageDefault(t *testing.T) {
	// An empty request uses the configured default image...
	if img, err := resolveImage("", "node:20-alpine", nil); err != nil || img != "node:20-alpine" {
		t.Errorf("resolveImage(\"\", node:20-alpine) = %q, %v; want node:20-alpine", img, err)
	}
	// ...and an empty default still falls back to alpine:3 (belt-and-suspenders).
	if img, err := resolveImage("", "", nil); err != nil || img != "alpine:3" {
		t.Errorf("resolveImage(\"\", \"\") = %q, %v; want alpine:3", img, err)
	}
	// A default is a fallback only — an explicit request still wins.
	if img, err := resolveImage("python:3.12", "node:20-alpine", nil); err != nil || img != "python:3.12" {
		t.Errorf("explicit image should win over default, got %q, %v", img, err)
	}
}
