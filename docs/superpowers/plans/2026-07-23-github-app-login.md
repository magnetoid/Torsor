# GitHub App Login — Increment 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a super-admin GitHub App configuration panel plus "Sign in with GitHub" (user-to-server OAuth) login for Torsor.

**Architecture:** One instance-wide GitHub App, configured by a super-admin (credentials AES-GCM-encrypted at rest via the existing `TORSOR_SECRET_KEY` cipher). The login flow is stateless: a signed CSRF `state` protects the round-trip; the callback resolves/creates the user and redirects with a short-lived signed **handoff** code; the SPA exchanges that code for a real JWT via the existing `issueAuthResponse` path. All new tests live on pure helpers (token signing, account-decision, settings-merge, GitHub API client), matching the codebase's no-DB-in-unit-tests idiom.

**Tech Stack:** Go 1.25 control plane (chi router, pgx, `golang.org/x/oauth2` + `golang.org/x/oauth2/github` for the OAuth dance, **raw `net/http`** for the two GitHub REST reads — no `go-github`), React 19 + Zustand + Tailwind (design tokens), Radix UI, vitest.

## Global Constraints

- Module path: `github.com/magnetoid/torsor/control-plane`. Go `1.25.0`.
- New migration goes **only** in `apps/control-plane/internal/migrations/` (apps/api is frozen at 0010). Filename `0022_github_auth.sql`; SQL must be **idempotent** (`IF NOT EXISTS` / guarded `ALTER`); migrations auto-discovered by `//go:embed *.sql`, applied in lexical filename order.
- Per-user ownership + parameterized SQL on every data route. Super-admin routes go under the `r.Use(s.requireRole(auth.RoleSuperAdmin))` group.
- Secrets: encrypt with `s.secretCipher()` (AES-256-GCM, `secrets.NewCipher(s.cfg.SecretKey)`); on `errors.Is(err, secrets.ErrDisabled)` respond `503`. **Never** return secret values to the client — expose boolean `*Set` flags only.
- Server struct fields: pool is `s.pool` (`*pgxpool.Pool`), auth is `s.auth`, config is `s.cfg`, error helper is `s.fail(w, r, err)`. HTTP helpers: `writeJSON(w, status, v)`, `writeError(w, status, msg)`, `decodeJSON(r, &v)`. Existing utilities in the `server` package: `randHex(n)`, `slugify(name, email)`. Path params via `chi.URLParam(r, "name")`.
- Frontend: token lives in `localStorage` under `torsor-auth-token` via `src/lib/api.ts` (`getStoredToken`/`setStoredToken`); API calls go through `apiRequest<T>(path, { auth })`. UI stays on CSS design tokens (`bg-surface`, `text-secondary`, `border-default`, `bg-accent`, …) — **no raw hex**.
- Frontend lint = `npm run lint:frontend` (`tsc --noEmit`). Go checks = `go build ./...`, `go vet ./...`, `go test ./...` (run from `apps/control-plane`). Frontend tests = `npm test` (vitest).
- Work happens on branch `feat/github-app-login` (already created). Commit after every task.

---

### Task 1: Database migration — identities, nullable password, App settings

**Files:**
- Create: `apps/control-plane/internal/migrations/0022_github_auth.sql`
- Modify: `apps/control-plane/internal/server/auth_handlers.go:176-183` (guard `handleLogin` against a NULL `password_hash`)

**Interfaces:**
- Produces (tables later tasks rely on): `user_identities(id, user_id, provider, provider_user_id, provider_login, provider_email, created_at, updated_at)` with `UNIQUE(provider, provider_user_id)`; `github_app_settings` single-row (`id BOOLEAN PK`, `app_id`, `app_slug`, `client_id`, `client_secret_enc`, `private_key_enc`, `webhook_secret_enc`, `enabled`, `allow_signup`, `updated_at`); `users.password_hash` becomes NULLable.

**Why the handler change ships with the migration:** once `password_hash` can be NULL, `handleLogin` (which scans it into a plain `string`) would 500 when a GitHub-only account attempts password login — pgx can't scan NULL into `string`, and that error isn't `pgx.ErrNoRows`, so it skips the 401 path. The two changes are coupled and land together.

- [ ] **Step 1: Write the migration SQL**

Create `apps/control-plane/internal/migrations/0022_github_auth.sql`:

```sql
-- 0022: GitHub App auth foundation — an external-identity table so a user can sign in via
-- GitHub (and future providers) without a password, plus a single-row store for the
-- instance-wide GitHub App credentials (secrets AES-GCM-encrypted by the app before insert).
-- Idempotent + monotonic; control-plane only (apps/api frozen at 0010).

-- Passwordless accounts (GitHub-only) carry no password hash.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS user_identities (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    provider_login   TEXT,
    provider_email   TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities (user_id);

-- Single-row instance-wide GitHub App config (mirrors platform_settings).
CREATE TABLE IF NOT EXISTS github_app_settings (
    id                  BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    app_id              TEXT NOT NULL DEFAULT '',
    app_slug            TEXT NOT NULL DEFAULT '',
    client_id           TEXT NOT NULL DEFAULT '',
    client_secret_enc   TEXT NOT NULL DEFAULT '',
    private_key_enc     TEXT NOT NULL DEFAULT '',
    webhook_secret_enc  TEXT NOT NULL DEFAULT '',
    enabled             BOOLEAN NOT NULL DEFAULT FALSE,
    allow_signup        BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO github_app_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Guard `handleLogin` against a NULL password hash**

In `apps/control-plane/internal/server/auth_handlers.go`, change the scan (currently lines 176-183) from:

```go
	var id, hash string
	err := s.pool.QueryRow(r.Context(),
		`SELECT id, password_hash FROM users WHERE email = $1 LIMIT 1`, strings.ToLower(body.Email),
	).Scan(&id, &hash)
	if err == pgx.ErrNoRows || (err == nil && !auth.VerifyPassword(body.Password, hash)) {
		writeError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}
```

to (scan into a nullable `*string`; a NULL/empty hash — i.e. a GitHub-only account — is treated as invalid credentials, not a 500):

```go
	var id string
	var hash *string
	err := s.pool.QueryRow(r.Context(),
		`SELECT id, password_hash FROM users WHERE email = $1 LIMIT 1`, strings.ToLower(body.Email),
	).Scan(&id, &hash)
	if err == pgx.ErrNoRows || (err == nil && (hash == nil || !auth.VerifyPassword(body.Password, *hash))) {
		writeError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}
```

- [ ] **Step 3: Verify the control plane still builds**

Run: `cd apps/control-plane && go build ./... && go vet ./...`
Expected: no output, exit 0. (Migrations are embedded SQL; there is no migration unit test in this repo — verification is a clean build plus the idempotent DDL above, which re-applies safely.)

- [ ] **Step 4: Commit**

```bash
git add apps/control-plane/internal/migrations/0022_github_auth.sql apps/control-plane/internal/server/auth_handlers.go
git commit -m "feat(db): 0022 github auth — identities, nullable password_hash (+ login NULL-hash guard), app settings"
```

---

### Task 2: Signed-token helpers (CSRF state + handoff code)

Pure HMAC helpers used by the login flow. Fully unit-tested (round-trip, expiry, tamper, purpose mismatch).

**Files:**
- Create: `apps/control-plane/internal/server/github_tokens.go`
- Test: `apps/control-plane/internal/server/github_tokens_test.go`

**Interfaces:**
- Produces: `(s *Server) signSignedToken(purpose, data string, ttl time.Duration) string` and `(s *Server) verifySignedToken(purpose, token string) (string, error)` returning `errSignedToken` on any failure. Keyed by `s.cfg.SecretKey`.

- [ ] **Step 1: Write the failing test**

Create `apps/control-plane/internal/server/github_tokens_test.go`:

```go
package server

