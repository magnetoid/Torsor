// Package verify gives the coding agent eyes: it drives a real headless browser (Chromium
// via the DevTools protocol) against the project's running app and returns a compact,
// agent-readable report — page title, console errors, uncaught exceptions, failed network
// requests, and a count of interactive elements. This is the self-verification loop:
// the agent builds, then *looks at* what it built, instead of assuming it works.
//
// The CDP client is deliberately minimal (one file, no new dependencies beyond the
// gorilla/websocket the repo already uses): Torsor needs navigate + observe + evaluate,
// not the full protocol surface, and the chromedp module tree would add ~35MB of generated
// bindings for capabilities the loop never touches (ADR 0010's "disproportionate bloat"
// exception — decision recorded).
package verify

import (
	"fmt"
	"strings"
)

// Report is what the browser saw at a URL. Every field is bounded so the formatted
// observation stays small enough to feed back to a model.
type Report struct {
	URL            string
	Title          string
	ConsoleErrors  []string // console.error/warn lines emitted by the page
	PageErrors     []string // uncaught exceptions / unhandled rejections
	FailedRequests []string // network fetches that failed or returned >= 400
	Buttons        int      // interactive elements seen (buttons + links + inputs)
	TextHead       string   // first visible body text (whitespace-collapsed)
	EvalResult     string   // result of the optional agent-supplied JS expression
}

const (
	maxListEntries = 12
	maxLineLen     = 300
	maxTextHead    = 500
)

// clip bounds one captured line.
func clip(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > maxLineLen {
		return s[:maxLineLen] + "…"
	}
	return s
}

// addBounded appends line to list unless the list is full (keeps reports small).
func addBounded(list []string, line string) []string {
	if len(list) >= maxListEntries || strings.TrimSpace(line) == "" {
		return list
	}
	return append(list, clip(line))
}

// Format renders the report as the observation text fed back to the agent. It leads with
// the verdict signal (errors or clean) because models weight the head of an observation.
func (r Report) Format() string {
	var b strings.Builder
	problems := len(r.ConsoleErrors) + len(r.PageErrors) + len(r.FailedRequests)
	if problems == 0 {
		b.WriteString("BROWSER CHECK OK — page loaded with no console errors, no uncaught exceptions, no failed requests.\n")
	} else {
		fmt.Fprintf(&b, "BROWSER CHECK FOUND %d PROBLEM(S):\n", problems)
	}
	fmt.Fprintf(&b, "url=%s\ntitle=%q\ninteractive_elements=%d\n", r.URL, r.Title, r.Buttons)
	writeList := func(name string, items []string) {
		if len(items) == 0 {
			return
		}
		fmt.Fprintf(&b, "%s:\n", name)
		for _, it := range items {
			fmt.Fprintf(&b, "  - %s\n", it)
		}
	}
	writeList("page_errors (uncaught exceptions)", r.PageErrors)
	writeList("console_errors", r.ConsoleErrors)
	writeList("failed_requests", r.FailedRequests)
	if r.EvalResult != "" {
		fmt.Fprintf(&b, "js_eval_result: %s\n", clip(r.EvalResult))
	}
	if r.TextHead != "" {
		fmt.Fprintf(&b, "visible_text_head: %s\n", r.TextHead)
	}
	if r.Buttons == 0 {
		b.WriteString("note: ZERO interactive elements were found — if this app should have buttons/links/forms, the UI may be a static shell (check that handlers and data are real).\n")
	}
	return b.String()
}
