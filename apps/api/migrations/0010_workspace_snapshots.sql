-- Workspace snapshots (Phase 6): runtime-native snapshot handles so a user can restore a
-- workspace in place or fork a new one from a point in time. Mirrored from apps/control-plane
-- (idempotent SQL, shared schema_migrations keyed by filename). Distinct from `checkpoints`,
-- which are file-tree snapshots stored in Postgres.
CREATE TABLE IF NOT EXISTS workspace_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  runtime VARCHAR(50) NOT NULL,
  snapshot_id TEXT NOT NULL,
  label VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_project ON workspace_snapshots(project_id);
