-- 0027: app_logs — durable, queryable diagnostics for the whole platform.
--
-- Until now the only record of a failure was a JSON line on the control plane's stdout. On a
-- container host that means "docker logs, if you still have the container, and if you know
-- which one" — and nothing at all from the browser, where a large share of user-visible
-- breakage actually happens. There was no way for an operator to answer "what went wrong for
-- this user five minutes ago?".
--
-- This table is the answer: one row per notable event, from BOTH the Go control plane and the
-- frontend, correlated by request_id so a 500 and the browser error it produced line up.
--
-- Deliberately NOT a full log sink. Debug/info chatter stays on stdout where it belongs;
-- writing every request here would turn the database into a firehose and make the table
-- useless for the thing it exists for. Default capture is warn and above (LOG_DB_LEVEL).
-- Control-plane-only (apps/api frozen at 0010).

CREATE TABLE IF NOT EXISTS app_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- debug | info | warn | error | fatal
  level VARCHAR(16) NOT NULL,
  -- backend | frontend. Kept explicit rather than inferred, so a frontend report can never be
  -- mistaken for a server-side fault when triaging.
  source VARCHAR(16) NOT NULL DEFAULT 'backend',
  message TEXT NOT NULL,
  -- Free-form origin: a Go package/handler, or a React component/route.
  logger VARCHAR(128) NOT NULL DEFAULT '',

  -- Correlation. request_id ties a browser error to the exact API call that caused it.
  request_id VARCHAR(128) NOT NULL DEFAULT '',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID,

  -- HTTP context, when the event happened inside a request.
  method VARCHAR(10) NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  status INTEGER,
  duration_ms INTEGER,

  -- The failure itself.
  error TEXT NOT NULL DEFAULT '',
  stack TEXT NOT NULL DEFAULT '',

  -- Everything else the emitter attached, redacted before it gets here (see redactFields).
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Environment, so logs from a rolling deploy are distinguishable.
  release VARCHAR(64) NOT NULL DEFAULT '',
  ip VARCHAR(64) NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The console's default view is "newest first, optionally filtered by level".
CREATE INDEX IF NOT EXISTS idx_app_logs_ts ON app_logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level_ts ON app_logs(level, ts DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_source_ts ON app_logs(source, ts DESC);
-- Partial: correlation lookups only ever ask about rows that HAVE an id, and this keeps the
-- index small on a table where most rows won't.
CREATE INDEX IF NOT EXISTS idx_app_logs_request ON app_logs(request_id) WHERE request_id <> '';
CREATE INDEX IF NOT EXISTS idx_app_logs_user ON app_logs(user_id, ts DESC) WHERE user_id IS NOT NULL;
