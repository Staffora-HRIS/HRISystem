-- Migration: 0067_development_plans
-- Created: 2026-01-07
-- Description: Create the development_plans table for employee development/growth plans
--              Tracks development goals, learning actions, and progress

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Development Plans Table
-- -----------------------------------------------------------------------------
-- Represents individual development/growth plans for employees
-- Tracks development goals, learning activities, and progress
CREATE TABLE IF NOT EXISTS app.development_plans (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this plan
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee the plan is for
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Plan identification
    title varchar(255) NOT NULL,
    description text,

    -- Timeline
    start_date date,
    target_date date,

    -- Current status
    status app.development_plan_status NOT NULL DEFAULT 'draft',

    -- Development goals as structured JSON
    -- Structure: [
    --   {
    --     "id": "uuid",
    --     "title": "Improve public speaking skills",
    --     "target": "Deliver 3 presentations to team",
    --     "progress": "completed 1 presentation",
    --     "completed": false
    --   }
    -- ]
    goals jsonb DEFAULT '[]',

    -- Learning actions/activities as structured JSON
    -- Structure: [
    --   {
    --     "id": "uuid",
    --     "type": "course|book|project|mentoring|training",
    --     "title": "Leadership Course",
    --     "description": "Complete company leadership program",
    --     "due_date": "2026-06-30",
    --     "completed": false,
    --     "completed_at": null,
    --     "notes": "Enrolled, starting next month"
    --   }
    -- ]
    actions jsonb DEFAULT '[]',

    -- Progress notes as structured JSON (append-only log)
    -- Structure: [
    --   {
    --     "date": "2026-01-15",
    --     "author_id": "uuid",
    --     "note": "Completed first module of leadership course"
    --   }
    -- ]
    progress_notes jsonb DEFAULT '[]',

    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Target date must be after start date
    CONSTRAINT development_plans_dates_valid CHECK (
        start_date IS NULL OR target_date IS NULL OR target_date >= start_date
    ),

    -- Title must not be empty
    CONSTRAINT development_plans_title_not_empty CHECK (length(trim(title)) > 0)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + employee
CREATE INDEX IF NOT EXISTS idx_development_plans_tenant_employee
    ON app.development_plans(tenant_id, employee_id);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_development_plans_tenant_status
    ON app.development_plans(tenant_id, status);

-- Active plans
CREATE INDEX IF NOT EXISTS idx_development_plans_tenant_active
    ON app.development_plans(tenant_id, employee_id)
    WHERE status = 'active';

-- Due date (approaching deadlines)
CREATE INDEX IF NOT EXISTS idx_development_plans_tenant_target_date
    ON app.development_plans(tenant_id, target_date)
    WHERE status = 'active' AND target_date IS NOT NULL;

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_development_plans_goals
    ON app.development_plans USING gin(goals);

CREATE INDEX IF NOT EXISTS idx_development_plans_actions
    ON app.development_plans USING gin(actions);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.development_plans ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see development plans for their current tenant
CREATE POLICY tenant_isolation ON app.development_plans
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.development_plans
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_development_plans_updated_at
    BEFORE UPDATE ON app.development_plans
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- State Machine Validation
-- =============================================================================

-- Function to validate development plan status transitions
CREATE OR REPLACE FUNCTION app.validate_development_plan_status_transition()
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
            -- draft can transition to active or cancelled
            IF NEW.status NOT IN ('active', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: draft can only transition to active or cancelled, not %', NEW.status;
            END IF;

        WHEN 'active' THEN
            -- active can transition to completed or cancelled
            IF NEW.status NOT IN ('completed', 'cancelled') THEN
                RAISE EXCEPTION 'Invalid status transition: active can only transition to completed or cancelled, not %', NEW.status;
            END IF;

        WHEN 'completed' THEN
            -- completed can be reopened (back to active)
            IF NEW.status NOT IN ('active') THEN
                RAISE EXCEPTION 'Invalid status transition: completed can only transition to active (reopen), not %', NEW.status;
            END IF;

        WHEN 'cancelled' THEN
            -- cancelled is a terminal state
            RAISE EXCEPTION 'Invalid status transition: cancelled is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_development_plan_status_transition
    BEFORE UPDATE OF status ON app.development_plans
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_development_plan_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get development plans for an employee
CREATE OR REPLACE FUNCTION app.get_employee_development_plans(
    p_employee_id uuid,
    p_status app.development_plan_status DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    title varchar(255),
    description text,
    start_date date,
    target_date date,
    status app.development_plan_status,
    goals_count integer,
    actions_count integer,
    completed_actions integer,
    progress_pct numeric(5, 2),
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dp.id,
        dp.title,
        dp.description,
        dp.start_date,
        dp.target_date,
        dp.status,
        jsonb_array_length(dp.goals)::integer AS goals_count,
        jsonb_array_length(dp.actions)::integer AS actions_count,
        (SELECT COUNT(*)::integer FROM jsonb_array_elements(dp.actions) a WHERE (a->>'completed')::boolean = true) AS completed_actions,
        CASE
            WHEN jsonb_array_length(dp.actions) = 0 THEN 0
            ELSE ROUND(
                (SELECT COUNT(*)::numeric FROM jsonb_array_elements(dp.actions) a WHERE (a->>'completed')::boolean = true) /
                jsonb_array_length(dp.actions)::numeric * 100,
                2
            )
        END AS progress_pct,
        dp.created_at
    FROM app.development_plans dp
    WHERE dp.employee_id = p_employee_id
      AND (p_status IS NULL OR dp.status = p_status)
    ORDER BY
        CASE dp.status
            WHEN 'active' THEN 1
            WHEN 'draft' THEN 2
            WHEN 'completed' THEN 3
            WHEN 'cancelled' THEN 4
        END,
        dp.created_at DESC;
END;
$$;

-- Function to add a progress note
CREATE OR REPLACE FUNCTION app.add_development_plan_progress_note(
    p_plan_id uuid,
    p_author_id uuid,
    p_note text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_status app.development_plan_status;
    v_new_note jsonb;
BEGIN
    SELECT status INTO v_current_status
    FROM app.development_plans
    WHERE id = p_plan_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Development plan not found: %', p_plan_id;
    END IF;

    IF v_current_status NOT IN ('active') THEN
        RAISE EXCEPTION 'Cannot add progress notes to plan with status: %', v_current_status;
    END IF;

    -- Create the new note object
    v_new_note := jsonb_build_object(
        'date', CURRENT_DATE,
        'author_id', p_author_id,
        'note', p_note
    );

    -- Append to progress_notes array
    UPDATE app.development_plans
    SET progress_notes = progress_notes || v_new_note,
        updated_at = now()
    WHERE id = p_plan_id;

    RETURN true;
END;
$$;

-- Function to mark an action as completed
CREATE OR REPLACE FUNCTION app.complete_development_action(
    p_plan_id uuid,
    p_action_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_actions jsonb;
    v_updated_actions jsonb;
    v_action jsonb;
    v_found boolean := false;
BEGIN
    SELECT actions INTO v_actions
    FROM app.development_plans
    WHERE id = p_plan_id;

    IF v_actions IS NULL THEN
        RAISE EXCEPTION 'Development plan not found: %', p_plan_id;
    END IF;

    -- Update the specific action
    v_updated_actions := '[]'::jsonb;
    FOR v_action IN SELECT * FROM jsonb_array_elements(v_actions)
    LOOP
        IF v_action->>'id' = p_action_id THEN
            v_action := v_action || jsonb_build_object('completed', true, 'completed_at', now());
            v_found := true;
        END IF;
        v_updated_actions := v_updated_actions || jsonb_build_array(v_action);
    END LOOP;

    IF NOT v_found THEN
        RAISE EXCEPTION 'Action not found: %', p_action_id;
    END IF;

    UPDATE app.development_plans
    SET actions = v_updated_actions,
        updated_at = now()
    WHERE id = p_plan_id;

    RETURN true;
END;
$$;

-- Function to get development plan summary for a manager's team
CREATE OR REPLACE FUNCTION app.get_team_development_summary(
    p_manager_id uuid
)
RETURNS TABLE (
    employee_id uuid,
    active_plans bigint,
    total_actions bigint,
    completed_actions bigint,
    avg_progress numeric(5, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dp.employee_id,
        COUNT(DISTINCT dp.id)::bigint AS active_plans,
        SUM(jsonb_array_length(dp.actions))::bigint AS total_actions,
        SUM((SELECT COUNT(*) FROM jsonb_array_elements(dp.actions) a WHERE (a->>'completed')::boolean = true))::bigint AS completed_actions,
        ROUND(AVG(
            CASE
                WHEN jsonb_array_length(dp.actions) = 0 THEN 0
                ELSE (SELECT COUNT(*)::numeric FROM jsonb_array_elements(dp.actions) a WHERE (a->>'completed')::boolean = true) /
                     jsonb_array_length(dp.actions)::numeric * 100
            END
        ), 2) AS avg_progress
    FROM app.development_plans dp
    JOIN app.reporting_lines rl ON rl.employee_id = dp.employee_id AND rl.is_current = true
    WHERE rl.manager_id = p_manager_id
      AND dp.status = 'active'
    GROUP BY dp.employee_id;
END;
$$;

-- Function to get overdue development plans
CREATE OR REPLACE FUNCTION app.get_overdue_development_plans(
    p_tenant_id uuid
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    title varchar(255),
    target_date date,
    days_overdue integer,
    progress_pct numeric(5, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dp.id,
        dp.employee_id,
        dp.title,
        dp.target_date,
        (CURRENT_DATE - dp.target_date)::integer AS days_overdue,
        CASE
            WHEN jsonb_array_length(dp.actions) = 0 THEN 0
            ELSE ROUND(
                (SELECT COUNT(*)::numeric FROM jsonb_array_elements(dp.actions) a WHERE (a->>'completed')::boolean = true) /
                jsonb_array_length(dp.actions)::numeric * 100,
                2
            )
        END AS progress_pct
    FROM app.development_plans dp
    WHERE dp.tenant_id = p_tenant_id
      AND dp.status = 'active'
      AND dp.target_date < CURRENT_DATE
    ORDER BY dp.target_date ASC;
END;
$$;

-- Function to get development plan statistics for a tenant
CREATE OR REPLACE FUNCTION app.get_development_plan_stats(
    p_tenant_id uuid
)
RETURNS TABLE (
    total_plans bigint,
    draft_count bigint,
    active_count bigint,
    completed_count bigint,
    cancelled_count bigint,
    employees_with_plans bigint,
    avg_actions_per_plan numeric(4, 2),
    overall_completion_rate numeric(5, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_plans,
        COUNT(*) FILTER (WHERE dp.status = 'draft')::bigint AS draft_count,
        COUNT(*) FILTER (WHERE dp.status = 'active')::bigint AS active_count,
        COUNT(*) FILTER (WHERE dp.status = 'completed')::bigint AS completed_count,
        COUNT(*) FILTER (WHERE dp.status = 'cancelled')::bigint AS cancelled_count,
        COUNT(DISTINCT dp.employee_id)::bigint AS employees_with_plans,
        ROUND(AVG(jsonb_array_length(dp.actions)), 2) AS avg_actions_per_plan,
        ROUND(
            AVG(
                CASE
                    WHEN jsonb_array_length(dp.actions) = 0 THEN 0
                    ELSE (SELECT COUNT(*)::numeric FROM jsonb_array_elements(dp.actions) a WHERE (a->>'completed')::boolean = true) /
                         jsonb_array_length(dp.actions)::numeric * 100
                END
            ) FILTER (WHERE dp.status = 'active'),
            2
        ) AS overall_completion_rate
    FROM app.development_plans dp
    WHERE dp.tenant_id = p_tenant_id;
END;
$$;

-- Function to create a development plan from a template
CREATE OR REPLACE FUNCTION app.create_development_plan(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_title varchar(255),
    p_description text DEFAULT NULL,
    p_start_date date DEFAULT CURRENT_DATE,
    p_target_date date DEFAULT NULL,
    p_goals jsonb DEFAULT '[]',
    p_actions jsonb DEFAULT '[]',
    p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_plan_id uuid;
BEGIN
    -- Add IDs to goals if not present
    SELECT jsonb_agg(
        CASE
            WHEN g->>'id' IS NULL THEN g || jsonb_build_object('id', gen_random_uuid()::text)
            ELSE g
        END
    ) INTO p_goals
    FROM jsonb_array_elements(p_goals) g;

    -- Add IDs to actions if not present
    SELECT jsonb_agg(
        CASE
            WHEN a->>'id' IS NULL THEN a || jsonb_build_object('id', gen_random_uuid()::text, 'completed', false)
            ELSE a
        END
    ) INTO p_actions
    FROM jsonb_array_elements(p_actions) a;

    INSERT INTO app.development_plans (
        tenant_id,
        employee_id,
        title,
        description,
        start_date,
        target_date,
        goals,
        actions,
        created_by
    )
    VALUES (
        p_tenant_id,
        p_employee_id,
        p_title,
        p_description,
        p_start_date,
        p_target_date,
        COALESCE(p_goals, '[]'::jsonb),
        COALESCE(p_actions, '[]'::jsonb),
        p_created_by
    )
    RETURNING id INTO v_plan_id;

    RETURN v_plan_id;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.development_plans IS 'Employee development/growth plans with goals, actions, and progress tracking';
COMMENT ON COLUMN app.development_plans.id IS 'Primary UUID identifier for the plan';
COMMENT ON COLUMN app.development_plans.tenant_id IS 'Tenant that owns this plan';
COMMENT ON COLUMN app.development_plans.employee_id IS 'Employee the plan is for';
COMMENT ON COLUMN app.development_plans.title IS 'Plan title';
COMMENT ON COLUMN app.development_plans.description IS 'Plan description';
COMMENT ON COLUMN app.development_plans.start_date IS 'Plan start date';
COMMENT ON COLUMN app.development_plans.target_date IS 'Target completion date';
COMMENT ON COLUMN app.development_plans.status IS 'Plan status (draft, active, completed, cancelled)';
COMMENT ON COLUMN app.development_plans.goals IS 'Development goals as JSON array';
COMMENT ON COLUMN app.development_plans.actions IS 'Learning actions/activities as JSON array';
COMMENT ON COLUMN app.development_plans.progress_notes IS 'Progress notes log as JSON array';
COMMENT ON FUNCTION app.validate_development_plan_status_transition IS 'Enforces valid plan status transitions';
COMMENT ON FUNCTION app.get_employee_development_plans IS 'Returns development plans for an employee';
COMMENT ON FUNCTION app.add_development_plan_progress_note IS 'Adds a progress note to a plan';
COMMENT ON FUNCTION app.complete_development_action IS 'Marks an action as completed';
COMMENT ON FUNCTION app.get_team_development_summary IS 'Returns development summary for a manager team';
COMMENT ON FUNCTION app.get_overdue_development_plans IS 'Returns overdue active plans';
COMMENT ON FUNCTION app.get_development_plan_stats IS 'Returns development plan statistics for a tenant';
COMMENT ON FUNCTION app.create_development_plan IS 'Creates a new development plan';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.create_development_plan(uuid, uuid, varchar, text, date, date, jsonb, jsonb, uuid);
-- DROP FUNCTION IF EXISTS app.get_development_plan_stats(uuid);
-- DROP FUNCTION IF EXISTS app.get_overdue_development_plans(uuid);
-- DROP FUNCTION IF EXISTS app.get_team_development_summary(uuid);
-- DROP FUNCTION IF EXISTS app.complete_development_action(uuid, text);
-- DROP FUNCTION IF EXISTS app.add_development_plan_progress_note(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS app.get_employee_development_plans(uuid, app.development_plan_status);
-- DROP TRIGGER IF EXISTS validate_development_plan_status_transition ON app.development_plans;
-- DROP FUNCTION IF EXISTS app.validate_development_plan_status_transition();
-- DROP TRIGGER IF EXISTS update_development_plans_updated_at ON app.development_plans;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.development_plans;
-- DROP POLICY IF EXISTS tenant_isolation ON app.development_plans;
-- DROP INDEX IF EXISTS app.idx_development_plans_actions;
-- DROP INDEX IF EXISTS app.idx_development_plans_goals;
-- DROP INDEX IF EXISTS app.idx_development_plans_tenant_target_date;
-- DROP INDEX IF EXISTS app.idx_development_plans_tenant_active;
-- DROP INDEX IF EXISTS app.idx_development_plans_tenant_status;
-- DROP INDEX IF EXISTS app.idx_development_plans_tenant_employee;
-- DROP TABLE IF EXISTS app.development_plans;
