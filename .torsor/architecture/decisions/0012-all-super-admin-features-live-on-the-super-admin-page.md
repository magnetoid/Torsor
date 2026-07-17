---
type: decision
status: accepted
tags: [adr, admin, ui, security]
links: [0005, 0002]
---

# ADR 0012: All super-admin features live on the Super Admin page

## Context
Torsor has a dedicated Super Admin surface (ADR 0005): the `/admin` route tree
(`src/pages/AdminPage.tsx` + `src/components/admin/**`), guarded on the frontend by
`AdminRoute` and on the backend by `requireRole(super_admin)`. As features grow there is a
temptation to sprinkle super-admin-only controls into ordinary pages — a hidden button in
Settings, a platform toggle on the dashboard, an "all users" list in a normal tab. That
fragments the privileged surface, makes the security boundary hard to audit, and leaks
super-admin affordances into `user`/`admin` code paths.

## Decision
**All super-admin features and options live on the Super Admin page.**

- Every super-admin-only capability (platform settings, all-users / all-workspaces
  management, revenue, system configuration, feature flags, …) is implemented under
  `src/components/admin/**` and reached only via the `/admin` route tree.
- Other surfaces may **link** to the Super Admin page (e.g. the account menu's "Admin
  Panel" item) but must not **embed** super-admin controls, nor gate feature UI on the
  `super_admin` role outside the admin module.
- Backend: super-admin endpoints stay behind the admin route group with
  `requireRole(auth.RoleSuperAdmin)`; they are not mixed into ordinary project/user routes.
- The only legitimate `super_admin` references outside the admin module are the role
  **guard** (`AdminRoute` / `requireRole`) and a **link/badge** to the admin page (e.g.
  `AccountMenu`) — never an inline management feature.

Like the ownership invariants in ADR 0002, this is a **structural rule** enforced by this
decision and review, not a single-line regex, because "is this a management feature?" is
not reliably pattern-matchable. Super-admin work that doesn't fit under
`components/admin/**` is a signal to reconsider placement, not to add an exception.

## Consequences
The privileged surface stays in one auditable place; the security boundary is a single
route tree (frontend `AdminRoute`, backend `requireRole(super_admin)`). White-labeling and
role-scoping stay simple. Adding a super-admin feature means adding an admin
tab/section — not touching ordinary pages.
