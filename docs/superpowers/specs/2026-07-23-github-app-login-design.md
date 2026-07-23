# GitHub App — Increment 1: Foundation + Sign in with GitHub

**Status:** approved design (2026-07-23)
**Scope:** increment 1 of 3. This spec covers only the super-admin GitHub App
configuration panel and "Sign in with GitHub" login. Later increments (separate
specs): **increment 2** — import a project from a GitHub repo; **increment 3** —
push-to-deploy via GitHub webhooks.

## Context

Torsor's backend is the Go control plane (`apps/control-plane`); the frontend is
the React app in `src/`. A single **GitHub App** (not an OAuth App) will back all
three increments: user-to-server auth for login, installation tokens for importing
private repos (inc. 2), and webhooks for deploy-on-push (inc. 3). This increment
builds the shared foundation (credential storage + config UI) plus login.

Much of the plumbing already exists and is reused rather than rebuilt:

- `internal/auth` — `Manager` with `SignToken`, `Authenticate`, live-`sessions`
  validation. Session creation is centralized in `issueAuthResponse(ctx, userID)`
  in `server/auth_handlers.go` — **password-agnostic**, the exact hook an OAuth
  callback needs.
- `internal/secrets` — AES-256-GCM `Cipher` keyed by `TORSOR_SECRET_KEY`
  (already set in prod). Built via `s.secretCipher()` in handlers.
- Super-admin settings pattern — `platform_settings` single-row table +
  `admin_platform_handlers.go` + `adminStore.ts` + `AdminSettingsTab.tsx`, all
  gated by `requireRole(auth.RoleSuperAdmin)`. The GitHub config panel mirrors this.
- Frontend — `authStore.ts` already has a `loginWithGitHub` stub (throws
  "not wired yet"); `AuthPage.tsx` has a placeholder for OAuth buttons; token lives
  in `localStorage` under `torsor-auth-token` via `src/lib/api.ts`.

## Decisions (locked)

1. **One GitHub App**, configured instance-wide by a super-admin.
2. **Account model:** on GitHub login, match an existing identity; else auto-link
   to an existing user **only when GitHub reports the primary email as verified**;
   else auto-create an account (subject to the `allow_signup` toggle).
3. **App setup UX:** manual paste of credentials (App Manifest one-click deferred).
4. **Identity storage:** new `user_identities` table (not columns on `users`), so
   the existing `loginWithGoogle` stub and future providers fit without churn.
5. **Libraries (open-source-first, ADR 0010):** `golang.org/x/oauth2` for the
   OAuth dance, `github.com/google/go-github` for the GitHub REST calls. No
   bespoke HTTP client, no bundled SDK in the frontend.

## Data model — migration `0022_github_auth.sql`

Control-plane only (`apps/api` is frozen at 0010). Idempotent, monotonic.

- **`user_identities`**
  - `id UUID PK DEFAULT gen_random_uuid()`
  - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `provider TEXT NOT NULL` (`'github'`)
  - `provider_user_id TEXT NOT NULL` (GitHub numeric id, stored as text)
  - `provider_login TEXT`
  - `provider_email TEXT`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
    `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `UNIQUE(provider, provider_user_id)`; index on `user_id`.
- **`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`** — GitHub-only
  accounts have no password. Existing rows unaffected. (Password login paths keep
  their own not-null/format checks; a null hash simply can't satisfy
  `VerifyPassword`.)
- **`github_app_settings`** — single-row config (mirrors `platform_settings`):
  - `id BOOLEAN PRIMARY KEY DEFAULT TRUE` + `CHECK (id)`
  - `app_id TEXT`, `app_slug TEXT`, `client_id TEXT` (non-secret, plaintext)
  - `client_secret_enc TEXT`, `private_key_enc TEXT`, `webhook_secret_enc TEXT`
    (AES-GCM ciphertext via `TORSOR_SECRET_KEY`; nullable until set)
  - `enabled BOOLEAN NOT NULL DEFAULT FALSE`
  - `allow_signup BOOLEAN NOT NULL DEFAULT TRUE`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - Seed the single row (`INSERT ... ON CONFLICT DO NOTHING`).

`private_key_enc` / `webhook_secret_enc` are unused by login but stored now so the
panel is complete for increments 2–3.

## Backend — super-admin settings

New file `internal/server/github_settings_handlers.go`, wired in `server.go` inside
the `requireRole(auth.RoleSuperAdmin)` group:

- `GET /api/v1/admin/github-settings` → `handleGetGitHubSettings`. Returns
  `{appId, appSlug, clientId, clientSecretSet, privateKeySet, webhookSecretSet,
  enabled, allowSignup, callbackUrl}`. **Secret values are never returned** — only
  boolean `*Set` flags. `callbackUrl` is derived (see below).
- `PATCH /api/v1/admin/github-settings` → `handleUpdateGitHubSettings`. Accepts any
  subset of fields. Secrets are encrypted with `s.secretCipher()` before storage,
  and a secret column is overwritten **only when a non-empty value is supplied**
  (so saving `enabled` alone never wipes the private key). Returns the same masked
  shape as GET. Requires `secretCipher()` to be enabled (`TORSOR_SECRET_KEY` set);
  if disabled, 4xx with a clear message.
- Internal accessor `loadGitHubConfig(ctx) (*githubConfig, error)` returning the
  decrypted `client_id`/`client_secret` (+ `enabled`, `allow_signup`) for the auth
  handlers. Read per-login from the DB (login is infrequent; no cache needed).

## Backend — login flow

New file `internal/server/github_auth_handlers.go`. GitHub API access goes through a
small interface (`githubUserClient` with `GetUser`/`GetPrimaryVerifiedEmail`, backed
by `go-github`) so tests inject a fake and never hit the network.

**Login does not require the App to be installed.** User-to-server authorization
(the login flow) is independent of App installation on any repo/org — installation
only matters for increment 2 (repo access). So this increment works as soon as the
super-admin saves `client_id` + `client_secret` and flips `enabled`.

- **`GET /api/v1/auth/github`** (public) → `handleGitHubLoginStart`
  - If GitHub not `enabled` or unconfigured → `302 /login?error=github_unavailable`.
  - Build a **stateless CSRF `state`**: `base64(nonce | expiry | HMAC-SHA256(nonce|expiry, TORSOR_SECRET_KEY))`.
  - Redirect to `https://github.com/login/oauth/authorize?client_id=…&redirect_uri=<callbackUrl>&state=…`.
    (GitHub Apps take user-to-server permissions from the App config, not a `scope`
    param; reading email requires the App's **Account permissions → Email
    addresses: read-only**, documented in the admin panel help text.)
