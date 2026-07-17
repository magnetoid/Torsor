// Package openaicompat implements a Torsor ModelProvider over the OpenAI-compatible
// Chat Completions API — the de-facto standard wire format also spoken by DeepSeek,
// OpenRouter, Groq, Together, and most gateways. One implementation, parameterized by
// base URL + provider name, backs several cmd/*-model plugins (openai-model,
// deepseek-model, openrouter-model).
//
// BYO-first: the provider starts WITHOUT any key. A per-request key (the caller's
// decrypted secret, CompleteRequest.APIKey) is preferred; an optional host-env key is the
// fallback; with neither, requests fail with a message telling the user where to add one.
// Plain net/http on purpose — the wire format is stable JSON/SSE and a vendor SDK per
// dialect would add three dependencies for the same bytes.
package openaicompat

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// Config parameterizes one OpenAI-compatible provider.
type Config struct {
	// Name is the Torsor provider name (e.g. "openai"); the control plane looks up the
	// caller's BYO key under strings.ToUpper(Name)+"_API_KEY".
	Name        string
	DisplayName string // human label prefix, e.g. "OpenAI"
	BaseURL     string // e.g. https://api.openai.com/v1 (no trailing slash)
	Model       string // model id sent in requests
	HostKey     string // optional host-wide default key ("" => BYO-only)
}

// Provider implements plugin.ModelProvider.
type Provider struct {
	cfg    Config
	client *http.Client
}

func New(cfg Config) Provider {
	return Provider{cfg: cfg, client: &http.Client{Timeout: 5 * time.Minute}}
}

func (p Provider) Info(_ context.Context) (plugin.ModelInfo, error) {
	return plugin.ModelInfo{
		Name:        p.cfg.Name,
		DisplayName: p.cfg.DisplayName + " (" + p.cfg.Model + ")",
		Version:     "0.1.0",
		Kind:        "model_provider",
	}, nil
}

func (p Provider) keyFor(req plugin.CompleteRequest) (string, error) {
	if k := strings.TrimSpace(req.APIKey); k != "" {
		return k, nil
	}
	if p.cfg.HostKey != "" {
		return p.cfg.HostKey, nil
	}
	return "", fmt.Errorf("%s: no API key — add your %s key in Settings → API Keys (hosted models are BYO-key)",
		p.cfg.Name, p.cfg.DisplayName)
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	MaxTokens   int32         `json:"max_tokens,omitempty"`
	Temperature *float64      `json:"temperature,omitempty"`
	Stream      bool          `json:"stream,omitempty"`
	// Ask streaming responses to include a final usage frame (OpenAI + compatibles).
	StreamOptions *struct {
		IncludeUsage bool `json:"include_usage"`
	} `json:"stream_options,omitempty"`
}

type chatUsage struct {
	PromptTokens     int32 `json:"prompt_tokens"`
	CompletionTokens int32 `json:"completion_tokens"`
}

type chatResponse struct {
	Model   string `json:"model"`
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
	Usage *chatUsage `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (p Provider) buildRequest(ctx context.Context, req plugin.CompleteRequest, key string, stream bool) (*http.Request, error) {
	body := chatRequest{
		Model:  p.cfg.Model,
		Stream: stream,
	}
	if req.System != "" {
		body.Messages = append(body.Messages, chatMessage{Role: "system", Content: req.System})
	}
	body.Messages = append(body.Messages, chatMessage{Role: "user", Content: req.Prompt})
	if req.MaxTokens > 0 {
		body.MaxTokens = req.MaxTokens
	}
	if req.Temperature > 0 {
		t := req.Temperature
		body.Temperature = &t
	}
	if stream {
		body.StreamOptions = &struct {
			IncludeUsage bool `json:"include_usage"`
		}{IncludeUsage: true}
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(p.cfg.BaseURL, "/")+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+key)
	return httpReq, nil
}

// apiError turns a non-2xx response into a readable error (the JSON error message when
// present, else the raw body head).
func (p Provider) apiError(resp *http.Response) error {
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	var parsed chatResponse
	if json.Unmarshal(raw, &parsed) == nil && parsed.Error != nil && parsed.Error.Message != "" {
		return fmt.Errorf("%s: %s (HTTP %d)", p.cfg.Name, parsed.Error.Message, resp.StatusCode)
	}
	return fmt.Errorf("%s: HTTP %d: %s", p.cfg.Name, resp.StatusCode, strings.TrimSpace(string(raw)))
}

func (p Provider) Complete(ctx context.Context, req plugin.CompleteRequest) (plugin.CompleteResult, error) {
	key, err := p.keyFor(req)
	if err != nil {
		return plugin.CompleteResult{}, err
	}
	httpReq, err := p.buildRequest(ctx, req, key, false)
	if err != nil {
		return plugin.CompleteResult{}, err
	}
	resp, err := p.client.Do(httpReq)
	if err != nil {
		return plugin.CompleteResult{}, fmt.Errorf("%s: %w", p.cfg.Name, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return plugin.CompleteResult{}, p.apiError(resp)
	}
	var parsed chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return plugin.CompleteResult{}, fmt.Errorf("%s: decode response: %w", p.cfg.Name, err)
	}
	res := plugin.CompleteResult{Model: p.cfg.Model}
	if parsed.Model != "" {
		res.Model = parsed.Model
	}
	if len(parsed.Choices) > 0 {
		res.Text = parsed.Choices[0].Message.Content
	}
	if parsed.Usage != nil {
		res.TokensIn = parsed.Usage.PromptTokens
		res.TokensOut = parsed.Usage.CompletionTokens
	}
	return res, nil
}

func (p Provider) CompleteStream(ctx context.Context, req plugin.CompleteRequest, onChunk func(plugin.Chunk) error) error {
	key, err := p.keyFor(req)
	if err != nil {
		return err
	}
	httpReq, err := p.buildRequest(ctx, req, key, true)
	if err != nil {
		return err
	}
	resp, err := p.client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("%s: %w", p.cfg.Name, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return p.apiError(resp)
	}

	var tokensOut int32
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}
		var frame chatResponse
		if err := json.Unmarshal([]byte(data), &frame); err != nil {
			continue // ignore unparseable keep-alive frames
		}
		if frame.Usage != nil {
			tokensOut = frame.Usage.CompletionTokens
		}
		if len(frame.Choices) > 0 && frame.Choices[0].Delta.Content != "" {
			if err := onChunk(plugin.Chunk{TextDelta: frame.Choices[0].Delta.Content, Model: p.cfg.Model}); err != nil {
				return err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("%s stream: %w", p.cfg.Name, err)
	}
	return onChunk(plugin.Chunk{Done: true, Model: p.cfg.Model, TokensOut: tokensOut})
}
