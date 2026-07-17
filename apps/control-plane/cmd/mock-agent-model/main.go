// Command mock-agent-model is a reference ModelProvider plugin that speaks the Torsor
// agent's JSON-step protocol instead of returning free text. It lets the full agentic
// loop (internal/agent) be exercised end-to-end against a real gRPC plugin + the
// mock-runtime, with no external model service — useful for local dev and CI smoke tests.
//
// It is deterministic: it counts how many "Observation:" lines are already in the prompt
// transcript to decide the next step, driving a fixed scenario (look around → write a
// file → run it → finish). Real providers return whatever the model generates; this one
// just guarantees valid, progressing steps.
package main

import (
	"context"
	"strings"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

type provider struct{}

func (provider) Info(_ context.Context) (plugin.ModelInfo, error) {
	return plugin.ModelInfo{
		Name:        "mock-agent",
		DisplayName: "Mock agent model (JSON-step reference)",
		Version:     "0.1.0",
		Kind:        "model_provider",
	}, nil
}

// script is the fixed sequence of JSON steps, one per prompt the agent sends. Each entry
// is a complete agent step object. The tail exercises the self-verification (reflection)
// flow: after editing and running, the agent probes the live app with check_app before
// declaring the task done — the same edit → verify → finish contract real runs follow.
var script = []string{
	`{"thought":"Let me see what's already in the workspace.","action":{"tool":"list_files","args":{"path":""}}}`,
	`{"thought":"I'll create a small hello program.","action":{"tool":"write_file","args":{"path":"hello.js","content":"console.log('Hello from Torsor Agent');"}}}`,
	`{"thought":"Run it to verify it works.","action":{"tool":"run","args":{"command":"node hello.js"}}}`,
	`{"thought":"Finally, verify the app itself responds before finishing.","action":{"tool":"check_app","args":{}}}`,
	`{"thought":"Everything checks out; the task is complete.","final":"Created hello.js, ran it, and verified the app endpoint. This is a real agent loop over your workspace."}`,
}

func (provider) Complete(_ context.Context, req plugin.CompleteRequest) (plugin.CompleteResult, error) {
	// Advance the script by the number of observations already recorded in the transcript.
	idx := strings.Count(req.Prompt, "Observation:")
	if idx >= len(script) {
		idx = len(script) - 1
	}
	text := script[idx]
	return plugin.CompleteResult{
		Text:      text,
		Model:     "mock-agent-1",
		TokensIn:  int32(len(strings.Fields(req.Prompt))),
		TokensOut: int32(len(strings.Fields(text))),
	}, nil
}

func (p provider) CompleteStream(_ context.Context, req plugin.CompleteRequest, onChunk func(plugin.Chunk) error) error {
	res, err := p.Complete(context.Background(), req)
	if err != nil {
		return err
	}
	if err := onChunk(plugin.Chunk{TextDelta: res.Text, Model: res.Model}); err != nil {
		return err
	}
	return onChunk(plugin.Chunk{Done: true, Model: res.Model, TokensOut: res.TokensOut})
}

func main() {
	plugin.Serve(provider{})
}
