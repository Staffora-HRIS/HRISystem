-- Migration: 0070_course_versions
-- Created: 2026-01-07
-- Description: Create the course_versions table - versioned course content
--              This table stores the actual course content and modules
--              Each course can have multiple versions, only one active at a time

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Course Versions Table
-- -----------------------------------------------------------------------------
-- Versioned course content with modules and assessments
-- Only one version per course can be active at a time
CREATE TABLE IF NOT EXISTS app.course_versions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this course version
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent course
    course_id uuid NOT NULL REFERENCES app.courses(id) ON DELETE CASCADE,

    -- Version number (incrementing per course)
    version integer NOT NULL,

    -- Version status
    status app.course_status NOT NULL DEFAULT 'draft',

    -- Course content modules (array of module objects)
    -- Structure: [
    --   {
    --     "index": 0,
    --     "title": "Introduction to Topic",
    --     "description": "Overview of the course",
    --     "content_type": "video",
    --     "content_url": "https://...",
    --     "duration_minutes": 15,
    --     "required": true,
    --     "resources": [
    --       { "title": "Slides", "url": "https://...", "type": "document" }
    --     ],
    --     "assessment": {
    --       "type": "quiz",
    --       "questions_count": 10,
    --       "passing_score": 70,
    --       "time_limit_minutes": 30
    --     }
    --   }
    -- ]
    modules jsonb NOT NULL DEFAULT '[]',

    -- Learning objectives
    learning_objectives jsonb NOT NULL DEFAULT '[]',

    -- Prerequisites (other course IDs or descriptions)
    prerequisites jsonb NOT NULL DEFAULT '[]',

    -- Final assessment configuration
    -- Structure: {
    --   "enabled": true,
    --   "type": "quiz" | "assignment" | "project",
    --   "passing_score": 80,
    --   "questions_count": 20,
    --   "time_limit_minutes": 60,
    --   "max_attempts": 2,
    --   "questions": [...]
    -- }
    final_assessment jsonb,

    -- Total duration calculated from modules
    total_duration_minutes integer,

    -- Version notes (changelog)
    version_notes text,

    -- Publication metadata
    published_at timestamptz,
    published_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Standard audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Constraints
    -- Version must be unique within course
    CONSTRAINT course_versions_course_version_unique UNIQUE (course_id, version),

    -- Version must be positive
    CONSTRAINT course_versions_version_positive CHECK (version > 0),

    -- Published metadata required when active/published
    CONSTRAINT course_versions_published_has_metadata CHECK (
        status != 'published' OR (published_at IS NOT NULL AND published_by IS NOT NULL)
    ),

    -- Modules must be non-empty when published
    CONSTRAINT course_versions_published_has_modules CHECK (
        status = 'draft' OR jsonb_array_length(modules) > 0
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: course + version
CREATE INDEX IF NOT EXISTS idx_course_versions_course_version
    ON app.course_versions(course_id, version DESC);

-- Tenant filtering
CREATE INDEX IF NOT EXISTS idx_course_versions_tenant_id
    ON app.course_versions(tenant_id);

-- Active/Published versions per course
CREATE INDEX IF NOT EXISTS idx_course_versions_course_published
    ON app.course_versions(course_id)
    WHERE status = 'published';

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_course_versions_tenant_status
    ON app.course_versions(tenant_id, status);

-- GIN index for modules queries
CREATE INDEX IF NOT EXISTS idx_course_versions_modules
    ON app.course_versions USING gin(modules);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.course_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see course versions for their current tenant
CREATE POLICY tenant_isolation ON app.course_versions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.course_versions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Function to ensure only one published version per course
CREATE OR REPLACE FUNCTION app.enforce_single_published_course_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- If setting this version to published, archive any other published version
    IF NEW.status = 'published' AND (OLD IS NULL OR OLD.status != 'published') THEN
        UPDATE app.course_versions
        SET status = 'archived'
        WHERE course_id = NEW.course_id
          AND id != NEW.id
          AND status = 'published';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_single_published_course_version
    BEFORE INSERT OR UPDATE OF status ON app.course_versions
    FOR EACH ROW
    EXECUTE FUNCTION app.enforce_single_published_course_version();

-- Function to auto-generate version number
CREATE OR REPLACE FUNCTION app.generate_course_version_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_max_version integer;
BEGIN
    -- Only set version if not provided or is 0
    IF NEW.version IS NULL OR NEW.version = 0 THEN
        SELECT COALESCE(MAX(version), 0) + 1
        INTO v_max_version
        FROM app.course_versions
        WHERE course_id = NEW.course_id;

        NEW.version := v_max_version;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER generate_course_version_number
    BEFORE INSERT ON app.course_versions
    FOR EACH ROW
    EXECUTE FUNCTION app.generate_course_version_number();

-- Function to auto-calculate total duration from modules
CREATE OR REPLACE FUNCTION app.calculate_course_version_duration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_total_duration integer;
BEGIN
    -- Calculate total duration from modules
    SELECT COALESCE(SUM((module->>'duration_minutes')::integer), 0)
    INTO v_total_duration
    FROM jsonb_array_elements(NEW.modules) AS module;

    -- Add final assessment time if configured
    IF NEW.final_assessment IS NOT NULL AND NEW.final_assessment->>'time_limit_minutes' IS NOT NULL THEN
        v_total_duration := v_total_duration + (NEW.final_assessment->>'time_limit_minutes')::integer;
    END IF;

    NEW.total_duration_minutes := v_total_duration;

    RETURN NEW;
END;
$$;

CREATE TRIGGER calculate_course_version_duration
    BEFORE INSERT OR UPDATE OF modules, final_assessment ON app.course_versions
    FOR EACH ROW
    EXECUTE FUNCTION app.calculate_course_version_duration();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get the published version for a course
CREATE OR REPLACE FUNCTION app.get_published_course_version(
    p_course_id uuid
)
RETURNS TABLE (
    id uuid,
    course_id uuid,
    version integer,
    modules jsonb,
    learning_objectives jsonb,
    prerequisites jsonb,
    final_assessment jsonb,
    total_duration_minutes integer,
    published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cv.id,
        cv.course_id,
        cv.version,
        cv.modules,
        cv.learning_objectives,
        cv.prerequisites,
        cv.final_assessment,
        cv.total_duration_minutes,
        cv.published_at
    FROM app.course_versions cv
    WHERE cv.course_id = p_course_id
      AND cv.status = 'published'
    LIMIT 1;
END;
$$;

-- Function to publish a course version
CREATE OR REPLACE FUNCTION app.publish_course_version(
    p_version_id uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_status app.course_status;
BEGIN
    -- Get current status
    SELECT status INTO v_current_status
    FROM app.course_versions
    WHERE id = p_version_id;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Course version not found: %', p_version_id;
    END IF;

    IF v_current_status != 'draft' THEN
        RAISE EXCEPTION 'Only draft versions can be published. Current status: %', v_current_status;
    END IF;

    -- Publish the version
    UPDATE app.course_versions
    SET status = 'published',
        published_at = now(),
        published_by = p_user_id
    WHERE id = p_version_id;

    RETURN true;
END;
$$;

-- Function to clone a course version
CREATE OR REPLACE FUNCTION app.clone_course_version(
    p_source_version_id uuid,
    p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_new_id uuid;
    v_course_id uuid;
    v_tenant_id uuid;
    v_modules jsonb;
    v_learning_objectives jsonb;
    v_prerequisites jsonb;
    v_final_assessment jsonb;
BEGIN
    -- Get source version data
    SELECT course_id, tenant_id, modules, learning_objectives, prerequisites, final_assessment
    INTO v_course_id, v_tenant_id, v_modules, v_learning_objectives, v_prerequisites, v_final_assessment
    FROM app.course_versions
    WHERE id = p_source_version_id;

    IF v_course_id IS NULL THEN
        RAISE EXCEPTION 'Source course version not found: %', p_source_version_id;
    END IF;

    -- Create new draft version
    INSERT INTO app.course_versions (
        tenant_id,
        course_id,
        status,
        modules,
        learning_objectives,
        prerequisites,
        final_assessment,
        version_notes,
        created_by
    )
    VALUES (
        v_tenant_id,
        v_course_id,
        'draft',
        v_modules,
        v_learning_objectives,
        v_prerequisites,
        v_final_assessment,
        'Cloned from version',
        p_user_id
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.course_versions IS 'Versioned course content with modules. Only one published version per course.';
COMMENT ON COLUMN app.course_versions.id IS 'Primary UUID identifier for the course version';
COMMENT ON COLUMN app.course_versions.tenant_id IS 'Tenant that owns this course version';
COMMENT ON COLUMN app.course_versions.course_id IS 'Parent course';
COMMENT ON COLUMN app.course_versions.version IS 'Version number (incrementing per course)';
COMMENT ON COLUMN app.course_versions.status IS 'Version status (draft, published, archived)';
COMMENT ON COLUMN app.course_versions.modules IS 'Course content modules as JSONB array';
COMMENT ON COLUMN app.course_versions.learning_objectives IS 'Learning objectives for this course';
COMMENT ON COLUMN app.course_versions.prerequisites IS 'Prerequisites for taking this course';
COMMENT ON COLUMN app.course_versions.final_assessment IS 'Final assessment configuration';
COMMENT ON COLUMN app.course_versions.total_duration_minutes IS 'Total duration calculated from modules';
COMMENT ON COLUMN app.course_versions.version_notes IS 'Changelog notes for this version';
COMMENT ON COLUMN app.course_versions.published_at IS 'When this version was published';
COMMENT ON COLUMN app.course_versions.published_by IS 'User who published this version';
COMMENT ON COLUMN app.course_versions.created_by IS 'User who created this version';
COMMENT ON FUNCTION app.enforce_single_published_course_version IS 'Ensures only one published version per course';
COMMENT ON FUNCTION app.generate_course_version_number IS 'Auto-generates version number on insert';
COMMENT ON FUNCTION app.calculate_course_version_duration IS 'Auto-calculates total duration from modules';
COMMENT ON FUNCTION app.get_published_course_version IS 'Returns the published version for a course';
COMMENT ON FUNCTION app.publish_course_version IS 'Publishes a draft version';
COMMENT ON FUNCTION app.clone_course_version IS 'Creates a new draft version from an existing version';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.clone_course_version(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.publish_course_version(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_published_course_version(uuid);
-- DROP TRIGGER IF EXISTS calculate_course_version_duration ON app.course_versions;
-- DROP FUNCTION IF EXISTS app.calculate_course_version_duration();
-- DROP TRIGGER IF EXISTS generate_course_version_number ON app.course_versions;
-- DROP FUNCTION IF EXISTS app.generate_course_version_number();
-- DROP TRIGGER IF EXISTS enforce_single_published_course_version ON app.course_versions;
-- DROP FUNCTION IF EXISTS app.enforce_single_published_course_version();
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.course_versions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.course_versions;
-- DROP INDEX IF EXISTS app.idx_course_versions_modules;
-- DROP INDEX IF EXISTS app.idx_course_versions_tenant_status;
-- DROP INDEX IF EXISTS app.idx_course_versions_course_published;
-- DROP INDEX IF EXISTS app.idx_course_versions_tenant_id;
-- DROP INDEX IF EXISTS app.idx_course_versions_course_version;
-- DROP TABLE IF EXISTS app.course_versions;
