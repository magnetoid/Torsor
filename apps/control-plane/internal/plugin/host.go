package plugin

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"sync"

	hclog "github.com/hashicorp/go-hclog"
	goplugin "github.com/hashicorp/go-plugin"
)

type loadedModel struct {
	client   *goplugin.Client
	provider ModelProvider
	info     ModelInfo
}

// Host launches and tracks plugin subprocesses and exposes their capabilities to the
// rest of the control plane.
type Host struct {
	logger hclog.Logger
	mu     sync.RWMutex
	models map[string]*loadedModel
}

// NewHost returns an empty host. Plugins are loaded via LoadModelProvider.
func NewHost() *Host {
	return &Host{
		logger: hclog.New(&hclog.LoggerOptions{Name: "plugin-host", Output: os.Stderr, Level: hclog.Info}),
		models: map[string]*loadedModel{},
	}
}

// LoadModelProvider launches a plugin executable, verifies it implements ModelProvider,
// and registers it under its reported name.
func (h *Host) LoadModelProvider(ctx context.Context, path string) (ModelInfo, error) {
	client := goplugin.NewClient(&goplugin.ClientConfig{
		HandshakeConfig:  Handshake,
		Plugins:          PluginSet(nil), // client side only needs the GRPCClient adapter
		Cmd:              exec.Command(path),
		AllowedProtocols: []goplugin.Protocol{goplugin.ProtocolGRPC},
		Logger:           h.logger,
	})

	rpc, err := client.Client()
	if err != nil {
		client.Kill()
		return ModelInfo{}, fmt.Errorf("start plugin %s: %w", path, err)
	}
	raw, err := rpc.Dispense(ModelProviderKey)
	if err != nil {
		client.Kill()
		return ModelInfo{}, fmt.Errorf("dispense %s: %w", path, err)
	}
	provider, ok := raw.(ModelProvider)
	if !ok {
		client.Kill()
		return ModelInfo{}, fmt.Errorf("plugin %s does not implement ModelProvider", path)
	}
	info, err := provider.Info(ctx)
	if err != nil {
		client.Kill()
		return ModelInfo{}, fmt.Errorf("plugin %s Info: %w", path, err)
	}
	info.Kind = "model_provider"

	h.mu.Lock()
	h.models[info.Name] = &loadedModel{client: client, provider: provider, info: info}
	h.mu.Unlock()
	return info, nil
}

// ModelProviders returns metadata for all loaded providers, sorted by name.
func (h *Host) ModelProviders() []ModelInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]ModelInfo, 0, len(h.models))
	for _, m := range h.models {
		out = append(out, m.info)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// ModelProvider returns a loaded provider by name.
func (h *Host) ModelProvider(name string) (ModelProvider, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	m, ok := h.models[name]
	if !ok {
		return nil, false
	}
	return m.provider, true
}

// Close terminates all plugin subprocesses.
func (h *Host) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, m := range h.models {
		m.client.Kill()
	}
	h.models = map[string]*loadedModel{}
}

// Serve is called by a plugin binary's main() to expose its ModelProvider over gRPC.
func Serve(impl ModelProvider) {
	goplugin.Serve(&goplugin.ServeConfig{
		HandshakeConfig: Handshake,
		Plugins:         PluginSet(impl),
		GRPCServer:      goplugin.DefaultGRPCServer,
	})
}
