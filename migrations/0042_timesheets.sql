-- Migration: 0042_timesheets
-- Created: 2026-01-07
-- Description: Create the timesheets table for timesheet headers
--              Timesheets aggregate time entries for a pay period
--              Go through draft -> submitted -> approved -> locked lifecycle

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Timesheets Table
-- -----------------------------------------------------------------------------
-- Timesheet headers representing a pay period for an employee
-- Contains aggregated totals and approval status
-- Once approved, cannot be modified (locked after finalization)
CREATE TABLE IF NOT EXISTS app.timesheets (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this timesheet
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee this timesheet belongs to
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Pay period dates
    period_start date NOT NULL,
    period_end date NOT NULL,

    -- Current status in lifecycle
    status app.timesheet_status NOT NULL DEFAULT 'draft',

    -- Aggregated hours (calculated from timesheet_lines)
    total_regular_hours numeric(6, 2) NOT NULL DEFAULT 0,
    total_overtime_hours numeric(6, 2) NOT NULL DEFAULT 0,
    total_break_minutes integer NOT NULL DEFAULT 0,

    -- Submission tracking
    submitted_at timestamptz,
    submitted_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Approval tracking
    approved_at timestamptz,
    approved_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Rejection tracking
    rejected_at timestamptz,
    rejected_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    rejection_reason text,

    -- Lock tracking (after finalization)
    locked_at timestamptz,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- One timesheet per employee per period
    CONSTRAINT timesheets_unique UNIQUE (tenant_id, employee_id, period_start, period_end),

    -- Period end must be after start
    CONSTRAINT timesheets_period_range CHECK (period_end >= period_start),

    -- Period should be reasonable (1 day to 31 days)
    CONSTRAINT timesheets_period_limit CHECK (
        period_end <= period_start + interval '31 days'
    ),

    -- Hours must be non-negative
    CONSTRAINT timesheets_hours_positive CHECK (
        total_regular_hours >= 0 AND
        total_overtime_hours >= 0 AND
        total_break_minutes >= 0
    ),

    -- Submitted timesheets must have submission info
    CONSTRAINT timesheets_submitted_info CHECK (
        status = 'draft' OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL)
    ),

    -- Approved timesheets must have approval info
    CONSTRAINT timesheets_approved_info CHECK (
        status NOT IN ('approved', 'locked') OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)
    ),

    -- Rejected timesheets must have rejection info
    CONSTRAINT timesheets_rejected_info CHECK (
        status != 'rejected' OR (rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND rejection_reason IS NOT NULL)
    ),

    -- Locked timesheets must have lock time
    CONSTRAINT timesheets_locked_info CHECK (
        status != 'locked' OR locked_at IS NOT NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + employee + period
CREATE INDEX IF NOT EXISTS idx_timesheets_tenant_employee_period
    ON app.timesheets(tenant_id, employee_id, period_start, period_end);

-- Employee's timesheets (most recent first)
CREATE INDEX IF NOT EXISTS idx_timesheets_employee
    ON app.timesheets(employee_id, period_start DESC);

-- Status filtering (find drafts, pending approval, etc.)
CREATE INDEX IF NOT EXISTS idx_timesheets_tenant_status
    ON app.timesheets(tenant_id, status);

-- Pending approval queue
CREATE INDEX IF NOT EXISTS idx_timesheets_pending_approval
    ON app.timesheets(tenant_id, submitted_at)
    WHERE status = 'submitted';

-- Period-based queries
CREATE INDEX IF NOT EXISTS idx_timesheets_period
    ON app.timesheets(tenant_id, period_start, period_end);

-- Approver's history
CREATE INDEX IF NOT EXISTS idx_timesheets_approved_by
    ON app.timesheets(approved_by, approved_at DESC)
    WHERE approved_by IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.timesheets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see timesheets for their current tenant
CREATE POLICY tenant_isolation ON app.timesheets
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.timesheets
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_timesheets_updated_at
    BEFORE UPDATE ON app.timesheets
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- State Machine Validation
-- =============================================================================

-- Function to validate timesheet status transitions
-- State machine:
--   draft -> submitted (employee submits for approval)
--   submitted -> approved (manager approves)
--   submitted -> rejected (manager rejects, returns to draft for corrections)
--   approved -> locked (after finalization, immutable)
--   rejected -> draft (employee can make corrections and resubmit)
-- IMPORTANT: Once locked, timesheet CANNOT be modified
CREATE OR REPLACE FUNCTION app.validate_timesheet_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- If status hasn't changed, check if modification is allowed
    IF OLD.status = NEW.status THEN
        -- Approved and locked timesheets cannot be modified
        IF OLD.status IN ('approved', 'locked') THEN
            -- Only allow status change to locked (from approved)
            -- and updating lock timestamp
            IF OLD.status = 'approved' AND (
                OLD.total_regular_hours != NEW.total_regular_hours OR
                OLD.total_overtime_hours != NEW.total_overtime_hours OR
                OLD.total_break_minutes != NEW.total_break_minutes
            ) THEN
                RAISE EXCEPTION 'Approved timesheets cannot be modified';
            END IF;

            IF OLD.status = 'locked' THEN
                RAISE EXCEPTION 'Locked timesheets cannot be modified';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Validate transition based on current (old) status
    CASE OLD.status
        WHEN 'draft' THEN
            -- draft can only transition to submitted
            IF NEW.status != 'submitted' THEN
                RAISE EXCEPTION 'Invalid status transition: draft can only transition to submitted, not %', NEW.status;
            END IF;
            -- Set submission timestamp
            NEW.submitted_at := now();

        WHEN 'submitted' THEN
            -- submitted can transition to approved or rejected
            IF NEW.status NOT IN ('approved', 'rejected') THEN
                RAISE EXCEPTION 'Invalid status transition: submitted can only transition to approved or rejected, not %', NEW.status;
            END IF;
            IF NEW.status = 'approved' THEN
                NEW.approved_at := now();
            ELSIF NEW.status = 'rejected' THEN
                NEW.rejected_at := now();
            END IF;

        WHEN 'approved' THEN
            -- approved can only transition to locked
            IF NEW.status != 'locked' THEN
                RAISE EXCEPTION 'Invalid status transition: approved can only transition to locked, not %', NEW.status;
            END IF;
            NEW.locked_at := now();

        WHEN 'rejected' THEN
            -- rejected can only transition back to draft (for corrections)
            IF NEW.status != 'draft' THEN
                RAISE EXCEPTION 'Invalid status transition: rejected can only transition to draft, not %', NEW.status;
            END IF;
            -- Clear rejection info when returning to draft
            NEW.rejected_at := NULL;
            NEW.rejected_by := NULL;
            NEW.rejection_reason := NULL;
            -- Clear submission info
            NEW.submitted_at := NULL;
            NEW.submitted_by := NULL;

        WHEN 'locked' THEN
            -- locked is a terminal state
            RAISE EXCEPTION 'Invalid status transition: locked is a terminal state. Create adjustments instead.';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_timesheet_status_transition
    BEFORE UPDATE ON app.timesheets
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_timesheet_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get or create timesheet for a period
CREATE OR REPLACE FUNCTION app.get_or_create_timesheet(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_period_start date,
    p_period_end date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_timesheet_id uuid;
BEGIN
    -- Try to find existing timesheet
    SELECT id INTO v_timesheet_id
    FROM app.timesheets
    WHERE tenant_id = p_tenant_id
      AND employee_id = p_employee_id
      AND period_start = p_period_start
      AND period_end = p_period_end;

    -- Create if not exists
    IF v_timesheet_id IS NULL THEN
        INSERT INTO app.timesheets (tenant_id, employee_id, period_start, period_end)
        VALUES (p_tenant_id, p_employee_id, p_period_start, p_period_end)
        RETURNING id INTO v_timesheet_id;
    END IF;

    RETURN v_timesheet_id;
END;
$$;

COMMENT ON FUNCTION app.get_or_create_timesheet IS 'Gets existing timesheet or creates new one for the period';

-- Function to recalculate timesheet totals from lines
CREATE OR REPLACE FUNCTION app.recalculate_timesheet_totals(
    p_timesheet_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_regular numeric;
    v_overtime numeric;
    v_break integer;
    v_status app.timesheet_status;
BEGIN
    -- Check if timesheet can be modified
    SELECT status INTO v_status
    FROM app.timesheets WHERE id = p_timesheet_id;

    IF v_status IN ('approved', 'locked') THEN
        RAISE EXCEPTION 'Cannot recalculate totals for % timesheet', v_status;
    END IF;

    -- Calculate totals from lines
    SELECT
        COALESCE(SUM(regular_hours), 0),
        COALESCE(SUM(overtime_hours), 0),
        COALESCE(SUM(break_minutes), 0)
    INTO v_regular, v_overtime, v_break
    FROM app.timesheet_lines
    WHERE timesheet_id = p_timesheet_id;

    -- Update timesheet
    UPDATE app.timesheets
    SET total_regular_hours = v_regular,
        total_overtime_hours = v_overtime,
        total_break_minutes = v_break
    WHERE id = p_timesheet_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.recalculate_timesheet_totals IS 'Recalculates timesheet totals from line items';

-- Function to submit timesheet
CREATE OR REPLACE FUNCTION app.submit_timesheet(
    p_timesheet_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_timesheet RECORD;
BEGIN
    -- Get timesheet
    SELECT * INTO v_timesheet
    FROM app.timesheets
    WHERE id = p_timesheet_id;

    IF v_timesheet IS NULL THEN
        RAISE EXCEPTION 'Timesheet not found: %', p_timesheet_id;
    END IF;

    IF v_timesheet.status != 'draft' THEN
        RAISE EXCEPTION 'Only draft timesheets can be submitted. Current status: %', v_timesheet.status;
    END IF;

    -- Recalculate totals before submission
    PERFORM app.recalculate_timesheet_totals(p_timesheet_id);

    -- Submit
    UPDATE app.timesheets
    SET status = 'submitted',
        submitted_at = now(),
        submitted_by = p_user_id
    WHERE id = p_timesheet_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.submit_timesheet IS 'Submits a timesheet for approval';

-- Function to approve timesheet
CREATE OR REPLACE FUNCTION app.approve_timesheet(
    p_timesheet_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_timesheet RECORD;
BEGIN
    -- Get timesheet
    SELECT * INTO v_timesheet
    FROM app.timesheets
    WHERE id = p_timesheet_id;

    IF v_timesheet IS NULL THEN
        RAISE EXCEPTION 'Timesheet not found: %', p_timesheet_id;
    END IF;

    IF v_timesheet.status != 'submitted' THEN
        RAISE EXCEPTION 'Only submitted timesheets can be approved. Current status: %', v_timesheet.status;
    END IF;

    -- Approve
    UPDATE app.timesheets
    SET status = 'approved',
        approved_at = now(),
        approved_by = p_user_id
    WHERE id = p_timesheet_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.approve_timesheet IS 'Approves a submitted timesheet';

-- Function to reject timesheet
CREATE OR REPLACE FUNCTION app.reject_timesheet(
    p_timesheet_id uuid,
    p_user_id uuid,
    p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_timesheet RECORD;
BEGIN
    -- Validate reason
    IF p_reason IS NULL OR p_reason = '' THEN
        RAISE EXCEPTION 'Rejection reason is required';
    END IF;

    -- Get timesheet
    SELECT * INTO v_timesheet
    FROM app.timesheets
    WHERE id = p_timesheet_id;

    IF v_timesheet IS NULL THEN
        RAISE EXCEPTION 'Timesheet not found: %', p_timesheet_id;
    END IF;

    IF v_timesheet.status != 'submitted' THEN
        RAISE EXCEPTION 'Only submitted timesheets can be rejected. Current status: %', v_timesheet.status;
    END IF;

    -- Reject
    UPDATE app.timesheets
    SET status = 'rejected',
        rejected_at = now(),
        rejected_by = p_user_id,
        rejection_reason = p_reason
    WHERE id = p_timesheet_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.reject_timesheet IS 'Rejects a submitted timesheet with a reason';

-- Function to lock timesheet (after finalization)
CREATE OR REPLACE FUNCTION app.lock_timesheet(
    p_timesheet_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_status app.timesheet_status;
BEGIN
    -- Get current status
    SELECT status INTO v_status
    FROM app.timesheets
    WHERE id = p_timesheet_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Timesheet not found: %', p_timesheet_id;
    END IF;

    IF v_status != 'approved' THEN
        RAISE EXCEPTION 'Only approved timesheets can be locked. Current status: %', v_status;
    END IF;

    -- Lock
    UPDATE app.timesheets
    SET status = 'locked',
        locked_at = now()
    WHERE id = p_timesheet_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.lock_timesheet IS 'Locks an approved timesheet (after finalization)';

-- Function to get employee's timesheets
CREATE OR REPLACE FUNCTION app.get_employee_timesheets(
    p_employee_id uuid,
    p_limit integer DEFAULT 12
)
RETURNS TABLE (
    id uuid,
    period_start date,
    period_end date,
    status app.timesheet_status,
    total_regular_hours numeric,
    total_overtime_hours numeric,
    submitted_at timestamptz,
    approved_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.period_start,
        t.period_end,
        t.status,
        t.total_regular_hours,
        t.total_overtime_hours,
        t.submitted_at,
        t.approved_at
    FROM app.timesheets t
    WHERE t.employee_id = p_employee_id
    ORDER BY t.period_start DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION app.get_employee_timesheets IS 'Returns recent timesheets for an employee';

-- Function to get pending approval timesheets
CREATE OR REPLACE FUNCTION app.get_pending_timesheets(
    p_org_unit_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    employee_number varchar(50),
    period_start date,
    period_end date,
    total_regular_hours numeric,
    total_overtime_hours numeric,
    submitted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.employee_id,
        e.employee_number,
        t.period_start,
        t.period_end,
        t.total_regular_hours,
        t.total_overtime_hours,
        t.submitted_at
    FROM app.timesheets t
    JOIN app.employees e ON t.employee_id = e.id
    LEFT JOIN app.position_assignments pa ON e.id = pa.employee_id AND pa.is_current = true
    LEFT JOIN app.positions p ON pa.position_id = p.id
    WHERE t.status = 'submitted'
      AND (p_org_unit_id IS NULL OR p.org_unit_id = p_org_unit_id)
    ORDER BY t.submitted_at;
END;
$$;

COMMENT ON FUNCTION app.get_pending_timesheets IS 'Returns timesheets pending approval, optionally filtered by org unit';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.timesheets IS 'Timesheet headers for pay periods. Goes through draft->submitted->approved->locked lifecycle.';
COMMENT ON COLUMN app.timesheets.id IS 'Primary UUID identifier for the timesheet';
COMMENT ON COLUMN app.timesheets.tenant_id IS 'Tenant that owns this timesheet';
COMMENT ON COLUMN app.timesheets.employee_id IS 'Employee this timesheet belongs to';
COMMENT ON COLUMN app.timesheets.period_start IS 'Pay period start date';
COMMENT ON COLUMN app.timesheets.period_end IS 'Pay period end date';
COMMENT ON COLUMN app.timesheets.status IS 'Current status (draft, submitted, approved, rejected, locked)';
COMMENT ON COLUMN app.timesheets.total_regular_hours IS 'Total regular hours (calculated from lines)';
COMMENT ON COLUMN app.timesheets.total_overtime_hours IS 'Total overtime hours (calculated from lines)';
COMMENT ON COLUMN app.timesheets.total_break_minutes IS 'Total break minutes (calculated from lines)';
COMMENT ON COLUMN app.timesheets.submitted_at IS 'When timesheet was submitted';
COMMENT ON COLUMN app.timesheets.submitted_by IS 'Who submitted the timesheet';
COMMENT ON COLUMN app.timesheets.approved_at IS 'When timesheet was approved';
COMMENT ON COLUMN app.timesheets.approved_by IS 'Who approved the timesheet';
COMMENT ON COLUMN app.timesheets.rejected_at IS 'When timesheet was rejected';
COMMENT ON COLUMN app.timesheets.rejected_by IS 'Who rejected the timesheet';
COMMENT ON COLUMN app.timesheets.rejection_reason IS 'Reason for rejection';
COMMENT ON COLUMN app.timesheets.locked_at IS 'When timesheet was locked (after finalization)';
COMMENT ON FUNCTION app.validate_timesheet_status_transition IS 'Trigger function enforcing valid timesheet status transitions and immutability';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_pending_timesheets(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_timesheets(uuid, integer);
-- DROP FUNCTION IF EXISTS app.lock_timesheet(uuid);
-- DROP FUNCTION IF EXISTS app.reject_timesheet(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS app.approve_timesheet(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.submit_timesheet(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.recalculate_timesheet_totals(uuid);
-- DROP FUNCTION IF EXISTS app.get_or_create_timesheet(uuid, uuid, date, date);
-- DROP TRIGGER IF EXISTS validate_timesheet_status_transition ON app.timesheets;
-- DROP FUNCTION IF EXISTS app.validate_timesheet_status_transition();
-- DROP TRIGGER IF EXISTS update_timesheets_updated_at ON app.timesheets;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.timesheets;
-- DROP POLICY IF EXISTS tenant_isolation ON app.timesheets;
-- DROP INDEX IF EXISTS app.idx_timesheets_approved_by;
-- DROP INDEX IF EXISTS app.idx_timesheets_period;
-- DROP INDEX IF EXISTS app.idx_timesheets_pending_approval;
-- DROP INDEX IF EXISTS app.idx_timesheets_tenant_status;
-- DROP INDEX IF EXISTS app.idx_timesheets_employee;
-- DROP INDEX IF EXISTS app.idx_timesheets_tenant_employee_period;
-- DROP TABLE IF EXISTS app.timesheets;
