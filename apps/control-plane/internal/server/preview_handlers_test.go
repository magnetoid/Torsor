package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPreviewTokenPrecedence(t *testing.T) {
	// Query wins and reports fromQuery=true.
	r := httptest.NewRequest(http.MethodGet, "/p/?access_token=q-token", nil)
	r.AddCookie(&http.Cookie{Name: previewCookie, Value: "c-token"})
	tok, fromQuery := previewToken(r)
	if tok != "q-token" || !fromQuery {
		t.Errorf("query token must win: got %q fromQuery=%v", tok, fromQuery)
	}
	// Cookie is the fallback for sub-requests (no query).
	r = httptest.NewRequest(http.MethodGet, "/p/assets/app.js", nil)
	r.AddCookie(&http.Cookie{Name: previewCookie, Value: "c-token"})
	tok, fromQuery = previewToken(r)
	if tok != "c-token" || fromQuery {
		t.Errorf("cookie fallback broken: got %q fromQuery=%v", tok, fromQuery)
	}
	// Neither → empty.
	if tok, _ := previewToken(httptest.NewRequest(http.MethodGet, "/p/", nil)); tok != "" {
		t.Errorf("no credentials must yield empty token, got %q", tok)
	}
}

func TestSetPreviewCookieAttributes(t *testing.T) {
	rr := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/p/", nil)
	r.Header.Set("X-Forwarded-Proto", "https")
	setPreviewCookie(rr, r, "tok", "/api/v1/projects/p1/preview")
	sc := rr.Header().Get("Set-Cookie")
	for _, want := range []string{previewCookie + "=tok", "Path=/api/v1/projects/p1/preview", "HttpOnly", "Secure", "SameSite=Lax"} {
		if !strings.Contains(sc, want) {
			t.Errorf("Set-Cookie missing %q: %s", want, sc)
		}
	}
	// Plain HTTP (local dev) must not set Secure, or the cookie is dropped.
	rr = httptest.NewRecorder()
	setPreviewCookie(rr, httptest.NewRequest(http.MethodGet, "/p/", nil), "tok", "/")
	if strings.Contains(rr.Header().Get("Set-Cookie"), "Secure") {
		t.Errorf("plain-HTTP cookie must not be Secure: %s", rr.Header().Get("Set-Cookie"))
	}
}

// listeningPorts parses the kernel's hex socket table: only LISTEN (0A) rows count.
func TestListeningPorts(t *testing.T) {
	proc := `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid
   0: 00000000:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0
   1: 0100007F:1433 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0
   2: 0100007F:8124 0100007F:0BB8 01 00000000:00000000 00:00000000 00000000     0
   3: 00000000000000000000000000000000:1F90 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000     0`
	got := listeningPorts(proc)
	want := []string{"3000", "5171", "8080"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("ports = %v, want %v (0BB8=3000, 1433=5171, 1F90=8080; established 8124 excluded)", got, want)
	}
}
