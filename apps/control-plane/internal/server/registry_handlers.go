package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// registryImage is one image result from a container registry marketplace search.
type registryImage struct {
	Name        string `json:"name"`        // repository name, e.g. "library/nginx" or "grafana/grafana"
	Description string `json:"description"` // short description
	Stars       int    `json:"stars"`
	Pulls       int64  `json:"pulls"`
	Official    bool   `json:"official"`
}

// dockerHubBase is the public Docker Hub search API. Overridable in tests.
var dockerHubBase = "https://hub.docker.com"

// registryHTTP is the client used for marketplace lookups (short timeout — this is a
// user-facing search, not a long job).
var registryHTTP = &http.Client{Timeout: 10 * time.Second}

// dockerHubSearchResponse is the subset of Docker Hub's search payload we consume.
type dockerHubSearchResponse struct {
	Count   int `json:"count"`
	Results []struct {
		RepoName         string `json:"repo_name"`
		ShortDescription string `json:"short_description"`
		StarCount        int    `json:"star_count"`
		PullCount        int64  `json:"pull_count"`
		IsOfficial       bool   `json:"is_official"`
	} `json:"results"`
}

// searchDockerHub queries Docker Hub's marketplace and maps results to registryImage. It is
// separated from the handler so it is unit-testable against an httptest server.
func searchDockerHub(ctx context.Context, query string, pageSize int) ([]registryImage, error) {
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 25
	}
	u := fmt.Sprintf("%s/v2/search/repositories/?query=%s&page_size=%d",
		dockerHubBase, url.QueryEscape(query), pageSize)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := registryHTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docker hub unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("docker hub returned %d: %s", resp.StatusCode, string(body))
	}
	var parsed dockerHubSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("decode docker hub response: %w", err)
	}
	images := make([]registryImage, 0, len(parsed.Results))
	for _, r := range parsed.Results {
		images = append(images, registryImage{
			Name:        r.RepoName,
			Description: r.ShortDescription,
			Stars:       r.StarCount,
			Pulls:       r.PullCount,
			Official:    r.IsOfficial,
		})
	}
	return images, nil
}

// handleSearchRegistryImages proxies a container-image marketplace search (Docker Hub) so
// the frontend can browse images to deploy without embedding a registry client or key.
// GET /api/v1/registry/images?q=<query>&limit=<n>
func (s *Server) handleSearchRegistryImages(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		q = "library" // sensible default: surface popular official images
	}
	limit := 25
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			limit = n
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	images, err := searchDockerHub(ctx, q, limit)
	if err != nil {
		writeError(w, http.StatusBadGateway, "Marketplace search failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": images, "query": q})
}
