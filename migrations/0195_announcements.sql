-- Migration: 0195_announcements
-- Description: Create announcements table for company news and announcements
-- Author: System
-- Date: 2026-03-17

BEGIN;

-- =============================================================================
-- Announcements table
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.announcements (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    title           text NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 500),
    content         text NOT NULL CHECK (char_length(content) >= 1),
    priority        text NOT NULL DEFAULT 'info' CHECK (priority IN ('info', 'important', 'urgent')),
    published_at    timestamptz,
    expires_at      timestamptz,
    author_id       uuid NOT NULL,
    target_departments jsonb DEFAULT '[]'::jsonb,
    target_roles    jsonb DEFAULT '[]'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- Expiry must be after publish date if both are set
    CONSTRAINT announcements_expiry_after_publish
        CHECK (expires_at IS NULL OR published_at IS NULL OR expires_at > published_at)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_id ON app.announcements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_announcements_published_at ON app.announcements(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_announcements_expires_at ON app.announcements(expires_at);
CREATE INDEX IF NOT EXISTS idx_announcements_author_id ON app.announcements(author_id);
CREATE INDEX IF NOT EXISTS idx_announcements_priority ON app.announcements(priority);

-- Composite index for the most common employee-facing query:
-- published, not expired, ordered by published date
CREATE INDEX IF NOT EXISTS idx_announcements_active
    ON app.announcements(tenant_id, published_at DESC)
    WHERE published_at IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER set_announcements_updated_at
    BEFORE UPDATE ON app.announcements
    FOR EACH ROW
    EXECUTE FUNCTION app.set_updated_at();

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.announcements ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (SELECT, UPDATE, DELETE)
CREATE POLICY tenant_isolation ON app.announcements
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR current_setting('app.system_context', true) = 'true'
    );

-- Tenant isolation policy (INSERT)
CREATE POLICY tenant_isolation_insert ON app.announcements
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR current_setting('app.system_context', true) = 'true'
    );

-- Grant permissions to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.announcements TO hris_app;

COMMIT;
