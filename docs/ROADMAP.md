# Torsor Roadmap

The path from the current Node/Express foundation to a flagship, open-source,
self-hostable, modular vibe-coding platform. See [`ARCHITECTURE.md`](./ARCHITECTURE.md)
for the target design.

**North star:** install one small server → an entire AI-assisted cloud IDE
(edit, run, preview, test, deploy) runs in the cloud you control — free out of the box,
modular via plugins, skinnable via themes, and bootstrapped from templates.

> **Reality-sync note (2026-07-30):** checkboxes below were audited against the code
> (see [COMPETITIVE-ANALYSIS.md](./COMPETITIVE-ANALYSIS.md) and
> [DESIGN-UX-PLAN.md](./DESIGN-UX-PLAN.md)). The repo had moved well past this file:
> PTY terminal, live preview, the agent loop, missions, model providers and the deploy
> path all shipped. Phase 8 (below) is the current frontier.

**Locked decisions:**
- Backend control plane: **Go** (single static binary)
- Workspace isolation: **Docker container per workspace** (devcontainer standard), pluggable
- Models: **local-first (Ollama) + BYO-key**
- Extensibility: **kernel + contributions** (gRPC backend plugins, manifest UI plugins,
  git-backed templates, token-pack themes) — designed in from Phase 1

---

## Phase 0 — Clean the foundation ✅ (done)
**Goal:** stop building on confusion. Low risk, done first.

- [x] Delete the orphaned `ArrayIDE` UI tree — 13 files: `ArrayIDE.tsx`, `IDEShell.tsx`,
      `AgentPanel.tsx`, `BottomPanel.tsx`, `EditorArea.tsx`, `PreviewPanel.tsx`,
      `AgentActivityPanel.tsx`, `FileExplorerSidebar.tsx`, `DeployModal.tsx`,
      `ModelConfigDialog.tsx`, root `TopBar.tsx`, root `CommandPalette.tsx`, `useAgentStore.ts`
- [x] Remove unused `@google/genai` dependency (and regenerate lockfile)
- [x] Fix **session/logout**: `requireAuth` now validates the `sessions` row (exists +
      not expired) → real revocation; added `POST /api/v1/auth/logout` + hourly expired-row
      cleanup; frontend `logout()` calls the endpoint
- [x] Fix **role mismatch**: frontend role type + `normalizeUser` + `AdminRoute` now honor
      backend `user | admin | super_admin` (admins no longer collapsed to `user`)
- [x] Resolve persistence naming: token is owned solely by localStorage
      (`torsor-auth-token`); Zustand store renamed `tesseract-auth` → `torsor-auth` and no
      longer persists a second copy of the token

> **Correction to an earlier analysis:** `useAppStore.ts` is **kept** — it is a core store
> for ~14 live files (CodeEditorTab, PreviewTab, FileTree, CodePanel, shared CommandPalette,
> …), not dead code. Likewise the tab components `GeneralTab`, `MembersTab`, `BillingTab`,
> `AgentSettingsTab`, `ApiKeysTab`, `SecurityTab`, `AuditLogTab`, `CLIReference`,
> `MemberManagement`, `WorkspaceSettings` are **live** — wired via `SettingsPage`
> (`/settings`) and `SettingsTab`, not orphaned. Both were verified by import-graph trace
> before deleting.

**Done:** dead `ArrayIDE` cluster removed, 4 auth/cleanliness fixes landed, `tsc --noEmit`
green for both frontend and API.

---

## Phase 1 — Go control plane + plugin kernel ✅ (done)
**Goal:** real backend as a single binary, with the contribution system in place first.

- [x] Scaffold Go control plane at `apps/control-plane`: config, structured logging
      (slog), pgx Postgres pool, Redis, embedded migrations runner, health/ready
