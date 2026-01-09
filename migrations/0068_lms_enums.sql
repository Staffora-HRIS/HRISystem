-- Migration: 0068_lms_enums
-- Created: 2026-01-07
-- Description: Create LMS (Learning Management System) enum types
--              These enums define valid values for course status, completion status,
--              skill levels, and assignment types for the learning module.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Course Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of a course
-- State transitions:
--   draft -> published (course made available)
--   published -> archived (course no longer available for new assignments)
--   draft -> archived (never published, deprecated)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'course_status') THEN
        CREATE TYPE app.course_status AS ENUM (
            'draft',      -- Being created, not available for assignment
            'published',  -- Available for assignment and enrollment
            'archived'    -- No longer available for new assignments, historical
        );
    END IF;
END $$;

COMMENT ON TYPE app.course_status IS 'Course lifecycle status. State machine: draft->published->archived';

-- -----------------------------------------------------------------------------
-- Completion Status Enum
-- -----------------------------------------------------------------------------
-- Defines the completion states of a course assignment
-- State transitions:
--   not_started -> in_progress (learner began the course)
--   in_progress -> completed (learner finished all requirements)
--   in_progress -> failed (did not meet passing criteria)
--   Any non-terminal -> expired (deadline passed without completion)
--   completed -> (terminal state)
--   failed -> in_progress (retake allowed)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'completion_status') THEN
        CREATE TYPE app.completion_status AS ENUM (
            'not_started',  -- Assigned but not yet begun
            'in_progress',  -- Currently working through content
            'completed',    -- Successfully finished all requirements
            'failed',       -- Did not meet passing criteria
            'expired'       -- Deadline passed without completion
        );
    END IF;
END $$;

COMMENT ON TYPE app.completion_status IS 'Learning assignment completion status. Flow: not_started->in_progress->completed/failed/expired';

-- -----------------------------------------------------------------------------
-- Skill Level Enum
-- -----------------------------------------------------------------------------
-- Defines proficiency levels for skills and courses
-- Used for course difficulty and skill assessments
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_level') THEN
        CREATE TYPE app.skill_level AS ENUM (
            'beginner',      -- Entry level, no prior knowledge required
            'intermediate',  -- Some experience required
            'advanced',      -- Significant experience required
            'expert'         -- Mastery level
        );
    END IF;
END $$;

COMMENT ON TYPE app.skill_level IS 'Skill/course proficiency level (beginner, intermediate, advanced, expert)';

-- -----------------------------------------------------------------------------
-- Assignment Type Enum
-- -----------------------------------------------------------------------------
-- Defines how courses/learning paths are assigned
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_type') THEN
        CREATE TYPE app.assignment_type AS ENUM (
            'required',     -- Mandatory completion
            'recommended',  -- Suggested but optional
            'elective',     -- Optional, counts toward learning goals
            'remedial'      -- Assigned to address skill gaps
        );
    END IF;
END $$;

COMMENT ON TYPE app.assignment_type IS 'Learning assignment type (required, recommended, elective, remedial)';

-- -----------------------------------------------------------------------------
-- Content Type Enum
-- -----------------------------------------------------------------------------
-- Defines the type of learning content
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_type') THEN
        CREATE TYPE app.content_type AS ENUM (
            'video',          -- Video-based content
            'document',       -- PDF, Word, etc.
            'scorm',          -- SCORM package
            'interactive',    -- Interactive modules
            'assessment',     -- Quiz or test
            'external_link',  -- External URL
            'live_session'    -- Instructor-led session
        );
    END IF;
END $$;

COMMENT ON TYPE app.content_type IS 'Type of learning content (video, document, scorm, interactive, assessment, etc.)';

-- -----------------------------------------------------------------------------
-- Learning Path Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of a learning path
-- State transitions are same as course_status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'learning_path_status') THEN
        CREATE TYPE app.learning_path_status AS ENUM (
            'draft',      -- Being created, not available
            'published',  -- Available for assignment
            'archived'    -- No longer available for new assignments
        );
    END IF;
END $$;

COMMENT ON TYPE app.learning_path_status IS 'Learning path lifecycle status. State machine: draft->published->archived';

-- -----------------------------------------------------------------------------
-- Certificate Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of a certificate
-- State transitions:
--   active -> expired (expiration date passed)
--   active -> revoked (manually revoked)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'certificate_status') THEN
        CREATE TYPE app.certificate_status AS ENUM (
            'active',   -- Valid certificate
            'expired',  -- Certificate validity period ended
            'revoked'   -- Certificate manually revoked
        );
    END IF;
END $$;

COMMENT ON TYPE app.certificate_status IS 'Certificate lifecycle status. State machine: active->expired/revoked';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- Note: Dropping enum types will fail if they are in use by columns
-- Must drop dependent columns/tables first

-- DROP TYPE IF EXISTS app.certificate_status;
-- DROP TYPE IF EXISTS app.learning_path_status;
-- DROP TYPE IF EXISTS app.content_type;
-- DROP TYPE IF EXISTS app.assignment_type;
-- DROP TYPE IF EXISTS app.skill_level;
-- DROP TYPE IF EXISTS app.completion_status;
-- DROP TYPE IF EXISTS app.course_status;
