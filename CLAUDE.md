# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Torsor is

An open-source, self-hostable, modular "vibe-coding" cloud IDE. The repo is **mid-migration**: a working React frontend + Node/Express backend (the `[now]` implementation) is being replaced, capability by capability, with a Go control plane. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the target design and [docs/ROADMAP.md](docs/ROADMAP.md) for the phased path. Sections in those docs are tagged `[now]` / `[partial]` / `[target]` — respect those tags; much of the UI is intentionally mock-heavy and much of the architecture is aspirational, not built.

## Repo layout (three backends + one frontend)

- **`src/`** — React 19 + Vite + Tailwind 4 frontend (repo root, not under `apps/`). This is the strongest existing asset and carries forward unchanged.
- **`apps/api/`** — Express + TypeScript REST API. The current `[now]` backend; everything is wired to it.
- **`apps/worker/`** — background job processor (polls `ai_tasks`, also wakes on the `torsor:jobs` Redis pub/sub channel).
- **`apps/control-plane/`** — Go service that is a deliberate **1:1 port of `apps/api`** (same routes, JSON shapes, schema, JWT/session model). Shipped **in parallel**; nothing depends on it yet. It is the future backend (Phase 1) and additionally hosts the gRPC plugin system + streaming gateway. Adopting it is a reversible cutover, not yet done.

`apps/api` and `apps/control-plane` share the **same Postgres schema and `schema_migrations` table** with idempotent SQL, so either service can run migrations against a shared DB without conflict.

## Commands

```bash
# Install (npm workspaces: root + apps/api + apps/worker)
npm install

# Lint = typecheck. There is no ESLint; "lint" means `tsc --noEmit`.
npm run lint              # frontend + api + worker
npm run lint:frontend     # tsc --noEmit at root

# Build
npm run build             # frontend (vite)
npm run build:all         # frontend + api + worker

# Frontend dev server (port 3000)
npm run dev

# Backend dev (run infra first, then the TS services on the host)
docker compose up postgres redis
npm run dev -w apps/api       # tsx watch, port 3001
npm run dev -w apps/worker

# Full stack in containers
docker compose up --build
docker compose --profile tools up --build   # + adminer DB UI on :8080
```

There is **no test runner configured** — `npm test` does not exist; "tests/CI are still light" per the README. Do not claim tests pass; there are none to run.

### Go control plane

```bash
cd apps/control-plane
go build ./...   # compile
go vet ./...     # static checks
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/torsor_dev \
  REDIS_URL=redis://localhost:6379 NODE_ENV=development go run ./cmd/server
```

Load gRPC model-provider plugins by pointing `TORSOR_MODEL_PLUGINS` at one or more executables (see [apps/control-plane/README.md](apps/control-plane/README.md); `cmd/mock-model` is the reference plugin). Regenerate gRPC stubs with `protoc` after editing `internal/plugin/proto/model.proto`.

The second plugin capability is `WorkspaceRuntime` (Phase 2), which owns per-user cloud workspaces. Load runtime plugins with `TORSOR_WORKSPACE_RUNTIME_PLUGINS` (CSV, same shape as `TORSOR_MODEL_PLUGINS`) plus `TORSOR_DEFAULT_RUNTIME` to pick the default. Reference plugins: `cmd/mock-runtime` (deterministic, in-memory, no Docker — safe on shared hosts) and `cmd/docker-runtime` (real container-per-workspace via the docker CLI). The HTTP surface is `/api/v1/runtimes`, and the runtime workspace id **is** the project id (ownership-scoped, never guessable).

## Frontend architecture

- **State: Zustand, ~22 stores in [src/stores/](src/stores/)** (`authStore`, `projectStore`, `chatStore`, `editorStore`, etc.), one slice per domain. There is also a separate `src/useAppStore.ts` — a core store used by ~14 IDE files (editor tabs, preview, file tree); it is **live, not dead code** despite the duplicate-looking name.
- **Routing: `react-router` v7** in [src/App.tsx](src/App.tsx). Routes are wrapped in `<ErrorBoundary>` + `ProtectedRoute` / `PublicRoute` / `AdminRoute` guards.
- **API client: [src/lib/api.ts](src/lib/api.ts)** — `apiRequest()` is the single fetch wrapper. Pass `{ auth: true }` to attach the bearer token. The JWT lives **only** in `localStorage` under `torsor-auth-token` (the Zustand auth store deliberately does not persist a second copy). `VITE_API_URL` defaults to empty so absolute `/api/v1/...` paths hit the same origin (nginx proxies to the api service); set it only for a cross-origin API.
- **UI primitives: Radix UI + Tailwind 4**, with **CSS-variable design tokens** (`bg-page`, `text-secondary`, `border-default`, …). Theming is a token pack, not component edits — keep new UI on tokens so white-labeling stays drop-in. Editor is Monaco; terminal is xterm.
- The `@` import alias resolves to the repo root (see [vite.config.ts](vite.config.ts)).

## Backend conventions (apps/api)

