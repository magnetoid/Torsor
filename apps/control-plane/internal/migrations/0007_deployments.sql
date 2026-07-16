-- 0007: project deployments — expose a project's running workspace app at a stable public
-- URL (/d/{project_id}/). One deployment row per project; 'running' makes the public deploy
-- proxy serve it, 'stopped' makes it private again. The workspace container keeps running
-- for dev either way (stop only flips public visibility).
CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'stopped',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployments_project_id ON deployments(project_id);
