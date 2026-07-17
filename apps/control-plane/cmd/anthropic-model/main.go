// Command anthropic-model is a Torsor ModelProvider plugin backed by the Anthropic
// Messages API (BYO-key: hosted models are opt-in, never required — the free default is
// cmd/ollama-model). It follows the exact shape of cmd/mock-model: implement
// plugin.ModelProvider and call plugin.Serve.
//
// Configuration (environment):
//
//	ANTHROPIC_API_KEY  optional host-wide default key. The plugin starts WITHOUT it —
//	                   per-user BYO keys (CompleteRequest.APIKey, from encrypted secrets)
//	                   are the normal path; requests fail with a clear message when
//	                   neither is present.
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
	hostKey string // optional host-wide default; "" => BYO-key only
	model   string
}

func newProvider(apiKey, model string) provider {
	return provider{hostKey: apiKey, model: model}
}

// errNoKey is what a keyless request gets — it tells the user exactly how to fix it.
var errNoKey = fmt.Errorf("anthropic: no API key — add your Anthropic key in Settings → API Keys (hosted models are BYO-key)")

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

// clientFor returns a client using the caller's per-request BYO key when provided,
// otherwise the plugin's optional host-env key. This is what makes hosted models opt-in
// per user — the server operator never needs a key of their own.
func (p provider) clientFor(req plugin.CompleteRequest) (anthropic.Client, error) {
	if key := strings.TrimSpace(req.APIKey); key != "" {
		return anthropic.NewClient(option.WithAPIKey(key)), nil
	}
	if p.hostKey != "" {
		return anthropic.NewClient(option.WithAPIKey(p.hostKey)), nil
	}
	return anthropic.Client{}, errNoKey
}

func (p provider) Complete(ctx context.Context, req plugin.CompleteRequest) (plugin.CompleteResult, error) {
	client, err := p.clientFor(req)
	if err != nil {
		return plugin.CompleteResult{}, err
	}
	msg, err := client.Messages.New(ctx, p.params(req))
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
	client, err := p.clientFor(req)
	if err != nil {
		return err
	}
	stream := client.Messages.NewStreaming(ctx, p.params(req))
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
	// The host key is OPTIONAL: without it the plugin still serves, and each user's
	// encrypted BYO key (passed per request) unlocks it. Free/local default remains
	// cmd/ollama-model; hosted providers are opt-in, never required.
	apiKey := strings.TrimSpace(os.Getenv("ANTHROPIC_API_KEY"))
	model := strings.TrimSpace(os.Getenv("ANTHROPIC_MODEL"))
	if model == "" {
		model = defaultModel
	}
	plugin.Serve(newProvider(apiKey, model))
}
