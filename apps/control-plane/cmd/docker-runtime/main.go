// Command docker-runtime is a real Torsor WorkspaceRuntime plugin backed by the local
// Docker engine. It implements plugin.WorkspaceRuntime by shelling out to the `docker`
// CLI — deliberately no Docker Go SDK, so the kernel stays small and the plugin works
// wherever the docker binary is on PATH. Each workspace is one long-lived container named
// "torsor-<workspaceID>"; files and exec happen inside it.
//
// This is the same shape as cmd/mock-runtime; swap TORSOR_WORKSPACE_RUNTIME_PLUGINS to
// pick which runtime the control plane loads.
package main

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

const containerPrefix = "torsor-"

// unsafeName matches characters not allowed in the workspace-id portion of a docker
// container name (docker allows [a-zA-Z0-9][a-zA-Z0-9_.-]*).
var unsafeName = regexp.MustCompile(`[^a-zA-Z0-9_.-]`)

// containerName maps a workspace id to a deterministic, docker-safe container name.
func containerName(workspaceID string) string {
	return containerPrefix + unsafeName.ReplaceAllString(workspaceID, "-")
}

// parseLs turns the output of `ls -1Ap <dir>` into file entries. A trailing slash marks a
// directory; sizes are not reported by this listing (left 0) to keep it one cheap call.
func parseLs(dir, out string) []plugin.FileEntry {
	var entries []plugin.FileEntry
	prefix := strings.TrimSuffix(dir, "/")
	for _, raw := range strings.Split(out, "\n") {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		isDir := strings.HasSuffix(name, "/")
		clean := strings.TrimSuffix(name, "/")
		full := clean
		if prefix != "" {
			full = prefix + "/" + clean
		}
		entries = append(entries, plugin.FileEntry{Name: clean, Path: full, IsDir: isDir})
	}
	return entries
}

// limits bounds a workspace container so untrusted code can't exhaust the host or roam
// the network. All are configurable via env; defaults are conservative-but-usable.
type limits struct {
	memory   string // --memory, e.g. "512m"
	cpus     string // --cpus, e.g. "1"
	pids     string // --pids-limit, e.g. "256"
	network  string // --network, e.g. "bridge" (allow egress) or "none" (lock down)
	hardened bool   // --cap-drop ALL + --security-opt no-new-privileges
	// allowlist restricts which base images a workspace may run. The image is caller-
	// supplied, so without this an operator could be asked to pull/run an arbitrary
	// image. Empty = allow any (documented, single-tenant default); when set (CSV in
	// TORSOR_WS_IMAGE_ALLOWLIST) only listed images are permitted.
	allowlist []string
	// keepAlive overrides the image command with `tail -f /dev/null` so a dev-workspace
	// container stays up for `docker exec`. Set false ("app" deploys) to run the image's
	// own entrypoint (e.g. nginx serving). Default true.
	keepAlive bool
	// appPort is the container port to publish + preview (e.g. "80"). When set, the port
	// is published to a random 127.0.0.1 host port and reported as the preview target.
	appPort string
}

func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func limitsFromEnv() limits {
	return limits{
		memory:    envOr("TORSOR_WS_MEMORY", "512m"),
		cpus:      envOr("TORSOR_WS_CPUS", "1"),
		pids:      envOr("TORSOR_WS_PIDS", "256"),
		network:   envOr("TORSOR_WS_NETWORK", "bridge"),
		hardened:  envOr("TORSOR_WS_HARDENED", "true") != "false",
		allowlist: parseAllowlist(envOr("TORSOR_WS_IMAGE_ALLOWLIST", "")),
		keepAlive: envOr("TORSOR_WS_KEEPALIVE", "true") != "false",
		appPort:   strings.TrimSpace(os.Getenv("TORSOR_WS_APP_PORT")),
	}
}

