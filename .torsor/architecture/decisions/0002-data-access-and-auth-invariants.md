---
type: decision
status: accepted
tags: [adr, security]
links: []
rules:
  - kind: forbid_pattern
    target: 'console\.log'
    scope: 'apps/api/src/**/*.ts'
    severity: hint
    message: 'apps/api uses the pino structured logger (and req.log) — avoid console.log.'
---

# ADR 0002: Data-access & auth invariants

## Context
Torsor is multi-tenant: every user only sees their own projects, files, and tasks.
docs/ARCHITECTURE.md's security checklist and README Phase 0 fix establish hard rules the
backend must never regress on. Most are structural (not single-line-regex-checkable), so
they live here as a documented decision; the machine-checkable ones carry `rules:`.

## Decision
On every project/file/task route (in both `apps/api` and the Go `apps/control-plane`):
- Scope every query by the authenticated `user_id`; return 404 (not 403) on a miss.
- Use parameterized queries only — never string-interpolate user input into SQL.
- Validate the session: `requireAuth` checks the `sessions` row exists and is unexpired,
  so logout/revocation is real. Never accept a stateless-only JWT.
- Roles are `user | admin | super_admin`; never collapse `admin`/`super_admin` to `user`.
- `JWT_SECRET` is enforced in production (>=32 chars, not the dev default).

## Consequences
Ownership isolation, real revocation, and injection safety are preserved across the
Express→Go cutover. The `console.log` rule keeps `apps/api` on structured pino logging
(the `apps/worker` skeleton is intentionally exempt).
