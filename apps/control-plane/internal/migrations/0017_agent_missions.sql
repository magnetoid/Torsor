-- 0017: coding agent engine — missions decompose a goal into ordered sub-tasks the engine
-- runs autonomously (plan → approve → sequential execution with verify/retry → report).
-- Plus governance: a single-row engine config (admin caps) and per-user agent prefs.
-- Ownership flows through the owning project. Control-plane-only (apps/api frozen at 0010).
CREATE TABLE IF NOT EXISTS agent_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'planning',
    -- planning | awaiting_approval | running | completed | failed | stopped
  plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_missions_project_created
  ON agent_missions(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_mission_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES agent_missions(id) ON DELETE CASCADE,
  ordinal INT NOT NULL,
  objective TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | running | done | failed | skipped
  attempts INT NOT NULL DEFAULT 0,
  result TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_mission_tasks_mission
  ON agent_mission_tasks(mission_id, ordinal);

CREATE TABLE IF NOT EXISTS agent_engine_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_model TEXT NOT NULL DEFAULT '',
  max_tasks INT NOT NULL DEFAULT 8,
  max_retries INT NOT NULL DEFAULT 2,
  max_concurrent_missions INT NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO agent_engine_config (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS user_agent_prefs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_autonomy VARCHAR(16) NOT NULL DEFAULT 'approve_plan', -- approve_plan | autonomous
  max_steps INT NOT NULL DEFAULT 12,
  preferred_model TEXT NOT NULL DEFAULT '',
  planning_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
