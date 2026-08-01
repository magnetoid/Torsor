-- 0026: releases — make "deployed" mean an immutable artifact, not "the dev container is up".
--
-- Until now `deployments` recorded only public visibility, and the deployed app WAS the dev
-- workspace: the build ran in the same container the editor and agent mutate, on the same
-- port. Three consequences, all of which this table exists to end:
--   * stopping (or crashing, or agent-restarting) the workspace took production down;
--   * there was no artifact, so "what is live right now?" had no answer beyond "whatever is
--     in the container this second";
--   * with nothing versioned, rollback was impossible.
--
-- A release pins a runtime-native snapshot of the workspace taken at deploy time. The release
-- runs in its OWN container forked from that snapshot, so production is isolated from further
-- editing, and rolling back is re-forking an earlier snapshot — no rebuild, no git archaeology.
--
-- `number` is a per-project monotonic counter (v1, v2, …) because a UUID is useless to a human
-- choosing what to roll back to. `deployments.release_id` names the one currently serving.
-- Control-plane-only (apps/api frozen at 0010).

CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  -- Runtime-native handle (a docker image id for docker-runtime). Empty until the snapshot
  -- succeeds, which is why status carries the truth rather than snapshot_id being NOT NULL.
  snapshot_id TEXT NOT NULL DEFAULT '',
  runtime VARCHAR(64) NOT NULL DEFAULT '',
  -- building → live | failed | superseded. A release is never deleted on rollback; history is
  -- the point.
  status VARCHAR(32) NOT NULL DEFAULT 'building',
  -- Build/serve output, captured from the release container so a failed deploy is diagnosable
  -- without shelling in. Bounded by the writer, not the schema.
  build_log TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, number)
);

CREATE INDEX IF NOT EXISTS idx_releases_project ON releases(project_id, number DESC);

-- Which release is serving. NULL = nothing published, or a legacy pre-0026 deployment still
-- being served the old way (see servesFromRelease in deploy_handlers.go).
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS release_id UUID REFERENCES releases(id) ON DELETE SET NULL;

-- deployment_events gains the release it refers to, so history can say "rolled back to v3"
-- rather than just "deploy".
ALTER TABLE deployment_events
  ADD COLUMN IF NOT EXISTS release_id UUID REFERENCES releases(id) ON DELETE SET NULL;
