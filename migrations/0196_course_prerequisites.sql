-- Migration: 0196_course_prerequisites
-- Created: 2026-03-17
-- Description: Create the course_prerequisites table for learning path prerequisite
--              chain enforcement. When enrolling in a course, mandatory prerequisites
--              must be completed first. Optional prerequisites are recommended but
--              not enforced.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Course Prerequisites Table
-- -----------------------------------------------------------------------------
-- Defines prerequisite relationships between courses.
-- A course can have multiple prerequisites, each mandatory or optional.
CREATE TABLE IF NOT EXISTS app.course_prerequisites (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this prerequisite relationship
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The course that has the prerequisite
    course_id uuid NOT NULL REFERENCES app.courses(id) ON DELETE CASCADE,

    -- The prerequisite course that must be completed first
    prerequisite_course_id uuid NOT NULL REFERENCES app.courses(id) ON DELETE CASCADE,

    -- Whether this prerequisite is mandatory (true) or recommended (false)
    mandatory boolean NOT NULL DEFAULT true,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- A course cannot be a prerequisite of itself
    CONSTRAINT course_prerequisites_no_self_ref CHECK (
        course_id != prerequisite_course_id
    ),

    -- Each prerequisite relationship is unique per tenant
    CONSTRAINT course_prerequisites_unique UNIQUE (tenant_id, course_id, prerequisite_course_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Look up all prerequisites for a given course
CREATE INDEX IF NOT EXISTS idx_course_prerequisites_tenant_course
    ON app.course_prerequisites(tenant_id, course_id);

-- Reverse lookup: find courses that depend on a given prerequisite
CREATE INDEX IF NOT EXISTS idx_course_prerequisites_tenant_prereq
    ON app.course_prerequisites(tenant_id, prerequisite_course_id);

-- Mandatory prerequisites only (common filter for enrollment validation)
CREATE INDEX IF NOT EXISTS idx_course_prerequisites_mandatory
    ON app.course_prerequisites(tenant_id, course_id)
    WHERE mandatory = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.course_prerequisites ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see prerequisites for their current tenant
CREATE POLICY tenant_isolation ON app.course_prerequisites
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.course_prerequisites
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to detect circular prerequisite chains.
-- Returns true if adding prerequisite_course_id as a prerequisite to course_id
-- would create a cycle.
CREATE OR REPLACE FUNCTION app.has_circular_prerequisite(
    p_tenant_id uuid,
    p_course_id uuid,
    p_prerequisite_course_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Use a recursive CTE to walk the prerequisite chain from
    -- p_prerequisite_course_id upward. If we ever reach p_course_id,
    -- adding the edge would create a cycle.
    RETURN EXISTS (
        WITH RECURSIVE chain AS (
            -- Start from the courses that prerequisite_course_id itself depends on
            SELECT cp.prerequisite_course_id AS cid, 1 AS depth
            FROM app.course_prerequisites cp
            WHERE cp.course_id = p_prerequisite_course_id
              AND cp.tenant_id = p_tenant_id

            UNION ALL

            SELECT cp.prerequisite_course_id, chain.depth + 1
            FROM app.course_prerequisites cp
            JOIN chain ON chain.cid = cp.course_id
            WHERE cp.tenant_id = p_tenant_id
              AND chain.depth < 20  -- safety limit to avoid runaway recursion
        )
        SELECT 1 FROM chain WHERE chain.cid = p_course_id
    );
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.course_prerequisites IS 'Defines prerequisite relationships between courses. Mandatory prerequisites block enrollment; optional ones are recommendations.';
COMMENT ON COLUMN app.course_prerequisites.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.course_prerequisites.tenant_id IS 'Tenant that owns this prerequisite relationship';
COMMENT ON COLUMN app.course_prerequisites.course_id IS 'The course that has the prerequisite requirement';
COMMENT ON COLUMN app.course_prerequisites.prerequisite_course_id IS 'The prerequisite course that must/should be completed first';
COMMENT ON COLUMN app.course_prerequisites.mandatory IS 'If true, the prerequisite must be completed before enrollment. If false, it is a recommendation.';
COMMENT ON COLUMN app.course_prerequisites.created_at IS 'When this prerequisite relationship was created';
COMMENT ON FUNCTION app.has_circular_prerequisite IS 'Detects whether adding a prerequisite would create a circular dependency chain';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.has_circular_prerequisite(uuid, uuid, uuid);
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.course_prerequisites;
-- DROP POLICY IF EXISTS tenant_isolation ON app.course_prerequisites;
-- DROP INDEX IF EXISTS app.idx_course_prerequisites_mandatory;
-- DROP INDEX IF EXISTS app.idx_course_prerequisites_tenant_prereq;
-- DROP INDEX IF EXISTS app.idx_course_prerequisites_tenant_course;
-- DROP TABLE IF EXISTS app.course_prerequisites;
