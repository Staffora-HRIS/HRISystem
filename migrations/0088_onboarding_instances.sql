-- Migration: 0088_onboarding_instances
-- Created: 2026-01-07
-- Description: Create the onboarding_instances table - employee onboarding records
--              This table tracks individual onboarding processes for employees

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Onboarding Instances Table
-- -----------------------------------------------------------------------------
-- Individual onboarding records for employees
-- Created when a new hire is onboarded using a template
CREATE TABLE IF NOT EXISTS app.onboarding_instances (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this onboarding exists
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee being onboarded
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Template used (preserved even if template is archived)
    template_id uuid NOT NULL REFERENCES app.onboarding_templates(id) ON DELETE RESTRICT,

    -- Denormalized template info (for historical accuracy)
    template_name varchar(255) NOT NULL,
    template_version integer NOT NULL DEFAULT 1,

    -- Current status
    status app.onboarding_instance_status NOT NULL DEFAULT 'not_started',

    -- Key dates
    start_date date NOT NULL,
    target_completion_date date NOT NULL,
    actual_completion_date date,

    -- Progress tracking
    progress_percent integer NOT NULL DEFAULT 0,
    tasks_completed integer NOT NULL DEFAULT 0,
    tasks_total integer NOT NULL DEFAULT 0,

    -- Assigned participants
    manager_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,
    hr_representative_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
    buddy_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,

    -- Welcome message (copied from template, can be customized)
    welcome_message text,

    -- Notes and feedback
    notes text,
    completion_feedback text,
    completion_rating integer,

    -- Cancellation details
    cancelled_at timestamptz,
    cancelled_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    cancellation_reason text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Constraints
    -- Progress must be 0-100
    CONSTRAINT onboarding_instances_progress_valid CHECK (
        progress_percent >= 0 AND progress_percent <= 100
    ),

    -- Target date must be on or after start date
    CONSTRAINT onboarding_instances_target_after_start CHECK (
        target_completion_date >= start_date
    ),

    -- Completion date must be on or after start date
    CONSTRAINT onboarding_instances_completion_after_start CHECK (
        actual_completion_date IS NULL OR actual_completion_date >= start_date
    ),

    -- Completed must have completion date
    CONSTRAINT onboarding_instances_completed_has_date CHECK (
        status != 'completed' OR actual_completion_date IS NOT NULL
    ),

    -- Cancelled must have cancellation info
    CONSTRAINT onboarding_instances_cancelled_has_info CHECK (
        status != 'cancelled' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)
    ),

    -- Completion rating must be 1-5
    CONSTRAINT onboarding_instances_rating_valid CHECK (
        completion_rating IS NULL OR (completion_rating >= 1 AND completion_rating <= 5)
    ),

    -- One active onboarding per employee
    CONSTRAINT onboarding_instances_single_active UNIQUE (tenant_id, employee_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Employee's onboarding
CREATE INDEX IF NOT EXISTS idx_onboarding_instances_employee
    ON app.onboarding_instances(tenant_id, employee_id);

-- Template usage
CREATE INDEX IF NOT EXISTS idx_onboarding_instances_template
    ON app.onboarding_instances(template_id);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_onboarding_instances_tenant_status
    ON app.onboarding_instances(tenant_id, status);

-- In-progress onboardings
CREATE INDEX IF NOT EXISTS idx_onboarding_instances_in_progress
    ON app.onboarding_instances(tenant_id, start_date)
    WHERE status = 'in_progress';

-- Manager's onboardings
CREATE INDEX IF NOT EXISTS idx_onboarding_instances_manager
    ON app.onboarding_instances(tenant_id, manager_id, status)
    WHERE manager_id IS NOT NULL;

-- HR representative's onboardings
CREATE INDEX IF NOT EXISTS idx_onboarding_instances_hr_rep
    ON app.onboarding_instances(tenant_id, hr_representative_id, status)
    WHERE hr_representative_id IS NOT NULL;

-- Buddy's onboardings
CREATE INDEX IF NOT EXISTS idx_onboarding_instances_buddy
    ON app.onboarding_instances(tenant_id, buddy_id, status)
    WHERE buddy_id IS NOT NULL;

-- Target date (for reminders)
CREATE INDEX IF NOT EXISTS idx_onboarding_instances_target_date
    ON app.onboarding_instances(tenant_id, target_completion_date)
    WHERE status IN ('not_started', 'in_progress');

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.onboarding_instances ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see instances for their current tenant
CREATE POLICY tenant_isolation ON app.onboarding_instances
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.onboarding_instances
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_onboarding_instances_updated_at
    BEFORE UPDATE ON app.onboarding_instances
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Function to validate instance status transitions
CREATE OR REPLACE FUNCTION app.validate_onboarding_instance_status_transition()
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
        WHEN 'not_started' THEN
            IF NEW.status NOT IN ('in_progress', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: not_started can only transition to in_progress or cancelled, not %', NEW.status;
            END IF;

        WHEN 'in_progress' THEN
            IF NEW.status NOT IN ('completed', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: in_progress can only transition to completed or cancelled, not %', NEW.status;
            END IF;

        WHEN 'completed' THEN
            RAISE EXCEPTION 'Invalid status transition: completed is a terminal state';

        WHEN 'cancelled' THEN
            RAISE EXCEPTION 'Invalid status transition: cancelled is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_onboarding_instance_status_transition
    BEFORE UPDATE OF status ON app.onboarding_instances
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_onboarding_instance_status_transition();

-- Function to recalculate progress from tasks
CREATE OR REPLACE FUNCTION app.recalculate_onboarding_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_instance_id uuid;
    v_total integer;
    v_completed integer;
    v_progress integer;
BEGIN
    v_instance_id := COALESCE(NEW.instance_id, OLD.instance_id);

    -- Count tasks
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'completed')
    INTO v_total, v_completed
    FROM app.onboarding_task_completions
    WHERE instance_id = v_instance_id;

    -- Calculate progress
    v_progress := CASE
        WHEN v_total = 0 THEN 0
        ELSE ROUND((v_completed::numeric / v_total) * 100)
    END;

    -- Update instance
    UPDATE app.onboarding_instances
    SET tasks_total = v_total,
        tasks_completed = v_completed,
        progress_percent = v_progress,
        status = CASE
            WHEN status = 'not_started' AND v_completed > 0 THEN 'in_progress'
            WHEN v_total > 0 AND v_completed = v_total THEN 'completed'
            ELSE status
        END,
        actual_completion_date = CASE
            WHEN v_total > 0 AND v_completed = v_total THEN CURRENT_DATE
            ELSE actual_completion_date
        END
    WHERE id = v_instance_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to create an onboarding instance
CREATE OR REPLACE FUNCTION app.create_onboarding_instance(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_template_id uuid,
    p_start_date date,
    p_manager_id uuid DEFAULT NULL,
    p_hr_representative_id uuid DEFAULT NULL,
    p_buddy_id uuid DEFAULT NULL,
    p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_id uuid;
    v_template app.onboarding_templates%ROWTYPE;
    v_target_date date;
BEGIN
    -- Get template
    SELECT * INTO v_template
    FROM app.onboarding_templates
    WHERE id = p_template_id;

    IF v_template.id IS NULL THEN
        RAISE EXCEPTION 'Template not found: %', p_template_id;
    END IF;

    IF v_template.status != 'active' THEN
        RAISE EXCEPTION 'Template is not active: %', p_template_id;
    END IF;

    -- Calculate target date
    v_target_date := p_start_date + v_template.estimated_duration_days;

    -- Create instance
    INSERT INTO app.onboarding_instances (
        tenant_id,
        employee_id,
        template_id,
        template_name,
        status,
        start_date,
        target_completion_date,
        manager_id,
        hr_representative_id,
        buddy_id,
        welcome_message,
        created_by
    )
    VALUES (
        p_tenant_id,
        p_employee_id,
        p_template_id,
        v_template.name,
        'not_started',
        p_start_date,
        v_target_date,
        p_manager_id,
        p_hr_representative_id,
        p_buddy_id,
        v_template.welcome_message,
        p_created_by
    )
    RETURNING id INTO v_id;

    -- Create task completions from template tasks
    INSERT INTO app.onboarding_task_completions (
        tenant_id,
        instance_id,
        template_task_id,
        name,
        description,
        task_type,
        owner_type,
        assigned_to,
        status,
        available_date,
        due_date,
        is_required,
        instructions,
        form_schema,
        integration_config
    )
    SELECT
        p_tenant_id,
        v_id,
        t.id,
        t.name,
        t.description,
        t.task_type,
        t.owner_type,
        CASE t.owner_type
            WHEN 'new_hire' THEN (SELECT user_id FROM app.employees WHERE id = p_employee_id)
            WHEN 'manager' THEN (SELECT user_id FROM app.employees WHERE id = p_manager_id)
            WHEN 'hr' THEN p_hr_representative_id
            WHEN 'buddy' THEN (SELECT user_id FROM app.employees WHERE id = p_buddy_id)
            WHEN 'custom' THEN t.custom_owner_id
            ELSE NULL
        END,
        CASE
            WHEN jsonb_array_length(t.dependencies) > 0 THEN 'blocked'
            ELSE 'pending'
        END,
        CASE t.timing_type
            WHEN 'before_start' THEN p_start_date - t.days_offset
            WHEN 'on_start' THEN p_start_date + t.days_offset
            WHEN 'after_start' THEN p_start_date + t.days_offset
            ELSE p_start_date
        END,
        CASE
            WHEN t.due_days_offset IS NOT NULL THEN
                CASE t.timing_type
                    WHEN 'before_start' THEN p_start_date - t.days_offset + t.due_days_offset
                    WHEN 'on_start' THEN p_start_date + t.days_offset + t.due_days_offset
                    WHEN 'after_start' THEN p_start_date + t.days_offset + t.due_days_offset
                    ELSE p_start_date + t.due_days_offset
                END
            ELSE NULL
        END,
        t.is_required,
        t.instructions,
        t.form_schema,
        t.integration_config
    FROM app.onboarding_template_tasks t
    WHERE t.template_id = p_template_id
    ORDER BY t.sequence_order;

    RETURN v_id;
END;
$$;

-- Function to get onboarding instance details
CREATE OR REPLACE FUNCTION app.get_onboarding_instance(
    p_instance_id uuid
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    template_name varchar(255),
    status app.onboarding_instance_status,
    start_date date,
    target_completion_date date,
    actual_completion_date date,
    progress_percent integer,
    tasks_completed integer,
    tasks_total integer,
    manager_id uuid,
    hr_representative_id uuid,
    buddy_id uuid,
    days_until_target integer,
    is_overdue boolean,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        oi.id,
        oi.employee_id,
        oi.template_name,
        oi.status,
        oi.start_date,
        oi.target_completion_date,
        oi.actual_completion_date,
        oi.progress_percent,
        oi.tasks_completed,
        oi.tasks_total,
        oi.manager_id,
        oi.hr_representative_id,
        oi.buddy_id,
        (oi.target_completion_date - CURRENT_DATE)::integer AS days_until_target,
        (oi.target_completion_date < CURRENT_DATE AND oi.status NOT IN ('completed', 'cancelled')) AS is_overdue,
        oi.created_at
    FROM app.onboarding_instances oi
    WHERE oi.id = p_instance_id;
END;
$$;

-- Function to get onboardings by status
CREATE OR REPLACE FUNCTION app.get_onboarding_instances_by_status(
    p_tenant_id uuid,
    p_status app.onboarding_instance_status[] DEFAULT ARRAY['not_started', 'in_progress']::app.onboarding_instance_status[],
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    template_name varchar(255),
    status app.onboarding_instance_status,
    start_date date,
    target_completion_date date,
    progress_percent integer,
    tasks_completed integer,
    tasks_total integer,
    days_until_target integer,
    is_overdue boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        oi.id,
        oi.employee_id,
        oi.template_name,
        oi.status,
        oi.start_date,
        oi.target_completion_date,
        oi.progress_percent,
        oi.tasks_completed,
        oi.tasks_total,
        (oi.target_completion_date - CURRENT_DATE)::integer AS days_until_target,
        (oi.target_completion_date < CURRENT_DATE AND oi.status NOT IN ('completed', 'cancelled')) AS is_overdue
    FROM app.onboarding_instances oi
    WHERE oi.tenant_id = p_tenant_id
      AND oi.status = ANY(p_status)
    ORDER BY
        oi.start_date ASC,
        oi.target_completion_date ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to cancel an onboarding
CREATE OR REPLACE FUNCTION app.cancel_onboarding_instance(
    p_instance_id uuid,
    p_cancelled_by uuid,
    p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.onboarding_instances
    SET status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = p_cancelled_by,
        cancellation_reason = p_reason
    WHERE id = p_instance_id
      AND status NOT IN ('completed', 'cancelled');

    RETURN FOUND;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.onboarding_instances IS 'Individual onboarding records for employees.';
COMMENT ON COLUMN app.onboarding_instances.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.onboarding_instances.tenant_id IS 'Tenant where this onboarding exists';
COMMENT ON COLUMN app.onboarding_instances.employee_id IS 'Employee being onboarded';
COMMENT ON COLUMN app.onboarding_instances.template_id IS 'Template used for this onboarding';
COMMENT ON COLUMN app.onboarding_instances.template_name IS 'Template name at time of creation';
COMMENT ON COLUMN app.onboarding_instances.template_version IS 'Template version used';
COMMENT ON COLUMN app.onboarding_instances.status IS 'Current onboarding status';
COMMENT ON COLUMN app.onboarding_instances.start_date IS 'Employee start date';
COMMENT ON COLUMN app.onboarding_instances.target_completion_date IS 'Target completion date';
COMMENT ON COLUMN app.onboarding_instances.actual_completion_date IS 'Actual completion date';
COMMENT ON COLUMN app.onboarding_instances.progress_percent IS 'Overall progress (0-100)';
COMMENT ON COLUMN app.onboarding_instances.tasks_completed IS 'Number of tasks completed';
COMMENT ON COLUMN app.onboarding_instances.tasks_total IS 'Total number of tasks';
COMMENT ON COLUMN app.onboarding_instances.manager_id IS 'Employee manager';
COMMENT ON COLUMN app.onboarding_instances.hr_representative_id IS 'HR representative';
COMMENT ON COLUMN app.onboarding_instances.buddy_id IS 'Assigned buddy/mentor';
COMMENT ON COLUMN app.onboarding_instances.welcome_message IS 'Welcome message for employee';
COMMENT ON COLUMN app.onboarding_instances.notes IS 'Notes about the onboarding';
COMMENT ON COLUMN app.onboarding_instances.completion_feedback IS 'Employee feedback on completion';
COMMENT ON COLUMN app.onboarding_instances.completion_rating IS 'Employee rating (1-5)';
COMMENT ON COLUMN app.onboarding_instances.cancelled_at IS 'When cancelled';
COMMENT ON COLUMN app.onboarding_instances.cancelled_by IS 'Who cancelled';
COMMENT ON COLUMN app.onboarding_instances.cancellation_reason IS 'Reason for cancellation';
COMMENT ON FUNCTION app.validate_onboarding_instance_status_transition IS 'Enforces valid status transitions';
COMMENT ON FUNCTION app.recalculate_onboarding_progress IS 'Recalculates progress from tasks';
COMMENT ON FUNCTION app.create_onboarding_instance IS 'Creates a new onboarding instance';
COMMENT ON FUNCTION app.get_onboarding_instance IS 'Returns onboarding instance details';
COMMENT ON FUNCTION app.get_onboarding_instances_by_status IS 'Returns onboardings by status';
COMMENT ON FUNCTION app.cancel_onboarding_instance IS 'Cancels an onboarding';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.cancel_onboarding_instance(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS app.get_onboarding_instances_by_status(uuid, app.onboarding_instance_status[], integer, integer);
-- DROP FUNCTION IF EXISTS app.get_onboarding_instance(uuid);
-- DROP FUNCTION IF EXISTS app.create_onboarding_instance(uuid, uuid, uuid, date, uuid, uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS app.recalculate_onboarding_progress();
-- DROP TRIGGER IF EXISTS validate_onboarding_instance_status_transition ON app.onboarding_instances;
-- DROP FUNCTION IF EXISTS app.validate_onboarding_instance_status_transition();
-- DROP TRIGGER IF EXISTS update_onboarding_instances_updated_at ON app.onboarding_instances;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.onboarding_instances;
-- DROP POLICY IF EXISTS tenant_isolation ON app.onboarding_instances;
-- DROP INDEX IF EXISTS app.idx_onboarding_instances_target_date;
-- DROP INDEX IF EXISTS app.idx_onboarding_instances_buddy;
-- DROP INDEX IF EXISTS app.idx_onboarding_instances_hr_rep;
-- DROP INDEX IF EXISTS app.idx_onboarding_instances_manager;
-- DROP INDEX IF EXISTS app.idx_onboarding_instances_in_progress;
-- DROP INDEX IF EXISTS app.idx_onboarding_instances_tenant_status;
-- DROP INDEX IF EXISTS app.idx_onboarding_instances_template;
-- DROP INDEX IF EXISTS app.idx_onboarding_instances_employee;
-- DROP TABLE IF EXISTS app.onboarding_instances;
