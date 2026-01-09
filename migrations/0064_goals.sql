-- Migration: 0064_goals
-- Created: 2026-01-07
-- Description: Create the goals table for employee goals and OKRs
--              Supports weighted goals, progress tracking, and goal cascading

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Employee Goals Table
-- -----------------------------------------------------------------------------
-- Represents individual employee goals/OKRs within a performance cycle
-- Supports cascading goals from organizational objectives
CREATE TABLE IF NOT EXISTS app.goals (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this goal
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee who owns the goal
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Performance cycle this goal belongs to
    cycle_id uuid NOT NULL REFERENCES app.performance_cycles(id) ON DELETE CASCADE,

    -- Goal content
    title varchar(500) NOT NULL,
    description text,

    -- Goal status
    status app.goal_status NOT NULL DEFAULT 'draft',

    -- Weight for this goal (percentage, should sum to 100 within employee's goals)
    weight numeric(5, 2) DEFAULT 0,

    -- Progress tracking (for measurable goals)
    target_value numeric(15, 2),
    current_value numeric(15, 2) DEFAULT 0,
    unit varchar(50),  -- e.g., '%', '$', 'deals', 'points'

    -- Due date for the goal
    due_date date,

    -- Cascading/alignment (link to parent organizational goal)
    parent_goal_id uuid REFERENCES app.goals(id) ON DELETE SET NULL,

    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Weight must be between 0 and 100
    CONSTRAINT goals_weight_range CHECK (
        weight IS NULL OR (weight >= 0 AND weight <= 100)
    ),

    -- Target value must be positive if specified
    CONSTRAINT goals_target_positive CHECK (
        target_value IS NULL OR target_value >= 0
    ),

    -- Current value must be non-negative
    CONSTRAINT goals_current_non_negative CHECK (
        current_value IS NULL OR current_value >= 0
    ),

    -- Cannot be parent of self
    CONSTRAINT goals_no_self_parent CHECK (parent_goal_id != id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + employee + cycle
CREATE INDEX IF NOT EXISTS idx_goals_tenant_employee_cycle
    ON app.goals(tenant_id, employee_id, cycle_id);

-- Cycle goals
CREATE INDEX IF NOT EXISTS idx_goals_tenant_cycle
    ON app.goals(tenant_id, cycle_id);

-- Employee goals
CREATE INDEX IF NOT EXISTS idx_goals_tenant_employee
    ON app.goals(tenant_id, employee_id);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_goals_tenant_status
    ON app.goals(tenant_id, status);

-- Active goals (not draft/cancelled)
CREATE INDEX IF NOT EXISTS idx_goals_tenant_active
    ON app.goals(tenant_id, employee_id)
    WHERE status IN ('active', 'completed');

-- Due date (upcoming deadlines)
CREATE INDEX IF NOT EXISTS idx_goals_tenant_due_date
    ON app.goals(tenant_id, due_date)
    WHERE status = 'active' AND due_date IS NOT NULL;

-- Parent goal (cascading goals)
CREATE INDEX IF NOT EXISTS idx_goals_parent
    ON app.goals(parent_goal_id)
    WHERE parent_goal_id IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.goals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see goals for their current tenant
CREATE POLICY tenant_isolation ON app.goals
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.goals
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_goals_updated_at
    BEFORE UPDATE ON app.goals
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- State Machine Validation
-- =============================================================================

-- Function to validate goal status transitions
CREATE OR REPLACE FUNCTION app.validate_goal_status_transition()
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
            -- completed is a terminal state (but can be reopened)
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

CREATE TRIGGER validate_goal_status_transition
    BEFORE UPDATE OF status ON app.goals
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_goal_status_transition();

-- Prevent circular parent references
CREATE OR REPLACE FUNCTION app.prevent_goal_parent_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_id uuid;
    v_visited uuid[] := ARRAY[]::uuid[];
BEGIN
    IF NEW.parent_goal_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Walk up the parent tree to detect cycles
    v_current_id := NEW.parent_goal_id;

    WHILE v_current_id IS NOT NULL LOOP
        IF v_current_id = ANY(v_visited) OR v_current_id = NEW.id THEN
            RAISE EXCEPTION 'Circular reference detected in goal parent hierarchy';
        END IF;

        v_visited := array_append(v_visited, v_current_id);

        SELECT parent_goal_id INTO v_current_id
        FROM app.goals
        WHERE id = v_current_id;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_goal_parent_cycle
    BEFORE INSERT OR UPDATE OF parent_goal_id ON app.goals
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_goal_parent_cycle();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get employee goals for a cycle
CREATE OR REPLACE FUNCTION app.get_employee_goals(
    p_employee_id uuid,
    p_cycle_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    cycle_id uuid,
    title varchar(500),
    description text,
    status app.goal_status,
    weight numeric(5, 2),
    target_value numeric(15, 2),
    current_value numeric(15, 2),
    unit varchar(50),
    progress_pct numeric(5, 2),
    due_date date,
    parent_goal_id uuid,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        g.id,
        g.cycle_id,
        g.title,
        g.description,
        g.status,
        g.weight,
        g.target_value,
        g.current_value,
        g.unit,
        CASE
            WHEN g.target_value IS NULL OR g.target_value = 0 THEN NULL
            ELSE ROUND((g.current_value / g.target_value) * 100, 2)
        END AS progress_pct,
        g.due_date,
        g.parent_goal_id,
        g.created_at
    FROM app.goals g
    WHERE g.employee_id = p_employee_id
      AND (p_cycle_id IS NULL OR g.cycle_id = p_cycle_id)
    ORDER BY g.weight DESC NULLS LAST, g.created_at ASC;
END;
$$;

-- Function to update goal progress
CREATE OR REPLACE FUNCTION app.update_goal_progress(
    p_goal_id uuid,
    p_current_value numeric(15, 2)
)
RETURNS TABLE (
    id uuid,
    progress_pct numeric(5, 2),
    auto_completed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_target_value numeric(15, 2);
    v_status app.goal_status;
    v_progress_pct numeric(5, 2);
    v_auto_completed boolean := false;
BEGIN
    SELECT target_value, status INTO v_target_value, v_status
    FROM app.goals
    WHERE goals.id = p_goal_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Goal not found: %', p_goal_id;
    END IF;

    IF v_status != 'active' THEN
        RAISE EXCEPTION 'Cannot update progress for goal with status: %', v_status;
    END IF;

    -- Calculate progress
    v_progress_pct := CASE
        WHEN v_target_value IS NULL OR v_target_value = 0 THEN NULL
        ELSE ROUND((p_current_value / v_target_value) * 100, 2)
    END;

    -- Auto-complete if target reached
    IF v_target_value IS NOT NULL AND p_current_value >= v_target_value THEN
        UPDATE app.goals
        SET current_value = p_current_value,
            status = 'completed',
            updated_at = now()
        WHERE goals.id = p_goal_id;
        v_auto_completed := true;
    ELSE
        UPDATE app.goals
        SET current_value = p_current_value,
            updated_at = now()
        WHERE goals.id = p_goal_id;
    END IF;

    RETURN QUERY SELECT p_goal_id, v_progress_pct, v_auto_completed;
END;
$$;

-- Function to get goal summary for an employee
CREATE OR REPLACE FUNCTION app.get_employee_goal_summary(
    p_employee_id uuid,
    p_cycle_id uuid
)
RETURNS TABLE (
    total_goals bigint,
    draft_count bigint,
    active_count bigint,
    completed_count bigint,
    cancelled_count bigint,
    total_weight numeric(5, 2),
    weighted_progress numeric(5, 2),
    overdue_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_goals,
        COUNT(*) FILTER (WHERE g.status = 'draft')::bigint AS draft_count,
        COUNT(*) FILTER (WHERE g.status = 'active')::bigint AS active_count,
        COUNT(*) FILTER (WHERE g.status = 'completed')::bigint AS completed_count,
        COUNT(*) FILTER (WHERE g.status = 'cancelled')::bigint AS cancelled_count,
        COALESCE(SUM(g.weight), 0) AS total_weight,
        CASE
            WHEN SUM(g.weight) FILTER (WHERE g.target_value IS NOT NULL AND g.target_value > 0) = 0 THEN NULL
            ELSE ROUND(
                SUM(
                    g.weight * (g.current_value / NULLIF(g.target_value, 0))
                ) FILTER (WHERE g.target_value IS NOT NULL AND g.target_value > 0) /
                NULLIF(SUM(g.weight) FILTER (WHERE g.target_value IS NOT NULL AND g.target_value > 0), 0) * 100,
                2
            )
        END AS weighted_progress,
        COUNT(*) FILTER (
            WHERE g.status = 'active'
              AND g.due_date IS NOT NULL
              AND g.due_date < CURRENT_DATE
        )::bigint AS overdue_count
    FROM app.goals g
    WHERE g.employee_id = p_employee_id
      AND g.cycle_id = p_cycle_id;
END;
$$;

-- Function to get goals aligned to a parent goal
CREATE OR REPLACE FUNCTION app.get_aligned_goals(
    p_parent_goal_id uuid
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    title varchar(500),
    status app.goal_status,
    weight numeric(5, 2),
    progress_pct numeric(5, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        g.id,
        g.employee_id,
        g.title,
        g.status,
        g.weight,
        CASE
            WHEN g.target_value IS NULL OR g.target_value = 0 THEN NULL
            ELSE ROUND((g.current_value / g.target_value) * 100, 2)
        END AS progress_pct
    FROM app.goals g
    WHERE g.parent_goal_id = p_parent_goal_id
    ORDER BY g.employee_id, g.created_at;
END;
$$;

-- Function to get overdue goals
CREATE OR REPLACE FUNCTION app.get_overdue_goals(
    p_tenant_id uuid,
    p_cycle_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    title varchar(500),
    due_date date,
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
        g.id,
        g.employee_id,
        g.title,
        g.due_date,
        (CURRENT_DATE - g.due_date)::integer AS days_overdue,
        CASE
            WHEN g.target_value IS NULL OR g.target_value = 0 THEN NULL
            ELSE ROUND((g.current_value / g.target_value) * 100, 2)
        END AS progress_pct
    FROM app.goals g
    WHERE g.tenant_id = p_tenant_id
      AND g.status = 'active'
      AND g.due_date < CURRENT_DATE
      AND (p_cycle_id IS NULL OR g.cycle_id = p_cycle_id)
    ORDER BY g.due_date ASC;
END;
$$;

-- Function to calculate goal weight balance
CREATE OR REPLACE FUNCTION app.check_goal_weight_balance(
    p_employee_id uuid,
    p_cycle_id uuid
)
RETURNS TABLE (
    total_weight numeric(5, 2),
    is_balanced boolean,
    message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_total numeric(5, 2);
BEGIN
    SELECT COALESCE(SUM(weight), 0) INTO v_total
    FROM app.goals
    WHERE employee_id = p_employee_id
      AND cycle_id = p_cycle_id
      AND status IN ('draft', 'active', 'completed');

    RETURN QUERY
    SELECT
        v_total,
        v_total >= 95 AND v_total <= 105 AS is_balanced,
        CASE
            WHEN v_total < 95 THEN 'Weights sum to ' || v_total || '%, needs to be closer to 100%'
            WHEN v_total > 105 THEN 'Weights sum to ' || v_total || '%, exceeds 100%'
            ELSE 'Weights are balanced (' || v_total || '%)'
        END AS message;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.goals IS 'Employee goals/OKRs with progress tracking and cascading support';
COMMENT ON COLUMN app.goals.id IS 'Primary UUID identifier for the goal';
COMMENT ON COLUMN app.goals.tenant_id IS 'Tenant that owns this goal';
COMMENT ON COLUMN app.goals.employee_id IS 'Employee who owns the goal';
COMMENT ON COLUMN app.goals.cycle_id IS 'Performance cycle this goal belongs to';
COMMENT ON COLUMN app.goals.title IS 'Goal title';
COMMENT ON COLUMN app.goals.description IS 'Detailed goal description';
COMMENT ON COLUMN app.goals.status IS 'Goal status (draft, active, completed, cancelled)';
COMMENT ON COLUMN app.goals.weight IS 'Weight/importance percentage (should sum to 100)';
COMMENT ON COLUMN app.goals.target_value IS 'Target value for measurable goals';
COMMENT ON COLUMN app.goals.current_value IS 'Current progress value';
COMMENT ON COLUMN app.goals.unit IS 'Unit for target/current values';
COMMENT ON COLUMN app.goals.due_date IS 'Goal due date';
COMMENT ON COLUMN app.goals.parent_goal_id IS 'Parent goal for cascading/alignment';
COMMENT ON FUNCTION app.validate_goal_status_transition IS 'Enforces valid goal status transitions';
COMMENT ON FUNCTION app.prevent_goal_parent_cycle IS 'Prevents circular parent references';
COMMENT ON FUNCTION app.get_employee_goals IS 'Returns goals for an employee';
COMMENT ON FUNCTION app.update_goal_progress IS 'Updates goal progress and auto-completes if target reached';
COMMENT ON FUNCTION app.get_employee_goal_summary IS 'Returns goal summary statistics for an employee';
COMMENT ON FUNCTION app.get_aligned_goals IS 'Returns goals aligned to a parent goal';
COMMENT ON FUNCTION app.get_overdue_goals IS 'Returns overdue goals';
COMMENT ON FUNCTION app.check_goal_weight_balance IS 'Checks if goal weights sum to 100%';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.check_goal_weight_balance(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_overdue_goals(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_aligned_goals(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_goal_summary(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.update_goal_progress(uuid, numeric);
-- DROP FUNCTION IF EXISTS app.get_employee_goals(uuid, uuid);
-- DROP TRIGGER IF EXISTS prevent_goal_parent_cycle ON app.goals;
-- DROP FUNCTION IF EXISTS app.prevent_goal_parent_cycle();
-- DROP TRIGGER IF EXISTS validate_goal_status_transition ON app.goals;
-- DROP FUNCTION IF EXISTS app.validate_goal_status_transition();
-- DROP TRIGGER IF EXISTS update_goals_updated_at ON app.goals;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.goals;
-- DROP POLICY IF EXISTS tenant_isolation ON app.goals;
-- DROP INDEX IF EXISTS app.idx_goals_parent;
-- DROP INDEX IF EXISTS app.idx_goals_tenant_due_date;
-- DROP INDEX IF EXISTS app.idx_goals_tenant_active;
-- DROP INDEX IF EXISTS app.idx_goals_tenant_status;
-- DROP INDEX IF EXISTS app.idx_goals_tenant_employee;
-- DROP INDEX IF EXISTS app.idx_goals_tenant_cycle;
-- DROP INDEX IF EXISTS app.idx_goals_tenant_employee_cycle;
-- DROP TABLE IF EXISTS app.goals;
