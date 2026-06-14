package server

import (
	"net/http"

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
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, completionResponse{
		Text:      res.Text,
		Model:     res.Model,
		TokensIn:  res.TokensIn,
		TokensOut: res.TokensOut,
	})
}
