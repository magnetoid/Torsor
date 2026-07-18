package plugin

import (
	"context"
	"io"

	goplugin "github.com/hashicorp/go-plugin"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	proto "github.com/magnetoid/torsor/control-plane/internal/plugin/proto"
)

// WorkspaceRuntimeKey is the dispense key used to fetch a WorkspaceRuntime from a plugin.
const WorkspaceRuntimeKey = "workspace_runtime"

// RuntimePluginSet is the plugin map for the WorkspaceRuntime capability. It mirrors
// PluginSet (ModelProvider); the host and runtime plugins must agree on it.
func RuntimePluginSet(impl WorkspaceRuntime) goplugin.PluginSet {
	return goplugin.PluginSet{
		WorkspaceRuntimeKey: &WorkspaceRuntimePlugin{Impl: impl},
	}
}

// RuntimeInfo is static runtime metadata.
type RuntimeInfo struct {
	Name        string
	DisplayName string
	Version     string
	Kind        string
}

// WorkspaceSpec describes a workspace to provision.
type WorkspaceSpec struct {
	ID         string
	Image      string
	WorkingDir string
	Env        map[string]string
}

// WorkspaceStatus is the common lifecycle result.
type WorkspaceStatus struct {
	WorkspaceID string
	ContainerID string
	Status      string // created | running | stopped | destroyed | unknown
	Message     string
	// PreviewHost/PreviewPort locate the workspace's app for live preview (a published
	// container port), or "" / 0 when it exposes none.
	PreviewHost string
	PreviewPort int32
}

// SnapshotResult is the outcome of capturing a workspace snapshot: a runtime-native handle
// (SnapshotID) to pass to Restore/Fork, plus optional detail.
type SnapshotResult struct {
	WorkspaceID string
	SnapshotID  string
	Message     string
}

// ExecSpec is a command to run inside a workspace. Rows/Cols are only consulted by
// ExecInteractive (the initial PTY size) and ignored by the one-way Exec.
type ExecSpec struct {
	WorkspaceID string
	Command     []string
	WorkingDir  string
	Rows        uint16
	Cols        uint16
}

// WinSize is a terminal window size in character cells.
type WinSize struct {
	Rows uint16
	Cols uint16
}

// ExecInput is one client->process frame of an interactive session: either raw stdin
// bytes or a terminal resize (exactly one is set).
type ExecInput struct {
	Stdin  []byte
	Resize *WinSize
}

// ExecChunk is one streamed piece of command output. The final chunk has Done=true and
// carries the ExitCode.
type ExecChunk struct {
	Stdout   string
	Stderr   string
	ExitCode int32
	Done     bool
}

// FileEntry is one entry from a workspace directory listing.
type FileEntry struct {
	Name  string
	Path  string
	IsDir bool
	Size  int64
}