// parseAllowlist splits a CSV image allowlist, trimming blanks.
func parseAllowlist(csv string) []string {
	var out []string
	for _, p := range strings.Split(csv, ",") {
		if s := strings.TrimSpace(p); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// resolveImage validates the caller-supplied image and applies the allowlist. It returns
// the image to run (falling back to alpine:3 when none is given) or an error if the image
// is malformed or not permitted. Keeping this separate makes it unit-testable and ensures
// every workspace create runs the same gate.
func resolveImage(requested string, allowlist []string) (string, error) {
	image := strings.TrimSpace(requested)
	if image == "" {
		image = "alpine:3"
	}
	// Reject shell/argv metacharacters and whitespace: the image becomes a positional
	// docker arg, and a well-formed reference never contains these.
	if strings.ContainsAny(image, " \t\n\r;|&$`'\"\\<>()") {
		return "", fmt.Errorf("invalid image reference %q", requested)
	}
	if len(allowlist) == 0 {
		return image, nil // no allowlist configured: permissive single-tenant default
	}
	for _, allowed := range allowlist {
		if image == allowed {
			return image, nil
		}
	}
	return "", fmt.Errorf("image %q is not in TORSOR_WS_IMAGE_ALLOWLIST", image)
}

// buildCreateArgs assembles the `docker create ...` argv for a workspace, applying
// resource limits, security hardening, and the image gate (validation + allowlist).
// Extracted (and env iterated in sorted order) so it is deterministic and unit-testable
// without a Docker daemon. Returns an error if the requested image is rejected.
func buildCreateArgs(name string, spec plugin.WorkspaceSpec, lim limits) ([]string, error) {
	image, err := resolveImage(spec.Image, lim.allowlist)
	if err != nil {
		return nil, err
	}
	return buildCreateArgsForImage(name, image, spec, lim), nil
}

// buildCreateArgsForImage builds the `docker create` argv for an already-resolved, trusted
// image (skips the allowlist gate). Used by snapshot restore/fork, which run our own commit
// images — never a caller-supplied reference.
func buildCreateArgsForImage(name, image string, spec plugin.WorkspaceSpec, lim limits) []string {
	args := []string{"create", "--name", name}
	if spec.WorkingDir != "" {
		args = append(args, "-w", spec.WorkingDir)
	}
	keys := make([]string, 0, len(spec.Env))
	for k := range spec.Env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		args = append(args, "-e", k+"="+spec.Env[k])
	}
	if lim.memory != "" {
		args = append(args, "--memory", lim.memory)
	}
	if lim.cpus != "" {
		args = append(args, "--cpus", lim.cpus)
	}
	if lim.pids != "" {
		args = append(args, "--pids-limit", lim.pids)
	}
	if lim.network != "" {
		args = append(args, "--network", lim.network)
	}
	if lim.hardened {
		args = append(args, "--security-opt", "no-new-privileges")
		// Dropping ALL caps is right for a dev workspace running untrusted agent commands,
		// but breaks normal app images (e.g. nginx needs CHOWN/SETUID to drop to its worker
		// user). So only fully drop caps in keep-alive (dev workspace) mode; app deploys
		// keep docker's default cap set.
		if lim.keepAlive {
			args = append(args, "--cap-drop", "ALL")
		}
	}
	// Publish the app port to a random loopback host port so the control-plane can proxy
	// a live preview to it (127.0.0.1 only — never exposed on all interfaces).
	if lim.appPort != "" {
		args = append(args, "-p", "127.0.0.1::"+lim.appPort)
	}
	// Survive docker daemon restarts (deploys, host reboots): a running workspace comes
	// back on its own; one the user explicitly stopped stays stopped.
	args = append(args, "--restart", "unless-stopped")
	args = append(args, image)
	// Dev workspaces keep the container up for `docker exec`; app deploys run the image's
	// own entrypoint (so e.g. nginx actually serves).
	if lim.keepAlive {
		args = append(args, "tail", "-f", "/dev/null")
	}
	return args
}

// previewTarget asks docker for the host mapping of the workspace's published app port and
// returns (host, port). Returns ("", 0) when nothing is published or the lookup fails.
func (r runtime) previewTarget(ctx context.Context, id string) (string, int32) {
	if r.lim.appPort == "" {
		return "", 0
	}
	out, err := run(ctx, nil, "port", containerName(id), r.lim.appPort+"/tcp")
	if err != nil {
		return "", 0
	}
	// docker prints e.g. "127.0.0.1:49153"; take the last colon-separated field as the port.
	line := strings.TrimSpace(strings.SplitN(out, "\n", 2)[0])
	i := strings.LastIndex(line, ":")
	if i < 0 {
		return "", 0
	}
	p, err := strconv.Atoi(strings.TrimSpace(line[i+1:]))
	if err != nil {
		return "", 0
	}
	return "127.0.0.1", int32(p)
}

type runtime struct {
	lim limits
}

func (runtime) Info(_ context.Context) (plugin.RuntimeInfo, error) {
	return plugin.RuntimeInfo{
		Name:        "docker",
		DisplayName: "Docker (local engine)",
		Version:     "0.1.0",
		Kind:        "workspace_runtime",
	}, nil
}

// run executes a docker command and returns combined stdout, or an error including stderr.
func run(ctx context.Context, stdin []byte, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", args...)
	if stdin != nil {
		cmd.Stdin = bytes.NewReader(stdin)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("docker %s: %s", strings.Join(args, " "), msg)
	}
	return stdout.String(), nil
}

func (r runtime) CreateWorkspace(ctx context.Context, spec plugin.WorkspaceSpec) (plugin.WorkspaceStatus, error) {
	name := containerName(spec.ID)

	// Idempotent provision: if the container already exists (any state — e.g. stranded
	// "created"/"exited" after a docker daemon restart), report its current status instead
	// of failing on the docker create name conflict. Provision's contract is "a container
	// for this workspace exists"; Start brings it up.
	if st, err := r.StatusWorkspace(ctx, spec.ID); err == nil && st.Status != "unknown" {
		return st, nil
	}

	args, err := buildCreateArgs(name, spec, r.lim)
	if err != nil {
		return plugin.WorkspaceStatus{WorkspaceID: spec.ID, Status: "unknown"}, err
	}
	out, err := run(ctx, nil, args...)
	if err != nil {
		// Lost the create race (or inspect briefly failed): the name existing is still a
		// provisioned workspace, not an error.
		if strings.Contains(err.Error(), "is already in use") {
			return r.StatusWorkspace(ctx, spec.ID)
		}
		return plugin.WorkspaceStatus{WorkspaceID: spec.ID, Status: "unknown"}, err
	}
	return plugin.WorkspaceStatus{
		WorkspaceID: spec.ID,
		ContainerID: strings.TrimSpace(out),
		Status:      "created",
	}, nil
}

func (r runtime) lifecycle(ctx context.Context, workspaceID, reportStatus string, args ...string) (plugin.WorkspaceStatus, error) {
	if _, err := run(ctx, nil, args...); err != nil {
		return plugin.WorkspaceStatus{WorkspaceID: workspaceID, Status: "unknown"}, err
	}
	return plugin.WorkspaceStatus{WorkspaceID: workspaceID, ContainerID: containerName(workspaceID), Status: reportStatus}, nil
}

func (r runtime) StartWorkspace(ctx context.Context, id string) (plugin.WorkspaceStatus, error) {
	st, err := r.lifecycle(ctx, id, "running", "start", containerName(id))
	if err == nil {
		st.PreviewHost, st.PreviewPort = r.previewTarget(ctx, id)
	}
	return st, err
}

func (r runtime) StopWorkspace(ctx context.Context, id string, timeoutSeconds int32) (plugin.WorkspaceStatus, error) {
	args := []string{"stop", containerName(id)}
	if timeoutSeconds > 0 {
		args = []string{"stop", "-t", fmt.Sprintf("%d", timeoutSeconds), containerName(id)}
	}
	return r.lifecycle(ctx, id, "stopped", args...)
}

func (r runtime) DestroyWorkspace(ctx context.Context, id string) (plugin.WorkspaceStatus, error) {
	return r.lifecycle(ctx, id, "destroyed", "rm", "-f", containerName(id))
}

func (r runtime) StatusWorkspace(ctx context.Context, id string) (plugin.WorkspaceStatus, error) {
	out, err := run(ctx, nil, "inspect", "-f", "{{.State.Status}}", containerName(id))
	if err != nil {
		// inspect fails when the container does not exist.
		return plugin.WorkspaceStatus{WorkspaceID: id, Status: "unknown"}, nil
	}
	status := strings.TrimSpace(out)
	st := plugin.WorkspaceStatus{WorkspaceID: id, ContainerID: containerName(id), Status: status}
	if status == "running" {
		st.PreviewHost, st.PreviewPort = r.previewTarget(ctx, id)
	}
	return st, nil
}

func (r runtime) Exec(ctx context.Context, spec plugin.ExecSpec, onChunk func(plugin.ExecChunk) error) error {
	args := []string{"exec"}
	if spec.WorkingDir != "" {
		args = append(args, "-w", spec.WorkingDir)
	}
	args = append(args, containerName(spec.WorkspaceID))
	args = append(args, spec.Command...)

	cmd := exec.CommandContext(ctx, "docker", args...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}

	// Funnel both streams into one channel so onChunk is called serially (the host's gRPC
	// stream.Send is not safe for concurrent use).
	type line struct {
		text  string
		isErr bool
	}
	ch := make(chan line, 64)
	var wg sync.WaitGroup
	scan := func(rd io.Reader, isErr bool) {
		defer wg.Done()
		sc := bufio.NewScanner(rd)
		sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for sc.Scan() {
			ch <- line{text: sc.Text() + "\n", isErr: isErr}
		}
	}
	wg.Add(2)
	go scan(stdout, false)
	go scan(stderr, true)
	go func() { wg.Wait(); close(ch) }()

	for l := range ch {
		chunk := plugin.ExecChunk{}
		if l.isErr {
			chunk.Stderr = l.text
		} else {
			chunk.Stdout = l.text
		}
		if err := onChunk(chunk); err != nil {
			_ = cmd.Process.Kill()
			return err
		}
	}

	exitCode := int32(0)
	if err := cmd.Wait(); err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			exitCode = int32(ee.ExitCode())
		} else {
			return err
		}
	}
	return onChunk(plugin.ExecChunk{ExitCode: exitCode, Done: true})
}

