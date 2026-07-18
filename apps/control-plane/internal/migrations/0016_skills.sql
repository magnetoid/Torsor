-- 0016: agent skills — user-defined, reusable capabilities for the coding agent. Each skill
-- is a named instruction that is injected into the agent's system prompt when enabled, so a
-- project can teach the agent conventions ("always validate forms with Zod", "prefer server
-- components"). Scoped to the owning project (ON DELETE CASCADE) with a denormalized user_id.
-- Control-plane-only (apps/api frozen at 0010).
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instruction TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skills_project_created
  ON skills(project_id, created_at DESC);
