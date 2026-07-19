package agent

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// Reflection turns a completed agent run into candidate durable learnings — memories (facts,
// decisions, preferences) and skills (reusable conventions) — that the user later approves in
// the Learning tab. It is one model call over a compact view of the run, kept DB-agnostic (it
// depends only on the same Model interface the loop uses) so it is unit-tested with a fake.

// MemoryProposal is a candidate memory to keep.
type MemoryProposal struct {
	Content string `json:"content"`
	Kind    string `json:"kind"` // note | fact | decision | preference
}

// SkillProposal is a candidate reusable instruction (skill).
type SkillProposal struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Instruction string `json:"instruction"`
}

// Proposals is the structured reflection output.
type Proposals struct {
	Memories []MemoryProposal `json:"memories"`
	Skills   []SkillProposal  `json:"skills"`
}

// ReflectInput is the compact view of the finished run the reflection considers.
type ReflectInput struct {
	Task      string // the user's original task
	ActionLog string // short log of the tool actions taken
	Final     string // the agent's final answer
	APIKey    string // optional per-user BYO key forwarded to the model provider
}

const reflectSystemPrompt = `You are the reflection step of a coding agent. Given a COMPLETED task, extract only DURABLE, reusable learnings that would help future runs on THIS project. Respond with exactly ONE JSON object and nothing else — no prose, no code fences:

{"memories": [{"content": "<concise durable fact/decision/preference>", "kind": "note|fact|decision|preference"}], "skills": [{"name": "<short name>", "description": "<one line>", "instruction": "<a reusable convention to always follow>"}]}

Rules:
- Only include things worth remembering across runs: project conventions, intentional decisions, the user's stated preferences, non-obvious facts you discovered. A skill is a rule the agent should ALWAYS follow (e.g. "Always validate forms with Zod").
- Do NOT include transient state, one-off details, secrets, or restatements of the task.
- Keep each entry short and specific. If nothing is worth keeping, return {"memories": [], "skills": []}.
- Respond with ONE JSON object only.`

// Reflect asks the model to extract durable learnings from a finished run. Best-effort: it
// returns empty Proposals (not an error) when the model proposes nothing or emits unparseable
// output, so a reflection hiccup never disrupts the caller.
func Reflect(ctx context.Context, model Model, in ReflectInput) (Proposals, error) {
	prompt := fmt.Sprintf("Task:\n%s\n\nWhat the agent did:\n%s\n\nFinal answer:\n%s\n\nReturn the JSON now.",
		in.Task, in.ActionLog, in.Final)
	res, err := model.Complete(ctx, plugin.CompleteRequest{
		Prompt:    prompt,
		System:    reflectSystemPrompt,
		MaxTokens: 1024,
		APIKey:    in.APIKey,
	})
	if err != nil {
		return Proposals{}, err
	}
	raw := extractJSONObject(res.Text)
	if raw == "" {
		return Proposals{}, nil
	}
	var p Proposals
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return Proposals{}, nil // unparseable → learned nothing (best-effort)
	}
	return p, nil
}
