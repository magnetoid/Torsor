package agent

import (
	"fmt"
	"strings"
)

// Deterministic transcript compaction — the guard against "context rot" on long runs.
// Every tool exchange is stored twice: the full text and a one-line digest. Rendering
// includes as many recent exchanges verbatim as the budget allows; everything older
// collapses to its digest line. Deterministic (no model call, no cost, no drift) and the
// pinned header (task + approved plan) plus spec files in the workspace remain the ground
// truth the compacted history points back to.

// exchange is one turn's contribution to the transcript.
type exchange struct {
	full   string // verbatim rendering (action + observation, or a system note)
	digest string // one-line summary used once the exchange ages out of the budget
}

type transcriptLog struct {
	items []exchange
}

// addExchange records a tool action + its observation.
func (l *transcriptLog) addExchange(a action, observation string) {
	args := fmt.Sprintf("%v", a.Args)
	if len(args) > 120 {
		args = args[:120] + "…"
	}
	l.items = append(l.items, exchange{
		full:   fmt.Sprintf("\nAction: %s %v\nObservation: %s\n", a.Tool, a.Args, observation),
		digest: fmt.Sprintf("- %s %s -> %s\n", a.Tool, args, digestObservation(a.Tool, observation)),
	})
}

// addNote records a system nudge (parse error, protocol reminder).
func (l *transcriptLog) addNote(note string) {
	l.items = append(l.items, exchange{full: "\n" + note + "\n", digest: "- (system) " + firstLineOf(note, 100) + "\n"})
}

// render returns the transcript within budget: oldest exchanges as digest lines under an
// "Earlier actions (compacted)" heading, the newest verbatim. The most recent exchange is
// always verbatim regardless of budget (the model must see its own last observation).
func (l *transcriptLog) render(budget int) string {
	if len(l.items) == 0 {
		return ""
	}
	// Walk backwards accumulating verbatim exchanges until the budget is spent.
	size := 0
	keep := len(l.items) // index of the first verbatim exchange
	for i := len(l.items) - 1; i >= 0; i-- {
		size += len(l.items[i].full)
		if size > budget && keep < len(l.items) { // always keep >= 1 verbatim
			break
		}
		keep = i
	}
	var b strings.Builder
	if keep > 0 {
		b.WriteString("\nEarlier actions (compacted — full output no longer shown):\n")
		for _, it := range l.items[:keep] {
			b.WriteString(it.digest)
		}
	}
	for _, it := range l.items[keep:] {
		b.WriteString(it.full)
	}
	return b.String()
}

// digestObservation compresses an observation to a short outcome tag per tool.
func digestObservation(tool, obs string) string {
	switch {
	case strings.HasPrefix(obs, "error:"):
		return firstLineOf(obs, 80)
	case tool == "run":
		// exit code is the first line ("exit=N").
		return firstLineOf(obs, 40)
	case tool == "write_file":
		return firstLineOf(obs, 60) // "wrote N bytes to path"
	case tool == "verify_app":
		return firstLineOf(obs, 80) // verdict line leads the report
	default:
		return fmt.Sprintf("(%d bytes)", len(obs))
	}
}

func firstLineOf(s string, max int) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i]
	}
	if len(s) > max {
		s = s[:max] + "…"
	}
	return s
}
