-- Migration: 0055_blackout_periods
-- Created: 2026-01-07
-- Description: Create the blackout_periods table - periods where leave is restricted
--              Supports both soft blocks (warnings) and hard blocks (prevention)
--              Can be scoped to specific org units and leave types
--              Common uses: year-end close, peak seasons, project deadlines

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Blackout Periods Table
-- -----------------------------------------------------------------------------
-- Defines periods where leave requests are restricted or blocked
-- Organizations use blackout periods for:
--   - Financial year-end close (accounting must be present)
--   - Peak business seasons (retail during holidays)
--   - Critical project phases (all hands on deck)
--   - Mandatory training periods
CREATE TABLE IF NOT EXISTS app.blackout_periods (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this blackout period
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- ==========================================================================
    -- BLACKOUT DETAILS
    -- ==========================================================================

    -- Name/title of the blackout period
    -- e.g., 'Year-End Close', 'Black Friday Week', 'Annual Inventory'
    name varchar(255) NOT NULL,

    -- Start date of the blackout period (inclusive)
    start_date date NOT NULL,

    -- End date of the blackout period (inclusive)
    end_date date NOT NULL,

    -- ==========================================================================
    -- SCOPE - Who and what is affected
    -- ==========================================================================

    -- Organization unit scope (NULL = applies to entire organization)
    -- If specified, applies to employees in this org unit and descendants
    org_unit_id uuid REFERENCES app.org_units(id) ON DELETE CASCADE,

    -- Leave type scope (NULL = applies to all leave types)
    -- If specified, only this leave type is blocked during the period
    -- e.g., block annual leave but allow sick leave
    leave_type_id uuid REFERENCES app.leave_types(id) ON DELETE CASCADE,

    -- ==========================================================================
    -- BLOCKING BEHAVIOR
    -- ==========================================================================

    -- Whether this is a hard block (prevent) or soft block (warning)
    -- Hard block: System prevents leave requests in this period
    -- Soft block: System shows warning but allows submission (requires approval override)
    is_hard_block boolean NOT NULL DEFAULT false,

    -- ==========================================================================
    -- DOCUMENTATION
    -- ==========================================================================

    -- Reason/explanation for the blackout period
    -- Displayed to employees when they attempt to request leave
    reason text,

    -- ==========================================================================
    -- STATUS
    -- ==========================================================================

    -- Whether this blackout period is currently active
    -- Inactive periods are ignored but preserved for history
    is_active boolean NOT NULL DEFAULT true,

    -- ==========================================================================
    -- TIMESTAMPS
    -- ==========================================================================

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- ==========================================================================
    -- CONSTRAINTS
    -- ==========================================================================

    -- End date must be on or after start date
    CONSTRAINT blackout_periods_date_range CHECK (end_date >= start_date),

    -- Dates must be reasonable
    CONSTRAINT blackout_periods_date_check CHECK (
        start_date >= '1970-01-01' AND end_date <= '2100-12-31'
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: active blackout periods overlapping a date range
CREATE INDEX IF NOT EXISTS idx_blackout_periods_date_range
    ON app.blackout_periods(tenant_id, start_date, end_date)
    WHERE is_active = true;

-- Org unit scope lookup
CREATE INDEX IF NOT EXISTS idx_blackout_periods_org_unit
    ON app.blackout_periods(tenant_id, org_unit_id)
    WHERE org_unit_id IS NOT NULL AND is_active = true;

-- Leave type scope lookup
CREATE INDEX IF NOT EXISTS idx_blackout_periods_leave_type
    ON app.blackout_periods(tenant_id, leave_type_id)
    WHERE leave_type_id IS NOT NULL AND is_active = true;

-- Hard blocks (for strict enforcement queries)
CREATE INDEX IF NOT EXISTS idx_blackout_periods_hard_block
    ON app.blackout_periods(tenant_id, start_date, end_date)
    WHERE is_hard_block = true AND is_active = true;

-- Active blackout periods
CREATE INDEX IF NOT EXISTS idx_blackout_periods_active
    ON app.blackout_periods(tenant_id)
    WHERE is_active = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.blackout_periods ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see blackout periods for their current tenant
CREATE POLICY tenant_isolation ON app.blackout_periods
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.blackout_periods
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_blackout_periods_updated_at
    BEFORE UPDATE ON app.blackout_periods
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to check if a leave request overlaps with any blackout periods
-- Returns matching blackout periods with their block type
CREATE OR REPLACE FUNCTION app.check_blackout_periods(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    blackout_id uuid,
    blackout_name varchar(255),
    blackout_start date,
    blackout_end date,
    is_hard_block boolean,
    reason text,
    scope_type varchar(20)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_employee_org_unit_id uuid;
BEGIN
    -- Get employee's org unit
    SELECT pa.org_unit_id INTO v_employee_org_unit_id
    FROM app.position_assignments pa
    WHERE pa.employee_id = p_employee_id
      AND pa.is_primary = true
      AND pa.end_date IS NULL
    LIMIT 1;

    -- Return all matching blackout periods
    RETURN QUERY
    SELECT
        bp.id AS blackout_id,
        bp.name AS blackout_name,
        bp.start_date AS blackout_start,
        bp.end_date AS blackout_end,
        bp.is_hard_block,
        bp.reason,
        CASE
            WHEN bp.org_unit_id IS NOT NULL AND bp.leave_type_id IS NOT NULL THEN 'org_unit_and_type'
            WHEN bp.org_unit_id IS NOT NULL THEN 'org_unit'
            WHEN bp.leave_type_id IS NOT NULL THEN 'leave_type'
            ELSE 'global'
        END::varchar(20) AS scope_type
    FROM app.blackout_periods bp
    WHERE bp.tenant_id = p_tenant_id
      AND bp.is_active = true
      -- Check for date overlap
      AND bp.start_date <= p_end_date
      AND bp.end_date >= p_start_date
      -- Check org unit scope (NULL = all org units, or specific match)
      AND (bp.org_unit_id IS NULL OR bp.org_unit_id = v_employee_org_unit_id)
      -- Check leave type scope (NULL = all leave types, or specific match)
      AND (bp.leave_type_id IS NULL OR bp.leave_type_id = p_leave_type_id)
    ORDER BY bp.is_hard_block DESC, bp.start_date;
END;
$$;

-- Function to check if a date range is hard blocked
-- Returns true if any hard block exists that prevents the request
CREATE OR REPLACE FUNCTION app.is_hard_blocked(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1
        FROM app.check_blackout_periods(p_tenant_id, p_employee_id, p_leave_type_id, p_start_date, p_end_date)
        WHERE is_hard_block = true
    );
END;
$$;

-- Function to get active blackout periods for a tenant
CREATE OR REPLACE FUNCTION app.get_active_blackout_periods(
    p_tenant_id uuid,
    p_from_date date DEFAULT CURRENT_DATE,
    p_to_date date DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    start_date date,
    end_date date,
    org_unit_id uuid,
    org_unit_name varchar(255),
    leave_type_id uuid,
    leave_type_name varchar(255),
    is_hard_block boolean,
    reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        bp.id,
        bp.name,
        bp.start_date,
        bp.end_date,
        bp.org_unit_id,
        ou.name AS org_unit_name,
        bp.leave_type_id,
        lt.name AS leave_type_name,
        bp.is_hard_block,
        bp.reason
    FROM app.blackout_periods bp
    LEFT JOIN app.org_units ou ON ou.id = bp.org_unit_id
    LEFT JOIN app.leave_types lt ON lt.id = bp.leave_type_id
    WHERE bp.tenant_id = p_tenant_id
      AND bp.is_active = true
      AND bp.end_date >= p_from_date
      AND (p_to_date IS NULL OR bp.start_date <= p_to_date)
    ORDER BY bp.start_date, bp.name;
END;
$$;

-- Function to get blackout periods for calendar display
-- Groups by date for efficient calendar rendering
CREATE OR REPLACE FUNCTION app.get_blackout_calendar(
    p_tenant_id uuid,
    p_start_date date,
    p_end_date date,
    p_org_unit_id uuid DEFAULT NULL
)
RETURNS TABLE (
    date date,
    blackout_count integer,
    has_hard_block boolean,
    blackout_names text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS date
    ),
    blackouts_expanded AS (
        SELECT
            d.date,
            bp.id,
            bp.name,
            bp.is_hard_block
        FROM date_series d
        INNER JOIN app.blackout_periods bp ON
            d.date BETWEEN bp.start_date AND bp.end_date
        WHERE bp.tenant_id = p_tenant_id
          AND bp.is_active = true
          AND (bp.org_unit_id IS NULL OR bp.org_unit_id = p_org_unit_id OR p_org_unit_id IS NULL)
    )
    SELECT
        be.date,
        COUNT(DISTINCT be.id)::integer AS blackout_count,
        BOOL_OR(be.is_hard_block) AS has_hard_block,
        STRING_AGG(DISTINCT be.name, ', ' ORDER BY be.name) AS blackout_names
    FROM blackouts_expanded be
    GROUP BY be.date
    ORDER BY be.date;
END;
$$;

-- Function to validate leave request against blackout periods
-- Returns validation result with details
CREATE OR REPLACE FUNCTION app.validate_against_blackout_periods(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    is_blocked boolean,
    block_type varchar(10),
    message text,
    blackout_details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_blackouts jsonb;
    v_has_hard_block boolean;
    v_has_soft_block boolean;
BEGIN
    -- Get all matching blackout periods as JSON
    SELECT
        jsonb_agg(jsonb_build_object(
            'id', blackout_id,
            'name', blackout_name,
            'start_date', blackout_start,
            'end_date', blackout_end,
            'is_hard_block', cbo.is_hard_block,
            'reason', cbo.reason
        )),
        BOOL_OR(cbo.is_hard_block),
        BOOL_OR(NOT cbo.is_hard_block)
    INTO v_blackouts, v_has_hard_block, v_has_soft_block
    FROM app.check_blackout_periods(p_tenant_id, p_employee_id, p_leave_type_id, p_start_date, p_end_date) cbo;

    -- Return validation result
    IF v_has_hard_block THEN
        RETURN QUERY SELECT
            true AS is_blocked,
            'hard'::varchar(10) AS block_type,
            'Leave request cannot be submitted. Your requested dates overlap with a restricted period.'::text AS message,
            v_blackouts AS blackout_details;
    ELSIF v_has_soft_block THEN
        RETURN QUERY SELECT
            false AS is_blocked,
            'soft'::varchar(10) AS block_type,
            'Warning: Your requested dates overlap with a restricted period. The request will require additional approval.'::text AS message,
            v_blackouts AS blackout_details;
    ELSE
        RETURN QUERY SELECT
            false AS is_blocked,
            'none'::varchar(10) AS block_type,
            NULL::text AS message,
            NULL::jsonb AS blackout_details;
    END IF;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.blackout_periods IS 'Periods where leave is restricted (soft=warning, hard=prevention)';
COMMENT ON COLUMN app.blackout_periods.id IS 'Primary UUID identifier for the blackout period';
COMMENT ON COLUMN app.blackout_periods.tenant_id IS 'Tenant that owns this blackout period';
COMMENT ON COLUMN app.blackout_periods.name IS 'Name/title of the blackout period';
COMMENT ON COLUMN app.blackout_periods.start_date IS 'Start date of the blackout (inclusive)';
COMMENT ON COLUMN app.blackout_periods.end_date IS 'End date of the blackout (inclusive)';
COMMENT ON COLUMN app.blackout_periods.org_unit_id IS 'Org unit scope (NULL = all org units)';
COMMENT ON COLUMN app.blackout_periods.leave_type_id IS 'Leave type scope (NULL = all leave types)';
COMMENT ON COLUMN app.blackout_periods.is_hard_block IS 'Hard block prevents requests, soft block shows warning';
COMMENT ON COLUMN app.blackout_periods.reason IS 'Explanation shown to employees';
COMMENT ON COLUMN app.blackout_periods.is_active IS 'Whether this blackout period is currently active';
COMMENT ON FUNCTION app.check_blackout_periods IS 'Returns blackout periods overlapping a leave request';
COMMENT ON FUNCTION app.is_hard_blocked IS 'Checks if any hard block prevents a request';
COMMENT ON FUNCTION app.get_active_blackout_periods IS 'Returns active blackout periods for admin view';
COMMENT ON FUNCTION app.get_blackout_calendar IS 'Returns blackout periods grouped by date for calendar';
COMMENT ON FUNCTION app.validate_against_blackout_periods IS 'Validates leave request against blackout periods';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.validate_against_blackout_periods(uuid, uuid, uuid, date, date);
-- DROP FUNCTION IF EXISTS app.get_blackout_calendar(uuid, date, date, uuid);
-- DROP FUNCTION IF EXISTS app.get_active_blackout_periods(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.is_hard_blocked(uuid, uuid, uuid, date, date);
-- DROP FUNCTION IF EXISTS app.check_blackout_periods(uuid, uuid, uuid, date, date);
-- DROP TRIGGER IF EXISTS update_blackout_periods_updated_at ON app.blackout_periods;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.blackout_periods;
-- DROP POLICY IF EXISTS tenant_isolation ON app.blackout_periods;
-- DROP INDEX IF EXISTS app.idx_blackout_periods_active;
-- DROP INDEX IF EXISTS app.idx_blackout_periods_hard_block;
-- DROP INDEX IF EXISTS app.idx_blackout_periods_leave_type;
-- DROP INDEX IF EXISTS app.idx_blackout_periods_org_unit;
-- DROP INDEX IF EXISTS app.idx_blackout_periods_date_range;
-- DROP TABLE IF EXISTS app.blackout_periods;
