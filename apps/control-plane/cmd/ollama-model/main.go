// Command ollama-model is a Torsor ModelProvider plugin backed by a local Ollama
// server. It is the free-by-default provider: no API key, no hosted service — point it
// at any Ollama instance (default http://127.0.0.1:11434) and pick a model with
// OLLAMA_MODEL. It follows the exact shape of cmd/mock-model: implement
// plugin.ModelProvider and call plugin.Serve.
//
// Configuration (environment):
//
//	OLLAMA_HOST   base URL of the Ollama server (default http://127.0.0.1:11434)
//	OLLAMA_MODEL  model name to run, e.g. llama3.2, qwen2.5-coder (default llama3.2)
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

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

type provider struct {
	host   string
	model  string
	client *http.Client
}

func newProvider() provider {
	host := strings.TrimRight(envOr("OLLAMA_HOST", "http://127.0.0.1:11434"), "/")
	if !strings.HasPrefix(host, "http://") && !strings.HasPrefix(host, "https://") {
		host = "http://" + host
	}
	return provider{
		host:  host,
		model: envOr("OLLAMA_MODEL", "llama3.2"),
		// No overall timeout: streamed generations legitimately run for minutes. Dial
		// failures still surface quickly, and the host cancels via ctx on disconnect.
		client: &http.Client{Timeout: 0},
	}
}

func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func (p provider) Info(_ context.Context) (plugin.ModelInfo, error) {
	return plugin.ModelInfo{
		Name:        "ollama",
		DisplayName: "Ollama (local, " + p.model + ")",
		Version:     "0.1.0",
		Kind:        "model_provider",
	}, nil
}

// generateRequest is Ollama's POST /api/generate body (subset we use).
type generateRequest struct {
	Model   string         `json:"model"`
	Prompt  string         `json:"prompt"`
	System  string         `json:"system,omitempty"`
	Stream  bool           `json:"stream"`
	Options map[string]any `json:"options,omitempty"`
}

// generateChunk is one line of Ollama's newline-delimited JSON response stream. The
// final chunk has done=true and carries the token counts.
type generateChunk struct {
	Response        string `json:"response"`
	Done            bool   `json:"done"`
	PromptEvalCount int32  `json:"prompt_eval_count"`
	EvalCount       int32  `json:"eval_count"`
	Error           string `json:"error"`
}

func (p provider) do(ctx context.Context, req plugin.CompleteRequest, stream bool) (*http.Response, error) {
	options := map[string]any{}
	if req.MaxTokens > 0 {
		options["num_predict"] = req.MaxTokens
	}
	if req.Temperature > 0 {
		options["temperature"] = req.Temperature
	}
	body, err := json.Marshal(generateRequest{
		Model:   p.model,
		Prompt:  req.Prompt,
		System:  req.System,
		Stream:  stream,
		Options: options,
	})
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.host+"/api/generate", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("ollama unreachable at %s: %w", p.host, err)
	}
	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("ollama returned %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	return resp, nil
}

func (p provider) Complete(ctx context.Context, req plugin.CompleteRequest) (plugin.CompleteResult, error) {
	resp, err := p.do(ctx, req, false)
	if err != nil {
		return plugin.CompleteResult{}, err
	}
	defer resp.Body.Close()

	var chunk generateChunk
	if err := json.NewDecoder(resp.Body).Decode(&chunk); err != nil {
		return plugin.CompleteResult{}, fmt.Errorf("decode ollama response: %w", err)
	}
	if chunk.Error != "" {
		return plugin.CompleteResult{}, fmt.Errorf("ollama: %s", chunk.Error)
	}
	return plugin.CompleteResult{
		Text:      chunk.Response,
		Model:     p.model,
		TokensIn:  chunk.PromptEvalCount,
		TokensOut: chunk.EvalCount,
	}, nil
}

func (p provider) CompleteStream(ctx context.Context, req plugin.CompleteRequest, onChunk func(plugin.Chunk) error) error {
	resp, err := p.do(ctx, req, true)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		var chunk generateChunk
		if err := json.Unmarshal(line, &chunk); err != nil {
			return fmt.Errorf("decode ollama stream: %w", err)
		}
		if chunk.Error != "" {
			return fmt.Errorf("ollama: %s", chunk.Error)
		}
		if chunk.Done {
			return onChunk(plugin.Chunk{
				Done:      true,
				Model:     p.model,
				TokensOut: chunk.EvalCount,
			})
		}
		if chunk.Response != "" {
			if err := onChunk(plugin.Chunk{TextDelta: chunk.Response, Model: p.model}); err != nil {
				return err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read ollama stream: %w", err)
	}
	// Stream ended without a done chunk (connection cut) — still signal completion.
	return onChunk(plugin.Chunk{Done: true, Model: p.model})
}

func main() {
	plugin.Serve(newProvider())
}
