package agent

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

// Secret placeholders: the model writes {{secret:NAME}}; the loop expands the real value
// only at tool-execution time and scrubs any stored value back to its placeholder in every
// observation. The invariant (the llmsecrets pattern): secret VALUES never appear in a
// model prompt — not in the system prompt, not in the transcript, not in an observation.

var secretPlaceholderRe = regexp.MustCompile(`\{\{secret:([A-Za-z0-9_.-]+)\}\}`)

// secretsPrompt advertises placeholder-based secret use when the server wires a vault.
const secretsPromptFmt = `

SECRETS: this user has stored secrets you may USE but can never SEE. Available secret names: %s
- To use one in a command or file, write the placeholder {{secret:NAME}} — the real value is substituted at execution time, e.g.:
  run: {"command": "curl -H \"Authorization: Bearer {{secret:OPENWEATHER_API_KEY}}\" https://api.example.com"}
- Never try to print, echo, or read secret values; output containing them is redacted back to placeholders before you see it.
- If a needed secret is missing, ask the user (in your final message) to add it under Settings → Secrets.`

// expandSecrets replaces {{secret:NAME}} placeholders with real values via the vault.
// Unknown names are left as-is and reported so the observation can tell the agent.
func expandSecrets(ctx context.Context, vault SecretVault, text string) (string, []string) {
	if vault == nil {
		return text, nil
	}
	var missing []string
	out := secretPlaceholderRe.ReplaceAllStringFunc(text, func(m string) string {
		name := secretPlaceholderRe.FindStringSubmatch(m)[1]
		if v, ok := vault.Value(ctx, name); ok && v != "" {
			return v
		}
		missing = append(missing, name)
		return m
	})
	return out, missing
}

// scrubSecrets replaces every stored secret value found in text with its placeholder, so
// tool output (a cat of .env, an echoed token, a verbose curl) can't leak a stored value
// into the model's context. Values shorter than 6 chars are skipped — redacting e.g. "dev"
// would mangle ordinary output while protecting nothing meaningful.
func scrubSecrets(text string, values map[string]string) string {
	for name, v := range values {
		if len(v) < 6 {
			continue
		}
		if strings.Contains(text, v) {
			text = strings.ReplaceAll(text, v, "{{secret:"+name+"}}")
		}
	}
	return text
}

// secretNames renders the sorted-ish name list for the prompt appendix (values never).
func secretNames(values map[string]string) string {
	if len(values) == 0 {
		return "(none stored yet)"
	}
	names := make([]string, 0, len(values))
	for n := range values {
		names = append(names, n)
	}
	return strings.Join(names, ", ")
}

// missingSecretsNote formats the observation suffix for unresolved placeholders.
func missingSecretsNote(missing []string) string {
	if len(missing) == 0 {
		return ""
	}
	return fmt.Sprintf("\nnote: no stored secret named %s — the placeholder was NOT expanded. Ask the user to add it under Settings → Secrets.", strings.Join(missing, ", "))
}
