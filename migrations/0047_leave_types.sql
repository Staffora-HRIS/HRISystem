-- Migration: 0047_leave_types
-- Created: 2026-01-07
-- Description: Create the leave_types table - defines types of leave available
--              Examples: Annual Leave, Sick Leave, Parental Leave, etc.
--              Each tenant can configure their own leave types with specific rules
--              Supports both day-based and hour-based leave tracking

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leave Types Table
-- -----------------------------------------------------------------------------
-- Defines the types of leave available in the system
-- Each leave type has configurable rules for evidence requirements,
-- approval workflows, notice periods, and maximum consecutive days
CREATE TABLE IF NOT EXISTS app.leave_types (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this leave type
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Unique code within tenant (e.g., 'ANNUAL', 'SICK', 'MATERNITY')
    -- Used for programmatic reference and API calls
    code varchar(50) NOT NULL,

    -- Human-readable name (e.g., 'Annual Leave', 'Sick Leave')
    name varchar(255) NOT NULL,

    -- Category for grouping and applying category-specific rules
    category app.leave_type_category NOT NULL,

    -- Detailed description of the leave type and its usage
    description text,

    -- Unit of measurement for this leave type
    -- 'days' for traditional day-based leave
    -- 'hours' for flexible/hourly leave tracking
    unit app.leave_unit NOT NULL DEFAULT 'days',

    -- Whether supporting documents are required for this leave type
    -- Common for sick leave (medical certificate) or bereavement (death certificate)
    requires_attachment boolean NOT NULL DEFAULT false,

    -- Whether this leave type requires approval workflow
    -- Some leave types (e.g., jury duty) may be auto-approved
    requires_approval boolean NOT NULL DEFAULT true,

    -- Minimum number of days notice required before leave starts
    -- 0 = no notice required (e.g., sick leave)
    -- 14 = two weeks notice (e.g., annual leave during peak periods)
    min_notice_days integer NOT NULL DEFAULT 0,

    -- Maximum consecutive days allowed for a single request
    -- NULL = no limit
    -- Useful for preventing extended absences without HR review
    max_consecutive_days integer,

    -- Whether employees can go into negative balance
    -- Useful for new employees who haven't accrued leave yet
    -- Typically requires special approval
    allow_negative_balance boolean NOT NULL DEFAULT false,

    -- Whether this leave type is paid
    -- Used for downstream entitlement/analytics classification
    is_paid boolean NOT NULL DEFAULT true,

    -- Whether this leave type accrues over time
    -- false = granted upfront (e.g., bereavement days)
    -- true = builds up over employment period (e.g., annual leave)
    accrues boolean NOT NULL DEFAULT true,

    -- Whether this leave type is currently active and can be used
    -- Inactive types are hidden from employees but preserved for history
    is_active boolean NOT NULL DEFAULT true,

    -- Color code for UI display in calendars (hex format)
    -- e.g., '#4CAF50' for green (annual), '#F44336' for red (sick)
    color varchar(7),

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Code must be unique within tenant
    CONSTRAINT leave_types_code_unique UNIQUE (tenant_id, code),

    -- Code format: uppercase alphanumeric with underscores
    CONSTRAINT leave_types_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),

    -- Min notice days must be non-negative
    CONSTRAINT leave_types_min_notice_check CHECK (min_notice_days >= 0),

    -- Max consecutive days must be positive if specified
    CONSTRAINT leave_types_max_consecutive_check CHECK (
        max_consecutive_days IS NULL OR max_consecutive_days > 0
    ),

    -- Color must be valid hex format if specified
    CONSTRAINT leave_types_color_format CHECK (
        color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + code
CREATE INDEX IF NOT EXISTS idx_leave_types_tenant_code
    ON app.leave_types(tenant_id, code);

-- Category filtering
CREATE INDEX IF NOT EXISTS idx_leave_types_tenant_category
    ON app.leave_types(tenant_id, category);

-- Active leave types (common filter)
CREATE INDEX IF NOT EXISTS idx_leave_types_tenant_active
    ON app.leave_types(tenant_id)
    WHERE is_active = true;

-- Paid leave types (for reporting/analytics)
CREATE INDEX IF NOT EXISTS idx_leave_types_tenant_paid
    ON app.leave_types(tenant_id)
    WHERE is_paid = true AND is_active = true;

-- Accruing leave types (for accrual batch processing)
CREATE INDEX IF NOT EXISTS idx_leave_types_tenant_accrues
    ON app.leave_types(tenant_id)
    WHERE accrues = true AND is_active = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.leave_types ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see leave types for their current tenant
CREATE POLICY tenant_isolation ON app.leave_types
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.leave_types
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_leave_types_updated_at
    BEFORE UPDATE ON app.leave_types
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get all active leave types for a tenant
CREATE OR REPLACE FUNCTION app.get_active_leave_types(
    p_tenant_id uuid
)
RETURNS TABLE (
    id uuid,
    code varchar(50),
    name varchar(255),
    category app.leave_type_category,
    unit app.leave_unit,
    requires_attachment boolean,
    requires_approval boolean,
    is_paid boolean,
    color varchar(7)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lt.id,
        lt.code,
        lt.name,
        lt.category,
        lt.unit,
        lt.requires_attachment,
        lt.requires_approval,
        lt.is_paid,
        lt.color
    FROM app.leave_types lt
    WHERE lt.tenant_id = p_tenant_id
      AND lt.is_active = true
    ORDER BY lt.category, lt.name;
END;
$$;

-- Function to get leave type by code
CREATE OR REPLACE FUNCTION app.get_leave_type_by_code(
    p_tenant_id uuid,
    p_code varchar(50)
)
RETURNS TABLE (
    id uuid,
    code varchar(50),
    name varchar(255),
    category app.leave_type_category,
    description text,
    unit app.leave_unit,
    requires_attachment boolean,
    requires_approval boolean,
    min_notice_days integer,
    max_consecutive_days integer,
    allow_negative_balance boolean,
    is_paid boolean,
    accrues boolean,
    is_active boolean,
    color varchar(7)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lt.id,
        lt.code,
        lt.name,
        lt.category,
        lt.description,
        lt.unit,
        lt.requires_attachment,
        lt.requires_approval,
        lt.min_notice_days,
        lt.max_consecutive_days,
        lt.allow_negative_balance,
        lt.is_paid,
        lt.accrues,
        lt.is_active,
        lt.color
    FROM app.leave_types lt
    WHERE lt.tenant_id = p_tenant_id
      AND lt.code = p_code;
END;
$$;

-- Function to validate leave request against leave type rules
CREATE OR REPLACE FUNCTION app.validate_leave_type_rules(
    p_leave_type_id uuid,
    p_start_date date,
    p_duration numeric
)
RETURNS TABLE (
    is_valid boolean,
    error_code varchar(50),
    error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_leave_type app.leave_types%ROWTYPE;
    v_notice_days integer;
BEGIN
    -- Get leave type details
    SELECT * INTO v_leave_type
    FROM app.leave_types
    WHERE id = p_leave_type_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'LEAVE_TYPE_NOT_FOUND'::varchar(50), 'Leave type not found'::text;
        RETURN;
    END IF;

    -- Check if leave type is active
    IF NOT v_leave_type.is_active THEN
        RETURN QUERY SELECT false, 'LEAVE_TYPE_INACTIVE'::varchar(50), 'This leave type is no longer active'::text;
        RETURN;
    END IF;

    -- Check minimum notice period
    v_notice_days := p_start_date - CURRENT_DATE;
    IF v_notice_days < v_leave_type.min_notice_days THEN
        RETURN QUERY SELECT false, 'INSUFFICIENT_NOTICE'::varchar(50),
            format('This leave type requires %s days notice. You provided %s days.', v_leave_type.min_notice_days, v_notice_days)::text;
        RETURN;
    END IF;

    -- Check maximum consecutive days
    IF v_leave_type.max_consecutive_days IS NOT NULL AND p_duration > v_leave_type.max_consecutive_days THEN
        RETURN QUERY SELECT false, 'EXCEEDS_MAX_CONSECUTIVE'::varchar(50),
            format('This leave type allows maximum %s consecutive days. You requested %s days.', v_leave_type.max_consecutive_days, p_duration)::text;
        RETURN;
    END IF;

    -- All validations passed
    RETURN QUERY SELECT true, NULL::varchar(50), NULL::text;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.leave_types IS 'Leave type definitions with configurable rules for evidence, approval, notice periods, and limits';
COMMENT ON COLUMN app.leave_types.id IS 'Primary UUID identifier for the leave type';
COMMENT ON COLUMN app.leave_types.tenant_id IS 'Tenant that owns this leave type';
COMMENT ON COLUMN app.leave_types.code IS 'Unique code within tenant (uppercase alphanumeric with underscores)';
COMMENT ON COLUMN app.leave_types.name IS 'Human-readable name for display';
COMMENT ON COLUMN app.leave_types.category IS 'Category for grouping: annual, sick, personal, parental, etc.';
COMMENT ON COLUMN app.leave_types.description IS 'Detailed description of the leave type and usage rules';
COMMENT ON COLUMN app.leave_types.unit IS 'Unit of measurement: days or hours';
COMMENT ON COLUMN app.leave_types.requires_attachment IS 'Whether supporting documents are required';
COMMENT ON COLUMN app.leave_types.requires_approval IS 'Whether approval workflow is needed';
COMMENT ON COLUMN app.leave_types.min_notice_days IS 'Minimum days notice before leave can start';
COMMENT ON COLUMN app.leave_types.max_consecutive_days IS 'Maximum days allowed in a single request (NULL = unlimited)';
COMMENT ON COLUMN app.leave_types.allow_negative_balance IS 'Whether employees can go into negative balance';
COMMENT ON COLUMN app.leave_types.is_paid IS 'Whether this leave type is paid';
COMMENT ON COLUMN app.leave_types.accrues IS 'Whether entitlement accrues over time vs. granted upfront';
COMMENT ON COLUMN app.leave_types.is_active IS 'Whether this leave type is currently available for use';
COMMENT ON COLUMN app.leave_types.color IS 'Hex color code for UI display (e.g., #4CAF50)';
COMMENT ON FUNCTION app.get_active_leave_types IS 'Returns all active leave types for a tenant';
COMMENT ON FUNCTION app.get_leave_type_by_code IS 'Returns a leave type by its code';
COMMENT ON FUNCTION app.validate_leave_type_rules IS 'Validates a leave request against leave type rules';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.validate_leave_type_rules(uuid, date, numeric);
-- DROP FUNCTION IF EXISTS app.get_leave_type_by_code(uuid, varchar);
-- DROP FUNCTION IF EXISTS app.get_active_leave_types(uuid);
-- DROP TRIGGER IF EXISTS update_leave_types_updated_at ON app.leave_types;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.leave_types;
-- DROP POLICY IF EXISTS tenant_isolation ON app.leave_types;
-- DROP INDEX IF EXISTS app.idx_leave_types_tenant_accrues;
-- DROP INDEX IF EXISTS app.idx_leave_types_tenant_paid;
-- DROP INDEX IF EXISTS app.idx_leave_types_tenant_active;
-- DROP INDEX IF EXISTS app.idx_leave_types_tenant_category;
-- DROP INDEX IF EXISTS app.idx_leave_types_tenant_code;
-- DROP TABLE IF EXISTS app.leave_types;
