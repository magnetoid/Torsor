-- 0025: prove you own the domain before Torsor serves it.
--
-- 0019 let any authenticated user attach ANY hostname, and handleCustomDomainProxy served it
-- on sight. On a multi-user instance that is two holes: a user can point a domain they do not
-- own at the instance and have their project answer for it, and because `domain` is globally
-- UNIQUE they can squat a hostname so its real owner can never attach it.
--
-- The fix is the standard DNS TXT challenge: each row carries a random token that must appear
-- in a TXT record at _torsor-challenge.<domain> before verified_at is set, and only verified
-- rows are routable. A token is generated per row (not per user) so revoking one attachment
-- never invalidates another.
--
-- Existing rows are deliberately left unverified rather than grandfathered: they are precisely
-- the unproven claims this migration exists to stop. They keep working the moment their owner
-- publishes the TXT record and clicks Verify.
-- Control-plane-only (apps/api frozen at 0010).

ALTER TABLE custom_domains
  ADD COLUMN IF NOT EXISTS verification_token TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Backfill tokens for rows created before this migration so every row has a usable challenge.
-- gen_random_uuid() is already relied on for PKs, so no new extension is required.
UPDATE custom_domains
   SET verification_token = replace(gen_random_uuid()::text, '-', '')
 WHERE verification_token IS NULL;

ALTER TABLE custom_domains ALTER COLUMN verification_token SET NOT NULL;

-- The proxy's hot path is "resolve this Host to a routable project".
CREATE INDEX IF NOT EXISTS idx_custom_domains_verified
  ON custom_domains(domain) WHERE verified_at IS NOT NULL;
