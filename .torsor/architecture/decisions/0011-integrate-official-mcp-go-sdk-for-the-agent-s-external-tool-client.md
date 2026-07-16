---
type: decision
status: accepted
tags:
- adr
links: []
created: '2026-07-17T00:58:37'
updated: '2026-07-17T00:58:37'
rules: []
---

# ADR 0011: Integrate official MCP Go SDK for the agent's external-tool client

## Context
Phase 5 gives the coding agent the ability to call tools from Model Context Protocol (MCP) servers — the 2027 interoperability standard (97M monthly SDK downloads, ~10k registry servers). We needed an MCP client in the control plane: connect to a user-configured server, list its tools, call them, forwarding auth. Options were (a) hand-roll JSON-RPC 2.0 over streamable-HTTP/SSE, or (b) integrate the official SDK.

## Decision
Integrate the official Model Context Protocol Go SDK — github.com/modelcontextprotocol/go-sdk v1.6.1, MIT License — behind a thin internal/mcpx wrapper, per ADR 0010 (open-source first). mcpx.Dial/Call/TestConnect adapt the SDK to Torsor's "mcp:<server>.<tool>" naming and the agent's string-argument shape; auth headers ride an http.RoundTripper. The agent consumes it through a narrow ToolRouter interface (agent.Config.Tools), so the loop stays decoupled from MCP specifics and the SDK is swappable. MCP is treated as a core control-plane feature (not a hashicorp/go-plugin capability): MCP *is* the tool-plugin protocol, so wrapping it in the plugin system would add a hop with no isolation benefit, and the ADR-0008 no-hosted-model-SDK rule is not implicated (MCP SDK is a protocol client, not a model vendor SDK).

## Consequences
New deps: modelcontextprotocol/go-sdk (MIT), google/jsonschema-go, segmentio/encoding, golang.org/x/oauth2. Agent runs now dial the user's enabled MCP servers at run start and close them after (both sync /agent/stream and background worker paths). String-only tool arguments are a known limitation of the text-JSON agent protocol (tools whose schema wants non-string types may reject args). Deferred: exposing Torsor itself as an MCP server (+ PATs) and native tool-calling in the model proto.
