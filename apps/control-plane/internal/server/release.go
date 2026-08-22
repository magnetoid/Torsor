package server

import (
	"context"
	"errors"
	"fmt"
	"strconv"
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

// releaseWorkspaceID is the container id for one specific release.
//
// It is keyed by release NUMBER, not just the project, and that is the whole point: deploys are
// blue/green. The new release boots in its own container while the current one keeps serving,
// and traffic only moves after the new one proves it works. An earlier version used a single
// per-project id and destroyed it before forking the replacement, which took the public site
// down for the length of every build — and left it down entirely if the build failed.
//
// Still derived rather than stored, so the proxy, deploy and rollback all compute the same id
// from (project, number) without a lookup. The suffix cannot occur in a project UUID, so a
// release container can never be mistaken for a dev workspace.
func releaseWorkspaceID(projectID string, number int) string {
	return projectID + "-rel-" + strconv.Itoa(number)
}

// buildLogPath is where the release container's build+serve output lands, inside that
// container. Read back via ReadFile so a failed deploy is diagnosable from the UI.
const buildLogPath = "/tmp/torsor-release.log"

// exitCodePath receives the build's exit status.
//
// The build has to run detached — `serve` blocks forever, so the launching Exec cannot wait for
// it — which means the launcher's own exit code says nothing about whether the build worked.
// The script writes the build's status here, and the control plane polls for the file. Without
// this, "did the build succeed?" had no answer at all and every deploy was declared live after
// a fixed three-second sleep.
const exitCodePath = "/tmp/torsor-release.exit"

// maxBuildLog bounds what is persisted. Build output is unbounded in principle (a webpack
// build can emit megabytes); the tail is what diagnoses a failure.
const maxBuildLog = 64 * 1024

// buildTimeout caps how long we wait for the build step to report an exit code, and readyTimeout
// how long we then wait for the app to actually listen. Both bounded so a hung build fails the
// release instead of leaving it 'building' forever.
const (
	buildPollInterval = 2 * time.Second
	buildTimeout      = 12 * time.Minute
	readyTimeout      = 90 * time.Second
)

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

// activateRelease points the deployment at a release and demotes whatever it replaced.
//
// The upsert deliberately does NOT force status='running' on an existing row. A deploy takes
// minutes and cannot be cancelled mid-flight, so an owner who clicks Unpublish while a build is
// running would otherwise have the project silently re-published underneath them when the build
// landed. Instead the release becomes live and the row's existing visibility is preserved:
// "which artifact" and "is it public" are separate decisions.
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
		 ON CONFLICT (project_id) DO UPDATE SET release_id = $3, updated_at = NOW()`,
		projectID, uid, releaseID)
	return err
}

// beginDeploy claims the exclusive right to deploy this project, or reports that one is already
// running.
//
// Two concurrent deploys previously raced on the same container name and the same deployments
// row, so the release recorded as live could disagree with the artifact actually serving. The
// claim is in-process, matching how missionCancels and the rate limiters already scope
// single-backend state; the UNIQUE (project_id, number) index remains the backstop if that
// assumption ever stops holding.
func (s *Server) beginDeploy(projectID string) (release func(), ok bool) {
	if _, loaded := s.deployInFlight.LoadOrStore(projectID, true); loaded {
		return nil, false
	}
	return func() { s.deployInFlight.Delete(projectID) }, true
}

// launchRelease is the whole deploy pipeline after the secret gate: snapshot → fork into the
// release container → build+serve → capture the log → activate.
//
// It runs detached from the request (a real build takes minutes), so every failure path must
// record itself on the release row — nobody is watching a response code.
func (s *Server) launchRelease(ctx context.Context, rt plugin.WorkspaceRuntime, projectID, uid, releaseID string, number int, tmpl Template) {
	relWS := releaseWorkspaceID(projectID, number)

	// 1. Freeze the artifact. Everything after this is independent of further editing, which
	//    is the entire point: the developer gets their workspace back immediately.
	snap, err := rt.SnapshotWorkspace(ctx, projectID, "release "+releaseID)
	if err != nil {
		s.failRelease(ctx, rt, projectID, releaseID, relWS, "Could not snapshot the workspace: "+err.Error())
		return
	}
	s.setReleaseSnapshot(ctx, releaseID, snap.SnapshotID)

	// 2. Build in a NEW container. The currently-live release keeps serving throughout.
	if err := s.bootReleaseContainer(ctx, rt, projectID, relWS, snap.SnapshotID, tmpl); err != nil {
		s.failRelease(ctx, rt, projectID, releaseID, relWS, err.Error())
		return
	}

	// 3. Wait for the build to actually finish and report its status, then for the app to
	//    accept a connection. Only a release that has proven both is allowed to take traffic.
	if err := s.awaitBuild(ctx, rt, relWS, releaseID); err != nil {
		s.failRelease(ctx, rt, projectID, releaseID, relWS, err.Error())
		return
	}
	s.captureBuildLog(ctx, rt, relWS, releaseID)
	if err := s.awaitServing(ctx, rt, relWS); err != nil {
		s.failRelease(ctx, rt, projectID, releaseID, relWS, err.Error())
		return
	}

	// 4. Cut traffic over, then reap the container the previous release was using.
	previous := s.liveReleaseNumber(ctx, projectID)
	if err := s.activateRelease(ctx, projectID, uid, releaseID); err != nil {
		s.failRelease(ctx, rt, projectID, releaseID, relWS, "Built, but could not activate: "+err.Error())
		return
	}
	s.reapRelease(ctx, rt, projectID, previous, number)
	s.logDeploymentEventRelease(ctx, projectID, uid, "deploy", "running", deployPath(projectID), releaseID)
}

// failRelease records the failure, salvages whatever build output exists, and removes the
// half-built container.
//
// Cleaning up matters: the live release is untouched by a failed deploy (that is what blue/green
// buys), so the only thing left behind would be a dead container accumulating on the host.
func (s *Server) failRelease(ctx context.Context, rt plugin.WorkspaceRuntime, projectID, releaseID, relWS, msg string) {
	s.captureBuildLog(ctx, rt, relWS, releaseID)
	if log, ok := s.readBuildLog(ctx, rt, relWS); ok {
		if headline := summarizeBuildFailure(log); headline != "" {
			msg = msg + " — " + headline
		}
	}
	s.updateReleaseStatus(ctx, releaseID, "failed", msg)
	if _, err := rt.DestroyWorkspace(ctx, relWS); err != nil && !isUnimplemented(err) {
		s.logger.Debug("release: could not clean up failed container", "project", projectID, "err", err)
	}
}

// awaitBuild polls for the exit-code sentinel the build script writes.
//
// The build must run detached (`serve` never returns), so the launching Exec's own exit code is
// meaningless — it reports only that `nohup` started. Reading the sentinel is the only honest
// signal available through the WorkspaceRuntime contract, which has no "wait for pid" RPC.
func (s *Server) awaitBuild(ctx context.Context, rt plugin.WorkspaceRuntime, relWS, releaseID string) error {
	deadline := time.Now().Add(buildTimeout)
	for {
		if b, err := rt.ReadFile(ctx, relWS, exitCodePath); err == nil {
			code := strings.TrimSpace(string(b))
			if code == "0" {
				return nil
			}
			return fmt.Errorf("the build failed (exit %s)", code)
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("the build did not finish within %s", buildTimeout)
		}
		// Refresh the log as we go so the UI can follow a long build.
		s.captureBuildLog(ctx, rt, relWS, releaseID)
		select {
		case <-ctx.Done():
			return errors.New("deploy was cancelled")
		case <-time.After(buildPollInterval):
		}
	}
}

// awaitServing waits until the runtime reports a reachable app port for the release container.
//
// A green build is not the same as a running app: the serve command can exit immediately, bind
// the wrong port, or crash on boot. Without this check a release could be marked live while
// nothing listens, which is the failure the deploy pipeline exists to prevent.
func (s *Server) awaitServing(ctx context.Context, rt plugin.WorkspaceRuntime, relWS string) error {
	deadline := time.Now().Add(readyTimeout)
	for {
		st, err := rt.StatusWorkspace(ctx, relWS)
		if err == nil && st.PreviewHost != "" && st.PreviewPort != 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("the app did not start listening within %s (does it bind the expected port?)", readyTimeout)
		}
		select {
		case <-ctx.Done():
			return errors.New("deploy was cancelled")
		case <-time.After(buildPollInterval):
		}
	}
}

// liveReleaseNumber reports which release is currently serving, or 0 for none.
func (s *Server) liveReleaseNumber(ctx context.Context, projectID string) int {
	var n int
	if err := s.pool.QueryRow(ctx,
		`SELECT r.number FROM deployments d JOIN releases r ON r.id = d.release_id
		  WHERE d.project_id = $1`, projectID).Scan(&n); err != nil {
		return 0
	}
	return n
}

// reapRelease destroys the container of the release that was just replaced.
//
// Only the outgoing one, and only after the cutover succeeded — the artifact itself survives as
// a snapshot, so rollback re-forks rather than reusing a container.
func (s *Server) reapRelease(ctx context.Context, rt plugin.WorkspaceRuntime, projectID string, previous, current int) {
	if previous == 0 || previous == current {
		return
	}
	old := releaseWorkspaceID(projectID, previous)
	if _, err := rt.DestroyWorkspace(ctx, old); err != nil && !isUnimplemented(err) {
		s.logger.Debug("release: could not reap previous container", "project", projectID, "workspace", old, "err", err)
	}
}

// bootReleaseContainer replaces any previous release container with one forked from snapshotID
// and starts build+serve inside it.
//
// The old container is destroyed rather than reused: a release is meant to be reproducible from
// its snapshot, and reusing a container would let the previous release's mutated filesystem
// leak into the new one — exactly the contamination this design removes.
func (s *Server) bootReleaseContainer(ctx context.Context, rt plugin.WorkspaceRuntime, projectID, relWS, snapshotID string, tmpl Template) error {
	// Destroy only THIS release's container, and only in case a previous attempt at the same
	// number left one behind. The live release runs under a different id and is untouched —
	// that is what keeps the site up while this one builds.
	if _, err := rt.DestroyWorkspace(ctx, relWS); err != nil && !isUnimplemented(err) {
		// Nothing to remove is the normal case, not a failure.
		s.logger.Debug("release: no stale container for this release", "project", projectID, "err", err)
	}
	if _, err := rt.ForkWorkspace(ctx, projectID, snapshotID, relWS); err != nil {
		return fmt.Errorf("could not create the release container: %w", err)
	}
	if _, err := rt.StartWorkspace(ctx, relWS); err != nil {
		return fmt.Errorf("could not start the release container: %w", err)
	}

	// The build step and the serve step are deliberately separate. The build's exit status is
	// written to a sentinel BEFORE serve starts, so the control plane can distinguish "the
	// build failed" from "the build is still running" — serve blocks forever, so waiting on the
	// whole script would never return. `set -e` alone was useless here: the launcher's exit
	// code described nohup, not the build.
	var b strings.Builder
	b.WriteString("cd " + workspaceDir + "\n")
	if tmpl.Build != "" {
		b.WriteString(tmpl.Build + "\n")
		b.WriteString("code=$?\n")
	} else {
		b.WriteString("code=0\n")
	}
	b.WriteString("echo $code > " + exitCodePath + "\n")
	// Do not serve a failed build: an empty or stale output directory served as if it were the
	// new release is exactly the silent-wrong-answer this pipeline exists to prevent.
	b.WriteString("[ \"$code\" = \"0\" ] || exit $code\n")
	b.WriteString(tmpl.Serve + "\n")

	if err := rt.WriteFile(ctx, relWS, workspaceDir+"/.torsor-release.sh", []byte(b.String()), true); err != nil {
		return fmt.Errorf("could not write the release script: %w", err)
	}
	// Clear any sentinel inherited from the snapshot, or awaitBuild would read a stale result
	// from the previous release and declare this build finished before it started.
	launch := "rm -f " + exitCodePath + "; nohup sh " + workspaceDir +
		"/.torsor-release.sh >" + buildLogPath + " 2>&1 & echo launched"
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

// readBuildLog pulls the raw build output from a release container.
func (s *Server) readBuildLog(ctx context.Context, rt plugin.WorkspaceRuntime, relWS string) (string, bool) {
	b, err := rt.ReadFile(ctx, relWS, buildLogPath)
	if err != nil {
		return "", false
	}
	out := string(b)
	if len(out) > maxBuildLog {
		out = out[len(out)-maxBuildLog:]
	}
	return out, true
}

// liveBuildLog reads the log straight from the building release's container, so an in-progress
// build streams rather than showing a stale snapshot.
func (s *Server) liveBuildLog(ctx context.Context, projectID string, number int) (string, bool) {
	_, rt, ok := s.resolveWorkspaceRuntime(ctx, projectID)
	if !ok {
		return "", false
	}
	return s.readBuildLog(ctx, rt, releaseWorkspaceID(projectID, number))
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
	var number *int
	if err := s.pool.QueryRow(ctx,
		`SELECT d.status, r.number FROM deployments d
		   LEFT JOIN releases r ON r.id = d.release_id
		  WHERE d.project_id = $1`, projectID).Scan(&st, &number); err != nil {
		return "", false, false
	}
	if st != "running" {
		return "", false, false
	}
	if number == nil {
		return projectID, true, true
	}
	return releaseWorkspaceID(projectID, *number), false, true
}

// stopRelease takes the public site down. The release container is stopped rather than
// destroyed so re-publishing is instant and the artifact survives — destroying it would make
// "unpublish" quietly equivalent to "throw away the build".
func (s *Server) stopRelease(ctx context.Context, rt plugin.WorkspaceRuntime, projectID string) {
	number := s.liveReleaseNumber(ctx, projectID)
	if number == 0 {
		return
	}
	if _, err := rt.StopWorkspace(ctx, releaseWorkspaceID(projectID, number), 5); err != nil && !isUnimplemented(err) {
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
