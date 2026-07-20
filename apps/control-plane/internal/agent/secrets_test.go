package agent

import (
	"context"
	"strings"
	"testing"
)

// fakeVault is an in-memory SecretVault for tests.
type fakeVault map[string]string

func (v fakeVault) Value(_ context.Context, name string) (string, bool) {
	s, ok := v[name]
	return s, ok && s != ""
}
func (v fakeVault) All(_ context.Context) map[string]string { return v }

func TestExpandSecrets(t *testing.T) {
	vault := fakeVault{"API_KEY": "sk-live-abc123xyz"}
	out, missing := expandSecrets(context.Background(), vault,
		`curl -H "Authorization: Bearer {{secret:API_KEY}}" https://x/ && echo {{secret:NOPE}}`)
	if !strings.Contains(out, "sk-live-abc123xyz") {
		t.Errorf("known placeholder not expanded: %q", out)
	}
	if !strings.Contains(out, "{{secret:NOPE}}") {
		t.Errorf("unknown placeholder must stay intact: %q", out)
	}
	if len(missing) != 1 || missing[0] != "NOPE" {
		t.Errorf("missing = %v, want [NOPE]", missing)
	}
	// Nil vault: no expansion at all.
	out, missing = expandSecrets(context.Background(), nil, "{{secret:API_KEY}}")
	if out != "{{secret:API_KEY}}" || missing != nil {
		t.Errorf("nil vault must be a no-op")
	}
}

func TestScrubSecretsRedactsValues(t *testing.T) {
	vals := map[string]string{"API_KEY": "sk-live-abc123xyz", "PIN": "1234"}
	out := scrubSecrets("token=sk-live-abc123xyz used; pin=1234", vals)
	if strings.Contains(out, "sk-live-abc123xyz") {
		t.Errorf("secret value leaked: %q", out)
	}
	if !strings.Contains(out, "{{secret:API_KEY}}") {
		t.Errorf("value not replaced with placeholder: %q", out)
	}
	// Short values (<6 chars) are not scrubbed — redacting them would mangle output.
	if !strings.Contains(out, "pin=1234") {
		t.Errorf("short value should not be scrubbed: %q", out)
	}
}

// End-to-end through the loop: the model uses a placeholder, the executed command carries
// the real value, and output echoing the value comes back redacted.
func TestRunSecretsNeverEnterModelContext(t *testing.T) {
	secret := "sk-live-SUPERSECRET99"
	model := &scriptedModel{responses: []string{
		`{"thought":"call the api","action":{"tool":"run","args":{"command":"echo {{secret:API_KEY}}"}}}`,
		`{"thought":"done","final":"called it"}`,
	}}
	ws := newMemWorkspace()
	ws.execOut = secret + "\n" // the command echoes the real value
	cfg := Config{WorkspaceID: "p1", Secrets: fakeVault{"API_KEY": secret}}

	var events []Event
	if _, err := NewRunner(model, ws, cfg).Run(context.Background(), "use the api key", collect(&events)); err != nil {
		t.Fatalf("Run error: %v", err)
	}

	// The executed command got the real value…
	if len(ws.execCmds) != 1 || !strings.Contains(ws.execCmds[0][2], secret) {
		t.Errorf("executed command missing expanded secret: %v", ws.execCmds)
	}
	// …but no model prompt ever contains it…
	for i, p := range model.prompts {
		if strings.Contains(p, secret) {
			t.Errorf("secret leaked into model prompt %d: %q", i, p)
		}
	}
	for _, sys := range model.systems {
		if strings.Contains(sys, secret) {
			t.Errorf("secret leaked into system prompt")
		}
	}
	// …and streamed events (what the UI shows) are scrubbed too.
	for _, e := range events {
		if strings.Contains(e.Result, secret) || strings.Contains(e.Text, secret) {
			t.Errorf("secret leaked into event: %+v", e)
		}
	}
	// The prompt advertises the secret NAME (never the value).
	if !strings.Contains(model.systems[0], "API_KEY") {
		t.Errorf("secret name not advertised in system prompt")
	}
}

// write_file expands placeholders so the agent can compose .env files it can't read back.
func TestRunWriteFileExpandsSecrets(t *testing.T) {
	secret := "pk-test-VALUE123456"
	model := &scriptedModel{responses: []string{
		`{"thought":"write env","action":{"tool":"write_file","args":{"path":".env","content":"KEY={{secret:PK}}\n"}}}`,
		`{"thought":"read it back","action":{"tool":"read_file","args":{"path":".env"}}}`,
		`{"thought":"done","final":"env written"}`,
	}}
	ws := newMemWorkspace()
	cfg := Config{WorkspaceID: "p1", Secrets: fakeVault{"PK": secret}}
	if _, err := NewRunner(model, ws, cfg).Run(context.Background(), "write env", nil); err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if !strings.Contains(ws.files[".env"], secret) {
		t.Errorf("file must hold the real value, got %q", ws.files[".env"])
	}
	// Reading the file back must come back redacted in the model's next prompt.
	for _, p := range model.prompts {
		if strings.Contains(p, secret) {
			t.Errorf("secret leaked into prompt via read_file: %q", p)
		}
	}
}

// A destructive command is refused as an observation; nothing executes.
func TestRunGuardBlocksDestructiveCommand(t *testing.T) {
	model := &scriptedModel{responses: []string{
		`{"thought":"clean up","action":{"tool":"run","args":{"command":"rm -rf /"}}}`,
		`{"thought":"ok","final":"stopped"}`,
	}}
	ws := newMemWorkspace()
	cfg := Config{WorkspaceID: "p1", GuardCommands: true}
	if _, err := NewRunner(model, ws, cfg).Run(context.Background(), "t", nil); err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if len(ws.execCmds) != 0 {
		t.Errorf("blocked command must not execute, got %v", ws.execCmds)
	}
	if !strings.Contains(model.prompts[1], "BLOCKED by safety policy") {
		t.Errorf("block must come back as an observation: %q", model.prompts[1])
	}
	// Guard off (defaults) → command executes.
	model2 := &scriptedModel{responses: []string{
		`{"thought":"x","action":{"tool":"run","args":{"command":"rm -rf /"}}}`,
		`{"thought":"ok","final":"done"}`,
	}}
	ws2 := newMemWorkspace()
	if _, err := NewRunner(model2, ws2, Config{WorkspaceID: "p1"}).Run(context.Background(), "t", nil); err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if len(ws2.execCmds) != 1 {
		t.Errorf("without guard the command should run (workspace-level trust), got %v", ws2.execCmds)
	}
}
