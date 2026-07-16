---
type: decision
status: accepted
tags:
- adr
links: []
created: '2026-07-16T03:48:43'
updated: '2026-07-16T03:48:43'
rules: []
---

# ADR 0009: Backend cutover: the Go control-plane is the backend (retire apps/api parity rule)

## Context
The frontend was rewired to call control-plane-only endpoints (model providers, agent stream, workspace lifecycle, terminal exec, live preview, image registry), but the default install (docker-compose.yml → nginx → apps/api Express + a mock worker) routed to none of them — so out of the box the chat 404'd and the worker fabricated results. apps/control-plane reached 100% HTTP route parity with apps/api (verified A/B on a shared DB, commit a328e5a) and adds all the real AI/workspace/preview capability. ADRs 0001-0008 reserved a 'deliberate, reversible cutover' and required keeping the two backends 1:1 until then. That condition is now met.

## Decision
Execute the cutover: the Go control-plane (apps/control-plane) is now THE backend of the default stack. docker-compose.yml replaces the api (Express) service with control-plane; nginx upstream points at control-plane:3001; the mock worker service is removed (the shipping UI uses /agent/stream + /complete/stream, not the /tasks queue). The control-plane image bundles the ollama-model provider and the mock + docker workspace runtimes so the stack does real work out of the box. apps/api and apps/worker are retained in-tree for now (reference + rollback) but are no longer wired into the default deployment; the 'keep control-plane 1:1 with apps/api' rule from earlier ADRs is retired — the control-plane is now the source of truth and may diverge (e.g. new secrets/deploy/checkpoint endpoints the Express service will not get).

## Consequences
The default install now actually performs the AI agent loop, real container terminals, live preview, and model completions. Security posture improved in the same pass (fail-closed JWT/session/CORS). Trade-offs: real workspaces require a Docker socket mounted into the control-plane (documented as single-tenant-only; multi-tenant needs a dedicated worker host or the future firecracker-runtime); Ollama must be reachable for the free AI default (optional `ollama` compose profile or a host install). apps/api/apps/worker now bit-rot unless deliberately maintained; a future cleanup may delete them. Rollback is still possible by re-pointing nginx + compose at api, since the code remains.
