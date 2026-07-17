// Command gemini-model is a Torsor ModelProvider plugin for the Google Gemini API
// (REST v1beta, plain net/http — no vendor SDK). BYO-first: starts without a key;
// per-user keys (secret GOOGLE_API_KEY) are the normal path.
//
// Configuration (environment):
//
//	GOOGLE_API_KEY   optional host-wide default key
//	GOOGLE_MODEL     model id (default gemini-2.0-flash)
//	GOOGLE_BASE_URL  API base (default https://generativelanguage.googleapis.com/v1beta)
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

type provider struct {
	baseURL string
	model   string
	hostKey string
	client  *http.Client
}

func (p provider) Info(_ context.Context) (plugin.ModelInfo, error) {
	return plugin.ModelInfo{
		Name:        "google",
		DisplayName: "Google Gemini (" + p.model + ")",
		Version:     "0.1.0",
		Kind:        "model_provider",
	}, nil
}

func (p provider) keyFor(req plugin.CompleteRequest) (string, error) {
	if k := strings.TrimSpace(req.APIKey); k != "" {
		return k, nil
	}
	if p.hostKey != "" {
		return p.hostKey, nil
	}
	return "", fmt.Errorf("google: no API key — add your Google AI key in Settings → API Keys (hosted models are BYO-key)")
}

// generateContent request/response (the subset Torsor uses).
type geminiRequest struct {
	Contents []struct {
		Role  string `json:"role,omitempty"`
		Parts []struct {
			Text string `json:"text"`
		} `json:"parts"`
	} `json:"contents"`
	SystemInstruction *struct {
		Parts []struct {
			Text string `json:"text"`
		} `json:"parts"`
	} `json:"systemInstruction,omitempty"`
	GenerationConfig *struct {
		MaxOutputTokens int32    `json:"maxOutputTokens,omitempty"`
		Temperature     *float64 `json:"temperature,omitempty"`
	} `json:"generationConfig,omitempty"`
}

type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	UsageMetadata *struct {
		PromptTokenCount     int32 `json:"promptTokenCount"`
		CandidatesTokenCount int32 `json:"candidatesTokenCount"`
	} `json:"usageMetadata"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (p provider) buildBody(req plugin.CompleteRequest) ([]byte, error) {
	var body geminiRequest
	body.Contents = make([]struct {
		Role  string `json:"role,omitempty"`
		Parts []struct {
			Text string `json:"text"`
		} `json:"parts"`
	}, 1)
	body.Contents[0].Role = "user"
	body.Contents[0].Parts = []struct {
		Text string `json:"text"`
	}{{Text: req.Prompt}}
	if req.System != "" {
		body.SystemInstruction = &struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		}{Parts: []struct {
			Text string `json:"text"`
		}{{Text: req.System}}}
	}
	if req.MaxTokens > 0 || req.Temperature > 0 {
		gc := &struct {
			MaxOutputTokens int32    `json:"maxOutputTokens,omitempty"`
			Temperature     *float64 `json:"temperature,omitempty"`
		}{}
		if req.MaxTokens > 0 {
			gc.MaxOutputTokens = req.MaxTokens
		}
		if req.Temperature > 0 {
			t := req.Temperature
			gc.Temperature = &t
		}
		body.GenerationConfig = gc
	}
	return json.Marshal(body)
}

func (p provider) doRequest(ctx context.Context, req plugin.CompleteRequest, endpoint string) (*http.Response, error) {
	key, err := p.keyFor(req)
	if err != nil {
		return nil, err
	}
	payload, err := p.buildBody(req)
	if err != nil {
		return nil, err
	}
	url := strings.TrimRight(p.baseURL, "/") + "/models/" + p.model + ":" + endpoint
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-goog-api-key", key)
	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("google: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		defer resp.Body.Close()
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		var parsed geminiResponse
		if json.Unmarshal(raw, &parsed) == nil && parsed.Error != nil && parsed.Error.Message != "" {
			return nil, fmt.Errorf("google: %s (HTTP %d)", parsed.Error.Message, resp.StatusCode)
		}
		return nil, fmt.Errorf("google: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	return resp, nil
}

func textOf(r geminiResponse) string {
	var b strings.Builder
	for _, c := range r.Candidates {
		for _, part := range c.Content.Parts {
			b.WriteString(part.Text)
		}
	}
	return b.String()
}

func (p provider) Complete(ctx context.Context, req plugin.CompleteRequest) (plugin.CompleteResult, error) {
	resp, err := p.doRequest(ctx, req, "generateContent")
	if err != nil {
		return plugin.CompleteResult{}, err
	}
	defer resp.Body.Close()
	var parsed geminiResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return plugin.CompleteResult{}, fmt.Errorf("google: decode response: %w", err)
	}
	res := plugin.CompleteResult{Text: textOf(parsed), Model: p.model}
	if parsed.UsageMetadata != nil {
		res.TokensIn = parsed.UsageMetadata.PromptTokenCount
		res.TokensOut = parsed.UsageMetadata.CandidatesTokenCount
	}
	return res, nil
}

func (p provider) CompleteStream(ctx context.Context, req plugin.CompleteRequest, onChunk func(plugin.Chunk) error) error {
	resp, err := p.doRequest(ctx, req, "streamGenerateContent?alt=sse")
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	var tokensOut int32
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		var frame geminiResponse
		if err := json.Unmarshal([]byte(data), &frame); err != nil {
			continue
		}
		if frame.UsageMetadata != nil {
			tokensOut = frame.UsageMetadata.CandidatesTokenCount
		}
		if delta := textOf(frame); delta != "" {
			if err := onChunk(plugin.Chunk{TextDelta: delta, Model: p.model}); err != nil {
				return err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("google stream: %w", err)
	}
	return onChunk(plugin.Chunk{Done: true, Model: p.model, TokensOut: tokensOut})
}

func main() {
	plugin.Serve(provider{
		baseURL: envOr("GOOGLE_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
		model:   envOr("GOOGLE_MODEL", "gemini-2.0-flash"),
		hostKey: strings.TrimSpace(os.Getenv("GOOGLE_API_KEY")),
		client:  &http.Client{Timeout: 5 * time.Minute},
	})
}
