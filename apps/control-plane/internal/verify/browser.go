package verify

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// Browser drives a headless Chromium over the DevTools protocol. One Browser is safe for
// concurrent Check calls (each opens its own tab); the zero value is not usable — use
// NewBrowser.
type Browser struct {
	path string // chromium/chrome executable
}

// candidatePaths are probed (in order) when TORSOR_BROWSER_PATH is unset. Covers the
// alpine package (control-plane image), common Linux installs, and macOS for local dev.
var candidatePaths = []string{
	"/usr/bin/chromium-browser",
	"/usr/bin/chromium",
	"/usr/bin/google-chrome",
	"/usr/bin/google-chrome-stable",
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
}

// FindBrowser locates a usable browser binary: TORSOR_BROWSER_PATH wins, then well-known
// locations, then $PATH. Returns "" when none is found (the verify tool then degrades to
// an honest "no browser available" observation).
func FindBrowser() string {
	if p := strings.TrimSpace(os.Getenv("TORSOR_BROWSER_PATH")); p != "" {
		return p
	}
	for _, p := range candidatePaths {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	for _, name := range []string{"chromium-browser", "chromium", "google-chrome", "google-chrome-stable"} {
		if p, err := exec.LookPath(name); err == nil {
			return p
		}
	}
	return ""
}

// NewBrowser returns a Browser using the given executable path.
func NewBrowser(path string) *Browser { return &Browser{path: path} }

// Check launches the browser, loads url, observes it for settle (console/network/errors),
// optionally evaluates js (an expression; its stringified value lands in EvalResult), and
// returns the Report. The browser process is always torn down before returning.
func (b *Browser) Check(ctx context.Context, url, js string) (Report, error) {
	if b == nil || b.path == "" {
		return Report{}, errors.New("no browser configured")
	}
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	userDir, err := os.MkdirTemp("", "torsor-verify-*")
	if err != nil {
		return Report{}, err
	}
	defer os.RemoveAll(userDir)

	// --remote-debugging-port=0 lets the OS pick a free port; the chosen ws:// endpoint is
	// printed on stderr. Flags follow the containers/headless best-practice set.
	cmd := exec.CommandContext(ctx, b.path,
		"--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
		"--no-first-run", "--no-default-browser-check", "--mute-audio",
		"--user-data-dir="+userDir, "--remote-debugging-port=0", "about:blank")
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return Report{}, err
	}
	if err := cmd.Start(); err != nil {
		return Report{}, fmt.Errorf("launch browser: %w", err)
	}
	defer func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}()

	wsURL, err := readDevtoolsURL(ctx, stderr)
	if err != nil {
		return Report{}, err
	}
	c, err := dialCDP(ctx, wsURL)
	if err != nil {
		return Report{}, err
	}
	defer c.close()

	return c.checkPage(ctx, url, js)
}

// readDevtoolsURL scans the browser's stderr for the "DevTools listening on ws://…" line.
func readDevtoolsURL(ctx context.Context, r interface{ Read([]byte) (int, error) }) (string, error) {
	type res struct {
		url string
		err error
	}
	ch := make(chan res, 1)
	go func() {
		sc := bufio.NewScanner(r)
		for sc.Scan() {
			line := sc.Text()
			if i := strings.Index(line, "ws://"); i >= 0 && strings.Contains(line, "DevTools listening") {
				ch <- res{url: strings.TrimSpace(line[i:])}
				return
			}
		}
		ch <- res{err: errors.New("browser exited before advertising a DevTools endpoint")}
	}()
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case r := <-ch:
		return r.url, r.err
	}
}

// --- minimal CDP client -----------------------------------------------------------------

// cdpMsg is a DevTools protocol frame (command, reply, or event).
type cdpMsg struct {
	ID        int64           `json:"id,omitempty"`
	Method    string          `json:"method,omitempty"`
	Params    json.RawMessage `json:"params,omitempty"`
	SessionID string          `json:"sessionId,omitempty"`
	Result    json.RawMessage `json:"result,omitempty"`
	Error     *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type cdpClient struct {
	conn    *websocket.Conn
	nextID  atomic.Int64
	mu      sync.Mutex // guards pending + write
	pending map[int64]chan cdpMsg
	events  chan cdpMsg
	readErr chan error
}

func dialCDP(ctx context.Context, wsURL string) (*cdpClient, error) {
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("dial devtools: %w", err)
	}
	c := &cdpClient{
		conn:    conn,
		pending: map[int64]chan cdpMsg{},
		events:  make(chan cdpMsg, 256),
		readErr: make(chan error, 1),
	}
	go c.readLoop()
	return c, nil
}

