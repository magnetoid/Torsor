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

## Phase 1 — Go control plane + plugin kernel
**Goal:** real backend as a single binary, with the contribution system in place first.

- [ ] Scaffold Go control plane (replaces `apps/api`): config, structured logging,
      Postgres pool, Redis, migrations runner, health/ready
- [ ] Port existing routes 1:1 (auth signup/login/me, projects CRUD, files, tasks) —
      reuse the existing schema
- [ ] WebSocket/SSE gateway for streaming (foundation for terminals/logs/agent)
- [ ] **Plugin host**: gRPC plugin loader (`go-plugin` model) + first capability
      interfaces (`AuthProvider`, `ModelProvider` stubs) to prove the contract
- [ ] **Frontend contribution registry**: formalize tab/rail/panel/command/settings
      contributions; re-register existing first-party features through it
- [ ] **Theme-token contract**: codify CSS-variable token pack format; ship 2 themes
- [ ] Point the 2 real frontend stores (`authStore`, `projectStore`) at the Go API

**Done when:** the app runs end-to-end on the Go binary; the editor/terminal/git UI are
registered as plugins; a second theme can be swapped at runtime.

---

## Phase 2 — Workspace runtime MVP (the flagship feature)
**Goal:** it stops being a mock — code runs in a real per-user cloud container.

- [ ] `WorkspaceRuntime` gRPC interface + **Docker implementation** (first backend plugin)
- [ ] Per-project container from a `devcontainer.json`; persistent volume; lifecycle
      (create/start/stop/destroy) + resource quotas
- [ ] In-container workspace agent: file ops, PTY, process spawn over multiplexed conn
- [ ] Wire the real **file tree** + **xterm terminal** to the live container
- [ ] Workspace/lifecycle tables added to schema

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
- [ ] Tests for new control-plane routes + runtime; E2E for the IDE happy path
- [ ] Treat the contribution API as a versioned public contract — never break silently
- [ ] Keep the install a single small server; new capabilities ship as optional plugins
- [ ] Keep it free out of the box (local models, no required paid service)

## Priority rationale
1. **Phase 0** unblocks everything (clean ground, bugs fixed).
2. **Phases 1–2** are the real moat: Go kernel + working cloud workspace runtime.
3. **Phases 3–4** turn it into an actual vibe-coding IDE (preview + agent).
4. **Phases 5–7** make it a platform: deploy/test, teams, and an extension ecosystem.
</content>
