-- 0018: learning proposals — the agent's reflection pass stages candidate memories/skills here
-- after a substantive run. Nothing touches the real memories/skills tables until the user
-- approves a proposal in the Learning tab ("propose everything"). Scoped to the owning project
-- (ON DELETE CASCADE) with a denormalized user_id. Filename-keyed migrations coexist with the
-- engine branch's 0017 regardless of merge order. Control-plane-only (apps/api frozen at 0010).
CREATE TABLE IF NOT EXISTS learning_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL,   -- 'memory' | 'skill'
  status VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | accepted | dismissed
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_proposals_project_status
  ON learning_proposals(project_id, status, created_at DESC);