func (r runtime) ListFiles(ctx context.Context, workspaceID, path string) ([]plugin.FileEntry, error) {
	dir := path
	if dir == "" {
		dir = "."
	}
	out, err := run(ctx, nil, "exec", containerName(workspaceID), "sh", "-c", "ls -1Ap "+shellQuote(dir))
	if err != nil {
		return nil, err
	}
	return parseLs(path, out), nil
}

func (r runtime) ReadFile(ctx context.Context, workspaceID, path string) ([]byte, error) {
	out, err := run(ctx, nil, "exec", containerName(workspaceID), "cat", path)
	if err != nil {
		return nil, err
	}
	return []byte(out), nil
}

func (r runtime) WriteFile(ctx context.Context, workspaceID, path string, content []byte, createDirs bool) error {
	script := "cat > " + shellQuote(path)
	if createDirs {
		script = "mkdir -p \"$(dirname " + shellQuote(path) + ")\" && " + script
	}
	_, err := run(ctx, content, "exec", "-i", containerName(workspaceID), "sh", "-c", script)
	return err
}

// SnapshotWorkspace captures the container's filesystem as a docker image via `docker
// commit`. The returned snapshot id is the image id — pass it to Restore/Fork. Best-effort
// (documented limits): this is a filesystem snapshot, not a live-memory microVM snapshot;
// running processes are not preserved.
func (r runtime) SnapshotWorkspace(ctx context.Context, workspaceID, label string) (plugin.SnapshotResult, error) {
	args := []string{"commit"}
	if label != "" {
		args = append(args, "-m", label)
	}
	args = append(args, containerName(workspaceID))
	out, err := run(ctx, nil, args...)
	if err != nil {
		return plugin.SnapshotResult{}, err
	}
	imageID := strings.TrimSpace(out)
	return plugin.SnapshotResult{WorkspaceID: workspaceID, SnapshotID: imageID, Message: "docker image " + shortImageID(imageID)}, nil
}