- Routes live in one file, [apps/api/src/index.ts](apps/api/src/index.ts). Auth/JWT/session/bcrypt logic is in `apps/api/src/auth.ts`; `db.ts` and `redis.ts` are thin pooled clients.
- **Every project/file/task route enforces per-user ownership** (`WHERE ... AND user_id = $X`, returning 404 on miss). Preserve this on any new route. All queries are parameterized.
- **Sessions are validated, not just signed**: `requireAuth` checks the `sessions` row exists and is unexpired, so logout/revocation is real. Don't reintroduce stateless-only JWT checks.
- Roles are `user | admin | super_admin`; `SUPER_ADMIN_EMAILS` auto-promotes on boot.
- Startup retries Postgres → Redis → migrations → super-admin sync → dev-seed forever (services come up before dependencies are ready). In `development` a seed user is created: `demo@torsor.local` / `demo12345`.
- `JWT_SECRET` is **enforced** in production — `auth.ts` throws if it is missing, the dev default, or `< 32` chars.

## Data model

Postgres, UUID PKs, jsonb. Key tables (migrations `0001`–`0003` in [apps/api/migrations/](apps/api/migrations/)): `users`, `projects`, `project_files` (versioned via upsert that bumps `version`), `ai_tasks` (the async queue), `sessions`, `secrets`, `audit_logs`, and `workspaces` (one row per project — `project_id` is `UNIQUE` — owned by a user, records `runtime` / `container_id` / `image` / `status`; lets control-plane workspace ops be scoped to project ownership and survive restarts). The worker reserves pending tasks with `FOR UPDATE SKIP LOCKED` so multiple workers don't double-claim.

## Deployment notes

`docker-compose.yml` is the **production/Coolify-safe base**: internal services use `expose` (no host port bindings) so they don't collide on shared hosts; only `frontend` should be routed externally. For local host ports, add a `docker-compose.override.yml` (example in [README_FULLSTACK.md](README_FULLSTACK.md)) — Compose loads it automatically in dev. The api applies migrations on startup. App domain is `app.torsor.dev`; **leave the `torsor.dev` landing site untouched**.

`docker-compose.control-plane.yml` is a separate **isolated validation stack** for the Go control plane: its own Postgres + Redis, no shared state with the live stack, loading only the in-memory `mock-runtime` (no Docker socket, so it is safe on a shared host). Real container workspaces belong on a dedicated worker host, not here. It binds to loopback (`127.0.0.1`) so a Plesk/nginx reverse-proxy can front a domain like `cp.torsor.dev`.

## torsor-helper MCP

A project-specific `torsor-helper` MCP server is available (tools like `map_repo`, `recall`, `remember`, `record_decision`, `get_rules`, `check_drift`, `impact`, `handoff`). Use it for repo-aware context, decision history, and rules when working in this codebase.

<!-- torsor:rules -->
## Project rules (torsor-helper)

### Non-negotiable principles
- **Free and open by default.** Works with local models (Ollama) — no API key or paid
  service required. Hosted models (Claude/OpenAI/Gemini) are opt-in, never required.
- **Kernel + contributions.** Keep the core small and stable. Every feature is a plugin
  on a versioned public contract — modular in fact, not just on paper.
- **Per-user ownership on every data route.** Project/file/task queries always scope by
  `user_id` and 404 on a miss. Never weaken this. All SQL is parameterized.
- **Sessions are validated, not just signed.** Auth checks the `sessions` row (exists +
  unexpired) so logout/revocation is real. Never fall back to stateless-only JWT checks.
- **Theming is a token pack, not a fork.** UI stays on CSS-variable design tokens so
  white-labeling is drop-in and requires no component changes.
- **Respect the `[now]` / `[partial]` / `[target]` doc tags.** Much of the architecture
  is aspirational. Don't treat target design as built, or present mock UI as real.
- **The Go control plane is a reversible parallel port.** Keep it 1:1 with `apps/api`
  (routes, JSON shapes, schema) until a deliberate cutover — don't let them diverge.

### Architecture rules (machine-enforced — `torsor guard` flags violations)
- forbid_pattern: `console\.log` in `apps/api/src/**/*.ts` — apps/api uses the pino structured logger (and req.log) — avoid console.log. (per ADR 0002: Data-access & auth invariants)
- forbid_pattern: `@google/genai` in `src/**/*.tsx` — Phase 0 removed @google/genai. Frontend model access goes through the backend ModelProvider, not a bundled SDK. (per ADR 0003: Theming via design tokens; no bundled model SDK in the frontend)
- forbid_pattern: `@google/genai` in `src/**/*.ts` — Phase 0 removed @google/genai. Frontend model access goes through the backend ModelProvider, not a bundled SDK. (per ADR 0003: Theming via design tokens; no bundled model SDK in the frontend)
- forbid_pattern: `#[0-9a-fA-F]{6}\b` in `src/components/**/*.tsx` — Use CSS-variable design tokens (bg-page, text-secondary, border-default, …), not raw hex — keeps theming/white-label drop-in. (per ADR 0003: Theming via design tokens; no bundled model SDK in the frontend)
<!-- /torsor:rules -->
