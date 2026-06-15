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
}

func envOr(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func limitsFromEnv() limits {
	return limits{
		memory:   envOr("TORSOR_WS_MEMORY", "512m"),
		cpus:     envOr("TORSOR_WS_CPUS", "1"),
		pids:     envOr("TORSOR_WS_PIDS", "256"),
		network:  envOr("TORSOR_WS_NETWORK", "bridge"),
		hardened: envOr("TORSOR_WS_HARDENED", "true") != "false",
	}
}

// buildCreateArgs assembles the `docker create ...` argv for a workspace, applying
// resource limits and security hardening. Extracted (and env iterated in sorted order) so
// it is deterministic and unit-testable without a Docker daemon.
func buildCreateArgs(name string, spec plugin.WorkspaceSpec, lim limits) []string {
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
		args = append(args, "--cap-drop", "ALL", "--security-opt", "no-new-privileges")
	}
	image := spec.Image
	if image == "" {
		image = "alpine:3"
	}
	// Keep the container alive so we can exec into it across requests.
	args = append(args, image, "tail", "-f", "/dev/null")
	return args
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
	out, err := run(ctx, nil, buildCreateArgs(name, spec, r.lim)...)
	if err != nil {
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
	return r.lifecycle(ctx, id, "running", "start", containerName(id))
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
	return plugin.WorkspaceStatus{WorkspaceID: id, ContainerID: containerName(id), Status: strings.TrimSpace(out)}, nil
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

// shellQuote single-quotes a string for safe use inside an `sh -c` script.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func main() {
	plugin.ServeRuntime(runtime{lim: limitsFromEnv()})
}
