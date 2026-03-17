-- Migration: 0191_tax_codes_enhancements
-- Created: 2026-03-17
-- Description: Extend employee_tax_codes source enum to include P45, P46,
--              and starter_declaration sources for UK payroll compliance.
--              Also adds a notes column for free-text context on each record.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Add new source values to the tax_code_source enum.
-- These reflect the actual documents through which tax codes are communicated:
--   p45         - Tax code from a P45 provided by previous employer
--   p46         - Legacy new-starter declaration (replaced by starter_declaration)
--   starter_declaration - HMRC Starter Checklist (replaces P46 since 2013)

ALTER TYPE app.tax_code_source ADD VALUE IF NOT EXISTS 'p45';
ALTER TYPE app.tax_code_source ADD VALUE IF NOT EXISTS 'p46';
ALTER TYPE app.tax_code_source ADD VALUE IF NOT EXISTS 'starter_declaration';

-- Add optional notes column for audit context (e.g. "Updated per HMRC P6 notice dated 2026-04-10")
ALTER TABLE app.employee_tax_codes
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN app.employee_tax_codes.notes IS 'Free-text notes for audit context (e.g. reference to HMRC notice)';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- Note: PostgreSQL does not support DROP VALUE from enums.
-- To reverse, you would need to create a new type and migrate data.
-- ALTER TABLE app.employee_tax_codes DROP COLUMN IF EXISTS notes;
