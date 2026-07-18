package plugin

import (
	"context"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// buildRuntimePlugin compiles a cmd/<name> runtime plugin into a temp binary so tests
// exercise a real out-of-process plugin over gRPC (not an in-process fake).
func buildRuntimePlugin(t *testing.T, name string) string {
	t.Helper()
	bin := filepath.Join(t.TempDir(), name)
	if runtime.GOOS == "windows" {
		bin += ".exe"
	}
	// internal/plugin -> control-plane root is ../.. ; build the plugin command there.
	cmd := exec.Command("go", "build", "-o", bin, "../../cmd/"+name)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build %s: %v\n%s", name, err, out)
	}
	return bin
}

func buildMockRuntime(t *testing.T) string { return buildRuntimePlugin(t, "mock-runtime") }

// TestDockerRuntimePluginLoads proves the real docker-runtime binary is a valid
// WorkspaceRuntime plugin: it handshakes and registers over gRPC and reports its Info.
// (Info does not touch the Docker daemon, so this runs without Docker installed.)
func TestDockerRuntimePluginLoads(t *testing.T) {
	bin := buildRuntimePlugin(t, "docker-runtime")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	host := NewHost()
	defer host.Close()

	info, err := host.LoadWorkspaceRuntime(ctx, bin)
	if err != nil {
		t.Fatalf("LoadWorkspaceRuntime(docker-runtime): %v", err)
	}
	if info.Name != "docker" {
		t.Fatalf("info.Name = %q, want %q", info.Name, "docker")
	}
	if info.Kind != "workspace_runtime" {
		t.Fatalf("info.Kind = %q, want %q", info.Kind, "workspace_runtime")
	}
}

// TestWorkspaceRuntimePluginRoundTrip loads the reference runtime plugin through the host
// and drives the full capability surface over gRPC: lifecycle, file I/O, and exec.
func TestWorkspaceRuntimePluginRoundTrip(t *testing.T) {
	bin := buildMockRuntime(t)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	host := NewHost()
	defer host.Close()

	info, err := host.LoadWorkspaceRuntime(ctx, bin)
	if err != nil {
		t.Fatalf("LoadWorkspaceRuntime: %v", err)
	}
	if info.Name != "mock" {
		t.Fatalf("info.Name = %q, want %q", info.Name, "mock")
	}
	if info.Kind != "workspace_runtime" {
		t.Fatalf("info.Kind = %q, want %q", info.Kind, "workspace_runtime")
	}

	if got := host.WorkspaceRuntimes(); len(got) != 1 || got[0].Name != "mock" {
		t.Fatalf("WorkspaceRuntimes() = %+v, want one named mock", got)
	}

	rt, ok := host.WorkspaceRuntime("mock")
	if !ok {
		t.Fatal("WorkspaceRuntime(\"mock\") not found after load")
	}

	const wsID = "proj-123"

	if st, err := rt.CreateWorkspace(ctx, WorkspaceSpec{ID: wsID, Image: "node:20"}); err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	} else if st.Status != "created" || st.WorkspaceID != wsID {
		t.Fatalf("CreateWorkspace status = %+v", st)
	}

	if st, err := rt.StartWorkspace(ctx, wsID); err != nil {
		t.Fatalf("StartWorkspace: %v", err)
	} else if st.Status != "running" {
		t.Fatalf("StartWorkspace status = %q, want running", st.Status)
	}

	// File round-trip: write then read back identical bytes.
	want := []byte("export const hello = 'world'\n")
	if err := rt.WriteFile(ctx, wsID, "src/index.ts", want, true); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	got, err := rt.ReadFile(ctx, wsID, "src/index.ts")
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(got) != string(want) {
		t.Fatalf("ReadFile = %q, want %q", got, want)
	}

	entries, err := rt.ListFiles(ctx, wsID, "src")
	if err != nil {
		t.Fatalf("ListFiles: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != "src/index.ts" {
		t.Fatalf("ListFiles = %+v, want one entry src/index.ts", entries)
	}

	// Exec streams chunks; the final chunk must be Done with exit code 0.
	var chunks []ExecChunk
	if err := rt.Exec(ctx, ExecSpec{WorkspaceID: wsID, Command: []string{"npm", "run", "build"}}, func(c ExecChunk) error {
		chunks = append(chunks, c)
		return nil
	}); err != nil {
		t.Fatalf("Exec: %v", err)
	}
	if len(chunks) == 0 || !chunks[len(chunks)-1].Done {
		t.Fatalf("Exec chunks = %+v, want a final Done chunk", chunks)
	}
	if last := chunks[len(chunks)-1]; last.ExitCode != 0 {
		t.Fatalf("Exec exit code = %d, want 0", last.ExitCode)
	}

	if st, err := rt.StopWorkspace(ctx, wsID, 5); err != nil {
		t.Fatalf("StopWorkspace: %v", err)
	} else if st.Status != "stopped" {
		t.Fatalf("StopWorkspace status = %q, want stopped", st.Status)
	}

	if st, err := rt.DestroyWorkspace(ctx, wsID); err != nil {
		t.Fatalf("DestroyWorkspace: %v", err)
	} else if st.Status != "destroyed" {
		t.Fatalf("DestroyWorkspace status = %q, want destroyed", st.Status)
	}

	// After destroy, status is unknown (workspace gone).
	if st, err := rt.StatusWorkspace(ctx, wsID); err != nil {
		t.Fatalf("StatusWorkspace: %v", err)
	} else if st.Status != "unknown" {
		t.Fatalf("StatusWorkspace after destroy = %q, want unknown", st.Status)
	}
}

// TestWorkspaceRuntimeExecInteractive drives the bidirectional PTY path end-to-end through
// the real out-of-process plugin: it sends stdin and a resize event up the stream and
// asserts the echoed output, the resize acknowledgement, and a final Done chunk come back.
// This exercises the whole interactive contract (proto bidi stream + both bridge halves)
// with no container or real tty.
func TestWorkspaceRuntimeExecInteractive(t *testing.T) {
	bin := buildMockRuntime(t)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	host := NewHost()
	defer host.Close()

	if _, err := host.LoadWorkspaceRuntime(ctx, bin); err != nil {
		t.Fatalf("LoadWorkspaceRuntime: %v", err)
	}
	rt, ok := host.WorkspaceRuntime("mock")
	if !ok {
		t.Fatal("WorkspaceRuntime(\"mock\") not found after load")
	}

	const wsID = "proj-pty"
	if _, err := rt.CreateWorkspace(ctx, WorkspaceSpec{ID: wsID, Image: "node:20"}); err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}

	in := make(chan ExecInput)
	go func() {
		in <- ExecInput{Stdin: []byte("echo hi\n")}
		in <- ExecInput{Resize: &WinSize{Rows: 40, Cols: 120}}
		in <- ExecInput{Stdin: []byte("exit\n")}
		close(in)
	}()

	var out strings.Builder
	var last ExecChunk
	err := rt.ExecInteractive(ctx, ExecSpec{WorkspaceID: wsID, Rows: 24, Cols: 80}, in, func(c ExecChunk) error {
		out.WriteString(c.Stdout)
		last = c
		return nil
	})
	if err != nil {
		t.Fatalf("ExecInteractive: %v", err)
	}
	if !last.Done || last.ExitCode != 0 {
		t.Fatalf("final chunk = %+v, want Done with exit 0", last)
	}
	got := out.String()
	for _, want := range []string{"interactive shell", "echo hi", "[resize 120x40]", "logout"} {
		if !strings.Contains(got, want) {
			t.Fatalf("interactive output %q missing %q", got, want)
		}
	}
}
