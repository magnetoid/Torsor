# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Torsor is

An open-source, self-hostable, modular "vibe-coding" cloud IDE. The repo is **mid-migration**: a working React frontend + Node/Express backend (the `[now]` implementation) is being replaced, capability by capability, with a Go control plane. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the target design and [docs/ROADMAP.md](docs/ROADMAP.md) for the phased path. Sections in those docs are tagged `[now]` / `[partial]` / `[target]` — respect those tags; much of the UI is intentionally mock-heavy and much of the architecture is aspirational, not built.

## Repo layout (three backends + one frontend)

- **`src/`** — React 19 + Vite + Tailwind 4 frontend (repo root, not under `apps/`). This is the strongest existing asset and carries forward unchanged.
- **`apps/control-plane/`** — Go service: **the backend** as of the cutover (ADR 0009). The default install (`docker-compose.yml` → `nginx.conf`) now routes the frontend to it; it applies migrations and hosts auth/projects/files, the gRPC plugin system (model providers + workspace runtimes), the coding-agent loop, live preview, and terminal exec. Began as a 1:1 port of `apps/api`; the cutover is deliberate but **reversible** (flip nginx/compose back).
- **`apps/api/`** — Express + TypeScript REST API. The **legacy** backend, retained for reference and rollback; no longer in the default stack. Kept until the control-plane is battle-tested, then removed.
- **`apps/worker/`** — legacy background job processor (polled `ai_tasks`, woke on the `torsor:jobs` Redis channel). Retired from the default stack; the control-plane's agent loop replaces it.

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

Tests are **light but no longer absent**. The frontend now has **vitest** (`npm test` → `vitest run`, `npm run test:watch`); coverage is a starting smoke set (e.g. `src/stores/chatStore.test.ts`), not comprehensive — don't claim broad frontend coverage. The Go control plane has real unit tests (`go test ./...`, incl. `internal/agent`, `internal/server`, `docker-runtime`). `apps/api` / `apps/worker` still have no tests. Run what exists; don't claim suites that aren't there.

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

The **coding agent loop** (`internal/agent`) is the vibe-coding core: a ReAct loop where the model returns one JSON step per turn — a thought plus either a tool action (`list_files`/`read_file`/`write_file`/`run`) against the project's `WorkspaceRuntime`, or a `final` answer. It depends only on narrow `Model`/`Workspace` interfaces (the plugin `ModelProvider`/`WorkspaceRuntime` satisfy them), so it's unit-tested with fakes — no model or Docker needed. The loop parses tool calls from model **text** (not native function-calling) because that's the most reliable shape across local open models. HTTP surface: `POST /api/v1/projects/{projectID}/agent/stream` streams each step as SSE (`{kind: thought|tool_call|tool_result|final|error, ...}`); it requires a provisioned workspace and is ownership-scoped via `loadWorkspace`. `cmd/mock-agent-model` is a ModelProvider plugin that emits valid JSON steps so the whole loop runs end-to-end against `mock-runtime` with no external model.

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
- **Open-source first (ADR 0010).** By default, integrate/adapt mature open-source code,
  libraries, and tools behind Torsor's plugin/kernel contracts rather than writing bespoke
  equivalents — reach for the OSS option first (Yjs, firecracker-go-sdk, the MCP SDK, …).
  Build in-house only when nothing fits, the license is incompatible with free/open
  redistribution, it fails security/maintenance review, or it adds disproportionate bloat.
  Record the source + license when integrating.
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
- **The Go control plane is the backend (cutover done — ADR 0009).** It is now the
  default runtime; `apps/api` is legacy (reference/rollback only). The cutover stays
  reversible (nginx/compose can flip back), so don't delete `apps/api` yet — but new
  work targets the control-plane, and the two need not stay 1:1.

### Architecture rules (machine-enforced — `torsor guard` flags violations)
- forbid_pattern: `console\.log` in `apps/api/src/**/*.ts` — apps/api uses the pino structured logger (and req.log) — avoid console.log. (per ADR 0002: Data-access & auth invariants)
- forbid_pattern: `@google/genai` in `src/**/*.tsx` — Phase 0 removed @google/genai. Frontend model access goes through the backend ModelProvider, not a bundled SDK. (per ADR 0003: Theming via design tokens; no bundled model SDK in the frontend)
- forbid_pattern: `@google/genai` in `src/**/*.ts` — Phase 0 removed @google/genai. Frontend model access goes through the backend ModelProvider, not a bundled SDK. (per ADR 0003: Theming via design tokens; no bundled model SDK in the frontend)
- forbid_pattern: `#[0-9a-fA-F]{6}\b` in `src/components/**/*.tsx` — Use CSS-variable design tokens (bg-page, text-secondary, border-default, …), not raw hex — keeps theming/white-label drop-in. (per ADR 0003: Theming via design tokens; no bundled model SDK in the frontend)
- forbid_pattern: `exec\.Command\("docker"` in `apps/control-plane/internal/**/*.go` — Container execution belongs in the WorkspaceRuntime plugin (cm…[truncated]
<!-- /torsor:rules -->
