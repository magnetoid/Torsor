-- 0014: project template — records which starter template a project was created from
-- (e.g. 'vite-react', 'node-express', 'static'). Drives template-based workspace
-- provisioning: the base image + pre-install + dev command that boot a live preview.
-- Null = no template (blank workspace). Control-plane-only (apps/api frozen at 0010).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS template TEXT;
