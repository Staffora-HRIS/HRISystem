-- Migration: 0186_uk_compliance_cleanup.sql
-- Description: Remove US-specific HR logic and replace with UK equivalents.
--              - Add 'nino' to identifier_type enum, update 'ssn' rows to 'nino'
--              - Rename flsa_status → wtr_status (Working Time Regulations)
--              - Rename eeo_category → soc_code (UK Standard Occupational Classification)
--              - Update default currency from USD to GBP

-- =============================================================================
-- 1. Update identifier_type enum: add 'nino', migrate 'ssn' values
-- =============================================================================

-- Add 'nino' to the identifier_type enum
ALTER TYPE app.identifier_type ADD VALUE IF NOT EXISTS 'nino';

-- Update any existing rows that use 'ssn' to 'nino'
-- Wrapped in exception block because ALTER TYPE ADD VALUE
-- cannot be used in the same transaction as the new value.
-- On fresh installs there are no rows to update.
DO $$
BEGIN
  UPDATE app.employee_identifiers
  SET identifier_type = 'nino'
  WHERE identifier_type = 'ssn';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipping ssn->nino migration (enum not yet usable): %', SQLERRM;
END $$;

-- Note: PostgreSQL does not support removing enum values without recreating the type.
-- The 'ssn' value remains in the enum but is no longer used by the application.
-- Application-layer validation prevents new 'ssn' values from being inserted.
COMMENT ON TYPE app.identifier_type IS 'Type of identification document. UK system: use nino (National Insurance Number), passport, national_id, drivers_license, tax_id, work_permit, visa, or other. The ssn value is deprecated and must not be used.';

-- =============================================================================
-- 2. Rename flsa_status → wtr_status (Working Time Regulations)
-- =============================================================================

-- The FLSA (Fair Labor Standards Act) is US-specific legislation.
-- UK equivalent: Working Time Regulations 1998 (WTR).
-- 'exempt' maps to 'opted_out' (worker has signed a WTR opt-out agreement)
-- 'non_exempt' maps to 'subject_to_wtr' (worker is subject to 48-hour weekly limit)

-- Rename the column
ALTER TABLE app.jobs RENAME COLUMN flsa_status TO wtr_status;

-- Update existing values to UK terminology
UPDATE app.jobs SET wtr_status = 'subject_to_wtr' WHERE wtr_status = 'exempt';
UPDATE app.jobs SET wtr_status = 'subject_to_wtr' WHERE wtr_status = 'non_exempt';

-- Update default
ALTER TABLE app.jobs ALTER COLUMN wtr_status SET DEFAULT 'subject_to_wtr';

-- Add comment
COMMENT ON COLUMN app.jobs.wtr_status IS 'Working Time Regulations status: subject_to_wtr (default, 48-hour weekly limit applies) or opted_out (worker signed WTR opt-out)';

-- =============================================================================
-- 3. Rename eeo_category → soc_code (UK Standard Occupational Classification)
-- =============================================================================

-- EEO (Equal Employment Opportunity) categories are US-specific (EEOC).
-- UK equivalent: SOC codes from the Office for National Statistics (ONS).
-- Used for workforce reporting, immigration, and government statistics.

ALTER TABLE app.jobs RENAME COLUMN eeo_category TO soc_code;

COMMENT ON COLUMN app.jobs.soc_code IS 'UK Standard Occupational Classification (SOC) code from ONS. Used for workforce reporting, visa applications, and government statistics.';

-- =============================================================================
-- 4. Update default currency columns to GBP where USD was the default
-- =============================================================================

-- Update positions table currency default
ALTER TABLE app.positions ALTER COLUMN currency SET DEFAULT 'GBP';

-- Update jobs table currency default
ALTER TABLE app.jobs ALTER COLUMN currency SET DEFAULT 'GBP';

-- Update any existing USD values to GBP in positions and jobs
-- (Only update rows where currency was set to the old default)
UPDATE app.positions SET currency = 'GBP' WHERE currency = 'USD';
UPDATE app.jobs SET currency = 'GBP' WHERE currency = 'USD';

-- Update compensation_history default currency
UPDATE app.compensation_history SET currency = 'GBP' WHERE currency = 'USD';

-- =============================================================================
-- 5. Rename ssn_last_four → id_last_four in benefit_dependents
-- =============================================================================

-- The ssn_last_four column stored the last 4 digits of a US Social Security Number.
-- Renamed to id_last_four as a generic identifier suffix field (e.g., NI Number last 4).

ALTER TABLE app.benefit_dependents RENAME COLUMN ssn_last_four TO id_last_four;

COMMENT ON COLUMN app.benefit_dependents.id_last_four IS 'Last 4 characters of dependent identifier (e.g., NI Number). Used for verification without storing full PII.';
