package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// Recommended local coding models (2026/27 open-weight leaders) surfaced as a hint in the
// model picker regardless of what's installed.
var recommendedModels = []string{"qwen3-coder", "devstral", "qwen2.5-coder"}

// handleModelCatalog lists a provider's installed models so the UI can show what's ready to
// run. Only "ollama" is supported today (proxying the local Ollama /api/tags); other
// providers return an empty, unsupported catalog. Best-effort — a convenience hint, never
// authoritative, and never blocks a completion.
func (s *Server) handleModelCatalog(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if name != "ollama" {
		writeJSON(w, http.StatusOK, map[string]any{
			"supported": false, "items": []any{}, "recommended": recommendedModels,
		})
		return
	}

	host := strings.TrimRight(s.cfg.OllamaHost, "/")
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, host+"/api/tags", nil)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"supported": true, "reachable": false, "items": []any{},
			"recommended": recommendedModels, "error": "Ollama unreachable at " + host,
		})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		writeJSON(w, http.StatusOK, map[string]any{
			"supported": true, "reachable": false, "items": []any{}, "recommended": recommendedModels,
		})
		return
	}

	var tags struct {
		Models []struct {
			Name string `json:"name"`
			Size int64  `json:"size"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tags); err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"supported": true, "reachable": true, "items": []any{}, "recommended": recommendedModels,
		})
		return
	}

	items := make([]map[string]any, 0, len(tags.Models))
	for _, m := range tags.Models {
		items = append(items, map[string]any{"name": m.Name, "size": m.Size})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"supported": true, "reachable": true, "items": items, "recommended": recommendedModels,
	})
}
