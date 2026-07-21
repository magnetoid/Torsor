# Remaining work

Honest status of what is **not built** (or not fully validated), after the 2026-07 frontier
push (PRs #25–#31: self-verifying agent with a real headless browser, security baseline,
central update system, host-mode wildcard previews, spec-driven missions + AGENTS.md +
model routing + transcript compaction, zero-config app detection). For applied-infra state
(egress firewall, wildcard preview chain, backups) see
[PRODUCTION-HARDENING.md](PRODUCTION-HARDENING.md); for multi-instance design see
[SCALING.md](SCALING.md).

## Not built — needs a product decision + external accounts

### DeployTarget plugins (Netlify / Fly / Vercel / SSH)
Deploy today is the in-workspace production build served at `/d/{id}` (+ custom domains).
External targets need a new plugin capability (proto + host wiring, same pattern as
ModelProvider/WorkspaceRuntime) and provider credentials to build against. Frontend
already shows these honestly as "coming soon".

### VCS provider (GitHub app: repo create, push, PRs)
Git works via exec inside the workspace; there is no provider OAuth/API integration.
Needs a GitHub App/OAuth app registration.

### Billing (Stripe)
`usage_events` metering exists; there is no payment path. BillingTab/AdminRevenueTab show
honest empty/zero states. Needs Stripe keys + a pricing decision.

### SSO / OIDC / SAML
Design sketch: `sso_configs` per team → OIDC flow (`golang.org/x/oauth2`) → session issue
via `internal/auth`. **Blocked on an external IdP tenant** (Okta/Entra/Auth0) to build and
validate against. `SecurityTab`'s SSO controls remain honest-preview.

## Designed, awaiting rollout conditions

- **Workspace persistent volumes** — designed snapshot-aware (naive volumes would break
  commit-based SnapshotWorkspace); validate on the server before shipping
  (PRODUCTION-HARDENING §1).
- **Redis-backed multi-instance** (rate limiter, presence/collab + mission control fan-out,
  PgBouncer, object storage) — specified in SCALING.md; needs a real 2-replica setup to
  validate.
- **Deployed-app domain isolation** — separate registrable domain for user apps + Public
  Suffix List submission (PRODUCTION-HARDENING §5); DNS/product task.
- **gVisor as prod default** — code flag shipped (`TORSOR_WS_DOCKER_RUNTIME=runsc`);
  install gVisor on the host and validate templates run under it.

## Known-thin areas

- **E2E tests**: none (no Playwright/Cypress). Frontend vitest is a smoke set; `apps/api`
  and `apps/worker` (legacy, out of the default stack) have zero tests.
- **Honest-preview tabs**: `auth`, `security`, `canvas` remain banner-labeled mocks.
- **Abuse/takedown workflow** for user-deployed apps: not built (report endpoint + admin
  takedown) — needed before broadly opening signups.
- **Legacy cleanup**: `apps/api` + `apps/worker` are retained for rollback (ADR 0009);
  delete once the control plane is battle-tested, and reconcile the diverged migration dirs.
