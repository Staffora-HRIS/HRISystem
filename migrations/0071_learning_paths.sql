-- Migration: 0071_learning_paths
-- Created: 2026-01-07
-- Description: Create the learning_paths table - curated learning path definitions
--              A learning path is a sequence of courses designed to achieve
--              a specific learning goal or certification

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Learning Paths Table
-- -----------------------------------------------------------------------------
-- Curated learning paths that group courses together
-- Courses within a path can be ordered and have dependencies
CREATE TABLE IF NOT EXISTS app.learning_paths (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this learning path
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Learning path identification
    code varchar(50) NOT NULL,
    name varchar(255) NOT NULL,
    description text,

    -- Categorization
    category varchar(100),
    tags jsonb NOT NULL DEFAULT '[]',

    -- Target skill level achieved after completion
    target_skill_level app.skill_level NOT NULL DEFAULT 'intermediate',

    -- Estimated total duration (calculated from courses)
    estimated_duration_minutes integer,

    -- Total credits (calculated from courses)
    total_credits numeric(6,2) DEFAULT 0,

    -- Path settings
    -- Structure: {
    --   "require_sequential_completion": true,
    --   "allow_partial_completion": false,
    --   "minimum_courses_required": null,
    --   "certificate_enabled": true,
    --   "expiration_days": 365
    -- }
    settings jsonb NOT NULL DEFAULT '{}',

    -- Current status
    status app.learning_path_status NOT NULL DEFAULT 'draft',

    -- Thumbnail/cover image URL
    thumbnail_url text,

    -- Target audience description
    target_audience text,

    -- Prerequisites (other path IDs or descriptions)
    prerequisites jsonb NOT NULL DEFAULT '[]',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Constraints
    -- Code must be unique within tenant
    CONSTRAINT learning_paths_code_unique UNIQUE (tenant_id, code),

    -- Duration must be positive
    CONSTRAINT learning_paths_duration_positive CHECK (
        estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0
    ),

    -- Credits must be non-negative
    CONSTRAINT learning_paths_credits_non_negative CHECK (
        total_credits IS NULL OR total_credits >= 0
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + code
CREATE INDEX IF NOT EXISTS idx_learning_paths_tenant_code
    ON app.learning_paths(tenant_id, code);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_learning_paths_tenant_status
    ON app.learning_paths(tenant_id, status);

-- Published paths (common query)
CREATE INDEX IF NOT EXISTS idx_learning_paths_tenant_published
    ON app.learning_paths(tenant_id)
    WHERE status = 'published';

-- Category filtering
CREATE INDEX IF NOT EXISTS idx_learning_paths_tenant_category
    ON app.learning_paths(tenant_id, category)
    WHERE category IS NOT NULL;

-- Target skill level filtering
CREATE INDEX IF NOT EXISTS idx_learning_paths_tenant_skill_level
    ON app.learning_paths(tenant_id, target_skill_level);

-- GIN index for tags queries
CREATE INDEX IF NOT EXISTS idx_learning_paths_tags
    ON app.learning_paths USING gin(tags);

-- Full-text search on name and description
CREATE INDEX IF NOT EXISTS idx_learning_paths_search
    ON app.learning_paths USING gin(
        to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, ''))
    );

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.learning_paths ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see learning paths for their current tenant
CREATE POLICY tenant_isolation ON app.learning_paths
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.learning_paths
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_learning_paths_updated_at
    BEFORE UPDATE ON app.learning_paths
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Function to validate learning path status transitions
CREATE OR REPLACE FUNCTION app.validate_learning_path_status_transition()
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

