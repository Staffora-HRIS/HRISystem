-- Migration: 0056_talent_enums
-- Created: 2026-01-07
-- Description: Create Talent Management enum types for Recruitment and Performance modules
--              These enums define valid values for requisition status, candidate stages,
--              offer status, performance cycles, goals, and reviews.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Requisition Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of a job requisition
-- State transitions:
--   draft -> open (approved and active)
--   open -> on_hold (temporarily paused)
--   on_hold -> open (resumed)
--   open -> filled (all positions filled)
--   open/on_hold/draft -> cancelled (no longer needed)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requisition_status') THEN
        CREATE TYPE app.requisition_status AS ENUM (
            'draft',      -- Being created, not yet approved
            'open',       -- Approved and actively recruiting
            'on_hold',    -- Temporarily paused (budget freeze, re-org, etc.)
            'filled',     -- All openings have been filled
            'cancelled'   -- No longer needed, permanently closed
        );
    END IF;
END $$;

COMMENT ON TYPE app.requisition_status IS 'Job requisition lifecycle status. State machine: draft->open->on_hold<->open->filled/cancelled';

-- -----------------------------------------------------------------------------
-- Candidate Stage Enum
-- -----------------------------------------------------------------------------
-- Defines the stages a candidate goes through in the hiring pipeline
-- State transitions are generally forward but can have exceptions:
--   applied -> screening (initial review)
--   screening -> interview (passed screening)
--   interview -> offer (selected for offer)
--   offer -> hired (accepted and onboarded)
--   Any stage -> rejected (not selected)
--   Any stage -> withdrawn (candidate withdrew)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_stage') THEN
        CREATE TYPE app.candidate_stage AS ENUM (
            'applied',    -- Initial application received
            'screening',  -- Resume/application screening
            'interview',  -- In interview process
            'offer',      -- Offer stage (pending, extended, negotiating)
            'hired',      -- Accepted and onboarding
            'rejected',   -- Not selected at any stage
            'withdrawn'   -- Candidate withdrew from process
        );
    END IF;
END $$;

COMMENT ON TYPE app.candidate_stage IS 'Candidate pipeline stage. Typical flow: applied->screening->interview->offer->hired';

-- -----------------------------------------------------------------------------
-- Offer Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle of a job offer
-- State transitions:
--   draft -> pending_approval (submitted for approval)
--   pending_approval -> approved (approval workflow complete)
--   approved -> extended (sent to candidate)
--   extended -> accepted (candidate accepted)
--   extended -> rejected (candidate declined)
--   extended -> expired (deadline passed without response)
--   Any non-terminal -> cancelled (offer withdrawn)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offer_status') THEN
        CREATE TYPE app.offer_status AS ENUM (
            'draft',            -- Being prepared
            'pending_approval', -- Submitted for internal approval
            'approved',         -- Approved, ready to extend
            'extended',         -- Sent to candidate
            'accepted',         -- Candidate accepted
            'rejected',         -- Candidate declined
            'expired',          -- Offer expired without response
            'cancelled'         -- Offer withdrawn by company
        );
    END IF;
END $$;

COMMENT ON TYPE app.offer_status IS 'Job offer lifecycle status. Flow: draft->pending_approval->approved->extended->accepted/rejected/expired';

-- -----------------------------------------------------------------------------
-- Performance Cycle Status Enum
-- -----------------------------------------------------------------------------
-- Defines the phases of a performance review cycle
-- State transitions:
--   draft -> active (cycle launched)
--   active -> review (review period started)
--   review -> calibration (calibration sessions)
--   calibration -> closed (cycle completed)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'performance_cycle_status') THEN
        CREATE TYPE app.performance_cycle_status AS ENUM (
            'draft',       -- Being configured
            'active',      -- Goal setting and execution phase
            'review',      -- Review submission phase
            'calibration', -- Manager calibration sessions
            'closed'       -- Cycle completed and finalized
        );
    END IF;
END $$;

COMMENT ON TYPE app.performance_cycle_status IS 'Performance cycle phases. Flow: draft->active->review->calibration->closed';

-- -----------------------------------------------------------------------------
-- Goal Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle of employee goals/OKRs
-- State transitions:
--   draft -> active (goal approved/confirmed)
--   active -> completed (goal achieved)
--   active/draft -> cancelled (goal no longer relevant)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'goal_status') THEN
        CREATE TYPE app.goal_status AS ENUM (
            'draft',      -- Being created/edited
            'active',     -- In progress, being tracked
            'completed',  -- Goal achieved
            'cancelled'   -- Goal cancelled (re-org, priority change)
        );
    END IF;
END $$;

COMMENT ON TYPE app.goal_status IS 'Goal/OKR lifecycle status. Flow: draft->active->completed/cancelled';

-- -----------------------------------------------------------------------------
-- Review Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle of individual performance reviews
-- State transitions:
--   not_started -> in_progress (review started)
--   in_progress -> submitted (review completed and submitted)
--   submitted -> acknowledged (reviewee acknowledged receipt)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_status') THEN
        CREATE TYPE app.review_status AS ENUM (
            'not_started',  -- Review not yet started
            'in_progress',  -- Being written
            'submitted',    -- Submitted by reviewer
            'acknowledged'  -- Acknowledged by reviewee
        );
    END IF;
