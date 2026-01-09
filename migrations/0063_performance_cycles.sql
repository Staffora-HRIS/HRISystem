-- Migration: 0063_performance_cycles
-- Created: 2026-01-07
-- Description: Create the performance_cycles table for performance review cycles
--              Defines the timeline for goal setting, reviews, and calibration

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Performance Cycles Table
-- -----------------------------------------------------------------------------
-- Represents performance review cycles (annual, semi-annual, quarterly)
-- Defines phases: goal setting, active work, review, calibration
CREATE TABLE IF NOT EXISTS app.performance_cycles (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this cycle
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Cycle identification
    name varchar(255) NOT NULL,
    description text,

    -- Current phase
    status app.performance_cycle_status NOT NULL DEFAULT 'draft',

    -- Cycle frequency
    cycle_type app.performance_cycle_type NOT NULL DEFAULT 'annual',

    -- Overall cycle period
    start_date date NOT NULL,
    end_date date NOT NULL,

    -- Goal setting phase
    goal_setting_start date,
    goal_setting_end date,

    -- Review submission phase
    review_start date,
    review_end date,

    -- Calibration phase
    calibration_start date,
    calibration_end date,

    -- Scope (NULL means all employees in tenant)
    org_unit_id uuid REFERENCES app.org_units(id) ON DELETE SET NULL,

    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Name must be unique within tenant
    CONSTRAINT performance_cycles_name_unique UNIQUE (tenant_id, name),

    -- End date must be after start date
    CONSTRAINT performance_cycles_dates_valid CHECK (end_date > start_date),

    -- Goal setting dates within cycle
    CONSTRAINT performance_cycles_goal_setting_valid CHECK (
        goal_setting_start IS NULL OR goal_setting_end IS NULL OR
        (goal_setting_start >= start_date AND goal_setting_end <= end_date AND goal_setting_end >= goal_setting_start)
    ),

    -- Review dates within cycle
    CONSTRAINT performance_cycles_review_valid CHECK (
        review_start IS NULL OR review_end IS NULL OR
        (review_start >= start_date AND review_end <= end_date AND review_end >= review_start)
    ),

    -- Calibration dates within cycle
    CONSTRAINT performance_cycles_calibration_valid CHECK (
        calibration_start IS NULL OR calibration_end IS NULL OR
        (calibration_start >= start_date AND calibration_end <= end_date AND calibration_end >= calibration_start)
    ),

    -- Phases should be sequential (goal setting -> review -> calibration)
    CONSTRAINT performance_cycles_phases_sequential CHECK (
        (goal_setting_end IS NULL OR review_start IS NULL OR goal_setting_end <= review_start) AND
        (review_end IS NULL OR calibration_start IS NULL OR review_end <= calibration_start)
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + name
CREATE INDEX IF NOT EXISTS idx_performance_cycles_tenant_name
    ON app.performance_cycles(tenant_id, name);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_performance_cycles_tenant_status
    ON app.performance_cycles(tenant_id, status);

-- Active cycles
CREATE INDEX IF NOT EXISTS idx_performance_cycles_tenant_active
    ON app.performance_cycles(tenant_id)
    WHERE status IN ('active', 'review', 'calibration');

-- Date range queries
CREATE INDEX IF NOT EXISTS idx_performance_cycles_tenant_dates
    ON app.performance_cycles(tenant_id, start_date, end_date);

-- Org unit scoped cycles
CREATE INDEX IF NOT EXISTS idx_performance_cycles_tenant_org_unit
    ON app.performance_cycles(tenant_id, org_unit_id)
    WHERE org_unit_id IS NOT NULL;

-- Cycle type analytics
CREATE INDEX IF NOT EXISTS idx_performance_cycles_tenant_type
    ON app.performance_cycles(tenant_id, cycle_type);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.performance_cycles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see cycles for their current tenant
CREATE POLICY tenant_isolation ON app.performance_cycles
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.performance_cycles
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_performance_cycles_updated_at
    BEFORE UPDATE ON app.performance_cycles
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- State Machine Validation
-- =============================================================================

-- Function to validate cycle status transitions
CREATE OR REPLACE FUNCTION app.validate_performance_cycle_status_transition()
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
            -- draft can only transition to active
            IF NEW.status NOT IN ('active') THEN
                RAISE EXCEPTION 'Invalid status transition: draft can only transition to active, not %', NEW.status;
            END IF;

        WHEN 'active' THEN
            -- active can transition to review
            IF NEW.status NOT IN ('review') THEN
                RAISE EXCEPTION 'Invalid status transition: active can only transition to review, not %', NEW.status;
            END IF;

        WHEN 'review' THEN
            -- review can transition to calibration
            IF NEW.status NOT IN ('calibration') THEN
                RAISE EXCEPTION 'Invalid status transition: review can only transition to calibration, not %', NEW.status;
            END IF;

        WHEN 'calibration' THEN
            -- calibration can transition to closed
            IF NEW.status NOT IN ('closed') THEN
                RAISE EXCEPTION 'Invalid status transition: calibration can only transition to closed, not %', NEW.status;
            END IF;

        WHEN 'closed' THEN
            -- closed is a terminal state
            RAISE EXCEPTION 'Invalid status transition: closed is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_performance_cycle_status_transition
    BEFORE UPDATE OF status ON app.performance_cycles
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_performance_cycle_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get current active cycle for an employee
CREATE OR REPLACE FUNCTION app.get_active_performance_cycle(
    p_tenant_id uuid,
    p_org_unit_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    status app.performance_cycle_status,
    cycle_type app.performance_cycle_type,
    start_date date,
    end_date date,
    current_phase text,
    phase_end_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pc.id,
        pc.name,
        pc.status,
        pc.cycle_type,
        pc.start_date,
        pc.end_date,
        CASE
            WHEN pc.status = 'active' AND pc.goal_setting_start IS NOT NULL
                 AND CURRENT_DATE BETWEEN pc.goal_setting_start AND pc.goal_setting_end
            THEN 'goal_setting'
            WHEN pc.status = 'active' THEN 'execution'
            WHEN pc.status = 'review' THEN 'review'
            WHEN pc.status = 'calibration' THEN 'calibration'
            ELSE pc.status::text
        END AS current_phase,
        CASE
            WHEN pc.status = 'active' AND pc.goal_setting_start IS NOT NULL
                 AND CURRENT_DATE BETWEEN pc.goal_setting_start AND pc.goal_setting_end
            THEN pc.goal_setting_end
            WHEN pc.status = 'active' THEN pc.review_start
            WHEN pc.status = 'review' THEN pc.review_end
            WHEN pc.status = 'calibration' THEN pc.calibration_end
            ELSE pc.end_date
        END AS phase_end_date
    FROM app.performance_cycles pc
    WHERE pc.tenant_id = p_tenant_id
      AND pc.status IN ('active', 'review', 'calibration')
      AND (pc.org_unit_id IS NULL OR pc.org_unit_id = p_org_unit_id)
    ORDER BY pc.start_date DESC
    LIMIT 1;
END;
$$;

-- Function to get cycle history
CREATE OR REPLACE FUNCTION app.get_performance_cycle_history(
    p_tenant_id uuid,
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    status app.performance_cycle_status,
    cycle_type app.performance_cycle_type,
    start_date date,
    end_date date,
    org_unit_id uuid,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pc.id,
        pc.name,
        pc.status,
        pc.cycle_type,
        pc.start_date,
        pc.end_date,
        pc.org_unit_id,
        pc.created_at
    FROM app.performance_cycles pc
    WHERE pc.tenant_id = p_tenant_id
    ORDER BY pc.start_date DESC
    LIMIT p_limit;
END;
$$;

-- Function to get cycle participation statistics
CREATE OR REPLACE FUNCTION app.get_cycle_participation_stats(
    p_cycle_id uuid
)
RETURNS TABLE (
    total_employees bigint,
    goals_created bigint,
    reviews_submitted bigint,
    reviews_acknowledged bigint,
    avg_goals_per_employee numeric(4,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id uuid;
    v_org_unit_id uuid;
BEGIN
    -- Get cycle details
    SELECT tenant_id, org_unit_id INTO v_tenant_id, v_org_unit_id
    FROM app.performance_cycles
    WHERE id = p_cycle_id;

    RETURN QUERY
    SELECT
        (SELECT COUNT(DISTINCT e.id)
         FROM app.employees e
         WHERE e.tenant_id = v_tenant_id
           AND e.status = 'active'
           AND (v_org_unit_id IS NULL OR EXISTS (
               SELECT 1 FROM app.position_assignments pa
               JOIN app.positions p ON p.id = pa.position_id
               WHERE pa.employee_id = e.id
                 AND pa.is_current = true
                 AND p.org_unit_id = v_org_unit_id
           ))
        )::bigint AS total_employees,
        (SELECT COUNT(*) FROM app.goals WHERE cycle_id = p_cycle_id)::bigint AS goals_created,
        (SELECT COUNT(*) FROM app.reviews WHERE cycle_id = p_cycle_id AND status = 'submitted')::bigint AS reviews_submitted,
        (SELECT COUNT(*) FROM app.reviews WHERE cycle_id = p_cycle_id AND status = 'acknowledged')::bigint AS reviews_acknowledged,
        (SELECT ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT employee_id)::numeric, 0), 2)
         FROM app.goals WHERE cycle_id = p_cycle_id) AS avg_goals_per_employee;
END;
$$;

-- Function to advance cycle to next phase
CREATE OR REPLACE FUNCTION app.advance_performance_cycle_phase(
    p_cycle_id uuid
)
RETURNS app.performance_cycle_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_status app.performance_cycle_status;
    v_new_status app.performance_cycle_status;
BEGIN
    SELECT status INTO v_current_status
    FROM app.performance_cycles
    WHERE id = p_cycle_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Performance cycle not found: %', p_cycle_id;
    END IF;

    -- Determine next status
    v_new_status := CASE v_current_status
        WHEN 'draft' THEN 'active'
        WHEN 'active' THEN 'review'
        WHEN 'review' THEN 'calibration'
        WHEN 'calibration' THEN 'closed'
        ELSE NULL
    END;

    IF v_new_status IS NULL THEN
        RAISE EXCEPTION 'Cannot advance cycle from status: %', v_current_status;
    END IF;

    UPDATE app.performance_cycles
    SET status = v_new_status,
        updated_at = now()
    WHERE id = p_cycle_id;

    RETURN v_new_status;
END;
$$;

-- Function to check if cycle dates need attention
CREATE OR REPLACE FUNCTION app.get_cycles_needing_attention(
    p_tenant_id uuid,
    p_days_ahead integer DEFAULT 7
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    status app.performance_cycle_status,
    attention_type text,
    relevant_date date,
    days_until integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    -- Goal setting ending soon
    SELECT
        pc.id,
        pc.name,
        pc.status,
        'goal_setting_ending' AS attention_type,
        pc.goal_setting_end AS relevant_date,
        (pc.goal_setting_end - CURRENT_DATE)::integer AS days_until
    FROM app.performance_cycles pc
    WHERE pc.tenant_id = p_tenant_id
      AND pc.status = 'active'
      AND pc.goal_setting_end IS NOT NULL
      AND pc.goal_setting_end BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days_ahead

    UNION ALL

    -- Review period starting soon
    SELECT
        pc.id,
        pc.name,
        pc.status,
        'review_starting' AS attention_type,
        pc.review_start AS relevant_date,
        (pc.review_start - CURRENT_DATE)::integer AS days_until
    FROM app.performance_cycles pc
    WHERE pc.tenant_id = p_tenant_id
      AND pc.status = 'active'
      AND pc.review_start IS NOT NULL
      AND pc.review_start BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days_ahead

    UNION ALL

    -- Review period ending soon
    SELECT
        pc.id,
        pc.name,
        pc.status,
        'review_ending' AS attention_type,
        pc.review_end AS relevant_date,
        (pc.review_end - CURRENT_DATE)::integer AS days_until
    FROM app.performance_cycles pc
    WHERE pc.tenant_id = p_tenant_id
      AND pc.status = 'review'
      AND pc.review_end IS NOT NULL
      AND pc.review_end BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days_ahead

    UNION ALL

    -- Calibration ending soon
    SELECT
        pc.id,
        pc.name,
        pc.status,
        'calibration_ending' AS attention_type,
        pc.calibration_end AS relevant_date,
        (pc.calibration_end - CURRENT_DATE)::integer AS days_until
    FROM app.performance_cycles pc
    WHERE pc.tenant_id = p_tenant_id
      AND pc.status = 'calibration'
      AND pc.calibration_end IS NOT NULL
      AND pc.calibration_end BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days_ahead

    ORDER BY days_until ASC;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.performance_cycles IS 'Performance review cycles with phases for goal setting, reviews, and calibration';
COMMENT ON COLUMN app.performance_cycles.id IS 'Primary UUID identifier for the cycle';
COMMENT ON COLUMN app.performance_cycles.tenant_id IS 'Tenant that owns this cycle';
COMMENT ON COLUMN app.performance_cycles.name IS 'Cycle name (e.g., "2026 Annual Review")';
COMMENT ON COLUMN app.performance_cycles.description IS 'Cycle description';
COMMENT ON COLUMN app.performance_cycles.status IS 'Current cycle phase (draft, active, review, calibration, closed)';
COMMENT ON COLUMN app.performance_cycles.cycle_type IS 'Cycle frequency (annual, semi_annual, quarterly)';
COMMENT ON COLUMN app.performance_cycles.start_date IS 'Cycle start date';
COMMENT ON COLUMN app.performance_cycles.end_date IS 'Cycle end date';
COMMENT ON COLUMN app.performance_cycles.goal_setting_start IS 'Goal setting phase start';
COMMENT ON COLUMN app.performance_cycles.goal_setting_end IS 'Goal setting phase end';
COMMENT ON COLUMN app.performance_cycles.review_start IS 'Review submission phase start';
COMMENT ON COLUMN app.performance_cycles.review_end IS 'Review submission phase end';
COMMENT ON COLUMN app.performance_cycles.calibration_start IS 'Calibration phase start';
COMMENT ON COLUMN app.performance_cycles.calibration_end IS 'Calibration phase end';
COMMENT ON COLUMN app.performance_cycles.org_unit_id IS 'Scope to specific org unit (NULL = all employees)';
COMMENT ON FUNCTION app.validate_performance_cycle_status_transition IS 'Enforces valid cycle status transitions';
COMMENT ON FUNCTION app.get_active_performance_cycle IS 'Returns current active cycle for a tenant/org unit';
COMMENT ON FUNCTION app.get_performance_cycle_history IS 'Returns past performance cycles';
COMMENT ON FUNCTION app.get_cycle_participation_stats IS 'Returns participation statistics for a cycle';
COMMENT ON FUNCTION app.advance_performance_cycle_phase IS 'Advances cycle to next phase';
COMMENT ON FUNCTION app.get_cycles_needing_attention IS 'Returns cycles with upcoming deadlines';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_cycles_needing_attention(uuid, integer);
-- DROP FUNCTION IF EXISTS app.advance_performance_cycle_phase(uuid);
-- DROP FUNCTION IF EXISTS app.get_cycle_participation_stats(uuid);
-- DROP FUNCTION IF EXISTS app.get_performance_cycle_history(uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_active_performance_cycle(uuid, uuid);
-- DROP TRIGGER IF EXISTS validate_performance_cycle_status_transition ON app.performance_cycles;
-- DROP FUNCTION IF EXISTS app.validate_performance_cycle_status_transition();
-- DROP TRIGGER IF EXISTS update_performance_cycles_updated_at ON app.performance_cycles;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.performance_cycles;
-- DROP POLICY IF EXISTS tenant_isolation ON app.performance_cycles;
-- DROP INDEX IF EXISTS app.idx_performance_cycles_tenant_type;
-- DROP INDEX IF EXISTS app.idx_performance_cycles_tenant_org_unit;
-- DROP INDEX IF EXISTS app.idx_performance_cycles_tenant_dates;
-- DROP INDEX IF EXISTS app.idx_performance_cycles_tenant_active;
-- DROP INDEX IF EXISTS app.idx_performance_cycles_tenant_status;
-- DROP INDEX IF EXISTS app.idx_performance_cycles_tenant_name;
-- DROP TABLE IF EXISTS app.performance_cycles;
