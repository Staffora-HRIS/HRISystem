-- Migration: 0150_warnings
-- Created: 2026-03-13
-- Description: Employee warning management with expiry tracking
--              Supports UK disciplinary procedure: verbal, first written, final written
--              Warnings auto-expire after configurable periods and can be linked to cases
--
-- Expiry periods (UK ACAS Code of Practice defaults):
--   verbal:        6 months
--   first_written: 12 months
--   final_written: 12-24 months (default 12)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE app.warning_level AS ENUM ('verbal', 'first_written', 'final_written');

CREATE TYPE app.warning_status AS ENUM ('active', 'expired', 'rescinded', 'appealed');

-- -----------------------------------------------------------------------------
-- Employee Warnings Table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.employee_warnings (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee receiving the warning
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Optional link to a disciplinary case
    case_id uuid REFERENCES app.cases(id) ON DELETE SET NULL,

    -- Warning classification
    warning_level app.warning_level NOT NULL,
    status app.warning_status NOT NULL DEFAULT 'active',

    -- Dates
    issued_date date NOT NULL,
    expiry_date date NOT NULL,

    -- Issuer
    issued_by uuid NOT NULL,

    -- Warning details
    reason text NOT NULL,
    details text,

    -- Hearing information
    hearing_date date,
    companion_present boolean NOT NULL DEFAULT false,
    companion_name varchar(255),

    -- Appeal tracking
    appeal_deadline date,
    appealed boolean NOT NULL DEFAULT false,
    appeal_date date,
    appeal_outcome varchar(50),
    appeal_notes text,

    -- Rescission tracking
    rescinded_date date,
    rescinded_by uuid,
    rescinded_reason text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT employee_warnings_appeal_outcome_valid CHECK (
        appeal_outcome IS NULL OR appeal_outcome IN ('upheld', 'overturned', 'modified')
    ),

    CONSTRAINT employee_warnings_appeal_consistency CHECK (
        (appealed = false AND appeal_date IS NULL AND appeal_outcome IS NULL)
        OR (appealed = true AND appeal_date IS NOT NULL)
    ),

    CONSTRAINT employee_warnings_rescinded_consistency CHECK (
        (status != 'rescinded') OR (
            rescinded_date IS NOT NULL
            AND rescinded_by IS NOT NULL
            AND rescinded_reason IS NOT NULL
        )
    ),

    CONSTRAINT employee_warnings_expiry_after_issued CHECK (
        expiry_date > issued_date
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Employee warning lookup
CREATE INDEX IF NOT EXISTS idx_employee_warnings_tenant_employee
    ON app.employee_warnings(tenant_id, employee_id);

-- Status-based queries
CREATE INDEX IF NOT EXISTS idx_employee_warnings_tenant_status
    ON app.employee_warnings(tenant_id, status);

-- Active warnings approaching expiry (for batch expiry job)
CREATE INDEX IF NOT EXISTS idx_employee_warnings_tenant_expiry_active
    ON app.employee_warnings(tenant_id, expiry_date)
    WHERE status = 'active';

-- Case linkage
CREATE INDEX IF NOT EXISTS idx_employee_warnings_case
    ON app.employee_warnings(case_id)
    WHERE case_id IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.employee_warnings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see warnings for their current tenant
CREATE POLICY tenant_isolation ON app.employee_warnings
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.employee_warnings
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_employee_warnings_updated_at
    BEFORE UPDATE ON app.employee_warnings
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.employee_warnings IS 'Employee disciplinary warnings with expiry tracking. Follows UK ACAS Code of Practice.';
COMMENT ON COLUMN app.employee_warnings.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.employee_warnings.tenant_id IS 'Tenant where this warning exists';
COMMENT ON COLUMN app.employee_warnings.employee_id IS 'Employee receiving the warning';
COMMENT ON COLUMN app.employee_warnings.case_id IS 'Optional link to a disciplinary case';
COMMENT ON COLUMN app.employee_warnings.warning_level IS 'Warning severity: verbal, first_written, final_written';
COMMENT ON COLUMN app.employee_warnings.status IS 'Current status: active, expired, rescinded, appealed';
COMMENT ON COLUMN app.employee_warnings.issued_date IS 'Date the warning was formally issued';
COMMENT ON COLUMN app.employee_warnings.expiry_date IS 'Date the warning expires (verbal=6mo, first_written=12mo, final_written=12-24mo)';
COMMENT ON COLUMN app.employee_warnings.issued_by IS 'UUID of the user who issued the warning';
COMMENT ON COLUMN app.employee_warnings.reason IS 'Reason for issuing the warning';
COMMENT ON COLUMN app.employee_warnings.details IS 'Additional details about the warning';
COMMENT ON COLUMN app.employee_warnings.hearing_date IS 'Date of the disciplinary hearing';
COMMENT ON COLUMN app.employee_warnings.companion_present IS 'Whether the employee had a companion at the hearing';
COMMENT ON COLUMN app.employee_warnings.companion_name IS 'Name of the companion present at the hearing';
COMMENT ON COLUMN app.employee_warnings.appeal_deadline IS 'Deadline for the employee to appeal the warning';
COMMENT ON COLUMN app.employee_warnings.appealed IS 'Whether the warning has been appealed';
COMMENT ON COLUMN app.employee_warnings.appeal_date IS 'Date the appeal was submitted';
COMMENT ON COLUMN app.employee_warnings.appeal_outcome IS 'Result of the appeal: upheld, overturned, modified';
COMMENT ON COLUMN app.employee_warnings.appeal_notes IS 'Notes about the appeal outcome';
COMMENT ON COLUMN app.employee_warnings.rescinded_date IS 'Date the warning was rescinded';
COMMENT ON COLUMN app.employee_warnings.rescinded_by IS 'UUID of the user who rescinded the warning';
COMMENT ON COLUMN app.employee_warnings.rescinded_reason IS 'Reason for rescinding the warning';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_employee_warnings_updated_at ON app.employee_warnings;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.employee_warnings;
-- DROP POLICY IF EXISTS tenant_isolation ON app.employee_warnings;
-- DROP INDEX IF EXISTS app.idx_employee_warnings_case;
-- DROP INDEX IF EXISTS app.idx_employee_warnings_tenant_expiry_active;
-- DROP INDEX IF EXISTS app.idx_employee_warnings_tenant_status;
-- DROP INDEX IF EXISTS app.idx_employee_warnings_tenant_employee;
-- DROP TABLE IF EXISTS app.employee_warnings;
-- DROP TYPE IF EXISTS app.warning_status;
-- DROP TYPE IF EXISTS app.warning_level;
