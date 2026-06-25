# Torsor Roadmap

The path from the current Node/Express foundation to a flagship, open-source,
self-hostable, modular vibe-coding platform. See [`ARCHITECTURE.md`](./ARCHITECTURE.md)
for the target design.

**North star:** install one small server → an entire AI-assisted cloud IDE
(edit, run, preview, test, deploy) runs in the cloud you control — free out of the box,
modular via plugins, skinnable via themes, and bootstrapped from templates.

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

## Phase 1 — Go control plane + plugin kernel 🚧 (in progress)
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
- [ ] **Frontend contribution registry**: formalize tab/rail/panel/command/settings
      contributions; re-register existing first-party features through it
- [ ] **Theme-token contract**: codify CSS-variable token pack format; ship 2 themes
- [ ] Cut over: point the 2 real frontend stores (`authStore`, `projectStore`) +
      compose/nginx at the Go service and retire `apps/api`

> The Go service currently ships **in parallel** with `apps/api` (nothing depends on it
> yet), so the cutover is deliberate and reversible. See `apps/control-plane/README.md`.

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
- [~] **Docker implementation** of `WorkspaceRuntime` (`cmd/docker-runtime`, shells out to
      the `docker` CLI — container-per-workspace, exec streaming, file ops). Loads + handshakes
      as a valid plugin (verified); full lifecycle against a live Docker daemon still to be
      exercised on a Docker host.
- [x] Workspace/lifecycle tables added to schema (`workspaces`, one per project, owned by a
      user) + **project-scoped, ownership-checked** workspace API
      (`/api/v1/projects/{id}/workspace*`) — runtime workspace id is the project id, never a
      client value, so users can't act on others' workspaces.
- [ ] Per-project container from a `devcontainer.json`; persistent volume; resource quotas
- [ ] In-container workspace agent: file ops, PTY, process spawn over multiplexed conn
- [ ] Wire the real **file tree** + **xterm terminal** to the live container

**Done when:** a user opens a project, sees real files, and runs real commands in a
real terminal in their cloud workspace.

---

## Phase 3 — Live preview + dev servers
**Goal:** real, hot-reloading preview of the running app.

- [ ] Detect/run the project dev server inside the container
- [ ] Gateway reverse-proxies the container port to the `PreviewTab`
- [ ] Log streaming + port detection + multi-port support

**Done when:** editing a file updates the live preview with hot reload.

---

## Phase 4 — The agent loop (vibe coding)
**Goal:** describe → agent edits files in the live container → preview updates.

- [ ] `ModelProvider` plugins: **Ollama default** + BYO-key (Claude/OpenAI/Gemini)
- [ ] Per-user/project key management via the existing `secrets` table (encrypted)
- [ ] Agent loop in Go: read/write workspace files, run commands in sandbox, stream
      tokens to `ChatPanel`; tool-use + diffs + accept/reject
- [ ] Task history + cost/usage tracking surfaced in UI

**Done when:** a prompt produces working, applied changes in the live workspace, free
with a local model and better with a BYO key.

---

## Phase 5 — Deploy + test pipeline
**Goal:** full loop — build, test, ship — without leaving Torsor.

- [ ] Promote mock `testStore` → real: run tests in-sandbox, stream results
- [ ] Promote mock `deployStore` → real `DeployTarget` plugins (Coolify first, then
      Fly/Render/SSH); build image + hand off to existing deploy path
- [ ] `VCSProvider` plugins (GitHub/GitLab/Gitea): clone, commit, push, PRs

**Done when:** a project can be tested and deployed from the IDE via swappable targets.

---

## Phase 6 — Teams, collaboration, polish
**Goal:** multi-user, production-grade.

- [ ] Real-time collaboration (CRDT/Yjs): shared editing, cursors, presence
- [ ] Orgs + RBAC (finish `admin` role), team invites, per-workspace permissions
- [ ] Audit logs (table exists), quotas, usage limits, optional billing
- [ ] Observability: Prometheus metrics, correlation IDs, error tracking

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
