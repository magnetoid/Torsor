package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchGitHubUserAndEmail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/user":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":42,"login":"octocat","avatar_url":"https://a/x.png","email":null}`))
		case "/user/emails":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"email":"old@x.com","primary":false,"verified":true},
				{"email":"octo@x.com","primary":true,"verified":true},
				{"email":"nope@x.com","primary":false,"verified":false}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	old := githubAPIBase
	githubAPIBase = srv.URL
	defer func() { githubAPIBase = old }()

	u, err := fetchGitHubUser(t.Context(), srv.Client())
	if err != nil {
		t.Fatalf("fetchGitHubUser: %v", err)
	}
	if u.ID != 42 || u.Login != "octocat" {
		t.Errorf("user = %+v, want id 42 login octocat", u)
	}

	email, err := fetchGitHubPrimaryVerifiedEmail(t.Context(), srv.Client())
	if err != nil {
		t.Fatalf("fetchGitHubPrimaryVerifiedEmail: %v", err)
	}
	if email != "octo@x.com" {
		t.Errorf("email = %q, want octo@x.com (primary+verified)", email)
	}
}

func TestFetchGitHubEmailNoneVerified(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[{"email":"x@x.com","primary":true,"verified":false}]`))
	}))
	defer srv.Close()
	old := githubAPIBase
	githubAPIBase = srv.URL
	defer func() { githubAPIBase = old }()

	if _, err := fetchGitHubPrimaryVerifiedEmail(t.Context(), srv.Client()); err != errNoVerifiedEmail {
		t.Fatalf("err = %v, want errNoVerifiedEmail", err)
	}
}
