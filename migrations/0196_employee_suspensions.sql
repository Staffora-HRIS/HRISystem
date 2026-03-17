-- Migration: 0196_employee_suspensions
-- Created: 2026-03-17
-- Description: Create employee_suspensions table for disciplinary case suspension management (TODO-214)
--   - Tracks suspension type (with_pay / without_pay), dates, review schedules
--   - Links to disciplinary cases and employees
--   - Status lifecycle: active -> lifted | expired
--   - RLS enforced for multi-tenant isolation
--   - UK best practice: most suspensions should be on full pay pending investigation

-- =============================================================================
-- 1. Create suspension_type enum
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suspension_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.suspension_type AS ENUM ('with_pay', 'without_pay');
    END IF;
END
$$;

-- =============================================================================
-- 2. Create suspension_status enum
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suspension_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')) THEN
        CREATE TYPE app.suspension_status AS ENUM ('active', 'lifted', 'expired');
    END IF;
END
$$;

-- =============================================================================
-- 3. Create employee_suspensions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.employee_suspensions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    employee_id     uuid NOT NULL REFERENCES app.employees(id),
    case_id         uuid REFERENCES app.cases(id),

    -- Suspension details
    suspension_type app.suspension_type NOT NULL DEFAULT 'with_pay',
    start_date      date NOT NULL,
    end_date        date,
    reason          text NOT NULL,

    -- Authorization
    authorized_by   uuid NOT NULL REFERENCES app.users(id),

    -- Review tracking
    review_date     date,
    last_reviewed_at timestamptz,
    review_notes    text,

    -- Status
    status          app.suspension_status NOT NULL DEFAULT 'active',
    lifted_at       timestamptz,
    lifted_by       uuid REFERENCES app.users(id),
    lifted_reason   text,

    -- Metadata
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid REFERENCES app.users(id),

    -- Constraints
    CONSTRAINT employee_suspensions_valid_dates CHECK (
        end_date IS NULL OR end_date >= start_date
    ),
    CONSTRAINT employee_suspensions_review_after_start CHECK (
        review_date IS NULL OR review_date >= start_date
    ),
    CONSTRAINT employee_suspensions_lifted_requires_lifted_by CHECK (
        (status != 'lifted') OR (lifted_by IS NOT NULL AND lifted_at IS NOT NULL)
    )
);

-- =============================================================================
-- 4. Enable RLS
-- =============================================================================

ALTER TABLE app.employee_suspensions ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy (SELECT, UPDATE, DELETE)
CREATE POLICY employee_suspensions_tenant_isolation ON app.employee_suspensions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Tenant isolation policy (INSERT)
CREATE POLICY employee_suspensions_tenant_isolation_insert ON app.employee_suspensions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 5. Indexes
-- =============================================================================

-- Tenant + employee lookup (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_employee_suspensions_tenant_employee
    ON app.employee_suspensions(tenant_id, employee_id);

-- Case lookup (find suspensions for a disciplinary case)
CREATE INDEX IF NOT EXISTS idx_employee_suspensions_case
    ON app.employee_suspensions(case_id)
    WHERE case_id IS NOT NULL;

-- Active suspensions (for review reminders and status checks)
CREATE INDEX IF NOT EXISTS idx_employee_suspensions_active
    ON app.employee_suspensions(tenant_id, status)
    WHERE status = 'active';

-- Review date (for finding suspensions needing review)
CREATE INDEX IF NOT EXISTS idx_employee_suspensions_review_date
    ON app.employee_suspensions(review_date)
    WHERE status = 'active' AND review_date IS NOT NULL;

-- Employee active suspensions (prevent overlapping active suspensions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_suspensions_one_active_per_employee
    ON app.employee_suspensions(tenant_id, employee_id)
    WHERE status = 'active';

-- =============================================================================
-- 6. Auto-update updated_at trigger
-- =============================================================================

CREATE OR REPLACE TRIGGER update_employee_suspensions_updated_at
    BEFORE UPDATE ON app.employee_suspensions
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- 7. Grant permissions to app role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.employee_suspensions TO hris_app;

-- =============================================================================
-- 8. Comments
-- =============================================================================

COMMENT ON TABLE app.employee_suspensions IS 'Employee suspensions linked to disciplinary cases. UK best practice: suspensions should normally be on full pay pending investigation.';
COMMENT ON COLUMN app.employee_suspensions.suspension_type IS 'with_pay (default, recommended) or without_pay. Most UK suspensions should be on full pay.';
COMMENT ON COLUMN app.employee_suspensions.case_id IS 'Optional link to the parent HR case that triggered the suspension.';
COMMENT ON COLUMN app.employee_suspensions.authorized_by IS 'The manager or HR officer who authorized the suspension.';
COMMENT ON COLUMN app.employee_suspensions.review_date IS 'Next scheduled review date. Suspensions should be reviewed regularly to avoid indefinite suspension.';
COMMENT ON COLUMN app.employee_suspensions.status IS 'active: currently suspended; lifted: ended early by decision; expired: end_date has passed.';
COMMENT ON COLUMN app.employee_suspensions.lifted_reason IS 'Reason the suspension was lifted early (e.g., investigation concluded, charges dropped).';
COMMENT ON CONSTRAINT employee_suspensions_valid_dates ON app.employee_suspensions IS 'End date must be on or after start date.';
COMMENT ON INDEX app.idx_employee_suspensions_one_active_per_employee IS 'Prevents multiple active suspensions for the same employee in the same tenant.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_employee_suspensions_updated_at ON app.employee_suspensions;
-- DROP TABLE IF EXISTS app.employee_suspensions;
-- DROP TYPE IF EXISTS app.suspension_status;
-- DROP TYPE IF EXISTS app.suspension_type;
