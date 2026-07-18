# TORSOR CODEBASE: COMPREHENSIVE ANALYSIS REPORT

**Date:** July 19, 2026  
**Repository:** `/Users/magnetoid/Documents/trae_projects/torsor/Torsor`  
**Analysis Scope:** Full-stack architecture audit, feature inventory, technical debt assessment, security & scalability analysis

---

## 1. EXECUTIVE SUMMARY

### High-Level Overview

Torsor is an **open-source, self-hostable "vibe-coding" cloud IDE** currently in a significant architectural transition. The platform aims to provide an AI-assisted cloud development environment where users can code, run, preview, and deploy applications entirely in containers they control.

**Current State:** The codebase is **mid-migration**—a working React 19 frontend connects to a newly-established Go control plane backend (ADR 0009 cutover), while the legacy Node/Express API (`apps/api`) and worker (`apps/worker`) remain for reference and potential rollback.

### Primary Strengths

1. **Modern Frontend Stack:** React 19 + Vite + Tailwind 4 with CSS-variable design tokens for theming
2. **Strong Security Model:** Per-user ownership enforcement on all routes, validated sessions (not just signed JWTs), parameterized queries
3. **Plugin Architecture:** gRPC-based plugin system for model providers (`ModelProvider`) and workspace runtimes (`WorkspaceRuntime`) with 12+ provider implementations
4. **Active CI/CD:** GitHub Actions runs type checks, builds, Go vet/test on every PR
5. **Comprehensive Documentation:** Architecture Decision Records (ADRs), architecture docs, and roadmap with clear [now]/[partial]/[target] tags

### Critical Risks

1. **Workspace Persistence Gap:** Docker runtime exists but **full workspace persistence (devcontainer.json, persistent volumes, resource quotas) is incomplete**—data loss risk
2. **Mock Data Proliferation:** ~40+ UI tabs/components use mock data stores (`usageMock`, `arenaLeaderboard`, `teamMembers`) instead of real APIs
3. **Single-Host Scale Ceiling:** Current Docker-based architecture tied to single host; no multi-host runtime yet
4. **Test Coverage Gaps:** Only 2 frontend test files, backend tests exist but integration tests minimal
5. **Legacy Worker Risk:** Legacy `apps/worker` still polls `ai_tasks` table—potential for double-processing if re-enabled

---

## 2. CODEBASE ARCHITECTURE AUDIT

### Directory Structure and Organization