// WorkspaceRuntime is the Go-facing capability interface for per-user cloud workspaces.
// Both the host (client side) and plugins (server side) program against it; gRPC is an
// implementation detail.
type WorkspaceRuntime interface {
	Info(ctx context.Context) (RuntimeInfo, error)

	CreateWorkspace(ctx context.Context, spec WorkspaceSpec) (WorkspaceStatus, error)
	StartWorkspace(ctx context.Context, workspaceID string) (WorkspaceStatus, error)
	StopWorkspace(ctx context.Context, workspaceID string, timeoutSeconds int32) (WorkspaceStatus, error)
	DestroyWorkspace(ctx context.Context, workspaceID string) (WorkspaceStatus, error)
	StatusWorkspace(ctx context.Context, workspaceID string) (WorkspaceStatus, error)

	// Exec runs a command in the workspace, invoking onChunk for each output delta.
	// Returning a non-nil error from onChunk (e.g. client disconnected) aborts the exec.
	Exec(ctx context.Context, spec ExecSpec, onChunk func(ExecChunk) error) error

	// ExecInteractive runs a command attached to a PTY. It consumes stdin/resize frames
	// from `in` (the caller closes it when input ends) and streams output via onChunk,
	// exactly like Exec. Runtimes without PTY support return a gRPC Unimplemented error;
	// callers detect that (codes.Unimplemented) and fall back / hide the affordance.
	ExecInteractive(ctx context.Context, spec ExecSpec, in <-chan ExecInput, onChunk func(ExecChunk) error) error

	ListFiles(ctx context.Context, workspaceID, path string) ([]FileEntry, error)
	ReadFile(ctx context.Context, workspaceID, path string) ([]byte, error)
	WriteFile(ctx context.Context, workspaceID, path string, content []byte, createDirs bool) error

	// --- Snapshot / fork (the 2027 microVM sandbox standard) ---
	// Runtimes that don't support snapshots return a gRPC Unimplemented error; callers use
	// SupportsSnapshots to probe capability and hide the UI when unavailable.

	// SnapshotWorkspace captures the workspace's current state and returns a runtime-native
	// snapshot handle.
	SnapshotWorkspace(ctx context.Context, workspaceID, label string) (SnapshotResult, error)
	// RestoreWorkspace resets a workspace in place back to a previously taken snapshot.
	RestoreWorkspace(ctx context.Context, workspaceID, snapshotID string) (WorkspaceStatus, error)
	// ForkWorkspace provisions a new workspace (newWorkspaceID) from a source workspace or
	// snapshot. An empty snapshotID forks from the live state.
	ForkWorkspace(ctx context.Context, sourceWorkspaceID, snapshotID, newWorkspaceID string) (WorkspaceStatus, error)
}

// WorkspaceRuntimePlugin adapts a WorkspaceRuntime to hashicorp/go-plugin's gRPC plugin.
type WorkspaceRuntimePlugin struct {
	goplugin.NetRPCUnsupportedPlugin
	Impl WorkspaceRuntime
}

func (p *WorkspaceRuntimePlugin) GRPCServer(_ *goplugin.GRPCBroker, s *grpc.Server) error {
	proto.RegisterWorkspaceRuntimeServer(s, &runtimeGRPCServer{impl: p.Impl})
	return nil
}

func (p *WorkspaceRuntimePlugin) GRPCClient(_ context.Context, _ *goplugin.GRPCBroker, c *grpc.ClientConn) (any, error) {
	return &runtimeGRPCClient{client: proto.NewWorkspaceRuntimeClient(c)}, nil
}

// runtimeGRPCClient is the host-side adapter: WorkspaceRuntime backed by a gRPC client.
type runtimeGRPCClient struct {
	client proto.WorkspaceRuntimeClient
}

func runtimeStatus(resp *proto.WorkspaceStatusResponse) WorkspaceStatus {
	return WorkspaceStatus{
		WorkspaceID: resp.GetWorkspaceId(),
		ContainerID: resp.GetContainerId(),
		Status:      resp.GetStatus(),
		Message:     resp.GetMessage(),
		PreviewHost: resp.GetPreviewHost(),
		PreviewPort: resp.GetPreviewPort(),
	}
}

func (c *runtimeGRPCClient) Info(ctx context.Context) (RuntimeInfo, error) {
	resp, err := c.client.Info(ctx, &proto.RuntimeInfoRequest{})
	if err != nil {
		return RuntimeInfo{}, err
	}
	return RuntimeInfo{
		Name:        resp.GetName(),
		DisplayName: resp.GetDisplayName(),
		Version:     resp.GetVersion(),
		Kind:        resp.GetKind(),
	}, nil
}

func (c *runtimeGRPCClient) CreateWorkspace(ctx context.Context, spec WorkspaceSpec) (WorkspaceStatus, error) {
	resp, err := c.client.CreateWorkspace(ctx, &proto.CreateWorkspaceRequest{
		WorkspaceId: spec.ID,
		Image:       spec.Image,
		WorkingDir:  spec.WorkingDir,
		Env:         spec.Env,
	})
	if err != nil {
		return WorkspaceStatus{}, err
	}
	return runtimeStatus(resp), nil
}

