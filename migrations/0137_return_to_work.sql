-- Migration: 0137_return_to_work
-- Created: 2026-03-13
-- Description: Return-to-work interview records.
--              Best practice for managing absence: conduct a return-to-work
--              interview after every period of absence. Covers:
--              - Fit-for-work assessment
--              - Adjustments or phased return planning
--              - Occupational health referral tracking
--              - Linking to the original leave request (optional)
--
--              Supports the Bradford Factor / absence management policy by
--              providing structured data on each return episode.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- return_to_work_interviews - Post-absence interview records
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.return_to_work_interviews (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant isolation
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The employee returning from absence
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Optional link to the formal leave request that triggered this interview.
    -- NULL when the absence was recorded outside the leave-request workflow
    -- (e.g., unplanned sick leave tracked manually).
    leave_request_id uuid REFERENCES app.leave_requests(id) ON DELETE SET NULL,

    -- Absence period covered by this interview
    absence_start_date date NOT NULL,
    absence_end_date date NOT NULL,

    -- When the interview took place
    interview_date date NOT NULL,

    -- The manager or HR representative who conducted the interview
    interviewer_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,

    -- Core assessment fields
    -- Whether the employee is fit to return to their normal duties
    fit_for_work boolean NOT NULL,

    -- Any workplace adjustments needed (e.g., phased return, modified duties,
    -- ergonomic changes, flexible hours)
    adjustments_needed text,

    -- Whether a referral to occupational health has been made
    referral_to_occupational_health boolean NOT NULL DEFAULT false,

    -- Free-text notes from the interview (confidential)
    notes text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Absence end must be on or after start
    CONSTRAINT rtw_absence_date_range CHECK (
        absence_end_date >= absence_start_date
    ),

    -- Interview must be on or after the absence end date
    CONSTRAINT rtw_interview_after_absence CHECK (
        interview_date >= absence_end_date
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: interviews for an employee within a tenant
CREATE INDEX IF NOT EXISTS idx_rtw_interviews_tenant_employee
    ON app.return_to_work_interviews(tenant_id, employee_id);

-- Chronological listing for dashboards and reports
CREATE INDEX IF NOT EXISTS idx_rtw_interviews_tenant_date
    ON app.return_to_work_interviews(tenant_id, interview_date DESC);

-- Lookup by leave request (for linking from leave management UI)
CREATE INDEX IF NOT EXISTS idx_rtw_interviews_leave_request
    ON app.return_to_work_interviews(leave_request_id)
    WHERE leave_request_id IS NOT NULL;

-- OH referrals (for occupational health team dashboard)
CREATE INDEX IF NOT EXISTS idx_rtw_interviews_oh_referral
    ON app.return_to_work_interviews(tenant_id, referral_to_occupational_health)
    WHERE referral_to_occupational_health = true;

-- Employees not fit for work (for HR follow-up)
CREATE INDEX IF NOT EXISTS idx_rtw_interviews_not_fit
    ON app.return_to_work_interviews(tenant_id, employee_id)
    WHERE fit_for_work = false;

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.return_to_work_interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.return_to_work_interviews
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.return_to_work_interviews
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_return_to_work_interviews_updated_at
    BEFORE UPDATE ON app.return_to_work_interviews
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Table Comments
-- =============================================================================

COMMENT ON TABLE app.return_to_work_interviews IS
    'Return-to-work interview records conducted after employee absence periods.  Tracks fit-for-work status, required adjustments, and occupational health referrals.';
COMMENT ON COLUMN app.return_to_work_interviews.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.return_to_work_interviews.tenant_id IS 'Tenant that owns this record';
COMMENT ON COLUMN app.return_to_work_interviews.employee_id IS 'Employee returning from absence';
COMMENT ON COLUMN app.return_to_work_interviews.leave_request_id IS 'Optional reference to the leave request (NULL for unplanned absences)';
COMMENT ON COLUMN app.return_to_work_interviews.absence_start_date IS 'First day of the absence period';
COMMENT ON COLUMN app.return_to_work_interviews.absence_end_date IS 'Last day of the absence period';
COMMENT ON COLUMN app.return_to_work_interviews.interview_date IS 'Date the return-to-work interview was conducted';
COMMENT ON COLUMN app.return_to_work_interviews.interviewer_id IS 'Manager or HR representative who conducted the interview';
COMMENT ON COLUMN app.return_to_work_interviews.fit_for_work IS 'Whether the employee is fit to return to normal duties';
COMMENT ON COLUMN app.return_to_work_interviews.adjustments_needed IS 'Description of any workplace adjustments required (phased return, modified duties, etc.)';
COMMENT ON COLUMN app.return_to_work_interviews.referral_to_occupational_health IS 'Whether an occupational health referral has been made';
COMMENT ON COLUMN app.return_to_work_interviews.notes IS 'Confidential free-text notes from the interview';

-- =============================================================================
-- GRANT access to the application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.return_to_work_interviews TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- REVOKE SELECT, INSERT, UPDATE, DELETE ON app.return_to_work_interviews FROM hris_app;
-- DROP TRIGGER IF EXISTS update_return_to_work_interviews_updated_at ON app.return_to_work_interviews;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.return_to_work_interviews;
-- DROP POLICY IF EXISTS tenant_isolation ON app.return_to_work_interviews;
-- DROP INDEX IF EXISTS app.idx_rtw_interviews_not_fit;
-- DROP INDEX IF EXISTS app.idx_rtw_interviews_oh_referral;
-- DROP INDEX IF EXISTS app.idx_rtw_interviews_leave_request;
-- DROP INDEX IF EXISTS app.idx_rtw_interviews_tenant_date;
-- DROP INDEX IF EXISTS app.idx_rtw_interviews_tenant_employee;
-- DROP TABLE IF EXISTS app.return_to_work_interviews;
