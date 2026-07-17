// Command deepseek-model is a Torsor ModelProvider plugin for the DeepSeek API (an
// OpenAI-compatible dialect), built on internal/openaicompat. BYO-first: starts without a
// key; per-user keys (secret DEEPSEEK_API_KEY) are the normal path.
//
// Configuration (environment):
//
//	DEEPSEEK_API_KEY   optional host-wide default key
//	DEEPSEEK_MODEL     model id (default deepseek-chat)
//	DEEPSEEK_BASE_URL  API base (default https://api.deepseek.com/v1)
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
		Name:        "deepseek",
		DisplayName: "DeepSeek",
		BaseURL:     envOr("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
		Model:       envOr("DEEPSEEK_MODEL", "deepseek-chat"),
		HostKey:     strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")),
	}))
}