func (c *runtimeGRPCClient) StartWorkspace(ctx context.Context, workspaceID string) (WorkspaceStatus, error) {
	resp, err := c.client.StartWorkspace(ctx, &proto.WorkspaceRef{WorkspaceId: workspaceID})
	if err != nil {
		return WorkspaceStatus{}, err
	}
	return runtimeStatus(resp), nil
}

func (c *runtimeGRPCClient) StopWorkspace(ctx context.Context, workspaceID string, timeoutSeconds int32) (WorkspaceStatus, error) {
	resp, err := c.client.StopWorkspace(ctx, &proto.StopWorkspaceRequest{WorkspaceId: workspaceID, TimeoutSeconds: timeoutSeconds})
	if err != nil {
		return WorkspaceStatus{}, err
	}
	return runtimeStatus(resp), nil
}

func (c *runtimeGRPCClient) DestroyWorkspace(ctx context.Context, workspaceID string) (WorkspaceStatus, error) {
	resp, err := c.client.DestroyWorkspace(ctx, &proto.WorkspaceRef{WorkspaceId: workspaceID})
	if err != nil {
		return WorkspaceStatus{}, err
	}
	return runtimeStatus(resp), nil
}

func (c *runtimeGRPCClient) StatusWorkspace(ctx context.Context, workspaceID string) (WorkspaceStatus, error) {
	resp, err := c.client.StatusWorkspace(ctx, &proto.WorkspaceRef{WorkspaceId: workspaceID})
	if err != nil {
		return WorkspaceStatus{}, err
	}
	return runtimeStatus(resp), nil
}

func (c *runtimeGRPCClient) Exec(ctx context.Context, spec ExecSpec, onChunk func(ExecChunk) error) error {
	stream, err := c.client.Exec(ctx, &proto.ExecRequest{
		WorkspaceId: spec.WorkspaceID,
		Command:     spec.Command,
		WorkingDir:  spec.WorkingDir,
	})
	if err != nil {
		return err
	}
	for {
		chunk, err := stream.Recv()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if cbErr := onChunk(ExecChunk{
			Stdout:   chunk.GetStdout(),
			Stderr:   chunk.GetStderr(),
			ExitCode: chunk.GetExitCode(),
			Done:     chunk.GetDone(),
		}); cbErr != nil {
			return cbErr
		}
	}
}

func (c *runtimeGRPCClient) ExecInteractive(ctx context.Context, spec ExecSpec, in <-chan ExecInput, onChunk func(ExecChunk) error) error {
	stream, err := c.client.ExecInteractive(ctx)
	if err != nil {
		return err
	}
	// The first frame must carry the start (command + initial size).
	if err := stream.Send(&proto.ExecInteractiveRequest{
		Payload: &proto.ExecInteractiveRequest_Start{Start: &proto.ExecStart{
			WorkspaceId: spec.WorkspaceID,
			Command:     spec.Command,
			WorkingDir:  spec.WorkingDir,
			Size:        &proto.WinSize{Rows: uint32(spec.Rows), Cols: uint32(spec.Cols)},
		}},
	}); err != nil {
		return err
	}
	// Forward stdin/resize frames until the caller closes `in`, then half-close the stream.
	go func() {
		for msg := range in {
			var frame *proto.ExecInteractiveRequest
			switch {
			case msg.Resize != nil:
				frame = &proto.ExecInteractiveRequest{Payload: &proto.ExecInteractiveRequest_Resize{
					Resize: &proto.WinSize{Rows: uint32(msg.Resize.Rows), Cols: uint32(msg.Resize.Cols)},
				}}
			case len(msg.Stdin) > 0:
				frame = &proto.ExecInteractiveRequest{Payload: &proto.ExecInteractiveRequest_Stdin{Stdin: msg.Stdin}}
			default:
				continue
			}
			if err := stream.Send(frame); err != nil {
				return
			}
		}
		_ = stream.CloseSend()
	}()
	for {
		chunk, err := stream.Recv()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if cbErr := onChunk(ExecChunk{
			Stdout:   chunk.GetStdout(),
			Stderr:   chunk.GetStderr(),
			ExitCode: chunk.GetExitCode(),
			Done:     chunk.GetDone(),
		}); cbErr != nil {
			return cbErr
		}
	}
}