// RestoreWorkspace resets a workspace to a snapshot by removing the current container and
// recreating it from the snapshot image, then starting it. The container id changes; the
// filesystem is restored.
func (r runtime) RestoreWorkspace(ctx context.Context, workspaceID, snapshotID string) (plugin.WorkspaceStatus, error) {
	name := containerName(workspaceID)
	_, _ = run(ctx, nil, "rm", "-f", name) // best-effort: remove the current container
	args := buildCreateArgsForImage(name, snapshotID, plugin.WorkspaceSpec{ID: workspaceID}, r.lim)
	out, err := run(ctx, nil, args...)
	if err != nil {
		return plugin.WorkspaceStatus{WorkspaceID: workspaceID, Status: "unknown"}, err
	}
	if _, err := run(ctx, nil, "start", name); err != nil {
		return plugin.WorkspaceStatus{WorkspaceID: workspaceID, ContainerID: strings.TrimSpace(out), Status: "created"}, err
	}
	st := plugin.WorkspaceStatus{
		WorkspaceID: workspaceID, ContainerID: strings.TrimSpace(out), Status: "running",
		Message: "restored from " + shortImageID(snapshotID),
	}
	st.PreviewHost, st.PreviewPort = r.previewTarget(ctx, workspaceID)
	return st, nil
}

