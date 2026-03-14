-- Migration: 0082_exports
-- Created: 2026-01-07
-- Description: Create tables for export system used by export worker
--              Tracks export jobs, their status, and file locations

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Export status enum
DO $$ BEGIN
    CREATE TYPE app.export_status AS ENUM (
        'pending',
        'processing',
        'completed',
        'failed',
        'expired'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Export format enum
DO $$ BEGIN
    CREATE TYPE app.export_format AS ENUM (
        'csv',
        'xlsx',
        'json',
        'pdf'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Exports table - Track export jobs
CREATE TABLE IF NOT EXISTS app.exports (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant context
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- User who requested the export
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    -- Export details
    name varchar(255) NOT NULL,
    format app.export_format NOT NULL,

    -- Status tracking
    status app.export_status NOT NULL DEFAULT 'pending',
    error text,

    -- File details (populated on completion)
    file_path text,
    file_size bigint,
    row_count integer,

    -- Expiration
    expires_at timestamptz,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Index for user's exports
CREATE INDEX IF NOT EXISTS idx_exports_user
    ON app.exports(tenant_id, user_id, created_at DESC);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_exports_status
    ON app.exports(status, created_at)
    WHERE status IN ('pending', 'processing');

-- Index for cleanup of expired exports
CREATE INDEX IF NOT EXISTS idx_exports_expires
    ON app.exports(expires_at)
    WHERE status = 'completed' AND expires_at IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.exports ENABLE ROW LEVEL SECURITY;

-- Users can see their own exports, admins can see all in tenant
CREATE POLICY tenant_isolation ON app.exports
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        AND (
            user_id = current_setting('app.current_user', true)::uuid
            OR app.is_system_context()
        )
    );

-- System context can access all exports
CREATE POLICY system_access ON app.exports
    FOR ALL
    USING (app.is_system_context());

-- =============================================================================
-- Functions
-- =============================================================================

-- Get user's recent exports
CREATE OR REPLACE FUNCTION app.get_user_exports(
    p_tenant_id uuid,
    p_user_id uuid,
    p_limit integer DEFAULT 20
)
RETURNS TABLE (
    id uuid,
    name varchar,
    format app.export_format,
    status app.export_status,
    file_size bigint,
    row_count integer,
    created_at timestamptz,
    completed_at timestamptz,
    expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.name,
        e.format,
        e.status,
        e.file_size,
        e.row_count,
        e.created_at,
        e.completed_at,
        e.expires_at
    FROM app.exports e
    WHERE e.tenant_id = p_tenant_id
      AND e.user_id = p_user_id
    ORDER BY e.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Cleanup expired exports
CREATE OR REPLACE FUNCTION app.cleanup_expired_exports()
RETURNS TABLE (
    deleted_count integer,
    expired_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_deleted integer;
    v_expired integer;
BEGIN
    PERFORM app.enable_system_context();

    -- Mark expired exports
    UPDATE app.exports
    SET status = 'expired',
        file_path = NULL,
        updated_at = now()
    WHERE status = 'completed'
      AND expires_at IS NOT NULL
      AND expires_at < now();

    GET DIAGNOSTICS v_expired = ROW_COUNT;

    -- Delete very old exports (30 days+)
    DELETE FROM app.exports
    WHERE created_at < now() - interval '30 days'
      AND status IN ('completed', 'failed', 'expired');

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    PERFORM app.disable_system_context();

    RETURN QUERY SELECT v_deleted, v_expired;
END;
$$;

-- Get export statistics
CREATE OR REPLACE FUNCTION app.get_export_stats(p_tenant_id uuid)
RETURNS TABLE (
    pending_count bigint,
    processing_count bigint,
    completed_today bigint,
    failed_today bigint,
    total_size_bytes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE) as completed_today,
        COUNT(*) FILTER (WHERE status = 'failed' AND updated_at >= CURRENT_DATE) as failed_today,
        COALESCE(SUM(file_size) FILTER (WHERE status = 'completed'), 0) as total_size_bytes
    FROM app.exports
    WHERE tenant_id = p_tenant_id;
END;
$$;

-- =============================================================================
-- Triggers
-- =============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION app.update_export_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_exports_updated_at
    BEFORE UPDATE ON app.exports
    FOR EACH ROW
    EXECUTE FUNCTION app.update_export_timestamp();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.exports IS 'Tracks export jobs and their results';
COMMENT ON COLUMN app.exports.status IS 'Current status of the export job';
COMMENT ON COLUMN app.exports.format IS 'Export file format (csv, xlsx, json, pdf)';
COMMENT ON COLUMN app.exports.file_path IS 'Path to the generated file (populated on completion)';
COMMENT ON COLUMN app.exports.expires_at IS 'When the export file will be deleted';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_exports_updated_at ON app.exports;
-- DROP FUNCTION IF EXISTS app.update_export_timestamp();
-- DROP FUNCTION IF EXISTS app.get_export_stats(uuid);
-- DROP FUNCTION IF EXISTS app.cleanup_expired_exports();
-- DROP FUNCTION IF EXISTS app.get_user_exports(uuid, uuid, integer);
-- DROP POLICY IF EXISTS system_access ON app.exports;
-- DROP POLICY IF EXISTS tenant_isolation ON app.exports;
-- DROP TABLE IF EXISTS app.exports;
-- DROP TYPE IF EXISTS app.export_format;
-- DROP TYPE IF EXISTS app.export_status;
