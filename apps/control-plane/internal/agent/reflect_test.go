package agent

import (
	"context"
	"testing"
)

// A valid reflection response is parsed into structured memory + skill proposals.
func TestReflectParsesProposals(t *testing.T) {
	model := &scriptedModel{responses: []string{
		`{"memories":[{"content":"The API base is /api/v1","kind":"decision"},{"content":"Uses Postgres","kind":"fact"}],"skills":[{"name":"Zod","description":"validation","instruction":"Always validate forms with Zod."}]}`,
	}}
	p, err := Reflect(context.Background(), model, ReflectInput{Task: "wire the client", ActionLog: "wrote client.ts", Final: "done"})
	if err != nil {
		t.Fatalf("Reflect error: %v", err)
	}
	if len(p.Memories) != 2 {
		t.Fatalf("memories = %d, want 2", len(p.Memories))
	}
	if p.Memories[0].Content != "The API base is /api/v1" || p.Memories[0].Kind != "decision" {
		t.Errorf("unexpected first memory: %+v", p.Memories[0])
	}
	if len(p.Skills) != 1 || p.Skills[0].Name != "Zod" || p.Skills[0].Instruction != "Always validate forms with Zod." {
		t.Errorf("unexpected skills: %+v", p.Skills)
	}
	// The reflection prompt (system) must actually be sent so the model knows the contract.
	if len(model.systems) == 0 || model.systems[0] == "" {
		t.Error("reflection system prompt was not sent")
	}
}

// Empty and unparseable model output degrade to empty proposals, never an error.
func TestReflectHandlesEmptyAndGarbage(t *testing.T) {
	empty := &scriptedModel{responses: []string{`{"memories":[],"skills":[]}`}}
	p, err := Reflect(context.Background(), empty, ReflectInput{Task: "t", Final: "f"})
	if err != nil || len(p.Memories) != 0 || len(p.Skills) != 0 {
		t.Errorf("empty: got err=%v memories=%d skills=%d, want nil/0/0", err, len(p.Memories), len(p.Skills))
	}

	garbage := &scriptedModel{responses: []string{`I could not find anything to reflect on, sorry!`}}
	p, err = Reflect(context.Background(), garbage, ReflectInput{Task: "t", Final: "f"})
	if err != nil {
		t.Errorf("garbage should not error, got %v", err)
	}
	if len(p.Memories) != 0 || len(p.Skills) != 0 {
		t.Errorf("garbage: expected empty proposals, got %+v", p)
	}
}
