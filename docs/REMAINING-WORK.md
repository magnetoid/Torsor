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
| App Storage | `storage_handlers.go` (assets under `.torsor/storage/`) | tsc; **Go build/vet/test ✓** (compile-run confirmed once disk was freed) |
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

### 2. Interactive terminal (PTY / stdin) — BUILT (needs a container smoke test)
Done once the disk was freed and the proto toolchain installed. What shipped:

- **Contract**: `ExecInteractive` bidirectional streaming RPC added to
  `internal/plugin/proto/runtime.proto` (frames: `ExecStart`, then `stdin` / `WinSize`
  resize up; `ExecChunk` down). Stubs regenerated with `protoc` + `protoc-gen-go`
  v1.36.11 / `protoc-gen-go-grpc` v1.6.2.
- **Bridge**: `plugin.WorkspaceRuntime.ExecInteractive` on the Go interface, with both
  gRPC client and server halves in `internal/plugin/runtime.go`.
- **Runtimes**: `cmd/mock-runtime` implements a deterministic echo PTY (unit-tested);
  `cmd/docker-runtime` implements a real PTY via `docker exec -it` wired to a
  `creack/pty` master (stdin write + `TIOCSWINSZ` resize).
- **Transport**: `GET /api/v1/projects/{id}/workspace/pty` websocket
  (`internal/server/pty_handlers.go`), authenticated via `access_token` and scoped to
  project ownership; unsupported runtimes surface a clean "not supported" frame.
- **Frontend**: `TerminalTab` is a real PTY over that websocket — raw stdin passthrough
  (the PTY echoes), `onResize` → resize frames, honest fallback when no workspace exists.

**Verified**: `go build/vet/test ./...` (incl. a new plugin test that drives the full
bidi path — stdin, resize, exit — through the real out-of-process mock plugin), gofmt,
tsc, vitest. **Not yet exercised here**: the `docker-runtime` PTY against a real
container (no Docker on this host), and the websocket handler end-to-end (needs Postgres
+ a live workspace). Smoke-test both on the server: open the terminal in a project with a
running docker workspace and confirm `vim`/a REPL and Ctrl-C behave.

## Environment notes
- Local Go builds need ~1 GiB scratch. The dev Mac's APFS container was full
  (~215 MiB free) during the initial pass, but has since been cleared — the full
  `go build/vet/test ./...` now passes locally (all packages `ok`), so App Storage
  is compile-run verified and no longer server-only.
- App Storage assumes `stat`/`find`/`rm` in the container (busybox-compatible flags used).
- Database explorer assumes `sqlite3` in the container; it degrades to an honest
  empty state when absent.
