// Command anthropic-model is a Torsor ModelProvider plugin backed by the Anthropic
// Messages API (BYO-key: hosted models are opt-in, never required — the free default is
// cmd/ollama-model). It follows the exact shape of cmd/mock-model: implement
// plugin.ModelProvider and call plugin.Serve.
//
// Configuration (environment):
//
//	ANTHROPIC_API_KEY  required — the plugin refuses to start without it
//	ANTHROPIC_MODEL    model id (default claude-opus-4-8)
package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

const defaultModel = "claude-opus-4-8"

type provider struct {
	client anthropic.Client
	model  string
}

func newProvider(apiKey, model string) provider {
	return provider{
		client: anthropic.NewClient(option.WithAPIKey(apiKey)),
		model:  model,
	}
}

func (p provider) Info(_ context.Context) (plugin.ModelInfo, error) {
	return plugin.ModelInfo{
		Name:        "anthropic",
		DisplayName: "Anthropic (" + p.model + ")",
		Version:     "0.1.0",
		Kind:        "model_provider",
	}, nil
}

func (p provider) params(req plugin.CompleteRequest) anthropic.MessageNewParams {
	maxTokens := int64(req.MaxTokens)
	if maxTokens <= 0 {
		maxTokens = 4096
	}
	params := anthropic.MessageNewParams{
		Model:     anthropic.Model(p.model),
		MaxTokens: maxTokens,
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(req.Prompt)),
		},
		// Adaptive thinking: the model decides when and how much to reason. Sampling
		// params (temperature/top_p) are rejected on current models, so req.Temperature
		// is deliberately not forwarded.
		Thinking: anthropic.ThinkingConfigParamUnion{
			OfAdaptive: &anthropic.ThinkingConfigAdaptiveParam{},
		},
	}
	if req.System != "" {
		params.System = []anthropic.TextBlockParam{{Text: req.System}}
	}
	return params
}

func (p provider) Complete(ctx context.Context, req plugin.CompleteRequest) (plugin.CompleteResult, error) {
	msg, err := p.client.Messages.New(ctx, p.params(req))
	if err != nil {
		return plugin.CompleteResult{}, fmt.Errorf("anthropic: %w", err)
	}
	var text strings.Builder
	for _, block := range msg.Content {
		if block.Type == "text" {
			text.WriteString(block.Text)
		}
	}
	return plugin.CompleteResult{
		Text:      text.String(),
		Model:     string(msg.Model),
		TokensIn:  int32(msg.Usage.InputTokens),
		TokensOut: int32(msg.Usage.OutputTokens),
	}, nil
}

func (p provider) CompleteStream(ctx context.Context, req plugin.CompleteRequest, onChunk func(plugin.Chunk) error) error {
	stream := p.client.Messages.NewStreaming(ctx, p.params(req))
	var tokensOut int64
	for stream.Next() {
		event := stream.Current()
		switch ev := event.AsAny().(type) {
		case anthropic.ContentBlockDeltaEvent:
			if delta, ok := ev.Delta.AsAny().(anthropic.TextDelta); ok && delta.Text != "" {
				if err := onChunk(plugin.Chunk{TextDelta: delta.Text, Model: p.model}); err != nil {
					return err
				}
			}
		case anthropic.MessageDeltaEvent:
			tokensOut = ev.Usage.OutputTokens
		}
	}
	if err := stream.Err(); err != nil {
		return fmt.Errorf("anthropic stream: %w", err)
	}
	return onChunk(plugin.Chunk{Done: true, Model: p.model, TokensOut: int32(tokensOut)})
}

func main() {
	apiKey := strings.TrimSpace(os.Getenv("ANTHROPIC_API_KEY"))
	if apiKey == "" {
		fmt.Fprintln(os.Stderr, "anthropic-model: ANTHROPIC_API_KEY is required (hosted models are BYO-key; use cmd/ollama-model for the free local default)")
		os.Exit(1)
	}
	model := strings.TrimSpace(os.Getenv("ANTHROPIC_MODEL"))
	if model == "" {
		model = defaultModel
	}
	plugin.Serve(newProvider(apiKey, model))
}
