-- Migration: 0157_data_breach_enhanced
-- Created: 2026-03-14
-- Description: Enhance data breach notification workflow for full UK GDPR
--              ICO breach notification lifecycle (TODO-063).
--
--              Changes:
--              1. Add new breach_status enum values for the enhanced state machine:
--                 reported, assessing, subjects_notified, remediation_only
--              2. Add risk assessment columns (severity assessment, ICO/subject notification flags)
--              3. Add DPO details columns
--              4. Add data subject notification detail columns
--              5. Add breach_type enum for structured classification
--              6. Migrate existing rows from old statuses to new ones

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend breach_status enum with new states
-- -----------------------------------------------------------------------------
-- New states: reported, assessing, subjects_notified, remediation_only
-- Existing states to keep: detected, investigating, contained, notified_ico, notified_individuals, resolved, closed
-- We add new values; the old values remain valid for backward compatibility.

ALTER TYPE app.breach_status ADD VALUE IF NOT EXISTS 'reported';
ALTER TYPE app.breach_status ADD VALUE IF NOT EXISTS 'assessing';
ALTER TYPE app.breach_status ADD VALUE IF NOT EXISTS 'subjects_notified';
ALTER TYPE app.breach_status ADD VALUE IF NOT EXISTS 'remediation_only';

-- -----------------------------------------------------------------------------
-- 2. Breach type enum for structured classification
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.breach_type_enum AS ENUM (
    'confidentiality',
    'integrity',
    'availability'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Add risk assessment columns to data_breaches
-- -----------------------------------------------------------------------------

-- Risk assessment fields
ALTER TABLE app.data_breaches
  ADD COLUMN IF NOT EXISTS risk_to_individuals boolean,
  ADD COLUMN IF NOT EXISTS high_risk_to_individuals boolean,
  ADD COLUMN IF NOT EXISTS ico_notification_required boolean,
  ADD COLUMN IF NOT EXISTS subject_notification_required boolean,
  ADD COLUMN IF NOT EXISTS assessment_notes text,
  ADD COLUMN IF NOT EXISTS assessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS assessed_by uuid;

-- DPO details
ALTER TABLE app.data_breaches
  ADD COLUMN IF NOT EXISTS dpo_name varchar(255),
  ADD COLUMN IF NOT EXISTS dpo_email varchar(255),
  ADD COLUMN IF NOT EXISTS dpo_phone varchar(50);

-- ICO notification timing compliance
ALTER TABLE app.data_breaches
  ADD COLUMN IF NOT EXISTS ico_notified_within_72h boolean;

-- Data subject notification details
ALTER TABLE app.data_breaches
  ADD COLUMN IF NOT EXISTS subject_notification_method varchar(100),
  ADD COLUMN IF NOT EXISTS subjects_notified_count integer,
  ADD COLUMN IF NOT EXISTS subject_notification_content text,
  ADD COLUMN IF NOT EXISTS subjects_notification_date timestamptz;

-- Structured breach type (in addition to existing free-text breach_type)
ALTER TABLE app.data_breaches
  ADD COLUMN IF NOT EXISTS breach_category app.breach_type_enum;

-- Nature of breach: what personal data, how many data subjects affected
ALTER TABLE app.data_breaches
  ADD COLUMN IF NOT EXISTS nature_of_breach text,
  ADD COLUMN IF NOT EXISTS likely_consequences text,
  ADD COLUMN IF NOT EXISTS measures_taken text;

-- Closed / resolution details
ALTER TABLE app.data_breaches
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid;

-- -----------------------------------------------------------------------------
-- 4. Migrate existing data from old states to new states
-- -----------------------------------------------------------------------------
-- Map old states to new state machine where possible:
-- detected -> reported (initial state in new model)
-- investigating -> assessing
-- contained -> assessing (folded into assessment phase)
-- notified_ico -> ico_notified (same)
-- notified_individuals -> subjects_notified
-- resolved -> remediation_only (if not ICO notified) or closed
-- closed -> closed (same)

UPDATE app.data_breaches SET status = 'reported' WHERE status = 'detected';
UPDATE app.data_breaches SET status = 'assessing' WHERE status = 'investigating';
UPDATE app.data_breaches SET status = 'assessing' WHERE status = 'contained';
UPDATE app.data_breaches SET status = 'subjects_notified' WHERE status = 'notified_individuals';
-- notified_ico stays as is (ico_notified is already in the enum)
-- resolved -> closed (these are done, we close them)
UPDATE app.data_breaches SET status = 'closed', closed_at = resolved_at WHERE status = 'resolved' AND resolved_at IS NOT NULL;
UPDATE app.data_breaches SET status = 'closed', closed_at = now() WHERE status = 'resolved' AND resolved_at IS NULL;

-- -----------------------------------------------------------------------------
-- 5. Index for overdue ICO notifications (using new states)
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_data_breaches_ico_pending
  ON app.data_breaches (ico_deadline)
  WHERE ico_notified = false
    AND status IN ('reported', 'assessing')
    AND ico_deadline IS NOT NULL;

-- Index for dashboard: open breaches by severity
CREATE INDEX IF NOT EXISTS idx_data_breaches_open_severity
  ON app.data_breaches (tenant_id, severity)
  WHERE status NOT IN ('closed');

-- =============================================================================
-- DOWN Migration
-- =============================================================================
-- To rollback:
--   ALTER TABLE app.data_breaches
--     DROP COLUMN IF EXISTS risk_to_individuals,
--     DROP COLUMN IF EXISTS high_risk_to_individuals,
--     DROP COLUMN IF EXISTS ico_notification_required,
--     DROP COLUMN IF EXISTS subject_notification_required,
--     DROP COLUMN IF EXISTS assessment_notes,
--     DROP COLUMN IF EXISTS assessed_at,
--     DROP COLUMN IF EXISTS assessed_by,
--     DROP COLUMN IF EXISTS dpo_name,
--     DROP COLUMN IF EXISTS dpo_email,
--     DROP COLUMN IF EXISTS dpo_phone,
--     DROP COLUMN IF EXISTS ico_notified_within_72h,
--     DROP COLUMN IF EXISTS subject_notification_method,
--     DROP COLUMN IF EXISTS subjects_notified_count,
--     DROP COLUMN IF EXISTS subject_notification_content,
--     DROP COLUMN IF EXISTS subjects_notification_date,
--     DROP COLUMN IF EXISTS breach_category,
--     DROP COLUMN IF EXISTS nature_of_breach,
--     DROP COLUMN IF EXISTS likely_consequences,
--     DROP COLUMN IF EXISTS measures_taken,
--     DROP COLUMN IF EXISTS closed_at,
--     DROP COLUMN IF EXISTS closed_by;
--   DROP TYPE IF EXISTS app.breach_type_enum;
--   -- Note: Cannot remove enum values from PostgreSQL. Would need to recreate the type.
