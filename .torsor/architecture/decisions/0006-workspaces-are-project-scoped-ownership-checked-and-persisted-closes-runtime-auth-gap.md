---
type: decision
status: accepted
tags:
- adr
links: []
created: '2026-06-15T23:18:56'
updated: '2026-06-15T23:18:56'
rules: []
---

# ADR 0006: Workspaces are project-scoped, ownership-checked, and persisted (closes runtime auth gap)

## Context
The first cut of the WorkspaceRuntime HTTP API exposed /api/v1/runtimes/{name}/workspaces/{id}/* — authenticated but with NO per-user ownership check, so any logged-in user could create/exec/read-files/destroy any workspace by guessing its id. For a platform that runs untrusted code this is a serious multi-tenant hole.

## Decision
Removed the raw per-id runtime routes. Added a persisted `workspaces` table (migration 0003 in BOTH apps/api/migrations and apps/control-plane/internal/migrations; one row per project via UNIQUE(project_id), columns project_id+user_id+runtime+container_id+image+status). Replaced the API with project-scoped routes /api/v1/projects/{projectID}/workspace* where every handler first checks ownsProject(user), and the runtime workspace id passed to the plugin is ALWAYS the project id — never a client-supplied value. Runtime selection: explicit request field, else TORSOR_DEFAULT_RUNTIME, else the sole loaded runtime. GET /api/v1/runtimes (plugin metadata only) is kept. Lifecycle transitions persist status; destroy deletes the row.

## Consequences
Workspace ops are now multi-tenant-safe and survive restarts. apps/api must mirror these routes (and run migration 0003 — already added there) to stay 1:1 once cutover happens. Verified: go build/vet/gofmt clean, plugin + docker-runtime tests pass. Still pending: per-workspace resource quotas (cpu/mem/pids) + egress policy on the docker runtime; full lifecycle against a live Docker daemon; frontend wiring to these routes.
