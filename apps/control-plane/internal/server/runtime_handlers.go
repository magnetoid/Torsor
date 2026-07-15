package server

import (
	"net/http"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

type workspaceRuntimeInfo struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Version     string `json:"version"`
	Kind        string `json:"kind"`
}

type workspaceStatusResponse struct {
	WorkspaceID string `json:"workspaceId"`
	ContainerID string `json:"containerId,omitempty"`
	Status      string `json:"status"`
	Message     string `json:"message,omitempty"`
	// HasPreview is true when the workspace exposes a live app the preview proxy can serve.
	HasPreview bool `json:"hasPreview"`
}

func toStatusResponse(st plugin.WorkspaceStatus) workspaceStatusResponse {
	return workspaceStatusResponse{
		WorkspaceID: st.WorkspaceID,
		ContainerID: st.ContainerID,
		Status:      st.Status,
		Message:     st.Message,
		HasPreview:  st.PreviewHost != "" && st.PreviewPort != 0,
	}
}

// handleListWorkspaceRuntimes lists workspace runtimes contributed by loaded plugins.
// This only exposes runtime metadata (not any workspace), so it needs no ownership check.
func (s *Server) handleListWorkspaceRuntimes(w http.ResponseWriter, _ *http.Request) {
	infos := s.host.WorkspaceRuntimes()
	items := make([]workspaceRuntimeInfo, 0, len(infos))
	for _, i := range infos {
		items = append(items, workspaceRuntimeInfo{
			Name:        i.Name,
			DisplayName: i.DisplayName,
			Version:     i.Version,
			Kind:        i.Kind,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// pickRuntime resolves which loaded runtime to use: an explicit name, else the configured
// default, else the sole loaded runtime. Returns the runtime, its resolved name, and ok.
func (s *Server) pickRuntime(name string) (plugin.WorkspaceRuntime, string, bool) {
	if name == "" {
		name = s.cfg.DefaultRuntime
	}
	if name == "" {
		if rts := s.host.WorkspaceRuntimes(); len(rts) == 1 {
			name = rts[0].Name
		}
	}
	if name == "" {
		return nil, "", false
	}
	rt, ok := s.host.WorkspaceRuntime(name)
	return rt, name, ok
}
