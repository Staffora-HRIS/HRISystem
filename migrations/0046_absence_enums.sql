-- Migration: 0046_absence_enums
-- Created: 2026-01-07
-- Description: Create enum types for the Absence Management module
--              These enums define valid values for leave types, request statuses,
--              accrual frequencies, balance transactions, and leave units.
--              All enums are created in the app schema for consistency.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leave Type Category Enum
-- -----------------------------------------------------------------------------
-- Categorizes leave types by their nature/purpose
-- Used for grouping, reporting, and applying category-specific business rules
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_type_category') THEN
        CREATE TYPE app.leave_type_category AS ENUM (
            'annual',       -- Annual/vacation leave (earned entitlement)
            'sick',         -- Sick leave (health-related absence)
            'personal',     -- Personal days (flexible use)
            'parental',     -- Parental leave (maternity, paternity, adoption)
            'bereavement',  -- Bereavement/compassionate leave (death in family)
            'jury_duty',    -- Jury duty/civic duty leave
            'military',     -- Military service leave
            'unpaid',       -- Unpaid leave of absence
            'other'         -- Other/miscellaneous leave types
        );
    END IF;
END $$;

COMMENT ON TYPE app.leave_type_category IS 'Categories of leave types: annual, sick, personal, parental, bereavement, jury_duty, military, unpaid, other';

-- -----------------------------------------------------------------------------
-- Leave Request Status Enum
-- -----------------------------------------------------------------------------
-- Tracks the lifecycle state of a leave request
-- State machine:
--   draft -> pending (submitted for approval)
--   pending -> approved (manager approved)
--   pending -> rejected (manager rejected)
--   draft/pending/approved -> cancelled (employee or admin cancelled)
--   pending -> expired (approval window expired, optional auto-transition)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_request_status') THEN
        CREATE TYPE app.leave_request_status AS ENUM (
            'draft',        -- Created but not yet submitted
            'pending',      -- Submitted, awaiting approval
            'approved',     -- Approved by approver(s)
            'rejected',     -- Rejected by approver(s)
            'cancelled',    -- Cancelled by employee or admin
            'expired'       -- Approval window expired (auto or manual)
        );
    END IF;
END $$;

COMMENT ON TYPE app.leave_request_status IS 'Leave request lifecycle status. State machine: draft->pending->approved/rejected/cancelled/expired';

-- -----------------------------------------------------------------------------
-- Accrual Frequency Enum
-- -----------------------------------------------------------------------------
-- Defines how often leave entitlements accrue
-- Different frequencies suit different policy structures:
--   monthly: Gradual accrual throughout the year
--   quarterly: Quarterly entitlement grants
--   yearly: Full entitlement granted at year start
--   hire_anniversary: Entitlement on employee's work anniversary
--   calendar_year: Entitlement on January 1st each year
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'accrual_frequency') THEN
        CREATE TYPE app.accrual_frequency AS ENUM (
            'monthly',          -- Accrues monthly (e.g., 1.67 days/month for 20 days/year)
            'quarterly',        -- Accrues quarterly (e.g., 5 days/quarter)
            'yearly',           -- Full entitlement granted at once
            'hire_anniversary', -- Accrues on employee's hire anniversary
            'calendar_year'     -- Accrues on January 1st of each year
        );
    END IF;
END $$;

COMMENT ON TYPE app.accrual_frequency IS 'Frequency of leave accrual: monthly, quarterly, yearly, hire_anniversary, calendar_year';

-- -----------------------------------------------------------------------------
-- Balance Transaction Type Enum
-- -----------------------------------------------------------------------------
-- Categorizes entries in the leave balance ledger
-- Every balance change must be recorded with one of these transaction types
-- This enables complete auditability and balance reconstruction at any point in time
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'balance_transaction_type') THEN
        CREATE TYPE app.balance_transaction_type AS ENUM (
            'accrual',      -- Regular accrual of entitlement (positive)
            'used',         -- Leave taken/consumed (negative)
            'adjustment',   -- Manual adjustment by HR/admin (positive or negative)
            'carryover',    -- Balance carried over from previous period (positive)
            'forfeited',    -- Balance forfeited due to expiry or policy (negative)
            'encashment'    -- Balance converted to cash payout (negative)
        );
    END IF;
END $$;

COMMENT ON TYPE app.balance_transaction_type IS 'Types of leave balance transactions: accrual, used, adjustment, carryover, forfeited, encashment';

-- -----------------------------------------------------------------------------
-- Leave Unit Enum
-- -----------------------------------------------------------------------------
-- Defines whether leave is tracked in days or hours
-- Hours-based tracking is common in flexible work environments
-- Some organizations may allow hourly leave for certain types (e.g., medical appointments)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_unit') THEN
        CREATE TYPE app.leave_unit AS ENUM (
            'days',     -- Leave tracked in days (full or half)
            'hours'     -- Leave tracked in hours (for flexible scheduling)
        );
    END IF;
END $$;

COMMENT ON TYPE app.leave_unit IS 'Unit of measurement for leave: days or hours';

-- -----------------------------------------------------------------------------
-- Half Day Period Enum (for clarity in half-day requests)
-- -----------------------------------------------------------------------------
-- Specifies which half of the day is being requested
-- Important for scheduling and knowing when employee will be present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'half_day_period') THEN
        CREATE TYPE app.half_day_period AS ENUM (
            'morning',      -- First half of the day (typically 9am-1pm)
            'afternoon'     -- Second half of the day (typically 1pm-5pm)
        );
    END IF;
END $$;

COMMENT ON TYPE app.half_day_period IS 'Period for half-day leave requests: morning or afternoon';

-- =============================================================================
-- Comments
-- =============================================================================

-- Note: Comments on enum types are created above with each type definition

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- Note: Dropping enum types will fail if they are in use by columns
-- Must drop dependent columns/tables first in reverse order of creation

-- DROP TYPE IF EXISTS app.half_day_period;
-- DROP TYPE IF EXISTS app.leave_unit;
-- DROP TYPE IF EXISTS app.balance_transaction_type;
-- DROP TYPE IF EXISTS app.accrual_frequency;
-- DROP TYPE IF EXISTS app.leave_request_status;
-- DROP TYPE IF EXISTS app.leave_type_category;
