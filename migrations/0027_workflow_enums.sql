-- Migration: 0027_workflow_enums
-- Created: 2026-01-07
-- Description: Create workflow-specific enum types for the Workflow module
--              These enums define valid values for workflow status, instance status,
--              task status, action types, trigger types, and escalation actions.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Workflow Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of a workflow definition version
-- State transitions:
--   draft -> active (published)
--   active -> archived (deprecated)
--   draft -> archived (never published, deprecated)
-- Note: Only one version per definition can be active at a time
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_status') THEN
        CREATE TYPE app.workflow_status AS ENUM (
            'draft',        -- Being edited, not yet published
            'active',       -- Published and in use
            'archived'      -- No longer in use, kept for history
        );
    END IF;
END $$;

COMMENT ON TYPE app.workflow_status IS 'Workflow definition version status. State machine: draft->active->archived';

-- -----------------------------------------------------------------------------
-- Workflow Instance Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of a running workflow instance
-- State transitions:
--   pending -> in_progress (first task started)
--   in_progress -> completed (all tasks done successfully)
--   in_progress -> cancelled (manually cancelled)
--   in_progress -> failed (error occurred)
--   pending -> cancelled (cancelled before starting)
-- Note: completed, cancelled, failed are terminal states
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_instance_status') THEN
        CREATE TYPE app.workflow_instance_status AS ENUM (
            'pending',      -- Workflow created but not yet started
            'in_progress',  -- Workflow is actively running
            'completed',    -- Workflow finished successfully
            'cancelled',    -- Workflow was manually cancelled
            'failed'        -- Workflow failed due to an error
        );
    END IF;
END $$;

COMMENT ON TYPE app.workflow_instance_status IS 'Workflow instance status. Terminal states: completed, cancelled, failed';

-- -----------------------------------------------------------------------------
-- Workflow Task Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of an individual workflow task
-- State transitions:
--   pending -> assigned (user/role assigned)
--   assigned -> in_progress (user started working)
--   in_progress -> completed (task finished)
--   in_progress -> skipped (conditions not met or bypassed)
--   in_progress -> escalated (SLA breached, escalated)
--   pending -> skipped (auto-skipped by conditions)
--   pending -> cancelled (workflow cancelled)
--   assigned -> cancelled (workflow cancelled)
--   in_progress -> cancelled (workflow cancelled)
--   escalated -> completed (completed after escalation)
--   escalated -> cancelled (workflow cancelled)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_task_status') THEN
        CREATE TYPE app.workflow_task_status AS ENUM (
            'pending',      -- Task created, waiting for assignment
            'assigned',     -- Task assigned to user/role
            'in_progress',  -- Task is being worked on
            'completed',    -- Task finished successfully
            'skipped',      -- Task was skipped (conditions or bypass)
            'escalated',    -- Task escalated due to SLA breach
            'cancelled'     -- Task cancelled (workflow cancelled)
        );
    END IF;
END $$;

COMMENT ON TYPE app.workflow_task_status IS 'Workflow task status. State machine allows escalation and skip paths';

-- -----------------------------------------------------------------------------
-- Workflow Action Type Enum
-- -----------------------------------------------------------------------------
-- Defines the types of actions a user can take on a workflow task
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_action_type') THEN
        CREATE TYPE app.workflow_action_type AS ENUM (
            'approve',      -- Approve the request/item
            'reject',       -- Reject the request/item
            'request_info', -- Request additional information
            'delegate',     -- Delegate task to another user
            'escalate',     -- Manually escalate to higher authority
            'complete'      -- Generic completion (non-approval workflows)
        );
    END IF;
END $$;

COMMENT ON TYPE app.workflow_action_type IS 'Types of actions a user can take on a workflow task';

-- -----------------------------------------------------------------------------
-- Workflow Trigger Type Enum
-- -----------------------------------------------------------------------------
-- Defines how workflows can be initiated
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_trigger_type') THEN
        CREATE TYPE app.workflow_trigger_type AS ENUM (
            'manual',       -- Manually started by a user
            'event',        -- Triggered by a domain event (e.g., employee.created)
            'scheduled'     -- Triggered on a schedule (cron-like)
        );
    END IF;
END $$;

COMMENT ON TYPE app.workflow_trigger_type IS 'How workflows can be triggered: manual, event-driven, or scheduled';

-- -----------------------------------------------------------------------------
-- Escalation Action Enum
-- -----------------------------------------------------------------------------
-- Defines the actions taken when an SLA is breached
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'escalation_action') THEN
        CREATE TYPE app.escalation_action AS ENUM (
            'notify',       -- Send notification to escalation target
            'reassign',     -- Reassign task to escalation target
            'auto_approve', -- Automatically approve the task
            'auto_reject'   -- Automatically reject the task
        );
    END IF;
END $$;

COMMENT ON TYPE app.escalation_action IS 'Actions taken when SLA is breached: notify, reassign, or auto-complete';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- Note: Dropping enum types will fail if they are in use by columns
-- Must drop dependent columns/tables first

-- DROP TYPE IF EXISTS app.escalation_action;
-- DROP TYPE IF EXISTS app.workflow_trigger_type;
-- DROP TYPE IF EXISTS app.workflow_action_type;
-- DROP TYPE IF EXISTS app.workflow_task_status;
-- DROP TYPE IF EXISTS app.workflow_instance_status;
-- DROP TYPE IF EXISTS app.workflow_status;
