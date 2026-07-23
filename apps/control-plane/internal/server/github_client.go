package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

// githubAPIBase is the GitHub REST base. Overridden in tests to point at an httptest server.
var githubAPIBase = "https://api.github.com"

// errNoVerifiedEmail means the account exposed no primary, verified email address.
var errNoVerifiedEmail = errors.New("github: no primary verified email")

type githubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
	Email     string `json:"email"`
}

type githubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

func githubGet(ctx context.Context, hc *http.Client, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubAPIBase+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("github %s: status %d: %s", path, resp.StatusCode, string(body))
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// fetchGitHubUser returns the authenticated user for the given (token-bearing) client.
func fetchGitHubUser(ctx context.Context, hc *http.Client) (*githubUser, error) {
	var u githubUser
	if err := githubGet(ctx, hc, "/user", &u); err != nil {
		return nil, err
	}
	return &u, nil
}

// fetchGitHubPrimaryVerifiedEmail returns the account's primary, verified email.
func fetchGitHubPrimaryVerifiedEmail(ctx context.Context, hc *http.Client) (string, error) {
	var emails []githubEmail
	if err := githubGet(ctx, hc, "/user/emails", &emails); err != nil {
		return "", err
	}
	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	return "", errNoVerifiedEmail
}
