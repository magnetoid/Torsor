// Command openai-model is a Torsor ModelProvider plugin for the OpenAI API, built on the
// shared internal/openaicompat implementation. BYO-first: starts without a key; per-user
// keys (secret OPENAI_API_KEY) are the normal path.
//
// Configuration (environment):
//
//	OPENAI_API_KEY   optional host-wide default key
//	OPENAI_MODEL     model id (default gpt-4o-mini)
//	OPENAI_BASE_URL  API base (default https://api.openai.com/v1)
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
		Name:        "openai",
		DisplayName: "OpenAI",
		BaseURL:     envOr("OPENAI_BASE_URL", "https://api.openai.com/v1"),
		Model:       envOr("OPENAI_MODEL", "gpt-4o-mini"),
		HostKey:     strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
	}))
}
