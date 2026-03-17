-- Migration: 0200_calendar_connections
-- Created: 2026-03-17
-- Description: Create calendar_connections table for calendar sync integrations.
--              Supports Google Calendar, Outlook, and iCal feed generation.
--              Each user can have multiple connections (one per provider).
--              The ical_token column stores a unique, unguessable token used to
--              access the unauthenticated iCal feed endpoint.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Calendar Provider Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_provider' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.calendar_provider AS ENUM ('google', 'outlook', 'ical');
    END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Calendar Connections Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.calendar_connections (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this connection
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The user who owns this connection
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    -- Calendar provider type
    provider app.calendar_provider NOT NULL,

    -- OAuth tokens (encrypted at rest for Google/Outlook; NULL for iCal)
    access_token_encrypted text,
    refresh_token_encrypted text,

    -- External calendar identifier (for Google/Outlook subscription targets)
    calendar_id varchar(500),

    -- iCal feed token: unique, unguessable token for unauthenticated feed access
    -- Only set for provider = 'ical'
    ical_token varchar(128) UNIQUE,

    -- Whether sync is currently enabled
    sync_enabled boolean NOT NULL DEFAULT true,

    -- Last successful synchronisation timestamp
    last_synced_at timestamptz,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- One connection per provider per user per tenant
    CONSTRAINT calendar_connections_unique_provider UNIQUE (tenant_id, user_id, provider),

    -- iCal connections must have an ical_token
    CONSTRAINT calendar_connections_ical_token_check CHECK (
        provider != 'ical' OR ical_token IS NOT NULL
    ),

    -- OAuth connections should not have ical_token
    CONSTRAINT calendar_connections_oauth_no_ical_token CHECK (
        provider = 'ical' OR ical_token IS NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: user's connections
CREATE INDEX IF NOT EXISTS idx_calendar_connections_user
    ON app.calendar_connections(tenant_id, user_id);

-- iCal token lookup (for unauthenticated feed access)
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_connections_ical_token
    ON app.calendar_connections(ical_token)
    WHERE ical_token IS NOT NULL;

-- Sync-enabled connections (for background sync jobs)
CREATE INDEX IF NOT EXISTS idx_calendar_connections_sync_enabled
    ON app.calendar_connections(tenant_id, provider, sync_enabled)
    WHERE sync_enabled = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.calendar_connections ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see connections for their current tenant
CREATE POLICY tenant_isolation ON app.calendar_connections
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.calendar_connections
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_calendar_connections_updated_at
    BEFORE UPDATE ON app.calendar_connections
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.calendar_connections IS 'Calendar integration connections for Google, Outlook, and iCal feeds';
COMMENT ON COLUMN app.calendar_connections.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.calendar_connections.tenant_id IS 'Tenant that owns this connection';
COMMENT ON COLUMN app.calendar_connections.user_id IS 'User who owns this connection';
COMMENT ON COLUMN app.calendar_connections.provider IS 'Calendar provider: google, outlook, or ical';
COMMENT ON COLUMN app.calendar_connections.access_token_encrypted IS 'Encrypted OAuth access token (Google/Outlook only)';
COMMENT ON COLUMN app.calendar_connections.refresh_token_encrypted IS 'Encrypted OAuth refresh token (Google/Outlook only)';
COMMENT ON COLUMN app.calendar_connections.calendar_id IS 'External calendar identifier for subscription targets';
COMMENT ON COLUMN app.calendar_connections.ical_token IS 'Unique unguessable token for iCal feed URL access';
COMMENT ON COLUMN app.calendar_connections.sync_enabled IS 'Whether synchronisation is currently active';
COMMENT ON COLUMN app.calendar_connections.last_synced_at IS 'Last successful sync timestamp';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_calendar_connections_updated_at ON app.calendar_connections;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.calendar_connections;
-- DROP POLICY IF EXISTS tenant_isolation ON app.calendar_connections;
-- DROP INDEX IF EXISTS app.idx_calendar_connections_sync_enabled;
-- DROP INDEX IF EXISTS app.idx_calendar_connections_ical_token;
-- DROP INDEX IF EXISTS app.idx_calendar_connections_user;
-- DROP TABLE IF EXISTS app.calendar_connections;
-- DROP TYPE IF EXISTS app.calendar_provider;
