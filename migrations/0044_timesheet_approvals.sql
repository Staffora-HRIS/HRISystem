-- Migration: 0044_timesheet_approvals
-- Created: 2026-01-07
-- Description: Create the timesheet_approvals table for immutable approval history
--              This is an APPEND-ONLY audit trail of all timesheet status changes
--              NO UPDATES OR DELETES ALLOWED - ensures complete audit trail

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Timesheet Approvals Table (APPEND-ONLY)
-- -----------------------------------------------------------------------------
-- Immutable audit trail of all timesheet status changes
-- Every status change (submit, approve, reject, lock, unlock) is recorded
-- This table CANNOT be modified or deleted from - only inserted into
CREATE TABLE IF NOT EXISTS app.timesheet_approvals (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this record
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The timesheet this approval is for
    timesheet_id uuid NOT NULL REFERENCES app.timesheets(id) ON DELETE CASCADE,

    -- The action taken
    action app.timesheet_approval_action NOT NULL,

    -- The user who performed this action
    actor_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,

    -- Comment or reason for this action
    comment text,

    -- Snapshot of timesheet totals at time of action
    -- Ensures we have historical record even if timesheet is modified
    hours_snapshot jsonb,

    -- Context information for audit
    ip_address varchar(45),
    user_agent text,

    -- When this action occurred (immutable)
    created_at timestamptz NOT NULL DEFAULT now()

    -- NO updated_at - this table is append-only
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: timesheet + action history
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_timesheet
    ON app.timesheet_approvals(timesheet_id, created_at DESC);

-- Tenant-based queries
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_tenant
    ON app.timesheet_approvals(tenant_id, created_at DESC);

-- Actor's actions (for audit)
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_actor
    ON app.timesheet_approvals(actor_id, created_at DESC);

-- Action type filtering
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_action
    ON app.timesheet_approvals(tenant_id, action, created_at DESC);

-- Recent actions (for dashboards)
CREATE INDEX IF NOT EXISTS idx_timesheet_approvals_recent
    ON app.timesheet_approvals(tenant_id, created_at DESC);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.timesheet_approvals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only READ approvals for their current tenant
-- Note: INSERT is controlled via SECURITY DEFINER function
CREATE POLICY tenant_isolation_select ON app.timesheet_approvals
    FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy: Allow inserts only through SECURITY DEFINER function
-- This prevents direct inserts that could bypass validation
CREATE POLICY approval_insert_policy ON app.timesheet_approvals
    FOR INSERT
    WITH CHECK (app.is_system_context());

-- =============================================================================
-- Prevent Updates and Deletes (CRITICAL - Maintains Immutability)
-- =============================================================================

-- Trigger to prevent updates (approval history is immutable)
CREATE TRIGGER prevent_timesheet_approvals_update
    BEFORE UPDATE ON app.timesheet_approvals
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_update();

-- Trigger to prevent deletes (approval history is immutable)
CREATE TRIGGER prevent_timesheet_approvals_delete
    BEFORE DELETE ON app.timesheet_approvals
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_delete();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to record a timesheet approval action (SECURITY DEFINER to bypass RLS)
-- This is the ONLY way to insert into timesheet_approvals
CREATE OR REPLACE FUNCTION app.record_timesheet_approval(
    p_timesheet_id uuid,
    p_action app.timesheet_approval_action,
    p_actor_id uuid,
    p_comment text DEFAULT NULL,
    p_ip_address varchar(45) DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_timesheet RECORD;
    v_approval_id uuid;
    v_hours_snapshot jsonb;
BEGIN
    -- Get timesheet details
    SELECT * INTO v_timesheet
    FROM app.timesheets
    WHERE id = p_timesheet_id;

    IF v_timesheet IS NULL THEN
        RAISE EXCEPTION 'Timesheet not found: %', p_timesheet_id;
    END IF;

    -- Create hours snapshot
    v_hours_snapshot := jsonb_build_object(
        'total_regular_hours', v_timesheet.total_regular_hours,
        'total_overtime_hours', v_timesheet.total_overtime_hours,
        'total_break_minutes', v_timesheet.total_break_minutes,
        'period_start', v_timesheet.period_start,
        'period_end', v_timesheet.period_end
    );

    -- Enable system context for insert
    PERFORM app.enable_system_context();

    -- Insert approval record
    INSERT INTO app.timesheet_approvals (
        tenant_id,
        timesheet_id,
        action,
        actor_id,
        comment,
        hours_snapshot,
        ip_address,
        user_agent,
        created_at
    )
    VALUES (
        v_timesheet.tenant_id,
        p_timesheet_id,
        p_action,
        p_actor_id,
        p_comment,
        v_hours_snapshot,
        p_ip_address,
        p_user_agent,
        now()
    )
    RETURNING id INTO v_approval_id;

    -- Disable system context
    PERFORM app.disable_system_context();

    RETURN v_approval_id;
END;
$$;

COMMENT ON FUNCTION app.record_timesheet_approval IS 'Records an immutable timesheet approval action. Only way to insert into timesheet_approvals.';

-- Function to get approval history for a timesheet
CREATE OR REPLACE FUNCTION app.get_timesheet_approval_history(
    p_timesheet_id uuid
)
RETURNS TABLE (
    id uuid,
    action app.timesheet_approval_action,
    actor_id uuid,
    actor_name varchar(255),
    comment text,
    hours_snapshot jsonb,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ta.id,
        ta.action,
        ta.actor_id,
        u.name AS actor_name,
        ta.comment,
        ta.hours_snapshot,
        ta.created_at
    FROM app.timesheet_approvals ta
    JOIN app.users u ON ta.actor_id = u.id
    WHERE ta.timesheet_id = p_timesheet_id
    ORDER BY ta.created_at;
END;
$$;

COMMENT ON FUNCTION app.get_timesheet_approval_history IS 'Returns the complete approval history for a timesheet';

-- Function to get recent approval actions by an actor
CREATE OR REPLACE FUNCTION app.get_actor_approval_history(
    p_actor_id uuid,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    timesheet_id uuid,
    employee_id uuid,
    employee_number varchar(50),
    period_start date,
    period_end date,
    action app.timesheet_approval_action,
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
        ta.id,
        ta.timesheet_id,
        t.employee_id,
        e.employee_number,
        t.period_start,
        t.period_end,
        ta.action,
        ta.comment,
        ta.created_at
    FROM app.timesheet_approvals ta
    JOIN app.timesheets t ON ta.timesheet_id = t.id
    JOIN app.employees e ON t.employee_id = e.id
    WHERE ta.actor_id = p_actor_id
    ORDER BY ta.created_at DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION app.get_actor_approval_history IS 'Returns recent approval actions by a specific user';

-- Function to get approval statistics
CREATE OR REPLACE FUNCTION app.get_approval_statistics(
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    action app.timesheet_approval_action,
    count bigint,
    avg_hours_per_timesheet numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ta.action,
        COUNT(*)::bigint,
        ROUND(AVG((ta.hours_snapshot->>'total_regular_hours')::numeric +
                  (ta.hours_snapshot->>'total_overtime_hours')::numeric), 2)
    FROM app.timesheet_approvals ta
    WHERE ta.created_at >= p_start_date::timestamptz
      AND ta.created_at < (p_end_date + interval '1 day')::timestamptz
    GROUP BY ta.action
    ORDER BY ta.action;
END;
$$;

COMMENT ON FUNCTION app.get_approval_statistics IS 'Returns approval action statistics for a date range';

-- Function to check if action would be duplicate (for idempotency)
CREATE OR REPLACE FUNCTION app.is_duplicate_approval_action(
    p_timesheet_id uuid,
    p_action app.timesheet_approval_action,
    p_actor_id uuid,
    p_window_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM app.timesheet_approvals
        WHERE timesheet_id = p_timesheet_id
          AND action = p_action
          AND actor_id = p_actor_id
          AND created_at > now() - (p_window_seconds || ' seconds')::interval
    );
END;
$$;

COMMENT ON FUNCTION app.is_duplicate_approval_action IS 'Checks if an approval action was already recorded recently (for idempotency)';

-- Enhanced timesheet submission that records approval
CREATE OR REPLACE FUNCTION app.submit_timesheet_with_approval(
    p_timesheet_id uuid,
    p_user_id uuid,
    p_comment text DEFAULT NULL,
    p_ip_address varchar(45) DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_approval_id uuid;
BEGIN
    -- Submit the timesheet
    PERFORM app.submit_timesheet(p_timesheet_id, p_user_id);

    -- Record the approval action
    v_approval_id := app.record_timesheet_approval(
        p_timesheet_id,
        'submit',
        p_user_id,
        p_comment,
        p_ip_address,
        p_user_agent
    );

    RETURN v_approval_id;
END;
$$;

COMMENT ON FUNCTION app.submit_timesheet_with_approval IS 'Submits a timesheet and records the action in approval history';

-- Enhanced timesheet approval that records approval
CREATE OR REPLACE FUNCTION app.approve_timesheet_with_approval(
    p_timesheet_id uuid,
    p_user_id uuid,
    p_comment text DEFAULT NULL,
    p_ip_address varchar(45) DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_approval_id uuid;
BEGIN
    -- Approve the timesheet
    PERFORM app.approve_timesheet(p_timesheet_id, p_user_id);

    -- Record the approval action
    v_approval_id := app.record_timesheet_approval(
        p_timesheet_id,
        'approve',
        p_user_id,
        p_comment,
        p_ip_address,
        p_user_agent
    );

    RETURN v_approval_id;
END;
$$;

COMMENT ON FUNCTION app.approve_timesheet_with_approval IS 'Approves a timesheet and records the action in approval history';

-- Enhanced timesheet rejection that records approval
CREATE OR REPLACE FUNCTION app.reject_timesheet_with_approval(
    p_timesheet_id uuid,
    p_user_id uuid,
    p_reason text,
    p_ip_address varchar(45) DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_approval_id uuid;
BEGIN
    -- Reject the timesheet
    PERFORM app.reject_timesheet(p_timesheet_id, p_user_id, p_reason);

    -- Record the approval action
    v_approval_id := app.record_timesheet_approval(
        p_timesheet_id,
        'reject',
        p_user_id,
        p_reason,
        p_ip_address,
        p_user_agent
    );

    RETURN v_approval_id;
END;
$$;

COMMENT ON FUNCTION app.reject_timesheet_with_approval IS 'Rejects a timesheet and records the action in approval history';

-- Enhanced timesheet lock that records approval
CREATE OR REPLACE FUNCTION app.lock_timesheet_with_approval(
    p_timesheet_id uuid,
    p_user_id uuid,
    p_comment text DEFAULT 'Locked for payroll processing',
    p_ip_address varchar(45) DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_approval_id uuid;
BEGIN
    -- Lock the timesheet
    PERFORM app.lock_timesheet(p_timesheet_id);

    -- Record the approval action
    v_approval_id := app.record_timesheet_approval(
        p_timesheet_id,
        'lock',
        p_user_id,
        p_comment,
        p_ip_address,
        p_user_agent
    );

    RETURN v_approval_id;
END;
$$;

COMMENT ON FUNCTION app.lock_timesheet_with_approval IS 'Locks a timesheet and records the action in approval history';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.timesheet_approvals IS 'APPEND-ONLY immutable audit trail of timesheet approval actions. NO UPDATES OR DELETES ALLOWED.';
COMMENT ON COLUMN app.timesheet_approvals.id IS 'Primary UUID identifier for the approval record';
COMMENT ON COLUMN app.timesheet_approvals.tenant_id IS 'Tenant that owns this record';
COMMENT ON COLUMN app.timesheet_approvals.timesheet_id IS 'The timesheet this action is for';
COMMENT ON COLUMN app.timesheet_approvals.action IS 'The action taken (submit, approve, reject, lock, unlock)';
COMMENT ON COLUMN app.timesheet_approvals.actor_id IS 'The user who performed this action';
COMMENT ON COLUMN app.timesheet_approvals.comment IS 'Comment or reason for this action';
COMMENT ON COLUMN app.timesheet_approvals.hours_snapshot IS 'Snapshot of timesheet hours at time of action';
COMMENT ON COLUMN app.timesheet_approvals.ip_address IS 'Client IP address for audit';
COMMENT ON COLUMN app.timesheet_approvals.user_agent IS 'Client user agent for audit';
COMMENT ON COLUMN app.timesheet_approvals.created_at IS 'When this action occurred (immutable)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.lock_timesheet_with_approval(uuid, uuid, text, varchar, text);
-- DROP FUNCTION IF EXISTS app.reject_timesheet_with_approval(uuid, uuid, text, varchar, text);
-- DROP FUNCTION IF EXISTS app.approve_timesheet_with_approval(uuid, uuid, text, varchar, text);
-- DROP FUNCTION IF EXISTS app.submit_timesheet_with_approval(uuid, uuid, text, varchar, text);
-- DROP FUNCTION IF EXISTS app.is_duplicate_approval_action(uuid, app.timesheet_approval_action, uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_approval_statistics(date, date);
-- DROP FUNCTION IF EXISTS app.get_actor_approval_history(uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_timesheet_approval_history(uuid);
-- DROP FUNCTION IF EXISTS app.record_timesheet_approval(uuid, app.timesheet_approval_action, uuid, text, varchar, text);
-- DROP TRIGGER IF EXISTS prevent_timesheet_approvals_delete ON app.timesheet_approvals;
-- DROP TRIGGER IF EXISTS prevent_timesheet_approvals_update ON app.timesheet_approvals;
-- DROP POLICY IF EXISTS approval_insert_policy ON app.timesheet_approvals;
-- DROP POLICY IF EXISTS tenant_isolation_select ON app.timesheet_approvals;
-- DROP INDEX IF EXISTS app.idx_timesheet_approvals_recent;
-- DROP INDEX IF EXISTS app.idx_timesheet_approvals_action;
-- DROP INDEX IF EXISTS app.idx_timesheet_approvals_actor;
-- DROP INDEX IF EXISTS app.idx_timesheet_approvals_tenant;
-- DROP INDEX IF EXISTS app.idx_timesheet_approvals_timesheet;
-- DROP TABLE IF EXISTS app.timesheet_approvals;
