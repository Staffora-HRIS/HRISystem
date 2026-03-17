-- Migration: 0194_mandatory_training_compliance
-- Created: 2026-03-17
-- Description: Add is_mandatory flag to courses table and create index
--              for mandatory training compliance reporting.
--              Courses flagged as mandatory are required for all assigned
--              employees and will appear in compliance reports.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Add is_mandatory column to courses
-- Default false preserves existing behaviour for current courses
ALTER TABLE app.courses
    ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT false;

-- Add mandatory_due_days column — default number of days from assignment
-- to complete the course when it is mandatory (NULL = no default deadline)
ALTER TABLE app.courses
    ADD COLUMN IF NOT EXISTS mandatory_due_days integer;

-- Constraint: mandatory_due_days must be positive if set
ALTER TABLE app.courses
    ADD CONSTRAINT courses_mandatory_due_days_positive CHECK (
        mandatory_due_days IS NULL OR mandatory_due_days > 0
    );

-- Index for quickly finding mandatory courses per tenant
CREATE INDEX IF NOT EXISTS idx_courses_tenant_mandatory
    ON app.courses(tenant_id)
    WHERE is_mandatory = true;

-- Index for compliance reporting: mandatory required assignments not completed
-- Used by the compliance report to count overdue mandatory assignments
CREATE INDEX IF NOT EXISTS idx_assignments_mandatory_compliance
    ON app.assignments(tenant_id, course_id, status, due_date)
    WHERE assignment_type = 'required';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON COLUMN app.courses.is_mandatory IS 'Whether this course is mandatory for compliance purposes. Mandatory courses appear in compliance reports.';
COMMENT ON COLUMN app.courses.mandatory_due_days IS 'Default number of days from assignment to complete a mandatory course. NULL means no default deadline.';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_assignments_mandatory_compliance;
-- DROP INDEX IF EXISTS app.idx_courses_tenant_mandatory;
-- ALTER TABLE app.courses DROP CONSTRAINT IF EXISTS courses_mandatory_due_days_positive;
-- ALTER TABLE app.courses DROP COLUMN IF EXISTS mandatory_due_days;
-- ALTER TABLE app.courses DROP COLUMN IF EXISTS is_mandatory;
