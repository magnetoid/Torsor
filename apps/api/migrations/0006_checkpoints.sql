-- 0006: project checkpoints — file-tree snapshots for restore/rollback (Replit-style).
-- A checkpoint stores every workspace file's path + content as JSON so it can be restored
-- against any WorkspaceRuntime and survives workspace destroy/recreate.
-- Mirrored from apps/control-plane (shared schema + schema_migrations); the checkpoint
-- endpoints live only in the control-plane, but the table stays consistent across both.
CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL DEFAULT '',
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_project_id ON checkpoints(project_id);
