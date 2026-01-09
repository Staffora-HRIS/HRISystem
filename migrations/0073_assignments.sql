-- Migration: 0073_assignments
-- Created: 2026-01-07
-- Description: Create the assignments table - course and learning path assignments
--              This table tracks learning assignments made to employees
--              Includes progress tracking, scores, and completion data

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Assignments Table
-- -----------------------------------------------------------------------------
-- Learning assignments linking employees to courses or learning paths
-- Tracks progress, scores, and completion status
CREATE TABLE IF NOT EXISTS app.assignments (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this assignment exists
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee assigned to this learning
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Assigned content (one must be set, not both)
    course_id uuid REFERENCES app.courses(id) ON DELETE SET NULL,
    learning_path_id uuid REFERENCES app.learning_paths(id) ON DELETE SET NULL,

    -- Assignment type (required, recommended, etc.)
    assignment_type app.assignment_type NOT NULL DEFAULT 'required',

    -- Current status
    status app.completion_status NOT NULL DEFAULT 'not_started',

    -- Progress tracking
    progress_percent integer NOT NULL DEFAULT 0,

    -- Modules/courses completed (for tracking within course or path)
    modules_completed integer NOT NULL DEFAULT 0,
    modules_total integer NOT NULL DEFAULT 0,

    -- Score from assessments
    score numeric(5,2),

    -- Attempt tracking
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer,

    -- Important dates
    assigned_at timestamptz NOT NULL DEFAULT now(),
    due_date date,
    started_at timestamptz,
    completed_at timestamptz,
    last_activity_at timestamptz,

    -- Time spent (in minutes)
    time_spent_minutes integer NOT NULL DEFAULT 0,

    -- Assigned by (manager, system, self-enrolled)
    assigned_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Source of assignment (manual, workflow, rule, self)
    assignment_source varchar(50) NOT NULL DEFAULT 'manual',

    -- Context data
    -- Structure: {
    --   "reason": "Annual compliance training",
    --   "workflow_instance_id": "uuid",
    --   "rule_id": "uuid",
    --   "module_progress": {...},
    --   "bookmarks": [...],
    --   "notes": "..."
    -- }
    context jsonb NOT NULL DEFAULT '{}',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Must have either course or learning path, not both or neither
    CONSTRAINT assignments_content_type CHECK (
        (course_id IS NOT NULL AND learning_path_id IS NULL) OR
        (course_id IS NULL AND learning_path_id IS NOT NULL)
    ),

    -- Progress must be 0-100
    CONSTRAINT assignments_progress_valid CHECK (
        progress_percent >= 0 AND progress_percent <= 100
    ),

    -- Score must be 0-100 if set
    CONSTRAINT assignments_score_valid CHECK (
        score IS NULL OR (score >= 0 AND score <= 100)
    ),

    -- Attempts must be non-negative
    CONSTRAINT assignments_attempts_non_negative CHECK (
        attempts >= 0
    ),

    -- Time spent must be non-negative
    CONSTRAINT assignments_time_spent_non_negative CHECK (
        time_spent_minutes >= 0
    ),

    -- Completed assignments must have completion date
    CONSTRAINT assignments_completed_has_date CHECK (
        status != 'completed' OR completed_at IS NOT NULL
    ),

    -- Started assignments must have start date
    CONSTRAINT assignments_started_has_date CHECK (
        status = 'not_started' OR started_at IS NOT NULL
    ),

    -- Unique assignment per employee per content
    CONSTRAINT assignments_employee_course_unique UNIQUE (tenant_id, employee_id, course_id),
    CONSTRAINT assignments_employee_path_unique UNIQUE (tenant_id, employee_id, learning_path_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Employee's assignments
CREATE INDEX IF NOT EXISTS idx_assignments_tenant_employee_status
    ON app.assignments(tenant_id, employee_id, status);

-- Course assignments
CREATE INDEX IF NOT EXISTS idx_assignments_tenant_course_status
    ON app.assignments(tenant_id, course_id, status)
    WHERE course_id IS NOT NULL;

-- Learning path assignments
CREATE INDEX IF NOT EXISTS idx_assignments_tenant_path_status
    ON app.assignments(tenant_id, learning_path_id, status)
    WHERE learning_path_id IS NOT NULL;

-- Due date tracking (upcoming and overdue)
CREATE INDEX IF NOT EXISTS idx_assignments_tenant_status_due_date
    ON app.assignments(tenant_id, status, due_date)
    WHERE due_date IS NOT NULL;

-- In-progress assignments (for dashboard)
CREATE INDEX IF NOT EXISTS idx_assignments_tenant_in_progress
    ON app.assignments(tenant_id, employee_id, last_activity_at DESC)
    WHERE status = 'in_progress';

-- Required assignments not completed
CREATE INDEX IF NOT EXISTS idx_assignments_tenant_required_pending
    ON app.assignments(tenant_id, employee_id, due_date)
    WHERE assignment_type = 'required' AND status NOT IN ('completed', 'expired');

-- Assignment source filtering
CREATE INDEX IF NOT EXISTS idx_assignments_tenant_source
    ON app.assignments(tenant_id, assignment_source);

-- GIN index for context queries
CREATE INDEX IF NOT EXISTS idx_assignments_context
    ON app.assignments USING gin(context);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see assignments for their current tenant
CREATE POLICY tenant_isolation ON app.assignments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.assignments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_assignments_updated_at
    BEFORE UPDATE ON app.assignments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Function to validate assignment status transitions
CREATE OR REPLACE FUNCTION app.validate_assignment_status_transition()
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
            -- not_started can transition to in_progress or expired
            IF NEW.status NOT IN ('in_progress', 'expired') THEN
                RAISE EXCEPTION 'Invalid status transition: not_started can only transition to in_progress or expired, not %', NEW.status;
            END IF;

        WHEN 'in_progress' THEN
            -- in_progress can transition to completed, failed, or expired
            IF NEW.status NOT IN ('completed', 'failed', 'expired') THEN
                RAISE EXCEPTION 'Invalid status transition: in_progress can only transition to completed, failed, or expired, not %', NEW.status;
            END IF;

        WHEN 'failed' THEN
            -- failed can transition to in_progress (retake)
            IF NEW.status NOT IN ('in_progress') THEN
                RAISE EXCEPTION 'Invalid status transition: failed can only transition to in_progress (retake), not %', NEW.status;
            END IF;

        WHEN 'completed' THEN
            -- completed is a terminal state
            RAISE EXCEPTION 'Invalid status transition: completed is a terminal state';

        WHEN 'expired' THEN
            -- expired is a terminal state
            RAISE EXCEPTION 'Invalid status transition: expired is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_assignment_status_transition
    BEFORE UPDATE OF status ON app.assignments
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_assignment_status_transition();

-- Auto-set started_at when status changes to in_progress
CREATE OR REPLACE FUNCTION app.set_assignment_started_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    IF NEW.status = 'in_progress' AND (OLD.status = 'not_started' OR OLD.started_at IS NULL) THEN
        NEW.started_at := COALESCE(NEW.started_at, now());
    END IF;

    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at := COALESCE(NEW.completed_at, now());
        NEW.progress_percent := 100;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER set_assignment_started_at
    BEFORE UPDATE OF status ON app.assignments
    FOR EACH ROW
    EXECUTE FUNCTION app.set_assignment_started_at();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get employee's assignments
CREATE OR REPLACE FUNCTION app.get_employee_assignments(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_status app.completion_status DEFAULT NULL,
    p_assignment_type app.assignment_type DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    course_id uuid,
    course_name varchar(255),
    learning_path_id uuid,
    learning_path_name varchar(255),
    assignment_type app.assignment_type,
    status app.completion_status,
    progress_percent integer,
    score numeric(5,2),
    due_date date,
    started_at timestamptz,
    completed_at timestamptz,
    time_spent_minutes integer,
    is_overdue boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.course_id,
        c.name AS course_name,
        a.learning_path_id,
        lp.name AS learning_path_name,
        a.assignment_type,
        a.status,
        a.progress_percent,
        a.score,
        a.due_date,
        a.started_at,
        a.completed_at,
        a.time_spent_minutes,
        (a.due_date IS NOT NULL AND a.due_date < CURRENT_DATE AND a.status NOT IN ('completed', 'expired')) AS is_overdue
    FROM app.assignments a
    LEFT JOIN app.courses c ON c.id = a.course_id
    LEFT JOIN app.learning_paths lp ON lp.id = a.learning_path_id
    WHERE a.tenant_id = p_tenant_id
      AND a.employee_id = p_employee_id
      AND (p_status IS NULL OR a.status = p_status)
      AND (p_assignment_type IS NULL OR a.assignment_type = p_assignment_type)
    ORDER BY
        CASE WHEN a.status = 'in_progress' THEN 0 ELSE 1 END,
        a.due_date ASC NULLS LAST,
        a.assigned_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to assign a course to an employee
CREATE OR REPLACE FUNCTION app.assign_course_to_employee(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_course_id uuid,
    p_assigned_by uuid,
    p_assignment_type app.assignment_type DEFAULT 'required',
    p_due_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_id uuid;
    v_modules_total integer;
BEGIN
    -- Get total modules from published course version
    SELECT jsonb_array_length(cv.modules)
    INTO v_modules_total
    FROM app.course_versions cv
    WHERE cv.course_id = p_course_id AND cv.status = 'published';

    -- Create the assignment
    INSERT INTO app.assignments (
        tenant_id,
        employee_id,
        course_id,
        assignment_type,
        due_date,
        assigned_by,
        modules_total
    )
    VALUES (
        p_tenant_id,
        p_employee_id,
        p_course_id,
        p_assignment_type,
        p_due_date,
        p_assigned_by,
        COALESCE(v_modules_total, 0)
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Function to update assignment progress
CREATE OR REPLACE FUNCTION app.update_assignment_progress(
    p_assignment_id uuid,
    p_progress_percent integer,
    p_modules_completed integer DEFAULT NULL,
    p_time_spent_minutes integer DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.assignments
    SET progress_percent = p_progress_percent,
        modules_completed = COALESCE(p_modules_completed, modules_completed),
        time_spent_minutes = time_spent_minutes + p_time_spent_minutes,
        last_activity_at = now(),
        status = CASE
            WHEN status = 'not_started' THEN 'in_progress'::app.completion_status
            ELSE status
        END
    WHERE id = p_assignment_id;

    RETURN true;
END;
$$;

-- Function to get overdue assignments
CREATE OR REPLACE FUNCTION app.get_overdue_assignments(
    p_tenant_id uuid,
    p_limit integer DEFAULT 100
)
RETURNS TABLE (
    id uuid,
    employee_id uuid,
    course_id uuid,
    course_name varchar(255),
    learning_path_id uuid,
    learning_path_name varchar(255),
    assignment_type app.assignment_type,
    due_date date,
    days_overdue integer,
    progress_percent integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.employee_id,
        a.course_id,
        c.name AS course_name,
        a.learning_path_id,
        lp.name AS learning_path_name,
        a.assignment_type,
        a.due_date,
        (CURRENT_DATE - a.due_date)::integer AS days_overdue,
        a.progress_percent
    FROM app.assignments a
    LEFT JOIN app.courses c ON c.id = a.course_id
    LEFT JOIN app.learning_paths lp ON lp.id = a.learning_path_id
    WHERE a.tenant_id = p_tenant_id
      AND a.due_date < CURRENT_DATE
      AND a.status NOT IN ('completed', 'expired')
    ORDER BY a.due_date ASC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.assignments IS 'Learning assignments linking employees to courses or learning paths.';
COMMENT ON COLUMN app.assignments.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.assignments.tenant_id IS 'Tenant where this assignment exists';
COMMENT ON COLUMN app.assignments.employee_id IS 'Employee assigned to this learning';
COMMENT ON COLUMN app.assignments.course_id IS 'Assigned course (mutually exclusive with learning_path_id)';
COMMENT ON COLUMN app.assignments.learning_path_id IS 'Assigned learning path (mutually exclusive with course_id)';
COMMENT ON COLUMN app.assignments.assignment_type IS 'Type of assignment (required, recommended, etc.)';
COMMENT ON COLUMN app.assignments.status IS 'Current completion status';
COMMENT ON COLUMN app.assignments.progress_percent IS 'Completion progress (0-100)';
COMMENT ON COLUMN app.assignments.modules_completed IS 'Number of modules/courses completed';
COMMENT ON COLUMN app.assignments.modules_total IS 'Total modules/courses to complete';
COMMENT ON COLUMN app.assignments.score IS 'Assessment score (0-100)';
COMMENT ON COLUMN app.assignments.attempts IS 'Number of attempts made';
COMMENT ON COLUMN app.assignments.max_attempts IS 'Maximum attempts allowed';
COMMENT ON COLUMN app.assignments.assigned_at IS 'When the assignment was created';
COMMENT ON COLUMN app.assignments.due_date IS 'Deadline for completion';
COMMENT ON COLUMN app.assignments.started_at IS 'When learner started';
COMMENT ON COLUMN app.assignments.completed_at IS 'When learner completed';
COMMENT ON COLUMN app.assignments.last_activity_at IS 'Last activity timestamp';
COMMENT ON COLUMN app.assignments.time_spent_minutes IS 'Total time spent';
COMMENT ON COLUMN app.assignments.assigned_by IS 'User who created the assignment';
COMMENT ON COLUMN app.assignments.assignment_source IS 'Source of assignment (manual, workflow, rule, self)';
COMMENT ON COLUMN app.assignments.context IS 'Additional context data';
COMMENT ON FUNCTION app.validate_assignment_status_transition IS 'Enforces valid status transitions';
COMMENT ON FUNCTION app.set_assignment_started_at IS 'Auto-sets started_at and completed_at timestamps';
COMMENT ON FUNCTION app.get_employee_assignments IS 'Returns assignments for an employee';
COMMENT ON FUNCTION app.assign_course_to_employee IS 'Assigns a course to an employee';
COMMENT ON FUNCTION app.update_assignment_progress IS 'Updates assignment progress';
COMMENT ON FUNCTION app.get_overdue_assignments IS 'Returns overdue assignments';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_overdue_assignments(uuid, integer);
-- DROP FUNCTION IF EXISTS app.update_assignment_progress(uuid, integer, integer, integer);
-- DROP FUNCTION IF EXISTS app.assign_course_to_employee(uuid, uuid, uuid, uuid, app.assignment_type, date);
-- DROP FUNCTION IF EXISTS app.get_employee_assignments(uuid, uuid, app.completion_status, app.assignment_type, integer, integer);
-- DROP TRIGGER IF EXISTS set_assignment_started_at ON app.assignments;
-- DROP FUNCTION IF EXISTS app.set_assignment_started_at();
-- DROP TRIGGER IF EXISTS validate_assignment_status_transition ON app.assignments;
-- DROP FUNCTION IF EXISTS app.validate_assignment_status_transition();
-- DROP TRIGGER IF EXISTS update_assignments_updated_at ON app.assignments;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.assignments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.assignments;
-- DROP INDEX IF EXISTS app.idx_assignments_context;
-- DROP INDEX IF EXISTS app.idx_assignments_tenant_source;
-- DROP INDEX IF EXISTS app.idx_assignments_tenant_required_pending;
-- DROP INDEX IF EXISTS app.idx_assignments_tenant_in_progress;
-- DROP INDEX IF EXISTS app.idx_assignments_tenant_status_due_date;
-- DROP INDEX IF EXISTS app.idx_assignments_tenant_path_status;
-- DROP INDEX IF EXISTS app.idx_assignments_tenant_course_status;
-- DROP INDEX IF EXISTS app.idx_assignments_tenant_employee_status;
-- DROP TABLE IF EXISTS app.assignments;
