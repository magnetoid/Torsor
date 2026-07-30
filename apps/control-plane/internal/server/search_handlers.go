package server

// Workspace-wide text search: grep inside the project's owned container, so the
// IDE's global search (⌘⇧F) finds matches in files the editor has never opened.
// Ownership is enforced by loadWorkspace; output is bounded server-side.

import (
	"net/http"
	"strings"
)

type searchMatch struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Text string `json:"text"`
}

const searchMaxResults = 200

func (s *Server) handleWorkspaceSearch(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	var body struct {
		Query string `json:"query"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	query := strings.TrimSpace(body.Query)
	if query == "" {
		writeError(w, http.StatusBadRequest, "query is required")
		return
	}

	// Fixed-string, case-insensitive, line-numbered; vendored/build dirs excluded;
	// -m caps per-file matches so one noisy file can't eat the whole budget.
	out, _, _, err := s.execOut(r.Context(), rt, ws.ProjectID,
		"grep", "-rIn", "-i", "-F", "-m", "20",
		"--exclude-dir=node_modules", "--exclude-dir=.git", "--exclude-dir=dist",
		"--exclude-dir=build", "--exclude-dir=.next", "--exclude-dir=vendor",
		"--", query, ".")
	if err != nil {
		s.fail(w, r, err)
		return
	}

	items := parseGrepOutput(out, searchMaxResults)
	writeJSON(w, http.StatusOK, map[string]any{
		"items":     items,
		"truncated": len(items) >= searchMaxResults,
	})
}

// parseGrepOutput turns grep's "path:line:text" lines into structured matches,
// capped at limit. Pure function, unit-testable without a runtime.
func parseGrepOutput(out string, limit int) []searchMatch {
	items := []searchMatch{}
	for _, line := range strings.Split(strings.ReplaceAll(out, "\r\n", "\n"), "\n") {
		if len(items) >= limit {
			break
		}
		parts := strings.SplitN(line, ":", 3)
		if len(parts) != 3 {
			continue
		}
		lineNo := 0
		for _, ch := range parts[1] {
			if ch < '0' || ch > '9' {
				lineNo = -1
				break
			}
			lineNo = lineNo*10 + int(ch-'0')
		}
		if lineNo <= 0 {
			continue
		}
		path := strings.TrimPrefix(parts[0], "./")
		text := parts[2]
		if len(text) > 400 {
			text = text[:400]
		}
		items = append(items, searchMatch{Path: path, Line: lineNo, Text: text})
	}
	return items
}
