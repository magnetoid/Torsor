---
type: active-context
status: active
tags:
- active
links: []
created: '2026-06-15T23:20:41'
updated: '2026-06-15T23:20:41'
---

# Active Context

## Current focus
Replit-style open-source cloud IDE. Workspace runtime moat is now multi-tenant-safe. Next user-visible step: wire the frontend (file tree + xterm terminal) to a live project workspace, and exercise the docker-runtime against a live daemon.

## Open questions
Remaining toward Replit: (1) frontend bridge — wire file tree + xterm terminal + editor to the live /projects/{id}/workspace* routes (needs running app+Docker to verify). (2) docker-runtime: full lifecycle vs a live daemon + resource quotas (--memory/--cpus/--pids-limit) + egress policy for untrusted code. (3) mirror the new workspace + admin + file routes into... wait, workspace routes ARE in the Go control plane; the apps/api Express side does NOT have workspace routes yet (only the migration) — decide whether workspace runtime lives only in Go (likely, since it needs the plugin host) and plan the Express→Go cutover accordingly. (4) revenue/billing data source for the admin revenue tab.