func (c *runtimeGRPCClient) ListFiles(ctx context.Context, workspaceID, path string) ([]FileEntry, error) {
	resp, err := c.client.ListFiles(ctx, &proto.ListFilesRequest{WorkspaceId: workspaceID, Path: path})
	if err != nil {
		return nil, err
	}
	out := make([]FileEntry, 0, len(resp.GetEntries()))
	for _, e := range resp.GetEntries() {
		out = append(out, FileEntry{Name: e.GetName(), Path: e.GetPath(), IsDir: e.GetIsDir(), Size: e.GetSize()})
	}
	return out, nil
}

func (c *runtimeGRPCClient) ReadFile(ctx context.Context, workspaceID, path string) ([]byte, error) {
	resp, err := c.client.ReadFile(ctx, &proto.FileRef{WorkspaceId: workspaceID, Path: path})
	if err != nil {
		return nil, err
	}
	return resp.GetContent(), nil
}

func (c *runtimeGRPCClient) WriteFile(ctx context.Context, workspaceID, path string, content []byte, createDirs bool) error {
	_, err := c.client.WriteFile(ctx, &proto.WriteFileRequest{
		WorkspaceId: workspaceID,
		Path:        path,
		Content:     content,
		CreateDirs:  createDirs,
	})
	return err
}

func (c *runtimeGRPCClient) SnapshotWorkspace(ctx context.Context, workspaceID, label string) (SnapshotResult, error) {
	resp, err := c.client.SnapshotWorkspace(ctx, &proto.SnapshotRequest{WorkspaceId: workspaceID, Label: label})
	if err != nil {
		return SnapshotResult{}, err
	}
	return SnapshotResult{WorkspaceID: resp.GetWorkspaceId(), SnapshotID: resp.GetSnapshotId(), Message: resp.GetMessage()}, nil
}

func (c *runtimeGRPCClient) RestoreWorkspace(ctx context.Context, workspaceID, snapshotID string) (WorkspaceStatus, error) {
	resp, err := c.client.RestoreWorkspace(ctx, &proto.RestoreRequest{WorkspaceId: workspaceID, SnapshotId: snapshotID})
	if err != nil {
		return WorkspaceStatus{}, err
	}
	return runtimeStatus(resp), nil
}

func (c *runtimeGRPCClient) ForkWorkspace(ctx context.Context, sourceWorkspaceID, snapshotID, newWorkspaceID string) (WorkspaceStatus, error) {
	resp, err := c.client.ForkWorkspace(ctx, &proto.ForkRequest{
		SourceWorkspaceId: sourceWorkspaceID,
		SnapshotId:        snapshotID,
		NewWorkspaceId:    newWorkspaceID,
	})
	if err != nil {
		return WorkspaceStatus{}, err
	}
	return runtimeStatus(resp), nil
}

// runtimeGRPCServer is the plugin-side adapter: a gRPC server backed by a WorkspaceRuntime.
type runtimeGRPCServer struct {
	proto.UnimplementedWorkspaceRuntimeServer
	impl WorkspaceRuntime
}

func statusProto(st WorkspaceStatus) *proto.WorkspaceStatusResponse {
	return &proto.WorkspaceStatusResponse{
		WorkspaceId: st.WorkspaceID,
		ContainerId: st.ContainerID,
		Status:      st.Status,
		Message:     st.Message,
		PreviewHost: st.PreviewHost,
		PreviewPort: st.PreviewPort,
	}
}