func (c *cdpClient) close() { _ = c.conn.Close() }

func (c *cdpClient) readLoop() {
	for {
		var m cdpMsg
		if err := c.conn.ReadJSON(&m); err != nil {
			c.readErr <- err
			close(c.events)
			return
		}
		if m.ID != 0 {
			c.mu.Lock()
			ch := c.pending[m.ID]
			delete(c.pending, m.ID)
			c.mu.Unlock()
			if ch != nil {
				ch <- m
			}
			continue
		}
		// Event: drop (rather than block) if the consumer is behind — reports are bounded
		// anyway, and stalling the read loop would deadlock command replies.
		select {
		case c.events <- m:
		default:
		}
	}
}

// call sends one CDP command (optionally session-scoped) and waits for its reply.
func (c *cdpClient) call(ctx context.Context, sessionID, method string, params any) (json.RawMessage, error) {
	id := c.nextID.Add(1)
	var raw json.RawMessage
	if params != nil {
		b, err := json.Marshal(params)
		if err != nil {
			return nil, err
		}
		raw = b
	}
	ch := make(chan cdpMsg, 1)
	c.mu.Lock()
	c.pending[id] = ch
	err := c.conn.WriteJSON(cdpMsg{ID: id, Method: method, Params: raw, SessionID: sessionID})
	c.mu.Unlock()
	if err != nil {
		return nil, err
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case err := <-c.readErr:
		return nil, fmt.Errorf("devtools connection lost: %w", err)
	case m := <-ch:
		if m.Error != nil {
			return nil, fmt.Errorf("%s: %s", method, m.Error.Message)
		}
		return m.Result, nil
	}
}

// checkPage opens a fresh tab, navigates to url, collects console/error/network events
// until the page settles, evaluates js if given, and assembles the Report.
func (c *cdpClient) checkPage(ctx context.Context, url, js string) (Report, error) {
	rep := Report{URL: url}

	// Open a tab and attach (flat session mode: subsequent commands carry sessionId).
	res, err := c.call(ctx, "", "Target.createTarget", map[string]any{"url": "about:blank"})
	if err != nil {
		return rep, err
	}
	var tgt struct {
		TargetID string `json:"targetId"`
	}
	_ = json.Unmarshal(res, &tgt)
	res, err = c.call(ctx, "", "Target.attachToTarget", map[string]any{"targetId": tgt.TargetID, "flatten": true})
	if err != nil {
		return rep, err
	}
	var att struct {
		SessionID string `json:"sessionId"`
	}
	_ = json.Unmarshal(res, &att)
	sid := att.SessionID

	for _, domain := range []string{"Page.enable", "Runtime.enable", "Network.enable", "Log.enable"} {
		if _, err := c.call(ctx, sid, domain, nil); err != nil {
			return rep, err
		}
	}
	if _, err := c.call(ctx, sid, "Page.navigate", map[string]any{"url": url}); err != nil {
		return rep, err
	}

	// Observe events until load + a settle window (SPAs render after load), bounded overall.
	loaded := false
	settle := time.NewTimer(12 * time.Second) // absolute cap while waiting for load
	defer settle.Stop()
	requestURLs := map[string]string{} // requestId -> url (to label network failures)

observe:
	for {
		select {
		case <-ctx.Done():
			return rep, ctx.Err()
		case err := <-c.readErr:
			return rep, fmt.Errorf("devtools connection lost: %w", err)
		case <-settle.C:
			break observe
		case ev, ok := <-c.events:
			if !ok {
				break observe
			}
			if ev.SessionID != sid {
				continue
			}
			switch ev.Method {
			case "Page.loadEventFired":
				if !loaded {
					loaded = true
					// Give the app a short post-load window to render and log.
					settle.Reset(1500 * time.Millisecond)
				}
			case "Runtime.consoleAPICalled":
				var p struct {
					Type string `json:"type"`
					Args []struct {
						Value       any    `json:"value"`
						Description string `json:"description"`
					} `json:"args"`
				}
				_ = json.Unmarshal(ev.Params, &p)
				if p.Type != "error" && p.Type != "warning" {
					continue
				}
				parts := make([]string, 0, len(p.Args))
				for _, a := range p.Args {
					if a.Description != "" {
						parts = append(parts, a.Description)
					} else if a.Value != nil {
						parts = append(parts, fmt.Sprintf("%v", a.Value))
					}
				}
				rep.ConsoleErrors = addBounded(rep.ConsoleErrors, p.Type+": "+strings.Join(parts, " "))
			case "Runtime.exceptionThrown":
				var p struct {
					ExceptionDetails struct {
						Text      string `json:"text"`
						Exception struct {
							Description string `json:"description"`
						} `json:"exception"`
					} `json:"exceptionDetails"`
				}
				_ = json.Unmarshal(ev.Params, &p)
				line := p.ExceptionDetails.Exception.Description
				if line == "" {
					line = p.ExceptionDetails.Text
				}
				rep.PageErrors = addBounded(rep.PageErrors, line)
			case "Network.requestWillBeSent":
				var p struct {
					RequestID string `json:"requestId"`
					Request   struct {
						URL string `json:"url"`
					} `json:"request"`
				}
				_ = json.Unmarshal(ev.Params, &p)
				requestURLs[p.RequestID] = p.Request.URL
			case "Network.loadingFailed":
				var p struct {
					RequestID string `json:"requestId"`
					ErrorText string `json:"errorText"`
					Canceled  bool   `json:"canceled"`
				}
				_ = json.Unmarshal(ev.Params, &p)
				if p.Canceled {
					continue
				}
				rep.FailedRequests = addBounded(rep.FailedRequests, requestURLs[p.RequestID]+" — "+p.ErrorText)
			case "Network.responseReceived":
				var p struct {
					Response struct {
						Status int    `json:"status"`
						URL    string `json:"url"`
					} `json:"response"`
				}
				_ = json.Unmarshal(ev.Params, &p)
				if p.Response.Status >= 400 {
					rep.FailedRequests = addBounded(rep.FailedRequests, fmt.Sprintf("%s — HTTP %d", p.Response.URL, p.Response.Status))
				}
			}
		}
	}

	// Page audit: title, visible text head, interactive-element count — one evaluate call.
	rep.Title, rep.TextHead, rep.Buttons = c.audit(ctx, sid)

	// Optional agent-supplied expression (e.g. probing app state or clicking through a flow).
	if strings.TrimSpace(js) != "" {
		rep.EvalResult = c.eval(ctx, sid, js)
	}

	_, _ = c.call(ctx, "", "Target.closeTarget", map[string]any{"targetId": tgt.TargetID})
	return rep, nil
}

