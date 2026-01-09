-- Migration: 0031_workflow_tasks
-- Created: 2026-01-07
-- Description: Create the workflow_tasks table - individual approval/action tasks
--              This table tracks tasks assigned to users/roles within workflow instances
--              Supports SLA tracking, priority, and multiple completion actions

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Workflow Tasks Table
-- -----------------------------------------------------------------------------
-- Individual tasks within a workflow instance
-- Tasks are created as the workflow progresses through steps
-- Each task can be assigned to a user or role
CREATE TABLE IF NOT EXISTS app.workflow_tasks (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this task exists
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent workflow instance
    instance_id uuid NOT NULL REFERENCES app.workflow_instances(id) ON DELETE CASCADE,

    -- Step information
    step_index integer NOT NULL,
    step_name varchar(255),

    -- Current task status
    status app.workflow_task_status NOT NULL DEFAULT 'pending',

    -- Assignment (user or role, one must be set)
    assigned_to uuid REFERENCES app.users(id) ON DELETE SET NULL,
    assigned_role_id uuid REFERENCES app.roles(id) ON DELETE SET NULL,

    -- SLA tracking
    due_date timestamptz,
    sla_deadline timestamptz,

    -- Priority (higher = more urgent, default 0)
    priority integer NOT NULL DEFAULT 0,

    -- Task-specific context/data
    -- Structure: {
    --   "step_config": { ... },
    --   "available_actions": ["approve", "reject", "request_info"],
    --   "form_data": { ... },
    --   "previous_task_id": "uuid",
    --   "delegation_history": [...]
    -- }
    context jsonb NOT NULL DEFAULT '{}',

    -- Completion information
    completed_at timestamptz,
    completed_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    completion_action app.workflow_action_type,
    completion_comment text,

    -- Standard audit field
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- At least one assignment must be set (user or role)
    CONSTRAINT workflow_tasks_has_assignment CHECK (
        assigned_to IS NOT NULL OR assigned_role_id IS NOT NULL
    ),

    -- Completed tasks must have completion info
    CONSTRAINT workflow_tasks_completed_has_info CHECK (
        status != 'completed' OR (
            completed_at IS NOT NULL AND
            completed_by IS NOT NULL AND
            completion_action IS NOT NULL
        )
    ),

    -- Step index must be non-negative
    CONSTRAINT workflow_tasks_step_index_valid CHECK (
        step_index >= 0
    ),

    -- SLA deadline must be after created_at (if set)
    CONSTRAINT workflow_tasks_sla_valid CHECK (
        sla_deadline IS NULL OR sla_deadline > created_at
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- My tasks: tasks assigned to a specific user
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_tenant_assigned_to_status
    ON app.workflow_tasks(tenant_id, assigned_to, status)
    WHERE assigned_to IS NOT NULL;

-- Role-based tasks: tasks assigned to a role
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_tenant_role_status
    ON app.workflow_tasks(tenant_id, assigned_role_id, status)
    WHERE assigned_role_id IS NOT NULL;

-- Overdue tasks: tasks past their due date
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_tenant_status_due_date
    ON app.workflow_tasks(tenant_id, status, due_date)
    WHERE due_date IS NOT NULL;

-- SLA tracking: tasks approaching or past SLA deadline
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_tenant_status_sla
    ON app.workflow_tasks(tenant_id, status, sla_deadline)
    WHERE sla_deadline IS NOT NULL;

-- Tasks by instance
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_instance_id
    ON app.workflow_tasks(instance_id, step_index);

-- Active tasks (pending or in_progress)
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_tenant_active
    ON app.workflow_tasks(tenant_id, created_at DESC)
    WHERE status IN ('pending', 'assigned', 'in_progress');

-- Priority ordering
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_tenant_priority
    ON app.workflow_tasks(tenant_id, priority DESC, created_at ASC)
    WHERE status IN ('pending', 'assigned', 'in_progress');

-- GIN index for context queries
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_context
    ON app.workflow_tasks USING gin(context);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.workflow_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see workflow tasks for their current tenant
CREATE POLICY tenant_isolation ON app.workflow_tasks
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.workflow_tasks
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Function to validate workflow task status transitions
CREATE OR REPLACE FUNCTION app.validate_workflow_task_status_transition()
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
            -- pending can transition to assigned, skipped, or cancelled
            IF NEW.status NOT IN ('assigned', 'skipped', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: pending can only transition to assigned, skipped, or cancelled, not %', NEW.status;
            END IF;

        WHEN 'assigned' THEN
            -- assigned can transition to in_progress or cancelled
            IF NEW.status NOT IN ('in_progress', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: assigned can only transition to in_progress or cancelled, not %', NEW.status;
            END IF;

        WHEN 'in_progress' THEN
            -- in_progress can transition to completed, skipped, escalated, or cancelled
            IF NEW.status NOT IN ('completed', 'skipped', 'escalated', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: in_progress can only transition to completed, skipped, escalated, or cancelled, not %', NEW.status;
            END IF;

        WHEN 'escalated' THEN
            -- escalated can transition to completed or cancelled
            IF NEW.status NOT IN ('completed', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: escalated can only transition to completed or cancelled, not %', NEW.status;
            END IF;

        WHEN 'completed' THEN
            -- completed is a terminal state
            RAISE EXCEPTION 'Invalid status transition: completed is a terminal state';

        WHEN 'skipped' THEN
            -- skipped is a terminal state
            RAISE EXCEPTION 'Invalid status transition: skipped is a terminal state';

        WHEN 'cancelled' THEN
            -- cancelled is a terminal state
            RAISE EXCEPTION 'Invalid status transition: cancelled is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_workflow_task_status_transition
    BEFORE UPDATE OF status ON app.workflow_tasks
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_workflow_task_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get pending tasks for a user
CREATE OR REPLACE FUNCTION app.get_my_pending_tasks(
    p_tenant_id uuid,
    p_user_id uuid,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    instance_id uuid,
    definition_code varchar(100),
    definition_name varchar(255),
    step_name varchar(255),
    status app.workflow_task_status,
    priority integer,
    due_date timestamptz,
    sla_deadline timestamptz,
    context jsonb,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wt.id,
        wt.instance_id,
        wd.code AS definition_code,
        wd.name AS definition_name,
        wt.step_name,
        wt.status,
        wt.priority,
        wt.due_date,
        wt.sla_deadline,
        wt.context,
        wt.created_at
    FROM app.workflow_tasks wt
    JOIN app.workflow_instances wi ON wi.id = wt.instance_id
    JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
    WHERE wt.tenant_id = p_tenant_id
      AND wt.assigned_to = p_user_id
      AND wt.status IN ('pending', 'assigned', 'in_progress')
    ORDER BY wt.priority DESC, wt.sla_deadline ASC NULLS LAST, wt.created_at ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get tasks for a role (role-based inbox)
CREATE OR REPLACE FUNCTION app.get_role_pending_tasks(
    p_tenant_id uuid,
    p_role_id uuid,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    instance_id uuid,
    definition_code varchar(100),
    definition_name varchar(255),
    step_name varchar(255),
    status app.workflow_task_status,
    priority integer,
    due_date timestamptz,
    sla_deadline timestamptz,
    context jsonb,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wt.id,
        wt.instance_id,
        wd.code AS definition_code,
        wd.name AS definition_name,
        wt.step_name,
        wt.status,
        wt.priority,
        wt.due_date,
        wt.sla_deadline,
        wt.context,
        wt.created_at
    FROM app.workflow_tasks wt
    JOIN app.workflow_instances wi ON wi.id = wt.instance_id
    JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
    WHERE wt.tenant_id = p_tenant_id
      AND wt.assigned_role_id = p_role_id
      AND wt.assigned_to IS NULL  -- Not yet claimed by a user
      AND wt.status IN ('pending', 'assigned')
    ORDER BY wt.priority DESC, wt.sla_deadline ASC NULLS LAST, wt.created_at ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get overdue tasks
CREATE OR REPLACE FUNCTION app.get_overdue_tasks(
    p_tenant_id uuid,
    p_include_sla_warning boolean DEFAULT true
)
RETURNS TABLE (
    id uuid,
    instance_id uuid,
    definition_code varchar(100),
    step_name varchar(255),
    assigned_to uuid,
    assigned_role_id uuid,
    due_date timestamptz,
    sla_deadline timestamptz,
    is_overdue boolean,
    is_sla_breached boolean,
    hours_overdue numeric,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        wt.id,
        wt.instance_id,
        wd.code AS definition_code,
        wt.step_name,
        wt.assigned_to,
        wt.assigned_role_id,
        wt.due_date,
        wt.sla_deadline,
        (wt.due_date IS NOT NULL AND wt.due_date < now()) AS is_overdue,
        (wt.sla_deadline IS NOT NULL AND wt.sla_deadline < now()) AS is_sla_breached,
        CASE
            WHEN wt.sla_deadline IS NOT NULL AND wt.sla_deadline < now()
            THEN ROUND(EXTRACT(EPOCH FROM (now() - wt.sla_deadline)) / 3600, 2)
            WHEN wt.due_date IS NOT NULL AND wt.due_date < now()
            THEN ROUND(EXTRACT(EPOCH FROM (now() - wt.due_date)) / 3600, 2)
            ELSE 0
        END AS hours_overdue,
        wt.created_at
    FROM app.workflow_tasks wt
    JOIN app.workflow_instances wi ON wi.id = wt.instance_id
    JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
    WHERE wt.tenant_id = p_tenant_id
      AND wt.status IN ('pending', 'assigned', 'in_progress')
      AND (
          (wt.due_date IS NOT NULL AND wt.due_date < now())
          OR (wt.sla_deadline IS NOT NULL AND wt.sla_deadline < now())
      )
    ORDER BY
        (wt.sla_deadline IS NOT NULL AND wt.sla_deadline < now()) DESC,
        wt.sla_deadline ASC NULLS LAST,
        wt.due_date ASC NULLS LAST;
END;
$$;

-- Function to claim a role-based task
CREATE OR REPLACE FUNCTION app.claim_workflow_task(
    p_task_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_task_status app.workflow_task_status;
    v_assigned_to uuid;
BEGIN
    -- Get current task state
    SELECT status, assigned_to
    INTO v_task_status, v_assigned_to
    FROM app.workflow_tasks
    WHERE id = p_task_id;

    IF v_task_status IS NULL THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    IF v_assigned_to IS NOT NULL THEN
        RAISE EXCEPTION 'Task already claimed by another user';
    END IF;

    IF v_task_status NOT IN ('pending', 'assigned') THEN
        RAISE EXCEPTION 'Cannot claim task in status: %', v_task_status;
    END IF;

    -- Claim the task
    UPDATE app.workflow_tasks
    SET assigned_to = p_user_id,
        status = 'in_progress'
    WHERE id = p_task_id;

    RETURN true;
END;
$$;

-- Function to complete a workflow task
CREATE OR REPLACE FUNCTION app.complete_workflow_task(
    p_task_id uuid,
    p_user_id uuid,
    p_action app.workflow_action_type,
    p_comment text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_task_status app.workflow_task_status;
BEGIN
    -- Get current task state
    SELECT status INTO v_task_status
    FROM app.workflow_tasks
    WHERE id = p_task_id;

    IF v_task_status IS NULL THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    IF v_task_status NOT IN ('pending', 'assigned', 'in_progress', 'escalated') THEN
        RAISE EXCEPTION 'Cannot complete task in status: %', v_task_status;
    END IF;

    -- Complete the task
    UPDATE app.workflow_tasks
    SET status = 'completed',
        completed_at = now(),
        completed_by = p_user_id,
        completion_action = p_action,
        completion_comment = p_comment
    WHERE id = p_task_id;

    RETURN true;
END;
$$;

-- Function to delegate a task
CREATE OR REPLACE FUNCTION app.delegate_workflow_task(
    p_task_id uuid,
    p_from_user_id uuid,
    p_to_user_id uuid,
    p_comment text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_task_status app.workflow_task_status;
    v_context jsonb;
    v_delegation_history jsonb;
BEGIN
    -- Get current task state
    SELECT status, context
    INTO v_task_status, v_context
    FROM app.workflow_tasks
    WHERE id = p_task_id;

    IF v_task_status IS NULL THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    IF v_task_status NOT IN ('pending', 'assigned', 'in_progress') THEN
        RAISE EXCEPTION 'Cannot delegate task in status: %', v_task_status;
    END IF;

    -- Build delegation history entry
    v_delegation_history := COALESCE(v_context->'delegation_history', '[]'::jsonb) ||
        jsonb_build_object(
            'from_user_id', p_from_user_id,
            'to_user_id', p_to_user_id,
            'comment', p_comment,
            'delegated_at', now()
        );

    -- Delegate the task
    UPDATE app.workflow_tasks
    SET assigned_to = p_to_user_id,
        status = 'assigned',
        context = v_context || jsonb_build_object('delegation_history', v_delegation_history)
    WHERE id = p_task_id;

    RETURN true;
END;
$$;

-- Function to count pending tasks for a user
CREATE OR REPLACE FUNCTION app.count_pending_tasks(
    p_tenant_id uuid,
    p_user_id uuid
)
RETURNS TABLE (
    total_count bigint,
    high_priority_count bigint,
    overdue_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_count,
        COUNT(*) FILTER (WHERE wt.priority > 0)::bigint AS high_priority_count,
        COUNT(*) FILTER (WHERE wt.due_date < now() OR wt.sla_deadline < now())::bigint AS overdue_count
    FROM app.workflow_tasks wt
    WHERE wt.tenant_id = p_tenant_id
      AND wt.assigned_to = p_user_id
      AND wt.status IN ('pending', 'assigned', 'in_progress');
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.workflow_tasks IS 'Individual tasks within workflow instances. Assigned to users or roles.';
COMMENT ON COLUMN app.workflow_tasks.id IS 'Primary UUID identifier for the workflow task';
COMMENT ON COLUMN app.workflow_tasks.tenant_id IS 'Tenant where this task exists';
COMMENT ON COLUMN app.workflow_tasks.instance_id IS 'Parent workflow instance';
COMMENT ON COLUMN app.workflow_tasks.step_index IS 'Step index within the workflow (0-based)';
COMMENT ON COLUMN app.workflow_tasks.step_name IS 'Human-readable step name';
COMMENT ON COLUMN app.workflow_tasks.status IS 'Current task status';
COMMENT ON COLUMN app.workflow_tasks.assigned_to IS 'User assigned to this task';
COMMENT ON COLUMN app.workflow_tasks.assigned_role_id IS 'Role assigned to this task (for role-based assignment)';
COMMENT ON COLUMN app.workflow_tasks.due_date IS 'Due date for task completion';
COMMENT ON COLUMN app.workflow_tasks.sla_deadline IS 'SLA deadline (triggers escalation)';
COMMENT ON COLUMN app.workflow_tasks.priority IS 'Task priority (higher = more urgent)';
COMMENT ON COLUMN app.workflow_tasks.context IS 'Task-specific context and data';
COMMENT ON COLUMN app.workflow_tasks.completed_at IS 'When the task was completed';
COMMENT ON COLUMN app.workflow_tasks.completed_by IS 'User who completed the task';
COMMENT ON COLUMN app.workflow_tasks.completion_action IS 'Action taken to complete the task';
COMMENT ON COLUMN app.workflow_tasks.completion_comment IS 'Comment provided on completion';
COMMENT ON FUNCTION app.validate_workflow_task_status_transition IS 'Enforces valid status transitions';
COMMENT ON FUNCTION app.get_my_pending_tasks IS 'Returns pending tasks for a specific user';
COMMENT ON FUNCTION app.get_role_pending_tasks IS 'Returns pending tasks for a role (unclaimed)';
COMMENT ON FUNCTION app.get_overdue_tasks IS 'Returns overdue and SLA-breached tasks';
COMMENT ON FUNCTION app.claim_workflow_task IS 'Claims a role-based task for a user';
COMMENT ON FUNCTION app.complete_workflow_task IS 'Completes a task with an action';
COMMENT ON FUNCTION app.delegate_workflow_task IS 'Delegates a task to another user';
COMMENT ON FUNCTION app.count_pending_tasks IS 'Counts pending tasks for a user';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.count_pending_tasks(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.delegate_workflow_task(uuid, uuid, uuid, text);
-- DROP FUNCTION IF EXISTS app.complete_workflow_task(uuid, uuid, app.workflow_action_type, text);
-- DROP FUNCTION IF EXISTS app.claim_workflow_task(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_overdue_tasks(uuid, boolean);
-- DROP FUNCTION IF EXISTS app.get_role_pending_tasks(uuid, uuid, integer, integer);
-- DROP FUNCTION IF EXISTS app.get_my_pending_tasks(uuid, uuid, integer, integer);
-- DROP TRIGGER IF EXISTS validate_workflow_task_status_transition ON app.workflow_tasks;
-- DROP FUNCTION IF EXISTS app.validate_workflow_task_status_transition();
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.workflow_tasks;
-- DROP POLICY IF EXISTS tenant_isolation ON app.workflow_tasks;
-- DROP INDEX IF EXISTS app.idx_workflow_tasks_context;
-- DROP INDEX IF EXISTS app.idx_workflow_tasks_tenant_priority;
-- DROP INDEX IF EXISTS app.idx_workflow_tasks_tenant_active;
-- DROP INDEX IF EXISTS app.idx_workflow_tasks_instance_id;
-- DROP INDEX IF EXISTS app.idx_workflow_tasks_tenant_status_sla;
-- DROP INDEX IF EXISTS app.idx_workflow_tasks_tenant_status_due_date;
-- DROP INDEX IF EXISTS app.idx_workflow_tasks_tenant_role_status;
-- DROP INDEX IF EXISTS app.idx_workflow_tasks_tenant_assigned_to_status;
-- DROP TABLE IF EXISTS app.workflow_tasks;
