-- Migration: 0069_courses
-- Created: 2026-01-07
-- Description: Create the courses table - master course definitions
--              This table stores course metadata and configuration
--              Actual versioned content is stored in course_versions

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Courses Table
-- -----------------------------------------------------------------------------
-- Master course definitions
-- Each course can have multiple versions with actual content
CREATE TABLE IF NOT EXISTS app.courses (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this course
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Course identification
    code varchar(50) NOT NULL,
    name varchar(255) NOT NULL,
    description text,

    -- Course metadata
    category varchar(100),
    tags jsonb NOT NULL DEFAULT '[]',

    -- Difficulty level
    skill_level app.skill_level NOT NULL DEFAULT 'beginner',

    -- Duration and credits
    estimated_duration_minutes integer,
    credits numeric(5,2) DEFAULT 0,

    -- Course provider (internal or external)
    provider varchar(255),
    external_course_id varchar(255),
    external_url text,

    -- Settings
    -- Structure: {
    --   "passing_score": 80,
    --   "max_attempts": 3,
    --   "allow_retake": true,
    --   "completion_criteria": "all_modules" | "passing_score" | "time_spent",
    --   "required_time_minutes": null,
    --   "expiration_days": 365,
    --   "certificate_enabled": true
    -- }
    settings jsonb NOT NULL DEFAULT '{}',

    -- Current status
    status app.course_status NOT NULL DEFAULT 'draft',

    -- Thumbnail/cover image URL
    thumbnail_url text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Constraints
    -- Course code must be unique within tenant
    CONSTRAINT courses_code_unique UNIQUE (tenant_id, code),

    -- Duration must be positive
    CONSTRAINT courses_duration_positive CHECK (
        estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0
    ),

    -- Credits must be non-negative
    CONSTRAINT courses_credits_non_negative CHECK (
        credits IS NULL OR credits >= 0
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + code
CREATE INDEX IF NOT EXISTS idx_courses_tenant_code
    ON app.courses(tenant_id, code);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_courses_tenant_status
    ON app.courses(tenant_id, status);

-- Published courses (common query)
CREATE INDEX IF NOT EXISTS idx_courses_tenant_published
    ON app.courses(tenant_id)
    WHERE status = 'published';

-- Category filtering
CREATE INDEX IF NOT EXISTS idx_courses_tenant_category
    ON app.courses(tenant_id, category)
    WHERE category IS NOT NULL;

-- Skill level filtering
CREATE INDEX IF NOT EXISTS idx_courses_tenant_skill_level
    ON app.courses(tenant_id, skill_level);

-- Provider filtering (external courses)
CREATE INDEX IF NOT EXISTS idx_courses_tenant_provider
    ON app.courses(tenant_id, provider)
    WHERE provider IS NOT NULL;

-- GIN index for tags queries
CREATE INDEX IF NOT EXISTS idx_courses_tags
    ON app.courses USING gin(tags);

-- Full-text search on name and description
CREATE INDEX IF NOT EXISTS idx_courses_search
    ON app.courses USING gin(
        to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, ''))
    );

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.courses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see courses for their current tenant
CREATE POLICY tenant_isolation ON app.courses
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.courses
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_courses_updated_at
    BEFORE UPDATE ON app.courses
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Function to validate course status transitions
CREATE OR REPLACE FUNCTION app.validate_course_status_transition()
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
            -- draft can transition to published or archived
            IF NEW.status NOT IN ('published', 'archived') THEN
                RAISE EXCEPTION 'Invalid status transition: draft can only transition to published or archived, not %', NEW.status;
            END IF;

        WHEN 'published' THEN
            -- published can only transition to archived
            IF NEW.status NOT IN ('archived') THEN
                RAISE EXCEPTION 'Invalid status transition: published can only transition to archived, not %', NEW.status;
            END IF;

        WHEN 'archived' THEN
            -- archived is a terminal state
            RAISE EXCEPTION 'Invalid status transition: archived is a terminal state';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_course_status_transition
    BEFORE UPDATE OF status ON app.courses
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_course_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to search courses
CREATE OR REPLACE FUNCTION app.search_courses(
    p_tenant_id uuid,
    p_search_term text DEFAULT NULL,
    p_category varchar(100) DEFAULT NULL,
    p_skill_level app.skill_level DEFAULT NULL,
    p_status app.course_status DEFAULT 'published',
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    code varchar(50),
    name varchar(255),
    description text,
    category varchar(100),
    skill_level app.skill_level,
    estimated_duration_minutes integer,
    credits numeric(5,2),
    provider varchar(255),
    status app.course_status,
    thumbnail_url text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.code,
        c.name,
        c.description,
        c.category,
        c.skill_level,
        c.estimated_duration_minutes,
        c.credits,
        c.provider,
        c.status,
        c.thumbnail_url,
        c.created_at
    FROM app.courses c
    WHERE c.tenant_id = p_tenant_id
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_category IS NULL OR c.category = p_category)
      AND (p_skill_level IS NULL OR c.skill_level = p_skill_level)
      AND (
          p_search_term IS NULL
          OR to_tsvector('english', COALESCE(c.name, '') || ' ' || COALESCE(c.description, ''))
             @@ plainto_tsquery('english', p_search_term)
      )
    ORDER BY c.name ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to get course statistics