func (s *runtimeGRPCServer) Info(ctx context.Context, _ *proto.RuntimeInfoRequest) (*proto.RuntimeInfoResponse, error) {
	info, err := s.impl.Info(ctx)
	if err != nil {
		return nil, err
	}
	return &proto.RuntimeInfoResponse{
		Name:        info.Name,
		DisplayName: info.DisplayName,
		Version:     info.Version,
		Kind:        info.Kind,
	}, nil
}

func (s *runtimeGRPCServer) CreateWorkspace(ctx context.Context, req *proto.CreateWorkspaceRequest) (*proto.WorkspaceStatusResponse, error) {
	st, err := s.impl.CreateWorkspace(ctx, WorkspaceSpec{
		ID:         req.GetWorkspaceId(),
		Image:      req.GetImage(),
		WorkingDir: req.GetWorkingDir(),
		Env:        req.GetEnv(),
	})
	if err != nil {
		return nil, err
	}
	return statusProto(st), nil
}

func (s *runtimeGRPCServer) StartWorkspace(ctx context.Context, req *proto.WorkspaceRef) (*proto.WorkspaceStatusResponse, error) {
	st, err := s.impl.StartWorkspace(ctx, req.GetWorkspaceId())
	if err != nil {
		return nil, err
	}
	return statusProto(st), nil
}

func (s *runtimeGRPCServer) StopWorkspace(ctx context.Context, req *proto.StopWorkspaceRequest) (*proto.WorkspaceStatusResponse, error) {
	st, err := s.impl.StopWorkspace(ctx, req.GetWorkspaceId(), req.GetTimeoutSeconds())
	if err != nil {
		return nil, err
	}
	return statusProto(st), nil
}

func (s *runtimeGRPCServer) DestroyWorkspace(ctx context.Context, req *proto.WorkspaceRef) (*proto.WorkspaceStatusResponse, error) {
	st, err := s.impl.DestroyWorkspace(ctx, req.GetWorkspaceId())
	if err != nil {
		return nil, err
	}
	return statusProto(st), nil
}

func (s *runtimeGRPCServer) StatusWorkspace(ctx context.Context, req *proto.WorkspaceRef) (*proto.WorkspaceStatusResponse, error) {
	st, err := s.impl.StatusWorkspace(ctx, req.GetWorkspaceId())
	if err != nil {
		return nil, err
	}
	return statusProto(st), nil
}

func (s *runtimeGRPCServer) Exec(req *proto.ExecRequest, stream grpc.ServerStreamingServer[proto.ExecChunk]) error {
	return s.impl.Exec(stream.Context(), ExecSpec{
		WorkspaceID: req.GetWorkspaceId(),
		Command:     req.GetCommand(),
		WorkingDir:  req.GetWorkingDir(),
	}, func(c ExecChunk) error {
		return stream.Send(&proto.ExecChunk{
			Stdout:   c.Stdout,
			Stderr:   c.Stderr,
			ExitCode: c.ExitCode,
			Done:     c.Done,
		})
	})
}

func (s *runtimeGRPCServer) ExecInteractive(stream grpc.BidiStreamingServer[proto.ExecInteractiveRequest, proto.ExecChunk]) error {
	first, err := stream.Recv()
	if err != nil {
		return err
	}
	start := first.GetStart()
	if start == nil {
		return status.Error(codes.InvalidArgument, "first ExecInteractive frame must carry start")
	}
	spec := ExecSpec{
		WorkspaceID: start.GetWorkspaceId(),
		Command:     start.GetCommand(),
		WorkingDir:  start.GetWorkingDir(),
	}
	if sz := start.GetSize(); sz != nil {
		spec.Rows, spec.Cols = uint16(sz.GetRows()), uint16(sz.GetCols())
	}
	// Pump subsequent frames (stdin/resize) into a channel the impl consumes. The goroutine
	// exits on stream EOF/error (client half-close or teardown), closing the channel.
	in := make(chan ExecInput, 32)
	go func() {
		defer close(in)
		for {
			msg, err := stream.Recv()
			if err != nil {
				return
			}
			if r := msg.GetResize(); r != nil {
				in <- ExecInput{Resize: &WinSize{Rows: uint16(r.GetRows()), Cols: uint16(r.GetCols())}}
			} else if b := msg.GetStdin(); len(b) > 0 {
				in <- ExecInput{Stdin: b}
			}
		}
	}()
	return s.impl.ExecInteractive(stream.Context(), spec, in, func(c ExecChunk) error {
		return stream.Send(&proto.ExecChunk{
			Stdout:   c.Stdout,
			Stderr:   c.Stderr,
			ExitCode: c.ExitCode,
			Done:     c.Done,
		})
	})
}