- [x] Port existing routes 1:1 (auth signup/login/me/**logout**, projects CRUD, files,
      tasks) — reuses the existing schema; same JSON shapes; verified end-to-end against a
      live Postgres+Redis (signup/login/me, ownership isolation → 404, logout → 401
      revocation, file version bump, task enqueue + redis publish, super-admin promotion)
- [x] **WebSocket/SSE gateway**: streaming completions end-to-end (gRPC server-streaming
      from the out-of-process plugin → host → SSE + WebSocket). SSE uses the Bearer header
      (fetch-based frontend); WS authenticates via `access_token` query (browsers can't set
      WS headers). Verified: 6 token deltas + done over both transports; WS rejects missing
      token. Foundation for terminal/log/agent streaming.
- [x] **Plugin host**: gRPC plugin loader (hashicorp/go-plugin) proven end-to-end with a
      `ModelProvider` capability + an out-of-process reference plugin (`cmd/mock-model`).
      HTTP → host → gRPC → plugin verified (list providers, complete, 404 unknown, 401
      unauth). `WorkspaceRuntime`/`DeployTarget`/`VCSProvider` follow the same shape.
- [x] **Frontend contribution registry** (`src/kernel`): typed contribution contract for
      tabs/commands/panels/rail/settings; the 17 first-party tabs now register through it
      and `CenterWorkArea` renders from the registry (the hardcoded switch is gone).
- [x] **Theme-token contract** (`src/kernel/theme.ts`): themes are typed token packs +
      a registry + `applyTheme`. Built-in `dark`/`light` mirror `index.css` exactly (live
      theme is now registry-driven) and a `midnight` skin demonstrates runtime swap via
      `setThemeById`. Frontend `tsc` + `vite build` green.
- [x] Cut over: compose/nginx route to the Go service (ADR 0009); `apps/api` retained
      for rollback only

> Cutover is done and reversible (flip nginx/compose back). `apps/api` stays until the
> control plane is battle-tested. See `apps/control-plane/README.md`.

**Done when:** the app runs end-to-end on the Go binary; the editor/terminal/git UI are
registered as plugins; a second theme can be swapped at runtime.

---

## Phase 2 — Workspace runtime MVP (the flagship feature)
**Goal:** it stops being a mock — code runs in a real per-user cloud container.

- [x] `WorkspaceRuntime` gRPC capability contract + host loader + reference plugin
      (`cmd/mock-runtime`, in-memory). Lifecycle (create/start/stop/destroy/status),
      streaming `Exec`, and file ops (list/read/write) proven end-to-end over gRPC
      (`internal/plugin/runtime_host_test.go`). HTTP surface under `/api/v1/runtimes`.
      Loaded via `TORSOR_WORKSPACE_RUNTIME_PLUGINS`.
- [x] **Docker implementation** of `WorkspaceRuntime` (`cmd/docker-runtime`) —
      container-per-workspace with cgroup limits (mem/cpu/pids), image allowlist,
      `no-new-privileges`, optional gVisor (`TORSOR_WS_DOCKER_RUNTIME=runsc`),
      snapshot/restore/fork via `docker commit`, interactive PTY (`ExecInteractive`).
- [x] Workspace/lifecycle tables added to schema (`workspaces`, one per project, owned by a
      user) + **project-scoped, ownership-checked** workspace API
      (`/api/v1/projects/{id}/workspace*`) — runtime workspace id is the project id, never a
      client value, so users can't act on others' workspaces.
- [~] Per-project container: resource quotas ✅ (cgroups); `devcontainer.json` ❌;
      **persistent volumes ❌ (designed snapshot-aware, awaiting rollout —
      PRODUCTION-HARDENING §1; top data-durability priority)**
- [~] In-container workspace agent: file ops/exec/PTY ship today via `docker exec` +
      `ExecInteractive`; a dedicated in-container agent over a multiplexed conn remains
      [target]
- [x] Wire the real **file tree** + **xterm terminal** to the live container

**Done when:** a user opens a project, sees real files, and runs real commands in a
real terminal in their cloud workspace. ← **This is true today**; volumes are the gap.

---

## Phase 3 — Live preview + dev servers
**Goal:** real, hot-reloading preview of the running app.

- [x] Detect/run the project dev server inside the container (templates +
      zero-config `internal/appdetect`, `.torsor-run.sh`)
- [x] Gateway reverse-proxies the container port to the `PreviewTab` (path mode +
      wildcard host mode via `TORSOR_PREVIEW_DOMAIN`; console-error bridge to the agent)
- [~] Log streaming ✅ (exec/task SSE) · port detection ❌ (fixed `TORSOR_WS_APP_PORT`
      convention) · **multi-port ❌ — single port per workspace blocks
      frontend+backend+DB apps (Phase 8)**

**Done when:** editing a file updates the live preview with hot reload. ← True today.

---

## Phase 4 — The agent loop (vibe coding)
**Goal:** describe → agent edits files in the live container → preview updates.

- [x] `ModelProvider` plugins: **Ollama default** + BYO-key — 8 plugins shipped
      (ollama, anthropic, openai, gemini, deepseek, openrouter, mock, mock-agent) +
      role-based routing (`TORSOR_MODEL_ROUTING`)
- [x] Per-user/project key management via the existing `secrets` table (AES-GCM;
      `{PROVIDER}_API_KEY` unlocks hosted providers per user)
- [~] Agent loop in Go ✅ (ReAct + SSE, 9 tools incl. `verify_app` real-browser
      self-check, plan mode, missions engine, reflection→learning, transcript
      compaction) · diffs + accept/reject ❌ · **search/patch-edit tools ❌ (Phase 8)**
- [x] Task history + usage tracking surfaced in UI (tasks SSE reattach, UsageTab;
      cost-in-dollars ❌ — tokens only)

**Done when:** a prompt produces working, applied changes in the live workspace, free
with a local model and better with a BYO key. ← True today.

---

## Phase 5 — Deploy + test pipeline
**Goal:** full loop — build, test, ship — without leaving Torsor.

- [~] Testing: AppTestingTab runs real in-workspace commands via exec-stream ✅;
      structured runner/results-history ❌
- [~] Deploy: **Torsor Cloud path is real** (secret-scan gate → build plan →
      in-workspace prod serve at `/d/{id}` + custom domains) but it reuses the dev
      container — no versioned artifacts/rollback; `DeployTarget` plugins ❌
      (Coolify/SSH first — Phase 8)
- [ ] `VCSProvider` plugins (GitHub/GitLab/Gitea): clone, repo create, push, PRs —
      GitHub App **login** shipped; repo API integration ❌ (Phase 8)

**Done when:** a project can be tested and deployed from the IDE via swappable targets.

---

## Phase 6 — Teams, collaboration, polish
**Goal:** multi-user, production-grade.

- [~] Real-time collaboration: presence avatars ✅; **Yjs sidecar + authed WS proxy
      fully built server-side with NO frontend client** — shipping the y-monaco
      binding is Phase 8's cheapest flagship win
- [~] Orgs + RBAC: teams/members/invites API + UI ✅ — but `projects.team_id` is never
      read, so **teams grant zero resource access** (Phase 8); invite email delivery ❌
- [~] Audit logs ✅ read route but only 4 write sites; quotas/usage limits **not
      enforced** (metering only); billing ❌ by design (self-host)
- [~] Observability: `/metrics` exists (uptime/request counters, unauthenticated);
      workspace/queue/model metrics + correlation IDs ❌

---

## Phase 7 — Ecosystem (what makes it flagship)
**Goal:** people extend Torsor without forking it.

- [ ] Publish the **Plugin SDK** (frontend manifest API + backend gRPC contracts) with
      versioning guarantees and docs
- [ ] **Template registry** (git-backed) + "New from template" gallery
- [ ] **Theme gallery** / white-label guide
- [ ] Example plugins: a runtime backend (Firecracker or K8s), a model provider, a
      deploy target, a UI panel — as reference implementations

---

## Phase 8 — Replit-class gaps, the open way (2026-07 refresh)

Sourced from [COMPETITIVE-ANALYSIS.md](./COMPETITIVE-ANALYSIS.md) (Replit mid-2026 map)
and two full code audits. Four tracks, ordered; the design counterpart lives in
[DESIGN-UX-PLAN.md](./DESIGN-UX-PLAN.md). Positioning: **"the Replit you can own"** —
open standards where Replit is proprietary, self-host-first where Replit is SaaS-only.

### Track A — Make it true (credibility & self-host readiness)
- [x] Honor `projects.team_id`: every project-scoped route now authorizes via
      `projectAccessSQL` (owner **or** active non-viewer team member) — one predicate
      behind `canAccessProject`/`loadWorkspace`, plus migration `0024` (owner
      membership rows, team backfill, team-scoped name uniqueness), `teamId` on
      create/move, and a role allowlist. **Viewers currently get no project access**
      (no read-only layer yet) and delete/move stay owner-only
- [ ] Read-only enforcement so `viewer` means "can see, can't change" (today viewers
      are excluded from project access entirely)
- [ ] SMTP invite delivery (invite rows must be shared out-of-band today)
- [x] Ship co-editing: frontend Yjs client (y-monaco) on the already-built
      `/collab/ws` proxy + sidecar — free multiplayer where Replit charges.
      Shipped: `src/lib/collab.ts` + `useCollabEditor` + a Live/peer-count status in
      the editor; activates only when `TORSOR_COLLAB_URL` is set (`/api/v1/config`).
- [ ] Persistent volumes (snapshot-aware design exists) + idle-stop/TTL +
      per-user workspace caps + disk quotas
- [ ] Quota enforcement from `usage_events` (admin-set plans become meaningful) —
      prerequisite for open signups
- [x] Audit coverage: login, secret create/delete, deploy stop, domain add, role change
      and maintenance-mode toggles now write audit rows (was 4 project/team sites; exec
      auditing still open)
- [x] Custom-domain ownership verification (DNS TXT): attaching a hostname is now only a
      claim — each row carries a random challenge that must appear at
      `_torsor-challenge.<domain>` before `verified_at` is set, and the host-routing proxy
      serves **verified rows only** (migration `0025`, `POST …/domains/{id}/verify`, DNS
      instructions + Verify button in PublishingTab)
- [x] SecurityScanTab → real scanners in-workspace: `POST /workspace/scan` runs the
      deploy-gating secret detectors plus npm audit / osv-scanner / govulncheck when the
      image has them, and reports unavailable scanners honestly (preview banner removed)
- [ ] Abuse report endpoint + admin takedown queue; Playwright E2E happy path

### Track B — Platform services, the open way (built apps become real products)
- [x] **Agent tool upgrade**: `search_files` (bounded grep), `edit_file` (exactly-once
      find/replace — no more full-file rewrites), `delete_file`, `move_file`; prompt
      guidance, compaction digests and mutation accounting updated, unit-tested
- [ ] Multi-port workspaces (docker-runtime + preview proxy) — unblocks
      frontend+backend+DB apps
- [ ] **Torsor DB**: per-project Postgres on the platform's own PG (dev/prod separation
      at deploy) + DatabaseTab upgrade — *your* Postgres, no vendor
- [ ] **Torsor Auth**: the `auth` preview tab becomes a real standards-based (JWT/OIDC)
      drop-in auth service for user-built apps
- [ ] Real deployments: versioned release images on the `docker commit` substrate,
      separate deploy container, logs, rollback; then `DeployTarget` plugin proto —
      **Coolify + SSH before Fly/Vercel**
- [ ] `StorageProvider` plugin (local + S3/MinIO) for app object storage
- [ ] Cron substrate: scheduled deploys + scheduled agent automations
- [ ] Templates: expand the hardcoded 3 → Python/Go/Next/full-stack;
      `torsor.template.yaml` + git-backed community templates
- [ ] **Connectors = open MCP catalog** on `internal/mcpx` (Replit added MCP;
      we make it the whole connector story)

### Track C — Agent leverage (the Agent-4 wave, our way)
- [ ] Parallel missions in isolated copies (snapshot/fork substrate exists) +
      git-assisted merge
- [x] Honor the latent autonomy prefs in actual runs — the agent SSE path applies
      `preferred_model`, `max_steps`, and `planning_enabled` + `default_autonomy`
      (approve-plan vs autonomous); the model picker consults
      `agent_engine_config.default_model` before the env default
- [ ] Visual element-select → targeted agent edit (sourceLocator + visual-edit overlay
      already exist)
- [ ] Mission board UI (Kanban over existing mission/task statuses)
- [ ] Checkpoint time-travel UI (timeline + diff + restore)
- [ ] Model variant picker (catalog beyond Ollama; per-request choice)
- [ ] Opt-in `web_fetch`/search tool (self-hostable backend, e.g. SearXNG)

### Track D — Reach & ecosystem (open-source flavored)
- [ ] GitHub import: `/new?repo=<url>` clone-on-create (top onboarding path), then
      VCSProvider plugin (repo create, push, PRs) on the existing GitHub App
- [ ] Publish the Plugin SDK: gRPC + contribution contracts as versioned public API
      (Replit deprecated extensions — extensibility is our moat)
- [ ] Theme gallery (3–5 first-party token packs) + white-label guide;
      template registry UI
- [ ] OpenAPI spec for the control plane

**Deliberately not copying:** domain reselling, native mobile apps, slides/video
artifacts, effort-based billing, proprietary connector marketplace — rationale in
COMPETITIVE-ANALYSIS §4.

---

## Cross-cutting (every phase)
- [x] **CI** (`.github/workflows/ci.yml`): GitHub Actions runs frontend + apps/api +
      apps/worker typechecks, the production build, and `go build`/`go vet`/`go test` for
      the control plane on every push/PR. Seeded with unit tests for config, auth (JWT +
      password), and role/slug helpers.
- [ ] More tests: control-plane route/integration tests + E2E for the IDE happy path
- [ ] Treat the contribution API as a versioned public contract — never break silently
- [ ] Keep the install a single small server; new capabilities ship as optional plugins
- [ ] Keep it free out of the box (local models, no required paid service)

## Priority rationale
1. **Phase 0** unblocks everything (clean ground, bugs fixed).
2. **Phases 1–2** are the real moat: Go kernel + working cloud workspace runtime.
3. **Phases 3–4** turn it into an actual vibe-coding IDE (preview + agent).
4. **Phases 5–7** make it a platform: deploy/test, teams, and an extension ecosystem.
</content>
