-- Migration: 0199_onboarding_compliance_checks
-- Created: 2026-03-17
-- Description: Create the onboarding_compliance_checks table for tracking
--              pre-employment compliance checks (Right to Work, DBS, references,
--              medical, qualifications) linked to onboarding instances.
--              Onboarding cannot be marked complete while required checks are
--              outstanding. TODO-254.
-- Reversible: Yes (DROP TABLE + DROP TYPE)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Compliance Check Type Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compliance_check_type') THEN
        CREATE TYPE app.compliance_check_type AS ENUM (
            'right_to_work',   -- UK Right to Work verification
            'dbs',             -- Disclosure and Barring Service check
            'references',      -- Employment / character references
            'medical',         -- Occupational health / fitness to work
            'qualifications'   -- Professional qualifications verification
        );
    END IF;
END $$;

COMMENT ON TYPE app.compliance_check_type IS 'Types of pre-employment compliance checks required during onboarding';

-- -----------------------------------------------------------------------------
-- Compliance Check Status Enum
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'compliance_check_status') THEN
        CREATE TYPE app.compliance_check_status AS ENUM (
            'pending',         -- Check not yet started
            'in_progress',     -- Check initiated, awaiting result
            'passed',          -- Check completed successfully
            'failed',          -- Check failed
            'waived'           -- Check waived (with authorisation)
        );
    END IF;
END $$;

COMMENT ON TYPE app.compliance_check_status IS 'Status of an onboarding compliance check. Only passed/waived allow onboarding completion.';

