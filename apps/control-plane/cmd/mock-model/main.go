// Command mock-model is a reference Torsor ModelProvider plugin. It implements the
// capability with a deterministic, dependency-free response so the plugin host can be
// exercised end-to-end without an external model service. Real providers (Ollama,
// Claude, OpenAI, ...) follow this exact shape: implement plugin.ModelProvider and call
// plugin.Serve.
package main

import (
	"context"
	"strings"
	"time"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

type provider struct{}

func (provider) Info(_ context.Context) (plugin.ModelInfo, error) {
	return plugin.ModelInfo{
		Name:        "mock",
		DisplayName: "Mock model (reference plugin)",
		Version:     "0.1.0",
		Kind:        "model_provider",
	}, nil
}

func (provider) Complete(_ context.Context, req plugin.CompleteRequest) (plugin.CompleteResult, error) {
	text := "[mock] " + strings.TrimSpace(req.Prompt)
	return plugin.CompleteResult{
		Text:      text,
		Model:     "mock-1",
		TokensIn:  int32(len(strings.Fields(req.Prompt))),
		TokensOut: int32(len(strings.Fields(text))),
	}, nil
}

func (provider) CompleteStream(ctx context.Context, req plugin.CompleteRequest, onChunk func(plugin.Chunk) error) error {
	words := strings.Fields("[mock] " + strings.TrimSpace(req.Prompt))
	for i, word := range words {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		delta := word
		if i < len(words)-1 {
			delta += " "
		}
		if err := onChunk(plugin.Chunk{TextDelta: delta, Model: "mock-1"}); err != nil {
			return err
		}
		time.Sleep(20 * time.Millisecond) // simulate token cadence
	}
	return onChunk(plugin.Chunk{Done: true, Model: "mock-1", TokensOut: int32(len(words))})
}

func main() {
	plugin.Serve(provider{})
}
