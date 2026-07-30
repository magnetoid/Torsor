# Design / UX / UI Improvement Plan

> **Date:** 2026-07-30. Staged plan from a full frontend surface audit + 2026 UX research.
> Stage 1 ships now; stages 2–3 are follow-on work. Check items off as they land.
> Market context: [COMPETITIVE-ANALYSIS.md](./COMPETITIVE-ANALYSIS.md).

## Principles

1. **The app never lies.** Every mock/preview surface carries the honest
   `maturity: 'preview'` banner (the kernel already automates this). Fabricated data
   (fake invoices, fake activity) is worse than an empty state — it destroys trust in
   the surfaces that ARE real. (2026 UX research: transparency is the currency of
   AI-product trust.)
2. **Tokens govern everything.** The 16-token pack + typed contract
   (`src/index.css`, `src/kernel/theme.ts`) is the design system; components consume
   semantic utilities only. White-labeling stays drop-in.
3. **Keyboard-first.** ⌘K is the universal action surface; shortcuts never fire while
   typing; everything reachable without a mouse.
4. **Every empty state is a next action.** Blank panels are drop-off points; guide the
   user to the milestone instead (NN/g empty-state guidance).
5. **The IDE is never second-class.** As we evolve app-first (chat + preview primary),
   the editor/terminal stay one keystroke away — our users are developers; Replit hides
   the IDE, we don't.

## Audit summary (2026-07-30)

**Strong foundation:** token pack + runtime ThemeRegistry + motion tokens + near-square
radius + Inter Variable/JetBrains Mono; per-surface skeletons; sonner toasts; ⌘K palette
(cmdk); per-route ErrorBoundaries; `prefers-reduced-motion` kill-switch; 59 aria-labels.

**Weak spots:** shared-primitive adoption is 10/112 tsx files (287 raw `<button>` vs 10
`<Button>`); 22/30 IDE tabs have zero responsive classes (no mobile story); a11y gaps
(⌘K palette missing `Dialog.Title`, no shortcut focus-guard, 7 `role=` total);
5 stores persist under legacy `tesseract-*` keys; and the truth problems below.

## Stage 1 — ship now

### Batch 1: honesty & trust

- [ ] **BillingTab** (`src/components/tabs/BillingTab.tsx`): remove `MOCK_CHART_DATA`,
      `MOCK_INVOICES`, fake "Visa ···· 4242", fake "Buy tokens" toast. Render real token
      usage (`apiUsageSummary`), honest empty states for invoices/payment method
      (pattern: `AdminRevenueTab`).
- [ ] **Kill the free self-upgrade hole**: `PATCH /api/v1/teams/{id}` ignores `plan`
      changes from non-admins (Go, `team_handlers.go`); `UpgradeDialog` / `BillingModal`
      stop faking `setTimeout` upgrades and say plainly that plans are admin-managed on
      self-hosted Torsor.
- [ ] **AdminOverviewTab**: delete hardcoded `REVENUE_DATA` chart + fake
      `RECENT_ACTIVITY`; wire activity to real `/api/v1/audit`; reuse the honest
      revenue empty state.
- [ ] **AuditLogTab**: remove the FALSE "sample data" notice (the data is real);
      implement client-side CSV export.
- [ ] **IntegrationsTab** → "API Credentials": "Connected" → "Credential saved";
      banner explaining real connectors arrive via MCP (see MCP Servers tab).
- [ ] **LibraryView**: honest preview labelling.
- [ ] **Dead-end sweep**: NotFound `href="#"`×3 → real destinations; AccountMenu
      Account/Settings dedupe; delete unimported `ActivityFeed.tsx` and the fake
      `settingsStore.integrations` block; canvas mock logo "TESSERACT" → "Torsor".
- [ ] **Maintenance mode becomes real**: control-plane middleware returns 503 to
      non-admins when `platform_settings.maintenance_mode` is on; frontend shows the
      banner from `/api/v1/config`.