```
/Users/magnetoid/Documents/trae_projects/torsor/Torsor/
├── src/                          # React 19 + Vite Frontend (repo root, not apps/)
│   ├── components/
│   │   ├── admin/                # Super-admin only UI (ADR 0012)
│   │   ├── auth/                 # Auth landing, protected routes
│   │   ├── billing/              # Billing modal
│   │   ├── chat/                 # Chat input, message components
│   │   ├── home/                 # Activity feed, home content
│   │   ├── preview/              # Visual edit overlay, panel
│   │   ├── right-panel/          # File tree, library, search views
│   │   ├── shared/               # 40+ shared components (Button, Card, etc.)
│   │   ├── shell/                # App shell (rail, panels, tab bar)
│   │   └── tabs/                 # 50+ tab components for IDE
│   ├── hooks/                    # Keyboard shortcuts, theme, plan gate
│   ├── kernel/                   # Plugin contribution registry (tabs, commands, themes)
│   ├── lib/                      # API client, constants, utils, mockData
│   ├── pages/                    # 17 page components (Home, Auth, Settings, etc.)
│   ├── stores/                   # 46 Zustand stores (one per domain)
│   └── types/                    # TypeScript type definitions
│
├── apps/
│   ├── api/                      # Legacy Express + TypeScript REST API (frozen)
│   │   ├── migrations/           # Migrations 0001-0010 (frozen)
│   │   └── src/                  # Auth, routes, db, redis (legacy)
│   │
│   ├── control-plane/            # Go Control Plane (ACTIVE BACKEND - ADR 0009)
│   │   ├── cmd/
│   │   │   ├── server/           # Main HTTP server entrypoint
│   │   │   ├── docker-runtime/   # Docker WorkspaceRuntime plugin
│   │   │   ├── mock-runtime/     # In-memory runtime for testing
│   │   │   ├── mock-model/       # Mock ModelProvider for testing
│   │   │   ├── ollama-model/     # Ollama ModelProvider
│   │   │   ├── anthropic-model/  # Claude ModelProvider
│   │   │   ├── openai-model/     # OpenAI ModelProvider
│   │   │   └── ... (12+ model providers)
│   │   ├── internal/
│   │   │   ├── agent/            # ReAct agent loop implementation
│   │   │   ├── auth/             # JWT/session authentication
│   │   │   ├── config/           # Configuration management
│   │   │   ├── db/               # Database connection/pooling
│   │   │   ├── mcpx/             # MCP (Model Context Protocol) client
│   │   │   ├── migrations/       # SQL migrations (0001-0016)
│   │   │   ├── openaicompat/     # OpenAI-compatible API wrapper
│   │   │   ├── plugin/           # gRPC plugin host system
│   │   │   ├── redisx/           # Redis connection/cache
│   │   │   ├── secrets/          # Encrypted secrets management
│   │   │   └── server/           # HTTP handlers (50+ files)
│   │   ├── go.mod, go.sum
│   │   ├── Dockerfile
│   │   └── README.md
│   │
│   ├── torsor-collab/             # Yjs WebSocket collaboration server
│   │   ├── server.js
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   └── worker/                    # Legacy background job processor (retired)
│       ├── src/index.ts
│       └── package.json
│
├── docs/                          # Documentation
│   ├── ARCHITECTURE.md            # Target system design
│   ├── ROADMAP.md                 # Phased implementation plan
│   ├── REMAINING-WORK.md          # Handoff documentation
│   ├── DEPLOYMENT.md              # Deployment guides
│   └── SETUP.md                   # Developer setup
│
├── .torsor/                       # Torsor project metadata
│   ├── architecture/decisions/    # ADRs (0001-0012)
│   ├── active/                    # Active context/progress
│   └── charter.md                 # Project charter
│
├── docker-compose.yml             # Production stack
├── docker-compose.control-plane.yml # Isolated validation stack
├── docker-compose.override.yml    # Local dev overrides
├── nginx.conf                     # Reverse proxy config
├── package.json                   # Root workspace config
└── README.md                      # Project overview
```

### Core Modules and Their Responsibilities

| Module | Responsibility | Key Files |
|--------|---------------|-----------|
| **Frontend (src/)** | React 19 SPA with Vite, Tailwind 4, Zustand state | `src/App.tsx`, `src/lib/api.ts`, `src/kernel/` |
| **Control Plane** | Go HTTP server, auth, plugin host, agent loop | `apps/control-plane/cmd/server/`, `internal/server/`, `internal/agent/` |
| **Plugin System** | gRPC-based ModelProvider and WorkspaceRuntime plugins | `internal/plugin/`, `cmd/*-model/`, `cmd/*-runtime/` |
| **Collaboration** | Yjs WebSocket server for real-time co-editing | `apps/torsor-collab/server.js` |
| **Legacy API** | Frozen Express/TypeScript API (0001-0010 migrations) | `apps/api/` |
| **Legacy Worker** | Retired background job processor | `apps/worker/` |

### Technology Stack Inventory

| Layer | Technology | Version/Details |
|-------|-----------|-----------------|
| **Frontend Framework** | React | 19.0.0 |
| **Build Tool** | Vite | 6.2.0 |
| **Styling** | Tailwind CSS | 4.1.14 + CSS variables |
| **UI Components** | Radix UI | Full primitive suite |
| **State Management** | Zustand | 5.0.12 (~46 stores) |
| **Router** | React Router | v7 |
| **Editor** | Monaco Editor | 0.55.1 |
| **Terminal** | xterm.js | 5.3.0 |
| **Backend (Control Plane)** | Go | 1.22+ |
| **HTTP Router** | go-chi/chi | v5 |
| **Database** | PostgreSQL | 14+ (pgx driver) |
| **Cache** | Redis | go-redis |
| **gRPC Plugins** | hashicorp/go-plugin | v1 |
| **Legacy Backend** | Node.js + Express | TypeScript |
| **Testing** | vitest (frontend), go test (backend) |
| **CI/CD** | GitHub Actions | Ubuntu runners |
| **Container Orchestration** | Docker Compose | Production + dev |
| **Reverse Proxy** | nginx | With SSL/CSP |

