// Command openrouter-model is a Torsor ModelProvider plugin for OpenRouter (an
// OpenAI-compatible gateway to 100+ models), built on internal/openaicompat. BYO-first:
// starts without a key; per-user keys (secret OPENROUTER_API_KEY) are the normal path.
//
// Configuration (environment):
//
//	OPENROUTER_API_KEY   optional host-wide default key
//	OPENROUTER_MODEL     model id (default openrouter/auto — OpenRouter picks)
//	OPENROUTER_BASE_URL  API base (default https://openrouter.ai/api/v1)
package main

import (
	"os"
	"strings"

	"github.com/magnetoid/torsor/control-plane/internal/openaicompat"
	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func main() {
	plugin.Serve(openaicompat.New(openaicompat.Config{
		Name:        "openrouter",
		DisplayName: "OpenRouter",
		BaseURL:     envOr("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
		Model:       envOr("OPENROUTER_MODEL", "openrouter/auto"),
		HostKey:     strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY")),
	}))
}
