-- 0015: project memories — durable, per-project notes/facts/decisions that persist across
-- agent runs and IDE sessions. This is the vibe-coding "memory": the coding agent can
-- remember/recall within its loop, and the user can curate the same entries in the project
-- UI. Ownership is enforced through the owning project (ON DELETE CASCADE) with a
-- denormalized user_id for fast per-user scoping. Control-plane-only (apps/api frozen at 0010).
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL DEFAULT 'note',   -- 'note' | 'fact' | 'decision' | 'preference'
  content TEXT NOT NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'user', -- 'user' | 'agent' (who wrote it)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memories_project_created
  ON memories(project_id, created_at DESC);
