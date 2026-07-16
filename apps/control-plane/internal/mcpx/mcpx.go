// Package mcpx is Torsor's thin client wrapper over the official Model Context Protocol Go
// SDK (github.com/modelcontextprotocol/go-sdk). It connects to user-configured MCP servers,
// lists their tools, and calls them — so the coding agent can use any MCP server's tools as
// if they were built in. Per ADR 0010 the transport/protocol work is the OSS SDK's; this
// package only adapts it to Torsor's "mcp:<server>.<tool>" naming and string-argument shape.
package mcpx

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Server describes an MCP server to connect to.
type Server struct {
	Name       string
	URL        string
	Transport  string // "streamable-http" (default) | "sse"
	AuthHeader string // full Authorization header value, or "" for none
}

// ToolRef is one tool exposed by a connected server.
type ToolRef struct {
	Server      string
	Tool        string // bare tool name on the server
	Qualified   string // "mcp:<server>.<tool>" — what the model emits to call it
	Description string
}

type toolLoc struct{ server, tool string }

// Router holds live sessions to one or more MCP servers and dispatches tool calls. Build it
// at run start with Dial and Close it when the run ends.
type Router struct {
	sessions map[string]*mcp.ClientSession
	tools    []ToolRef
	byQual   map[string]toolLoc
}

// Dial connects to each server and lists its tools. Unreachable servers are skipped (the run
// continues with whatever connected), so one bad endpoint never fails a run. Returns a Router
// with zero tools if nothing connected — always Close it.
func Dial(ctx context.Context, servers []Server) *Router {
	r := &Router{sessions: map[string]*mcp.ClientSession{}, byQual: map[string]toolLoc{}}
	for _, s := range servers {
		cs, err := connect(ctx, s)
		if err != nil {
			continue
		}
		lt, err := cs.ListTools(ctx, nil)
		if err != nil {
			_ = cs.Close()
			continue
		}
		r.sessions[s.Name] = cs
		for _, t := range lt.Tools {
			qual := "mcp:" + s.Name + "." + t.Name
			r.tools = append(r.tools, ToolRef{Server: s.Name, Tool: t.Name, Qualified: qual, Description: t.Description})
			r.byQual[qual] = toolLoc{server: s.Name, tool: t.Name}
		}
	}
	return r
}

// Tools returns all tools across connected servers.
func (r *Router) Tools() []ToolRef { return r.tools }

// Call invokes a qualified tool ("mcp:<server>.<tool>") with string arguments and returns the
// flattened text result. A tool-level error is returned as observation text (prefixed
// "error:") so the agent can react rather than aborting.
func (r *Router) Call(ctx context.Context, qualified string, args map[string]string) (string, error) {
	loc, ok := r.byQual[qualified]
	if !ok {
		return "", fmt.Errorf("unknown MCP tool %q", qualified)
	}
	cs := r.sessions[loc.server]
	if cs == nil {
		return "", fmt.Errorf("MCP server %q is not connected", loc.server)
	}
	// The model emits string args; forward them as a generic map. Tools whose schema wants
	// non-string types may reject these — a known limitation of the text-JSON agent protocol.
	arguments := make(map[string]any, len(args))
	for k, v := range args {
		arguments[k] = v
	}
	res, err := cs.CallTool(ctx, &mcp.CallToolParams{Name: loc.tool, Arguments: arguments})
	if err != nil {
		return "", err
	}
	return flatten(res), nil
}

// Close ends all sessions. Safe to call once after a run.
func (r *Router) Close() {
	for _, cs := range r.sessions {
		_ = cs.Close()
	}
	r.sessions = map[string]*mcp.ClientSession{}
}

// TestConnect dials a single server, lists its tools, and returns the tool names. Unlike
// Dial it surfaces the connection error, so the "test" UI can report why a server failed.
func TestConnect(ctx context.Context, s Server) ([]string, error) {
	cs, err := connect(ctx, s)
	if err != nil {
		return nil, err
	}
	defer cs.Close()
	lt, err := cs.ListTools(ctx, nil)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(lt.Tools))
	for _, t := range lt.Tools {
		names = append(names, t.Name)
	}
	return names, nil
}

func connect(ctx context.Context, s Server) (*mcp.ClientSession, error) {
	client := mcp.NewClient(&mcp.Implementation{Name: "torsor", Version: "0.1.0"}, nil)
	httpClient := &http.Client{Timeout: 30 * time.Second}
	if s.AuthHeader != "" {
		httpClient.Transport = &authRoundTripper{header: s.AuthHeader, base: http.DefaultTransport}
	}
	var transport mcp.Transport
	switch strings.ToLower(strings.TrimSpace(s.Transport)) {
	case "sse":
		transport = &mcp.SSEClientTransport{Endpoint: s.URL, HTTPClient: httpClient}
	default:
		transport = &mcp.StreamableClientTransport{Endpoint: s.URL, HTTPClient: httpClient}
	}
	// Bound the initialize handshake so a hung server doesn't stall a run.
	dialCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return client.Connect(dialCtx, transport, nil)
}

// authRoundTripper injects a fixed Authorization header on every request (per-user encrypted
// header, decrypted just before Dial). Clones the request so it never mutates a shared one.
type authRoundTripper struct {
	header string
	base   http.RoundTripper
}

func (a *authRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.Header.Set("Authorization", a.header)
	return a.base.RoundTrip(clone)
}

// flatten concatenates the text content of a tool result. A tool-level error is prefixed so
// the agent sees it as a recoverable observation.
func flatten(res *mcp.CallToolResult) string {
	var b strings.Builder
	for _, c := range res.Content {
		if tc, ok := c.(*mcp.TextContent); ok {
			b.WriteString(tc.Text)
		}
	}
	out := strings.TrimSpace(b.String())
	if out == "" {
		out = "(no text content)"
	}
	if res.IsError {
		return "error: " + out
	}
	return out
}
