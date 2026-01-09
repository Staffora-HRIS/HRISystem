-- Migration: 0035_time_enums
-- Created: 2026-01-07
-- Description: Create Time & Attendance specific enum types
--              These enums define valid values for time events, devices,
--              timesheet status, schedule status, and shift swap status.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Time Event Type Enum
-- -----------------------------------------------------------------------------
-- Defines the types of time clock events
-- Event sequence per session: clock_in -> break_start -> break_end -> clock_out
-- shift_start/shift_end are for scheduled shift tracking (may differ from clock times)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'time_event_type') THEN
        CREATE TYPE app.time_event_type AS ENUM (
            'clock_in',     -- Employee clocking in to start work
            'clock_out',    -- Employee clocking out to end work
            'break_start',  -- Employee starting a break
            'break_end',    -- Employee ending a break
            'shift_start',  -- Scheduled shift start marker
            'shift_end'     -- Scheduled shift end marker
        );
    END IF;
END $$;

COMMENT ON TYPE app.time_event_type IS 'Types of time clock events. Sequence: clock_in -> break_start -> break_end -> clock_out';

-- -----------------------------------------------------------------------------
-- Device Type Enum
-- -----------------------------------------------------------------------------
-- Defines the types of devices/sources for time events
-- Used for audit trail and validation (different rules per device type)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'device_type') THEN
        CREATE TYPE app.device_type AS ENUM (
            'web',          -- Web browser (desktop/laptop)
            'mobile',       -- Mobile app (smartphone/tablet)
            'kiosk',        -- Shared kiosk terminal
            'biometric',    -- Biometric scanner (fingerprint, face)
            'nfc',          -- NFC badge/card reader
            'manual'        -- Manual entry by administrator
        );
    END IF;
END $$;

COMMENT ON TYPE app.device_type IS 'Source device types for time events (web, mobile, kiosk, biometric, NFC, manual)';

-- -----------------------------------------------------------------------------
-- Timesheet Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of a timesheet
-- State transitions:
--   draft -> submitted (employee submits for approval)
--   submitted -> approved (manager approves)
--   submitted -> rejected (manager rejects, returns to draft)
--   approved -> locked (payroll processed, cannot be modified)
-- Note: Once locked, timesheet cannot be modified (use adjustments instead)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'timesheet_status') THEN
        CREATE TYPE app.timesheet_status AS ENUM (
            'draft',        -- Being edited by employee
            'submitted',    -- Submitted for approval
            'approved',     -- Approved by manager
            'rejected',     -- Rejected, returned for corrections
            'locked'        -- Locked after payroll processing
        );
    END IF;
END $$;

COMMENT ON TYPE app.timesheet_status IS 'Timesheet lifecycle status. State machine: draft->submitted->approved->locked, or submitted->rejected->draft';

-- -----------------------------------------------------------------------------
-- Schedule Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of a work schedule
-- State transitions:
--   draft -> published (schedule made visible to employees)
--   published -> archived (schedule period ended)
--   draft -> archived (never published, deprecated)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_status') THEN
        CREATE TYPE app.schedule_status AS ENUM (
            'draft',        -- Being created, not yet visible to employees
            'published',    -- Published and visible to employees
            'archived'      -- Period ended, kept for historical reference
        );
    END IF;
END $$;

COMMENT ON TYPE app.schedule_status IS 'Work schedule lifecycle status. State machine: draft->published->archived';

-- -----------------------------------------------------------------------------
-- Shift Swap Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of a shift swap request
-- State transitions:
--   pending -> approved (manager approves swap)
--   pending -> rejected (manager rejects swap)
--   pending -> cancelled (requester cancels request)
--   approved -> cancelled (swap undone before effective date)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shift_swap_status') THEN
        CREATE TYPE app.shift_swap_status AS ENUM (
            'pending',      -- Awaiting approval
            'approved',     -- Swap approved by manager
            'rejected',     -- Swap rejected by manager
            'cancelled'     -- Request cancelled by requester
        );
    END IF;
END $$;

COMMENT ON TYPE app.shift_swap_status IS 'Shift swap request status. State machine: pending->approved/rejected/cancelled';

-- -----------------------------------------------------------------------------
-- Timesheet Approval Action Enum
-- -----------------------------------------------------------------------------
-- Defines the types of actions that can be taken on a timesheet
-- Used in timesheet_approvals table for immutable audit trail
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'timesheet_approval_action') THEN
        CREATE TYPE app.timesheet_approval_action AS ENUM (
            'submit',       -- Employee submits timesheet for approval
            'approve',      -- Manager approves timesheet
            'reject',       -- Manager rejects timesheet
            'lock',         -- System locks timesheet after payroll
            'unlock'        -- System unlocks for correction (rare, requires audit)
        );
    END IF;
END $$;

COMMENT ON TYPE app.timesheet_approval_action IS 'Actions taken on timesheets for audit trail';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- Note: Dropping enum types will fail if they are in use by columns
-- Must drop dependent columns/tables first

-- DROP TYPE IF EXISTS app.timesheet_approval_action;
-- DROP TYPE IF EXISTS app.shift_swap_status;
-- DROP TYPE IF EXISTS app.schedule_status;
-- DROP TYPE IF EXISTS app.timesheet_status;
-- DROP TYPE IF EXISTS app.device_type;
-- DROP TYPE IF EXISTS app.time_event_type;