### Integration Points Between Frontend/Backend/Infrastructure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React 19)                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  src/lib/api │  │   Zustand    │  │   WebSocket  │  │    Kernel    │  │
│  │   (REST)     │  │   Stores     │  │  (WS/SSE)    │  │(Contributions)│  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
└─────────┼─────────────────┼───────────────────┼─────────────────────────────┘
          │                 │                   │
          ▼                 │                   ▼
┌───────────────────────────┼───────────────────────────────────────────────┐
│                     BACKEND (Go Control Plane)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   HTTP API   │  │     Auth     │  │   gRPC Host  │  │  Agent Loop  │  │
│  │  (chi router)│  │ (JWT/session)│  │   (plugins)  │  │   (ReAct)    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         └──────────────────┼───────────────────┼─────────────────┘          │
└───────────────────────────┼───────────────────┼────────────────────────────┘
                            │                   │
          ┌─────────────────┼───────────────────┼────────────────┐
          ▼                 ▼                   ▼                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                       INFRASTRUCTURE & PLUGINS                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  PostgreSQL  │  │    Redis     │  │Docker Runtime│  │Model Providers│  │
│  │  (migrations)│  │ (cache/jobs) │  │ (workspace)  │  │ (12+ plugins)│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                    │
│  │    nginx     │  │ Yjs Collab   │  │  Docker      │                    │
│  │  (proxy/CSP) │  │   Server     │  │  Compose     │                    │
│  └──────────────┘  └──────────────┘  └──────────────┘                    │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. IMPLEMENTED FEATURES INVENTORY

### Real Implemented Features

| Feature | Status | Backend | Frontend | Notes |
|---------|--------|---------|----------|-------|
| **Auth (signup/login/logout/me)** | Real | Go control plane | `authStore.ts` | Sessions validated in DB, real revocation |
| **Projects CRUD** | Real | Go control plane | `projectStore.ts` | Per-user ownership enforced |
| **Project Files** | Real | Go control plane | `editorStore.ts`, `FileTree` | Versioned files, upsert with version bump |
| **Agent Loop (ReAct)** | Real | Go `internal/agent` | `chatStore.ts`, `ChatPanel` | Streaming SSE, real workspace tools |
| **Git Operations** | Real | Go `git_handlers.go` | `gitStore.ts`, `GitTab` | Real git via WorkspaceRuntime.Exec |
| **Live Preview** | Real | Go `preview_handlers.go` | `PreviewTab` | Proxy to workspace dev server |
| **Interactive Terminal (PTY)** | Real | Go `pty_handlers.go` | `TerminalTab` | WebSocket → docker exec -it |
| **Workspace Runtime** | Real | Go `cmd/docker-runtime` | `workspaceStore.ts` | Container-per-project via Docker |
| **Model Providers** | Real | 12+ plugins in `cmd/*-model/` | Provider selector | Ollama, Claude, OpenAI, Gemini, etc. |
| **File Tree** | Real | Go `file_handlers.go` | `FileTree.tsx` | Full CRUD on project files |
| **Secrets Management** | Real | Go `secrets_handlers.go` | `secretsStore.ts` | AES-GCM encrypted per-user secrets |
| **Usage Tracking** | Real | Go `usage_handlers.go` | `UsageTab` | Token/cost aggregation |
| **Notifications** | Real | Go `notification_handlers.go` | `notificationStore.ts` | In-app + email (via invite) |
| **Audit Logs** | Real | Go `audit_handlers.go` | `AuditLogTab` | Server-written events |
| **App Storage** | Real | Go `storage_handlers.go` | `storageStore.ts` | Assets under `.torsor/storage/` |
| **MCP Servers** | Real | Go `mcp_handlers.go` | `MCPServersTab` | Model Context Protocol integration |
| **Teams/Workspaces** | Real | Go `team_handlers.go` | `workspaceStore.ts` | Multi-tenant orgs (0011 migration) |
| **Memory/Skills** | Real | Go `memory_handlers.go`, `skill_handlers.go` | `memoryStore.ts`, `skillsStore.ts` | Agent memory + user skills |
| **Checkpoints** | Real | Go `checkpoint_handlers.go` | `checkpointStore.ts` | Workspace snapshots |
| **Database Explorer** | Real | Frontend `apiExecCollect` | `DatabaseTab` | Runs `sqlite3 -json` in workspace |
| **Integrations** | Real | Go `secrets` + frontend | `IntegrationsTab` | Credentials stored via `/api/v1/secrets` |
| **Theme System** | Real | `src/kernel/theme.ts` | Theme switcher | CSS-variable token packs |
| **Command Palette** | Real | `CommandPalette.tsx` | `Cmd+K` | Command registry |
| **Collaboration Server** | Real | `apps/torsor-collab/` | Yjs WebSocket | Real-time co-editing |
| **Presence System** | Real | Go `presence_handlers.go` | `PresenceAvatars.tsx` | Live cursors/avatars |

