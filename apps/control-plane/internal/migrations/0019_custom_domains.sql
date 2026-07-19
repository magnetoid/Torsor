-- 0019: custom domains — map a user-owned domain to a project's deployment, so a request
-- arriving on that host (forwarded by the reverse proxy) is served the project's deployed app.
-- Domain is globally UNIQUE (one host → one project). Ownership flows through the project.
-- DNS + TLS for the domain are configured at the infra/reverse-proxy layer, not here.
-- Filename-keyed migrations coexist with the other feature branches' 0017/0018 in any order.
-- Control-plane-only (apps/api frozen at 0010).
CREATE TABLE IF NOT EXISTS custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain VARCHAR(253) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_domains_project ON custom_domains(project_id);
