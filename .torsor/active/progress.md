---
type: progress
status: active
tags:
- active
links: []
created: '2026-06-15T23:20:41'
updated: '2026-06-15T23:20:41'
---

# Progress

Closed the workspace auth gap: removed unsafe /runtimes/{name}/workspaces/{id} routes; added persisted workspaces table (migration 0003 in both apps/api and control-plane migration dirs) + project-scoped, ownership-checked /api/v1/projects/{id}/workspace* routes (runtime ws id = project id, never client-supplied). Added TORSOR_DEFAULT_RUNTIME config. Verified: go build/vet/gofmt clean + tests pass; api + frontend tsc pass. Recorded ADR 0006. Earlier this session: superadmin dashboard (apps/api admin API + adminStore + wired tabs), WorkspaceRuntime capability (mock + docker runtimes), apps/api file delete/rename.
