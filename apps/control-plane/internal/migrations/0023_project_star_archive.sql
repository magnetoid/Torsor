-- Stars and archive become server-side state (they were localStorage-only illusions
-- in the frontend: /starred and the Archived filter silently reset per browser).
-- Owner-scoped booleans on projects; revisit as per-user prefs if teams gain
-- shared project access.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