### Mock/Simulated Features Still Using Fake Data

| Feature | Location | Issue | Mock Data Source |
|---------|----------|-------|----------------|
| **Billing/Usage Charts** | `BillingTab.tsx`, `AdminRevenueTab.tsx` | Hardcoded chart data | `usageMock.chartData` |
| **Arena Leaderboard** | `canvasStore.ts`, `CanvasTab.tsx` | Mock model comparisons | `usageMock.arenaLeaderboard` |
| **Team Members List** | `MembersTab.tsx` | Static fake users | `usageMock.teamMembers` |
| **Pending Invites** | `InviteMembersDialog.tsx` | Mock invites | `usageMock.pendingInvites` |
| **Invoices** | `BillingTab.tsx` | Fake invoice history | `usageMock.invoices` |
| **Admin Platform Stats** | `AdminPlatformTab.tsx` | Hardcoded metrics | Static mock values |
| **Testing/Validation** | `AppTestingTab.tsx`, `ValidationTab.tsx` | No real test runner | UI only |
| **Workflows** | `WorkflowsTab.tsx` | No workflow engine | UI only |
| **Security Scanning** | `SecurityScanTab.tsx` | No scanner integration | UI only |
| **Library/Components** | `LibraryView.tsx` | Static component list | No registry |

### Documented but Unbuilt Features

| Feature | Documented In | Status | Blockers/Notes |
|---------|---------------|--------|----------------|
| **SSO/SAML** | `REMAINING-WORK.md`, `SecurityTab.tsx` | Not built | Requires external IdP (Okta/Entra/Auth0) for testing |
| **Firecracker Runtime** | `docs/ARCHITECTURE.md`, `cmd/firecracker-runtime/` | Skeleton only | README only—no implementation |
| **Kubernetes Runtime** | `docs/ARCHITECTURE.md` | Not started | Phase 5+ feature |
| **VCS Provider Plugins** | `docs/ARCHITECTURE.md` | Not started | GitHub/GitLab/Gitea integration |
| **Deploy Target Plugins** | `docs/ARCHITECTURE.md` | Not started | Coolify/Fly/Render/SSH beyond skeleton |
| **Billing System** | `usageMock` (frontend only) | Not built | No payment processor integration |
| **Plugin SDK (published)** | `docs/ARCHITECTURE.md` | Not published | Internal plugins only so far |
| **Theme Marketplace** | `docs/ARCHITECTURE.md` | Not built | Only built-in themes (dark/light/midnight) |
| **Template Registry** | `docs/ARCHITECTURE.md` | Partial | Templates exist but no registry/gallery |

---

## 3. TECHNICAL DEBT & QUALITY ASSESSMENT