// ForkWorkspace provisions a new workspace from a source snapshot (or the live source, which
// is committed first), then starts it. The fork is an independent container.
func (r runtime) ForkWorkspace(ctx context.Context, sourceWorkspaceID, snapshotID, newWorkspaceID string) (plugin.WorkspaceStatus, error) {
	image := snapshotID
	if image == "" {
		out, err := run(ctx, nil, "commit", containerName(sourceWorkspaceID))
		if err != nil {
			return plugin.WorkspaceStatus{WorkspaceID: newWorkspaceID, Status: "unknown"}, err
		}
		image = strings.TrimSpace(out)
	}
	name := containerName(newWorkspaceID)
	args := buildCreateArgsForImage(name, image, plugin.WorkspaceSpec{ID: newWorkspaceID}, r.lim)
	out, err := run(ctx, nil, args...)
	if err != nil {
		return plugin.WorkspaceStatus{WorkspaceID: newWorkspaceID, Status: "unknown"}, err
	}
	if _, err := run(ctx, nil, "start", name); err != nil {
		return plugin.WorkspaceStatus{WorkspaceID: newWorkspaceID, ContainerID: strings.TrimSpace(out), Status: "created"}, err
	}
	st := plugin.WorkspaceStatus{
		WorkspaceID: newWorkspaceID, ContainerID: strings.TrimSpace(out), Status: "running",
		Message: "forked from " + sourceWorkspaceID,
	}
	st.PreviewHost, st.PreviewPort = r.previewTarget(ctx, newWorkspaceID)
	return st, nil
}

// shortImageID trims a docker image id ("sha256:hex…") to a short, human-readable form.
func shortImageID(id string) string {
	id = strings.TrimPrefix(id, "sha256:")
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

// shellQuote single-quotes a string for safe use inside an `sh -c` script.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func main() {
	plugin.ServeRuntime(runtime{lim: limitsFromEnv()})
}