-- -----------------------------------------------------------------------------
-- Onboarding Compliance Checks Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.onboarding_compliance_checks (
    -- Primary identifier
    id              uuid                         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id       uuid                         NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Link to onboarding instance
    onboarding_id   uuid                         NOT NULL REFERENCES app.onboarding_instances(id) ON DELETE CASCADE,

    -- Employee (denormalised for efficient querying without joining instances)
    employee_id     uuid                         NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Type & status
    check_type      app.compliance_check_type    NOT NULL,
    status          app.compliance_check_status   NOT NULL DEFAULT 'pending',

    -- Whether this check is mandatory for onboarding completion
    required        boolean                      NOT NULL DEFAULT true,

    -- Scheduling
    due_date        date,

    -- Completion tracking
    completed_at    timestamptz,
    completed_by    uuid                         REFERENCES app.users(id) ON DELETE SET NULL,

    -- Supporting detail
    notes           text,

    -- Waiver tracking (populated when status = 'waived')
    waived_by       uuid                         REFERENCES app.users(id) ON DELETE SET NULL,
    waiver_reason   text,

    -- Reference number / external ID for the check (e.g. DBS certificate number)
    reference_number text,

    -- Expiry date (some checks like DBS have validity periods)
    expires_at      date,

    -- Standard timestamps
    created_at      timestamptz                  NOT NULL DEFAULT now(),
    updated_at      timestamptz                  NOT NULL DEFAULT now(),
    created_by      uuid                         REFERENCES app.users(id) ON DELETE SET NULL,

    -- Constraints --

    -- One check of each type per onboarding instance
    CONSTRAINT onboarding_compliance_checks_unique_type
        UNIQUE (tenant_id, onboarding_id, check_type),

    -- Completed checks must have a completion timestamp
    CONSTRAINT onboarding_compliance_checks_completed_has_ts CHECK (
        status NOT IN ('passed', 'failed') OR completed_at IS NOT NULL
    ),

    -- Waived checks must have waiver info
    CONSTRAINT onboarding_compliance_checks_waived_has_info CHECK (
        status != 'waived' OR (waived_by IS NOT NULL AND waiver_reason IS NOT NULL)
    ),

    -- Due date sanity (if provided)
    CONSTRAINT onboarding_compliance_checks_due_date_positive CHECK (
        due_date IS NULL OR due_date >= (created_at::date)
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Fast lookup by onboarding instance
CREATE INDEX IF NOT EXISTS idx_onboarding_compliance_onboarding
    ON app.onboarding_compliance_checks(tenant_id, onboarding_id);

-- Employee-level compliance overview
CREATE INDEX IF NOT EXISTS idx_onboarding_compliance_employee
    ON app.onboarding_compliance_checks(tenant_id, employee_id);

-- Outstanding checks (for dashboards / reminders)
CREATE INDEX IF NOT EXISTS idx_onboarding_compliance_outstanding
    ON app.onboarding_compliance_checks(tenant_id, status)
    WHERE status IN ('pending', 'in_progress');

-- Due date tracking (for overdue alerts)
CREATE INDEX IF NOT EXISTS idx_onboarding_compliance_due_date
    ON app.onboarding_compliance_checks(tenant_id, due_date)
    WHERE due_date IS NOT NULL AND status IN ('pending', 'in_progress');

-- Expiry tracking
CREATE INDEX IF NOT EXISTS idx_onboarding_compliance_expiry
    ON app.onboarding_compliance_checks(tenant_id, expires_at)
    WHERE expires_at IS NOT NULL AND status = 'passed';

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.onboarding_compliance_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.onboarding_compliance_checks
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.onboarding_compliance_checks
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_onboarding_compliance_checks_updated_at
    BEFORE UPDATE ON app.onboarding_compliance_checks
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Status transition validation trigger
CREATE OR REPLACE FUNCTION app.validate_compliance_check_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- If status hasn't changed, allow the update
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    CASE OLD.status
        WHEN 'pending' THEN
            IF NEW.status NOT IN ('in_progress', 'passed', 'failed', 'waived') THEN
                RAISE EXCEPTION 'Invalid compliance check status transition: pending -> %', NEW.status;
            END IF;

        WHEN 'in_progress' THEN
            IF NEW.status NOT IN ('passed', 'failed', 'waived') THEN
                RAISE EXCEPTION 'Invalid compliance check status transition: in_progress -> %', NEW.status;
            END IF;

        WHEN 'failed' THEN
            -- Failed checks can be retried (back to in_progress) or waived
            IF NEW.status NOT IN ('in_progress', 'waived') THEN
                RAISE EXCEPTION 'Invalid compliance check status transition: failed -> %', NEW.status;
            END IF;

        WHEN 'passed' THEN
            RAISE EXCEPTION 'Invalid compliance check status transition: passed is a terminal state';

        WHEN 'waived' THEN
            RAISE EXCEPTION 'Invalid compliance check status transition: waived is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown compliance check status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_compliance_check_status_transition
    BEFORE UPDATE OF status ON app.onboarding_compliance_checks
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_compliance_check_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Check whether all required compliance checks for an onboarding are satisfied.
-- Returns true only if every required check has status 'passed' or 'waived'.
CREATE OR REPLACE FUNCTION app.onboarding_compliance_satisfied(
    p_onboarding_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_unsatisfied_count integer;
BEGIN
    SELECT COUNT(*) INTO v_unsatisfied_count
    FROM app.onboarding_compliance_checks
    WHERE onboarding_id = p_onboarding_id
      AND required = true
      AND status NOT IN ('passed', 'waived');

    RETURN v_unsatisfied_count = 0;
END;
$$;

COMMENT ON FUNCTION app.onboarding_compliance_satisfied IS
    'Returns true when all required compliance checks for an onboarding instance are passed or waived';

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON app.onboarding_compliance_checks TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.onboarding_compliance_checks IS 'Pre-employment compliance checks linked to onboarding instances (RTW, DBS, references, medical, qualifications).';
COMMENT ON COLUMN app.onboarding_compliance_checks.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.onboarding_compliance_checks.tenant_id IS 'Tenant that owns this check';
COMMENT ON COLUMN app.onboarding_compliance_checks.onboarding_id IS 'Onboarding instance this check belongs to';
COMMENT ON COLUMN app.onboarding_compliance_checks.employee_id IS 'Employee being checked (denormalised from onboarding instance)';
COMMENT ON COLUMN app.onboarding_compliance_checks.check_type IS 'Type of compliance check';
COMMENT ON COLUMN app.onboarding_compliance_checks.status IS 'Current check status';
COMMENT ON COLUMN app.onboarding_compliance_checks.required IS 'Whether this check must pass/be waived before onboarding can complete';
COMMENT ON COLUMN app.onboarding_compliance_checks.due_date IS 'Date by which the check should be completed';
COMMENT ON COLUMN app.onboarding_compliance_checks.completed_at IS 'When the check was completed (passed or failed)';
COMMENT ON COLUMN app.onboarding_compliance_checks.completed_by IS 'User who recorded the check result';
COMMENT ON COLUMN app.onboarding_compliance_checks.notes IS 'Free-text notes about the check';
COMMENT ON COLUMN app.onboarding_compliance_checks.waived_by IS 'User who authorised the waiver';
COMMENT ON COLUMN app.onboarding_compliance_checks.waiver_reason IS 'Reason the check was waived';
COMMENT ON COLUMN app.onboarding_compliance_checks.reference_number IS 'External reference (e.g. DBS certificate number)';
COMMENT ON COLUMN app.onboarding_compliance_checks.expires_at IS 'Date when the check result expires';
COMMENT ON COLUMN app.onboarding_compliance_checks.created_by IS 'User who created the check record';
COMMENT ON FUNCTION app.validate_compliance_check_status_transition IS 'Enforces valid status transitions for compliance checks';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.onboarding_compliance_satisfied(uuid);
-- DROP TRIGGER IF EXISTS validate_compliance_check_status_transition ON app.onboarding_compliance_checks;
-- DROP FUNCTION IF EXISTS app.validate_compliance_check_status_transition();
-- DROP TRIGGER IF EXISTS update_onboarding_compliance_checks_updated_at ON app.onboarding_compliance_checks;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.onboarding_compliance_checks;
-- DROP POLICY IF EXISTS tenant_isolation ON app.onboarding_compliance_checks;
-- DROP INDEX IF EXISTS app.idx_onboarding_compliance_expiry;
-- DROP INDEX IF EXISTS app.idx_onboarding_compliance_due_date;
-- DROP INDEX IF EXISTS app.idx_onboarding_compliance_outstanding;
-- DROP INDEX IF EXISTS app.idx_onboarding_compliance_employee;
-- DROP INDEX IF EXISTS app.idx_onboarding_compliance_onboarding;
-- DROP TABLE IF EXISTS app.onboarding_compliance_checks;
-- DROP TYPE IF EXISTS app.compliance_check_status;
-- DROP TYPE IF EXISTS app.compliance_check_type;
