-- MCP servers (Phase 5): user-configured Model Context Protocol servers whose tools the
-- coding agent can call. Mirrored from apps/control-plane so both services share one schema
-- (idempotent SQL, shared schema_migrations keyed by filename). The auth header is stored
-- AES-GCM encrypted and is write-only — never returned by the API.
CREATE TABLE IF NOT EXISTS mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  url TEXT NOT NULL,
  transport VARCHAR(20) NOT NULL DEFAULT 'streamable-http', -- streamable-http | sse
  auth_header_enc TEXT, -- encrypted Authorization header value, or NULL
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_user ON mcp_servers(user_id);
