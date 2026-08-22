package applog

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"testing"
	"time"
)

type fakeWriter struct {
	mu      sync.Mutex
	entries []Entry
	err     error
}

func (f *fakeWriter) Write(_ context.Context, batch []Entry) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return f.err
	}
	f.entries = append(f.entries, batch...)
	return nil
}

func (f *fakeWriter) all() []Entry {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]Entry{}, f.entries...)
}

// waitFor polls until cond holds or the deadline passes. The writer is asynchronous by design,
// so tests must not assume a record has landed the instant it is logged.
func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for the log entry to be written")
}

func discardHandler() slog.Handler {
	return slog.NewJSONHandler(discard{}, &slog.HandlerOptions{Level: slog.LevelDebug})
}

type discard struct{}

func (discard) Write(p []byte) (int, error) { return len(p), nil }

// Redaction is the security-critical behaviour: app_logs is readable through a web UI and is
// retained, so a token that reaches it is a token at rest in a new place.
func TestRedactHidesSensitiveValues(t *testing.T) {
	in := map[string]any{
		"user":                "alice",
		"password":            "hunter2",
		"github_access_token": "ghp_secret",
		"userApiKey":          "sk-live-123",
		"Authorization":       "Bearer abc",
		"session_id":          "s-1",
		"nested":              map[string]any{"jwt": "eyJ...", "ok": "keep"},
		"count":               3,
	}
	out := Redact(in)

	for _, k := range []string{"password", "github_access_token", "userApiKey", "Authorization", "session_id"} {
		if out[k] != redacted {
			t.Errorf("%s = %v, want %q — substring matching must catch real-world key names", k, out[k], redacted)
		}
	}
	if out["user"] != "alice" || out["count"] != 3 {
		t.Error("non-sensitive values must survive redaction")
	}
	// A redacted top level is worthless if the token is one level down.
	nested, _ := out["nested"].(map[string]any)
	if nested["jwt"] != redacted {
		t.Errorf("nested jwt = %v, want redacted", nested["jwt"])
	}
	if nested["ok"] != "keep" {
		t.Error("nested non-sensitive values must survive")
	}
	// The input must not be mutated — the caller still owns it and may log it elsewhere.
	if in["password"] != "hunter2" {
		t.Error("Redact mutated its input")
	}
}

func TestRedactNilIsNil(t *testing.T) {
	if Redact(nil) != nil {
		t.Fatal("Redact(nil) should stay nil")
	}
}

func TestHandlerPersistsAtOrAboveMinLevel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w := &fakeWriter{}
	log := slog.New(NewHandler(ctx, discardHandler(), w, HandlerOptions{MinLevel: slog.LevelWarn, Buffer: 16}))

	log.Info("chatty request")   // below threshold — stdout only
	log.Warn("something odd")    // persisted
	log.Error("something broke") // persisted

	waitFor(t, func() bool { return len(w.all()) == 2 })
	got := w.all()
	if got[0].Message != "something odd" || got[0].Level != "warn" {
		t.Errorf("first entry = %+v, want the warn", got[0])
	}
	if got[1].Level != "error" {
		t.Errorf("second entry level = %q, want error", got[1].Level)
	}
	// Info must never be persisted at this threshold: app_logs is for faults, and request
	// chatter would swamp it.
	for _, e := range got {
		if e.Level == "info" {
			t.Error("info record was persisted despite MinLevel=warn")
		}
	}
}

