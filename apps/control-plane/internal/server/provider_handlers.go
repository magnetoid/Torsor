package server

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

type modelProviderInfo struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Version     string `json:"version"`
	Kind        string `json:"kind"`
}

type completionResponse struct {
	Text      string `json:"text"`
	Model     string `json:"model"`
	TokensIn  int32  `json:"tokensIn"`
	TokensOut int32  `json:"tokensOut"`
}

// handleListModelProviders lists model providers contributed by loaded plugins.
func (s *Server) handleListModelProviders(w http.ResponseWriter, _ *http.Request) {
	infos := s.host.ModelProviders()
	items := make([]modelProviderInfo, 0, len(infos))
	for _, i := range infos {
		items = append(items, modelProviderInfo{
			Name:        i.Name,
			DisplayName: i.DisplayName,
			Version:     i.Version,
			Kind:        i.Kind,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// recordUsage persists a usage_events row for token/cost accounting (Phase 4
// groundwork). Best-effort: failures are logged, never surfaced — usage accounting must
// not break completions. Uses a fresh context because the request context is often
// already canceled when a stream ends.
func (s *Server) recordUsage(userID, providerName, model string, tokensIn, tokensOut int32) {
	if userID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO usage_events (user_id, provider, model, tokens_in, tokens_out)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, providerName, model, tokensIn, tokensOut); err != nil {
		s.logger.Warn("record usage event", "error", err, "provider", providerName)
	}
}

// handleTestModelProvider verifies the caller can actually use a provider: it runs a tiny
// real completion with the caller's BYO key (or the host default). Success proves the key
// + provider work end-to-end; failure surfaces the provider's own message (e.g. "no API
// key — add your key in Settings → API Keys", or the vendor's invalid-key error).
func (s *Server) handleTestModelProvider(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	provider, ok := s.host.ModelProvider(name)
	if !ok {
		writeError(w, http.StatusNotFound, "Model provider not found")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	res, err := provider.Complete(ctx, plugin.CompleteRequest{
		Prompt:    "Reply with the single word: ok",
		MaxTokens: 8,
		APIKey:    s.providerAPIKey(ctx, userID(r), name),
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "model": res.Model})
}

// handleComplete invokes a named model provider plugin for a single completion.
func (s *Server) handleComplete(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	provider, ok := s.host.ModelProvider(name)
	if !ok {
		writeError(w, http.StatusNotFound, "Model provider not found")
		return
	}

	var body struct {
		Prompt      string  `json:"prompt"`
		System      string  `json:"system"`
		MaxTokens   int32   `json:"maxTokens"`
		Temperature float64 `json:"temperature"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Prompt == "" {
		writeError(w, http.StatusBadRequest, "prompt is required")
		return
	}

	res, err := provider.Complete(r.Context(), plugin.CompleteRequest{
		Prompt:      body.Prompt,
		System:      body.System,
		MaxTokens:   body.MaxTokens,
		Temperature: body.Temperature,
		APIKey:      s.providerAPIKey(r.Context(), userID(r), name),
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}

	s.recordUsage(userID(r), name, res.Model, res.TokensIn, res.TokensOut)

	writeJSON(w, http.StatusOK, completionResponse{
		Text:      res.Text,
		Model:     res.Model,
		TokensIn:  res.TokensIn,
		TokensOut: res.TokensOut,
	})
}
