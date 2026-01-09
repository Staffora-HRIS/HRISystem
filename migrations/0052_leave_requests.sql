-- Migration: 0052_leave_requests
-- Created: 2026-01-07
-- Description: Create the leave_requests table - employee leave requests
--              Supports full-day and half-day requests
--              Status workflow: draft -> pending -> approved/rejected, or cancelled
--              Links to workflow system for approval routing
--              IMPORTANT: Approved/rejected requests are immutable - only cancellation allowed

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leave Requests Table
-- -----------------------------------------------------------------------------
-- Stores all leave requests from employees
-- Each request goes through an approval workflow
-- Balance is reserved when submitted, confirmed when approved, released when rejected/cancelled
CREATE TABLE IF NOT EXISTS app.leave_requests (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this request
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The employee requesting leave
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- The type of leave being requested
    leave_type_id uuid NOT NULL REFERENCES app.leave_types(id) ON DELETE RESTRICT,

    -- ==========================================================================
    -- REQUEST STATUS
    -- ==========================================================================

    -- Current status of the request
    -- draft: Created but not submitted
    -- pending: Submitted, awaiting approval
    -- approved: Approved by manager/HR
    -- rejected: Rejected by manager/HR
    -- cancelled: Cancelled by employee or admin
    -- expired: Approval window expired
    status app.leave_request_status NOT NULL DEFAULT 'draft',

    -- ==========================================================================
    -- DATE RANGE
    -- ==========================================================================

    -- First day of requested leave
    start_date date NOT NULL,

    -- Last day of requested leave (inclusive)
    end_date date NOT NULL,

    -- Half-day indicators
    -- If start_half_day is true, only afternoon of start_date is requested
    -- If end_half_day is true, only morning of end_date is requested
    -- For single-day half-day requests, use same start/end date with appropriate flag
    start_half_day boolean NOT NULL DEFAULT false,
    end_half_day boolean NOT NULL DEFAULT false,

    -- ==========================================================================
    -- CALCULATED DURATION
    -- ==========================================================================

    -- Total duration in days (or hours if leave type uses hours)
    -- Calculated considering:
    --   - Half days
    --   - Working pattern (weekdays only vs. all days)
    --   - Public holidays (excluded from count)
    -- This is the amount that will be deducted from balance
    duration numeric(6,2) NOT NULL,

    -- ==========================================================================
    -- REQUEST DETAILS
    -- ==========================================================================

    -- Reason/explanation for the leave request
    reason text,

    -- URL to attached supporting document (if required by leave type)
    -- e.g., medical certificate, jury duty notice
    attachment_url varchar(500),

    -- ==========================================================================
    -- WORKFLOW INTEGRATION
    -- ==========================================================================

    -- Reference to workflow instance for approval routing
    -- Links to workflow_instances table when approval workflow is active
    workflow_instance_id uuid,

    -- ==========================================================================
    -- SUBMISSION TRACKING
    -- ==========================================================================

    -- When the request was submitted (status changed from draft to pending)
    submitted_at timestamptz,

    -- User who submitted (usually the employee themselves)
    submitted_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- ==========================================================================
    -- APPROVAL TRACKING
    -- ==========================================================================

    -- When the request was approved
    approved_at timestamptz,

    -- User who approved (manager, HR, etc.)
    approved_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- ==========================================================================
    -- REJECTION TRACKING
    -- ==========================================================================

    -- When the request was rejected
    rejected_at timestamptz,

    -- User who rejected
    rejected_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Reason for rejection (required when rejecting)
    rejection_reason text,

    -- ==========================================================================
    -- CANCELLATION TRACKING
    -- ==========================================================================

    -- When the request was cancelled
    cancelled_at timestamptz,

    -- User who cancelled (employee or admin)
    cancelled_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Reason for cancellation
    cancellation_reason text,

    -- ==========================================================================
    -- TIMESTAMPS
    -- ==========================================================================

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- ==========================================================================
    -- CONSTRAINTS
    -- ==========================================================================

    -- End date must be on or after start date
    CONSTRAINT leave_requests_date_range CHECK (end_date >= start_date),

    -- Duration must be positive
    CONSTRAINT leave_requests_duration_check CHECK (duration > 0),

    -- Single-day half-day request: start_half_day and end_half_day cannot both be true
    -- (would mean requesting neither morning nor afternoon)
    CONSTRAINT leave_requests_half_day_check CHECK (
        NOT (start_date = end_date AND start_half_day = true AND end_half_day = true)
    ),

    -- Rejection reason required when rejected
    CONSTRAINT leave_requests_rejection_reason CHECK (
        status != 'rejected' OR rejection_reason IS NOT NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: employee's requests
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
    ON app.leave_requests(tenant_id, employee_id, status);

-- Date range queries (for calendar views)
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates
    ON app.leave_requests(tenant_id, start_date, end_date);

-- Pending requests (for approval dashboards)
CREATE INDEX IF NOT EXISTS idx_leave_requests_pending
    ON app.leave_requests(tenant_id, status, created_at)
    WHERE status = 'pending';

-- Approved requests for date range (for team calendar)
CREATE INDEX IF NOT EXISTS idx_leave_requests_approved_dates
    ON app.leave_requests(tenant_id, start_date, end_date)
    WHERE status = 'approved';

-- Leave type analysis
CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type
    ON app.leave_requests(tenant_id, leave_type_id, status);

-- Workflow instance lookup
CREATE INDEX IF NOT EXISTS idx_leave_requests_workflow
    ON app.leave_requests(workflow_instance_id)
    WHERE workflow_instance_id IS NOT NULL;

-- Recent requests (for notifications)
CREATE INDEX IF NOT EXISTS idx_leave_requests_recent
    ON app.leave_requests(tenant_id, created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.leave_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see requests for their current tenant
CREATE POLICY tenant_isolation ON app.leave_requests
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.leave_requests
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_leave_requests_updated_at
    BEFORE UPDATE ON app.leave_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- State Machine Validation
-- =============================================================================

-- Function to validate leave request status transitions
CREATE OR REPLACE FUNCTION app.validate_leave_request_status_transition()
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

    -- Validate transition based on current (old) status
    CASE OLD.status
        WHEN 'draft' THEN
            -- draft can transition to: pending (submit) or cancelled (discard)
            IF NEW.status NOT IN ('pending', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: draft can only transition to pending or cancelled, not %', NEW.status;
            END IF;

        WHEN 'pending' THEN
            -- pending can transition to: approved, rejected, cancelled, or expired
            IF NEW.status NOT IN ('approved', 'rejected', 'cancelled', 'expired') THEN
                RAISE EXCEPTION 'Invalid status transition: pending can only transition to approved, rejected, cancelled, or expired, not %', NEW.status;
            END IF;

        WHEN 'approved' THEN
            -- approved can only transition to: cancelled (with balance restoration)
            IF NEW.status NOT IN ('cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: approved requests can only be cancelled, not changed to %', NEW.status;
            END IF;

        WHEN 'rejected' THEN
            -- rejected is a terminal state (employee can create a new request)
            RAISE EXCEPTION 'Invalid status transition: rejected is a terminal state. Create a new request instead.';

        WHEN 'cancelled' THEN
            -- cancelled is a terminal state
            RAISE EXCEPTION 'Invalid status transition: cancelled is a terminal state.';

        WHEN 'expired' THEN
            -- expired is a terminal state
            RAISE EXCEPTION 'Invalid status transition: expired is a terminal state. Create a new request instead.';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_leave_request_status_transition
    BEFORE UPDATE OF status ON app.leave_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_leave_request_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to check for overlapping requests
-- Returns true if there's an overlap with existing approved/pending requests
CREATE OR REPLACE FUNCTION app.check_leave_request_overlap(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_start_date date,
    p_end_date date,
    p_exclude_request_id uuid DEFAULT NULL
)
RETURNS TABLE (
    has_overlap boolean,
    overlapping_request_id uuid,
    overlapping_start date,
    overlapping_end date,
    overlapping_status app.leave_request_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        true AS has_overlap,
        lr.id AS overlapping_request_id,
        lr.start_date AS overlapping_start,
        lr.end_date AS overlapping_end,
        lr.status AS overlapping_status
    FROM app.leave_requests lr
    WHERE lr.tenant_id = p_tenant_id
      AND lr.employee_id = p_employee_id
      AND lr.status IN ('pending', 'approved')
      AND (p_exclude_request_id IS NULL OR lr.id != p_exclude_request_id)
      -- Check for date overlap
      AND lr.start_date <= p_end_date
      AND lr.end_date >= p_start_date
    LIMIT 1;

    -- If no overlapping request found, return no overlap
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::uuid, NULL::date, NULL::date, NULL::app.leave_request_status;
    END IF;
END;
$$;

-- Function to calculate leave duration considering working pattern and holidays
-- This is a simplified version - production would consider employee's working pattern
CREATE OR REPLACE FUNCTION app.calculate_leave_duration(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_start_date date,
    p_end_date date,
    p_start_half_day boolean DEFAULT false,
    p_end_half_day boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current date;
    v_days numeric := 0;
    v_is_working_day boolean;
    v_is_holiday boolean;
BEGIN
    v_current := p_start_date;

    WHILE v_current <= p_end_date LOOP
        -- Check if it's a weekday (Monday=1 through Friday=5)
        -- This is simplified - production would check employee's working pattern
        v_is_working_day := EXTRACT(DOW FROM v_current) BETWEEN 1 AND 5;

        -- Check if it's a public holiday
        SELECT EXISTS(
            SELECT 1 FROM app.public_holidays
            WHERE tenant_id = p_tenant_id
              AND date = v_current
        ) INTO v_is_holiday;

        IF v_is_working_day AND NOT v_is_holiday THEN
            IF v_current = p_start_date AND p_start_half_day THEN
                v_days := v_days + 0.5;
            ELSIF v_current = p_end_date AND p_end_half_day THEN
                v_days := v_days + 0.5;
            ELSE
                v_days := v_days + 1;
            END IF;
        END IF;

        v_current := v_current + 1;
    END LOOP;

    RETURN v_days;
END;
$$;

-- Function to get employee's requests for a date range
CREATE OR REPLACE FUNCTION app.get_employee_leave_requests(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_start_date date DEFAULT NULL,
    p_end_date date DEFAULT NULL,
    p_status app.leave_request_status DEFAULT NULL,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    leave_type_id uuid,
    leave_type_code varchar(50),
    leave_type_name varchar(255),
    leave_type_color varchar(7),
    status app.leave_request_status,
    start_date date,
    end_date date,
    start_half_day boolean,
    end_half_day boolean,
    duration numeric(6,2),
    reason text,
    submitted_at timestamptz,
    approved_at timestamptz,
    rejected_at timestamptz,
    rejection_reason text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lr.id,
        lt.id AS leave_type_id,
        lt.code AS leave_type_code,
        lt.name AS leave_type_name,
        lt.color AS leave_type_color,
        lr.status,
        lr.start_date,
        lr.end_date,
        lr.start_half_day,
        lr.end_half_day,
        lr.duration,
        lr.reason,
        lr.submitted_at,
        lr.approved_at,
        lr.rejected_at,
        lr.rejection_reason,
        lr.created_at
    FROM app.leave_requests lr
    INNER JOIN app.leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.tenant_id = p_tenant_id
      AND lr.employee_id = p_employee_id
      AND (p_start_date IS NULL OR lr.end_date >= p_start_date)
      AND (p_end_date IS NULL OR lr.start_date <= p_end_date)
      AND (p_status IS NULL OR lr.status = p_status)
    ORDER BY lr.start_date DESC, lr.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Function to get pending requests for a manager (direct reports)
CREATE OR REPLACE FUNCTION app.get_pending_requests_for_manager(
    p_tenant_id uuid,
    p_manager_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    employee_number varchar(50),
    leave_type_name varchar(255),
    status app.leave_request_status,
    start_date date,
    end_date date,
    duration numeric(6,2),
    reason text,
    submitted_at timestamptz,
    days_pending integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lr.id,
        e.id AS employee_id,
        e.employee_number,
        lt.name AS leave_type_name,
        lr.status,
        lr.start_date,
        lr.end_date,
        lr.duration,
        lr.reason,
        lr.submitted_at,
        (CURRENT_DATE - lr.submitted_at::date)::integer AS days_pending
    FROM app.leave_requests lr
    INNER JOIN app.employees e ON e.id = lr.employee_id
    INNER JOIN app.leave_types lt ON lt.id = lr.leave_type_id
    INNER JOIN app.reporting_lines rl ON rl.employee_id = e.id
        AND rl.is_primary = true
        AND rl.end_date IS NULL
    WHERE lr.tenant_id = p_tenant_id
      AND lr.status = 'pending'
      AND rl.manager_employee_id = p_manager_employee_id
    ORDER BY lr.submitted_at ASC;
END;
$$;

-- Function to get team calendar (approved leave for a period)
CREATE OR REPLACE FUNCTION app.get_team_leave_calendar(
    p_tenant_id uuid,
    p_start_date date,
    p_end_date date,
    p_org_unit_id uuid DEFAULT NULL
)
RETURNS TABLE (
    request_id uuid,
    employee_id uuid,
    employee_number varchar(50),
    leave_type_name varchar(255),
    leave_type_color varchar(7),
    start_date date,
    end_date date,
    start_half_day boolean,
    end_half_day boolean,
    duration numeric(6,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lr.id AS request_id,
        e.id AS employee_id,
        e.employee_number,
        lt.name AS leave_type_name,
        lt.color AS leave_type_color,
        lr.start_date,
        lr.end_date,
        lr.start_half_day,
        lr.end_half_day,
        lr.duration
    FROM app.leave_requests lr
    INNER JOIN app.employees e ON e.id = lr.employee_id
    INNER JOIN app.leave_types lt ON lt.id = lr.leave_type_id
    LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id
        AND pa.is_primary = true
        AND pa.end_date IS NULL
    WHERE lr.tenant_id = p_tenant_id
      AND lr.status = 'approved'
      AND lr.start_date <= p_end_date
      AND lr.end_date >= p_start_date
      AND (p_org_unit_id IS NULL OR pa.org_unit_id = p_org_unit_id)
    ORDER BY lr.start_date, e.employee_number;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.leave_requests IS 'Employee leave requests with full lifecycle tracking and workflow integration';
COMMENT ON COLUMN app.leave_requests.id IS 'Primary UUID identifier for the request';
COMMENT ON COLUMN app.leave_requests.tenant_id IS 'Tenant that owns this request';
COMMENT ON COLUMN app.leave_requests.employee_id IS 'Employee requesting leave';
COMMENT ON COLUMN app.leave_requests.leave_type_id IS 'Type of leave being requested';
COMMENT ON COLUMN app.leave_requests.status IS 'Current status: draft, pending, approved, rejected, cancelled, expired';
COMMENT ON COLUMN app.leave_requests.start_date IS 'First day of requested leave';
COMMENT ON COLUMN app.leave_requests.end_date IS 'Last day of requested leave (inclusive)';
COMMENT ON COLUMN app.leave_requests.start_half_day IS 'If true, only afternoon of start_date is requested';
COMMENT ON COLUMN app.leave_requests.end_half_day IS 'If true, only morning of end_date is requested';
COMMENT ON COLUMN app.leave_requests.duration IS 'Total duration to deduct from balance';
COMMENT ON COLUMN app.leave_requests.reason IS 'Reason/explanation for leave';
COMMENT ON COLUMN app.leave_requests.attachment_url IS 'URL to supporting document';
COMMENT ON COLUMN app.leave_requests.workflow_instance_id IS 'Reference to approval workflow instance';
COMMENT ON COLUMN app.leave_requests.submitted_at IS 'When request was submitted';
COMMENT ON COLUMN app.leave_requests.approved_at IS 'When request was approved';
COMMENT ON COLUMN app.leave_requests.rejected_at IS 'When request was rejected';
COMMENT ON COLUMN app.leave_requests.rejection_reason IS 'Reason for rejection';
COMMENT ON COLUMN app.leave_requests.cancelled_at IS 'When request was cancelled';
COMMENT ON COLUMN app.leave_requests.cancellation_reason IS 'Reason for cancellation';
COMMENT ON FUNCTION app.validate_leave_request_status_transition IS 'Enforces valid status transitions for leave requests';
COMMENT ON FUNCTION app.check_leave_request_overlap IS 'Checks for overlapping leave requests';
COMMENT ON FUNCTION app.calculate_leave_duration IS 'Calculates working days considering weekends and holidays';
COMMENT ON FUNCTION app.get_employee_leave_requests IS 'Returns leave requests for an employee';
COMMENT ON FUNCTION app.get_pending_requests_for_manager IS 'Returns pending requests for direct reports';
COMMENT ON FUNCTION app.get_team_leave_calendar IS 'Returns approved leave for calendar display';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_team_leave_calendar(uuid, date, date, uuid);
-- DROP FUNCTION IF EXISTS app.get_pending_requests_for_manager(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_leave_requests(uuid, uuid, date, date, app.leave_request_status, integer);
-- DROP FUNCTION IF EXISTS app.calculate_leave_duration(uuid, uuid, date, date, boolean, boolean);
-- DROP FUNCTION IF EXISTS app.check_leave_request_overlap(uuid, uuid, date, date, uuid);
-- DROP TRIGGER IF EXISTS validate_leave_request_status_transition ON app.leave_requests;
-- DROP FUNCTION IF EXISTS app.validate_leave_request_status_transition();
-- DROP TRIGGER IF EXISTS update_leave_requests_updated_at ON app.leave_requests;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.leave_requests;
-- DROP POLICY IF EXISTS tenant_isolation ON app.leave_requests;
-- DROP INDEX IF EXISTS app.idx_leave_requests_recent;
-- DROP INDEX IF EXISTS app.idx_leave_requests_workflow;
-- DROP INDEX IF EXISTS app.idx_leave_requests_leave_type;
-- DROP INDEX IF EXISTS app.idx_leave_requests_approved_dates;
-- DROP INDEX IF EXISTS app.idx_leave_requests_pending;
-- DROP INDEX IF EXISTS app.idx_leave_requests_dates;
-- DROP INDEX IF EXISTS app.idx_leave_requests_employee;
-- DROP TABLE IF EXISTS app.leave_requests;
