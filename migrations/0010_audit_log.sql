-- Migration: 0010_audit_log
-- Created: 2026-01-07
-- Description: Create the audit_log table with monthly partitioning
--              This table is APPEND-ONLY - no updates or deletes allowed
--              Contains all auditable actions for compliance and security

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Audit Log table - Append-only audit trail
-- Partitioned by month on created_at for performance
CREATE TABLE IF NOT EXISTS app.audit_log (
    -- Primary identifier
    id uuid NOT NULL DEFAULT gen_random_uuid(),

    -- Tenant where the action occurred
    -- NOT NULL because all auditable actions occur within a tenant context
    tenant_id uuid NOT NULL,

    -- User who performed the action (NULL for system actions)
    user_id uuid,

    -- Action performed
    -- Convention: module.resource.verb (e.g., hr.employee.created, security.role.assigned)
    action varchar(255) NOT NULL,

    -- Type of resource affected
    resource_type varchar(100) NOT NULL,

    -- ID of the specific resource affected
    resource_id uuid,

    -- State before the change (NULL for create operations)
    old_value jsonb,

    -- State after the change (NULL for delete operations)
    new_value jsonb,

    -- Client IP address
    ip_address varchar(45),

    -- Client user agent
    user_agent text,

    -- Request ID for correlation across logs
    request_id varchar(100),

    -- Session ID for tracking user sessions
    session_id uuid,

    -- Additional context/metadata
    metadata jsonb DEFAULT '{}',

    -- When the action occurred (partition key)
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Primary key includes partition key for proper partitioning
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- =============================================================================
-- Create Partitions
-- =============================================================================

-- Function to create monthly partitions
CREATE OR REPLACE FUNCTION app.create_audit_log_partition(
    p_year integer,
    p_month integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_partition_name text;
    v_start_date date;
    v_end_date date;
BEGIN
    -- Generate partition name: audit_log_YYYYMM
    v_partition_name := format('audit_log_%s%s',
        p_year::text,
        lpad(p_month::text, 2, '0')
    );

    -- Calculate date range
    v_start_date := make_date(p_year, p_month, 1);
    v_end_date := v_start_date + interval '1 month';

    -- Create the partition
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS app.%I PARTITION OF app.audit_log
         FOR VALUES FROM (%L) TO (%L)',
        v_partition_name,
        v_start_date,
        v_end_date
    );

    RETURN v_partition_name;
END;
$$;

-- Create partitions for current month and next 3 months
DO $$
DECLARE
    v_current_date date := CURRENT_DATE;
    v_year integer;
    v_month integer;
    i integer;
BEGIN
    FOR i IN 0..3 LOOP
        v_year := EXTRACT(YEAR FROM (v_current_date + (i || ' months')::interval));
        v_month := EXTRACT(MONTH FROM (v_current_date + (i || ' months')::interval));
        PERFORM app.create_audit_log_partition(v_year, v_month);
    END LOOP;
END;
$$;

-- =============================================================================
-- Indexes (created on parent, inherited by partitions)
-- =============================================================================

-- Index for finding audit entries by tenant
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON app.audit_log(tenant_id, created_at DESC);

-- Index for finding audit entries by user
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON app.audit_log(user_id, created_at DESC);

-- Index for finding audit entries by resource
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON app.audit_log(resource_type, resource_id, created_at DESC);

-- Index for finding audit entries by action
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON app.audit_log(action, created_at DESC);

-- Index for request ID correlation
CREATE INDEX IF NOT EXISTS idx_audit_log_request_id ON app.audit_log(request_id) WHERE request_id IS NOT NULL;

-- Index for session tracking
CREATE INDEX IF NOT EXISTS idx_audit_log_session_id ON app.audit_log(session_id, created_at DESC) WHERE session_id IS NOT NULL;

-- GIN index for searching within old_value/new_value
CREATE INDEX IF NOT EXISTS idx_audit_log_old_value ON app.audit_log USING gin(old_value) WHERE old_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_new_value ON app.audit_log USING gin(new_value) WHERE new_value IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read audit entries for their current tenant
-- Note: No INSERT policy needed as we use SECURITY DEFINER function
CREATE POLICY tenant_isolation_select ON app.audit_log
    FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy: Allow inserts only through SECURITY DEFINER function
-- This prevents direct inserts that could bypass validation
CREATE POLICY audit_insert_policy ON app.audit_log
    FOR INSERT
    WITH CHECK (app.is_system_context());

-- =============================================================================
-- Prevent Updates and Deletes
-- =============================================================================

-- Trigger to prevent updates (audit log is immutable)
CREATE TRIGGER prevent_audit_log_update
    BEFORE UPDATE ON app.audit_log
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_update();

-- Trigger to prevent deletes (audit log is immutable)
CREATE TRIGGER prevent_audit_log_delete
    BEFORE DELETE ON app.audit_log
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_delete();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to write an audit log entry (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION app.write_audit_log(
    p_tenant_id uuid,
    p_user_id uuid,
    p_action varchar(255),
    p_resource_type varchar(100),
    p_resource_id uuid DEFAULT NULL,
    p_old_value jsonb DEFAULT NULL,
    p_new_value jsonb DEFAULT NULL,
    p_ip_address varchar(45) DEFAULT NULL,
    p_user_agent text DEFAULT NULL,
    p_request_id varchar(100) DEFAULT NULL,
    p_session_id uuid DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_audit_id uuid;
BEGIN
    -- Enable system context for insert
    PERFORM app.enable_system_context();

    INSERT INTO app.audit_log (
        tenant_id, user_id, action, resource_type, resource_id,
        old_value, new_value, ip_address, user_agent,
        request_id, session_id, metadata, created_at
    )
    VALUES (
        p_tenant_id, p_user_id, p_action, p_resource_type, p_resource_id,
        p_old_value, p_new_value, p_ip_address, p_user_agent,
        p_request_id, p_session_id, COALESCE(p_metadata, '{}'), now()
    )
    RETURNING id INTO v_audit_id;

    -- Disable system context
    PERFORM app.disable_system_context();

    RETURN v_audit_id;
END;
$$;

-- Function to get audit trail for a specific resource
CREATE OR REPLACE FUNCTION app.get_resource_audit_trail(
    p_tenant_id uuid,
    p_resource_type varchar(100),
    p_resource_id uuid,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    action varchar(255),
    old_value jsonb,
    new_value jsonb,
    ip_address varchar(45),
    request_id varchar(100),
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.user_id,
        al.action,
        al.old_value,
        al.new_value,
        al.ip_address,
        al.request_id,
        al.created_at
    FROM app.audit_log al
    WHERE al.tenant_id = p_tenant_id
      AND al.resource_type = p_resource_type
      AND al.resource_id = p_resource_id
    ORDER BY al.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get audit entries for a user
CREATE OR REPLACE FUNCTION app.get_user_audit_trail(
    p_tenant_id uuid,
    p_user_id uuid,
    p_from timestamptz DEFAULT now() - interval '30 days',
    p_to timestamptz DEFAULT now(),
    p_limit integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    action varchar(255),
    resource_type varchar(100),
    resource_id uuid,
    ip_address varchar(45),
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.action,
        al.resource_type,
        al.resource_id,
        al.ip_address,
        al.created_at
    FROM app.audit_log al
    WHERE al.tenant_id = p_tenant_id
      AND al.user_id = p_user_id
      AND al.created_at >= p_from
      AND al.created_at <= p_to
    ORDER BY al.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Function to ensure partition exists (call before inserting)
CREATE OR REPLACE FUNCTION app.ensure_audit_log_partition()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_date date := CURRENT_DATE;
    v_year integer;
    v_month integer;
BEGIN
    -- Ensure current month partition exists
    v_year := EXTRACT(YEAR FROM v_current_date);
    v_month := EXTRACT(MONTH FROM v_current_date);
    PERFORM app.create_audit_log_partition(v_year, v_month);

    -- Ensure next month partition exists
    v_year := EXTRACT(YEAR FROM (v_current_date + interval '1 month'));
    v_month := EXTRACT(MONTH FROM (v_current_date + interval '1 month'));
    PERFORM app.create_audit_log_partition(v_year, v_month);
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.audit_log IS 'Append-only audit trail partitioned by month. No updates or deletes allowed.';
COMMENT ON COLUMN app.audit_log.id IS 'Primary UUID identifier for the audit entry';
COMMENT ON COLUMN app.audit_log.tenant_id IS 'Tenant where the action occurred';
COMMENT ON COLUMN app.audit_log.user_id IS 'User who performed the action, NULL for system actions';
COMMENT ON COLUMN app.audit_log.action IS 'Action performed (module.resource.verb format)';
COMMENT ON COLUMN app.audit_log.resource_type IS 'Type of resource affected';
COMMENT ON COLUMN app.audit_log.resource_id IS 'ID of the specific resource affected';
COMMENT ON COLUMN app.audit_log.old_value IS 'State before the change';
COMMENT ON COLUMN app.audit_log.new_value IS 'State after the change';
COMMENT ON COLUMN app.audit_log.ip_address IS 'Client IP address';
COMMENT ON COLUMN app.audit_log.request_id IS 'Request ID for log correlation';
COMMENT ON COLUMN app.audit_log.session_id IS 'Session ID for user tracking';
COMMENT ON COLUMN app.audit_log.metadata IS 'Additional context and metadata';
COMMENT ON FUNCTION app.write_audit_log IS 'Writes an audit log entry (use this instead of direct INSERT)';
COMMENT ON FUNCTION app.get_resource_audit_trail IS 'Gets audit history for a specific resource';
COMMENT ON FUNCTION app.get_user_audit_trail IS 'Gets audit history for a specific user';
COMMENT ON FUNCTION app.create_audit_log_partition IS 'Creates a monthly partition for audit_log';
COMMENT ON FUNCTION app.ensure_audit_log_partition IS 'Ensures current and next month partitions exist';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.ensure_audit_log_partition();
-- DROP FUNCTION IF EXISTS app.get_user_audit_trail(uuid, uuid, timestamptz, timestamptz, integer);
-- DROP FUNCTION IF EXISTS app.get_resource_audit_trail(uuid, varchar, uuid, integer, integer);
-- DROP FUNCTION IF EXISTS app.write_audit_log(uuid, uuid, varchar, varchar, uuid, jsonb, jsonb, varchar, text, varchar, uuid, jsonb);
-- DROP TRIGGER IF EXISTS prevent_audit_log_delete ON app.audit_log;
-- DROP TRIGGER IF EXISTS prevent_audit_log_update ON app.audit_log;
-- DROP POLICY IF EXISTS audit_insert_policy ON app.audit_log;
-- DROP POLICY IF EXISTS tenant_isolation_select ON app.audit_log;
-- DROP INDEX IF EXISTS app.idx_audit_log_new_value;
-- DROP INDEX IF EXISTS app.idx_audit_log_old_value;
-- DROP INDEX IF EXISTS app.idx_audit_log_session_id;
-- DROP INDEX IF EXISTS app.idx_audit_log_request_id;
-- DROP INDEX IF EXISTS app.idx_audit_log_action;
-- DROP INDEX IF EXISTS app.idx_audit_log_resource;
-- DROP INDEX IF EXISTS app.idx_audit_log_user_id;
-- DROP INDEX IF EXISTS app.idx_audit_log_tenant_id;
-- DROP TABLE IF EXISTS app.audit_log CASCADE;
-- DROP FUNCTION IF EXISTS app.create_audit_log_partition(integer, integer);