### Batch 2: UX quick wins

- [ ] **Onboarding uses your choices**: fetch real `/api/v1/templates`, pass the chosen
      `template` through `createProject`; renumber step files; remove the dead
      "Import from GitHub" tile until import ships.
- [ ] **Server-side search**: `POST /projects/{id}/workspace/search` (grep in the
      workspace, node_modules/.git excluded, capped); `SearchView` gets real results +
      loading/empty/error states. Fixes the near-useless ⌘⇧F.
- [ ] **Real stars/archive**: migration `0023` adds `starred`/`archived` to `projects`;
      `PATCH /projects/{id}` accepts them; localStorage illusions removed.
- [ ] **Keyboard & a11y**: focus-guard in `useKeyboardShortcut` (no firing while typing
      in inputs/Monaco/xterm); `Dialog.Title` on the ⌘K palette; `/about` `/updates`
      `/feedback` added to `RouteTitleManager`.
- [ ] **AgentEngineTab** error handling (currently hangs on a spinner forever on 403/500).
- [ ] **Persist keys** `tesseract-*` → `torsor-*` with one-time migration.
- [ ] **Responsive minimum**: breakpoint-prefix the unguarded `grid-cols-3/4`
      (BillingPage, UsageTab, BillingModal, OnboardingStep4); dismissible
      "best on desktop" notice for the IDE below 768px.
- [ ] **Primitive adoption pass** — finding from the Stage-1 attempt (2026-07-30):
      the top-traffic surfaces (Home, Projects, Auth) already carry consistent
      focus-ring/aria patterns and deliberate custom controls (segmented toggles,
      tab strips, dropdown triggers); blind `<button>` → `Button` swaps there are
      regression risk without payoff. The raw-button debt worth converting lives in
      the IDE tabs — fold this into the Stage-2 sweep with visual verification.

## Stage 2 — consolidation

- [ ] Full primitive-adoption sweep (remaining ~100 files); consider a lint rule.
- [ ] Responsive IDE story: define ≥3 breakpoint behaviors for the 22 unresponsive
      tabs; keyboard-resizable panels (PanelResizer is drag-only).
- [ ] A11y: roles/landmarks pass; focus order audit for all 8 dialogs; visible focus
      rings on custom controls.
- [ ] Document "the Torsor look" (calm, dense, near-square, token-governed) so
      contributors and the agent generate on-system UI.
- [ ] Rich notification center actions; contextual error-recovery patterns.

## Stage 3 — app-first evolution (design → spec → build)

- [ ] **"Build" view**: default surface for new/simple projects = Chat + Live Preview
      side-by-side; editor/terminal/files one keystroke away (⌘E). The IDE is never
      hidden — progressive disclosure, not removal.
- [ ] **Agent transparency** (calm-AI): step timeline with tool chips, collapsible
      thought/result, live status line ("running `npm test`…"), inline checkpoint
      markers, per-run token readout from `usage_events`.
- [ ] **Mission board**: Kanban of mission tasks (statuses already exist in
      `agent_missions`) — plan/approve/execute at a glance.
- [ ] **Time-to-first-win onboarding**: template → guided first prompt → running
      preview in under 5 minutes with a local model; milestone-style empty states
      across Home/IDE.

## Verification (Stage 1)

- `npm run lint` + `npm test` + `npm run build`; `go build/vet/test ./...` in
  `apps/control-plane`.
- Manual walk: onboarding with a template → billing tab (real usage, no fake card) →
  admin overview (no fabricated data) → audit log (no false banner) → ⌘⇧F on a fresh
  project → star/archive from a second browser → maintenance toggle as non-admin →
  no Radix a11y warning from ⌘K → shortcuts inert while typing in the terminal.
- Grep gates: no `MOCK_` data imports in BillingTab/AdminOverviewTab; no `tesseract-`
  persist keys; `torsor guard` passes.
