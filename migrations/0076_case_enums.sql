-- Migration: 0076_case_enums
-- Created: 2026-01-07
-- Description: Create Case Management enum types
--              These enums define valid values for case status, priority,
--              case types, and escalation levels for the HR service desk module.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Case Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of a case
-- State transitions:
--   new -> open (case assigned/triaged)
--   open -> pending (awaiting information/action)
--   pending -> open (information received)
--   open -> resolved (issue resolved)
--   resolved -> closed (resolution accepted)
--   resolved -> open (reopened - resolution rejected)
--   Any state -> cancelled (case cancelled)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_status') THEN
        CREATE TYPE app.case_status AS ENUM (
            'new',        -- Newly created, not yet triaged
            'open',       -- Being actively worked on
            'pending',    -- Awaiting response/information
            'on_hold',    -- Temporarily on hold
            'resolved',   -- Issue resolved, pending closure
            'closed',     -- Case completed and closed
            'cancelled'   -- Case cancelled
        );
    END IF;
END $$;

COMMENT ON TYPE app.case_status IS 'Case lifecycle status. Flow: new->open->pending<->open->resolved->closed';

-- -----------------------------------------------------------------------------
-- Case Priority Enum
-- -----------------------------------------------------------------------------
-- Defines priority levels for cases
-- Used for SLA calculation and queue ordering
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_priority') THEN
        CREATE TYPE app.case_priority AS ENUM (
            'low',       -- Low priority, standard SLA
            'medium',    -- Medium priority, normal SLA
            'high',      -- High priority, expedited SLA
            'critical'   -- Critical priority, immediate attention required
        );
    END IF;
END $$;

COMMENT ON TYPE app.case_priority IS 'Case priority levels (low, medium, high, critical)';

-- -----------------------------------------------------------------------------
-- Case Type Enum
-- -----------------------------------------------------------------------------
-- Defines the general type of case
-- Used for routing and categorization
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_type') THEN
        CREATE TYPE app.case_type AS ENUM (
            'inquiry',          -- General question or information request
            'request',          -- Service request (forms, documents, etc.)
            'issue',            -- Problem or issue to resolve
            'complaint',        -- Formal complaint
            'suggestion',       -- Suggestion or feedback
            'escalation'        -- Escalated from another case or channel
        );
    END IF;
END $$;

COMMENT ON TYPE app.case_type IS 'General type of HR case (inquiry, request, issue, complaint, suggestion, escalation)';

-- -----------------------------------------------------------------------------
-- Escalation Level Enum
-- -----------------------------------------------------------------------------
-- Defines escalation levels for cases
-- Higher levels indicate more senior involvement needed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'escalation_level') THEN
        CREATE TYPE app.escalation_level AS ENUM (
            'none',    -- No escalation
            'tier_1',  -- First-level escalation (team lead)
            'tier_2',  -- Second-level escalation (manager)
            'tier_3',  -- Third-level escalation (department head)
            'tier_4'   -- Fourth-level escalation (executive)
        );
    END IF;
END $$;

COMMENT ON TYPE app.escalation_level IS 'Case escalation levels (none through tier_4)';

-- -----------------------------------------------------------------------------
-- Case Source Enum
-- -----------------------------------------------------------------------------
-- Defines how the case was created
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_source') THEN
        CREATE TYPE app.case_source AS ENUM (
            'self_service',  -- Employee self-service portal
            'email',         -- Email to HR
            'phone',         -- Phone call
            'walk_in',       -- In-person visit
            'chat',          -- Chat/messaging system
            'manager',       -- Manager-submitted on behalf of employee
            'system',        -- System-generated case
            'integration'    -- External system integration
        );
    END IF;
END $$;

COMMENT ON TYPE app.case_source IS 'Source channel of case creation';

-- -----------------------------------------------------------------------------
-- Resolution Type Enum
-- -----------------------------------------------------------------------------
-- Defines how the case was resolved
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resolution_type') THEN
        CREATE TYPE app.resolution_type AS ENUM (
            'resolved',          -- Successfully resolved
            'workaround',        -- Workaround provided
            'no_action_needed',  -- No action was needed
            'duplicate',         -- Duplicate of another case
            'cannot_reproduce',  -- Could not reproduce the issue
            'not_applicable',    -- Case not applicable/invalid
            'cancelled'          -- Cancelled by requester
        );
    END IF;
END $$;

COMMENT ON TYPE app.resolution_type IS 'How the case was resolved';

-- -----------------------------------------------------------------------------
-- SLA Status Enum
-- -----------------------------------------------------------------------------
-- Defines SLA compliance status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sla_status') THEN
        CREATE TYPE app.sla_status AS ENUM (
            'within_sla',     -- Within SLA targets
            'warning',        -- Approaching SLA breach
            'breached',       -- SLA has been breached
            'paused',         -- SLA timer paused (pending)
            'not_applicable'  -- No SLA applies
        );
    END IF;
END $$;

COMMENT ON TYPE app.sla_status IS 'SLA compliance status for cases';

-- -----------------------------------------------------------------------------
-- Attachment Type Enum
-- -----------------------------------------------------------------------------
-- Defines types of case attachments
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attachment_type') THEN
        CREATE TYPE app.attachment_type AS ENUM (
            'document',    -- General document
            'image',       -- Image file
            'screenshot',  -- Screenshot
            'form',        -- Form submission
            'email',       -- Email correspondence
            'other'        -- Other attachment type
        );
    END IF;
END $$;

COMMENT ON TYPE app.attachment_type IS 'Type of case attachment (document, image, screenshot, form, email, other)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- Note: Dropping enum types will fail if they are in use by columns
-- Must drop dependent columns/tables first

-- DROP TYPE IF EXISTS app.attachment_type;
-- DROP TYPE IF EXISTS app.sla_status;
-- DROP TYPE IF EXISTS app.resolution_type;
-- DROP TYPE IF EXISTS app.case_source;
-- DROP TYPE IF EXISTS app.escalation_level;
-- DROP TYPE IF EXISTS app.case_type;
-- DROP TYPE IF EXISTS app.case_priority;
-- DROP TYPE IF EXISTS app.case_status;
