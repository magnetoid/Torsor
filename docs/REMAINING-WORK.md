# Remaining work — handoff

Status as of the `feat/real-backends-git-notifications-audit-storage-db` branch
(commits `88ec702`, `183830a`). This documents what is done, what is verified,
and the concrete steps to finish the last two features on a machine where Go can
compile and where an external identity provider exists.

## Done and real (this branch)

| Feature | Backend | Verified |
|---|---|---|
| Git | `internal/server/git_handlers.go` (real `git` via `WorkspaceRuntime.Exec`) | go vet/build/test, tsc, build |
| Notifications | `0012_notifications.sql` + `notification_handlers.go`, emits on invite | go vet/test, tsc, build |
| Audit log | `audit_handlers.go` (server-written events) | go vet/test, tsc, build |
| App Storage | `storage_handlers.go` (assets under `.torsor/storage/`) | tsc; **Go gofmt-clean, NOT compile-run** (host disk full) |
| Database explorer | frontend-only via `apiExecCollect` running `sqlite3 -json` | tsc |
| Integrations | frontend-only; credentials stored via `/api/v1/secrets` | tsc |

### First step on the server
```bash
cd apps/control-plane && go build ./... && go vet ./... && go test ./...
```
This compiles + tests `storage_handlers.go` (the only piece not run locally) and
everything else. Then run migrations (`0012_notifications.sql` applies on boot)
and smoke-test the feature endpoints against a provisioned workspace.

## Not built — needs external infrastructure

### 1. SSO / SAML (needs a real IdP)
`src/components/tabs/SecurityTab.tsx` has "Enable SSO"/"Test SSO" controls with
no backend. To make it real:

- **Config**: new table `sso_configs` (per-team: provider, issuer/metadata URL,
  client_id, client_secret[encrypted], enabled). Handlers under `/api/v1/teams/{id}/sso`.
- **OIDC flow** (simpler than SAML, uses the Go stdlib + `golang.org/x/oauth2`):
  - `GET /api/v1/auth/sso/{teamSlug}/login` → redirect to the IdP authorize URL.
  - `GET /api/v1/auth/sso/callback` → exchange code, verify ID token, match/provision
    the user by email, issue a session (reuse `internal/auth` session creation).
- **Frontend**: wire SecurityTab to save config; add an "SSO" button on the login page.
- **Blocker**: requires an actual IdP tenant (Okta/Entra/Auth0) to configure and
  test against. Cannot function or be validated without one.

### 2. Interactive terminal (PTY / stdin)
The terminal already runs non-interactive commands (`apiExecStream`). True
interactivity needs stdin + a PTY, which the current one-way SSE exec can't do:

- **Contract**: add a bidirectional streaming RPC to `internal/plugin/proto/model.proto`
  (or a new `ExecInteractive`) carrying stdin frames up and stdout/stderr down;
  regenerate stubs with `protoc`.
- **Runtime**: implement in `cmd/docker-runtime` via `docker exec -it` with a PTY
  (`creack/pty` or docker's attach API); mock-runtime can echo.
- **Transport**: a websocket endpoint (SSE is one-way) at
  `/api/v1/projects/{id}/workspace/pty`.
- **Frontend**: switch `TerminalTab` to the websocket and forward xterm `onData`
  (stdin) + resize events.
- **Blocker**: a versioned-contract change that must be compiled/regenerated;
  couldn't be done on the disk-full host.

## Environment notes
- Local Go builds need ~1 GiB scratch; the dev Mac's APFS container is full
  (~215 MiB free), so all Go verification must happen on the Linux server.
- App Storage assumes `stat`/`find`/`rm` in the container (busybox-compatible flags used).
- Database explorer assumes `sqlite3` in the container; it degrades to an honest
  empty state when absent.
