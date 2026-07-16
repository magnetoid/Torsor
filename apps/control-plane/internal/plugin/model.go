// Package plugin defines Torsor's backend capability contracts and the
// hashicorp/go-plugin host that runs plugins out-of-process over gRPC.
//
// ModelProvider is the first capability. Adding another capability (WorkspaceRuntime,
// DeployTarget, ...) means defining its proto + a Go-facing interface and a matching
// pair of gRPC client/server adapters, following the shape below.
package plugin

import (
	"context"
	"io"

	goplugin "github.com/hashicorp/go-plugin"
	"google.golang.org/grpc"

	proto "github.com/magnetoid/torsor/control-plane/internal/plugin/proto"
)

// Handshake is the magic-cookie handshake shared by the host and every plugin. A
// mismatch makes the plugin refuse to start, preventing accidental execution of
// non-plugin binaries.
var Handshake = goplugin.HandshakeConfig{
	ProtocolVersion:  1,
	MagicCookieKey:   "TORSOR_PLUGIN",
	MagicCookieValue: "torsor-plugin-v1",
}

// ModelProviderKey is the dispense key used to fetch a ModelProvider from a plugin.
const ModelProviderKey = "model_provider"

// PluginSet is the map of capabilities a plugin may expose. The host and plugins must
// agree on it.
func PluginSet(impl ModelProvider) goplugin.PluginSet {
	return goplugin.PluginSet{
		ModelProviderKey: &ModelProviderPlugin{Impl: impl},
	}
}

// ModelInfo is static provider metadata.
type ModelInfo struct {
	Name        string
	DisplayName string
	Version     string
	Kind        string
}

// CompleteRequest is a single completion request.
type CompleteRequest struct {
	Prompt      string
	System      string
	MaxTokens   int32
	Temperature float64
	// APIKey is an optional per-request credential (a caller's decrypted BYO secret).
	// Empty => the plugin uses its own host-env key.
	APIKey string
}

// CompleteResult is a single completion result.
type CompleteResult struct {
	Text      string
	Model     string
	TokensIn  int32
	TokensOut int32
}

// Chunk is one streamed piece of a completion.
type Chunk struct {
	TextDelta string
	Done      bool
	Model     string
	TokensOut int32
}

// ModelProvider is the Go-facing capability interface. Both the host (client side) and
// plugins (server side) program against this; gRPC is an implementation detail.
type ModelProvider interface {
	Info(ctx context.Context) (ModelInfo, error)
	Complete(ctx context.Context, req CompleteRequest) (CompleteResult, error)
	// CompleteStream streams the completion, invoking onChunk for each delta. Returning
	// a non-nil error from onChunk (e.g. client disconnected) aborts the stream.
	CompleteStream(ctx context.Context, req CompleteRequest, onChunk func(Chunk) error) error
}

// ModelProviderPlugin adapts a ModelProvider to hashicorp/go-plugin's gRPC plugin.
type ModelProviderPlugin struct {
	goplugin.NetRPCUnsupportedPlugin
	Impl ModelProvider
}

func (p *ModelProviderPlugin) GRPCServer(_ *goplugin.GRPCBroker, s *grpc.Server) error {
	proto.RegisterModelProviderServer(s, &grpcServer{impl: p.Impl})
	return nil
}

func (p *ModelProviderPlugin) GRPCClient(_ context.Context, _ *goplugin.GRPCBroker, c *grpc.ClientConn) (any, error) {
	return &grpcClient{client: proto.NewModelProviderClient(c)}, nil
}

// grpcClient is the host-side adapter: ModelProvider backed by a gRPC client.
type grpcClient struct {
	client proto.ModelProviderClient
}

func (c *grpcClient) Info(ctx context.Context) (ModelInfo, error) {
	resp, err := c.client.Info(ctx, &proto.InfoRequest{})
	if err != nil {
		return ModelInfo{}, err
	}
	return ModelInfo{
		Name:        resp.GetName(),
		DisplayName: resp.GetDisplayName(),
		Version:     resp.GetVersion(),
		Kind:        resp.GetKind(),
	}, nil
}

func (c *grpcClient) Complete(ctx context.Context, req CompleteRequest) (CompleteResult, error) {
	resp, err := c.client.Complete(ctx, &proto.CompleteRequest{
		Prompt:      req.Prompt,
		System:      req.System,
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
		ApiKey:      req.APIKey,
	})
	if err != nil {
		return CompleteResult{}, err
	}
	return CompleteResult{
		Text:      resp.GetText(),
		Model:     resp.GetModel(),
		TokensIn:  resp.GetTokensIn(),
		TokensOut: resp.GetTokensOut(),
	}, nil
}

func (c *grpcClient) CompleteStream(ctx context.Context, req CompleteRequest, onChunk func(Chunk) error) error {
	stream, err := c.client.CompleteStream(ctx, &proto.CompleteRequest{
		Prompt:      req.Prompt,
		System:      req.System,
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
		ApiKey:      req.APIKey,
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
		if cbErr := onChunk(Chunk{
			TextDelta: chunk.GetTextDelta(),
			Done:      chunk.GetDone(),
			Model:     chunk.GetModel(),
			TokensOut: chunk.GetTokensOut(),
		}); cbErr != nil {
			return cbErr
		}
	}
}

// grpcServer is the plugin-side adapter: a gRPC server backed by a ModelProvider impl.
type grpcServer struct {
	proto.UnimplementedModelProviderServer
	impl ModelProvider
}

func (s *grpcServer) Info(ctx context.Context, _ *proto.InfoRequest) (*proto.InfoResponse, error) {
	info, err := s.impl.Info(ctx)
	if err != nil {
		return nil, err
	}
	return &proto.InfoResponse{
		Name:        info.Name,
		DisplayName: info.DisplayName,
		Version:     info.Version,
		Kind:        info.Kind,
	}, nil
}

func (s *grpcServer) Complete(ctx context.Context, req *proto.CompleteRequest) (*proto.CompleteResponse, error) {
	res, err := s.impl.Complete(ctx, CompleteRequest{
		Prompt:      req.GetPrompt(),
		System:      req.GetSystem(),
		MaxTokens:   req.GetMaxTokens(),
		Temperature: req.GetTemperature(),
		APIKey:      req.GetApiKey(),
	})
	if err != nil {
		return nil, err
	}
	return &proto.CompleteResponse{
		Text:      res.Text,
		Model:     res.Model,
		TokensIn:  res.TokensIn,
		TokensOut: res.TokensOut,
	}, nil
}

func (s *grpcServer) CompleteStream(req *proto.CompleteRequest, stream grpc.ServerStreamingServer[proto.CompleteChunk]) error {
	return s.impl.CompleteStream(stream.Context(), CompleteRequest{
		Prompt:      req.GetPrompt(),
		System:      req.GetSystem(),
		MaxTokens:   req.GetMaxTokens(),
		Temperature: req.GetTemperature(),
		APIKey:      req.GetApiKey(),
	}, func(c Chunk) error {
		return stream.Send(&proto.CompleteChunk{
			TextDelta: c.TextDelta,
			Done:      c.Done,
			Model:     c.Model,
			TokensOut: c.TokensOut,
		})
	})
}
