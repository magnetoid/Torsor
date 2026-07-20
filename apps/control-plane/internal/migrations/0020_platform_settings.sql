-- 0020: platform settings — a single super-admin-owned config row backing the admin Settings
-- tab (maintenance banner text + a maintenance-mode flag). Real persistence so the toggles
-- round-trip instead of being local-only mock state. Control-plane-only (apps/api frozen at 0010).
CREATE TABLE IF NOT EXISTS platform_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  announcement TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO platform_settings (id) VALUES (TRUE) ON CONFLICT DO NOTHING;
