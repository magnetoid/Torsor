---
type: decision
status: accepted
tags:
- adr
links: []
created: '2026-06-15T20:09:43'
updated: '2026-06-15T20:09:43'
rules: []
---

# ADR 0005: Superadmin dashboard: real admin API in apps/api (live backend), role-gated

## Context
User asked for a superadmin dashboard. The admin UI (AdminPage + tabs) already existed but was 100% mock (MOCK_USERS, hardcoded stat values, REVENUE_DATA). Roles already exist (user|admin|super_admin) with SUPER_ADMIN_EMAILS auto-promotion. The live frontend talks to apps/api (Express); the Go control plane is shipped in parallel but nothing depends on it yet — so for the dashboard to actually work today, endpoints must live in apps/api.

## Decision
Built real admin endpoints in apps/api gated by a new requireRole(min) middleware that resolves the caller's effective role (DB role + SUPER_ADMIN_EMAILS) after requireAuth and 403s below the minimum: GET /api/v1/admin/stats (platform totals + tasksByStatus + 7d growth), GET /api/v1/admin/users (search/limit/offset, role + projectCount + lastActiveAt), PATCH /api/v1/admin/users/:id/role (super_admin only; blocks self-demotion lockout). Frontend: new src/stores/adminStore.ts (Zustand) + wired AdminUsersTab (real users, search, role-change) and AdminOverviewTab stat cards to live data. Revenue/MRR charts left mock (no billing data tracked yet). Verified: lint:api + lint:frontend pass (tsc, exit 0).

## Consequences
Superadmin can view real platform metrics and manage user roles against the live DB. Mirror into the Go control plane later to keep 1:1. Runtime behavior (rendering) is tsc-verified only — not yet confirmed against a running app + DB. Revenue tab still needs a real billing source.
