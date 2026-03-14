-- Migration: 0158_time_policies
-- Created: 2026-03-14
-- Description: Create time_policies and employee_time_policy_assignments tables
--              Time policies define standard working hours, break rules, and
--              overtime settings. Employees are assigned to policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Time Policy Type Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'time_policy_type') THEN
        CREATE TYPE app.time_policy_type AS ENUM (
            'standard',     -- Fixed 9-to-5 style schedule
            'flexible',     -- Flexible working hours (core hours + flex)
            'shift',        -- Shift-based rotational schedule
            'compressed'    -- Compressed work week (e.g., 4x10)
        );
    END IF;
END $$;

COMMENT ON TYPE app.time_policy_type IS 'Types of time policies: standard, flexible, shift, compressed';

-- -----------------------------------------------------------------------------
-- Time Policy Status Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'time_policy_status') THEN
        CREATE TYPE app.time_policy_status AS ENUM (
            'active',       -- Currently in use
            'inactive'      -- Deactivated (soft-deleted)
        );
    END IF;
END $$;

COMMENT ON TYPE app.time_policy_status IS 'Time policy status: active or inactive';

-- -----------------------------------------------------------------------------
-- Time Policies Table
-- -----------------------------------------------------------------------------
-- Defines working hour policies including break rules and overtime thresholds.
-- Each tenant can have multiple policies and one default.
CREATE TABLE IF NOT EXISTS app.time_policies (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this policy
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Policy name (e.g., "Standard Office Hours", "Flexible Remote")
    name varchar(255) NOT NULL,

    -- Optional description
    description text,

    -- Policy type classification
    policy_type app.time_policy_type NOT NULL DEFAULT 'standard',

    -- Default working hours
    default_start_time time,      -- e.g., 09:00 (NULL for flexible)
    default_end_time time,        -- e.g., 17:00 (NULL for flexible)

    -- Working hours configuration
    working_hours_per_day numeric(4, 2) NOT NULL DEFAULT 8.0,
    working_days_per_week smallint NOT NULL DEFAULT 5,

    -- Break configuration
    break_duration_minutes smallint NOT NULL DEFAULT 60,

    -- Overtime configuration
    overtime_enabled boolean NOT NULL DEFAULT true,
    overtime_threshold_daily numeric(4, 2),       -- Hours per day before overtime
    overtime_threshold_weekly numeric(5, 2),      -- Hours per week before overtime
    overtime_rate_multiplier numeric(3, 2) NOT NULL DEFAULT 1.5,

    -- Whether this is the default policy for the tenant
    is_default boolean NOT NULL DEFAULT false,

    -- Current status
    status app.time_policy_status NOT NULL DEFAULT 'active',

    -- Audit fields
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT time_policies_hours_positive CHECK (working_hours_per_day > 0 AND working_hours_per_day <= 24),
    CONSTRAINT time_policies_days_valid CHECK (working_days_per_week >= 1 AND working_days_per_week <= 7),
    CONSTRAINT time_policies_break_positive CHECK (break_duration_minutes >= 0 AND break_duration_minutes <= 480),
    CONSTRAINT time_policies_ot_daily_positive CHECK (overtime_threshold_daily IS NULL OR overtime_threshold_daily > 0),
    CONSTRAINT time_policies_ot_weekly_positive CHECK (overtime_threshold_weekly IS NULL OR overtime_threshold_weekly > 0),
    CONSTRAINT time_policies_ot_multiplier_valid CHECK (overtime_rate_multiplier >= 1.0),
    CONSTRAINT time_policies_start_end_check CHECK (
        (default_start_time IS NULL AND default_end_time IS NULL) OR
        (default_start_time IS NOT NULL AND default_end_time IS NOT NULL)
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup by tenant
CREATE INDEX IF NOT EXISTS idx_time_policies_tenant
    ON app.time_policies(tenant_id);

-- Active policies
CREATE INDEX IF NOT EXISTS idx_time_policies_tenant_active
    ON app.time_policies(tenant_id)
    WHERE status = 'active';

-- Default policy lookup (should be unique per tenant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_policies_tenant_default
    ON app.time_policies(tenant_id)
    WHERE is_default = true AND status = 'active';

-- Name uniqueness within tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_policies_tenant_name
    ON app.time_policies(tenant_id, name)
    WHERE status = 'active';

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.time_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.time_policies
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.time_policies
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_time_policies_updated_at
    BEFORE UPDATE ON app.time_policies
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Employee Time Policy Assignments Table
-- =============================================================================
-- Links employees to time policies with effective dating.
-- An employee has exactly one active policy assignment at any time.
CREATE TABLE IF NOT EXISTS app.employee_time_policy_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    policy_id uuid NOT NULL REFERENCES app.time_policies(id) ON DELETE RESTRICT,

    -- Effective dating
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,    -- NULL = currently active

    -- Audit
    assigned_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT etpa_effective_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);

-- =============================================================================
-- Indexes for assignments
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_etpa_tenant_employee
    ON app.employee_time_policy_assignments(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_etpa_policy
    ON app.employee_time_policy_assignments(policy_id);

-- Current assignment lookup
CREATE INDEX IF NOT EXISTS idx_etpa_current
    ON app.employee_time_policy_assignments(tenant_id, employee_id, effective_from)
    WHERE effective_to IS NULL;

-- =============================================================================
-- Row Level Security for assignments
-- =============================================================================

ALTER TABLE app.employee_time_policy_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.employee_time_policy_assignments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.employee_time_policy_assignments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers for assignments
-- =============================================================================

CREATE TRIGGER update_etpa_updated_at
    BEFORE UPDATE ON app.employee_time_policy_assignments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.time_policies IS 'Time and attendance policies defining working hours, breaks, and overtime rules per tenant.';
COMMENT ON COLUMN app.time_policies.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.time_policies.tenant_id IS 'Tenant that owns this policy';
COMMENT ON COLUMN app.time_policies.name IS 'Policy display name';
COMMENT ON COLUMN app.time_policies.policy_type IS 'Policy classification (standard, flexible, shift, compressed)';
COMMENT ON COLUMN app.time_policies.default_start_time IS 'Default daily start time (NULL for flexible)';
COMMENT ON COLUMN app.time_policies.default_end_time IS 'Default daily end time (NULL for flexible)';
COMMENT ON COLUMN app.time_policies.working_hours_per_day IS 'Expected working hours per day';
COMMENT ON COLUMN app.time_policies.working_days_per_week IS 'Expected working days per week';
COMMENT ON COLUMN app.time_policies.break_duration_minutes IS 'Standard break duration in minutes';
COMMENT ON COLUMN app.time_policies.overtime_enabled IS 'Whether overtime tracking is enabled';
COMMENT ON COLUMN app.time_policies.overtime_threshold_daily IS 'Daily hours before overtime kicks in';
COMMENT ON COLUMN app.time_policies.overtime_threshold_weekly IS 'Weekly hours before overtime kicks in';
COMMENT ON COLUMN app.time_policies.overtime_rate_multiplier IS 'Overtime pay multiplier (e.g., 1.5)';
COMMENT ON COLUMN app.time_policies.is_default IS 'Whether this is the default policy for the tenant';
COMMENT ON COLUMN app.time_policies.status IS 'Active or inactive status';

COMMENT ON TABLE app.employee_time_policy_assignments IS 'Links employees to time policies with effective dating.';
COMMENT ON COLUMN app.employee_time_policy_assignments.employee_id IS 'Employee assigned to the policy';
COMMENT ON COLUMN app.employee_time_policy_assignments.policy_id IS 'The time policy assigned';
COMMENT ON COLUMN app.employee_time_policy_assignments.effective_from IS 'When the assignment starts';
COMMENT ON COLUMN app.employee_time_policy_assignments.effective_to IS 'When the assignment ends (NULL = current)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_etpa_updated_at ON app.employee_time_policy_assignments;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.employee_time_policy_assignments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.employee_time_policy_assignments;
-- DROP INDEX IF EXISTS app.idx_etpa_current;
-- DROP INDEX IF EXISTS app.idx_etpa_policy;
-- DROP INDEX IF EXISTS app.idx_etpa_tenant_employee;
-- DROP TABLE IF EXISTS app.employee_time_policy_assignments;
-- DROP TRIGGER IF EXISTS update_time_policies_updated_at ON app.time_policies;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.time_policies;
-- DROP POLICY IF EXISTS tenant_isolation ON app.time_policies;
-- DROP INDEX IF EXISTS app.idx_time_policies_tenant_name;
-- DROP INDEX IF EXISTS app.idx_time_policies_tenant_default;
-- DROP INDEX IF EXISTS app.idx_time_policies_tenant_active;
-- DROP INDEX IF EXISTS app.idx_time_policies_tenant;
-- DROP TABLE IF EXISTS app.time_policies;
-- DROP TYPE IF EXISTS app.time_policy_status;
-- DROP TYPE IF EXISTS app.time_policy_type;
