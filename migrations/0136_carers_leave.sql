-- Migration: 0136_carers_leave
-- Created: 2026-03-13
-- Description: Carer's Leave support under the Carer's Leave Act 2023.
--              Day-one right from April 2024 — 1 week (5 days) unpaid leave per
--              year for employees with dependants needing long-term care.
--
--              This migration:
--              1. Seeds a 'CARERS' leave type into app.leave_types (per-tenant via
--                 a helper function that tenants call during onboarding or via a
--                 one-time seed). Because leave_types is tenant-scoped, we provide
--                 a reusable function rather than inserting rows directly.
--              2. Creates app.carers_leave_entitlements to track per-employee annual
--                 usage against the statutory 1-week cap.
--
--              Reference: Carer's Leave Act 2023 (c. 18)
--              https://www.legislation.gov.uk/ukpga/2023/18

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper function: seed carer's leave type for a tenant
-- -----------------------------------------------------------------------------
-- Tenants call this during setup to create the statutory carer's leave type.
-- Idempotent — does nothing if the code already exists for the tenant.

CREATE OR REPLACE FUNCTION app.seed_carers_leave_type(
    p_tenant_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_id uuid;
BEGIN
    -- Check if already exists
    SELECT id INTO v_id
    FROM app.leave_types
    WHERE tenant_id = p_tenant_id AND code = 'CARERS';

    IF v_id IS NOT NULL THEN
        RETURN v_id;
    END IF;

    v_id := gen_random_uuid();

    INSERT INTO app.leave_types (
        id, tenant_id, code, name, category, description,
        unit, requires_attachment, requires_approval,
        min_notice_days, max_consecutive_days,
        allow_negative_balance, is_paid, accrues, is_active, color
    ) VALUES (
        v_id,
        p_tenant_id,
        'CARERS',
        'Carer''s Leave',
        'unpaid',
        'Statutory unpaid leave for employees with dependants requiring long-term care. '
        || 'Day-one right under the Carer''s Leave Act 2023 (effective April 2024). '
        || '1 week (5 days) per rolling 12-month period. Can be taken as individual days or half days.',
        'days',
        false,       -- no attachment required
        true,        -- requires approval (employer can request reasonable notice)
        3,           -- 3 days minimum notice (employer may agree less)
        5,           -- max 5 consecutive days (full entitlement in one block)
        false,       -- no negative balance
        false,       -- unpaid leave
        false,       -- not accrual-based — granted from day one
        true,
        '#9C27B0'    -- purple
    );

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION app.seed_carers_leave_type IS
    'Seeds the statutory Carer''s Leave type for a tenant. Idempotent. Carer''s Leave Act 2023.';

-- -----------------------------------------------------------------------------
-- carers_leave_entitlements - Per-employee annual usage tracking
-- -----------------------------------------------------------------------------
-- Tracks how much of the 1-week statutory entitlement each employee has used
-- within a leave year. The leave year boundaries are configurable per tenant
-- (some use calendar year, others use April-March).

CREATE TABLE IF NOT EXISTS app.carers_leave_entitlements (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The employee
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Leave year boundaries (configurable per tenant/employee)
    leave_year_start date NOT NULL,
    leave_year_end date NOT NULL,

    -- Statutory entitlement: 1 week = 5 days for full-time,
    -- pro-rated for part-time workers
    total_days_available numeric(4,1) NOT NULL DEFAULT 5,

    -- Days consumed so far in this leave year
    days_used numeric(4,1) NOT NULL DEFAULT 0,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Leave year end must be after start
    CONSTRAINT carers_leave_year_range CHECK (
        leave_year_end > leave_year_start
    ),

    -- Total days available must be positive
    CONSTRAINT carers_leave_total_positive CHECK (
        total_days_available > 0
    ),

    -- Days used cannot be negative
    CONSTRAINT carers_leave_used_non_negative CHECK (
        days_used >= 0
    ),

    -- Days used cannot exceed entitlement
    CONSTRAINT carers_leave_used_within_limit CHECK (
        days_used <= total_days_available
    ),

    -- One record per employee per leave year
    CONSTRAINT carers_leave_unique_year UNIQUE (tenant_id, employee_id, leave_year_start)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: employee entitlement for current year
CREATE INDEX IF NOT EXISTS idx_carers_leave_ent_employee
    ON app.carers_leave_entitlements(tenant_id, employee_id);

-- Year-based queries
CREATE INDEX IF NOT EXISTS idx_carers_leave_ent_year
    ON app.carers_leave_entitlements(tenant_id, leave_year_start, leave_year_end);

-- Employees with remaining entitlement (for reporting)
CREATE INDEX IF NOT EXISTS idx_carers_leave_ent_remaining
    ON app.carers_leave_entitlements(tenant_id, employee_id)
    WHERE days_used < total_days_available;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.carers_leave_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.carers_leave_entitlements
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.carers_leave_entitlements
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_carers_leave_entitlements_updated_at
    BEFORE UPDATE ON app.carers_leave_entitlements
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Table Comments
-- =============================================================================

COMMENT ON TABLE app.carers_leave_entitlements IS
    'Day-one right from April 2024 under the Carer''s Leave Act 2023. '
    || '1 week unpaid leave per year for employees with dependants needing long-term care.';
COMMENT ON COLUMN app.carers_leave_entitlements.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.carers_leave_entitlements.tenant_id IS 'Tenant that owns this record';
COMMENT ON COLUMN app.carers_leave_entitlements.employee_id IS 'Employee receiving the entitlement';
COMMENT ON COLUMN app.carers_leave_entitlements.leave_year_start IS 'Start of the leave year for this entitlement period';
COMMENT ON COLUMN app.carers_leave_entitlements.leave_year_end IS 'End of the leave year for this entitlement period';
COMMENT ON COLUMN app.carers_leave_entitlements.total_days_available IS 'Total statutory entitlement in days (default 5 = 1 week). Pro-rated for part-time workers.';
COMMENT ON COLUMN app.carers_leave_entitlements.days_used IS 'Days consumed so far in this leave year';

-- =============================================================================
-- GRANT access to the application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.carers_leave_entitlements TO hris_app;
GRANT EXECUTE ON FUNCTION app.seed_carers_leave_type(uuid) TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- REVOKE EXECUTE ON FUNCTION app.seed_carers_leave_type(uuid) FROM hris_app;
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON app.carers_leave_entitlements FROM hris_app;
-- DROP TRIGGER IF EXISTS update_carers_leave_entitlements_updated_at ON app.carers_leave_entitlements;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.carers_leave_entitlements;
-- DROP POLICY IF EXISTS tenant_isolation ON app.carers_leave_entitlements;
-- DROP INDEX IF EXISTS app.idx_carers_leave_ent_remaining;
-- DROP INDEX IF EXISTS app.idx_carers_leave_ent_year;
-- DROP INDEX IF EXISTS app.idx_carers_leave_ent_employee;
-- DROP TABLE IF EXISTS app.carers_leave_entitlements;
-- DROP FUNCTION IF EXISTS app.seed_carers_leave_type(uuid);
