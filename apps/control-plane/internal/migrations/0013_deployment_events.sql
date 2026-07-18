-- 0013: deployment history — an append-only log of publish/unpublish events per project,
-- distinct from the single-row `deployments` table (which records only current public
-- visibility). Powers the Deploy History view so it reflects real, persistent activity
-- instead of per-browser session memory. Control-plane-only (apps/api is frozen at 0010).
CREATE TABLE IF NOT EXISTS deployment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(32) NOT NULL,     -- 'deploy' | 'stop'
  status VARCHAR(32) NOT NULL,     -- 'running' | 'stopped' | 'error'
  url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployment_events_project ON deployment_events(project_id, created_at DESC);
