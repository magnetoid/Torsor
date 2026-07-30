-- Teams grant real access. 0011 added teams/team_members and projects.team_id but no
-- code ever read them; this backfills the data model so a shared membership predicate
-- can authorize project access. All statements are idempotent.

-- 1) Users created before 0011 (or via edge paths) may own no team at all: give them
--    a personal team. Full-UUID slug avoids collisions with signup's personal-XXXXXXXX.
INSERT INTO teams (name, slug, owner_id)
SELECT 'Personal Workspace', 'personal-' || u.id::text, u.id
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM teams t WHERE t.owner_id = u.id)
ON CONFLICT (slug) DO NOTHING;

-- 2) Every team owner gets an explicit active 'owner' membership row. Signup-created
--    personal teams never inserted one (only POST /teams did), so owner access was
--    implied by teams.owner_id instead of membership.
INSERT INTO team_members (team_id, user_id, role, status)
SELECT t.id, t.owner_id, 'owner', 'active'
FROM teams t
ON CONFLICT (team_id, user_id) DO NOTHING;

-- 3) Personal (NULL-team) projects move into their owner's personal team — the oldest
--    team they own, preferring the auto-created personal slug.
UPDATE projects p
SET team_id = (
  SELECT t.id
  FROM teams t
  WHERE t.owner_id = p.user_id
  ORDER BY (t.slug LIKE 'personal-%') DESC, t.created_at ASC
  LIMIT 1
)
WHERE p.team_id IS NULL;

-- 4) Project-name uniqueness becomes team-scoped. UNIQUE(user_id, name) is wrong under
--    sharing: it never dedupes within a team and blocks nothing it should. The unique
--    index keeps the same 23505 error path the create handler already turns into a 409.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_user_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_team_name ON projects(team_id, name);