// The promoted attribute names are exactly the ones the codebase already logs, which is what
// lets existing call sites fill the structured columns untouched.
func TestHandlerPromotesKnownAttributesToColumns(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w := &fakeWriter{}
	log := slog.New(NewHandler(ctx, discardHandler(), w, HandlerOptions{MinLevel: slog.LevelWarn, Buffer: 16}))

	log.Error("request error",
		"path", "/api/v1/projects/x/files",
		"err", "boom",
		"req_id", "abc-123",
		"method", "GET",
		"status", 500,
		"dur_ms", 42,
		"project", "11111111-1111-1111-1111-111111111111",
		"custom", "kept-in-fields",
		"api_key", "sk-should-not-appear",
	)

	waitFor(t, func() bool { return len(w.all()) == 1 })
	e := w.all()[0]

	if e.Route != "/api/v1/projects/x/files" {
		t.Errorf("Route = %q", e.Route)
	}
	if e.Error != "boom" || e.RequestID != "abc-123" || e.Method != "GET" {
		t.Errorf("promoted fields wrong: %+v", e)
	}
	if e.Status != 500 || e.Duration != 42 {
		t.Errorf("numeric promotion wrong: status=%d dur=%d", e.Status, e.Duration)
	}
	if e.Fields["custom"] != "kept-in-fields" {
		t.Errorf("unpromoted attrs must land in fields, got %v", e.Fields)
	}
	if e.Fields["api_key"] != redacted {
		t.Errorf("api_key must be redacted on the way into fields, got %v", e.Fields["api_key"])
	}
}

// A full queue must drop, never block: stalling the server to record that the server is
// unwell is the wrong trade.
func TestHandlerDropsRatherThanBlocksWhenQueueIsFull(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	// Cancel immediately so the writer goroutine exits and nothing drains the queue.
	cancel()
	w := &fakeWriter{}
	h := NewHandler(ctx, discardHandler(), w, HandlerOptions{MinLevel: slog.LevelWarn, Buffer: 2})
	log := slog.New(h)
	time.Sleep(50 * time.Millisecond) // let the drain loop finish

	done := make(chan struct{})
	go func() {
		for i := 0; i < 200; i++ {
			log.Error("flood")
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("logging blocked when the queue was full — it must drop instead")
	}
	if dropped, _ := h.Stats(); dropped == 0 {
		t.Fatal("expected dropped records to be counted so the console can admit to gaps")
	}
}

// A sink that errors must be counted, not propagated — a failing log store cannot be allowed
// to break the request that triggered it.
func TestHandlerCountsWriteFailures(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w := &fakeWriter{err: errors.New("db down")}
	h := NewHandler(ctx, discardHandler(), w, HandlerOptions{MinLevel: slog.LevelWarn, Buffer: 8})
	log := slog.New(h)

	log.Error("boom")

	waitFor(t, func() bool { _, failed := h.Stats(); return failed > 0 })
}

func TestIngestDefaultsToFrontend(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w := &fakeWriter{}
	h := NewHandler(ctx, discardHandler(), w, HandlerOptions{MinLevel: slog.LevelWarn, Buffer: 8})

	h.Ingest(Entry{Message: "TypeError: x is not a function", Fields: map[string]any{"token": "leak"}})

	waitFor(t, func() bool { return len(w.all()) == 1 })
	e := w.all()[0]
	if e.Source != "frontend" {
		t.Errorf("Source = %q, want frontend — a browser report must never look server-side", e.Source)
	}
	if e.Time.IsZero() {
		t.Error("Ingest must stamp a time when the client omits one")
	}
	// Browser payloads are the least trusted input in the system; they get redacted too.
	if e.Fields["token"] != redacted {
		t.Errorf("ingested fields must be redacted, got %v", e.Fields["token"])
	}
}

func TestMarshalFieldsDegradesGracefully(t *testing.T) {
	if got := string(MarshalFields(nil)); got != "{}" {
		t.Errorf("nil fields = %q, want {}", got)
	}
	// An unserializable value must not fail the write; the row is worth more than the field.
	bad := map[string]any{"fn": func() {}}
	if got := string(MarshalFields(bad)); got != "{}" {
		t.Errorf("unserializable fields = %q, want {}", got)
	}
}

func TestWithAttrsSharesTheSink(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w := &fakeWriter{}
	h := NewHandler(ctx, discardHandler(), w, HandlerOptions{MinLevel: slog.LevelWarn, Buffer: 16})

	// A derived logger must feed the same queue, not silently start a second sink whose
	// records never reach the database.
	child := slog.New(h).With("component", "agent")
	child.Error("tool failed", "err", "timeout")

	waitFor(t, func() bool { return len(w.all()) == 1 })
	if got := w.all()[0].Logger; got != "agent" {
		t.Errorf("Logger = %q, want the attr carried from With()", got)
	}
}
