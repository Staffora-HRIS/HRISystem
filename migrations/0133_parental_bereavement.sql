-- Migration: 0133_parental_bereavement
-- Created: 2026-03-13
-- Description: Parental Bereavement Leave ("Jack's Law") tables for UK compliance.
--              Implements the Parental Bereavement (Leave and Pay) Act 2018.
--
--              Key rules:
--              - Bereaved parents entitled to 2 weeks' leave
--              - Can be taken as 1 block of 2 weeks, or 2 separate blocks of 1 week
--              - Must be taken within 56 weeks of the child's death
--              - Available from day one of employment
--              - SPBP (Statutory Parental Bereavement Pay) requires 26 weeks continuous employment
--                and earnings above the Lower Earnings Limit
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: parental_bereavement_status
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE app.parental_bereavement_status AS ENUM (
    'pending',
    'approved',
    'active',
    'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- parental_bereavement_leave - Jack's Law leave records
-- -----------------------------------------------------------------------------
-- Tracks parental bereavement leave entitlement and usage.
-- Employees are entitled to 2 weeks of leave following the death of a child
-- under 18, or a stillbirth after 24 weeks of pregnancy.

CREATE TABLE IF NOT EXISTS app.parental_bereavement_leave (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The bereaved employee
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Details of the bereavement
    child_name varchar(255) NOT NULL,
    date_of_death date NOT NULL,

    -- Leave period (maximum 2 weeks / 14 days)
    leave_start_date date NOT NULL,
    leave_end_date date NOT NULL,

    -- Statutory Parental Bereavement Pay eligibility
    -- Requires 26 weeks continuous employment and earnings above LEL
    spbp_eligible boolean NOT NULL DEFAULT false,
    spbp_rate_weekly numeric(10, 2),

    -- Workflow status
    status app.parental_bereavement_status NOT NULL DEFAULT 'pending',

    -- Additional information
    notes text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Business constraints
    -- Leave end date must be on or after start date
    CONSTRAINT pbl_dates_valid CHECK (
        leave_end_date >= leave_start_date
    ),
    -- Maximum 2 weeks (14 days) of leave per record
    CONSTRAINT pbl_max_two_weeks CHECK (
        leave_end_date - leave_start_date <= 14
    ),
    -- Leave must be taken within 56 weeks of the child's death
    CONSTRAINT pbl_within_56_weeks CHECK (
        leave_start_date <= date_of_death + INTERVAL '56 weeks'
    ),
    -- Leave cannot start before the date of death
    CONSTRAINT pbl_after_death CHECK (
        leave_start_date >= date_of_death
    ),
    -- SPBP rate requires eligibility
    CONSTRAINT pbl_spbp_rate_requires_eligible CHECK (
        spbp_rate_weekly IS NULL OR spbp_eligible = true
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_pbl_tenant_employee
    ON app.parental_bereavement_leave(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_pbl_tenant_status
    ON app.parental_bereavement_leave(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_pbl_date_of_death
    ON app.parental_bereavement_leave(tenant_id, date_of_death DESC);

CREATE INDEX IF NOT EXISTS idx_pbl_leave_dates
    ON app.parental_bereavement_leave(tenant_id, leave_start_date, leave_end_date);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.parental_bereavement_leave ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.parental_bereavement_leave
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.parental_bereavement_leave
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_parental_bereavement_leave_updated_at
    BEFORE UPDATE ON app.parental_bereavement_leave
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Table Comments
-- =============================================================================

COMMENT ON TABLE app.parental_bereavement_leave IS 'Parental bereavement leave records (Jack''s Law). Parental Bereavement (Leave and Pay) Act 2018. Bereaved parents entitled to 2 weeks leave within 56 weeks of child''s death.';

-- =============================================================================
-- GRANT access to the application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.parental_bereavement_leave TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_parental_bereavement_leave_updated_at ON app.parental_bereavement_leave;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.parental_bereavement_leave;
-- DROP POLICY IF EXISTS tenant_isolation ON app.parental_bereavement_leave;
-- DROP INDEX IF EXISTS app.idx_pbl_leave_dates;
-- DROP INDEX IF EXISTS app.idx_pbl_date_of_death;
-- DROP INDEX IF EXISTS app.idx_pbl_tenant_status;
-- DROP INDEX IF EXISTS app.idx_pbl_tenant_employee;
-- DROP TABLE IF EXISTS app.parental_bereavement_leave;
-- DROP TYPE IF EXISTS app.parental_bereavement_status;