func (s *runtimeGRPCServer) ListFiles(ctx context.Context, req *proto.ListFilesRequest) (*proto.ListFilesResponse, error) {
	entries, err := s.impl.ListFiles(ctx, req.GetWorkspaceId(), req.GetPath())
	if err != nil {
		return nil, err
	}
	out := make([]*proto.FileEntry, 0, len(entries))
	for _, e := range entries {
		out = append(out, &proto.FileEntry{Name: e.Name, Path: e.Path, IsDir: e.IsDir, Size: e.Size})
	}
	return &proto.ListFilesResponse{Entries: out}, nil
}

func (s *runtimeGRPCServer) ReadFile(ctx context.Context, req *proto.FileRef) (*proto.ReadFileResponse, error) {
	content, err := s.impl.ReadFile(ctx, req.GetWorkspaceId(), req.GetPath())
	if err != nil {
		return nil, err
	}
	return &proto.ReadFileResponse{Content: content}, nil
}

func (s *runtimeGRPCServer) WriteFile(ctx context.Context, req *proto.WriteFileRequest) (*proto.WriteFileResponse, error) {
	if err := s.impl.WriteFile(ctx, req.GetWorkspaceId(), req.GetPath(), req.GetContent(), req.GetCreateDirs()); err != nil {
		return nil, err
	}
	return &proto.WriteFileResponse{Ok: true}, nil
}

func (s *runtimeGRPCServer) SnapshotWorkspace(ctx context.Context, req *proto.SnapshotRequest) (*proto.SnapshotResponse, error) {
	res, err := s.impl.SnapshotWorkspace(ctx, req.GetWorkspaceId(), req.GetLabel())
	if err != nil {
		return nil, err
	}
	return &proto.SnapshotResponse{WorkspaceId: res.WorkspaceID, SnapshotId: res.SnapshotID, Message: res.Message}, nil
}

func (s *runtimeGRPCServer) RestoreWorkspace(ctx context.Context, req *proto.RestoreRequest) (*proto.WorkspaceStatusResponse, error) {
	st, err := s.impl.RestoreWorkspace(ctx, req.GetWorkspaceId(), req.GetSnapshotId())
	if err != nil {
		return nil, err
	}
	return statusProto(st), nil
}

func (s *runtimeGRPCServer) ForkWorkspace(ctx context.Context, req *proto.ForkRequest) (*proto.WorkspaceStatusResponse, error) {
	st, err := s.impl.ForkWorkspace(ctx, req.GetSourceWorkspaceId(), req.GetSnapshotId(), req.GetNewWorkspaceId())
	if err != nil {
		return nil, err
	}
	return statusProto(st), nil
}

// ServeRuntime is called by a workspace-runtime plugin binary's main() to expose its
// WorkspaceRuntime over gRPC.
func ServeRuntime(impl WorkspaceRuntime) {
	goplugin.Serve(&goplugin.ServeConfig{
		HandshakeConfig: Handshake,
		Plugins:         RuntimePluginSet(impl),
		GRPCServer:      goplugin.DefaultGRPCServer,
	})
}
