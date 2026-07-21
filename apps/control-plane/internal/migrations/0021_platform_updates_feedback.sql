-- Platform updates (the "What's New" changelog, published by super admins) and user
-- feedback (the in-app feedback channel, triaged by super admins). Both idempotent.

CREATE TABLE IF NOT EXISTS platform_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_updates_published
    ON platform_updates (published_at DESC);

CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'other',       -- bug | idea | other
    message TEXT NOT NULL,
    page TEXT NOT NULL DEFAULT '',                -- where in the app it was sent from
    status TEXT NOT NULL DEFAULT 'new',           -- new | reviewed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_status_created
    ON feedback (status, created_at DESC);
