-- Real onboarding tracking so the client stops re-running onboarding on every reload.
-- Default false: new signups onboard once, then PATCH /auth/me flips it true and it sticks.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT false;
