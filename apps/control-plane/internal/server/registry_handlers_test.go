package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSearchDockerHubMapsResults(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("query"); got != "nginx" {
			t.Errorf("query = %q, want nginx", got)
		}
		if got := r.URL.Query().Get("page_size"); got != "10" {
			t.Errorf("page_size = %q, want 10", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"count": 2,
			"results": [
				{"repo_name":"library/nginx","short_description":"Official build of Nginx.","star_count":19000,"pull_count":1000000000,"is_official":true},
				{"repo_name":"bitnami/nginx","short_description":"Bitnami nginx","star_count":180,"pull_count":50000,"is_official":false}
			]
		}`))
	}))
	defer srv.Close()

	old := dockerHubBase
	dockerHubBase = srv.URL
	defer func() { dockerHubBase = old }()

	images, err := searchDockerHub(context.Background(), "nginx", 10)
	if err != nil {
		t.Fatalf("searchDockerHub error: %v", err)
	}
	if len(images) != 2 {
		t.Fatalf("got %d images, want 2", len(images))
	}
	if images[0].Name != "library/nginx" || !images[0].Official || images[0].Stars != 19000 || images[0].Pulls != 1000000000 {
		t.Errorf("first image mapped wrong: %+v", images[0])
	}
	if images[1].Name != "bitnami/nginx" || images[1].Official {
		t.Errorf("second image mapped wrong: %+v", images[1])
	}
}

func TestSearchDockerHubClampsPageSize(t *testing.T) {
	var gotPageSize string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPageSize = r.URL.Query().Get("page_size")
		_, _ = w.Write([]byte(`{"count":0,"results":[]}`))
	}))
	defer srv.Close()
	old := dockerHubBase
	dockerHubBase = srv.URL
	defer func() { dockerHubBase = old }()

	// 0 and >100 both fall back to the default 25.
	if _, err := searchDockerHub(context.Background(), "x", 0); err != nil {
		t.Fatal(err)
	}
	if gotPageSize != "25" {
		t.Errorf("page_size for 0 = %q, want 25", gotPageSize)
	}
	if _, err := searchDockerHub(context.Background(), "x", 500); err != nil {
		t.Fatal(err)
	}
	if gotPageSize != "25" {
		t.Errorf("page_size for 500 = %q, want 25", gotPageSize)
	}
}

func TestSearchDockerHubSurfacesUpstreamError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "rate limited", http.StatusTooManyRequests)
	}))
	defer srv.Close()
	old := dockerHubBase
	dockerHubBase = srv.URL
	defer func() { dockerHubBase = old }()

	if _, err := searchDockerHub(context.Background(), "x", 10); err == nil {
		t.Error("expected an error on a non-200 upstream response")
	}
}
