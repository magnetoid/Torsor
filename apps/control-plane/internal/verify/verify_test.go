package verify

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestFormatCleanReport(t *testing.T) {
	r := Report{URL: "http://x/", Title: "App", Buttons: 3}
	out := r.Format()
	if !strings.Contains(out, "BROWSER CHECK OK") {
		t.Errorf("clean report must lead with OK verdict, got:\n%s", out)
	}
	if strings.Contains(out, "ZERO interactive elements") {
		t.Errorf("report with buttons must not warn about a static shell:\n%s", out)
	}
}

func TestFormatProblemReport(t *testing.T) {
	r := Report{
		URL:            "http://x/",
		ConsoleErrors:  []string{"error: boom"},
		PageErrors:     []string{"TypeError: x is not a function"},
		FailedRequests: []string{"http://x/api — HTTP 500"},
	}
	out := r.Format()
	for _, want := range []string{"3 PROBLEM(S)", "boom", "TypeError", "HTTP 500", "ZERO interactive elements"} {
		if !strings.Contains(out, want) {
			t.Errorf("problem report missing %q:\n%s", want, out)
		}
	}
}

func TestAddBoundedCapsEntries(t *testing.T) {
	var list []string
	for i := 0; i < 50; i++ {
		list = addBounded(list, "line")
	}
	if len(list) != maxListEntries {
		t.Errorf("expected %d entries, got %d", maxListEntries, len(list))
	}
	long := addBounded(nil, strings.Repeat("a", 1000))
	if len(long[0]) > maxLineLen+len("…") {
		t.Errorf("long line not clipped: %d chars", len(long[0]))
	}
}

// TestBrowserCheck drives a real headless browser against a local page containing a console
// error, an uncaught exception, a failing fetch, and two buttons — the full observation
// surface. Skipped when no browser is installed (e.g. minimal CI/build environments).
func TestBrowserCheck(t *testing.T) {
	path := FindBrowser()
	if path == "" {
		t.Skip("no chromium/chrome found; skipping browser integration test")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<!doctype html><html><head><title>Verify Fixture</title></head>
<body>
  <h1>Hello fixture</h1>
  <button id="a">One</button><a href="/x">Two</a>
  <script>
    console.error("fixture console failure");
    fetch("/missing-endpoint");
    setTimeout(() => { throw new Error("fixture uncaught"); }, 50);
  </script>
</body></html>`))
	})
	mux.HandleFunc("/missing-endpoint", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	rep, err := NewBrowser(path).Check(ctx, srv.URL+"/", `1 + 41`)
	if err != nil {
		t.Fatalf("Check failed: %v", err)
	}

	if rep.Title != "Verify Fixture" {
		t.Errorf("title = %q, want Verify Fixture", rep.Title)
	}
	if rep.Buttons < 2 {
		t.Errorf("expected >=2 interactive elements, got %d", rep.Buttons)
	}
	if !strings.Contains(strings.Join(rep.ConsoleErrors, "\n"), "fixture console failure") {
		t.Errorf("console error not captured: %v", rep.ConsoleErrors)
	}
	if !strings.Contains(strings.Join(rep.PageErrors, "\n"), "fixture uncaught") {
		t.Errorf("uncaught exception not captured: %v", rep.PageErrors)
	}
	if !strings.Contains(strings.Join(rep.FailedRequests, "\n"), "500") {
		t.Errorf("failed request not captured: %v", rep.FailedRequests)
	}
	if rep.EvalResult != "42" {
		t.Errorf("eval result = %q, want 42", rep.EvalResult)
	}
	if !strings.Contains(rep.TextHead, "Hello fixture") {
		t.Errorf("visible text not captured: %q", rep.TextHead)
	}
}