import (
	"testing"
	"time"

	"github.com/magnetoid/torsor/control-plane/internal/config"
)

func newTokenServer() *Server {
	return &Server{cfg: config.Config{SecretKey: "unit-test-secret-key"}}
}

func TestSignedTokenRoundTrip(t *testing.T) {
	s := newTokenServer()
	tok := s.signSignedToken("state", "nonce-123", time.Minute)
	got, err := s.verifySignedToken("state", tok)
	if err != nil {
		t.Fatalf("verify error: %v", err)
	}
	if got != "nonce-123" {
		t.Errorf("data = %q, want nonce-123", got)
	}
}

func TestSignedTokenExpired(t *testing.T) {
	s := newTokenServer()
	tok := s.signSignedToken("state", "x", -time.Second)
	if _, err := s.verifySignedToken("state", tok); err == nil {
		t.Fatal("expected expiry error, got nil")
	}
}

func TestSignedTokenTampered(t *testing.T) {
	s := newTokenServer()
	tok := s.signSignedToken("state", "x", time.Minute)
	if _, err := s.verifySignedToken("state", tok+"z"); err == nil {
		t.Fatal("expected tamper error, got nil")
	}
}

func TestSignedTokenWrongPurpose(t *testing.T) {
	s := newTokenServer()
	tok := s.signSignedToken("state", "x", time.Minute)
	if _, err := s.verifySignedToken("handoff", tok); err == nil {
		t.Fatal("expected purpose-mismatch error, got nil")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/control-plane && go test ./internal/server/ -run TestSignedToken -v`
Expected: FAIL — compile error, `s.signSignedToken` / `s.verifySignedToken` undefined.

- [ ] **Step 3: Write the implementation**

Create `apps/control-plane/internal/server/github_tokens.go`:

```go
package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"time"
)

// errSignedToken is returned for any invalid, tampered, or expired signed token.
var errSignedToken = errors.New("invalid or expired token")

// signSignedToken binds `data` under `purpose`, authenticated with the platform secret
// (TORSOR_SECRET_KEY) and valid for ttl. Output is URL-safe: base64(msg) + "." + base64(hmac).
func (s *Server) signSignedToken(purpose, data string, ttl time.Duration) string {
	exp := time.Now().Add(ttl).Unix()
	msg := purpose + "\x00" + data + "\x00" + strconv.FormatInt(exp, 10)
	return base64.RawURLEncoding.EncodeToString([]byte(msg)) + "." + s.signHMAC(msg)
}

func (s *Server) signHMAC(msg string) string {
	mac := hmac.New(sha256.New, []byte(s.cfg.SecretKey))
	mac.Write([]byte(msg))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// verifySignedToken checks the signature, purpose, and expiry, returning the bound data.
func (s *Server) verifySignedToken(purpose, token string) (string, error) {
	dot := strings.LastIndexByte(token, '.')
	if dot < 0 {
		return "", errSignedToken
	}
	rawMsg, err := base64.RawURLEncoding.DecodeString(token[:dot])
	if err != nil {
		return "", errSignedToken
	}
	if !hmac.Equal([]byte(token[dot+1:]), []byte(s.signHMAC(string(rawMsg)))) {
		return "", errSignedToken
	}
	parts := strings.Split(string(rawMsg), "\x00")
	if len(parts) != 3 || parts[0] != purpose {
		return "", errSignedToken
	}
	exp, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return "", errSignedToken
	}
	return parts[1], nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/control-plane && go test ./internal/server/ -run TestSignedToken -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/control-plane/internal/server/github_tokens.go apps/control-plane/internal/server/github_tokens_test.go
git commit -m "feat(auth): signed HMAC token helpers for GitHub CSRF state + handoff"
```

---

### Task 3: Account-resolution decision (pure)

The branch logic from the spec (existing identity → link-by-verified-email → signup → denied), factored out so the DB lookups stay in the handler but the decision is unit-tested.

**Files:**
- Create: `apps/control-plane/internal/server/github_account.go`
- Test: `apps/control-plane/internal/server/github_account_test.go`

**Interfaces:**
- Produces: `type ghAction int` with `ghUseUser`, `ghLinkExisting`, `ghSignup`, `ghDenied`; and `decideGitHubAccount(identityUserID, emailUserID string, allowSignup bool) (ghAction, string)` returning the action and the target user id (empty for signup/denied).

- [ ] **Step 1: Write the failing test**

Create `apps/control-plane/internal/server/github_account_test.go`:

```go
package server

import "testing"

func TestDecideGitHubAccount(t *testing.T) {
	cases := []struct {
		name         string
		identityUser string
		emailUser    string
		allowSignup  bool
		wantAction   ghAction
		wantUser     string
	}{
		{"existing identity wins", "u1", "u2", true, ghUseUser, "u1"},
		{"link by verified email", "", "u2", true, ghLinkExisting, "u2"},
		{"new signup when allowed", "", "", true, ghSignup, ""},
		{"denied when signup off", "", "", false, ghDenied, ""},
		{"identity beats signup-off", "u1", "", false, ghUseUser, "u1"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			act, user := decideGitHubAccount(c.identityUser, c.emailUser, c.allowSignup)
			if act != c.wantAction || user != c.wantUser {
				t.Errorf("got (%d, %q), want (%d, %q)", act, user, c.wantAction, c.wantUser)
			}
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/control-plane && go test ./internal/server/ -run TestDecideGitHubAccount -v`
Expected: FAIL — `decideGitHubAccount` / `ghAction` undefined.

- [ ] **Step 3: Write the implementation**

Create `apps/control-plane/internal/server/github_account.go`:

```go
package server

// ghAction is the account resolution outcome for a GitHub login callback.
type ghAction int

const (
	ghUseUser      ghAction = iota // an existing user_identities row matched
	ghLinkExisting                 // no identity, but a verified email matched a user
	ghSignup                       // no match; create a new account (allow_signup on)
	ghDenied                       // no match and signups disabled
)

// decideGitHubAccount picks the outcome given the results of the two DB lookups
// (identity match, verified-email match) and the allow_signup flag. Pure — no I/O.
func decideGitHubAccount(identityUserID, emailUserID string, allowSignup bool) (ghAction, string) {
	if identityUserID != "" {
		return ghUseUser, identityUserID
	}
	if emailUserID != "" {
		return ghLinkExisting, emailUserID
	}
	if allowSignup {
		return ghSignup, ""
	}
	return ghDenied, ""
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/control-plane && go test ./internal/server/ -run TestDecideGitHubAccount -v`
Expected: PASS (5 subtests).

- [ ] **Step 5: Commit**

```bash
git add apps/control-plane/internal/server/github_account.go apps/control-plane/internal/server/github_account_test.go
git commit -m "feat(auth): pure account-resolution decision for GitHub login"
```

---

### Task 4: GitHub API client (raw HTTP, swappable base)

Fetches the authenticated user and their primary verified email. Tested against an `httptest` server via a package-level base-URL var (the repo's `dockerHubBase` pattern).

**Files:**
- Create: `apps/control-plane/internal/server/github_client.go`
- Test: `apps/control-plane/internal/server/github_client_test.go`

**Interfaces:**
- Produces: `githubAPIBase` (package var, default `https://api.github.com`); `type githubUser struct { ID int64; Login, AvatarURL, Email string }`; `fetchGitHubUser(ctx context.Context, hc *http.Client) (*githubUser, error)`; `fetchGitHubPrimaryVerifiedEmail(ctx context.Context, hc *http.Client) (string, error)` (returns `errNoVerifiedEmail` if none).

- [ ] **Step 1: Write the failing test**

Create `apps/control-plane/internal/server/github_client_test.go`:

```go
package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchGitHubUserAndEmail(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/user":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":42,"login":"octocat","avatar_url":"https://a/x.png","email":null}`))
		case "/user/emails":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"email":"old@x.com","primary":false,"verified":true},
				{"email":"octo@x.com","primary":true,"verified":true},
				{"email":"nope@x.com","primary":false,"verified":false}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	old := githubAPIBase
	githubAPIBase = srv.URL
	defer func() { githubAPIBase = old }()

	u, err := fetchGitHubUser(t.Context(), srv.Client())
	if err != nil {
		t.Fatalf("fetchGitHubUser: %v", err)
	}
	if u.ID != 42 || u.Login != "octocat" {
		t.Errorf("user = %+v, want id 42 login octocat", u)
	}

	email, err := fetchGitHubPrimaryVerifiedEmail(t.Context(), srv.Client())
	if err != nil {
		t.Fatalf("fetchGitHubPrimaryVerifiedEmail: %v", err)
	}
	if email != "octo@x.com" {
		t.Errorf("email = %q, want octo@x.com (primary+verified)", email)
	}
}

func TestFetchGitHubEmailNoneVerified(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[{"email":"x@x.com","primary":true,"verified":false}]`))
	}))
	defer srv.Close()
	old := githubAPIBase
	githubAPIBase = srv.URL
	defer func() { githubAPIBase = old }()

	if _, err := fetchGitHubPrimaryVerifiedEmail(t.Context(), srv.Client()); err != errNoVerifiedEmail {
		t.Fatalf("err = %v, want errNoVerifiedEmail", err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/control-plane && go test ./internal/server/ -run TestFetchGitHub -v`
Expected: FAIL — `githubAPIBase` / `fetchGitHubUser` / `errNoVerifiedEmail` undefined.

- [ ] **Step 3: Write the implementation**

Create `apps/control-plane/internal/server/github_client.go`:

```go
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

// githubAPIBase is the GitHub REST base. Overridden in tests to point at an httptest server.
var githubAPIBase = "https://api.github.com"

// errNoVerifiedEmail means the account exposed no primary, verified email address.
var errNoVerifiedEmail = errors.New("github: no primary verified email")

type githubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
	Email     string `json:"email"`
}

type githubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

func githubGet(ctx context.Context, hc *http.Client, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubAPIBase+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("github %s: status %d: %s", path, resp.StatusCode, string(body))
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// fetchGitHubUser returns the authenticated user for the given (token-bearing) client.
func fetchGitHubUser(ctx context.Context, hc *http.Client) (*githubUser, error) {
	var u githubUser
	if err := githubGet(ctx, hc, "/user", &u); err != nil {
		return nil, err
	}
	return &u, nil
}

// fetchGitHubPrimaryVerifiedEmail returns the account's primary, verified email.
func fetchGitHubPrimaryVerifiedEmail(ctx context.Context, hc *http.Client) (string, error) {
	var emails []githubEmail
	if err := githubGet(ctx, hc, "/user/emails", &emails); err != nil {
		return "", err
	}
	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	return "", errNoVerifiedEmail
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/control-plane && go test ./internal/server/ -run TestFetchGitHub -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/control-plane/internal/server/github_client.go apps/control-plane/internal/server/github_client_test.go
git commit -m "feat(auth): GitHub REST client for /user + primary verified email"
```

---

### Task 5: Super-admin GitHub settings — merge helper, handlers, routes

Storage struct + a pure `applyGitHubPatch` merge (unit-tested: partial update preserves unset secrets), then GET/PATCH handlers mirroring `admin_platform_handlers.go`, wired into the super-admin route group.

**Files:**
- Create: `apps/control-plane/internal/server/github_settings_handlers.go`
- Test: `apps/control-plane/internal/server/github_settings_test.go`
- Modify: `apps/control-plane/internal/server/server.go` (register two routes in the `requireRole(auth.RoleSuperAdmin)` group)

**Interfaces:**
- Consumes: `s.secretCipher()`, `secrets.ErrDisabled`, `s.cfg.AppURL`.
- Produces: `githubSettingsRow` (raw column values incl. encrypted secrets); `githubSettingsPatch` (pointer fields); `applyGitHubPatch(cur githubSettingsRow, p githubSettingsPatch, encrypt func(string) (string, error)) (githubSettingsRow, error)`; handlers `handleGetGitHubSettings`, `handleUpdateGitHubSettings`; internal `loadGitHubConfig(ctx) (*githubConfig, error)` where `githubConfig{ClientID, ClientSecret string; Enabled, AllowSignup bool}`.

- [ ] **Step 1: Write the failing test (merge logic)**

Create `apps/control-plane/internal/server/github_settings_test.go`:

```go
package server

import "testing"

// encrypt fake: prefixes so we can assert what got "encrypted".
func fakeEncrypt(s string) (string, error) { return "enc:" + s, nil }

func TestApplyGitHubPatch_SetsAndEncrypts(t *testing.T) {
	cur := githubSettingsRow{}
	appID := "123"
	secret := "shhh"
	enabled := true
	next, err := applyGitHubPatch(cur, githubSettingsPatch{
		AppID:        &appID,
		ClientSecret: &secret,
		Enabled:      &enabled,
	}, fakeEncrypt)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if next.AppID != "123" {
		t.Errorf("appID = %q", next.AppID)
	}
	if next.ClientSecretEnc != "enc:shhh" {
		t.Errorf("clientSecretEnc = %q, want enc:shhh", next.ClientSecretEnc)
	}
	if !next.Enabled {
		t.Errorf("enabled not set")
	}
}

func TestApplyGitHubPatch_PreservesUnsetSecrets(t *testing.T) {
	cur := githubSettingsRow{ClientSecretEnc: "enc:existing", PrivateKeyEnc: "enc:key"}
	empty := "" // explicit empty must NOT wipe an existing secret
	appSlug := "my-app"
	next, err := applyGitHubPatch(cur, githubSettingsPatch{
		AppSlug:      &appSlug,
		ClientSecret: &empty,
	}, fakeEncrypt)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if next.ClientSecretEnc != "enc:existing" {
		t.Errorf("secret wiped: %q", next.ClientSecretEnc)
	}
	if next.PrivateKeyEnc != "enc:key" {
		t.Errorf("private key changed: %q", next.PrivateKeyEnc)
	}
	if next.AppSlug != "my-app" {
		t.Errorf("appSlug = %q", next.AppSlug)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/control-plane && go test ./internal/server/ -run TestApplyGitHubPatch -v`
Expected: FAIL — `githubSettingsRow` / `applyGitHubPatch` undefined.

- [ ] **Step 3: Write the implementation (types, merge, handlers, config loader)**

Create `apps/control-plane/internal/server/github_settings_handlers.go`:

```go
package server

import (
	"context"
	"errors"
	"net/http"

	"github.com/magnetoid/torsor/control-plane/internal/secrets"
)

// githubSettingsRow mirrors the github_app_settings columns (secrets stored encrypted).
type githubSettingsRow struct {
	AppID            string
	AppSlug          string
	ClientID         string
	ClientSecretEnc  string
	PrivateKeyEnc    string
	WebhookSecretEnc string
	Enabled          bool
	AllowSignup      bool
}

// githubSettingsPatch is the PATCH body; nil pointer = field not provided.
type githubSettingsPatch struct {
	AppID         *string `json:"appId"`
	AppSlug       *string `json:"appSlug"`
	ClientID      *string `json:"clientId"`
	ClientSecret  *string `json:"clientSecret"`
	PrivateKey    *string `json:"privateKey"`
	WebhookSecret *string `json:"webhookSecret"`
	Enabled       *bool   `json:"enabled"`
	AllowSignup   *bool   `json:"allowSignup"`
}

// githubSettingsResponse is the masked GET/PATCH response — never exposes secret values.
type githubSettingsResponse struct {
	AppID            string `json:"appId"`
	AppSlug          string `json:"appSlug"`
	ClientID         string `json:"clientId"`
	ClientSecretSet  bool   `json:"clientSecretSet"`
	PrivateKeySet    bool   `json:"privateKeySet"`
	WebhookSecretSet bool   `json:"webhookSecretSet"`
	Enabled          bool   `json:"enabled"`
	AllowSignup      bool   `json:"allowSignup"`
	CallbackURL      string `json:"callbackUrl"`
}

// githubConfig is the decrypted subset the login flow needs.
type githubConfig struct {
	ClientID     string
	ClientSecret string
	Enabled      bool
	AllowSignup  bool
}

// applyGitHubPatch merges a patch onto the current row. Non-secret fields are set when the
// pointer is non-nil; secret fields are (re)encrypted only when a non-empty value is supplied,
// so saving other fields — or sending "" — never wipes an existing secret. Pure (encrypt injected).
func applyGitHubPatch(cur githubSettingsRow, p githubSettingsPatch, encrypt func(string) (string, error)) (githubSettingsRow, error) {
	if p.AppID != nil {
		cur.AppID = *p.AppID
	}
	if p.AppSlug != nil {
		cur.AppSlug = *p.AppSlug
	}
	if p.ClientID != nil {
		cur.ClientID = *p.ClientID
	}
	if p.Enabled != nil {
		cur.Enabled = *p.Enabled
	}
	if p.AllowSignup != nil {
		cur.AllowSignup = *p.AllowSignup
	}
	for _, sec := range []struct {
		val *string
		dst *string
	}{
		{p.ClientSecret, &cur.ClientSecretEnc},
		{p.PrivateKey, &cur.PrivateKeyEnc},
		{p.WebhookSecret, &cur.WebhookSecretEnc},
	} {
		if sec.val != nil && *sec.val != "" {
			enc, err := encrypt(*sec.val)
			if err != nil {
				return cur, err
			}
			*sec.dst = enc
		}
	}
	return cur, nil
}

func (r githubSettingsRow) toResponse(callbackURL string) githubSettingsResponse {
	return githubSettingsResponse{
		AppID:            r.AppID,
		AppSlug:          r.AppSlug,
		ClientID:         r.ClientID,
		ClientSecretSet:  r.ClientSecretEnc != "",
		PrivateKeySet:    r.PrivateKeyEnc != "",
		WebhookSecretSet: r.WebhookSecretEnc != "",
		Enabled:          r.Enabled,
		AllowSignup:      r.AllowSignup,
		CallbackURL:      callbackURL,
	}
}

func (s *Server) githubCallbackURL() string {
	return s.cfg.AppURL + "/api/v1/auth/github/callback"
}

func (s *Server) loadGitHubSettingsRow(ctx context.Context) (githubSettingsRow, error) {
	var row githubSettingsRow
	err := s.pool.QueryRow(ctx,
		`SELECT app_id, app_slug, client_id, client_secret_enc, private_key_enc,
		        webhook_secret_enc, enabled, allow_signup
		   FROM github_app_settings WHERE id = TRUE`).
		Scan(&row.AppID, &row.AppSlug, &row.ClientID, &row.ClientSecretEnc,
			&row.PrivateKeyEnc, &row.WebhookSecretEnc, &row.Enabled, &row.AllowSignup)
	return row, err
}

func (s *Server) handleGetGitHubSettings(w http.ResponseWriter, r *http.Request) {
	row, err := s.loadGitHubSettingsRow(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, row.toResponse(s.githubCallbackURL()))
}

func (s *Server) handleUpdateGitHubSettings(w http.ResponseWriter, r *http.Request) {
	var patch githubSettingsPatch
	if err := decodeJSON(r, &patch); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	cipher, err := s.secretCipher()
	if err != nil {
		if errors.Is(err, secrets.ErrDisabled) {
			writeError(w, http.StatusServiceUnavailable, "Secret storage is not configured (set TORSOR_SECRET_KEY)")
			return
		}
		s.fail(w, r, err)
		return
	}
	cur, err := s.loadGitHubSettingsRow(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	next, err := applyGitHubPatch(cur, patch, cipher.Encrypt)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if _, err := s.pool.Exec(r.Context(),
		`UPDATE github_app_settings
		    SET app_id = $1, app_slug = $2, client_id = $3, client_secret_enc = $4,
		        private_key_enc = $5, webhook_secret_enc = $6, enabled = $7,
		        allow_signup = $8, updated_at = NOW()
		  WHERE id = TRUE`,
		next.AppID, next.AppSlug, next.ClientID, next.ClientSecretEnc,
		next.PrivateKeyEnc, next.WebhookSecretEnc, next.Enabled, next.AllowSignup); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, next.toResponse(s.githubCallbackURL()))
}

// loadGitHubConfig returns the decrypted client credentials + flags for the login flow.
func (s *Server) loadGitHubConfig(ctx context.Context) (*githubConfig, error) {
	row, err := s.loadGitHubSettingsRow(ctx)
	if err != nil {
		return nil, err
	}
	cfg := &githubConfig{ClientID: row.ClientID, Enabled: row.Enabled, AllowSignup: row.AllowSignup}
	if row.ClientSecretEnc != "" {
		cipher, err := s.secretCipher()
		if err != nil {
			return nil, err
		}
		if cfg.ClientSecret, err = cipher.Decrypt(row.ClientSecretEnc); err != nil {
			return nil, err
		}
	}
	return cfg, nil
}
```

- [ ] **Step 4: Register the routes**

In `apps/control-plane/internal/server/server.go`, inside the existing `r.Group(func(r chi.Router) { r.Use(s.requireRole(auth.RoleSuperAdmin)); … })` block, add alongside the other `/admin/*` routes:

```go
				r.Get("/admin/github-settings", s.handleGetGitHubSettings)
				r.Patch("/admin/github-settings", s.handleUpdateGitHubSettings)
```

- [ ] **Step 5: Run tests + build**

Run: `cd apps/control-plane && go test ./internal/server/ -run TestApplyGitHubPatch -v && go build ./... && go vet ./...`
Expected: merge tests PASS; build + vet clean.

- [ ] **Step 6: Commit**

```bash
git add apps/control-plane/internal/server/github_settings_handlers.go apps/control-plane/internal/server/github_settings_test.go apps/control-plane/internal/server/server.go
git commit -m "feat(admin): super-admin GitHub App settings (encrypted, masked, super-admin-gated)"
```

---

### Task 6: Login handlers + OAuth + routes

The three login endpoints plus the public providers probe. Uses Tasks 2–5. Adds `golang.org/x/oauth2` as a direct dependency. DB-touching handlers are verified by build + the already-tested helpers (repo idiom).

**Files:**
- Create: `apps/control-plane/internal/server/github_auth_handlers.go`
- Modify: `apps/control-plane/internal/server/server.go` (public routes)
- Modify: `apps/control-plane/go.mod` / `go.sum` (promote oauth2 to direct)

**Interfaces:**
- Consumes: `s.loadGitHubConfig`, `s.signSignedToken`/`s.verifySignedToken`, `decideGitHubAccount`, `fetchGitHubUser`/`fetchGitHubPrimaryVerifiedEmail`, `s.issueAuthResponse`, `s.githubCallbackURL`, `randHex`, `slugify`, `s.cfg.AppURL`.
- Produces: `handleGitHubLoginStart`, `handleGitHubCallback`, `handleGitHubExchange`, `handleAuthProviders`.

- [ ] **Step 1: Add the oauth2 dependency**

Run:
```bash
cd apps/control-plane
go get golang.org/x/oauth2@v0.35.0
go get golang.org/x/oauth2/github@v0.35.0
```
Expected: `go.mod` now lists `golang.org/x/oauth2 v0.35.0` in the direct `require` block (the `// indirect` comment on that line is removed).

- [ ] **Step 2: Write the login handlers**

Create `apps/control-plane/internal/server/github_auth_handlers.go`:

```go
package server

import (
	"net/http"
	"time"

	"golang.org/x/oauth2"
	githuboauth "golang.org/x/oauth2/github"
)

// NOTE: Step 3 adds "context", "errors", "strconv", and "strings" to this import block.

const (
	ghStatePurpose   = "gh_state"
	ghHandoffPurpose = "gh_handoff"
	ghStateTTL       = 10 * time.Minute
	ghHandoffTTL     = 60 * time.Second
)

// redirectLogin sends the browser back to the SPA login page with an error code.
func (s *Server) redirectLogin(w http.ResponseWriter, r *http.Request, reason string) {
	http.Redirect(w, r, s.cfg.AppURL+"/login?error="+reason, http.StatusFound)
}

func (s *Server) githubOAuthConfig(cfg *githubConfig) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		Endpoint:     githuboauth.Endpoint,
		RedirectURL:  s.githubCallbackURL(),
	}
}

// githubEnabled reports whether GitHub login is usable (configured + secret storage on).
func (s *Server) githubLoginConfig(r *http.Request) (*githubConfig, bool) {
	if s.cfg.SecretKey == "" {
		return nil, false
	}
	cfg, err := s.loadGitHubConfig(r.Context())
	if err != nil || !cfg.Enabled || cfg.ClientID == "" || cfg.ClientSecret == "" {
		return nil, false
	}
	return cfg, true
}

// GET /api/v1/auth/providers — public probe so the login page knows whether to show the button.
func (s *Server) handleAuthProviders(w http.ResponseWriter, r *http.Request) {
	_, ok := s.githubLoginConfig(r)
	writeJSON(w, http.StatusOK, map[string]any{"github": map[string]bool{"enabled": ok}})
}

// GET /api/v1/auth/github — start the OAuth dance.
func (s *Server) handleGitHubLoginStart(w http.ResponseWriter, r *http.Request) {
	cfg, ok := s.githubLoginConfig(r)
	if !ok {
		s.redirectLogin(w, r, "github_unavailable")
		return
	}
	state := s.signSignedToken(ghStatePurpose, randHex(16), ghStateTTL)
	http.Redirect(w, r, s.githubOAuthConfig(cfg).AuthCodeURL(state), http.StatusFound)
}

// GET /api/v1/auth/github/callback — exchange code, resolve account, hand off.
func (s *Server) handleGitHubCallback(w http.ResponseWriter, r *http.Request) {
	cfg, ok := s.githubLoginConfig(r)
	if !ok {
		s.redirectLogin(w, r, "github_unavailable")
		return
	}
	if _, err := s.verifySignedToken(ghStatePurpose, r.URL.Query().Get("state")); err != nil {
		s.redirectLogin(w, r, "state")
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		s.redirectLogin(w, r, "exchange_failed")
		return
	}
	oc := s.githubOAuthConfig(cfg)
	tok, err := oc.Exchange(r.Context(), code)
	if err != nil {
		s.redirectLogin(w, r, "exchange_failed")
		return
	}
	hc := oc.Client(r.Context(), tok)

	ghUser, err := fetchGitHubUser(r.Context(), hc)
	if err != nil {
		s.redirectLogin(w, r, "exchange_failed")
		return
	}
	email, err := fetchGitHubPrimaryVerifiedEmail(r.Context(), hc)
	if err != nil {
		s.redirectLogin(w, r, "email_unverified")
		return
	}

	userID, err := s.resolveGitHubUser(r, ghUser, email, cfg.AllowSignup)
	if err == errSignupDisabled {
		s.redirectLogin(w, r, "signups_disabled")
		return
	} else if err != nil {
		s.fail(w, r, err)
		return
	}

	handoff := s.signSignedToken(ghHandoffPurpose, userID, ghHandoffTTL)
	http.Redirect(w, r, s.cfg.AppURL+"/auth/callback?code="+handoff, http.StatusFound)
}

// POST /api/v1/auth/github/exchange — swap the handoff code for a real session + JWT.
func (s *Server) handleGitHubExchange(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code string `json:"code"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	userID, err := s.verifySignedToken(ghHandoffPurpose, body.Code)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid or expired code")
		return
	}
	resp, err := s.issueAuthResponse(r.Context(), userID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}
```

- [ ] **Step 3: Write the account resolver (DB lookups + create), same file**

Append to `github_auth_handlers.go`:

```go
import "errors" // add to the existing import block

var errSignupDisabled = errors.New("github signups disabled")

// resolveGitHubUser runs the two lookups, applies decideGitHubAccount, and performs the
// resulting DB writes, returning the resolved Torsor user id.
func (s *Server) resolveGitHubUser(r *http.Request, gh *githubUser, email string, allowSignup bool) (string, error) {
	ctx := r.Context()
	providerUserID := strconv.FormatInt(gh.ID, 10)

	var identityUser string
	_ = s.pool.QueryRow(ctx,
		`SELECT user_id FROM user_identities WHERE provider = 'github' AND provider_user_id = $1`,
		providerUserID).Scan(&identityUser)

	var emailUser string
	if identityUser == "" {
		_ = s.pool.QueryRow(ctx,
			`SELECT id FROM users WHERE email = LOWER($1) LIMIT 1`, email).Scan(&emailUser)
	}

	action, target := decideGitHubAccount(identityUser, emailUser, allowSignup)
	switch action {
	case ghUseUser:
		return target, nil
	case ghLinkExisting:
		if err := s.linkGitHubIdentity(ctx, target, gh, email); err != nil {
			return "", err
		}
		return target, nil
	case ghSignup:
		id, err := s.createGitHubUser(ctx, gh, email)
		if err != nil {
			return "", err
		}
		if err := s.linkGitHubIdentity(ctx, id, gh, email); err != nil {
			return "", err
		}
		return id, nil
	default:
		return "", errSignupDisabled
	}
}

func (s *Server) linkGitHubIdentity(ctx context.Context, userID string, gh *githubUser, email string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO user_identities (user_id, provider, provider_user_id, provider_login, provider_email)
		 VALUES ($1, 'github', $2, $3, $4)
		 ON CONFLICT (provider, provider_user_id) DO NOTHING`,
		userID, strconv.FormatInt(gh.ID, 10), gh.Login, email)
	return err
}

// createGitHubUser inserts a passwordless user + personal team, mirroring handleSignup.
func (s *Server) createGitHubUser(ctx context.Context, gh *githubUser, email string) (string, error) {
	username := slugify(gh.Login, email) + "-" + randHex(3)
	role := "user"
	for _, e := range s.cfg.SuperAdminEmails {
		if e == strings.ToLower(email) {
			role = "super_admin"
			break
		}
	}
	var avatar *string
	if gh.AvatarURL != "" {
		avatar = &gh.AvatarURL
	}
	var id string
	if err := s.pool.QueryRow(ctx,
		`INSERT INTO users (email, username, avatar_url, role) VALUES (LOWER($1), $2, $3, $4) RETURNING id`,
		email, username, avatar, role).Scan(&id); err != nil {
		return "", err
	}
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO teams (name, slug, owner_id) VALUES ($1, $2, $3)`,
		"Personal Workspace", "personal-"+id[:8], id); err != nil {
		return "", err
	}
	return id, nil
}
```

Note: add `"context"` and `"strings"` to the import block (used above). The final import block is: `"context"`, `"errors"`, `"net/http"`, `"strconv"`, `"strings"`, `"time"`, `"golang.org/x/oauth2"`, `githuboauth "golang.org/x/oauth2/github"`.

- [ ] **Step 4: Register the public routes**

In `server.go`, inside the stricter-rate-limited auth `r.Group` (the one with `r.Post("/auth/signup", …)` and `r.Post("/auth/login", …)`), add:

```go
			r.Get("/auth/github", s.handleGitHubLoginStart)
			r.Get("/auth/github/callback", s.handleGitHubCallback)
			r.Post("/auth/github/exchange", s.handleGitHubExchange)
```

And in the outer public group (alongside `r.Get("/config", s.handleConfig)`), add:

```go
		r.Get("/auth/providers", s.handleAuthProviders)
```

- [ ] **Step 5: Build, vet, test**

Run: `cd apps/control-plane && go build ./... && go vet ./... && go test ./internal/server/ -v`
Expected: clean build + vet; all `internal/server` tests PASS (including Tasks 2–4 helpers). If `go vet` flags an unused import, reconcile the import block per the note in Step 3.

- [ ] **Step 6: Commit**

```bash
git add apps/control-plane/internal/server/github_auth_handlers.go apps/control-plane/internal/server/server.go apps/control-plane/go.mod apps/control-plane/go.sum
git commit -m "feat(auth): Sign in with GitHub — start/callback/exchange + providers probe"
```

---

### Task 7: Frontend — authStore wiring + providers helper + login button

**Files:**
- Modify: `src/stores/authStore.ts` (replace `loginWithGitHub` stub)
- Modify: `src/lib/api.ts` (add `apiGetAuthProviders`, `apiGitHubExchange`)
- Modify: `src/pages/AuthPage.tsx` (render the button when enabled)
- Test: `src/stores/authStore.githubLogin.test.ts`

**Interfaces:**
- Consumes: `apiRequest`, `setStoredToken`, `normalizeUser`, `AuthResponse`.
- Produces: `authStore.loginWithGitHub()` (redirects to `/api/v1/auth/github`); `apiGetAuthProviders(): Promise<{ github: { enabled: boolean } }>`; `apiGitHubExchange(code): Promise<AuthResponse>`.

- [ ] **Step 1: Write the failing test**

Create `src/stores/authStore.githubLogin.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './authStore';

describe('loginWithGitHub', () => {
  beforeEach(() => {
    // jsdom: make location.href assignable and observable
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  });

  it('redirects the browser to the backend GitHub start endpoint', async () => {
    await useAuthStore.getState().loginWithGitHub();
    expect(window.location.href).toContain('/api/v1/auth/github');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- authStore.githubLogin`
Expected: FAIL — the stub throws `GitHub auth is not wired yet in Phase 2`.

- [ ] **Step 3: Implement the store action**

In `src/stores/authStore.ts`, replace the stub:

```ts
      loginWithGitHub: async () => {
        window.location.href = `${API_URL}/api/v1/auth/github`;
      },
```

If `API_URL` is not already imported in `authStore.ts`, import it from `../lib/api` (it is exported there and defaults to empty string so same-origin `/api/v1/...` works in prod). If the store only needs the relative path, `window.location.href = '/api/v1/auth/github';` is equivalent in the same-origin prod setup — prefer the `API_URL` form for parity with `apiRequest`.

- [ ] **Step 4: Add the API helpers**

In `src/lib/api.ts`, add near the other endpoint helpers:

```ts
export async function apiGetAuthProviders(): Promise<{ github: { enabled: boolean } }> {
  return apiRequest<{ github: { enabled: boolean } }>('/api/v1/auth/providers');
}

export async function apiGitHubExchange(code: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/api/v1/auth/github/exchange', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}
```

If `AuthResponse` is not exported from `api.ts`, import it from the shared types the auth store uses (it references `AuthResponse` in `apiRequest<AuthResponse>` in `loginWithEmail`), or define it locally as `{ token: string; user: any }` — match the existing `AuthResponse` shape (`{ token, user }`).

- [ ] **Step 5: Render the button in AuthPage**

In `src/pages/AuthPage.tsx`:

1. Extend the store destructure (currently `const { loginWithEmail, signup, isLoading, error, clearError } = useAuthStore();`) to include `loginWithGitHub`.
2. Add provider state + effect at the top of the component:

```tsx
  const [githubEnabled, setGithubEnabled] = useState(false);
  useEffect(() => {
    apiGetAuthProviders()
      .then((p) => setGithubEnabled(p.github.enabled))
      .catch(() => setGithubEnabled(false));
  }, []);
```

3. Import `apiGetAuthProviders` from `../lib/api` and `Github` from `lucide-react`.
4. Inside `<motion.div className="space-y-6">`, immediately **below** the `</form>`, add:

```tsx
            {githubEnabled && (
              <>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-default" />
                  <span className="text-xs text-tertiary uppercase tracking-wider">or</span>
                  <div className="h-px flex-1 bg-default" />
                </div>
                <button
                  type="button"
                  onClick={() => void loginWithGitHub()}
                  className="w-full h-11 bg-surface hover:bg-elevated border border-default text-primary rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                >
                  <Github size={18} />
                  Continue with GitHub
                </button>
              </>
            )}
```

- [ ] **Step 6: Run tests + lint**

Run: `npm test -- authStore.githubLogin && npm run lint:frontend`
Expected: test PASS; `tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
git add src/stores/authStore.ts src/lib/api.ts src/pages/AuthPage.tsx src/stores/authStore.githubLogin.test.ts
git commit -m "feat(web): wire loginWithGitHub + providers-gated Continue with GitHub button"
```

---

### Task 8: Frontend — GitHub callback page + route

**Files:**
- Create: `src/pages/GitHubCallbackPage.tsx`
- Modify: `src/App.tsx` (register `/auth/callback` as a public route)
- Modify: `src/stores/authStore.ts` (add `completeGitHubLogin(code)` action)
- Test: `src/stores/authStore.githubCallback.test.ts`

**Interfaces:**
- Consumes: `apiGitHubExchange`, `setStoredToken`, `normalizeUser`.
- Produces: `authStore.completeGitHubLogin(code: string): Promise<void>` (mirrors `loginWithEmail`'s success path); `GitHubCallbackPage`.

- [ ] **Step 1: Write the failing test**

Create `src/stores/authStore.githubCallback.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../lib/api';
import { useAuthStore } from './authStore';

describe('completeGitHubLogin', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('exchanges the code, stores the token, and marks authenticated', async () => {
    vi.spyOn(api, 'apiGitHubExchange').mockResolvedValue({
      token: 'jwt-abc',
      user: { id: 'u1', email: 'a@b.com', username: 'a', name: 'a', role: 'user', onboarded: true, createdAt: '' },
    } as any);

    await useAuthStore.getState().completeGitHubLogin('handoff-code');

    expect(api.apiGitHubExchange).toHaveBeenCalledWith('handoff-code');
    expect(localStorage.getItem('torsor-auth-token')).toBe('jwt-abc');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe('u1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- authStore.githubCallback`
Expected: FAIL — `completeGitHubLogin` is not a function.

- [ ] **Step 3: Add the store action**

In `src/stores/authStore.ts`, add alongside `loginWithEmail` (and declare it in the store's TypeScript interface next to `loginWithGitHub`):

```ts
      completeGitHubLogin: async (code: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiGitHubExchange(code);
          setStoredToken(response.token);
          set({
            user: normalizeUser(response.user),
            token: response.token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'GitHub login failed' });
          throw error;
        }
      },
```

Import `apiGitHubExchange` from `../lib/api` at the top of `authStore.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- authStore.githubCallback`
Expected: PASS.

- [ ] **Step 5: Create the callback page**

Create `src/pages/GitHubCallbackPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

const ERROR_MESSAGES: Record<string, string> = {
  github_unavailable: 'GitHub sign-in is not available right now.',
  state: 'Your sign-in session expired. Please try again.',
  email_unverified: 'Your GitHub account has no verified primary email.',
  signups_disabled: 'New sign-ups via GitHub are currently disabled.',
  exchange_failed: 'Could not complete GitHub sign-in. Please try again.',
};

export function GitHubCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const completeGitHubLogin = useAuthStore((s) => s.completeGitHubLogin);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errParam = params.get('error');
    if (errParam) {
      setError(ERROR_MESSAGES[errParam] ?? 'GitHub sign-in failed.');
      return;
    }
    const code = params.get('code');
    if (!code) {
      setError('Missing sign-in code.');
      return;
    }
    completeGitHubLogin(code)
      .then(() => navigate('/', { replace: true }))
      .catch(() => setError('Could not complete GitHub sign-in. Please try again.'));
  }, [params, completeGitHubLogin, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      {error ? (
        <div className="w-full max-w-sm bg-surface border border-default rounded-xl p-8 text-center space-y-4">
          <p className="text-sm text-error">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="w-full h-11 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold text-sm transition-all"
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-secondary">
          <Loader2 size={18} className="animate-spin" /> Signing you in…
        </div>
      )}
    </div>
  );
}
```

Note: `navigate('/')` lets the app's normal `ProtectedRoute`/onboarding logic route the now-authenticated user onward (respecting `onboarded`), so no onboarding branch is needed here.

- [ ] **Step 6: Register the route**

In `src/App.tsx`: import `import { GitHubCallbackPage } from './pages/GitHubCallbackPage';`, and add inside `<Routes>` (model on the `/login` block):

```tsx
          <Route
            path="/auth/callback"
            element={
              <ErrorBoundary name="GitHubCallback">
                <PublicRoute>
                  <GitHubCallbackPage />
                </PublicRoute>
              </ErrorBoundary>
            }
          />
```

- [ ] **Step 7: Lint + test**

Run: `npm run lint:frontend && npm test -- authStore.githubCallback`
Expected: `tsc --noEmit` clean; test PASS.

- [ ] **Step 8: Commit**

```bash
git add src/pages/GitHubCallbackPage.tsx src/App.tsx src/stores/authStore.ts src/stores/authStore.githubCallback.test.ts
git commit -m "feat(web): GitHub OAuth callback page + handoff-code exchange"
```

---

### Task 9: Frontend — super-admin GitHub settings tab

**Files:**
- Create: `src/components/admin/tabs/AdminGitHubTab.tsx`
- Modify: `src/stores/adminStore.ts` (add `githubSettings` state + `fetchGitHubSettings` + `saveGitHubSettings`)
- Modify: `src/lib/api.ts` (add `apiGetGitHubSettings`, `apiUpdateGitHubSettings`)
- Modify: `src/components/admin/AdminLayout.tsx` (add nav item)
- Modify: `src/pages/AdminPage.tsx` (add switch case + import)

**Interfaces:**
- Consumes: `apiRequest` (auth), `useAdminStore`.
- Produces: `GitHubSettings` type `{ appId, appSlug, clientId, clientSecretSet, privateKeySet, webhookSecretSet, enabled, allowSignup, callbackUrl }`; store `githubSettings`, `fetchGitHubSettings()`, `saveGitHubSettings(patch)`; `AdminGitHubTab`.

- [ ] **Step 1: Add the API helpers**

In `src/lib/api.ts`:

```ts
export interface GitHubSettings {
  appId: string;
  appSlug: string;
  clientId: string;
  clientSecretSet: boolean;
  privateKeySet: boolean;
  webhookSecretSet: boolean;
  enabled: boolean;
  allowSignup: boolean;
  callbackUrl: string;
}

export interface GitHubSettingsPatch {
  appId?: string;
  appSlug?: string;
  clientId?: string;
  clientSecret?: string;
  privateKey?: string;
  webhookSecret?: string;
  enabled?: boolean;
  allowSignup?: boolean;
}

export async function apiGetGitHubSettings(): Promise<GitHubSettings> {
  return apiRequest<GitHubSettings>('/api/v1/admin/github-settings', { auth: true });
}

export async function apiUpdateGitHubSettings(patch: GitHubSettingsPatch): Promise<GitHubSettings> {
  return apiRequest<GitHubSettings>('/api/v1/admin/github-settings', {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify(patch),
  });
}
```

- [ ] **Step 2: Add store state + actions**

In `src/stores/adminStore.ts`: add to the `AdminState` interface `githubSettings: GitHubSettings | null;`, `fetchGitHubSettings: () => Promise<void>;`, `saveGitHubSettings: (patch: GitHubSettingsPatch) => Promise<void>;` (import the types from `../lib/api`); initialize `githubSettings: null,`; and add the actions mirroring `fetchSettings`/`saveSettings`:

```ts
  fetchGitHubSettings: async () => {
    try {
      const githubSettings = await apiGetGitHubSettings();
      set({ githubSettings });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load GitHub settings' });
    }
  },
  saveGitHubSettings: async (patch) => {
    const githubSettings = await apiUpdateGitHubSettings(patch);
    set({ githubSettings });
  },
```

Import `apiGetGitHubSettings`, `apiUpdateGitHubSettings`, `GitHubSettings`, `GitHubSettingsPatch` from `../lib/api`.

- [ ] **Step 3: Create the tab component**

Create `src/components/admin/tabs/AdminGitHubTab.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { Github, Save, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';
import { useAdminStore } from '../../../stores/adminStore';

/**
 * Super-admin config for the instance-wide GitHub App (increment 1: login).
 * Secrets are write-only — the API returns only *Set flags, never the values, so blank
 * secret fields leave the stored value untouched on save.
 */
export function AdminGitHubTab() {
  const { githubSettings, fetchGitHubSettings, saveGitHubSettings } = useAdminStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appId, setAppId] = useState('');
  const [appSlug, setAppSlug] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');

  useEffect(() => {
    void fetchGitHubSettings().finally(() => setLoading(false));
  }, [fetchGitHubSettings]);
  useEffect(() => {
    if (githubSettings) {
      setAppId(githubSettings.appId);
      setAppSlug(githubSettings.appSlug);
      setClientId(githubSettings.clientId);
    }
  }, [githubSettings]);

  const save = async () => {
    setSaving(true);
    try {
      await saveGitHubSettings({
        appId,
        appSlug,
        clientId,
        ...(clientSecret ? { clientSecret } : {}),
        ...(privateKey ? { privateKey } : {}),
        ...(webhookSecret ? { webhookSecret } : {}),
      });
      setClientSecret('');
      setPrivateKey('');
      setWebhookSecret('');
      toast.success('GitHub settings saved');
    } catch {
      toast.error('Could not save GitHub settings');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (field: 'enabled' | 'allowSignup', value: boolean) => {
    try {
      await saveGitHubSettings({ [field]: value });
      toast.success('Updated');
    } catch {
      toast.error('Could not update');
    }
  };

  if (loading || !githubSettings) {
    return (
      <div className="flex items-center justify-center h-full text-secondary gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  const secretPlaceholder = (isSet: boolean) => (isSet ? '•••• set — leave blank to keep' : 'Not set');

  return (
    <div className="flex flex-col h-full bg-page overflow-y-auto custom-scrollbar">
      <header className="h-12 px-6 flex items-center gap-2 border-b border-default bg-surface shrink-0">
        <Github size={16} className="text-accent" />
        <h2 className="text-sm font-bold text-primary">GitHub App</h2>
      </header>

      <div className="p-6 space-y-6 max-w-2xl">
        {/* Enable toggles */}
        <div className="bg-surface border border-default rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-primary">Sign in with GitHub</h3>
              <p className="text-xs text-secondary mt-0.5">Show the GitHub button on the login page.</p>
            </div>
            <Switch.Root
              checked={githubSettings.enabled}
              onCheckedChange={(v) => void toggle('enabled', v)}
              className={cn('w-9 h-5 rounded-full relative transition-colors outline-none cursor-pointer shrink-0', githubSettings.enabled ? 'bg-accent' : 'bg-elevated')}
            >
              <Switch.Thumb className="block w-4 h-4 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
            </Switch.Root>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-primary">Allow new sign-ups</h3>
              <p className="text-xs text-secondary mt-0.5">Create an account when a GitHub user has no match. Off = link existing only.</p>
            </div>
            <Switch.Root
              checked={githubSettings.allowSignup}
              onCheckedChange={(v) => void toggle('allowSignup', v)}
              className={cn('w-9 h-5 rounded-full relative transition-colors outline-none cursor-pointer shrink-0', githubSettings.allowSignup ? 'bg-accent' : 'bg-elevated')}
            >
              <Switch.Thumb className="block w-4 h-4 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
            </Switch.Root>
          </div>
        </div>

        {/* Callback URL (read-only) */}
        <div className="bg-surface border border-default rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-bold text-primary">Callback URL</h3>
          <p className="text-xs text-secondary">Set this as the GitHub App's "User authorization callback URL", and grant the App's <span className="font-mono">Account · Email addresses (read-only)</span> permission.</p>
          <code className="block bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary break-all">{githubSettings.callbackUrl}</code>
        </div>

        {/* Credentials */}
        <div className="bg-surface border border-default rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-primary">Credentials</h3>
          {[
            { label: 'App ID', value: appId, set: setAppId, placeholder: '123456' },
            { label: 'App slug', value: appSlug, set: setAppSlug, placeholder: 'my-torsor-app' },
            { label: 'Client ID', value: clientId, set: setClientId, placeholder: 'Iv1.abc123' },
          ].map((f) => (
            <div key={f.label} className="space-y-1.5">
              <label className="text-xs font-bold text-tertiary uppercase tracking-wider">{f.label}</label>
              <input
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.placeholder}
                className="w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50"
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-tertiary uppercase tracking-wider">Client secret</label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={secretPlaceholder(githubSettings.clientSecretSet)}
              className="w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-tertiary uppercase tracking-wider">Private key (PEM)</label>
            <textarea
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              rows={3}
              placeholder={secretPlaceholder(githubSettings.privateKeySet)}
              className="w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50 resize-none font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-tertiary uppercase tracking-wider">Webhook secret</label>
            <input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={secretPlaceholder(githubSettings.webhookSecretSet)}
              className="w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50"
            />
          </div>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save credentials
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the nav item**

In `src/components/admin/AdminLayout.tsx`: import `Github` from `lucide-react` (add to the existing lucide import), and add to `navItems` (before `settings`):

```ts
    { id: 'github', label: 'GitHub', icon: Github, href: '/admin/github' },
```

- [ ] **Step 5: Add the switch case**

In `src/pages/AdminPage.tsx`: import `import { AdminGitHubTab } from '../components/admin/tabs/AdminGitHubTab';` and add a case in `renderTab`'s `switch (tab)` (before `default`):

```tsx
      case 'github':
        return <AdminGitHubTab />;
```

(The `/admin/:tab` route already resolves `github` to this case — no new route needed in `App.tsx`.)

- [ ] **Step 6: Lint**

Run: `npm run lint:frontend`
Expected: `tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/tabs/AdminGitHubTab.tsx src/stores/adminStore.ts src/lib/api.ts src/components/admin/AdminLayout.tsx src/pages/AdminPage.tsx
git commit -m "feat(admin): GitHub App settings tab (write-only secrets, enable/signup toggles)"
```

---

### Task 10: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Backend build + vet + test**

Run: `cd apps/control-plane && go build ./... && go vet ./... && go test ./...`
Expected: all pass. New tests present: `TestSignedToken*`, `TestDecideGitHubAccount`, `TestFetchGitHub*`, `TestApplyGitHubPatch*`.

- [ ] **Step 2: Frontend lint + test**

Run: `npm run lint:frontend && npm test`
Expected: `tsc --noEmit` clean; vitest green (incl. `authStore.githubLogin`, `authStore.githubCallback`).

- [ ] **Step 3: Manual smoke checklist (documented, run against a dev/staging instance with a real test GitHub App)**

  1. Super-admin → `/admin/github`: paste App ID / client ID / client secret; toggle **Sign in with GitHub** on. Confirm the callback URL shown matches the App's config.
  2. Reload `/login` → the "Continue with GitHub" button appears.
  3. Click it → GitHub authorize → back to `/auth/callback` → lands authenticated on `/`.
  4. Re-login with the same GitHub account → same Torsor user (identity match, no duplicate).
  5. Toggle **Allow new sign-ups** off; sign in with a GitHub account whose verified email matches no user → `/login?error=signups_disabled`.
  6. Reopen `/admin/github` → secret fields show "•••• set"; save with them blank → secrets preserved (re-test login still works).

- [ ] **Step 4: Commit any doc/checklist tidy-ups (if needed), then stop for review**

```bash
git status   # expect clean tree if no tidy-ups were required
```

---

## Notes / deliberate deviations from the spec

- **No `go-github` dependency.** The spec named `go-github`; for two GET calls this plan uses raw `net/http` against a swappable `githubAPIBase` var — lighter, and it matches the repo's existing external-HTTP test idiom (`dockerHubBase`). `golang.org/x/oauth2` (already an indirect dep) is promoted to direct and handles the authorize URL + token exchange.
- **Handoff binds the user id, not a pre-created session.** The callback resolves the user and signs `handoff = sign(userID)`; `/exchange` calls `issueAuthResponse(userID)` to mint the session+JWT. This avoids orphan sessions if the SPA never completes the exchange. Replay window = the 60s TTL (acceptable for increment 1; a one-time store is a possible later hardening).
- **`allow_signup` defaults TRUE** per the approved spec. If you want link-existing-only until public signups open, flip the default in `0022_github_auth.sql` (or toggle it off in the admin tab after deploy).
- **Latent bug left untouched:** `handleUpdateMe` writes a non-existent `users.name` column — off the login path, out of scope here.
```
