-- Background agent runs (Phase 4): make ai_tasks a first-class, observable run object.
-- Each streamed step is appended to `events` so a run's transcript survives the request
-- and can be replayed or reattached (GET /tasks/{id}/events/stream). The accounting
-- columns let the Agent Runs list render from a single query without joining usage_events.
-- Mirrored from apps/control-plane so both services share one schema (idempotent SQL,
-- shared schema_migrations keyed by filename).
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS events JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS steps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS model VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS tokens_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS tokens_out INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ai_tasks_status_created ON ai_tasks(status, created_at);
