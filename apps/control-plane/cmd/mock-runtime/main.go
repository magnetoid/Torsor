// Command mock-runtime is a reference Torsor WorkspaceRuntime plugin. It implements the
// capability with a deterministic, dependency-free in-memory workspace (no Docker) so the
// plugin host can be exercised end-to-end without a container engine. The real runtimes
// (Docker, Firecracker, Kubernetes, ...) follow this exact shape: implement
// plugin.WorkspaceRuntime and call plugin.ServeRuntime.
package main

import (
	"context"
	"fmt"
	"path"
	"sort"
	"strings"
	"sync"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// runtime is an in-memory mock: each workspace is a status plus a flat path->content map.
type runtime struct {
	mu         sync.Mutex
	workspaces map[string]*workspace
}

type workspace struct {
	status string
	files  map[string][]byte
}

func newRuntime() *runtime {
	return &runtime{workspaces: map[string]*workspace{}}
}

func (r *runtime) Info(_ context.Context) (plugin.RuntimeInfo, error) {
	return plugin.RuntimeInfo{
		Name:        "mock",
		DisplayName: "Mock workspace runtime (reference plugin)",
		Version:     "0.1.0",
		Kind:        "workspace_runtime",
	}, nil
}

func (r *runtime) CreateWorkspace(_ context.Context, spec plugin.WorkspaceSpec) (plugin.WorkspaceStatus, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.workspaces[spec.ID] = &workspace{status: "created", files: map[string][]byte{}}
	return plugin.WorkspaceStatus{
		WorkspaceID: spec.ID,
		ContainerID: "mock-" + spec.ID,
		Status:      "created",
		Message:     "in-memory workspace from image " + spec.Image,
	}, nil
}

func (r *runtime) transition(workspaceID, status string) (plugin.WorkspaceStatus, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ws, ok := r.workspaces[workspaceID]
	if !ok {
		return plugin.WorkspaceStatus{WorkspaceID: workspaceID, Status: "unknown"}, fmt.Errorf("workspace %q not found", workspaceID)
	}
	if status == "destroyed" {
		delete(r.workspaces, workspaceID)
	} else {
		ws.status = status
	}
	return plugin.WorkspaceStatus{WorkspaceID: workspaceID, ContainerID: "mock-" + workspaceID, Status: status}, nil
}

func (r *runtime) StartWorkspace(_ context.Context, id string) (plugin.WorkspaceStatus, error) {
	return r.transition(id, "running")
}

func (r *runtime) StopWorkspace(_ context.Context, id string, _ int32) (plugin.WorkspaceStatus, error) {
	return r.transition(id, "stopped")
}

func (r *runtime) DestroyWorkspace(_ context.Context, id string) (plugin.WorkspaceStatus, error) {
	return r.transition(id, "destroyed")
}

func (r *runtime) StatusWorkspace(_ context.Context, id string) (plugin.WorkspaceStatus, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ws, ok := r.workspaces[id]
	if !ok {
		return plugin.WorkspaceStatus{WorkspaceID: id, Status: "unknown"}, nil
	}
	return plugin.WorkspaceStatus{WorkspaceID: id, ContainerID: "mock-" + id, Status: ws.status}, nil
}

func (r *runtime) Exec(ctx context.Context, spec plugin.ExecSpec, onChunk func(plugin.ExecChunk) error) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	line := fmt.Sprintf("[mock %s] $ %s\n", spec.WorkspaceID, strings.Join(spec.Command, " "))
	if err := onChunk(plugin.ExecChunk{Stdout: line}); err != nil {
		return err
	}
	return onChunk(plugin.ExecChunk{ExitCode: 0, Done: true})
}

func (r *runtime) ListFiles(_ context.Context, workspaceID, dir string) ([]plugin.FileEntry, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ws, ok := r.workspaces[workspaceID]
	if !ok {
		return nil, fmt.Errorf("workspace %q not found", workspaceID)
	}
	dir = strings.TrimSuffix(dir, "/")
	entries := make([]plugin.FileEntry, 0, len(ws.files))
	for p, content := range ws.files {
		if dir != "" && !strings.HasPrefix(p, dir+"/") {
			continue
		}
		entries = append(entries, plugin.FileEntry{Name: path.Base(p), Path: p, IsDir: false, Size: int64(len(content))})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Path < entries[j].Path })
	return entries, nil
}

func (r *runtime) ReadFile(_ context.Context, workspaceID, p string) ([]byte, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ws, ok := r.workspaces[workspaceID]
	if !ok {
		return nil, fmt.Errorf("workspace %q not found", workspaceID)
	}
	content, ok := ws.files[p]
	if !ok {
		return nil, fmt.Errorf("file %q not found", p)
	}
	return content, nil
}

func (r *runtime) WriteFile(_ context.Context, workspaceID, p string, content []byte, _ bool) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	ws, ok := r.workspaces[workspaceID]
	if !ok {
		return fmt.Errorf("workspace %q not found", workspaceID)
	}
	ws.files[p] = content
	return nil
}

func main() {
	plugin.ServeRuntime(newRuntime())
}
