package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
	"github.com/magnetoid/torsor/control-plane/internal/verify"
)

// Self-verification wiring: the browser-based verify_app agent tool (internal/verify) and
// the live-preview error bridge (the IDE forwards console errors it captured from the
// preview iframe; the agent reads them via read_preview_errors). Together these close the
// loop where the agent can SEE the running app — both through its own headless browser and
// through the user's actual preview session.

// --- preview error bridge ----------------------------------------------------------------

// previewErr is one console error/warning captured in the user's live preview.
type previewErr struct {
	Level string    `json:"level"` // "error" | "warn"
	Text  string    `json:"text"`
	At    time.Time `json:"at"`
}

// previewErrRing is a small bounded buffer of recent preview errors for one project.
// In-process state (like mission cancels): single backend today, documented in SCALING.md.
type previewErrRing struct {
	mu    sync.Mutex
	items []previewErr
}

const previewErrCap = 100

func (r *previewErrRing) push(e previewErr) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.items = append(r.items, e)
	if len(r.items) > previewErrCap {
		r.items = r.items[len(r.items)-previewErrCap:]
	}
}

func (r *previewErrRing) snapshot() []previewErr {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]previewErr, len(r.items))
	copy(out, r.items)
	return out
}

// previewRing returns (creating if needed) the ring for a project.
func (s *Server) previewRing(projectID string) *previewErrRing {
	v, _ := s.previewErrs.LoadOrStore(projectID, &previewErrRing{})
	return v.(*previewErrRing)
}

// handlePushPreviewErrors ingests console errors the IDE captured from the live preview
// iframe. Ownership-scoped; entries are bounded per project and kept in memory only.
func (s *Server) handlePushPreviewErrors(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	var body struct {
		Items []struct {
			Level string `json:"level"`
			Text  string `json:"text"`
		} `json:"items"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	ring := s.previewRing(projectID)
	accepted := 0
	for _, it := range body.Items {
		text := strings.TrimSpace(it.Text)
		if text == "" {
			continue
		}
		if len(text) > 500 {
			text = text[:500]
		}
		level := "error"
		if it.Level == "warn" {
			level = "warn"
		}
		ring.push(previewErr{Level: level, Text: text, At: time.Now()})
		accepted++
		if accepted >= 20 { // bound one request's contribution
			break
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"accepted": accepted})
}

// previewErrorsTool builds the agent's read_preview_errors tool for one project.
func (s *Server) previewErrorsTool(projectID string) func(context.Context) (string, error) {
	return func(_ context.Context) (string, error) {
		items := s.previewRing(projectID).snapshot()
		if len(items) == 0 {
			return "no preview errors captured (either the app is clean, or the user hasn't opened the live preview)", nil
		}
		// Most recent last; cap what we feed back.
		if len(items) > 20 {
			items = items[len(items)-20:]
		}
		var b strings.Builder
		fmt.Fprintf(&b, "%d recent preview error(s) from the user's live preview session:\n", len(items))
		for _, it := range items {
			fmt.Fprintf(&b, "[%s %s] %s\n", it.At.Format("15:04:05"), it.Level, it.Text)
		}
		return b.String(), nil
	}
}

// --- browser verification tool -----------------------------------------------------------

// verifyBrowser lazily locates the headless browser once per process. A missing browser is
// not an error — verify_app degrades to an honest observation telling the agent to rely on
// check_app instead (the tool stays advertised so behavior is consistent across hosts).
func (s *Server) verifyBrowser() *verify.Browser {
	s.browserOnce.Do(func() {
		if path := verify.FindBrowser(); path != "" {
			s.browser = verify.NewBrowser(path)
			s.logger.Info("verify: headless browser available", "path", path)
		} else {
			s.logger.Info("verify: no headless browser found; verify_app will degrade (set TORSOR_BROWSER_PATH)")
		}
	})
	return s.browser
}

// verifyAppTool builds the agent's verify_app tool: a real headless-browser check against
// the workspace's live preview target. Failures come back as observation text (nil error)
// so the agent reacts and fixes rather than aborting the run.
func (s *Server) verifyAppTool(rt plugin.WorkspaceRuntime, projectID string) func(ctx context.Context, js string) (string, error) {
	return func(ctx context.Context, js string) (string, error) {
		st, err := rt.StatusWorkspace(ctx, projectID)
		if err != nil {
			return "app status unavailable: " + err.Error(), nil
		}
		if st.PreviewHost == "" || st.PreviewPort == 0 {
			return "app is not reachable yet: the workspace exposes no preview address. Start the dev server with the run tool (in the background) and try again.", nil
		}
		b := s.verifyBrowser()
		if b == nil {
			return "no headless browser is installed on this host, so a full browser check is unavailable — use check_app to verify the app responds over HTTP instead.", nil
		}
		rep, err := b.Check(ctx, fmt.Sprintf("http://%s:%d/", st.PreviewHost, st.PreviewPort), js)
		if err != nil {
			return "browser check failed to run: " + err.Error() + " — fall back to check_app.", nil
		}
		return rep.Format(), nil
	}
}
