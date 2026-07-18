package server

import (
	"context"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// Git over the WorkspaceRuntime.Exec primitive. Every handler runs the real
// `git` CLI inside the project's owned workspace container (docker-runtime) and
// returns structured JSON. There is no bespoke git implementation — we shell
// out, which is the source of truth. Ownership is enforced by loadWorkspace
// (the runtime workspace id is the project id, never client-supplied).

// execOut runs a command in the project's workspace and collects the complete
// stdout/stderr plus the final exit code — the synchronous companion to the
// streaming exec endpoint, for callers that need a command's whole result.
func (s *Server) execOut(ctx context.Context, rt plugin.WorkspaceRuntime, projectID string, cmd ...string) (stdout, stderr string, exit int32, err error) {
	var out, errb strings.Builder
	execErr := rt.Exec(ctx, plugin.ExecSpec{WorkspaceID: projectID, Command: cmd}, func(c plugin.ExecChunk) error {
		out.WriteString(c.Stdout)
		errb.WriteString(c.Stderr)
		if c.Done {
			exit = c.ExitCode
		}
		return nil
	})
	return out.String(), errb.String(), exit, execErr
}

// isNotAGitRepo reports whether git's stderr indicates the workspace has no repo yet.
func isNotAGitRepo(stderr string) bool {
	s := strings.ToLower(stderr)
	return strings.Contains(s, "not a git repository")
}

// ---- pure parsers (unit-tested without a runtime) ----

type gitFile struct {
	Path      string `json:"path"`
	Status    string `json:"status"` // modified | added | deleted | untracked
	Staged    bool   `json:"staged"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

type gitStatus struct {
	Initialized bool      `json:"initialized"`
	Branch      string    `json:"branch"`
	Ahead       int       `json:"ahead"`
	Behind      int       `json:"behind"`
	Changes     []gitFile `json:"changes"`
	RemoteURL   string    `json:"remoteUrl"`
}

var reAhead = regexp.MustCompile(`ahead (\d+)`)
var reBehind = regexp.MustCompile(`behind (\d+)`)

// parseStatusPorcelain parses `git status --porcelain=v1 --branch` output.
func parseStatusPorcelain(out string) gitStatus {
	st := gitStatus{Initialized: true, Branch: "", Changes: []gitFile{}}
	lines := strings.Split(strings.ReplaceAll(out, "\r\n", "\n"), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "## ") {
			header := line[3:]
			// Forms: "main", "main...origin/main", "main...origin/main [ahead 1, behind 2]",
			// "No commits yet on main", "HEAD (no branch)".
			branch := header
			if strings.HasPrefix(header, "No commits yet on ") {
				branch = strings.TrimPrefix(header, "No commits yet on ")
			}
			if i := strings.Index(branch, "..."); i >= 0 {
				branch = branch[:i]
			}
			if i := strings.Index(branch, " "); i >= 0 {
				branch = branch[:i]
			}
			st.Branch = strings.TrimSpace(branch)
			if m := reAhead.FindStringSubmatch(header); m != nil {
				st.Ahead, _ = strconv.Atoi(m[1])
			}
			if m := reBehind.FindStringSubmatch(header); m != nil {
				st.Behind, _ = strconv.Atoi(m[1])
			}
			continue
		}
		if len(line) < 4 {
			continue
		}
		x, y := line[0], line[1]
		path := line[3:]
		// Renames/copies come as "old -> new"; report the new path.
		if idx := strings.Index(path, " -> "); idx >= 0 {
			path = path[idx+4:]
		}
		st.Changes = append(st.Changes, gitFile{
			Path:   path,
			Status: classifyStatus(x, y),
			Staged: x != ' ' && x != '?',
		})
	}
	return st
}

// classifyStatus maps a porcelain XY pair to the frontend's status enum.
func classifyStatus(x, y byte) string {
	if x == '?' || y == '?' {
		return "untracked"
	}
	if x == 'A' || y == 'A' {
		return "added"
	}
	if x == 'D' || y == 'D' {
		return "deleted"
	}
	return "modified"
}

type gitCommit struct {
	Hash      string `json:"hash"`
	Message   string `json:"message"`
	Author    string `json:"author"`
	Timestamp int64  `json:"timestamp"` // ms since epoch
}

// parseLog parses tab-separated `git log --pretty=format:%H%x09%s%x09%an%x09%at`.
func parseLog(out string) []gitCommit {
	commits := []gitCommit{}
	for _, line := range strings.Split(strings.ReplaceAll(out, "\r\n", "\n"), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 4)
		if len(parts) < 4 {
			continue
		}
		unix, _ := strconv.ParseInt(parts[3], 10, 64)
		hash := parts[0]
		if len(hash) > 7 {
			hash = hash[:7]
		}
		commits = append(commits, gitCommit{
			Hash:      hash,
			Message:   parts[1],
			Author:    parts[2],
			Timestamp: unix * 1000,
		})
	}
	return commits
}

// parseBranches parses `git branch --format=%(refname:short)` output.
func parseBranches(out string) []string {
	branches := []string{}
	for _, line := range strings.Split(strings.ReplaceAll(out, "\r\n", "\n"), "\n") {
		b := strings.TrimSpace(line)
		if b != "" {
			branches = append(branches, b)
		}
	}
	return branches
}

// ---- handlers ----

func (s *Server) handleGitStatus(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	out, errOut, _, err := s.execOut(r.Context(), rt, ws.ProjectID, "git", "status", "--porcelain=v1", "--branch")
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if isNotAGitRepo(errOut) {
		writeJSON(w, http.StatusOK, gitStatus{Initialized: false, Changes: []gitFile{}})
		return
	}
	st := parseStatusPorcelain(out)
	// Best-effort remote URL (empty when there's no 'origin' remote).
	if remote, _, exit, rerr := s.execOut(r.Context(), rt, ws.ProjectID, "git", "remote", "get-url", "origin"); rerr == nil && exit == 0 {
		st.RemoteURL = strings.TrimSpace(remote)
	}
	writeJSON(w, http.StatusOK, st)
}

func (s *Server) handleGitRevert(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Hash string `json:"hash"`
	}
	if err := decodeJSON(r, &body); err != nil || strings.TrimSpace(body.Hash) == "" {
		writeError(w, http.StatusBadRequest, "commit hash is required")
		return
	}
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	author := s.gitAuthor(r.Context(), userID(r))
	_, errOut, exit, err := s.execOut(r.Context(), rt, ws.ProjectID,
		"git", "-c", "user.name="+author, "-c", "user.email="+author,
		"revert", "--no-edit", body.Hash)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if exit != 0 {
		writeError(w, http.StatusBadRequest, gitErr("git revert failed", errOut))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleGitLog(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	out, errOut, _, err := s.execOut(r.Context(), rt, ws.ProjectID,
		"git", "log", "--pretty=format:%H%x09%s%x09%an%x09%at", "--max-count=50")
	if err != nil {
		s.fail(w, r, err)
		return
	}
	// No repo or no commits yet → empty history rather than an error.
	if isNotAGitRepo(errOut) || strings.Contains(strings.ToLower(errOut), "does not have any commits") {
		writeJSON(w, http.StatusOK, map[string]any{"items": []gitCommit{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": parseLog(out)})
}

func (s *Server) handleGitBranches(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	out, errOut, _, err := s.execOut(r.Context(), rt, ws.ProjectID, "git", "branch", "--format=%(refname:short)")
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if isNotAGitRepo(errOut) {
		writeJSON(w, http.StatusOK, map[string]any{"items": []string{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": parseBranches(out)})
}

func (s *Server) handleGitDiff(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	path := r.URL.Query().Get("path")
	args := []string{"git", "diff"}
	if r.URL.Query().Get("staged") == "true" {
		args = append(args, "--cached")
	}
	if path != "" {
		args = append(args, "--", path)
	}
	out, _, _, err := s.execOut(r.Context(), rt, ws.ProjectID, args...)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"diff": out})
}

func (s *Server) handleGitInit(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	_, errOut, exit, err := s.execOut(r.Context(), rt, ws.ProjectID, "git", "init", "-b", "main")
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if exit != 0 {
		// Older git without -b support: retry plain init.
		if _, errOut2, exit2, err2 := s.execOut(r.Context(), rt, ws.ProjectID, "git", "init"); err2 == nil && exit2 == 0 {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true})
			return
		} else if errOut2 != "" {
			errOut = errOut2
		}
		writeError(w, http.StatusBadRequest, gitErr("git init failed", errOut))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleGitStage(w http.ResponseWriter, r *http.Request) {
	s.gitStageOp(w, r, true)
}

func (s *Server) handleGitUnstage(w http.ResponseWriter, r *http.Request) {
	s.gitStageOp(w, r, false)
}

// gitStageOp stages (git add) or unstages (git restore --staged) the given
// paths, or all paths when none are supplied.
func (s *Server) gitStageOp(w http.ResponseWriter, r *http.Request, stage bool) {
	var body struct {
		Paths []string `json:"paths"`
	}
	_ = decodeJSON(r, &body)
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	var args []string
	if stage {
		args = []string{"git", "add", "--"}
		if len(body.Paths) == 0 {
			args = []string{"git", "add", "-A"}
		} else {
			args = append(args, body.Paths...)
		}
	} else {
		args = []string{"git", "restore", "--staged", "--"}
		if len(body.Paths) == 0 {
			args = []string{"git", "restore", "--staged", "."}
		} else {
			args = append(args, body.Paths...)
		}
	}
	_, errOut, exit, err := s.execOut(r.Context(), rt, ws.ProjectID, args...)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if exit != 0 {
		writeError(w, http.StatusBadRequest, gitErr("git stage operation failed", errOut))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleGitCommit(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Message string   `json:"message"`
		Paths   []string `json:"paths"`
		Amend   bool     `json:"amend"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if strings.TrimSpace(body.Message) == "" {
		writeError(w, http.StatusBadRequest, "commit message is required")
		return
	}
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	// Optionally stage specific paths first.
	if len(body.Paths) > 0 {
		add := append([]string{"git", "add", "--"}, body.Paths...)
		if _, errOut, exit, err := s.execOut(r.Context(), rt, ws.ProjectID, add...); err != nil {
			s.fail(w, r, err)
			return
		} else if exit != 0 {
			writeError(w, http.StatusBadRequest, gitErr("git add failed", errOut))
			return
		}
	}
	// Identity comes from the authenticated user; set per-invocation so we never
	// depend on container-global git config.
	author := s.gitAuthor(r.Context(), userID(r))
	args := []string{
		"git",
		"-c", "user.name=" + author,
		"-c", "user.email=" + author,
		"commit", "-m", body.Message,
	}
	if body.Amend {
		args = append(args, "--amend")
	}
	out, errOut, exit, err := s.execOut(r.Context(), rt, ws.ProjectID, args...)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if exit != 0 {
		msg := errOut
		if msg == "" {
			msg = out
		}
		writeError(w, http.StatusBadRequest, gitErr("git commit failed", msg))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleGitCreateBranch(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, "branch name is required")
		return
	}
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	_, errOut, exit, err := s.execOut(r.Context(), rt, ws.ProjectID, "git", "checkout", "-b", body.Name)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if exit != 0 {
		writeError(w, http.StatusBadRequest, gitErr("could not create branch", errOut))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleGitCheckout(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Branch string `json:"branch"`
	}
	if err := decodeJSON(r, &body); err != nil || strings.TrimSpace(body.Branch) == "" {
		writeError(w, http.StatusBadRequest, "branch is required")
		return
	}
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	_, errOut, exit, err := s.execOut(r.Context(), rt, ws.ProjectID, "git", "checkout", body.Branch)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if exit != 0 {
		writeError(w, http.StatusBadRequest, gitErr("could not switch branch", errOut))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleGitPush(w http.ResponseWriter, r *http.Request) { s.gitRemoteOp(w, r, "push") }
func (s *Server) handleGitPull(w http.ResponseWriter, r *http.Request) { s.gitRemoteOp(w, r, "pull") }

// gitRemoteOp runs push/pull honestly: it forwards the real git result. Remote
// auth (a configured remote + credentials) is the user's responsibility; when
// it's missing git fails and we surface that error rather than faking success.
func (s *Server) gitRemoteOp(w http.ResponseWriter, r *http.Request, op string) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	out, errOut, exit, err := s.execOut(r.Context(), rt, ws.ProjectID, "git", op)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if exit != 0 {
		msg := errOut
		if msg == "" {
			msg = out
		}
		writeError(w, http.StatusBadRequest, gitErr("git "+op+" failed", msg))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "output": out + errOut})
}

// gitAuthor returns a git identity for commits — the user's email (always
// present, unique), used for both name and email.
func (s *Server) gitAuthor(ctx context.Context, uid string) string {
	var email string
	if err := s.pool.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, uid).Scan(&email); err != nil || email == "" {
		return "torsor@torsor.dev"
	}
	return email
}

// gitErr trims git's stderr into a single-line, user-facing message.
func gitErr(prefix, stderr string) string {
	msg := strings.TrimSpace(stderr)
	if msg == "" {
		return prefix
	}
	if i := strings.IndexByte(msg, '\n'); i >= 0 {
		msg = msg[:i]
	}
	return prefix + ": " + msg
}
