-- Migration: 0081_onboarding_enums
-- Created: 2026-01-07
-- Description: Create Onboarding Module enum types
--              These enums define valid values for template status, task status,
--              and task types for the employee onboarding process.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Template Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of an onboarding template
-- State transitions:
--   draft -> active (template published)
--   active -> archived (template deprecated)
--   draft -> archived (never published)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'template_status') THEN
        CREATE TYPE app.template_status AS ENUM (
            'draft',      -- Being created, not available for use
            'active',     -- Available for assigning to new employees
            'archived'    -- No longer available for new assignments
        );
    END IF;
END $$;

COMMENT ON TYPE app.template_status IS 'Onboarding template lifecycle status. State machine: draft->active->archived';

-- -----------------------------------------------------------------------------
-- Onboarding Task Status Enum
-- -----------------------------------------------------------------------------
-- Defines the completion states of onboarding tasks
-- State transitions:
--   pending -> in_progress (task started)
--   in_progress -> completed (task finished)
--   pending/in_progress -> skipped (task not applicable)
--   pending/in_progress -> blocked (dependency not met)
--   blocked -> pending (dependency resolved)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboarding_task_status') THEN
        CREATE TYPE app.onboarding_task_status AS ENUM (
            'pending',      -- Not yet started
            'in_progress',  -- Currently being worked on
            'completed',    -- Successfully completed
            'skipped',      -- Skipped (not applicable)
            'blocked'       -- Blocked by dependency or condition
        );
    END IF;
END $$;

COMMENT ON TYPE app.onboarding_task_status IS 'Onboarding task completion status';

-- -----------------------------------------------------------------------------
-- Task Type Enum
-- -----------------------------------------------------------------------------
-- Defines the type of onboarding task
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboarding_task_type') THEN
        CREATE TYPE app.onboarding_task_type AS ENUM (
            'form',           -- Form to fill out
            'document',       -- Document to sign/review
            'training',       -- Training/course to complete
            'meeting',        -- Meeting to attend
            'equipment',      -- Equipment to receive/setup
            'access',         -- System access to obtain
            'verification',   -- Verification/background check
            'acknowledgment', -- Policy acknowledgment
            'custom'          -- Custom task type
        );
    END IF;
END $$;

COMMENT ON TYPE app.onboarding_task_type IS 'Type of onboarding task (form, document, training, meeting, etc.)';

-- -----------------------------------------------------------------------------
-- Task Owner Type Enum
-- -----------------------------------------------------------------------------
-- Defines who is responsible for completing the task
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_owner_type') THEN
        CREATE TYPE app.task_owner_type AS ENUM (
            'new_hire',     -- The new employee
            'manager',      -- The employee's manager
            'hr',           -- HR department
            'it',           -- IT department
            'facilities',   -- Facilities/office management
            'buddy',        -- Assigned buddy/mentor
            'custom'        -- Custom assignee
        );
    END IF;
END $$;

COMMENT ON TYPE app.task_owner_type IS 'Who is responsible for completing the onboarding task';

-- -----------------------------------------------------------------------------
-- Onboarding Instance Status Enum
-- -----------------------------------------------------------------------------
-- Defines the overall status of an employee's onboarding process
-- State transitions:
--   not_started -> in_progress (first task started)
--   in_progress -> completed (all tasks complete)
--   in_progress -> cancelled (onboarding cancelled)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboarding_instance_status') THEN
        CREATE TYPE app.onboarding_instance_status AS ENUM (
            'not_started',  -- Onboarding not yet begun
            'in_progress',  -- Onboarding in progress
            'completed',    -- All tasks completed
            'cancelled'     -- Onboarding cancelled (employee didn't join, etc.)
        );
    END IF;
END $$;

COMMENT ON TYPE app.onboarding_instance_status IS 'Overall onboarding process status';

-- -----------------------------------------------------------------------------
-- Task Timing Type Enum
-- -----------------------------------------------------------------------------
-- Defines when the task should be available/due relative to start date
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_timing_type') THEN
        CREATE TYPE app.task_timing_type AS ENUM (
            'before_start',    -- Before employee start date (pre-boarding)
            'on_start',        -- On the start date
            'after_start',     -- After start date (first week, month, etc.)
            'milestone'        -- At a specific milestone
        );
    END IF;
END $$;

COMMENT ON TYPE app.task_timing_type IS 'When the task should be available relative to start date';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- Note: Dropping enum types will fail if they are in use by columns
-- Must drop dependent columns/tables first

-- DROP TYPE IF EXISTS app.task_timing_type;
-- DROP TYPE IF EXISTS app.onboarding_instance_status;
-- DROP TYPE IF EXISTS app.task_owner_type;
-- DROP TYPE IF EXISTS app.onboarding_task_type;
-- DROP TYPE IF EXISTS app.onboarding_task_status;
-- DROP TYPE IF EXISTS app.template_status;
