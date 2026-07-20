package server

import (
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"
)

// Observability: a dependency-free access log with request-id echo, plus in-process request
// metrics exposed at /metrics in Prometheus text format. Counters are per-instance; a scrape
// (or federation) aggregates across replicas. No external client library is pulled in — the
// exposition is written by hand.

type serverMetrics struct {
	start         time.Time
	requestsTotal atomic.Int64
	errorsTotal   atomic.Int64 // status >= 500
	durationSumMs atomic.Int64
	durationCount atomic.Int64
	byClass       sync.Map // "2xx".."5xx" -> *atomic.Int64
}

func newServerMetrics() *serverMetrics { return &serverMetrics{start: time.Now()} }

func (m *serverMetrics) classCounter(class string) *atomic.Int64 {
	v, _ := m.byClass.LoadOrStore(class, new(atomic.Int64))
	return v.(*atomic.Int64)
}

// observe wraps each request: echoes the request id (X-Request-Id, from chimw.RequestID),
// captures the status, records metrics, and writes one structured access-log line. Registered
// after chimw.RequestID so the id is in context.
func (s *Server) observe(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqID := chimw.GetReqID(r.Context())
		if reqID != "" {
			w.Header().Set("X-Request-Id", reqID)
		}
		ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
		start := time.Now()
		next.ServeHTTP(ww, r)
		dur := time.Since(start)

		status := ww.Status()
		if status == 0 {
			status = http.StatusOK
		}
		m := s.metrics
		m.requestsTotal.Add(1)
		m.classCounter(strconv.Itoa(status/100) + "xx").Add(1)
		if status >= 500 {
			m.errorsTotal.Add(1)
		}
		m.durationSumMs.Add(dur.Milliseconds())
		m.durationCount.Add(1)

		// Skip the noisy infra endpoints in the access log.
		switch r.URL.Path {
		case "/health", "/ready", "/metrics":
		default:
			s.logger.Info("http",
				"method", r.Method, "path", r.URL.Path, "status", status,
				"dur_ms", dur.Milliseconds(), "req_id", reqID)
		}
	})
}

// handleMetrics writes the Prometheus text exposition of the in-process counters.
func (s *Server) handleMetrics(w http.ResponseWriter, _ *http.Request) {
	m := s.metrics
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")

	fmt.Fprintf(w, "# HELP torsor_uptime_seconds Process uptime in seconds.\n# TYPE torsor_uptime_seconds gauge\ntorsor_uptime_seconds %d\n",
		int64(time.Since(m.start).Seconds()))
	fmt.Fprintf(w, "# HELP torsor_http_requests_total Total HTTP requests handled.\n# TYPE torsor_http_requests_total counter\ntorsor_http_requests_total %d\n",
		m.requestsTotal.Load())
	fmt.Fprintf(w, "# HELP torsor_http_errors_total HTTP responses with status >= 500.\n# TYPE torsor_http_errors_total counter\ntorsor_http_errors_total %d\n",
		m.errorsTotal.Load())

	fmt.Fprintf(w, "# HELP torsor_http_requests_by_class HTTP requests by status class.\n# TYPE torsor_http_requests_by_class counter\n")
	for _, class := range []string{"2xx", "3xx", "4xx", "5xx"} {
		var n int64
		if v, ok := m.byClass.Load(class); ok {
			n = v.(*atomic.Int64).Load()
		}
		fmt.Fprintf(w, "torsor_http_requests_by_class{class=%q} %d\n", class, n)
	}

	var avg int64
	if c := m.durationCount.Load(); c > 0 {
		avg = m.durationSumMs.Load() / c
	}
	fmt.Fprintf(w, "# HELP torsor_http_request_duration_ms_avg Mean request duration in ms.\n# TYPE torsor_http_request_duration_ms_avg gauge\ntorsor_http_request_duration_ms_avg %d\n", avg)
}
