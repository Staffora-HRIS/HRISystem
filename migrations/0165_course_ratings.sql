-- Migration: 0165_course_ratings
-- Created: 2026-03-14
-- Description: Course ratings and reviews for LMS courses

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Course Ratings Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.course_ratings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    course_id uuid NOT NULL,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text text,
    would_recommend boolean,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT course_ratings_unique_review UNIQUE (tenant_id, course_id, employee_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_course_ratings_tenant
    ON app.course_ratings(tenant_id);

CREATE INDEX IF NOT EXISTS idx_course_ratings_course
    ON app.course_ratings(tenant_id, course_id);

CREATE INDEX IF NOT EXISTS idx_course_ratings_employee
    ON app.course_ratings(tenant_id, employee_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.course_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.course_ratings
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.course_ratings
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Grant permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.course_ratings TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.course_ratings IS 'Employee ratings and reviews for completed LMS courses';
COMMENT ON COLUMN app.course_ratings.rating IS 'Rating from 1 (poor) to 5 (excellent)';
COMMENT ON COLUMN app.course_ratings.would_recommend IS 'Whether the employee would recommend this course';
COMMENT ON COLUMN app.course_ratings.completed_at IS 'When the employee completed the course';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TABLE IF EXISTS app.course_ratings;
