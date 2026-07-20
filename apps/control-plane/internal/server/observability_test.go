package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// observe must count requests by class + errors, and handleMetrics must expose them in
// Prometheus text format.
func TestObserveAndMetrics(t *testing.T) {
	s := &Server{metrics: newServerMetrics(), logger: slog.New(slog.NewTextHandler(io.Discard, nil))}

	serve := func(h http.Handler, path string) {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, path, nil))
	}
	fail := s.observe(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusServiceUnavailable) }))
	ok := s.observe(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))

	serve(fail, "/a")
	serve(fail, "/b")
	serve(fail, "/c")
	serve(ok, "/d")

	rr := httptest.NewRecorder()
	s.handleMetrics(rr, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := rr.Body.String()

	for _, want := range []string{
		"torsor_http_requests_total 4",
		"torsor_http_errors_total 3",
		`torsor_http_requests_by_class{class="5xx"} 3`,
		`torsor_http_requests_by_class{class="2xx"} 1`,
		"torsor_uptime_seconds",
		"torsor_http_request_duration_ms_avg",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics output missing %q; got:\n%s", want, body)
		}
	}
}

// The response must echo a request id when one is present in context (chimw.RequestID sets it
// in the real stack); with no id, no header is set and nothing panics.
func TestObserveNoRequestID(t *testing.T) {
	s := &Server{metrics: newServerMetrics(), logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	h := s.observe(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/x", nil))
	if got := rr.Header().Get("X-Request-Id"); got != "" {
		t.Errorf("expected no request id header without RequestID middleware, got %q", got)
	}
}