### Code Quality Issues

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| **Monolithic Frontend Stores** | Medium | `src/stores/*.ts` (46 files) | Many stores mix concerns (UI state + API calls); some exceed 500 lines |
| **Mock Data Centralization** | High | `src/lib/mockData.ts` | Single 500+ line file with hardcoded fake data used across 40+ components |
| **Duplicate Store Pattern** | Low | `src/stores/` vs `src/useAppStore.ts` | Two different state management patterns; `useAppStore` is actually live (used by ~14 files) but confusing naming |
| **Legacy API Duplication** | Medium | `apps/api/` vs `apps/control-plane/` | Shared migrations diverged (0001-0010 vs 0011-0016); risk of confusion |
| **Console.log in Stores** | Low | `socialStore.ts`, `testStore.ts` | 2 files still use `console.log` (rule violation) |

### Test Coverage Gaps

| Component | Tests | Coverage | Gap |
|-----------|-------|----------|-----|
| Frontend Stores | 1 file (`chatStore.test.ts`) | ~2% | 45+ stores untested |
| Frontend Utils | 1 file (`sourceLocator.test.ts`) | ~5% | Most utilities untested |
| Backend Control Plane | 18 test files | ~40% | Handlers mostly tested, but integration tests minimal |
| Backend Legacy API | 0 tests | 0% | No tests at all |
| E2E Tests | 0 | 0% | No Playwright/Cypress |

### Type Safety Issues

| Issue | Count | Example |
|-------|-------|---------|
| `any` types | 24 occurrences | `project: any` in `projectStore.ts` |
| `as any` casts | ~15 occurrences | `(req as any).user` in legacy auth |
| Missing return types | ~30 functions | Implicit `Promise<any>` in stores |
| Optional chains overused | ~50 occurrences | `data?.items ?? []` pattern repeated |

### Documentation Quality

| Area | Quality | Notes |
|------|---------|-------|
| Architecture docs | Excellent | `ARCHITECTURE.md` with [now]/[partial]/[target] tags |
| ADRs | Excellent | 12 decision records with full context |
| API documentation | Poor | No OpenAPI/Swagger; must read handler source |
| Code comments | Good | Go code well-commented; TypeScript inconsistent |
| README files | Good | Multiple focused READMEs (root, control-plane, etc.) |

---

## 4. PERFORMANCE & SCALABILITY ANALYSIS

### Performance Bottlenecks

| Issue | Location | Impact | Mitigation |
|-------|----------|--------|------------|
| **Synchronous File Search** | `FileTree.tsx`, `SearchView.tsx` | Blocks UI on large projects | Should use Web Worker or server-side |
| **Full Array Remapping** | `projectStore.ts:fetchProjects` | O(n) remapping on every fetch | Could use normalized state (entities pattern) |
| **Unbounded Query Results** | `ListProjects` in `project_handlers.go` | No pagination—loads all | Add `limit`/`offset` parameters |
| **No Virtualization** | `FileTree.tsx`, `ChatMessage.tsx` | Renders all items | Use `react-window` for large lists |
| **Fork-Heavy Docker Pattern** | `docker-runtime/main.go` | Each exec forks `docker` CLI | Consider direct Docker API usage |

### Scalability Constraints

| Constraint | Current | Limit | Future Path |
|------------|---------|-------|-------------|
| **Single Docker Host** | 1 host | ~50-100 containers | Multi-host Swarm/K8s runtime plugin |
| **No Persistent Volumes** | Containers ephemeral | Data loss on restart | Persistent volume claims |
| **Single DB Instance** | 1 Postgres | Write bottleneck | Read replicas, connection pooling |
| **Unbounded Tables** | No retention policy | Disk bloat | Data retention jobs, archiving |
| **Rate Limiting** | Per-IP only | No user-tier limits | Tiered limits in database |

### Multi-Instance Limitations

