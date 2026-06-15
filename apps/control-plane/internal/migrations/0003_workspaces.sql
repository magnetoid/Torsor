-- Workspaces: one per project, owned by a user, backed by a runtime plugin.
-- Persisting these lets workspace operations be scoped to project ownership (no acting
-- on a workspace by guessing its id) and survive control-plane restarts.
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime VARCHAR(100) NOT NULL,
  container_id TEXT,
  image VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_project_id ON workspaces(project_id);