// audit extracts title/text/interactive-count from the loaded page.
func (c *cdpClient) audit(ctx context.Context, sid string) (title, textHead string, buttons int) {
	const auditJS = `JSON.stringify({
		t: document.title,
		x: (document.body ? document.body.innerText : "").replace(/\s+/g, " ").slice(0, 500),
		b: document.querySelectorAll("button, a[href], input, select, textarea, [role=button], [onclick]").length
	})`
	out := c.eval(ctx, sid, auditJS)
	var a struct {
		T string `json:"t"`
		X string `json:"x"`
		B int    `json:"b"`
	}
	if err := json.Unmarshal([]byte(out), &a); err != nil {
		return "", "", 0
	}
	if len(a.X) > maxTextHead {
		a.X = a.X[:maxTextHead]
	}
	return a.T, strings.TrimSpace(a.X), a.B
}

// eval runs a JS expression in the page and returns its stringified value ("" on failure).
func (c *cdpClient) eval(ctx context.Context, sid, expr string) string {
	res, err := c.call(ctx, sid, "Runtime.evaluate", map[string]any{
		"expression": expr, "returnByValue": true, "awaitPromise": true, "timeout": 8000,
	})
	if err != nil {
		return "eval error: " + err.Error()
	}
	var p struct {
		Result struct {
			Value       any    `json:"value"`
			Description string `json:"description"`
		} `json:"result"`
		ExceptionDetails *struct {
			Text string `json:"text"`
		} `json:"exceptionDetails"`
	}
	if err := json.Unmarshal(res, &p); err != nil {
		return ""
	}
	if p.ExceptionDetails != nil {
		return "eval exception: " + p.ExceptionDetails.Text
	}
	switch v := p.Result.Value.(type) {
	case nil:
		return p.Result.Description
	case string:
		return v
	default:
		b, _ := json.Marshal(v)
		return string(b)
	}
}
