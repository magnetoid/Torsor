---
type: system-patterns
status: active
tags: [architecture]
---

# System Patterns

## Architecture overview
Frontend (React/Vite) talks to the backend over REST (`/api/v1/...`) + bearer JWT, with
WebSocket/SSE for streaming. The backend exists in two parallel implementations sharing
one Postgres schema: `apps/api` (Express, live) and `apps/control-plane` (Go, the future
kernel with a gRPC plugin host). `apps/worker` drains the `ai_tasks` queue. Redis carries
job signaling (`torsor:jobs` pub/sub) and cache. Target design: kernel + plugin
contributions (WorkspaceRuntime, ModelProvider, DeployTarget, …) — see docs/ARCHITECTURE.md.

## Conventions
- **Lint = typecheck** (`tsc --noEmit`). No ESLint, no test runner — don't claim tests pass.
- **Per-user ownership** on every project/file/task route: `WHERE ... AND user_id = $X`,
  404 on miss. Parameterized SQL only.
- **Validated sessions:** `requireAuth` checks the `sessions` row (exists + unexpired) —
  real revocation, not stateless JWT.
- **Design tokens:** new UI uses CSS-variable tokens (`bg-page`, `text-secondary`,
  `border-default`, …), never hardcoded colors — keeps theming/white-label drop-in.
- **Frontend API access** goes through `apiRequest()` in `src/lib/api.ts`; the JWT lives
  only in `localStorage['torsor-auth-token']` (the Zustand store does not persist a copy).
- **Go control plane stays 1:1 with `apps/api`** (routes, JSON shapes, schema) until a
  deliberate cutover.

## Patterns in use
- Zustand: one store slice per domain in `src/stores/`; plus a core `src/useAppStore.ts`
  (live, despite the duplicate-looking name).
- Backend boot: retry-forever on Postgres → Redis → migrations → super-admin sync → seed.
- Worker claims tasks with `FOR UPDATE SKIP LOCKED` to avoid double-processing.
- Backend plugins are out-of-process gRPC (hashicorp/go-plugin); streaming surfaces over
  both SSE (Bearer header) and WebSocket (`access_token` query param).
