# Torsor Architecture

> **Status note (2026-06):** This document describes the **target architecture** for
> Torsor as a flagship, open-source, self-hostable vibe-coding IDE. It supersedes the
> earlier Node/Express/Gemini foundation docs. Sections are marked **[now]** (already
> built), **[target]** (the direction we are building toward), or **[partial]**.
> The phased path from *now* to *target* lives in [`ROADMAP.md`](./ROADMAP.md).

## Vision

Torsor is an **open-source, self-hostable, modular vibe-coding platform** — an
interactive cloud development environment for AI-assisted ("vibe coding") teams.

Design principles:

1. **Free and open by default.** Works out of the box with local models (Ollama),
   no API key or paid service required. Hosted models are opt-in (BYO-key).
2. **Install a small server.** The control plane ships as a single static Go binary.
   Everything — editing, terminals, dev servers, previews, deploys — runs in the
   cloud the user controls. No additional infrastructure required for a basic install.
3. **Modular: kernel + contributions.** A small stable core; every feature (editor,
   terminal, git, model providers, runtimes, deploy targets) is a plugin built on the
   *same* public contracts third parties use.
4. **Template-driven.** Projects start from git-backed templates that declare their
   devcontainer, recommended plugins, and default model/runtime.
5. **Skinnable / white-label.** Theming is a token pack, not a fork.

## Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | React 19 + Vite + Tailwind 4 | **[now]** Keep — strongest existing asset |
| Control plane | **Go** (single binary) | **[target]** Static binary, massive concurrent WS/SSE, idiomatic gRPC plugins, native to container orchestration |
| Workspace runtime | Docker container per workspace (devcontainer standard) | **[target]** Light single-host install; pluggable to Firecracker/K8s later |
| Plugins (backend) | gRPC process plugins (HashiCorp `go-plugin` model) | **[target]** Keeps the core tiny; providers are separate processes |
| Plugins (frontend) | Manifest + contribution registry; Module Federation for 3rd-party | **[target]** |
| Models | `ModelProvider` interface — Ollama default + BYO-key (Claude/OpenAI/Gemini) | **[target]** Free-first, premium opt-in |
| Database | PostgreSQL | **[now]** UUID PKs, jsonb |
| Cache / signaling | Redis | **[now]** Job signaling, future rate-limit/cache |

> The current backend (`apps/api` Express/TypeScript, `apps/worker`) is the **[now]**
> implementation. Phase 1 of the roadmap replaces it with the Go control plane. The
> Postgres schema, compose/nginx/Coolify deploy story, and React shell carry forward.

## Target system architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React/Vite) — kernel + UI plugin contributions      │
│   tabs · rail items · panels · commands · settings · themes   │
└───────────────┬───────────────────────────────────────────────┘
                │ REST + WebSocket (terminals, logs, file-watch, agent tokens)
┌───────────────▼───────────────────────────────────────────────┐
│ Control plane (Go) — the "small server" you install            │
│   auth · projects · files · gateway/reverse-proxy · agent loop │
│   plugin host (gRPC) · template service · theme service        │
└───┬───────────────────────────┬───────────────────────────────┘
    │ supervises (gRPC plugin)    │ SQL / signaling
┌───▼───────────────────────┐   ┌▼──────────────────────────┐
│ WorkspaceRuntime (plugin)   │   │ PostgreSQL  +  Redis        │
│   docker today              │   └─────────────────────────────┘
│   firecracker / k8s later   │
│                             │   per-workspace container:
│                             │     fs · PTY · dev server · build
└─────────────┬───────────────┘
              │ preview/logs/PTY proxied back through the gateway
              ▼  (single routed entrypoint — fits existing nginx/Coolify setup)
