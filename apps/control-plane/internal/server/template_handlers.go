package server

import (
	"context"
	"net/http"

	"github.com/magnetoid/torsor/control-plane/internal/appdetect"
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
	var tmpl Template
	if templateID != nil && *templateID != "" {
		t, ok := templateByID(*templateID)
		if !ok {
			writeError(w, http.StatusBadRequest, "Unknown template: "+*templateID)
			return
		}
		tmpl = t
	} else {
		// Zero-config path: no template — detect the stack from the project's own files
		// (package.json, requirements.txt, go.mod, index.html, …) and synthesize the same
		// Image/Setup/Dev contract, so imported or hand-rolled projects boot to a live
		// preview exactly like templated ones.
		detected, ok := s.detectProjectPlan(r.Context(), projectID)
		if !ok {
			writeError(w, http.StatusBadRequest,
				"Couldn't detect how to run this project. Add a package.json (with a dev/start script), requirements.txt, go.mod, or index.html — or ask the agent to set the project up.")
			return
		}
		tmpl = detected
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

// detectProjectPlan builds a synthetic Template for a template-less project by running
// zero-config stack detection (internal/appdetect) over the project's stored files. The
// project's files are the DB rows (the pre-provision source of truth); the detected plan
// carries the same lifecycle contract templates use.
func (s *Server) detectProjectPlan(ctx context.Context, projectID string) (Template, bool) {
	rows, err := s.pool.Query(ctx,
		`SELECT filename, content FROM project_files WHERE project_id = $1 AND filename = ANY($2)`,
		projectID, appdetect.KeyFiles)
	if err != nil {
		return Template{}, false
	}
	defer rows.Close()
	files := map[string]string{}
	for rows.Next() {
		var name string
		var content *string
		if err := rows.Scan(&name, &content); err != nil {
			return Template{}, false
		}
		if content != nil {
			files[name] = *content
		}
	}
	plan, ok := appdetect.Detect(files, previewPort())
	if !ok {
		return Template{}, false
	}
	return Template{
		ID:    "detected:" + plan.Kind,
		Name:  "Detected: " + plan.Kind,
		Image: plan.Image,
		Setup: plan.Setup,
		Dev:   plan.Dev,
		Build: plan.Build,
		Serve: plan.Serve,
	}, true
}

// detectWorkspacePlan is the runtime-side variant for deploys: the workspace already holds
// the real files (possibly agent-written after provisioning), so read the key files from
// the container instead of the DB.
func detectWorkspacePlan(ctx context.Context, rt plugin.WorkspaceRuntime, projectID string) (Template, bool) {
	files := map[string]string{}
	for _, name := range appdetect.KeyFiles {
		if content, err := rt.ReadFile(ctx, projectID, workspaceDir+"/"+name); err == nil && len(content) > 0 {
			files[name] = string(content)
		}
	}
	plan, ok := appdetect.Detect(files, previewPort())
	if !ok {
		return Template{}, false
	}
	return Template{ID: "detected:" + plan.Kind, Image: plan.Image, Setup: plan.Setup,
		Dev: plan.Dev, Build: plan.Build, Serve: plan.Serve}, true
}
