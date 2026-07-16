package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// streamChunk is the JSON frame emitted over SSE and WebSocket for each token delta.
type streamChunk struct {
	TextDelta string `json:"textDelta,omitempty"`
	Done      bool   `json:"done"`
	Model     string `json:"model,omitempty"`
	TokensOut int32  `json:"tokensOut,omitempty"`
}

type completeBody struct {
	Prompt      string  `json:"prompt"`
	System      string  `json:"system"`
	MaxTokens   int32   `json:"maxTokens"`
	Temperature float64 `json:"temperature"`
}

func (b completeBody) toRequest() plugin.CompleteRequest {
	return plugin.CompleteRequest{
		Prompt:      b.Prompt,
		System:      b.System,
		MaxTokens:   b.MaxTokens,
		Temperature: b.Temperature,
	}
}

// handleCompleteSSE streams a completion as Server-Sent Events. Runs under the authed
// route group (Bearer header), so it suits the frontend's fetch-based API client.
func (s *Server) handleCompleteSSE(w http.ResponseWriter, r *http.Request) {
	providerName := chi.URLParam(r, "name")
	provider, ok := s.host.ModelProvider(providerName)
	if !ok {
		writeError(w, http.StatusNotFound, "Model provider not found")
		return
	}

	var body completeBody
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Prompt == "" {
		writeError(w, http.StatusBadRequest, "prompt is required")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx proxy buffering
	w.WriteHeader(http.StatusOK)

	var usageModel string
	var usageTokensOut int32
	err := provider.CompleteStream(r.Context(), body.toRequest(), func(c plugin.Chunk) error {
		if c.Done {
			usageModel, usageTokensOut = c.Model, c.TokensOut
		}
		payload, _ := json.Marshal(streamChunk{
			TextDelta: c.TextDelta,
			Done:      c.Done,
			Model:     c.Model,
			TokensOut: c.TokensOut,
		})
		if _, err := w.Write([]byte("data: " + string(payload) + "\n\n")); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	})
	if err == nil {
		// Streamed chunks carry output tokens only; tokens_in stays 0 for streams.
		s.recordUsage(userID(r), providerName, usageModel, 0, usageTokensOut)
	}
	if err != nil {
		// Headers are already sent; surface the failure as a terminal SSE event.
		payload, _ := json.Marshal(map[string]string{"error": err.Error()})
		_, _ = w.Write([]byte("event: error\ndata: " + string(payload) + "\n\n"))
		flusher.Flush()
	}
}

// handleCompleteWS streams a completion over a WebSocket. Because browsers cannot set an
// Authorization header on a WebSocket, the token is accepted via the `access_token`
// query parameter (or a Bearer header for non-browser clients). The client sends one
// JSON request frame; the server streams chunk frames, then closes.
func (s *Server) handleCompleteWS(w http.ResponseWriter, r *http.Request) {
	token := bearerOrQueryToken(r)
	if token == "" {
		writeError(w, http.StatusUnauthorized, "Authentication required")
		return
	}
	claims, err := s.auth.Authenticate(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid or expired token")
		return
	}

	providerName := chi.URLParam(r, "name")
	provider, ok := s.host.ModelProvider(providerName)
	if !ok {
		writeError(w, http.StatusNotFound, "Model provider not found")
		return
	}

	upgrader := s.wsUpgrader()
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade already wrote an error response
	}
	defer conn.Close()

	var body completeBody
	if err := conn.ReadJSON(&body); err != nil || body.Prompt == "" {
		_ = conn.WriteJSON(map[string]string{"error": "first frame must be a JSON request with a non-empty prompt"})
		return
	}

	var usageModel string
	var usageTokensOut int32
	streamErr := provider.CompleteStream(r.Context(), body.toRequest(), func(c plugin.Chunk) error {
		if c.Done {
			usageModel, usageTokensOut = c.Model, c.TokensOut
		}
		return conn.WriteJSON(streamChunk{
			TextDelta: c.TextDelta,
			Done:      c.Done,
			Model:     c.Model,
			TokensOut: c.TokensOut,
		})
	})
	if streamErr != nil {
		_ = conn.WriteJSON(map[string]string{"error": streamErr.Error()})
		return
	}
	// Streamed chunks carry output tokens only; tokens_in stays 0 for streams.
	s.recordUsage(claims.UserID, providerName, usageModel, 0, usageTokensOut)
}

func (s *Server) wsUpgrader() websocket.Upgrader {
	return websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true // non-browser client (no Origin header)
			}
			if len(s.cfg.CORSOrigins) == 0 {
				// Same-origin topology by default; only explicit dev accepts any origin.
				return s.cfg.IsDevelopment()
			}
			for _, o := range s.cfg.CORSOrigins {
				if o == origin {
					return true
				}
			}
			return false
		},
	}
}

func bearerOrQueryToken(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return strings.TrimSpace(r.URL.Query().Get("access_token"))
}
