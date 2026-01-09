-- Migration: 0074_completions
-- Created: 2026-01-07
-- Description: Create the completions table - immutable completion records
--              This table stores historical completion records for auditing
--              Records are immutable (no updates or deletes allowed)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Completions Table
-- -----------------------------------------------------------------------------
-- Immutable completion records for courses and learning paths
-- Provides audit trail of all learning completions
-- Separate from assignments to maintain historical accuracy
CREATE TABLE IF NOT EXISTS app.completions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant where this completion occurred
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee who completed the learning
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Assignment that was completed
    assignment_id uuid NOT NULL REFERENCES app.assignments(id) ON DELETE CASCADE,

    -- Completed content (denormalized for historical accuracy)
    course_id uuid REFERENCES app.courses(id) ON DELETE SET NULL,
    course_version_id uuid REFERENCES app.course_versions(id) ON DELETE SET NULL,
    learning_path_id uuid REFERENCES app.learning_paths(id) ON DELETE SET NULL,

    -- Denormalized content info at time of completion (for historical accuracy)
    content_code varchar(50) NOT NULL,
    content_name varchar(255) NOT NULL,
    content_version integer,

    -- Completion details
    completed_at timestamptz NOT NULL DEFAULT now(),
    final_score numeric(5,2),
    passed boolean NOT NULL DEFAULT true,

    -- Time tracking
    time_spent_minutes integer NOT NULL DEFAULT 0,
    started_at timestamptz,

    -- Credits earned
    credits_earned numeric(5,2) DEFAULT 0,

    -- Completion context
    -- Structure: {
    --   "module_scores": [...],
    --   "assessment_results": {...},
    --   "completion_type": "full" | "partial",
    --   "exemptions": [...],
    --   "instructor_id": "uuid",
    --   "location": "online" | "classroom"
    -- }
    completion_context jsonb NOT NULL DEFAULT '{}',

    -- Verification (for compliance/audit purposes)
    verified_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    verified_at timestamptz,
    verification_notes text,

    -- Immutable audit field
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Must have either course or learning path
    CONSTRAINT completions_content_type CHECK (
        (course_id IS NOT NULL OR learning_path_id IS NOT NULL)
    ),

    -- Score must be 0-100 if set
    CONSTRAINT completions_score_valid CHECK (
        final_score IS NULL OR (final_score >= 0 AND final_score <= 100)
    ),

    -- Time spent must be non-negative
    CONSTRAINT completions_time_spent_non_negative CHECK (
        time_spent_minutes >= 0
    ),

    -- Credits must be non-negative
    CONSTRAINT completions_credits_non_negative CHECK (
        credits_earned IS NULL OR credits_earned >= 0
    ),

    -- Verified must have verifier
    CONSTRAINT completions_verified_has_verifier CHECK (
        verified_at IS NULL OR verified_by IS NOT NULL
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Employee's completions
CREATE INDEX IF NOT EXISTS idx_completions_tenant_employee
    ON app.completions(tenant_id, employee_id, completed_at DESC);

-- Course completions
CREATE INDEX IF NOT EXISTS idx_completions_tenant_course
    ON app.completions(tenant_id, course_id, completed_at DESC)
    WHERE course_id IS NOT NULL;

-- Learning path completions
CREATE INDEX IF NOT EXISTS idx_completions_tenant_path
    ON app.completions(tenant_id, learning_path_id, completed_at DESC)
    WHERE learning_path_id IS NOT NULL;

-- Assignment lookup
CREATE INDEX IF NOT EXISTS idx_completions_assignment_id
    ON app.completions(assignment_id);

-- Completed at for reporting
CREATE INDEX IF NOT EXISTS idx_completions_tenant_completed_at
    ON app.completions(tenant_id, completed_at DESC);

-- Passed/failed filtering
CREATE INDEX IF NOT EXISTS idx_completions_tenant_passed
    ON app.completions(tenant_id, passed, completed_at DESC);

-- Verification pending
CREATE INDEX IF NOT EXISTS idx_completions_tenant_unverified
    ON app.completions(tenant_id, created_at DESC)
    WHERE verified_at IS NULL;

-- GIN index for context queries
CREATE INDEX IF NOT EXISTS idx_completions_context
    ON app.completions USING gin(completion_context);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.completions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see completions for their current tenant
CREATE POLICY tenant_isolation ON app.completions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.completions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy: Prevent updates to completion records (immutable)
-- Note: This is enforced by trigger, but we can also restrict via policy
CREATE POLICY no_updates ON app.completions
    FOR UPDATE
    USING (false);

-- Policy: Prevent deletes of completion records (immutable)
CREATE POLICY no_deletes ON app.completions
    FOR DELETE
    USING (false);

-- =============================================================================
-- Triggers
-- =============================================================================

-- Trigger to prevent updates to completion records
CREATE OR REPLACE FUNCTION app.prevent_completion_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Allow updates only to verification fields
    IF OLD.verified_at IS NULL AND NEW.verified_at IS NOT NULL THEN
        -- Allow verification update
        NEW.id := OLD.id;
        NEW.tenant_id := OLD.tenant_id;
        NEW.employee_id := OLD.employee_id;
        NEW.assignment_id := OLD.assignment_id;
        NEW.course_id := OLD.course_id;
        NEW.course_version_id := OLD.course_version_id;
        NEW.learning_path_id := OLD.learning_path_id;
        NEW.content_code := OLD.content_code;
        NEW.content_name := OLD.content_name;
        NEW.content_version := OLD.content_version;
        NEW.completed_at := OLD.completed_at;
        NEW.final_score := OLD.final_score;
        NEW.passed := OLD.passed;
        NEW.time_spent_minutes := OLD.time_spent_minutes;
        NEW.started_at := OLD.started_at;
        NEW.credits_earned := OLD.credits_earned;
        NEW.completion_context := OLD.completion_context;
        NEW.created_at := OLD.created_at;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Completion records are immutable and cannot be updated';
END;
$$;

CREATE TRIGGER prevent_completion_update
    BEFORE UPDATE ON app.completions
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_completion_update();

-- Trigger to prevent deletes of completion records
CREATE OR REPLACE FUNCTION app.prevent_completion_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RAISE EXCEPTION 'Completion records are immutable and cannot be deleted';
END;
$$;

CREATE TRIGGER prevent_completion_delete
    BEFORE DELETE ON app.completions
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_completion_delete();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to record a completion
CREATE OR REPLACE FUNCTION app.record_completion(
    p_tenant_id uuid,
    p_assignment_id uuid,
    p_final_score numeric(5,2) DEFAULT NULL,
    p_passed boolean DEFAULT true,
    p_completion_context jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_id uuid;
    v_assignment app.assignments%ROWTYPE;
    v_content_code varchar(50);
    v_content_name varchar(255);
    v_content_version integer;
    v_credits_earned numeric(5,2) := 0;
    v_course_version_id uuid;
BEGIN
    -- Get assignment details
    SELECT * INTO v_assignment
    FROM app.assignments
    WHERE id = p_assignment_id;

    IF v_assignment.id IS NULL THEN
        RAISE EXCEPTION 'Assignment not found: %', p_assignment_id;
    END IF;

    -- Get content details
    IF v_assignment.course_id IS NOT NULL THEN
        SELECT c.code, c.name, cv.version, c.credits, cv.id
        INTO v_content_code, v_content_name, v_content_version, v_credits_earned, v_course_version_id
        FROM app.courses c
        LEFT JOIN app.course_versions cv ON cv.course_id = c.id AND cv.status = 'published'
        WHERE c.id = v_assignment.course_id;
    ELSE
        SELECT lp.code, lp.name, NULL, lp.total_credits
        INTO v_content_code, v_content_name, v_content_version, v_credits_earned
        FROM app.learning_paths lp
        WHERE lp.id = v_assignment.learning_path_id;
    END IF;

    -- Record the completion
    INSERT INTO app.completions (
        tenant_id,
        employee_id,
        assignment_id,
        course_id,
        course_version_id,
        learning_path_id,
        content_code,
        content_name,
        content_version,
        final_score,
        passed,
        time_spent_minutes,
        started_at,
        credits_earned,
        completion_context
    )
    VALUES (
        p_tenant_id,
        v_assignment.employee_id,
        p_assignment_id,
        v_assignment.course_id,
        v_course_version_id,
        v_assignment.learning_path_id,
        v_content_code,
        v_content_name,
        v_content_version,
        p_final_score,
        p_passed,
        v_assignment.time_spent_minutes,
        v_assignment.started_at,
        CASE WHEN p_passed THEN v_credits_earned ELSE 0 END,
        p_completion_context
    )
    RETURNING id INTO v_id;

    -- Update assignment status
    UPDATE app.assignments
    SET status = CASE WHEN p_passed THEN 'completed' ELSE 'failed' END,
        score = p_final_score,
        completed_at = now()
    WHERE id = p_assignment_id;

    RETURN v_id;
END;
$$;

-- Function to get employee's completion history
CREATE OR REPLACE FUNCTION app.get_employee_completions(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_start_date date DEFAULT NULL,
    p_end_date date DEFAULT NULL,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    content_code varchar(50),
    content_name varchar(255),
    content_type text,
    completed_at timestamptz,
    final_score numeric(5,2),
    passed boolean,
    time_spent_minutes integer,
    credits_earned numeric(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.content_code,
        c.content_name,
        CASE WHEN c.course_id IS NOT NULL THEN 'course' ELSE 'learning_path' END AS content_type,
        c.completed_at,
        c.final_score,
        c.passed,
        c.time_spent_minutes,
        c.credits_earned
    FROM app.completions c
    WHERE c.tenant_id = p_tenant_id
      AND c.employee_id = p_employee_id
      AND (p_start_date IS NULL OR c.completed_at >= p_start_date)
      AND (p_end_date IS NULL OR c.completed_at < p_end_date + interval '1 day')
    ORDER BY c.completed_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get completion statistics for reporting
CREATE OR REPLACE FUNCTION app.get_completion_statistics(
    p_tenant_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    total_completions bigint,
    total_passed bigint,
    total_failed bigint,
    pass_rate numeric,
    average_score numeric,
    total_credits_earned numeric,
    total_time_spent_hours numeric,
    unique_learners bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_completions,
        COUNT(*) FILTER (WHERE c.passed = true)::bigint AS total_passed,
        COUNT(*) FILTER (WHERE c.passed = false)::bigint AS total_failed,
        ROUND((COUNT(*) FILTER (WHERE c.passed = true)::numeric / NULLIF(COUNT(*)::numeric, 0)) * 100, 2) AS pass_rate,
        ROUND(AVG(c.final_score) FILTER (WHERE c.final_score IS NOT NULL), 2) AS average_score,
        COALESCE(SUM(c.credits_earned), 0) AS total_credits_earned,
        ROUND(COALESCE(SUM(c.time_spent_minutes), 0) / 60.0, 2) AS total_time_spent_hours,
        COUNT(DISTINCT c.employee_id)::bigint AS unique_learners
    FROM app.completions c
    WHERE c.tenant_id = p_tenant_id
      AND c.completed_at >= p_start_date
      AND c.completed_at < p_end_date + interval '1 day';
END;
$$;

-- Function to verify a completion
CREATE OR REPLACE FUNCTION app.verify_completion(
    p_completion_id uuid,
    p_verified_by uuid,
    p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.completions
    SET verified_by = p_verified_by,
        verified_at = now(),
        verification_notes = p_notes
    WHERE id = p_completion_id
      AND verified_at IS NULL;

    RETURN FOUND;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.completions IS 'Immutable completion records for courses and learning paths. No updates or deletes allowed.';
COMMENT ON COLUMN app.completions.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.completions.tenant_id IS 'Tenant where this completion occurred';
COMMENT ON COLUMN app.completions.employee_id IS 'Employee who completed the learning';
COMMENT ON COLUMN app.completions.assignment_id IS 'Assignment that was completed';
COMMENT ON COLUMN app.completions.course_id IS 'Completed course (if applicable)';
COMMENT ON COLUMN app.completions.course_version_id IS 'Specific course version completed';
COMMENT ON COLUMN app.completions.learning_path_id IS 'Completed learning path (if applicable)';
COMMENT ON COLUMN app.completions.content_code IS 'Content code at time of completion (denormalized)';
COMMENT ON COLUMN app.completions.content_name IS 'Content name at time of completion (denormalized)';
COMMENT ON COLUMN app.completions.content_version IS 'Content version at time of completion';
COMMENT ON COLUMN app.completions.completed_at IS 'When the completion occurred';
COMMENT ON COLUMN app.completions.final_score IS 'Final assessment score (0-100)';
COMMENT ON COLUMN app.completions.passed IS 'Whether the learner passed';
COMMENT ON COLUMN app.completions.time_spent_minutes IS 'Total time spent';
COMMENT ON COLUMN app.completions.started_at IS 'When the learner started';
COMMENT ON COLUMN app.completions.credits_earned IS 'Learning credits earned';
COMMENT ON COLUMN app.completions.completion_context IS 'Additional completion details';
COMMENT ON COLUMN app.completions.verified_by IS 'User who verified the completion';
COMMENT ON COLUMN app.completions.verified_at IS 'When the completion was verified';
COMMENT ON COLUMN app.completions.verification_notes IS 'Notes from verification';
COMMENT ON FUNCTION app.prevent_completion_update IS 'Prevents updates to completion records (immutable)';
COMMENT ON FUNCTION app.prevent_completion_delete IS 'Prevents deletes of completion records (immutable)';
COMMENT ON FUNCTION app.record_completion IS 'Records a new completion record';
COMMENT ON FUNCTION app.get_employee_completions IS 'Returns completion history for an employee';
COMMENT ON FUNCTION app.get_completion_statistics IS 'Returns completion statistics for reporting';
COMMENT ON FUNCTION app.verify_completion IS 'Marks a completion as verified';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.verify_completion(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS app.get_completion_statistics(uuid, date, date);
-- DROP FUNCTION IF EXISTS app.get_employee_completions(uuid, uuid, date, date, integer, integer);
-- DROP FUNCTION IF EXISTS app.record_completion(uuid, uuid, numeric, boolean, jsonb);
-- DROP TRIGGER IF EXISTS prevent_completion_delete ON app.completions;
-- DROP FUNCTION IF EXISTS app.prevent_completion_delete();
-- DROP TRIGGER IF EXISTS prevent_completion_update ON app.completions;
-- DROP FUNCTION IF EXISTS app.prevent_completion_update();
-- DROP POLICY IF EXISTS no_deletes ON app.completions;
-- DROP POLICY IF EXISTS no_updates ON app.completions;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.completions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.completions;
-- DROP INDEX IF EXISTS app.idx_completions_context;
-- DROP INDEX IF EXISTS app.idx_completions_tenant_unverified;
-- DROP INDEX IF EXISTS app.idx_completions_tenant_passed;
-- DROP INDEX IF EXISTS app.idx_completions_tenant_completed_at;
-- DROP INDEX IF EXISTS app.idx_completions_assignment_id;
-- DROP INDEX IF EXISTS app.idx_completions_tenant_path;
-- DROP INDEX IF EXISTS app.idx_completions_tenant_course;
-- DROP INDEX IF EXISTS app.idx_completions_tenant_employee;
-- DROP TABLE IF EXISTS app.completions;
