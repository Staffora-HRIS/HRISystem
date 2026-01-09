-- Migration: 0072_learning_path_courses
-- Created: 2026-01-07
-- Description: Create the learning_path_courses table - junction table linking
--              courses to learning paths with ordering and dependencies

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Learning Path Courses Table
-- -----------------------------------------------------------------------------
-- Junction table linking courses to learning paths
-- Supports ordering and prerequisite dependencies within the path
CREATE TABLE IF NOT EXISTS app.learning_path_courses (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this relationship
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Learning path this course belongs to
    learning_path_id uuid NOT NULL REFERENCES app.learning_paths(id) ON DELETE CASCADE,

    -- Course in the path
    course_id uuid NOT NULL REFERENCES app.courses(id) ON DELETE CASCADE,

    -- Order within the path (0-indexed)
    sequence_order integer NOT NULL DEFAULT 0,

    -- Whether this course is required for path completion
    is_required boolean NOT NULL DEFAULT true,

    -- Prerequisite courses within this path (other course IDs)
    -- These must be completed before this course can be started
    prerequisite_course_ids jsonb NOT NULL DEFAULT '[]',

    -- Optional minimum score required from prerequisites
    min_prerequisite_score integer,

    -- Metadata for this course in the path context
    -- Structure: {
    --   "notes": "Start here for beginners",
    --   "estimated_duration_override": 60,
    --   "unlock_conditions": {...}
    -- }
    metadata jsonb NOT NULL DEFAULT '{}',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Each course can only appear once in a learning path
    CONSTRAINT learning_path_courses_unique UNIQUE (learning_path_id, course_id),

    -- Sequence order must be non-negative
    CONSTRAINT learning_path_courses_sequence_positive CHECK (
        sequence_order >= 0
    ),

    -- Minimum score must be between 0 and 100
    CONSTRAINT learning_path_courses_min_score_valid CHECK (
        min_prerequisite_score IS NULL OR (min_prerequisite_score >= 0 AND min_prerequisite_score <= 100)
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: path + order
CREATE INDEX IF NOT EXISTS idx_learning_path_courses_path_order
    ON app.learning_path_courses(learning_path_id, sequence_order);

-- Course lookup (which paths include this course)
CREATE INDEX IF NOT EXISTS idx_learning_path_courses_course_id
    ON app.learning_path_courses(course_id);

-- Tenant filtering
CREATE INDEX IF NOT EXISTS idx_learning_path_courses_tenant_id
    ON app.learning_path_courses(tenant_id);

-- Required courses in path
CREATE INDEX IF NOT EXISTS idx_learning_path_courses_path_required
    ON app.learning_path_courses(learning_path_id, is_required)
    WHERE is_required = true;

-- GIN index for prerequisite queries
CREATE INDEX IF NOT EXISTS idx_learning_path_courses_prerequisites
    ON app.learning_path_courses USING gin(prerequisite_course_ids);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.learning_path_courses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see learning path courses for their current tenant
CREATE POLICY tenant_isolation ON app.learning_path_courses
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.learning_path_courses
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_learning_path_courses_updated_at
    BEFORE UPDATE ON app.learning_path_courses
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Trigger to recalculate learning path totals when courses change
CREATE OR REPLACE FUNCTION app.trigger_recalculate_learning_path_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM app.recalculate_learning_path_totals(OLD.learning_path_id);
        RETURN OLD;
    ELSE
        PERFORM app.recalculate_learning_path_totals(NEW.learning_path_id);
        RETURN NEW;
    END IF;
END;
$$;

CREATE TRIGGER recalculate_learning_path_totals_on_change
    AFTER INSERT OR UPDATE OR DELETE ON app.learning_path_courses
    FOR EACH ROW
    EXECUTE FUNCTION app.trigger_recalculate_learning_path_totals();

-- Trigger to validate prerequisite course IDs exist in the same path
CREATE OR REPLACE FUNCTION app.validate_learning_path_course_prerequisites()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_prereq_id uuid;
    v_exists boolean;
BEGIN
    -- Check each prerequisite course ID
    FOR v_prereq_id IN SELECT jsonb_array_elements_text(NEW.prerequisite_course_ids)::uuid
    LOOP
        -- Verify the prerequisite course exists in the same learning path
        SELECT EXISTS(
            SELECT 1
            FROM app.learning_path_courses
            WHERE learning_path_id = NEW.learning_path_id
              AND course_id = v_prereq_id
              AND id != NEW.id
        ) INTO v_exists;

        IF NOT v_exists THEN
            RAISE EXCEPTION 'Prerequisite course % is not in this learning path', v_prereq_id;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_learning_path_course_prerequisites
    BEFORE INSERT OR UPDATE OF prerequisite_course_ids ON app.learning_path_courses
    FOR EACH ROW
    WHEN (jsonb_array_length(NEW.prerequisite_course_ids) > 0)
    EXECUTE FUNCTION app.validate_learning_path_course_prerequisites();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get courses in a learning path with details
CREATE OR REPLACE FUNCTION app.get_learning_path_courses(
    p_learning_path_id uuid
)
RETURNS TABLE (
    id uuid,
    course_id uuid,
    course_code varchar(50),
    course_name varchar(255),
    course_description text,
    skill_level app.skill_level,
    estimated_duration_minutes integer,
    credits numeric(5,2),
    sequence_order integer,
    is_required boolean,
    prerequisite_course_ids jsonb,
    course_status app.course_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lpc.id,
        lpc.course_id,
        c.code AS course_code,
        c.name AS course_name,
        c.description AS course_description,
        c.skill_level,
        c.estimated_duration_minutes,
        c.credits,
        lpc.sequence_order,
        lpc.is_required,
        lpc.prerequisite_course_ids,
        c.status AS course_status
    FROM app.learning_path_courses lpc
    JOIN app.courses c ON c.id = lpc.course_id
    WHERE lpc.learning_path_id = p_learning_path_id
    ORDER BY lpc.sequence_order ASC;
END;
$$;

-- Function to add a course to a learning path
CREATE OR REPLACE FUNCTION app.add_course_to_learning_path(
    p_tenant_id uuid,
    p_learning_path_id uuid,
    p_course_id uuid,
    p_is_required boolean DEFAULT true,
    p_prerequisite_course_ids jsonb DEFAULT '[]'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_id uuid;
    v_max_order integer;
BEGIN
    -- Get the next sequence order
    SELECT COALESCE(MAX(sequence_order), -1) + 1
    INTO v_max_order
    FROM app.learning_path_courses
    WHERE learning_path_id = p_learning_path_id;

    -- Insert the new course
    INSERT INTO app.learning_path_courses (
        tenant_id,
        learning_path_id,
        course_id,
        sequence_order,
        is_required,
        prerequisite_course_ids
    )
    VALUES (
        p_tenant_id,
        p_learning_path_id,
        p_course_id,
        v_max_order,
        p_is_required,
        p_prerequisite_course_ids
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Function to reorder courses in a learning path
CREATE OR REPLACE FUNCTION app.reorder_learning_path_courses(
    p_learning_path_id uuid,
    p_course_order jsonb  -- Array of course IDs in new order
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_course_id uuid;
    v_new_order integer := 0;
BEGIN
    -- Update each course with its new order
    FOR v_course_id IN SELECT jsonb_array_elements_text(p_course_order)::uuid
    LOOP
        UPDATE app.learning_path_courses
        SET sequence_order = v_new_order,
            updated_at = now()
        WHERE learning_path_id = p_learning_path_id
          AND course_id = v_course_id;

        v_new_order := v_new_order + 1;
    END LOOP;

    RETURN true;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.learning_path_courses IS 'Junction table linking courses to learning paths with ordering.';
COMMENT ON COLUMN app.learning_path_courses.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.learning_path_courses.tenant_id IS 'Tenant that owns this relationship';
COMMENT ON COLUMN app.learning_path_courses.learning_path_id IS 'Learning path this course belongs to';
COMMENT ON COLUMN app.learning_path_courses.course_id IS 'Course in the path';
COMMENT ON COLUMN app.learning_path_courses.sequence_order IS 'Order within the path (0-indexed)';
COMMENT ON COLUMN app.learning_path_courses.is_required IS 'Whether required for path completion';
COMMENT ON COLUMN app.learning_path_courses.prerequisite_course_ids IS 'Courses that must be completed first';
COMMENT ON COLUMN app.learning_path_courses.min_prerequisite_score IS 'Minimum score required from prerequisites';
COMMENT ON COLUMN app.learning_path_courses.metadata IS 'Additional metadata for this course in path context';
COMMENT ON FUNCTION app.trigger_recalculate_learning_path_totals IS 'Trigger to recalculate path totals on course changes';
COMMENT ON FUNCTION app.validate_learning_path_course_prerequisites IS 'Validates prerequisite courses exist in the same path';
COMMENT ON FUNCTION app.get_learning_path_courses IS 'Returns courses in a learning path with details';
COMMENT ON FUNCTION app.add_course_to_learning_path IS 'Adds a course to a learning path';
COMMENT ON FUNCTION app.reorder_learning_path_courses IS 'Reorders courses in a learning path';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.reorder_learning_path_courses(uuid, jsonb);
-- DROP FUNCTION IF EXISTS app.add_course_to_learning_path(uuid, uuid, uuid, boolean, jsonb);
-- DROP FUNCTION IF EXISTS app.get_learning_path_courses(uuid);
-- DROP TRIGGER IF EXISTS validate_learning_path_course_prerequisites ON app.learning_path_courses;
-- DROP FUNCTION IF EXISTS app.validate_learning_path_course_prerequisites();
-- DROP TRIGGER IF EXISTS recalculate_learning_path_totals_on_change ON app.learning_path_courses;
-- DROP FUNCTION IF EXISTS app.trigger_recalculate_learning_path_totals();
-- DROP TRIGGER IF EXISTS update_learning_path_courses_updated_at ON app.learning_path_courses;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.learning_path_courses;
-- DROP POLICY IF EXISTS tenant_isolation ON app.learning_path_courses;
-- DROP INDEX IF EXISTS app.idx_learning_path_courses_prerequisites;
-- DROP INDEX IF EXISTS app.idx_learning_path_courses_path_required;
-- DROP INDEX IF EXISTS app.idx_learning_path_courses_tenant_id;
-- DROP INDEX IF EXISTS app.idx_learning_path_courses_course_id;
-- DROP INDEX IF EXISTS app.idx_learning_path_courses_path_order;
-- DROP TABLE IF EXISTS app.learning_path_courses;
