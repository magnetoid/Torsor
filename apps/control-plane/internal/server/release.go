package server

import (
	"context"
	"fmt"
	"strings"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// Releases: a deploy produces an immutable artifact that runs in its own container.
//
// The old model deployed the dev workspace itself, so production shared a container (and a
// port) with the editor and the agent. Editing, restarting, or crashing the workspace took the
// live site with it, and because nothing was versioned there was nothing to roll back to.
//
// A deploy now snapshots the workspace, forks that snapshot into a separate release container,
// and builds+serves there. The dev workspace is free the moment the snapshot is taken. Rolling
// back re-forks an earlier release's snapshot — no rebuild, and the artifact is byte-identical
// to what was live before.

// releaseWorkspaceID is the workspace id of a project's release container. It is derived, not
// stored: one live release per project, so the id must be stable across restarts and rollbacks.
// The suffix cannot collide with a project UUID, so a release container can never be mistaken
// for (or clobber) a dev workspace.
func releaseWorkspaceID(projectID string) string { return projectID + "-release" }

// buildLogPath is where the release container's build+serve output lands, inside that
// container. Read back via ReadFile so a failed deploy is diagnosable from the UI.
const buildLogPath = "/tmp/torsor-release.log"

// maxBuildLog bounds what is persisted. Build output is unbounded in principle (a webpack
// build can emit megabytes); the tail is what diagnoses a failure.
const maxBuildLog = 64 * 1024

type release struct {
	ID         string    `json:"id"`
	ProjectID  string    `json:"projectId"`
	Number     int       `json:"number"`
	SnapshotID string    `json:"snapshotId"`
	Runtime    string    `json:"runtime"`
	Status     string    `json:"status"`
	Message    string    `json:"message"`
	BuildLog   string    `json:"buildLog"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
	// Live is set by the caller from deployments.release_id — a release is "live" relative to
	// the deployment, not by its own status alone (a superseded release keeps status 'live'
	// history-wise only if we let it, so we don't: see markSuperseded).
	Live bool `json:"live"`
}

const releaseCols = `id, project_id, number, snapshot_id, runtime, status, message, build_log, created_at, updated_at`

func scanRelease(row interface{ Scan(...any) error }) (release, error) {
	var r release
	err := row.Scan(&r.ID, &r.ProjectID, &r.Number, &r.SnapshotID, &r.Runtime,
		&r.Status, &r.Message, &r.BuildLog, &r.CreatedAt, &r.UpdatedAt)
	return r, err
}

// runtimeSupportsSnapshots reports whether the error means "this runtime predates snapshots".
// Runtimes without the capability return gRPC Unimplemented; that is a capability answer, not
// a failure, and it must degrade to the legacy in-workspace deploy rather than break publishing.
func isUnimplemented(err error) bool { return status.Code(err) == codes.Unimplemented }

// createRelease opens a new release row with the next per-project number. The number is
// allocated inside the INSERT so two concurrent deploys cannot claim the same one — the
// UNIQUE (project_id, number) index turns a race into an error rather than a duplicate.
func (s *Server) createRelease(ctx context.Context, projectID, uid, runtimeName, message string) (release, error) {
	return scanRelease(s.pool.QueryRow(ctx,
		`INSERT INTO releases (project_id, user_id, number, runtime, status, message)
		 VALUES ($1, $2, COALESCE((SELECT MAX(number) FROM releases WHERE project_id = $1), 0) + 1, $3, 'building', $4)
		 RETURNING `+releaseCols, projectID, uid, runtimeName, message))
}

func (s *Server) updateReleaseStatus(ctx context.Context, releaseID, st, message string) {
	_, _ = s.pool.Exec(ctx,
		`UPDATE releases SET status = $2, message = $3, updated_at = NOW() WHERE id = $1`,
		releaseID, st, message)
}

func (s *Server) setReleaseSnapshot(ctx context.Context, releaseID, snapshotID string) {
	_, _ = s.pool.Exec(ctx,
		`UPDATE releases SET snapshot_id = $2, updated_at = NOW() WHERE id = $1`, releaseID, snapshotID)
}

func (s *Server) appendBuildLog(ctx context.Context, releaseID, log string) {
	if len(log) > maxBuildLog {
		log = "…(truncated; showing last " + fmt.Sprint(maxBuildLog) + " bytes)…\n" + log[len(log)-maxBuildLog:]
	}
	_, _ = s.pool.Exec(ctx,
		`UPDATE releases SET build_log = $2, updated_at = NOW() WHERE id = $1`, releaseID, log)
}

// activateRelease points the deployment at a release and demotes whatever it replaced. Done in
// one statement pair so the window where two releases both look live is as small as possible.
func (s *Server) activateRelease(ctx context.Context, projectID, uid, releaseID string) error {
	if _, err := s.pool.Exec(ctx,
		`UPDATE releases SET status = 'superseded', updated_at = NOW()
		  WHERE project_id = $1 AND id <> $2 AND status = 'live'`, projectID, releaseID); err != nil {
		return err
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE releases SET status = 'live', updated_at = NOW() WHERE id = $1`, releaseID); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO deployments (project_id, user_id, status, release_id) VALUES ($1, $2, 'running', $3)
		 ON CONFLICT (project_id) DO UPDATE SET status = 'running', release_id = $3, updated_at = NOW()`,
		projectID, uid, releaseID)
	return err
}

// launchRelease is the whole deploy pipeline after the secret gate: snapshot → fork into the
// release container → build+serve → capture the log → activate.
//
// It runs detached from the request (a real build takes minutes), so every failure path must
// record itself on the release row — nobody is watching a response code.
func (s *Server) launchRelease(ctx context.Context, rt plugin.WorkspaceRuntime, projectID, uid, releaseID string, tmpl Template) {
	relWS := releaseWorkspaceID(projectID)

	// 1. Freeze the artifact. Everything after this is independent of further editing, which
	//    is the entire point: the developer gets their workspace back immediately.
	snap, err := rt.SnapshotWorkspace(ctx, projectID, "release "+releaseID)
	if err != nil {
		s.updateReleaseStatus(ctx, releaseID, "failed", "Could not snapshot the workspace: "+err.Error())
		return
	}
	s.setReleaseSnapshot(ctx, releaseID, snap.SnapshotID)

	if err := s.bootReleaseContainer(ctx, rt, projectID, relWS, snap.SnapshotID, tmpl); err != nil {
		s.updateReleaseStatus(ctx, releaseID, "failed", err.Error())
		s.captureBuildLog(ctx, rt, relWS, releaseID)
		return
	}

	s.captureBuildLog(ctx, rt, relWS, releaseID)
	if err := s.activateRelease(ctx, projectID, uid, releaseID); err != nil {
		s.updateReleaseStatus(ctx, releaseID, "failed", "Built, but could not activate: "+err.Error())
		return
	}
	s.logDeploymentEventRelease(ctx, projectID, uid, "deploy", "running", deployPath(projectID), releaseID)
}

// bootReleaseContainer replaces any previous release container with one forked from snapshotID
// and starts build+serve inside it.
//
// The old container is destroyed rather than reused: a release is meant to be reproducible from
// its snapshot, and reusing a container would let the previous release's mutated filesystem
// leak into the new one — exactly the contamination this design removes.
func (s *Server) bootReleaseContainer(ctx context.Context, rt plugin.WorkspaceRuntime, projectID, relWS, snapshotID string, tmpl Template) error {
	if _, err := rt.DestroyWorkspace(ctx, relWS); err != nil && !isUnimplemented(err) {
		// A missing container is the normal first-deploy case, not a failure.
		s.logger.Debug("release: no previous container to destroy", "project", projectID, "err", err)
	}
	if _, err := rt.ForkWorkspace(ctx, projectID, snapshotID, relWS); err != nil {
		return fmt.Errorf("could not create the release container: %w", err)
	}
	if _, err := rt.StartWorkspace(ctx, relWS); err != nil {
		return fmt.Errorf("could not start the release container: %w", err)
	}

	inner := tmpl.Serve
	if tmpl.Build != "" {
		inner = tmpl.Build + " && " + tmpl.Serve
	}
	// `set -e` so a failing build does not fall through to serving a stale or empty output
	// directory — silently serving the previous build is precisely the dishonesty to avoid.
	script := "set -e\ncd " + workspaceDir + "\n" + inner + "\n"
	if err := rt.WriteFile(ctx, relWS, workspaceDir+"/.torsor-release.sh", []byte(script), true); err != nil {
		return fmt.Errorf("could not write the release script: %w", err)
	}
	launch := "nohup sh " + workspaceDir + "/.torsor-release.sh >" + buildLogPath + " 2>&1 & echo launched"
	if err := rt.Exec(ctx, plugin.ExecSpec{
		WorkspaceID: relWS,
		WorkingDir:  workspaceDir,
		Command:     []string{"sh", "-c", launch},
	}, func(plugin.ExecChunk) error { return nil }); err != nil {
		return fmt.Errorf("could not start the build: %w", err)
	}
	return nil
}

// captureBuildLog copies the release container's build output onto the release row. Best
// effort by design: no log must never turn a working deploy into a failed one.
func (s *Server) captureBuildLog(ctx context.Context, rt plugin.WorkspaceRuntime, relWS, releaseID string) {
	// The build is detached, so give it a moment to produce something worth reading. This is
	// a first snapshot of the log, not the final word — handleGetRelease re-reads it live.
	select {
	case <-ctx.Done():
		return
	case <-time.After(3 * time.Second):
	}
	b, err := rt.ReadFile(ctx, relWS, buildLogPath)
	if err != nil {
		return
	}
	s.appendBuildLog(ctx, releaseID, string(b))
}

// liveBuildLog reads the current log straight from the release container, so an in-progress
// build streams rather than showing the three-second-old snapshot taken at launch.
func (s *Server) liveBuildLog(ctx context.Context, projectID string) (string, bool) {
	_, rt, ok := s.resolveWorkspaceRuntime(ctx, projectID)
	if !ok {
		return "", false
	}
	b, err := rt.ReadFile(ctx, releaseWorkspaceID(projectID), buildLogPath)
	if err != nil {
		return "", false
	}
	out := string(b)
	if len(out) > maxBuildLog {
		out = out[len(out)-maxBuildLog:]
	}
	return out, true
}

func (s *Server) logDeploymentEventRelease(ctx context.Context, projectID, uid, action, st, url, releaseID string) {
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO deployment_events (project_id, user_id, action, status, url, release_id)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		projectID, uid, action, st, url, releaseID)
}

// releaseTarget resolves where the public proxy should send traffic for a project: the release
// container when one is serving, otherwise nothing.
//
// The fallback matters. Deployments created before 0026 have no release_id, and their app is
// still running in the dev workspace; refusing to serve them would silently break every
// existing published project on upgrade. So a NULL release_id keeps the legacy behaviour and
// new deploys get isolation.
func (s *Server) releaseTarget(ctx context.Context, projectID string) (workspaceID string, legacy bool, ok bool) {
	var st string
	var releaseID *string
	if err := s.pool.QueryRow(ctx,
		`SELECT status, release_id FROM deployments WHERE project_id = $1`, projectID).Scan(&st, &releaseID); err != nil {
		return "", false, false
	}
	if st != "running" {
		return "", false, false
	}
	if releaseID == nil {
		return projectID, true, true
	}
	return releaseWorkspaceID(projectID), false, true
}

// stopRelease takes the public site down. The release container is stopped rather than
// destroyed so re-publishing is instant and the artifact survives — destroying it would make
// "unpublish" quietly equivalent to "throw away the build".
func (s *Server) stopRelease(ctx context.Context, rt plugin.WorkspaceRuntime, projectID string) {
	if _, err := rt.StopWorkspace(ctx, releaseWorkspaceID(projectID), 5); err != nil && !isUnimplemented(err) {
		s.logger.Debug("release: stop container", "project", projectID, "err", err)
	}
}

// summarizeBuildFailure turns raw build output into the one line worth showing next to a
// failed release. Callers still get the full log; this is the headline.
func summarizeBuildFailure(log string) string {
	lines := strings.Split(strings.TrimSpace(log), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		l := strings.TrimSpace(lines[i])
		if l == "" {
			continue
		}
		low := strings.ToLower(l)
		if strings.Contains(low, "error") || strings.Contains(low, "failed") || strings.Contains(low, "not found") {
			return l
		}
	}
	if len(lines) > 0 && lines[len(lines)-1] != "" {
		return lines[len(lines)-1]
	}
	return ""
}
