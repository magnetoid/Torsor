package server

import "testing"

func TestParseStatusPorcelain(t *testing.T) {
	out := "## main...origin/main [ahead 1, behind 2]\n" +
		" M src/app.ts\n" +
		"M  src/store.ts\n" +
		"A  src/new.ts\n" +
		"D  src/old.ts\n" +
		"?? src/untracked.ts\n" +
		"R  a.ts -> b.ts\n"
	st := parseStatusPorcelain(out)
	if !st.Initialized {
		t.Fatal("expected Initialized true")
	}
	if st.Branch != "main" {
		t.Fatalf("branch = %q, want main", st.Branch)
	}
	if st.Ahead != 1 || st.Behind != 2 {
		t.Fatalf("ahead/behind = %d/%d, want 1/2", st.Ahead, st.Behind)
	}
	if len(st.Changes) != 6 {
		t.Fatalf("changes = %d, want 6", len(st.Changes))
	}

	byPath := map[string]gitFile{}
	for _, c := range st.Changes {
		byPath[c.Path] = c
	}
	if c := byPath["src/app.ts"]; c.Status != "modified" || c.Staged {
		t.Fatalf("app.ts = %+v, want modified unstaged", c)
	}
	if c := byPath["src/store.ts"]; c.Status != "modified" || !c.Staged {
		t.Fatalf("store.ts = %+v, want modified staged", c)
	}
	if c := byPath["src/new.ts"]; c.Status != "added" || !c.Staged {
		t.Fatalf("new.ts = %+v, want added staged", c)
	}
	if c := byPath["src/old.ts"]; c.Status != "deleted" || !c.Staged {
		t.Fatalf("old.ts = %+v, want deleted staged", c)
	}
	if c := byPath["src/untracked.ts"]; c.Status != "untracked" || c.Staged {
		t.Fatalf("untracked.ts = %+v, want untracked unstaged", c)
	}
	if c, ok := byPath["b.ts"]; !ok || c.Status != "modified" {
		t.Fatalf("rename should report new path b.ts, got %+v", byPath)
	}
}

func TestParseStatusPorcelainNoUpstream(t *testing.T) {
	st := parseStatusPorcelain("## feature/x\n M a.ts\n")
	if st.Branch != "feature/x" {
		t.Fatalf("branch = %q, want feature/x", st.Branch)
	}
	if st.Ahead != 0 || st.Behind != 0 {
		t.Fatalf("ahead/behind = %d/%d, want 0/0", st.Ahead, st.Behind)
	}
}

func TestParseStatusPorcelainNoCommitsYet(t *testing.T) {
	st := parseStatusPorcelain("## No commits yet on main\n?? README.md\n")
	if st.Branch != "main" {
		t.Fatalf("branch = %q, want main", st.Branch)
	}
	if len(st.Changes) != 1 || st.Changes[0].Status != "untracked" {
		t.Fatalf("changes = %+v, want one untracked", st.Changes)
	}
}

func TestParseLog(t *testing.T) {
	out := "abc1234def\tfeat: add thing\tAda Lovelace\t1700000000\n" +
		"9988776655\tfix: bug\tGrace Hopper\t1699999999\n"
	commits := parseLog(out)
	if len(commits) != 2 {
		t.Fatalf("commits = %d, want 2", len(commits))
	}
	if commits[0].Hash != "abc1234" {
		t.Fatalf("hash = %q, want abc1234 (short)", commits[0].Hash)
	}
	if commits[0].Message != "feat: add thing" || commits[0].Author != "Ada Lovelace" {
		t.Fatalf("commit[0] = %+v", commits[0])
	}
	if commits[0].Timestamp != 1700000000*1000 {
		t.Fatalf("timestamp = %d, want ms", commits[0].Timestamp)
	}
}

func TestParseLogEmpty(t *testing.T) {
	if got := parseLog(""); len(got) != 0 {
		t.Fatalf("expected empty, got %+v", got)
	}
}

func TestParseBranches(t *testing.T) {
	got := parseBranches("main\nfeature/auth\n\nfix/bug\n")
	want := []string{"main", "feature/auth", "fix/bug"}
	if len(got) != len(want) {
		t.Fatalf("branches = %+v, want %+v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("branches[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestIsNotAGitRepo(t *testing.T) {
	if !isNotAGitRepo("fatal: not a git repository (or any of the parent directories): .git") {
		t.Fatal("should detect not-a-repo")
	}
	if isNotAGitRepo("everything up to date") {
		t.Fatal("false positive")
	}
}

func TestGitErr(t *testing.T) {
	if got := gitErr("git commit failed", "fatal: nothing to commit\nmore lines"); got != "git commit failed: fatal: nothing to commit" {
		t.Fatalf("gitErr = %q", got)
	}
	if got := gitErr("git init failed", ""); got != "git init failed" {
		t.Fatalf("gitErr empty = %q", got)
	}
}
