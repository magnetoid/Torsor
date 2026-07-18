package server

import (
	"net/http"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// handleListTemplates returns the starter-template catalog for the project-creation picker.
// Public metadata only (no images/commands) — those are server-side provisioning details.
func (s *Server) handleListTemplates(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"items": templateCatalog})
}

// handlePrepareWorkspace brings a templated project's workspace to a live preview in one
// call: provision with the template's image, start it, scaffold starter files (only if the
// workspace is empty), then launch `setup && dev` detached so the dev server binds the
// preview port. Returns immediately — the client polls GET /workspace for hasPreview (the
// existing BootSteps flow). Ownership-scoped; the runtime workspace id is the project id.
func (s *Server) handlePrepareWorkspace(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}

	var templateID *string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT template FROM projects WHERE id = $1 AND user_id = $2`, projectID, userID(r)).Scan(&templateID); err != nil {
		s.fail(w, r, err)
		return
	}
	if templateID == nil || *templateID == "" {
		writeError(w, http.StatusBadRequest, "This project has no template to prepare")
		return
	}
	tmpl, ok := templateByID(*templateID)
	if !ok {
		writeError(w, http.StatusBadRequest, "Unknown template: "+*templateID)
		return
	}

	rt, runtimeName, ok := s.pickRuntime("")
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "No workspace runtime available")
		return
	}
	ctx := r.Context()

	// Provision with the template's image and a pinned working dir (idempotent on the id).
	st, err := rt.CreateWorkspace(ctx, plugin.WorkspaceSpec{ID: projectID, Image: tmpl.Image, WorkingDir: workspaceDir})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	image := &tmpl.Image
	var containerID *string
	if st.ContainerID != "" {
		containerID = &st.ContainerID
	}
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO workspaces (project_id, user_id, runtime, container_id, image, status)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (project_id) DO UPDATE SET
		   runtime = EXCLUDED.runtime,
		   container_id = EXCLUDED.container_id,
		   image = EXCLUDED.image,
		   status = EXCLUDED.status,
		   updated_at = NOW()`,
		projectID, userID(r), runtimeName, containerID, image, st.Status); err != nil {
		s.fail(w, r, err)
		return
	}

	// Start the container so file ops and the dev launch can run inside it.
	if _, err := rt.StartWorkspace(ctx, projectID); err != nil {
		s.fail(w, r, err)
		return
	}

	// Scaffold starter files only when the workspace dir is empty (never clobber real work).
	if entries, err := rt.ListFiles(ctx, projectID, workspaceDir); err == nil && len(entries) == 0 {
		for path, content := range tmpl.Files {
			if err := rt.WriteFile(ctx, projectID, workspaceDir+"/"+path, []byte(content), true); err != nil {
				s.fail(w, r, err)
				return
			}
		}
	}

	// Write a run script (setup && dev) and launch it detached so prepare returns fast and
	// the dev server keeps serving after this exec exits. The client then polls for preview.
	inner := tmpl.Dev
	if tmpl.Setup != "" {
		inner = tmpl.Setup + " && " + tmpl.Dev
	}
	runScript := "cd " + workspaceDir + " && " + inner + "\n"
	if err := rt.WriteFile(ctx, projectID, workspaceDir+"/.torsor-run.sh", []byte(runScript), true); err != nil {
		s.fail(w, r, err)
		return
	}
	launch := "nohup sh " + workspaceDir + "/.torsor-run.sh >/tmp/torsor-dev.log 2>&1 & echo launched"
	if err := rt.Exec(ctx, plugin.ExecSpec{
		WorkspaceID: projectID,
		WorkingDir:  workspaceDir,
		Command:     []string{"sh", "-c", launch},
	}, func(plugin.ExecChunk) error { return nil }); err != nil {
		s.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "template": tmpl.ID, "status": st.Status})
}
