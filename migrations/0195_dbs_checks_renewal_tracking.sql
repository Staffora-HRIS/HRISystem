-- Migration: 0195_dbs_checks_renewal_tracking
-- Created: 2026-03-17
-- Description: Add renewal tracking to DBS checks
--
-- DBS certificates technically do not expire, but many UK employers adopt a
-- policy of renewing checks every 3 years. The DBS Update Service allows
-- employers to check the status of an existing certificate online.
--
-- This migration adds:
--   1. renewal_due_date column for employer-defined renewal scheduling
--   2. 'not_started' status to the enum for checks not yet initiated
--   3. Index on renewal_due_date for the scheduler job that sends reminders
--   4. Grants for the application role

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Add 'not_started' to the status enum if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'app.dbs_check_status'::regtype
      AND enumlabel = 'not_started'
  ) THEN
    ALTER TYPE app.dbs_check_status ADD VALUE IF NOT EXISTS 'not_started' BEFORE 'pending';
  END IF;
END
$$;

-- Add renewal_due_date column
ALTER TABLE app.dbs_checks
  ADD COLUMN IF NOT EXISTS renewal_due_date date;

-- Comment on columns for documentation
COMMENT ON COLUMN app.dbs_checks.renewal_due_date IS
  'Employer-defined date when this DBS check should be renewed. DBS certificates do not technically expire, but many employers renew every 3 years.';

COMMENT ON COLUMN app.dbs_checks.expiry_date IS
  'Date the DBS certificate is considered expired under employer policy (legacy column, prefer renewal_due_date for new logic).';

-- Index for the renewal reminder scheduler job
CREATE INDEX IF NOT EXISTS idx_dbs_checks_renewal_due
  ON app.dbs_checks (tenant_id, renewal_due_date)
  WHERE renewal_due_date IS NOT NULL AND status IN ('clear', 'flagged');

-- Grant permissions to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.dbs_checks TO hris_app;

-- =============================================================================
-- DOWN Migration (commented out -- run manually to rollback)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_dbs_checks_renewal_due;
-- ALTER TABLE app.dbs_checks DROP COLUMN IF EXISTS renewal_due_date;
-- Note: Removing an enum value from PostgreSQL requires recreating the type.
-- The 'not_started' value cannot be safely removed without a full type rebuild.
