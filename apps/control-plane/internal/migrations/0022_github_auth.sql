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
