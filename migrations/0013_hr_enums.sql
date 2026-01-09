-- Migration: 0013_hr_enums
-- Created: 2026-01-07
-- Description: Create HR-specific enum types for the Core HR module
--              These enums define valid values for employee status, contracts,
--              gender, marital status, address types, contact types, and identifiers.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Employee Status Enum
-- -----------------------------------------------------------------------------
-- Defines the lifecycle states of an employee
-- State transitions:
--   pending -> active (hired/onboarded)
--   active -> on_leave (leave started)
--   on_leave -> active (leave ended)
--   active -> terminated (employment ended)
--   on_leave -> terminated (terminated while on leave)
-- Note: terminated is a terminal state; rehires create new employee records
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_status') THEN
        CREATE TYPE app.employee_status AS ENUM (
            'pending',      -- Hired but not yet active (pre-start)
            'active',       -- Currently employed and working
            'on_leave',     -- On approved leave (sabbatical, medical, etc.)
            'terminated'    -- Employment ended (resigned, dismissed, retired)
        );
    END IF;
END $$;

COMMENT ON TYPE app.employee_status IS 'Employee lifecycle status. State machine: pending->active->on_leave<->active->terminated';

-- -----------------------------------------------------------------------------
-- Contract Type Enum
-- -----------------------------------------------------------------------------
-- Defines the type of employment contract
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_type') THEN
        CREATE TYPE app.contract_type AS ENUM (
            'permanent',    -- Indefinite/permanent employment
            'fixed_term',   -- Contract with defined end date
            'contractor',   -- Independent contractor/consultant
            'intern',       -- Internship/trainee position
            'temporary'     -- Short-term/casual employment
        );
    END IF;
END $$;

COMMENT ON TYPE app.contract_type IS 'Type of employment contract (permanent, fixed-term, contractor, etc.)';

-- -----------------------------------------------------------------------------
-- Employment Type Enum
-- -----------------------------------------------------------------------------
-- Defines full-time vs part-time classification
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type') THEN
        CREATE TYPE app.employment_type AS ENUM (
            'full_time',    -- Full-time employment (typically 35-40+ hours/week)
            'part_time'     -- Part-time employment (less than full-time hours)
        );
    END IF;
END $$;

COMMENT ON TYPE app.employment_type IS 'Employment classification: full-time or part-time';

-- -----------------------------------------------------------------------------
-- Gender Enum
-- -----------------------------------------------------------------------------
-- Gender options for personal information
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender') THEN
        CREATE TYPE app.gender AS ENUM (
            'male',
            'female',
            'other',
            'prefer_not_to_say'
        );
    END IF;
END $$;

COMMENT ON TYPE app.gender IS 'Gender options for employee personal information';

-- -----------------------------------------------------------------------------
-- Marital Status Enum
-- -----------------------------------------------------------------------------
-- Marital status for personal/benefits information
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marital_status') THEN
        CREATE TYPE app.marital_status AS ENUM (
            'single',
            'married',
            'divorced',
            'widowed',
            'domestic_partnership'
        );
    END IF;
END $$;

COMMENT ON TYPE app.marital_status IS 'Marital status for employee personal/benefits information';

-- -----------------------------------------------------------------------------
-- Address Type Enum
-- -----------------------------------------------------------------------------
-- Types of addresses an employee can have
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'address_type') THEN
        CREATE TYPE app.address_type AS ENUM (
            'home',         -- Primary residence
            'work',         -- Work/office address
            'mailing',      -- Mailing/postal address
            'emergency'     -- Emergency contact address
        );
    END IF;
END $$;

COMMENT ON TYPE app.address_type IS 'Type of address (home, work, mailing, emergency)';

-- -----------------------------------------------------------------------------
-- Contact Type Enum
-- -----------------------------------------------------------------------------
-- Types of contact methods for an employee
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_type') THEN
        CREATE TYPE app.contact_type AS ENUM (
            'phone',        -- Landline phone
            'mobile',       -- Mobile/cell phone
            'email',        -- Email address
            'emergency'     -- Emergency contact number
        );
    END IF;
END $$;

COMMENT ON TYPE app.contact_type IS 'Type of contact method (phone, mobile, email, emergency)';

-- -----------------------------------------------------------------------------
-- Identifier Type Enum
-- -----------------------------------------------------------------------------
-- Types of identification documents
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'identifier_type') THEN
        CREATE TYPE app.identifier_type AS ENUM (
            'ssn',              -- Social Security Number (US)
            'passport',         -- Passport number
            'national_id',      -- National ID card number
            'drivers_license',  -- Driver's license number
            'tax_id',           -- Tax identification number
            'employee_id'       -- Internal employee ID badge number
        );
    END IF;
END $$;

COMMENT ON TYPE app.identifier_type IS 'Type of identification document (SSN, passport, national ID, etc.)';

-- =============================================================================
-- Comments
-- =============================================================================

-- Note: Comments on enum types are created above with each type definition

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- Note: Dropping enum types will fail if they are in use by columns
-- Must drop dependent columns/tables first

-- DROP TYPE IF EXISTS app.identifier_type;
-- DROP TYPE IF EXISTS app.contact_type;
-- DROP TYPE IF EXISTS app.address_type;
-- DROP TYPE IF EXISTS app.marital_status;
-- DROP TYPE IF EXISTS app.gender;
-- DROP TYPE IF EXISTS app.employment_type;
-- DROP TYPE IF EXISTS app.contract_type;
-- DROP TYPE IF EXISTS app.employee_status;