CREATE OR REPLACE FUNCTION app.get_course_statistics(
    p_course_id uuid
)
RETURNS TABLE (
    total_assignments bigint,
    completed_count bigint,
    in_progress_count bigint,
    not_started_count bigint,
    failed_count bigint,
    average_completion_time_minutes numeric,
    average_score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::bigint AS total_assignments,
        COUNT(*) FILTER (WHERE a.status = 'completed')::bigint AS completed_count,
        COUNT(*) FILTER (WHERE a.status = 'in_progress')::bigint AS in_progress_count,
        COUNT(*) FILTER (WHERE a.status = 'not_started')::bigint AS not_started_count,
        COUNT(*) FILTER (WHERE a.status = 'failed')::bigint AS failed_count,
        ROUND(AVG(
            EXTRACT(EPOCH FROM (a.completed_at - a.started_at)) / 60
        ) FILTER (WHERE a.completed_at IS NOT NULL), 2) AS average_completion_time_minutes,
        ROUND(AVG(a.score) FILTER (WHERE a.score IS NOT NULL), 2) AS average_score
    FROM app.assignments a
    WHERE a.course_id = p_course_id;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.courses IS 'Master course definitions. Actual content is in course_versions.';
COMMENT ON COLUMN app.courses.id IS 'Primary UUID identifier for the course';
COMMENT ON COLUMN app.courses.tenant_id IS 'Tenant that owns this course';
COMMENT ON COLUMN app.courses.code IS 'Unique course code within tenant';
COMMENT ON COLUMN app.courses.name IS 'Human-readable course name';
COMMENT ON COLUMN app.courses.description IS 'Course description and overview';
COMMENT ON COLUMN app.courses.category IS 'Course category for filtering';
COMMENT ON COLUMN app.courses.tags IS 'Tags for search and filtering';
COMMENT ON COLUMN app.courses.skill_level IS 'Course difficulty level';
COMMENT ON COLUMN app.courses.estimated_duration_minutes IS 'Estimated time to complete';
COMMENT ON COLUMN app.courses.credits IS 'Learning credits awarded on completion';
COMMENT ON COLUMN app.courses.provider IS 'External course provider name';
COMMENT ON COLUMN app.courses.external_course_id IS 'External provider course ID';
COMMENT ON COLUMN app.courses.external_url IS 'URL to external course';
COMMENT ON COLUMN app.courses.settings IS 'Course settings (passing score, attempts, etc.)';
COMMENT ON COLUMN app.courses.status IS 'Current course status';
COMMENT ON COLUMN app.courses.thumbnail_url IS 'Course thumbnail/cover image URL';
COMMENT ON COLUMN app.courses.created_by IS 'User who created this course';
COMMENT ON FUNCTION app.validate_course_status_transition IS 'Enforces valid course status transitions';
COMMENT ON FUNCTION app.search_courses IS 'Search and filter courses with full-text search';
COMMENT ON FUNCTION app.get_course_statistics IS 'Returns completion statistics for a course';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_course_statistics(uuid);
-- DROP FUNCTION IF EXISTS app.search_courses(uuid, text, varchar, app.skill_level, app.course_status, integer, integer);
-- DROP TRIGGER IF EXISTS validate_course_status_transition ON app.courses;
-- DROP FUNCTION IF EXISTS app.validate_course_status_transition();
-- DROP TRIGGER IF EXISTS update_courses_updated_at ON app.courses;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.courses;
-- DROP POLICY IF EXISTS tenant_isolation ON app.courses;
-- DROP INDEX IF EXISTS app.idx_courses_search;
-- DROP INDEX IF EXISTS app.idx_courses_tags;
-- DROP INDEX IF EXISTS app.idx_courses_tenant_provider;
-- DROP INDEX IF EXISTS app.idx_courses_tenant_skill_level;
-- DROP INDEX IF EXISTS app.idx_courses_tenant_category;
-- DROP INDEX IF EXISTS app.idx_courses_tenant_published;
-- DROP INDEX IF EXISTS app.idx_courses_tenant_status;
-- DROP INDEX IF EXISTS app.idx_courses_tenant_code;
-- DROP TABLE IF EXISTS app.courses;
