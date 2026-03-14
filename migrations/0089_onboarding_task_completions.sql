-- Migration: 0089_onboarding_task_completions
-- Created: 2026-01-07
-- Description: Create the onboarding_task_completions table - task tracking
--              This table tracks individual task completion for onboarding instances

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Onboarding Task Completions Table
-- -----------------------------------------------------------------------------
-- Individual task completion records for onboarding instances
-- Created from template tasks when onboarding starts
CREATE TABLE IF NOT EXISTS app.onboarding_task_completions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this task completion exists
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Onboarding instance this task belongs to
    instance_id uuid NOT NULL REFERENCES app.onboarding_instances(id) ON DELETE CASCADE,

    -- Original template task (for reference)
    template_task_id uuid REFERENCES app.onboarding_template_tasks(id) ON DELETE SET NULL,

    -- Task details (denormalized from template for historical accuracy)
    name varchar(255) NOT NULL,
    description text,
    task_type app.onboarding_task_type NOT NULL,
    owner_type app.task_owner_type NOT NULL,

    -- Who is assigned to complete this task
    assigned_to uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Current status
    status app.onboarding_task_status NOT NULL DEFAULT 'pending',

    -- Timing
    available_date date NOT NULL,
    due_date date,

    -- Whether required for completion
    is_required boolean NOT NULL DEFAULT true,

    -- Task instructions (denormalized)
    instructions text,

    -- Form schema and submission (for form tasks)
    form_schema jsonb,
    form_submission jsonb,

    -- Integration config and result (for automated tasks)
    integration_config jsonb,
    integration_result jsonb,

    -- Completion details
    started_at timestamptz,
    completed_at timestamptz,
    completed_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Evidence/documentation
    evidence_url text,
    evidence_notes text,

    -- Skip reason (when skipped)
    skipped_at timestamptz,
    skipped_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    skip_reason text,

    -- Blocking info (when blocked)
    blocked_reason text,

    -- Notes
    notes text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Completed must have completion info
    CONSTRAINT onboarding_task_completions_completed_has_info CHECK (
        status != 'completed' OR (completed_at IS NOT NULL AND completed_by IS NOT NULL)
    ),

    -- Skipped must have skip info
    CONSTRAINT onboarding_task_completions_skipped_has_info CHECK (
        status != 'skipped' OR (skipped_at IS NOT NULL AND skipped_by IS NOT NULL)
    ),

    -- Due date must be on or after available date
    CONSTRAINT onboarding_task_completions_due_after_available CHECK (
        due_date IS NULL OR due_date >= available_date
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Instance tasks
CREATE INDEX IF NOT EXISTS idx_onboarding_task_completions_instance
    ON app.onboarding_task_completions(instance_id, status);

-- Assigned user's tasks
CREATE INDEX IF NOT EXISTS idx_onboarding_task_completions_assigned
    ON app.onboarding_task_completions(tenant_id, assigned_to, status)
    WHERE assigned_to IS NOT NULL;

-- Tenant filtering
CREATE INDEX IF NOT EXISTS idx_onboarding_task_completions_tenant
    ON app.onboarding_task_completions(tenant_id);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_onboarding_task_completions_status
    ON app.onboarding_task_completions(instance_id, status);

-- Pending tasks
CREATE INDEX IF NOT EXISTS idx_onboarding_task_completions_pending
    ON app.onboarding_task_completions(instance_id, available_date)
    WHERE status = 'pending';

-- Overdue tasks
CREATE INDEX IF NOT EXISTS idx_onboarding_task_completions_overdue
    ON app.onboarding_task_completions(tenant_id, due_date, status)
    WHERE due_date IS NOT NULL AND status NOT IN ('completed', 'skipped');

-- Owner type filtering
CREATE INDEX IF NOT EXISTS idx_onboarding_task_completions_owner_type
    ON app.onboarding_task_completions(instance_id, owner_type);

-- GIN index for form submission queries
CREATE INDEX IF NOT EXISTS idx_onboarding_task_completions_form
    ON app.onboarding_task_completions USING gin(form_submission)
    WHERE form_submission IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.onboarding_task_completions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see task completions for their current tenant
CREATE POLICY tenant_isolation ON app.onboarding_task_completions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.onboarding_task_completions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_onboarding_task_completions_updated_at
    BEFORE UPDATE ON app.onboarding_task_completions
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Function to validate task status transitions
CREATE OR REPLACE FUNCTION app.validate_onboarding_task_completion_status_transition()
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
            IF NEW.status NOT IN ('in_progress', 'skipped', 'blocked') THEN
                RAISE EXCEPTION 'Invalid status transition: pending can only transition to in_progress, skipped, or blocked, not %', NEW.status;
            END IF;

        WHEN 'in_progress' THEN
            IF NEW.status NOT IN ('completed', 'skipped', 'blocked') THEN
                RAISE EXCEPTION 'Invalid status transition: in_progress can only transition to completed, skipped, or blocked, not %', NEW.status;
            END IF;

        WHEN 'blocked' THEN
            IF NEW.status NOT IN ('pending', 'skipped') THEN
                RAISE EXCEPTION 'Invalid status transition: blocked can only transition to pending or skipped, not %', NEW.status;
            END IF;

        WHEN 'completed' THEN
            RAISE EXCEPTION 'Invalid status transition: completed is a terminal state';

        WHEN 'skipped' THEN
            RAISE EXCEPTION 'Invalid status transition: skipped is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_onboarding_task_completion_status_transition
    BEFORE UPDATE OF status ON app.onboarding_task_completions
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_onboarding_task_completion_status_transition();

-- Trigger to recalculate instance progress when task status changes
CREATE TRIGGER recalculate_onboarding_progress_on_task
    AFTER INSERT OR UPDATE OF status OR DELETE ON app.onboarding_task_completions
    FOR EACH ROW
    EXECUTE FUNCTION app.recalculate_onboarding_progress();

-- Function to unblock dependent tasks when task completes
CREATE OR REPLACE FUNCTION app.unblock_dependent_onboarding_tasks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_dep_task RECORD;
    v_all_deps_met boolean;
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        -- Find tasks that depend on this completed task (via template_task_id)
        FOR v_dep_task IN
            SELECT tc.id, tc.template_task_id
            FROM app.onboarding_task_completions tc
            JOIN app.onboarding_template_tasks tt ON tt.id = tc.template_task_id
            WHERE tc.instance_id = NEW.instance_id
              AND tc.status = 'blocked'
              AND tt.dependencies ? NEW.template_task_id::text
        LOOP
            -- Check if all dependencies are now met
            SELECT bool_and(
                EXISTS (
                    SELECT 1
                    FROM app.onboarding_task_completions tc2
                    WHERE tc2.instance_id = NEW.instance_id
                      AND tc2.template_task_id::text = dep_id
                      AND tc2.status = 'completed'
                )
            ) INTO v_all_deps_met
            FROM jsonb_array_elements_text(
                (SELECT dependencies FROM app.onboarding_template_tasks WHERE id = v_dep_task.template_task_id)
            ) AS dep_id;

            IF v_all_deps_met THEN
                UPDATE app.onboarding_task_completions
                SET status = 'pending',
                    blocked_reason = NULL
                WHERE id = v_dep_task.id;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER unblock_dependent_onboarding_tasks
    AFTER UPDATE OF status ON app.onboarding_task_completions
    FOR EACH ROW
    EXECUTE FUNCTION app.unblock_dependent_onboarding_tasks();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get tasks for an onboarding instance
CREATE OR REPLACE FUNCTION app.get_onboarding_tasks(
    p_instance_id uuid,
    p_status app.onboarding_task_status DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    description text,
    task_type app.onboarding_task_type,
    owner_type app.task_owner_type,
    assigned_to uuid,
    status app.onboarding_task_status,
    available_date date,
    due_date date,
    is_required boolean,
    is_overdue boolean,
    days_until_due integer,
    completed_at timestamptz,
    completed_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tc.id,
        tc.name,
        tc.description,
        tc.task_type,
        tc.owner_type,
        tc.assigned_to,
        tc.status,
        tc.available_date,
        tc.due_date,
        tc.is_required,
        (tc.due_date IS NOT NULL AND tc.due_date < CURRENT_DATE AND tc.status NOT IN ('completed', 'skipped')) AS is_overdue,
        CASE WHEN tc.due_date IS NOT NULL THEN (tc.due_date - CURRENT_DATE)::integer ELSE NULL END AS days_until_due,
        tc.completed_at,
        tc.completed_by
    FROM app.onboarding_task_completions tc
    WHERE tc.instance_id = p_instance_id
      AND (p_status IS NULL OR tc.status = p_status)
    ORDER BY tc.available_date ASC, tc.due_date ASC NULLS LAST;
END;
$$;

-- Function to get my assigned onboarding tasks
CREATE OR REPLACE FUNCTION app.get_my_onboarding_tasks(
    p_tenant_id uuid,
    p_user_id uuid,
    p_status app.onboarding_task_status[] DEFAULT ARRAY['pending', 'in_progress']::app.onboarding_task_status[]
)
RETURNS TABLE (
    id uuid,
    instance_id uuid,
    employee_name text,
    name varchar(255),
    task_type app.onboarding_task_type,
    status app.onboarding_task_status,
    available_date date,
    due_date date,
    is_overdue boolean,
    days_until_due integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tc.id,
        tc.instance_id,
        e.employee_number AS employee_name,  -- Would join with employee_personal for full name
        tc.name,
        tc.task_type,
        tc.status,
        tc.available_date,
        tc.due_date,
        (tc.due_date IS NOT NULL AND tc.due_date < CURRENT_DATE) AS is_overdue,
        CASE WHEN tc.due_date IS NOT NULL THEN (tc.due_date - CURRENT_DATE)::integer ELSE NULL END AS days_until_due
    FROM app.onboarding_task_completions tc
    JOIN app.onboarding_instances oi ON oi.id = tc.instance_id
    JOIN app.employees e ON e.id = oi.employee_id
    WHERE tc.tenant_id = p_tenant_id
      AND tc.assigned_to = p_user_id
      AND tc.status = ANY(p_status)
      AND oi.status NOT IN ('completed', 'cancelled')
    ORDER BY tc.due_date ASC NULLS LAST, tc.available_date ASC;
END;
$$;

-- Function to start a task
CREATE OR REPLACE FUNCTION app.start_onboarding_task(
    p_task_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.onboarding_task_completions
    SET status = 'in_progress',
        started_at = now(),
        assigned_to = COALESCE(assigned_to, p_user_id)
    WHERE id = p_task_id
      AND status = 'pending'
      AND available_date <= CURRENT_DATE;

    RETURN FOUND;
END;
$$;

-- Function to complete a task
CREATE OR REPLACE FUNCTION app.complete_onboarding_task(
    p_task_id uuid,
    p_completed_by uuid,
    p_form_submission jsonb DEFAULT NULL,
    p_evidence_url text DEFAULT NULL,
    p_evidence_notes text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.onboarding_task_completions
    SET status = 'completed',
        completed_at = now(),
        completed_by = p_completed_by,
        form_submission = COALESCE(p_form_submission, form_submission),
        evidence_url = COALESCE(p_evidence_url, evidence_url),
        evidence_notes = COALESCE(p_evidence_notes, evidence_notes),
        notes = COALESCE(p_notes, notes)
    WHERE id = p_task_id
      AND status IN ('pending', 'in_progress');

    RETURN FOUND;
END;
$$;

-- Function to skip a task
CREATE OR REPLACE FUNCTION app.skip_onboarding_task(
    p_task_id uuid,
    p_skipped_by uuid,
    p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_is_required boolean;
BEGIN
    -- Check if task is required
    SELECT is_required INTO v_is_required
    FROM app.onboarding_task_completions
    WHERE id = p_task_id;

    IF v_is_required THEN
        RAISE EXCEPTION 'Cannot skip required task';
    END IF;

    UPDATE app.onboarding_task_completions
    SET status = 'skipped',
        skipped_at = now(),
        skipped_by = p_skipped_by,
        skip_reason = p_reason
    WHERE id = p_task_id
      AND status IN ('pending', 'in_progress', 'blocked')
      AND is_required = false;

    RETURN FOUND;
END;
$$;

-- Function to get overdue tasks
CREATE OR REPLACE FUNCTION app.get_overdue_onboarding_tasks(
    p_tenant_id uuid,
    p_limit integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    instance_id uuid,
    employee_id uuid,
    name varchar(255),
    task_type app.onboarding_task_type,
    owner_type app.task_owner_type,
    assigned_to uuid,
    due_date date,
    days_overdue integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        tc.id,
        tc.instance_id,
        oi.employee_id,
        tc.name,
        tc.task_type,
        tc.owner_type,
        tc.assigned_to,
        tc.due_date,
        (CURRENT_DATE - tc.due_date)::integer AS days_overdue
    FROM app.onboarding_task_completions tc
    JOIN app.onboarding_instances oi ON oi.id = tc.instance_id
    WHERE tc.tenant_id = p_tenant_id
      AND tc.due_date < CURRENT_DATE
      AND tc.status NOT IN ('completed', 'skipped')
      AND oi.status NOT IN ('completed', 'cancelled')
    ORDER BY tc.due_date ASC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.onboarding_task_completions IS 'Individual task completion records for onboarding instances.';
COMMENT ON COLUMN app.onboarding_task_completions.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.onboarding_task_completions.tenant_id IS 'Tenant where this task exists';
COMMENT ON COLUMN app.onboarding_task_completions.instance_id IS 'Onboarding instance this belongs to';
COMMENT ON COLUMN app.onboarding_task_completions.template_task_id IS 'Original template task reference';
COMMENT ON COLUMN app.onboarding_task_completions.name IS 'Task name';
COMMENT ON COLUMN app.onboarding_task_completions.description IS 'Task description';
COMMENT ON COLUMN app.onboarding_task_completions.task_type IS 'Type of task';
COMMENT ON COLUMN app.onboarding_task_completions.owner_type IS 'Who is responsible';
COMMENT ON COLUMN app.onboarding_task_completions.assigned_to IS 'User assigned to complete';
COMMENT ON COLUMN app.onboarding_task_completions.status IS 'Current task status';
COMMENT ON COLUMN app.onboarding_task_completions.available_date IS 'When task becomes available';
COMMENT ON COLUMN app.onboarding_task_completions.due_date IS 'Task due date';
COMMENT ON COLUMN app.onboarding_task_completions.is_required IS 'Whether required for completion';
COMMENT ON COLUMN app.onboarding_task_completions.instructions IS 'Task instructions';
COMMENT ON COLUMN app.onboarding_task_completions.form_schema IS 'Form schema for form tasks';
COMMENT ON COLUMN app.onboarding_task_completions.form_submission IS 'Form data submitted';
COMMENT ON COLUMN app.onboarding_task_completions.integration_config IS 'Integration configuration';
COMMENT ON COLUMN app.onboarding_task_completions.integration_result IS 'Integration execution result';
COMMENT ON COLUMN app.onboarding_task_completions.started_at IS 'When task was started';
COMMENT ON COLUMN app.onboarding_task_completions.completed_at IS 'When task was completed';
COMMENT ON COLUMN app.onboarding_task_completions.completed_by IS 'Who completed the task';
COMMENT ON COLUMN app.onboarding_task_completions.evidence_url IS 'URL to evidence/documentation';
COMMENT ON COLUMN app.onboarding_task_completions.evidence_notes IS 'Notes about evidence';
COMMENT ON COLUMN app.onboarding_task_completions.skipped_at IS 'When task was skipped';
COMMENT ON COLUMN app.onboarding_task_completions.skipped_by IS 'Who skipped the task';
COMMENT ON COLUMN app.onboarding_task_completions.skip_reason IS 'Reason for skipping';
COMMENT ON COLUMN app.onboarding_task_completions.blocked_reason IS 'Reason for being blocked';
COMMENT ON COLUMN app.onboarding_task_completions.notes IS 'Additional notes';
COMMENT ON FUNCTION app.validate_onboarding_task_completion_status_transition IS 'Enforces valid status transitions';
COMMENT ON FUNCTION app.unblock_dependent_onboarding_tasks IS 'Unblocks dependent tasks when completed';
COMMENT ON FUNCTION app.get_onboarding_tasks IS 'Returns tasks for an onboarding instance';
COMMENT ON FUNCTION app.get_my_onboarding_tasks IS 'Returns assigned tasks for a user';
COMMENT ON FUNCTION app.start_onboarding_task IS 'Starts a task';
COMMENT ON FUNCTION app.complete_onboarding_task IS 'Completes a task';
COMMENT ON FUNCTION app.skip_onboarding_task IS 'Skips a non-required task';
COMMENT ON FUNCTION app.get_overdue_onboarding_tasks IS 'Returns overdue tasks';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_overdue_onboarding_tasks(uuid, integer);
-- DROP FUNCTION IF EXISTS app.skip_onboarding_task(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS app.complete_onboarding_task(uuid, uuid, jsonb, text, text, text);
-- DROP FUNCTION IF EXISTS app.start_onboarding_task(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_my_onboarding_tasks(uuid, uuid, app.onboarding_task_status[]);
-- DROP FUNCTION IF EXISTS app.get_onboarding_tasks(uuid, app.onboarding_task_status);
-- DROP TRIGGER IF EXISTS unblock_dependent_onboarding_tasks ON app.onboarding_task_completions;
-- DROP FUNCTION IF EXISTS app.unblock_dependent_onboarding_tasks();
-- DROP TRIGGER IF EXISTS recalculate_onboarding_progress_on_task ON app.onboarding_task_completions;
-- DROP TRIGGER IF EXISTS validate_onboarding_task_completion_status_transition ON app.onboarding_task_completions;
-- DROP FUNCTION IF EXISTS app.validate_onboarding_task_completion_status_transition();
-- DROP TRIGGER IF EXISTS update_onboarding_task_completions_updated_at ON app.onboarding_task_completions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.onboarding_task_completions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.onboarding_task_completions;
-- DROP INDEX IF EXISTS app.idx_onboarding_task_completions_form;
-- DROP INDEX IF EXISTS app.idx_onboarding_task_completions_owner_type;
-- DROP INDEX IF EXISTS app.idx_onboarding_task_completions_overdue;
-- DROP INDEX IF EXISTS app.idx_onboarding_task_completions_pending;
-- DROP INDEX IF EXISTS app.idx_onboarding_task_completions_status;
-- DROP INDEX IF EXISTS app.idx_onboarding_task_completions_tenant;
-- DROP INDEX IF EXISTS app.idx_onboarding_task_completions_assigned;
-- DROP INDEX IF EXISTS app.idx_onboarding_task_completions_instance;
-- DROP TABLE IF EXISTS app.onboarding_task_completions;
