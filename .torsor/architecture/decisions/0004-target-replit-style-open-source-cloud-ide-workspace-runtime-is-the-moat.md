---
type: decision
status: accepted
tags:
- adr
links: []
created: '2026-06-15T15:45:30'
updated: '2026-06-15T15:45:30'
rules: []
---

# ADR 0004: Target: Replit-style open-source cloud IDE; workspace runtime is the moat

## Context
User goal (2026-06-15): build a Replit-like open-source, self-hostable platform. Platform analysis: frontend is ~30% real (project/file LOADING wired to /api/v1 via projectStore) and ~70% mock (editor edits don't persist; terminal, preview, AI agent, file create/delete are simulated in useAppStore/chatStore). Backend: Express apps/api is live; Go apps/control-plane is a parallel 1:1 port that already has a proven gRPC plugin pattern (ModelProvider) + SSE/WebSocket streaming gateway, but no WorkspaceRuntime yet. Go and protoc are NOT installed in this environment, so Go/gRPC work cannot be compiled or verified here.

## Decision
Move toward Replit parity along the existing ROADMAP. The flagship differentiator is Phase 2: per-user cloud workspace CONTAINERS behind a WorkspaceRuntime gRPC capability (mirroring the ModelProvider plugin pattern), giving real files + PTY terminal + dev-server preview. Sequence: (1) make the edit loop real (persist Monaco edits + file CRUD to the backend file API), (2) WorkspaceRuntime gRPC contract + Docker impl + in-container agent, (3) gateway-proxied live preview, (4) agent loop with Ollama-default/BYO-key ModelProviders. First shipped increment: real file delete + rename (PATCH) endpoints in apps/api (only list+upsert existed before), following per-user ownership + parameterized SQL, plus matching projectStore methods.

## Consequences
apps/api gains DELETE and PATCH /projects/:id/files/:fileId; the Go control plane must mirror these to stay 1:1 (deferred — needs a Go toolchain). The risky three-store frontend bridge (useAppStore editor ↔ projectStore API files ↔ editorStore tabs) is the next frontend step but needs the app actually running to verify, not just tsc. Backend container work (WorkspaceRuntime) is blocked on installing Go + protoc.
