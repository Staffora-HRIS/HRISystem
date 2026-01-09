-- Migration: 0041_shift_swap_requests
-- Created: 2026-01-07
-- Description: Create the shift_swap_requests table for shift swap/trade requests
--              Allows employees to request swapping shifts with each other
--              Requires manager approval before swap takes effect

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shift Swap Requests Table
-- -----------------------------------------------------------------------------
-- Tracks requests from employees to swap shifts with each other
-- Both employees must agree, and a manager must approve
-- Once approved, the shift_assignments are updated accordingly
CREATE TABLE IF NOT EXISTS app.shift_swap_requests (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this request
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The assignment the requester wants to swap away
    requester_assignment_id uuid NOT NULL REFERENCES app.shift_assignments(id) ON DELETE CASCADE,

    -- The assignment the requester wants to swap for
    target_assignment_id uuid NOT NULL REFERENCES app.shift_assignments(id) ON DELETE CASCADE,

    -- The employee requesting the swap
    requester_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- The employee being asked to swap
    target_employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Current status of the request
    status app.shift_swap_status NOT NULL DEFAULT 'pending',

    -- Reason provided by requester
    reason text,

    -- Target employee response
    target_accepted boolean,
    target_response_at timestamptz,
    target_response_notes text,

    -- Manager approval tracking
    approved_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    approved_at timestamptz,
    approval_notes text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Cannot swap with yourself
    CONSTRAINT shift_swap_different_employees CHECK (
        requester_id != target_employee_id
    ),

    -- Cannot swap same assignment
    CONSTRAINT shift_swap_different_assignments CHECK (
        requester_assignment_id != target_assignment_id
    ),

    -- Target must respond before approval
    CONSTRAINT shift_swap_target_response CHECK (
        status = 'pending' OR target_accepted IS NOT NULL
    ),

    -- Approval info consistency
    CONSTRAINT shift_swap_approval_consistency CHECK (
        (status NOT IN ('approved', 'rejected')) OR
        (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Requests by requester
CREATE INDEX IF NOT EXISTS idx_shift_swap_requester
    ON app.shift_swap_requests(tenant_id, requester_id, created_at DESC);

-- Requests by target employee
CREATE INDEX IF NOT EXISTS idx_shift_swap_target
    ON app.shift_swap_requests(tenant_id, target_employee_id, created_at DESC);

-- Pending requests (for approval queues)
CREATE INDEX IF NOT EXISTS idx_shift_swap_pending
    ON app.shift_swap_requests(tenant_id, status)
    WHERE status = 'pending';

-- Requests pending manager approval (target has accepted)
CREATE INDEX IF NOT EXISTS idx_shift_swap_pending_approval
    ON app.shift_swap_requests(tenant_id, created_at)
    WHERE status = 'pending' AND target_accepted = true;

-- Assignment-based lookup (find swaps involving an assignment)
CREATE INDEX IF NOT EXISTS idx_shift_swap_assignments
    ON app.shift_swap_requests(requester_assignment_id, target_assignment_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.shift_swap_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see requests for their current tenant
CREATE POLICY tenant_isolation ON app.shift_swap_requests
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.shift_swap_requests
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_shift_swap_requests_updated_at
    BEFORE UPDATE ON app.shift_swap_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- State Machine Validation
-- =============================================================================

-- Function to validate shift swap status transitions
-- State machine:
--   pending -> approved (manager approves after target accepts)
--   pending -> rejected (manager rejects or target declines)
--   pending -> cancelled (requester cancels)
--   approved -> cancelled (swap undone before effective date - rare)
CREATE OR REPLACE FUNCTION app.validate_shift_swap_status_transition()
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
        WHEN 'pending' THEN
            -- pending can transition to approved, rejected, or cancelled
            IF NEW.status NOT IN ('approved', 'rejected', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: pending can only transition to approved, rejected, or cancelled, not %', NEW.status;
            END IF;

            -- To approve, target must have accepted
            IF NEW.status = 'approved' AND (NEW.target_accepted IS NULL OR NOT NEW.target_accepted) THEN
                RAISE EXCEPTION 'Cannot approve swap: target employee has not accepted';
            END IF;

        WHEN 'approved' THEN
            -- approved can only transition to cancelled (rare, for undoing swap)
            IF NEW.status != 'cancelled' THEN
                RAISE EXCEPTION 'Invalid status transition: approved can only transition to cancelled, not %', NEW.status;
            END IF;

        WHEN 'rejected' THEN
            -- rejected is a terminal state
            RAISE EXCEPTION 'Invalid status transition: rejected is a terminal state';

        WHEN 'cancelled' THEN
            -- cancelled is a terminal state
            RAISE EXCEPTION 'Invalid status transition: cancelled is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_shift_swap_status_transition
    BEFORE UPDATE OF status ON app.shift_swap_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_shift_swap_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get pending swap requests for an employee (as target)
CREATE OR REPLACE FUNCTION app.get_pending_swap_requests_for_employee(
    p_employee_id uuid
)
RETURNS TABLE (
    request_id uuid,
    requester_id uuid,
    requester_employee_number varchar(50),
    requester_shift_date date,
    requester_shift_name varchar(100),
    requester_shift_start time,
    requester_shift_end time,
    target_shift_date date,
    target_shift_name varchar(100),
    target_shift_start time,
    target_shift_end time,
    reason text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ssr.id AS request_id,
        ssr.requester_id,
        e.employee_number AS requester_employee_number,
        rsa.assignment_date AS requester_shift_date,
        rs.name AS requester_shift_name,
        rs.start_time AS requester_shift_start,
        rs.end_time AS requester_shift_end,
        tsa.assignment_date AS target_shift_date,
        ts.name AS target_shift_name,
        ts.start_time AS target_shift_start,
        ts.end_time AS target_shift_end,
        ssr.reason,
        ssr.created_at
    FROM app.shift_swap_requests ssr
    JOIN app.employees e ON ssr.requester_id = e.id
    JOIN app.shift_assignments rsa ON ssr.requester_assignment_id = rsa.id
    JOIN app.shifts rs ON rsa.shift_id = rs.id
    JOIN app.shift_assignments tsa ON ssr.target_assignment_id = tsa.id
    JOIN app.shifts ts ON tsa.shift_id = ts.id
    WHERE ssr.target_employee_id = p_employee_id
      AND ssr.status = 'pending'
      AND ssr.target_accepted IS NULL
    ORDER BY ssr.created_at DESC;
END;
$$;

COMMENT ON FUNCTION app.get_pending_swap_requests_for_employee IS 'Returns pending swap requests where employee is the target';

-- Function to get swap requests made by an employee
CREATE OR REPLACE FUNCTION app.get_swap_requests_by_employee(
    p_employee_id uuid,
    p_include_completed boolean DEFAULT false
)
RETURNS TABLE (
    request_id uuid,
    target_employee_id uuid,
    target_employee_number varchar(50),
    my_shift_date date,
    my_shift_name varchar(100),
    their_shift_date date,
    their_shift_name varchar(100),
    status app.shift_swap_status,
    target_accepted boolean,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ssr.id AS request_id,
        ssr.target_employee_id,
        e.employee_number AS target_employee_number,
        rsa.assignment_date AS my_shift_date,
        rs.name AS my_shift_name,
        tsa.assignment_date AS their_shift_date,
        ts.name AS their_shift_name,
        ssr.status,
        ssr.target_accepted,
        ssr.created_at
    FROM app.shift_swap_requests ssr
    JOIN app.employees e ON ssr.target_employee_id = e.id
    JOIN app.shift_assignments rsa ON ssr.requester_assignment_id = rsa.id
    JOIN app.shifts rs ON rsa.shift_id = rs.id
    JOIN app.shift_assignments tsa ON ssr.target_assignment_id = tsa.id
    JOIN app.shifts ts ON tsa.shift_id = ts.id
    WHERE ssr.requester_id = p_employee_id
      AND (p_include_completed OR ssr.status = 'pending')
    ORDER BY ssr.created_at DESC;
END;
$$;

COMMENT ON FUNCTION app.get_swap_requests_by_employee IS 'Returns swap requests made by an employee';

-- Function to respond to a swap request (target employee)
CREATE OR REPLACE FUNCTION app.respond_to_swap_request(
    p_request_id uuid,
    p_accepted boolean,
    p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_request RECORD;
BEGIN
    -- Get request
    SELECT * INTO v_request
    FROM app.shift_swap_requests
    WHERE id = p_request_id;

    IF v_request IS NULL THEN
        RAISE EXCEPTION 'Swap request not found: %', p_request_id;
    END IF;

    IF v_request.status != 'pending' THEN
        RAISE EXCEPTION 'Swap request is no longer pending. Status: %', v_request.status;
    END IF;

    IF v_request.target_accepted IS NOT NULL THEN
        RAISE EXCEPTION 'Target has already responded to this request';
    END IF;

    -- Update with response
    UPDATE app.shift_swap_requests
    SET target_accepted = p_accepted,
        target_response_at = now(),
        target_response_notes = p_notes,
        status = CASE WHEN NOT p_accepted THEN 'rejected' ELSE status END
    WHERE id = p_request_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.respond_to_swap_request IS 'Target employee responds to a swap request (accept or decline)';

-- Function to approve/reject a swap request (manager)
CREATE OR REPLACE FUNCTION app.process_swap_request(
    p_request_id uuid,
    p_approved boolean,
    p_user_id uuid,
    p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_request RECORD;
BEGIN
    -- Get request
    SELECT * INTO v_request
    FROM app.shift_swap_requests
    WHERE id = p_request_id;

    IF v_request IS NULL THEN
        RAISE EXCEPTION 'Swap request not found: %', p_request_id;
    END IF;

    IF v_request.status != 'pending' THEN
        RAISE EXCEPTION 'Swap request is no longer pending. Status: %', v_request.status;
    END IF;

    IF v_request.target_accepted IS NULL THEN
        RAISE EXCEPTION 'Target employee has not yet responded';
    END IF;

    IF NOT v_request.target_accepted THEN
        RAISE EXCEPTION 'Target employee declined the swap';
    END IF;

    -- Update with approval/rejection
    UPDATE app.shift_swap_requests
    SET status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
        approved_by = p_user_id,
        approved_at = now(),
        approval_notes = p_notes
    WHERE id = p_request_id;

    -- If approved, execute the swap
    IF p_approved THEN
        PERFORM app.execute_shift_swap(p_request_id);
    END IF;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.process_swap_request IS 'Manager approves or rejects a swap request';

-- Function to execute the actual swap (update assignments)
CREATE OR REPLACE FUNCTION app.execute_shift_swap(
    p_request_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_request RECORD;
    v_requester_assignment RECORD;
    v_target_assignment RECORD;
BEGIN
    -- Get request details
    SELECT * INTO v_request
    FROM app.shift_swap_requests
    WHERE id = p_request_id AND status = 'approved';

    IF v_request IS NULL THEN
        RAISE EXCEPTION 'Approved swap request not found: %', p_request_id;
    END IF;

    -- Get assignment details
    SELECT * INTO v_requester_assignment
    FROM app.shift_assignments WHERE id = v_request.requester_assignment_id;

    SELECT * INTO v_target_assignment
    FROM app.shift_assignments WHERE id = v_request.target_assignment_id;

    -- Swap the employee IDs on the assignments
    UPDATE app.shift_assignments
    SET employee_id = v_request.target_employee_id,
        notes = COALESCE(notes, '') || ' [Swapped from ' || v_request.requester_id::text || ' via swap request ' || p_request_id::text || ']'
    WHERE id = v_request.requester_assignment_id;

    UPDATE app.shift_assignments
    SET employee_id = v_request.requester_id,
        notes = COALESCE(notes, '') || ' [Swapped from ' || v_request.target_employee_id::text || ' via swap request ' || p_request_id::text || ']'
    WHERE id = v_request.target_assignment_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.execute_shift_swap IS 'Executes an approved swap by updating shift assignments';

-- Function to cancel a swap request (requester only)
CREATE OR REPLACE FUNCTION app.cancel_swap_request(
    p_request_id uuid,
    p_employee_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_request RECORD;
BEGIN
    -- Get request
    SELECT * INTO v_request
    FROM app.shift_swap_requests
    WHERE id = p_request_id;

    IF v_request IS NULL THEN
        RAISE EXCEPTION 'Swap request not found: %', p_request_id;
    END IF;

    IF v_request.requester_id != p_employee_id THEN
        RAISE EXCEPTION 'Only the requester can cancel a swap request';
    END IF;

    IF v_request.status NOT IN ('pending', 'approved') THEN
        RAISE EXCEPTION 'Cannot cancel request with status: %', v_request.status;
    END IF;

    -- Cancel the request
    UPDATE app.shift_swap_requests
    SET status = 'cancelled'
    WHERE id = p_request_id;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.cancel_swap_request IS 'Cancels a swap request (requester only)';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.shift_swap_requests IS 'Shift swap requests between employees. Requires target acceptance and manager approval.';
COMMENT ON COLUMN app.shift_swap_requests.id IS 'Primary UUID identifier for the request';
COMMENT ON COLUMN app.shift_swap_requests.tenant_id IS 'Tenant that owns this request';
COMMENT ON COLUMN app.shift_swap_requests.requester_assignment_id IS 'The assignment the requester wants to swap away';
COMMENT ON COLUMN app.shift_swap_requests.target_assignment_id IS 'The assignment the requester wants to swap for';
COMMENT ON COLUMN app.shift_swap_requests.requester_id IS 'The employee requesting the swap';
COMMENT ON COLUMN app.shift_swap_requests.target_employee_id IS 'The employee being asked to swap';
COMMENT ON COLUMN app.shift_swap_requests.status IS 'Current status (pending, approved, rejected, cancelled)';
COMMENT ON COLUMN app.shift_swap_requests.reason IS 'Reason provided by requester';
COMMENT ON COLUMN app.shift_swap_requests.target_accepted IS 'Whether target employee accepted';
COMMENT ON COLUMN app.shift_swap_requests.target_response_at IS 'When target employee responded';
COMMENT ON COLUMN app.shift_swap_requests.approved_by IS 'Manager who approved/rejected';
COMMENT ON COLUMN app.shift_swap_requests.approved_at IS 'When request was approved/rejected';
COMMENT ON FUNCTION app.validate_shift_swap_status_transition IS 'Trigger function enforcing valid swap status transitions';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.cancel_swap_request(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.execute_shift_swap(uuid);
-- DROP FUNCTION IF EXISTS app.process_swap_request(uuid, boolean, uuid, text);
-- DROP FUNCTION IF EXISTS app.respond_to_swap_request(uuid, boolean, text);
-- DROP FUNCTION IF EXISTS app.get_swap_requests_by_employee(uuid, boolean);
-- DROP FUNCTION IF EXISTS app.get_pending_swap_requests_for_employee(uuid);
-- DROP TRIGGER IF EXISTS validate_shift_swap_status_transition ON app.shift_swap_requests;
-- DROP FUNCTION IF EXISTS app.validate_shift_swap_status_transition();
-- DROP TRIGGER IF EXISTS update_shift_swap_requests_updated_at ON app.shift_swap_requests;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.shift_swap_requests;
-- DROP POLICY IF EXISTS tenant_isolation ON app.shift_swap_requests;
-- DROP INDEX IF EXISTS app.idx_shift_swap_assignments;
-- DROP INDEX IF EXISTS app.idx_shift_swap_pending_approval;
-- DROP INDEX IF EXISTS app.idx_shift_swap_pending;
-- DROP INDEX IF EXISTS app.idx_shift_swap_target;
-- DROP INDEX IF EXISTS app.idx_shift_swap_requester;
-- DROP TABLE IF EXISTS app.shift_swap_requests;
