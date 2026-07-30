package agent

import (
	"context"
	"strings"
	"testing"
)

// Tools added so the agent can work in real codebases without full-file rewrites:
// search_files, edit_file, delete_file, move_file. runTool is exercised directly —
// these are pure workspace operations with no model in the loop.

func toolRunner(ws *memWorkspace) *Runner {
	return &Runner{ws: ws, cfg: Config{WorkspaceID: "ws-1"}}
}

func TestEditFileReplacesSingleOccurrence(t *testing.T) {
	ws := newMemWorkspace()
	ws.files["app.js"] = "const port = 3000;\nconsole.log(port);\n"
	r := toolRunner(ws)

	obs := r.runTool(context.Background(), action{
		Tool: "edit_file",
		Args: map[string]string{"path": "app.js", "find": "const port = 3000;", "replace": "const port = 8080;"},
	})

	if strings.HasPrefix(obs, "error:") {
		t.Fatalf("unexpected error observation: %s", obs)
	}
	want := "const port = 8080;\nconsole.log(port);\n"
	if got := ws.files["app.js"]; got != want {
		t.Errorf("file content = %q, want %q", got, want)
	}
}

// A find string that isn't there means the model guessed; it must be told so rather
// than silently no-op'ing (or worse, having the edit swallowed).
func TestEditFileNoMatchIsAnError(t *testing.T) {
	ws := newMemWorkspace()
	ws.files["app.js"] = "const port = 3000;\n"
	r := toolRunner(ws)

	obs := r.runTool(context.Background(), action{
		Tool: "edit_file",
		Args: map[string]string{"path": "app.js", "find": "const host = 'x';", "replace": "y"},
	})

	if !strings.HasPrefix(obs, "error:") || !strings.Contains(obs, "no match") {
		t.Errorf("expected a no-match error, got: %s", obs)
	}
	if ws.files["app.js"] != "const port = 3000;\n" {
		t.Error("file was modified despite the failed match")
	}
}

// Ambiguity is refused too: with several matches the replacement site is undetermined,
// so editing the first one would be a coin flip.
func TestEditFileAmbiguousMatchIsAnError(t *testing.T) {
	ws := newMemWorkspace()
	ws.files["app.js"] = "let a = 1;\nlet a = 1;\n"
	r := toolRunner(ws)

	obs := r.runTool(context.Background(), action{
		Tool: "edit_file",
		Args: map[string]string{"path": "app.js", "find": "let a = 1;", "replace": "let a = 2;"},
	})

	if !strings.HasPrefix(obs, "error:") || !strings.Contains(obs, "2 times") {
		t.Errorf("expected an ambiguity error naming the match count, got: %s", obs)
	}
	if ws.files["app.js"] != "let a = 1;\nlet a = 1;\n" {
		t.Error("file was modified despite the ambiguous match")
	}
}

func TestEditFileMissingArgs(t *testing.T) {
	r := toolRunner(newMemWorkspace())
	for _, args := range []map[string]string{
		{"path": "", "find": "x"},
		{"path": "a.js", "find": ""},
	} {
		if obs := r.runTool(context.Background(), action{Tool: "edit_file", Args: args}); !strings.HasPrefix(obs, "error:") {
			t.Errorf("args %v: expected an error observation, got %s", args, obs)
		}
	}
}

func TestSearchFilesBuildsBoundedGrep(t *testing.T) {
	ws := newMemWorkspace()
	ws.execOut = "src/app.js:12:const port = 3000;\n"
	r := toolRunner(ws)

	obs := r.runTool(context.Background(), action{
		Tool: "search_files",
		Args: map[string]string{"query": "port"},
	})

	if !strings.Contains(obs, "src/app.js:12") {
		t.Errorf("expected grep output passed through, got: %s", obs)
	}
	if len(ws.execCmds) != 1 {
		t.Fatalf("expected one exec, got %d", len(ws.execCmds))
	}
	cmd := strings.Join(ws.execCmds[0], " ")
	// Fixed-string and case-insensitive so model queries aren't accidental regexes,
	// and vendored dirs excluded so results stay useful.
	for _, want := range []string{"grep", "-F", "-i", "--exclude-dir=node_modules", "--exclude-dir=.git", "port"} {
		if !strings.Contains(cmd, want) {
			t.Errorf("grep command missing %q: %s", want, cmd)
		}
	}
}

func TestSearchFilesEmptyResult(t *testing.T) {
	ws := newMemWorkspace()
	ws.execOut = ""
	r := toolRunner(ws)

	obs := r.runTool(context.Background(), action{Tool: "search_files", Args: map[string]string{"query": "nope"}})
	if !strings.Contains(obs, "no matches") {
		t.Errorf("expected a no-matches observation, got: %s", obs)
	}
}

func TestSearchFilesRequiresQuery(t *testing.T) {
	r := toolRunner(newMemWorkspace())
	if obs := r.runTool(context.Background(), action{Tool: "search_files", Args: map[string]string{"query": "  "}}); !strings.HasPrefix(obs, "error:") {
		t.Errorf("expected an error for a blank query, got: %s", obs)
	}
}

func TestDeleteAndMoveFile(t *testing.T) {
	ws := newMemWorkspace()
	r := toolRunner(ws)

	if obs := r.runTool(context.Background(), action{Tool: "delete_file", Args: map[string]string{"path": "old.js"}}); !strings.Contains(obs, "deleted old.js") {
		t.Errorf("delete_file observation = %s", obs)
	}
	if obs := r.runTool(context.Background(), action{Tool: "move_file", Args: map[string]string{"from": "a.js", "to": "b/c.js"}}); !strings.Contains(obs, "moved a.js -> b/c.js") {
		t.Errorf("move_file observation = %s", obs)
	}
	if len(ws.execCmds) != 2 {
		t.Fatalf("expected two execs, got %d", len(ws.execCmds))
	}
	// The move goes through a shell (mkdir -p + mv), so paths must be quoted.
	moveCmd := strings.Join(ws.execCmds[1], " ")
	if !strings.Contains(moveCmd, "'a.js'") || !strings.Contains(moveCmd, "'b/c.js'") {
		t.Errorf("move command should quote its paths: %s", moveCmd)
	}
}

func TestMoveFileRequiresBothPaths(t *testing.T) {
	r := toolRunner(newMemWorkspace())
	if obs := r.runTool(context.Background(), action{Tool: "move_file", Args: map[string]string{"from": "a.js"}}); !strings.HasPrefix(obs, "error:") {
		t.Errorf("expected an error when 'to' is missing, got: %s", obs)
	}
}

// A model-supplied path must not be able to break out of its shell argument.
func TestShellQuoteEscapesQuotes(t *testing.T) {
	got := shellQuote(`a'; rm -rf /; echo '`)
	if strings.Contains(got, `'; rm`) && !strings.Contains(got, `'\''`) {
		t.Errorf("quote escaping failed: %s", got)
	}
	if !strings.HasPrefix(got, "'") || !strings.HasSuffix(got, "'") {
		t.Errorf("expected single-quoted result, got %s", got)
	}
}

// Reflection keys off the mutation count, so every writing tool must be counted.
func TestMutatingToolsCoverAllWritePaths(t *testing.T) {
	for _, tool := range []string{"write_file", "edit_file", "delete_file", "move_file", "run"} {
		if !mutatingTools[tool] {
			t.Errorf("%s should be counted as a mutating tool", tool)
		}
	}
	for _, tool := range []string{"read_file", "list_files", "search_files", "recall"} {
		if mutatingTools[tool] {
			t.Errorf("%s is read-only and should not count as a mutation", tool)
		}
	}
}