```

## Extensibility model (the core differentiator)

The kernel is small and stable; everything else is a **contribution**. First-party
features are built on the same APIs third parties use — that is what keeps the system
genuinely modular rather than modular-on-paper.

### 1. Frontend plugins (UI contributions)
Declared by manifest; loaded into a contribution registry. First-party plugins are
compiled in; third-party plugins load at runtime via Module Federation (or an
iframe-sandboxed panel when untrusted).

```ts
contributes: {
  tabs:      [{ id, title, icon, component }]   // center work area
  railItems: [{ id, icon, panel }]              // left rail
  panels:    [{ id, side: 'left' | 'right', component }]
  commands:  [{ id, title, handler }]           // command palette
  settings:  [{ id, schema }]                   // settings pages
  // statusItems, fileDecorations, ...
}
```

### 2. Backend plugins (capability providers)
Process-based gRPC plugins (not Go's fragile `plugin` package). Stable interfaces:

```go
type WorkspaceRuntime interface { /* docker | firecracker | k8s */ }
type ModelProvider    interface { /* ollama | claude | openai | gemini */ }
type DeployTarget     interface { /* coolify | fly | render | ssh */ }
type VCSProvider      interface { /* github | gitlab | gitea */ }
type AuthProvider     interface { /* password | oauth | oidc/SSO */ }
type StorageProvider  interface { /* local | s3 | ... */ }
```

### 3. Templates (project starters)
A template = `devcontainer.json` + scaffold files + `torsor.template.yaml`
(recommended plugins, default model, runtime). Backed by plain git repos so the
community publishes templates without touching core. Drives the "New project" flow.

### 4. Themes / skins
A theme is a **token pack** (JSON → CSS variables) plus optional logo/brand/fonts.
The live UI already uses CSS-variable design tokens (`bg-page`, `text-secondary`,
`border-default`, …), so skins are drop-in and white-labeling requires no component
changes. A theme can ship as a plugin contribution.

> **Contract stability is a first-class rule:** the contribution API is versioned from
> day one and treated as a public contract. A plugin ecosystem is only as valuable as
> its stability.

## Database schema **[now]**

Key tables (see `apps/api/migrations/*.sql`):
- `users` — application users (role: `user | admin | super_admin`)
- `projects` — user projects/workspaces
- `project_files` — code files within projects (versioned)
- `ai_tasks` — async task queue
- `secrets` — encrypted credentials (per user)
- `sessions` — session tracking *(currently write-only — see Roadmap Phase 0)*
- `audit_logs` — activity tracking

Schema carries forward to the Go control plane largely unchanged; the runtime adds
workspace/lifecycle tables in Phase 2.

## Workspace runtime model **[target]**

- **Isolation:** one Docker container per workspace, persistent volume per project,
  built from the project's devcontainer.
- **In-container agent:** a small workspace agent exposes file ops, a PTY, and process
  spawning to the control plane over a multiplexed connection.
- **Previews:** the control-plane gateway reverse-proxies the in-container dev server
  port out to the frontend `PreviewTab` (hot reload preserved).
- **Pluggable:** the entire runtime sits behind `WorkspaceRuntime`, so Firecracker
  microVMs (stronger isolation) or Kubernetes pods (horizontal scale) drop in later
  without touching the rest of the platform.

## AI / model layer **[target]**

- Provider-agnostic `ModelProvider` interface.
- **Default:** Ollama (local Llama/Qwen/DeepSeek-Coder) — zero cost, no key.
- **Opt-in:** BYO-key providers. When keys are present, default to strong hosted
  models (e.g. Claude `claude-sonnet-4-6` for most agent steps, `claude-opus-4-8` for
  hard reasoning, `claude-haiku-4-5` for cheap steps); OpenAI/Gemini equally pluggable.
- The agent loop runs in the Go control plane, reads/writes workspace files, and runs
  commands in the sandbox, streaming tokens to the chat panel. An optional Python agent
  sidecar can be added later behind the same HTTP interface — never a required dep.

## Deployment paths

1. **Single-host Docker Compose (primary):** the install target. One routed entrypoint
   (frontend/gateway); api/runtime/postgres/redis internal. Matches the existing
   nginx + Coolify setup. **[now, evolving]**
2. **Single binary + Docker:** control-plane binary on a host with Docker for runtimes.
3. **Kubernetes:** for scale, via a K8s `WorkspaceRuntime` plugin. **[target, later]**
4. **Managed PaaS** (Fly/Railway/Render) for the control plane + managed Postgres.

## Security checklist

- [ ] Strong `JWT_SECRET` in production (enforced: throws if weak — `apps/api/src/auth.ts`)
- [ ] Sessions actually validated/revocable (Phase 0 fix — table is currently write-only)
- [ ] CORS restricted to known origins in production (`CORS_ORIGIN`)
- [ ] Parameterized queries everywhere (currently true)
- [ ] Per-user ownership checks on all project/file routes (currently true)
- [ ] Secrets encrypted at rest + in transit
- [ ] **Workspace isolation**: untrusted code confined to its container; resource
      quotas (CPU/mem/disk/time); egress policy; no host socket exposure
- [ ] Plugin trust model: signed/reviewed plugins; sandbox third-party UI plugins
- [ ] Rate limiting (currently present), input validation, audit logs
- [ ] CSP / XSS headers (nginx sets several; tighten CSP)

## Observability **[target]**

- Structured logs (pino now; Go `slog`/zap in the control plane)
- Health (`/health`) and readiness (`/ready`) — **[now]**
- Metrics (Prometheus): active workspaces, runtime utilization, queue depth, model
  latency/cost
- Per-request correlation IDs across control plane ↔ runtime ↔ model calls

## Scaling

- **Control plane:** mostly stateless (sessions in Postgres/Redis); scale horizontally
  behind a load balancer, sticky only for WS where needed.
- **Workspace runtime:** scale-out is a runtime-plugin concern (more hosts, or K8s).
- **Database:** connection pooling (PgBouncer), read replicas later.
</content>
</invoke>
