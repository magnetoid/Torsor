ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('user', 'admin', 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_tasks_status_check'
  ) THEN
    ALTER TABLE ai_tasks
      ADD CONSTRAINT ai_tasks_status_check
      CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_tasks_pending_created
  ON ai_tasks (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_users_email_lower
  ON users (LOWER(email));
