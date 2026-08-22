// Package applog makes the control plane's diagnostics durable and queryable.
//
// The service already logged well — structured slog JSON on stdout. The problem was reach: on
// a container host that output is gone the moment the container is replaced, an operator needs
// shell access to read it, and it contains nothing at all from the browser, where a large
// share of user-visible breakage happens.
//
// This package adds a slog.Handler that tees records into Postgres. Because it wraps the
// existing logger, every `logger.Error(...)` already written across the codebase becomes
// durable with no call-site changes — including s.fail, which logs every 500 with its route.
package applog

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"

	"sync/atomic"
	"time"
)

// Entry is one row destined for app_logs. It is the boundary between "a log record" and "a
// database write", so the writer can be swapped (and faked in tests).
type Entry struct {
	Time      time.Time
	Level     string
	Source    string
	Message   string
	Logger    string
	RequestID string
	UserID    string
	ProjectID string
	Method    string
	Route     string
	Status    int
	Duration  int
	Error     string
	Stack     string
	Fields    map[string]any
	Release   string
	IP        string
	UserAgent string
}

// Writer persists entries. Implemented by the Postgres sink; faked in tests.
type Writer interface {
	Write(ctx context.Context, batch []Entry) error
}

// sensitiveKeys are attribute names whose values must never reach the database.
//
// This matters more here than in stdout logging: app_logs is readable through a web UI by any
// super admin, and is retained. A logging system powerful enough to capture everything is
// exactly the kind that quietly turns into a credential store.
var sensitiveKeys = []string{
	"password", "passwd", "secret", "token", "authorization", "auth",
	"api_key", "apikey", "key", "cookie", "session", "jwt", "credential",
	"access_token", "refresh_token", "private",
}

const redacted = "[redacted]"

// isSensitive matches on substring, not equality: real attribute names are things like
// "github_access_token" and "userApiKey", which an exact-match list would miss.
func isSensitive(key string) bool {
	k := strings.ToLower(key)
	for _, s := range sensitiveKeys {
		if strings.Contains(k, s) {
			return true
		}
	}
	return false
}

// Redact returns a copy of fields with sensitive values replaced. Nested maps are walked,
// because a redacted top level means nothing if the token is one level down in a struct that
// was logged wholesale.
func Redact(fields map[string]any) map[string]any {
	if fields == nil {
		return nil
	}
	out := make(map[string]any, len(fields))
	for k, v := range fields {
		if isSensitive(k) {
			out[k] = redacted
			continue
		}
		if nested, ok := v.(map[string]any); ok {
			out[k] = Redact(nested)
			continue
		}
		out[k] = v
	}
	return out
}

// Handler is a slog.Handler that forwards to a next handler (stdout) and, for records at or
// above minLevel, queues a row for the database.
//
// Two properties are non-negotiable. Logging must never block a request: the queue is buffered
// and a full queue drops rather than waits, because stalling the server to record that the
// server is unwell is the wrong trade. And logging must never panic a request: a failing sink
// is counted, not propagated.
type Handler struct {
	next     slog.Handler
	minLevel slog.Level
	queue    chan Entry
	release  string
	attrs    []slog.Attr
	group    string

	dropped atomic.Uint64
	failed  atomic.Uint64
}

// HandlerOptions configures the database tee.
type HandlerOptions struct {
	// MinLevel is the threshold for persistence (stdout still gets everything the wrapped
	// handler accepts). Defaults to Warn: info-level request chatter would swamp the table
	// and make it useless for finding faults.
	MinLevel slog.Level
	// Buffer is the queue depth. Defaults to 1024.
	Buffer int
	// Release tags rows so logs from different deploys are distinguishable.
	Release string
}

// NewHandler wraps next and starts the background writer. Cancel ctx to stop it; Close flushes.
func NewHandler(ctx context.Context, next slog.Handler, w Writer, opts HandlerOptions) *Handler {
	if opts.Buffer <= 0 {
		opts.Buffer = 1024
	}
	if opts.MinLevel == 0 {
		opts.MinLevel = slog.LevelWarn
	}
	h := &Handler{
		next:     next,
		minLevel: opts.MinLevel,
		queue:    make(chan Entry, opts.Buffer),
		release:  opts.Release,
	}
	go h.run(ctx, w)
	return h
}

