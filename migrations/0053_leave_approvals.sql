-- Migration: 0053_leave_approvals
-- Created: 2026-01-07
-- Description: Create the leave_request_approvals table - immutable approval history
--              Records every action taken on a leave request
--              This is an APPEND-ONLY audit log - no updates or deletes allowed
--              Enables complete approval trail for compliance and auditing

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leave Request Approvals Table (Audit Log)
-- -----------------------------------------------------------------------------
-- Immutable record of all actions taken on leave requests
-- Every submit, approve, reject, and cancel action is recorded here
-- This table is append-only - no updates or deletes allowed
CREATE TABLE IF NOT EXISTS app.leave_request_approvals (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this record
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The leave request this action relates to
    request_id uuid NOT NULL REFERENCES app.leave_requests(id) ON DELETE CASCADE,

    -- ==========================================================================
    -- ACTION DETAILS
    -- ==========================================================================

    -- The action that was taken
    -- submit: Employee submitted request for approval
    -- approve: Approver approved the request
    -- reject: Approver rejected the request
    -- cancel: Employee or admin cancelled the request
    -- escalate: Request escalated to higher level
    -- reassign: Request reassigned to different approver
    -- comment: Comment added without status change
    action varchar(20) NOT NULL,

    -- The user who performed the action
    actor_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    -- Role of the actor at time of action
    -- e.g., 'employee', 'manager', 'hr_admin', 'system'
    actor_role varchar(50),

    -- ==========================================================================
    -- COMMENTS AND CONTEXT
    -- ==========================================================================

    -- Comment provided with the action
    -- Required for rejections, optional for other actions
    comment text,

    -- Previous status (for tracking transitions)
    previous_status app.leave_request_status,

    -- New status after this action
    new_status app.leave_request_status,

    -- ==========================================================================
    -- WORKFLOW CONTEXT
    -- ==========================================================================

    -- Reference to workflow step (if part of workflow)
    workflow_step_id uuid,

    -- Approval level in multi-level approval workflows
    -- 1 = first level (direct manager), 2 = second level (department head), etc.
    approval_level integer,

    -- ==========================================================================
    -- DELEGATION TRACKING
    -- ==========================================================================

    -- If action was taken on behalf of someone else (delegation)
    on_behalf_of_id uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- ==========================================================================
    -- AUDIT TIMESTAMP
    -- ==========================================================================

    -- When this action was recorded
    -- This is immutable (no updates allowed)
    created_at timestamptz NOT NULL DEFAULT now(),

    -- ==========================================================================
    -- CONSTRAINTS
    -- ==========================================================================

    -- Action must be a valid value
    CONSTRAINT leave_request_approvals_action_check CHECK (
        action IN ('submit', 'approve', 'reject', 'cancel', 'escalate', 'reassign', 'comment')
    ),

    -- Rejection must have a comment
    CONSTRAINT leave_request_approvals_reject_comment CHECK (
        action != 'reject' OR comment IS NOT NULL
    ),

    -- Approval level must be positive if specified
    CONSTRAINT leave_request_approvals_level_check CHECK (
        approval_level IS NULL OR approval_level > 0
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: approvals for a request
CREATE INDEX IF NOT EXISTS idx_leave_approvals_request
    ON app.leave_request_approvals(tenant_id, request_id, created_at);

-- Actor's actions (for audit queries)
CREATE INDEX IF NOT EXISTS idx_leave_approvals_actor
    ON app.leave_request_approvals(tenant_id, actor_id, created_at);

-- Action type filtering
CREATE INDEX IF NOT EXISTS idx_leave_approvals_action
    ON app.leave_request_approvals(tenant_id, action, created_at);

-- Date range queries (for reporting)
CREATE INDEX IF NOT EXISTS idx_leave_approvals_date
    ON app.leave_request_approvals(tenant_id, created_at);

-- Workflow step tracking
CREATE INDEX IF NOT EXISTS idx_leave_approvals_workflow
    ON app.leave_request_approvals(workflow_step_id)
    WHERE workflow_step_id IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.leave_request_approvals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see approvals for their current tenant
CREATE POLICY tenant_isolation ON app.leave_request_approvals
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.leave_request_approvals
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- CRITICAL: Prevent Updates and Deletes
-- =============================================================================

-- This is an append-only audit log - no updates or deletes allowed
-- This ensures complete audit trail integrity

CREATE OR REPLACE FUNCTION app.prevent_approval_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RAISE EXCEPTION 'Leave request approval history is append-only. Updates and deletes are not allowed for audit integrity.';
    RETURN NULL;
END;
$$;

CREATE TRIGGER prevent_approval_update
    BEFORE UPDATE ON app.leave_request_approvals
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_approval_modification();

CREATE TRIGGER prevent_approval_delete
    BEFORE DELETE ON app.leave_request_approvals
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_approval_modification();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to record an approval action
CREATE OR REPLACE FUNCTION app.record_leave_approval_action(
    p_tenant_id uuid,
    p_request_id uuid,
    p_action varchar(20),
    p_actor_id uuid,
    p_comment text DEFAULT NULL,
    p_actor_role varchar(50) DEFAULT NULL,
    p_workflow_step_id uuid DEFAULT NULL,
    p_approval_level integer DEFAULT NULL,
    p_on_behalf_of_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_status app.leave_request_status;
    v_new_status app.leave_request_status;
    v_approval_id uuid;
BEGIN
    -- Get current status of the request
    SELECT status INTO v_current_status
    FROM app.leave_requests
    WHERE id = p_request_id;

    -- Determine new status based on action
    CASE p_action
        WHEN 'submit' THEN v_new_status := 'pending';
        WHEN 'approve' THEN v_new_status := 'approved';
        WHEN 'reject' THEN v_new_status := 'rejected';
        WHEN 'cancel' THEN v_new_status := 'cancelled';
        ELSE v_new_status := v_current_status; -- No status change for comment, escalate, reassign
    END CASE;

    -- Insert the approval record
    INSERT INTO app.leave_request_approvals (
        tenant_id,
        request_id,
        action,
        actor_id,
        actor_role,
        comment,
        previous_status,
        new_status,
        workflow_step_id,
        approval_level,
        on_behalf_of_id
    ) VALUES (
        p_tenant_id,
        p_request_id,
        p_action,
        p_actor_id,
        p_actor_role,
        p_comment,
        v_current_status,
        v_new_status,
        p_workflow_step_id,
        p_approval_level,
        p_on_behalf_of_id
    )
    RETURNING id INTO v_approval_id;

    RETURN v_approval_id;
END;
$$;

-- Function to get approval history for a request
CREATE OR REPLACE FUNCTION app.get_leave_approval_history(
    p_request_id uuid
)
RETURNS TABLE (
    id uuid,
    action varchar(20),
    actor_id uuid,
    actor_role varchar(50),
    comment text,
    previous_status app.leave_request_status,
    new_status app.leave_request_status,
    approval_level integer,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lra.id,
        lra.action,
        lra.actor_id,
        lra.actor_role,
        lra.comment,
        lra.previous_status,
        lra.new_status,
        lra.approval_level,
        lra.created_at
    FROM app.leave_request_approvals lra
    WHERE lra.request_id = p_request_id
    ORDER BY lra.created_at ASC;
END;
$$;

-- Function to get approval statistics for a manager
CREATE OR REPLACE FUNCTION app.get_manager_approval_stats(
    p_tenant_id uuid,
    p_actor_id uuid,
    p_start_date date DEFAULT NULL,
    p_end_date date DEFAULT NULL
)
RETURNS TABLE (
    total_actions integer,
    approvals integer,
    rejections integer,
    avg_response_time_hours numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::integer AS total_actions,
        COUNT(*) FILTER (WHERE action = 'approve')::integer AS approvals,
        COUNT(*) FILTER (WHERE action = 'reject')::integer AS rejections,
        ROUND(AVG(
            EXTRACT(EPOCH FROM (lra.created_at - lr.submitted_at)) / 3600
        )::numeric, 2) AS avg_response_time_hours
    FROM app.leave_request_approvals lra
    INNER JOIN app.leave_requests lr ON lr.id = lra.request_id
    WHERE lra.tenant_id = p_tenant_id
      AND lra.actor_id = p_actor_id
      AND lra.action IN ('approve', 'reject')
      AND (p_start_date IS NULL OR lra.created_at::date >= p_start_date)
      AND (p_end_date IS NULL OR lra.created_at::date <= p_end_date);
END;
$$;

-- Function to get recent approval activity for audit dashboard
CREATE OR REPLACE FUNCTION app.get_recent_approval_activity(
    p_tenant_id uuid,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    approval_id uuid,
    request_id uuid,
    employee_id uuid,
    employee_number varchar(50),
    leave_type_name varchar(255),
    action varchar(20),
    actor_id uuid,
    actor_role varchar(50),
    comment text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lra.id AS approval_id,
        lr.id AS request_id,
        e.id AS employee_id,
        e.employee_number,
        lt.name AS leave_type_name,
        lra.action,
        lra.actor_id,
        lra.actor_role,
        lra.comment,
        lra.created_at
    FROM app.leave_request_approvals lra
    INNER JOIN app.leave_requests lr ON lr.id = lra.request_id
    INNER JOIN app.employees e ON e.id = lr.employee_id
    INNER JOIN app.leave_types lt ON lt.id = lr.leave_type_id
    WHERE lra.tenant_id = p_tenant_id
    ORDER BY lra.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Function to check if user has taken action on a request
CREATE OR REPLACE FUNCTION app.has_user_actioned_request(
    p_request_id uuid,
    p_actor_id uuid,
    p_action varchar(20) DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1
        FROM app.leave_request_approvals
        WHERE request_id = p_request_id
          AND actor_id = p_actor_id
          AND (p_action IS NULL OR action = p_action)
    );
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.leave_request_approvals IS 'Immutable audit log of all actions on leave requests. Append-only.';
COMMENT ON COLUMN app.leave_request_approvals.id IS 'Primary UUID identifier for the approval record';
COMMENT ON COLUMN app.leave_request_approvals.tenant_id IS 'Tenant that owns this record';
COMMENT ON COLUMN app.leave_request_approvals.request_id IS 'The leave request this action relates to';
COMMENT ON COLUMN app.leave_request_approvals.action IS 'Action taken: submit, approve, reject, cancel, escalate, reassign, comment';
COMMENT ON COLUMN app.leave_request_approvals.actor_id IS 'User who performed the action';
COMMENT ON COLUMN app.leave_request_approvals.actor_role IS 'Role of actor at time of action';
COMMENT ON COLUMN app.leave_request_approvals.comment IS 'Comment provided with action';
COMMENT ON COLUMN app.leave_request_approvals.previous_status IS 'Request status before action';
COMMENT ON COLUMN app.leave_request_approvals.new_status IS 'Request status after action';
COMMENT ON COLUMN app.leave_request_approvals.workflow_step_id IS 'Reference to workflow step';
COMMENT ON COLUMN app.leave_request_approvals.approval_level IS 'Level in multi-level approval';
COMMENT ON COLUMN app.leave_request_approvals.on_behalf_of_id IS 'If action taken on behalf of another user';
COMMENT ON COLUMN app.leave_request_approvals.created_at IS 'When action was recorded (immutable)';
COMMENT ON FUNCTION app.prevent_approval_modification IS 'Prevents updates/deletes on audit log';
COMMENT ON FUNCTION app.record_leave_approval_action IS 'Records an approval action';
COMMENT ON FUNCTION app.get_leave_approval_history IS 'Returns approval history for a request';
COMMENT ON FUNCTION app.get_manager_approval_stats IS 'Returns approval statistics for a manager';
COMMENT ON FUNCTION app.get_recent_approval_activity IS 'Returns recent approval activity for dashboard';
COMMENT ON FUNCTION app.has_user_actioned_request IS 'Checks if user has taken action on request';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.has_user_actioned_request(uuid, uuid, varchar);
-- DROP FUNCTION IF EXISTS app.get_recent_approval_activity(uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_manager_approval_stats(uuid, uuid, date, date);
-- DROP FUNCTION IF EXISTS app.get_leave_approval_history(uuid);
-- DROP FUNCTION IF EXISTS app.record_leave_approval_action(uuid, uuid, varchar, uuid, text, varchar, uuid, integer, uuid);
-- DROP TRIGGER IF EXISTS prevent_approval_delete ON app.leave_request_approvals;
-- DROP TRIGGER IF EXISTS prevent_approval_update ON app.leave_request_approvals;
-- DROP FUNCTION IF EXISTS app.prevent_approval_modification();
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.leave_request_approvals;
-- DROP POLICY IF EXISTS tenant_isolation ON app.leave_request_approvals;
-- DROP INDEX IF EXISTS app.idx_leave_approvals_workflow;
-- DROP INDEX IF EXISTS app.idx_leave_approvals_date;
-- DROP INDEX IF EXISTS app.idx_leave_approvals_action;
-- DROP INDEX IF EXISTS app.idx_leave_approvals_actor;
-- DROP INDEX IF EXISTS app.idx_leave_approvals_request;
-- DROP TABLE IF EXISTS app.leave_request_approvals;