CREATE TRIGGER validate_learning_path_status_transition
    BEFORE UPDATE OF status ON app.learning_paths
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_learning_path_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to search learning paths
CREATE OR REPLACE FUNCTION app.search_learning_paths(
    p_tenant_id uuid,
    p_search_term text DEFAULT NULL,
    p_category varchar(100) DEFAULT NULL,
    p_skill_level app.skill_level DEFAULT NULL,
    p_status app.learning_path_status DEFAULT 'published',
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    code varchar(50),
    name varchar(255),
    description text,
    category varchar(100),
    target_skill_level app.skill_level,
    estimated_duration_minutes integer,
    total_credits numeric(6,2),
    status app.learning_path_status,
    thumbnail_url text,
    course_count bigint,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lp.id,
        lp.code,
        lp.name,
        lp.description,
        lp.category,
        lp.target_skill_level,
        lp.estimated_duration_minutes,
        lp.total_credits,
        lp.status,
        lp.thumbnail_url,
        (SELECT COUNT(*) FROM app.learning_path_courses lpc WHERE lpc.learning_path_id = lp.id) AS course_count,
        lp.created_at
    FROM app.learning_paths lp
    WHERE lp.tenant_id = p_tenant_id
      AND (p_status IS NULL OR lp.status = p_status)
      AND (p_category IS NULL OR lp.category = p_category)
      AND (p_skill_level IS NULL OR lp.target_skill_level = p_skill_level)
      AND (
          p_search_term IS NULL
          OR to_tsvector('english', COALESCE(lp.name, '') || ' ' || COALESCE(lp.description, ''))
             @@ plainto_tsquery('english', p_search_term)
      )
    ORDER BY lp.name ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to recalculate learning path totals from courses
CREATE OR REPLACE FUNCTION app.recalculate_learning_path_totals(
    p_learning_path_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_total_duration integer;
    v_total_credits numeric(6,2);
BEGIN
    -- Calculate totals from courses
    SELECT
        COALESCE(SUM(c.estimated_duration_minutes), 0),
        COALESCE(SUM(c.credits), 0)
    INTO v_total_duration, v_total_credits
    FROM app.learning_path_courses lpc
    JOIN app.courses c ON c.id = lpc.course_id
    WHERE lpc.learning_path_id = p_learning_path_id;

    -- Update the learning path
    UPDATE app.learning_paths
    SET estimated_duration_minutes = v_total_duration,
        total_credits = v_total_credits,
        updated_at = now()
    WHERE id = p_learning_path_id;

    RETURN true;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.learning_paths IS 'Curated learning paths that group courses for specific learning goals.';
COMMENT ON COLUMN app.learning_paths.id IS 'Primary UUID identifier for the learning path';
COMMENT ON COLUMN app.learning_paths.tenant_id IS 'Tenant that owns this learning path';
COMMENT ON COLUMN app.learning_paths.code IS 'Unique learning path code within tenant';
COMMENT ON COLUMN app.learning_paths.name IS 'Human-readable learning path name';
COMMENT ON COLUMN app.learning_paths.description IS 'Learning path description and overview';
COMMENT ON COLUMN app.learning_paths.category IS 'Category for filtering';
COMMENT ON COLUMN app.learning_paths.tags IS 'Tags for search and filtering';
COMMENT ON COLUMN app.learning_paths.target_skill_level IS 'Skill level achieved after completion';
COMMENT ON COLUMN app.learning_paths.estimated_duration_minutes IS 'Total duration (calculated from courses)';
COMMENT ON COLUMN app.learning_paths.total_credits IS 'Total credits (calculated from courses)';
COMMENT ON COLUMN app.learning_paths.settings IS 'Path settings (sequential, partial completion, etc.)';
COMMENT ON COLUMN app.learning_paths.status IS 'Current status';
COMMENT ON COLUMN app.learning_paths.thumbnail_url IS 'Cover image URL';
COMMENT ON COLUMN app.learning_paths.target_audience IS 'Description of target audience';
COMMENT ON COLUMN app.learning_paths.prerequisites IS 'Prerequisites for this path';
COMMENT ON COLUMN app.learning_paths.created_by IS 'User who created this path';
COMMENT ON FUNCTION app.validate_learning_path_status_transition IS 'Enforces valid status transitions';
COMMENT ON FUNCTION app.search_learning_paths IS 'Search and filter learning paths with full-text search';
COMMENT ON FUNCTION app.recalculate_learning_path_totals IS 'Recalculates duration and credits from courses';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.recalculate_learning_path_totals(uuid);
-- DROP FUNCTION IF EXISTS app.search_learning_paths(uuid, text, varchar, app.skill_level, app.learning_path_status, integer, integer);
-- DROP TRIGGER IF EXISTS validate_learning_path_status_transition ON app.learning_paths;
-- DROP FUNCTION IF EXISTS app.validate_learning_path_status_transition();
-- DROP TRIGGER IF EXISTS update_learning_paths_updated_at ON app.learning_paths;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.learning_paths;
-- DROP POLICY IF EXISTS tenant_isolation ON app.learning_paths;
-- DROP INDEX IF EXISTS app.idx_learning_paths_search;
-- DROP INDEX IF EXISTS app.idx_learning_paths_tags;
-- DROP INDEX IF EXISTS app.idx_learning_paths_tenant_skill_level;
-- DROP INDEX IF EXISTS app.idx_learning_paths_tenant_category;
-- DROP INDEX IF EXISTS app.idx_learning_paths_tenant_published;
-- DROP INDEX IF EXISTS app.idx_learning_paths_tenant_status;
-- DROP INDEX IF EXISTS app.idx_learning_paths_tenant_code;
-- DROP TABLE IF EXISTS app.learning_paths;
