-- Migration: 0101_benefits_types
-- Created: 2026-01-16
-- Description: Create enums and types for Benefits Administration module

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Benefit category enum
DO $$ BEGIN
    CREATE TYPE app.benefit_category AS ENUM (
        'health',
        'dental',
        'vision',
        'life',
        'disability',
        'retirement',
        'hsa',
        'fsa',
        'wellness',
        'commuter',
        'education',
        'childcare',
        'legal',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Contribution type enum
DO $$ BEGIN
    CREATE TYPE app.contribution_type AS ENUM (
        'employee_only',
        'employer_only',
        'shared',
        'voluntary'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Coverage level enum
DO $$ BEGIN
    CREATE TYPE app.coverage_level AS ENUM (
        'employee_only',
        'employee_spouse',
        'employee_children',
        'family'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Enrollment status enum
DO $$ BEGIN
    CREATE TYPE app.enrollment_status AS ENUM (
        'pending',
        'active',
        'waived',
        'terminated',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Life event type enum
DO $$ BEGIN
    CREATE TYPE app.life_event_type AS ENUM (
        'marriage',
        'divorce',
        'birth',
        'adoption',
        'death_of_dependent',
        'loss_of_coverage',
        'gain_of_coverage',
        'employment_change',
        'address_change',
        'legal_separation',
        'medicare_eligibility',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Life event status enum
DO $$ BEGIN
    CREATE TYPE app.life_event_status AS ENUM (
        'pending',
        'approved',
        'rejected',
        'expired'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TYPE app.benefit_category IS 'Categories of employee benefits';
COMMENT ON TYPE app.contribution_type IS 'Who pays for the benefit';
COMMENT ON TYPE app.coverage_level IS 'Level of coverage for benefits';
COMMENT ON TYPE app.enrollment_status IS 'Status of benefit enrollment';
COMMENT ON TYPE app.life_event_type IS 'Types of qualifying life events';
COMMENT ON TYPE app.life_event_status IS 'Status of life event submission';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TYPE IF EXISTS app.life_event_status;
-- DROP TYPE IF EXISTS app.life_event_type;
-- DROP TYPE IF EXISTS app.enrollment_status;
-- DROP TYPE IF EXISTS app.coverage_level;
-- DROP TYPE IF EXISTS app.contribution_type;
-- DROP TYPE IF EXISTS app.benefit_category;