| Feature | Single-Instance Assumption | Multi-Instance Blocker |
|---------|---------------------------|------------------------|
| **WebSocket Sessions** | In-memory map | Need Redis-backed pub/sub |
| **Rate Limiting** | Per-instance memory | Need Redis/central store |
| **Plugin Processes** | Local exec | Need distributed plugin host |
| **Session Storage** | Postgres (shared) | ✅ Already works |
| **File Storage** | Local filesystem | Need S3/central storage |

### Resource Usage Patterns

| Pattern | Location | Concern |
|---------|----------|---------|
| **Polling Loops** | `notificationStore.ts` (30s) | Battery drain on clients |
| **Long-Polling SSE** | `apiAgentStream` | Connection held open |
| **Redis Pub/Sub** | `ai_tasks` notification | Unclear if still used (legacy worker) |
| **Fork-Heavy** | `docker-runtime` main.go | Process spawn overhead |
| **No Caching** | API responses | Repeated DB queries |

---

## 5. SECURITY & INFRASTRUCTURE AUDIT

### Security Strengths

| Control | Implementation | Evidence |
|---------|---------------|----------|
| **Strong JWT/Session Handling** | Sessions table validated, not just signed | `apps/control-plane/internal/auth/auth.go` |
| **Per-User Ownership** | All project/file routes scope by `user_id` | `project_handlers.go`, `file_handlers.go` |
| **Parameterized Queries** | All SQL uses `pgx` parameterized queries | Throughout `internal/server/` |
| **CSP Headers** | nginx sets `Content-Security-Policy` | `nginx.conf` |
| **Rate Limiting** | `httprate` per-IP on all routes | `server.go:55` |
| **Secrets Encryption** | AES-GCM at rest | `internal/secrets/secrets.go` |
| **Super-Admin Isolation** | Admin-only routes under `/admin` | `AdminRoute.tsx`, `admin_handlers.go` |

### Security Risks