- **`GET /api/v1/auth/github/callback`** (public) → `handleGitHubCallback`
  - Verify `state` (HMAC + expiry). On failure → `/login?error=state`.
  - Exchange `code` → user-to-server token (`oauth2` config
    `Exchange`). Fetch `/user` and `/user/emails`; select the **primary + verified**
    email. No verified primary email → `/login?error=email_unverified`.
  - Resolve the account:
    1. `user_identities` match on `(provider='github', provider_user_id)` → that user.
    2. else case-insensitive `users.email` == verified email → create the identity
       link, use that user.
    3. else if `allow_signup` → create `users` (email, `username` from GitHub login
       **deduped** against existing usernames, `avatar_url`, `password_hash` NULL,
       role via existing `resolveRole`), create "Personal Workspace" team (mirror
       `handleSignup`), create the identity link.
    4. else → `/login?error=signups_disabled`.
  - Create the session via existing `issueAuthResponse` → obtain the JWT.
  - **Token handoff (keeps the JWT out of the URL/history):** redirect to
    `/auth/callback?code=<handoff>` where `handoff` is a short-lived (~60s) signed
    token binding the session (HMAC over `sessionId|expiry` with `TORSOR_SECRET_KEY`).
- **`POST /api/v1/auth/github/exchange`** (public) → `handleGitHubExchange`. Verify
  the handoff code (signature + expiry + that the session is still live) and return
  `{token, user}`. Single-purpose; the code cannot be replayed after expiry.
- **`GET /api/v1/auth/providers`** (public) → `{github:{enabled:bool}}` so the login
  page knows whether to show the button.

**Callback URL** derives from configured `APP_URL` (fallback: request scheme+host):
`https://app.torsor.dev/api/v1/auth/github/callback`. Shown read-only in the panel
so the super-admin pastes it into the GitHub App's "User authorization callback URL".

## Frontend

- `authStore.loginWithGitHub()` — replace the stub with
  `window.location.href = '/api/v1/auth/github'`.
- New public route `/auth/callback` (in `App.tsx`, `PublicRoute`) →
  `src/pages/GitHubCallbackPage.tsx`: read `code` from the query, `POST` exchange,
  `setStoredToken(token)`, hydrate user via `/auth/me`, then route by `onboarded`
  (onboarding vs home). Render `?error=` states with a link back to `/login`.
- `AuthPage.tsx` — add a "Sign in with GitHub" button in the form block, rendered
  only when `GET /api/v1/auth/providers` reports `github.enabled`.
- Admin: new `github` nav item in `AdminLayout.navItems` + `AdminPage` switch case
  + `src/components/admin/tabs/AdminGitHubTab.tsx`. Secrets are write-only inputs
  showing "•••• set" when populated; toggles for `enabled` and `allow_signup`;
  read-only callback URL + a short setup checklist. Store methods
  `fetchGitHubSettings`/`saveGitHubSettings` in `adminStore.ts`; `api.ts` helpers.
  Keep UI on design tokens (no raw hex).

## Error handling & security

- Auto-link **only** on GitHub-verified primary email → blocks email-spoof
  account takeover.
- App secrets AES-GCM at rest; never returned to the client (masked `*Set` flags).
- Super-admin-gated settings writes; `allow_signup` gates account creation.
- Signed, expiring `state` (CSRF) and handoff code (single-purpose, ~60s).
- All failures redirect to `/login?error=<reason>` — never a stack trace or raw
  provider error. Reasons: `github_unavailable`, `state`, `email_unverified`,
  `signups_disabled`, `exchange_failed`.
- Existing rate limiter and security headers apply to the new routes.

## Testing

- **Go units** (fakes, no network/DB where avoidable):
  - Callback account resolution — all four branches (existing identity;
    verified-email link; new signup; signup disabled) via a fake `githubUserClient`.
  - Config store — encrypt/decrypt round-trip; partial PATCH preserves unset
    secrets; GET masks secrets.
  - `state` and handoff sign/verify — happy path, expired, tampered.
  - Username dedup helper.
- **Frontend vitest:** `authStore.loginWithGitHub` performs the redirect; callback
  page stores the token and handles an `error` param.

## Out of scope (increment 1)

- Repo import (increment 2) and push-to-deploy webhooks (increment 3).
- App Manifest one-click creation (deferred; panel designed to add it later).
- A "link GitHub" button in profile settings (auto-link-by-verified-email covers the
  common case; can add later).
- Installation tokens / private-repo access (needed for inc. 2, not for login).

## Known latent bug (noted, not fixed here)

`handleUpdateMe` issues `UPDATE users SET name = $2`, but `users` has no `name`
column (only `username`). Off the login path, so untouched here — recorded so a
future GitHub display-name change doesn't trip on it.