// run batches queued entries. Batching is what keeps a burst of errors — the exact moment the
// database is least happy — from becoming one INSERT per error.
func (h *Handler) run(ctx context.Context, w Writer) {
	const maxBatch = 64
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	batch := make([]Entry, 0, maxBatch)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		// Detached from ctx: a shutdown must still get its last batch written.
		wctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		if err := w.Write(wctx, batch); err != nil {
			h.failed.Add(uint64(len(batch)))
		}
		cancel()
		batch = batch[:0]
	}

	for {
		select {
		case <-ctx.Done():
			// Drain what is already queued before giving up.
			for {
				select {
				case e := <-h.queue:
					batch = append(batch, e)
					if len(batch) >= maxBatch {
						flush()
					}
				default:
					flush()
					return
				}
			}
		case e := <-h.queue:
			batch = append(batch, e)
			if len(batch) >= maxBatch {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

// Stats reports what the tee lost, so the console can admit to gaps rather than presenting a
// truncated log as complete.
func (h *Handler) Stats() (dropped, failed uint64) {
	return h.dropped.Load(), h.failed.Load()
}

func (h *Handler) Enabled(ctx context.Context, l slog.Level) bool { return h.next.Enabled(ctx, l) }

func (h *Handler) WithAttrs(attrs []slog.Attr) slog.Handler {
	c := h.clone()
	c.next = h.next.WithAttrs(attrs)
	c.attrs = append(append([]slog.Attr{}, h.attrs...), attrs...)
	return c
}

func (h *Handler) WithGroup(name string) slog.Handler {
	c := h.clone()
	c.next = h.next.WithGroup(name)
	c.group = name
	return c
}

// clone shares the queue and counters with the parent on purpose: WithAttrs/WithGroup produce
// a view of the same sink, not a second one.
func (h *Handler) clone() *Handler {
	return &Handler{
		next: h.next, minLevel: h.minLevel, queue: h.queue,
		release: h.release, attrs: h.attrs, group: h.group,
	}
}

// Handle always forwards to stdout first, so a database problem can never cost us the console
// line as well.
func (h *Handler) Handle(ctx context.Context, r slog.Record) error {
	err := h.next.Handle(ctx, r)
	if r.Level < h.minLevel {
		return err
	}

	e := Entry{
		Time:    r.Time,
		Level:   levelName(r.Level),
		Source:  "backend",
		Message: r.Message,
		Release: h.release,
		Fields:  map[string]any{},
	}
	for _, a := range h.attrs {
		applyAttr(&e, a)
	}
	r.Attrs(func(a slog.Attr) bool { applyAttr(&e, a); return true })
	e.Fields = Redact(e.Fields)
	if len(e.Fields) == 0 {
		e.Fields = map[string]any{}
	}

	select {
	case h.queue <- e:
	default:
		// Full queue: drop and count. Blocking here would make the logger the thing that takes
		// the service down.
		h.dropped.Add(1)
	}
	return err
}

// applyAttr promotes the attributes the schema has real columns for and puts the rest in
// fields. The promoted set matches what the codebase already logs (req_id, path, err, …), so
// existing call sites populate the structured columns without being rewritten.
func applyAttr(e *Entry, a slog.Attr) {
	v := a.Value.Resolve()
	switch strings.ToLower(a.Key) {
	case "req_id", "request_id", "requestid":
		e.RequestID = v.String()
	case "user_id", "userid", "uid":
		e.UserID = v.String()
	case "project", "project_id", "projectid":
		e.ProjectID = v.String()
	case "method":
		e.Method = v.String()
	case "path", "route":
		e.Route = v.String()
	case "status":
		e.Status = int(toInt(v))
	case "dur_ms", "duration_ms":
		e.Duration = int(toInt(v))
	case "err", "error":
		e.Error = v.String()
	case "stack":
		e.Stack = v.String()
	case "logger", "component":
		e.Logger = v.String()
	default:
		if v.Kind() == slog.KindGroup {
			g := map[string]any{}
			for _, ga := range v.Group() {
				g[ga.Key] = ga.Value.Resolve().Any()
			}
			e.Fields[a.Key] = g
			return
		}
		e.Fields[a.Key] = v.Any()
	}
}

func toInt(v slog.Value) int64 {
	switch v.Kind() {
	case slog.KindInt64:
		return v.Int64()
	case slog.KindUint64:
		return int64(v.Uint64())
	case slog.KindFloat64:
		return int64(v.Float64())
	default:
		return 0
	}
}

func levelName(l slog.Level) string {
	switch {
	case l >= slog.LevelError:
		return "error"
	case l >= slog.LevelWarn:
		return "warn"
	case l >= slog.LevelInfo:
		return "info"
	default:
		return "debug"
	}
}

// MarshalFields renders fields for a jsonb column, degrading to an empty object rather than
// failing a write over an unserializable value.
func MarshalFields(f map[string]any) []byte {
	if len(f) == 0 {
		return []byte("{}")
	}
	b, err := json.Marshal(f)
	if err != nil {
		return []byte("{}")
	}
	return b
}

// Ingest is the entry point for logs that did not come from slog — currently the browser.
// It shares the same queue, batching, and redaction as backend records, so frontend and
// backend events are genuinely one stream rather than two systems that look alike.
func (h *Handler) Ingest(e Entry) {
	if e.Time.IsZero() {
		e.Time = time.Now()
	}
	if e.Source == "" {
		e.Source = "frontend"
	}
	if e.Release == "" {
		e.Release = h.release
	}
	e.Fields = Redact(e.Fields)
	if e.Fields == nil {
		e.Fields = map[string]any{}
	}
	select {
	case h.queue <- e:
	default:
		h.dropped.Add(1)
	}
}

// ensure the handler satisfies slog.Handler.
var _ slog.Handler = (*Handler)(nil)
