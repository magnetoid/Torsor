---
type: tech-context
status: active
tags: [architecture]
---

# Tech Context

## Stack & versions
- **Frontend:** React 19 + Vite 6 + Tailwind 4, Zustand state, react-router v7, Radix UI,
  Monaco editor, xterm terminal. Lives at the repo root under `src/` (not `apps/`).
- **Current backend (`[now]`):** `apps/api` — Express 4 + TypeScript (ESM), `pg`, `redis`,
  `pino`, `bcryptjs`, `jsonwebtoken`. `apps/worker` polls the `ai_tasks` queue.
- **Future backend (`[target]`):** `apps/control-plane` — Go, single static binary, pgx,
  chi router, hashicorp/go-plugin (gRPC) plugin host, slog. 1:1 port of `apps/api`.
- **Data:** PostgreSQL 16 (UUID PKs, jsonb), Redis 7 (job signaling / cache).
- **Tooling:** npm workspaces (root + `apps/api` + `apps/worker`). "Lint" == `tsc --noEmit`
  (no ESLint). No test runner is configured.
- **CLI tool:** `torsor-helper` v0.3.0 installed via `uv tool` (not pip).

## Constraints
- `apps/api` and `apps/control-plane` share one Postgres schema and `schema_migrations`
  table; migration SQL must stay idempotent so either service can apply it.
- `JWT_SECRET` is enforced in production: `apps/api/src/auth.ts` throws if it is missing,
  the dev default, or `< 32` chars.
- `docker-compose.yml` is the production/Coolify-safe base — internal services use
  `expose`, not host `ports`; only `frontend` is routed externally. Local host ports come
  from a `docker-compose.override.yml`.
- App domain is `app.torsor.dev`; the `torsor.dev` landing site must stay untouched.
- Migrations are applied by the backend on startup.