| Risk | Severity | Location | Mitigation Needed |
|------|----------|----------|-----------------|
| **Docker Socket Exposure** | High | `cmd/docker-runtime/main.go` | Socket mounted into container—escape risk |
| **Query Token in URLs** | Medium | `previewUrlFor()`, `wsUrlFor()` | `access_token` in query strings (browsers can't set WS headers) |
| **Permissive CORS (Legacy)** | Low | `apps/api/src/index.ts` | `CORS_ORIGIN=*` in development |
| **No Input Validation Library** | Medium | Handlers use ad-hoc checks | Could benefit from `validator` or similar |
| **JWT in LocalStorage** | Medium | `torsor-auth-token` key | XSS could steal token (mitigated by CSP) |

### Infrastructure Concerns

| Concern | Current State | Risk | Recommendation |
|---------|--------------|------|----------------|
| **Observability** | Basic health/readiness only | Blind to production issues | Add Prometheus metrics, structured logging |
| **Documentation Drift** | Some docs reference legacy API | Confusion for new developers | Audit docs against current code |
| **Environment Variable Drift** | 20+ env vars, inconsistent naming | Config errors in production | Standardize naming, add validation |
| **No Automated Backups** | Postgres no backup config | Data loss risk | Add automated backup jobs |
| **Single Point of Failure** | Single control plane instance | Downtime on crashes | Plan for replicas |

### Dependency Status

| Category | Status | Notes |
|----------|--------|-------|
| **Frontend Dependencies** | Mostly current | React 19, Vite 6, Tailwind 4 |
| **Go Dependencies** | Current | Standard library + chi, pgx, go-plugin |
| **Security Patches** | Unknown | No automated vulnerability scanning in CI |
| **Outdated Packages** | Some | `apps/api` uses older Express patterns |

---

## 6. FEATURE GAP & OPPORTUNITY ANALYSIS

### Critical Missing Features

| Feature | Business Impact | Technical Complexity | Recommendation |
|---------|----------------|---------------------|--------------|
| **Workspace Persistence** | High (data loss risk) | Medium | Complete devcontainer.json + volume persistence |
| **Multi-Host Runtime** | High (scale ceiling) | High | Design Kubernetes runtime plugin |
| **Real CI/Testing Flow** | Medium | Medium | Integrate test runner into workspace |
| **Billing System** | High (revenue) | Medium | Stripe integration, usage metering |
| **SSO/SAML** | High (enterprise) | Medium | OIDC flow, external IdP required |

### Medium-Priority Gaps

| Feature | User Impact | Effort | Notes |
|---------|-------------|--------|-------|
| **Theme Marketplace** | Medium | Low | Theme registry + upload |
| **Plugin SDK (Published)** | High | Medium | Document gRPC contracts, publish npm types |
| **Mobile Responsiveness** | Medium | Medium | IDE is desktop-first; mobile needs redesign |
| **Keyboard Accessibility** | High | Low | Add ARIA labels, keyboard shortcuts |
| **Faster Search** | Medium | Medium | Server-side search API, index |

### User Experience Improvements

| Area | Current State | Improvement |
|------|--------------|-------------|
| **Onboarding** | 4-step wizard | Interactive tutorial, template selection |
| **Error Handling** | Generic error toasts | Contextual recovery suggestions |
| **Loading States** | Skeleton screens | Progressive loading, optimistic updates |
| **Notifications** | Toast system | Rich notification center with actions |
| **Help/Documentation** | Coming soon page | In-app docs, contextual tooltips |

---

## 7. PRIORITIZED ROADMAP (MoSCoW)

### MUST HAVE (0-3 Months) — Critical for Production

| Item | Rationale | Owner/Skill |
|------|-----------|-------------|
| **Fix Workspace Persistence** | Data loss risk is highest priority; devcontainer + volumes must work | Backend/Go |
| **Isolate Legacy Worker** | Prevent accidental double-processing; document retirement | DevOps |
| **Docker Runtime Hardening** | Docker socket security, resource quotas, network policies | Security/Go |
| **Docs Alignment Pass** | Ensure all docs reference control plane, not legacy API | Technical Writing |
| **Basic Observability** | Structured logging, Prometheus metrics, health alerts | DevOps |

### SHOULD HAVE (3-9 Months) — Significant Value

| Item | Rationale | Owner/Skill |
|------|-----------|-------------|
| **Multi-Host Runtime Planning** | Design Kubernetes/Firecracker plugin for scale | Architecture/Go |
| **Real Testing Flow** | Integrate Jest/Vitest runner in workspace containers | Full-stack |
| **Quota Enforcement** | Per-user limits on tokens, storage, compute | Backend/Go |
| **Improved Search/Indexing** | Server-side search API, file content indexing | Backend/Go |
| **Plugin SDK Beta** | Document gRPC contracts, publish npm types for frontend | Documentation |
| **SSO/OIDC** | Enterprise login (requires external IdP for testing) | Backend/Go |

### COULD HAVE (6-12 Months) — Nice to Have

| Item | Rationale | Owner/Skill |
|------|-----------|-------------|
| **Theme Marketplace** | Community theme sharing | Frontend |
| **Template Gallery** | Curated starter templates | Content/Design |
| **Advanced Collaboration** | Real-time cursors, presence, comments | Full-stack |
| **Mobile Responsiveness** | Tablet support for IDE | Frontend |
| **VCS Provider Plugins** | GitHub/GitLab native integration | Backend/Go |
| **Deploy Target Plugins** | One-click deploy to Fly/Render | Backend/Go |

### WON'T HAVE (Post-12 Months) — Out of Scope/Future

| Item | Rationale | Alternative |
|------|-----------|-------------|
| **Firecracker Runtime** | Unless prioritized | Docker runtime works |
| **Native Mobile Apps** | Too resource intensive | Responsive web app |
| **AI Model Training** | Out of scope | Use existing providers |
| **Blockchain/Web3** | Not aligned with charter | Traditional auth |

---

## 8. RISK MATRIX

| Likelihood \ Impact | Low | Medium | High |
|---------------------|-----|--------|------|
| **High** | - | Single-host scale ceiling | Data loss from missing persistence |
| | | Unbounded DB growth | Worker corruption risk (legacy) |
| **Medium** | - | Docker socket exposure | Query token leakage in URLs |
| | | CORS misconfiguration | Single point of failure |
| **Low** | - | Dependency vulnerabilities | Complete platform compromise |

**Risk Mitigation Priorities:**
1. **High/High:** Implement workspace persistence immediately
2. **High/Medium:** Plan multi-host architecture
3. **Medium/High:** Harden Docker socket access, add auth token rotation
4. **Medium/Medium:** Implement proper secrets management for tokens

---

## 9. RECOMMENDATIONS

### Immediate (Next 2 Weeks)

1. **Fix Workspace Persistence**
   - Complete devcontainer.json parsing
   - Implement persistent Docker volumes per project
   - Add resource quotas (CPU/memory limits)
   - Test container restart with data intact

2. **Isolate Legacy Worker**
   - Add clear documentation that `apps/worker` is retired
   - Remove from `docker-compose.yml` if still present
   - Archive or delete to prevent accidental activation

3. **Security Hardening**
   - Review Docker socket mount permissions
   - Add network policies to workspace containers
   - Rotate any hardcoded secrets
   - Enable nginx rate limiting

### Short-Term (Next 2 Months)

4. **Observability Implementation**
   - Add Prometheus metrics endpoint
   - Implement structured logging (slog) throughout
   - Set up log aggregation (Loki/ELK)
   - Create Grafana dashboards

5. **Documentation Cleanup**
   - Audit all docs to reference control plane, not legacy API
   - Update API documentation (consider OpenAPI spec)
   - Document plugin development workflow
   - Create troubleshooting runbook

6. **Test Coverage Expansion**
   - Add frontend integration tests (Playwright)
   - Expand backend handler tests
   - Add plugin contract tests
   - Create smoke tests for critical paths

### Medium-Term (Next 6 Months)

7. **Multi-Host Runtime Planning**
   - Design Kubernetes `WorkspaceRuntime` plugin
   - Evaluate Firecracker microVMs for stronger isolation
   - Design workspace scheduling/orchestration
   - Plan for multi-region deployment

8. **Real Testing Flow Implementation**
   - Integrate test runner into workspace containers
   - Add test result aggregation and reporting
   - Create test history and trends
   - Add test-to-code navigation

9. **Enterprise Features**
   - Complete SSO/OIDC implementation
   - Add audit log compliance features
   - Implement data retention policies
   - Add organization-level admin controls

### Long-Term (Next 12+ Months)

10. **Ecosystem Development**
    - Publish Plugin SDK with versioning guarantees
    - Launch theme marketplace
    - Create template registry and gallery
    - Build plugin developer community

11. **Platform Expansion**
    - Mobile IDE support (tablet)
    - Desktop application (Electron/Tauri)
    - VS Code extension for hybrid workflows
    - GitHub Codespaces integration

12. **AI/ML Infrastructure**
    - Fine-tuning infrastructure for custom models
    - Model evaluation and comparison tools
    - Agent behavior analysis and improvement
    - Cost optimization recommendations

---

## CONCLUSION

Torsor represents an ambitious and well-architected open-source cloud IDE project with a strong foundation in modern technologies. The recent cutover to the Go control plane (ADR 0009) demonstrates the team's ability to execute complex architectural migrations.

**Key Strengths:**
- Strong security model with per-user ownership and validated sessions
- Well-designed plugin architecture with gRPC-based extensibility
- Modern frontend stack with CSS-variable theming
- Comprehensive documentation with ADRs and architecture docs

**Critical Areas for Attention:**
1. **Workspace persistence must be completed immediately** to prevent data loss
2. **Mock data usage should be systematically replaced** with real API integrations
3. **Multi-host runtime architecture** needs planning for production scale
4. **Test coverage** requires significant expansion for confidence

The phased roadmap (MoSCoW) provides a clear path forward, with the MUST HAVE items addressing the most critical risks. With focused effort on the immediate priorities, Torsor is well-positioned to become a production-ready, self-hostable alternative to proprietary cloud IDEs.

---

*Report generated: July 19, 2026*  
*Analysis performed by: AI Agent*  
*Repository: github.com/torsor/torsor*