END $$;

COMMENT ON TYPE app.review_status IS 'Performance review submission status. Flow: not_started->in_progress->submitted->acknowledged';

-- -----------------------------------------------------------------------------
-- Interview Type Enum
-- -----------------------------------------------------------------------------
-- Types of interviews that can be scheduled
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_type') THEN
        CREATE TYPE app.interview_type AS ENUM (
            'phone',      -- Phone screen
            'video',      -- Video call interview
            'onsite',     -- In-person interview
            'panel'       -- Panel interview with multiple interviewers
        );
    END IF;
END $$;

COMMENT ON TYPE app.interview_type IS 'Type of interview format (phone, video, onsite, panel)';

-- -----------------------------------------------------------------------------
-- Interview Status Enum
-- -----------------------------------------------------------------------------
-- Status of a scheduled interview
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_status') THEN
        CREATE TYPE app.interview_status AS ENUM (
            'scheduled',  -- Interview is scheduled
            'completed',  -- Interview took place
            'cancelled',  -- Interview was cancelled
            'no_show'     -- Candidate did not show up
        );
    END IF;
END $$;

COMMENT ON TYPE app.interview_status IS 'Scheduled interview status';

-- -----------------------------------------------------------------------------
-- Recommendation Enum
-- -----------------------------------------------------------------------------
-- Interview feedback recommendations
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recommendation') THEN
        CREATE TYPE app.recommendation AS ENUM (
            'strong_hire',   -- Strongly recommend hiring
            'hire',          -- Recommend hiring
            'no_hire',       -- Do not recommend hiring
            'strong_no_hire' -- Strongly do not recommend
        );
    END IF;
END $$;

COMMENT ON TYPE app.recommendation IS 'Interviewer hiring recommendation';

-- -----------------------------------------------------------------------------
-- Reviewer Type Enum
-- -----------------------------------------------------------------------------
-- Types of reviewers in performance reviews
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reviewer_type') THEN
        CREATE TYPE app.reviewer_type AS ENUM (
            'self',       -- Self-assessment
            'manager',    -- Direct manager review
            'peer',       -- Peer feedback
            'skip_level'  -- Skip-level manager review
        );
    END IF;
END $$;

COMMENT ON TYPE app.reviewer_type IS 'Type of reviewer in performance review (self, manager, peer, skip_level)';

-- -----------------------------------------------------------------------------
-- Feedback Type Enum
-- -----------------------------------------------------------------------------
-- Types of continuous feedback
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_type') THEN
        CREATE TYPE app.feedback_type AS ENUM (
            'recognition',  -- Positive recognition/kudos
            'constructive', -- Constructive feedback
            'request'       -- Feedback request
        );
    END IF;
END $$;

COMMENT ON TYPE app.feedback_type IS 'Type of continuous feedback (recognition, constructive, request)';

-- -----------------------------------------------------------------------------
-- Development Plan Status Enum
-- -----------------------------------------------------------------------------
-- Lifecycle of development/growth plans
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'development_plan_status') THEN
        CREATE TYPE app.development_plan_status AS ENUM (
            'draft',      -- Being created
            'active',     -- In progress
            'completed',  -- Successfully completed
            'cancelled'   -- No longer pursuing
        );
    END IF;
END $$;

COMMENT ON TYPE app.development_plan_status IS 'Development plan lifecycle status';

-- -----------------------------------------------------------------------------
-- Performance Cycle Type Enum
-- -----------------------------------------------------------------------------
-- Frequency of performance cycles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'performance_cycle_type') THEN
        CREATE TYPE app.performance_cycle_type AS ENUM (
            'annual',      -- Once per year
            'semi_annual', -- Twice per year
            'quarterly'    -- Four times per year
        );
    END IF;
END $$;

COMMENT ON TYPE app.performance_cycle_type IS 'Performance cycle frequency (annual, semi_annual, quarterly)';

-- =============================================================================
-- Comments
-- =============================================================================

-- Note: Comments on enum types are created above with each type definition

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- Note: Dropping enum types will fail if they are in use by columns
-- Must drop dependent columns/tables first

-- DROP TYPE IF EXISTS app.performance_cycle_type;
-- DROP TYPE IF EXISTS app.development_plan_status;
-- DROP TYPE IF EXISTS app.feedback_type;
-- DROP TYPE IF EXISTS app.reviewer_type;
-- DROP TYPE IF EXISTS app.recommendation;
-- DROP TYPE IF EXISTS app.interview_status;
-- DROP TYPE IF EXISTS app.interview_type;
-- DROP TYPE IF EXISTS app.review_status;
-- DROP TYPE IF EXISTS app.goal_status;
-- DROP TYPE IF EXISTS app.performance_cycle_status;
-- DROP TYPE IF EXISTS app.offer_status;
-- DROP TYPE IF EXISTS app.candidate_stage;
-- DROP TYPE IF EXISTS app.requisition_status;
