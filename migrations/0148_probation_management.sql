-- Migration: 0148_probation_management
-- Created: 2026-03-13
-- Description: Probation management workflow for employees.
--              Tracks probation reviews with outcomes (pending, passed,
--              extended, failed, terminated), supports review scheduling,
--              automated reminders, and probation extension.
--
--              probation_end_date already exists on employment_contracts.
--              This migration adds structured review and reminder tracking.
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: probation_outcome
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.probation_outcome AS ENUM (
    'pending',
    'passed',
    'extended',
    'failed',
    'terminated'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.probation_outcome IS 'Possible outcomes for a probation review';

-- -----------------------------------------------------------------------------
-- Table: probation_reviews
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.probation_reviews (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  employee_id           uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

  -- Probation dates
  probation_start_date  date NOT NULL,
  original_end_date     date NOT NULL,
  current_end_date      date NOT NULL,

  -- Review details
  review_date           date,
  reviewer_id           uuid,
  outcome               app.probation_outcome NOT NULL DEFAULT 'pending',

  -- Extension (only populated when outcome = 'extended')
  extension_weeks       int,

  -- Review content
  performance_notes     text,
  areas_of_concern      text,
  development_plan      text,
  recommendation        text,

  -- Meeting details
  meeting_date          date,
  meeting_notes         text,

  -- Standard timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_probation_dates CHECK (original_end_date >= probation_start_date),
  CONSTRAINT chk_current_end_date CHECK (current_end_date >= probation_start_date),
  CONSTRAINT chk_extension_weeks CHECK (
    (outcome = 'extended' AND extension_weeks IS NOT NULL AND extension_weeks > 0)
    OR (outcome != 'extended' AND extension_weeks IS NULL)
    OR (outcome = 'pending')
  )
);

-- RLS
ALTER TABLE app.probation_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.probation_reviews
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.probation_reviews
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_probation_reviews_tenant_employee
  ON app.probation_reviews (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_probation_reviews_outcome
  ON app.probation_reviews (tenant_id, outcome)
  WHERE outcome = 'pending';

CREATE INDEX IF NOT EXISTS idx_probation_reviews_current_end_date
  ON app.probation_reviews (tenant_id, current_end_date)
  WHERE outcome = 'pending';

CREATE INDEX IF NOT EXISTS idx_probation_reviews_reviewer
  ON app.probation_reviews (tenant_id, reviewer_id)
  WHERE reviewer_id IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER trg_probation_reviews_updated_at
  BEFORE UPDATE ON app.probation_reviews
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Comments
COMMENT ON TABLE app.probation_reviews IS 'Tracks probation review records for employees including outcome, extension, and meeting notes';
COMMENT ON COLUMN app.probation_reviews.probation_start_date IS 'Start date of the probation period (typically hire date or contract start)';
COMMENT ON COLUMN app.probation_reviews.original_end_date IS 'Original probation end date at time of hire';
COMMENT ON COLUMN app.probation_reviews.current_end_date IS 'Current end date (may differ from original if extended)';
COMMENT ON COLUMN app.probation_reviews.extension_weeks IS 'Number of weeks probation was extended by (only for extended outcome)';
COMMENT ON COLUMN app.probation_reviews.review_date IS 'Date the review was actually conducted';
COMMENT ON COLUMN app.probation_reviews.reviewer_id IS 'User ID of the person who conducted the review';

-- -----------------------------------------------------------------------------
-- Table: probation_reminders
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.probation_reminders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  probation_review_id   uuid NOT NULL REFERENCES app.probation_reviews(id) ON DELETE CASCADE,

  -- Reminder details
  reminder_type         varchar(50) NOT NULL,
  scheduled_date        date NOT NULL,
  sent                  boolean NOT NULL DEFAULT false,
  sent_at               timestamptz,

  -- Standard timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_reminder_type CHECK (
    reminder_type IN ('30_day_warning', '14_day_warning', 'review_due', 'overdue')
  ),
  CONSTRAINT chk_sent_at CHECK (
    (sent = true AND sent_at IS NOT NULL) OR (sent = false AND sent_at IS NULL)
  )
);

-- RLS
ALTER TABLE app.probation_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.probation_reminders
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.probation_reminders
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_probation_reminders_review
  ON app.probation_reminders (tenant_id, probation_review_id);

CREATE INDEX IF NOT EXISTS idx_probation_reminders_unsent
  ON app.probation_reminders (tenant_id, scheduled_date)
  WHERE sent = false;

CREATE INDEX IF NOT EXISTS idx_probation_reminders_type
  ON app.probation_reminders (tenant_id, reminder_type, sent);

-- Unique constraint: one reminder per type per review
CREATE UNIQUE INDEX idx_probation_reminders_unique_type
  ON app.probation_reminders (tenant_id, probation_review_id, reminder_type);

-- Comments
COMMENT ON TABLE app.probation_reminders IS 'Scheduled reminders for upcoming and overdue probation reviews';
COMMENT ON COLUMN app.probation_reminders.reminder_type IS 'Type of reminder: 30_day_warning, 14_day_warning, review_due, overdue';
COMMENT ON COLUMN app.probation_reminders.scheduled_date IS 'Date the reminder should be sent';
COMMENT ON COLUMN app.probation_reminders.sent IS 'Whether the reminder has been sent';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_probation_reviews_updated_at ON app.probation_reviews;
-- DROP TABLE IF EXISTS app.probation_reminders;
-- DROP TABLE IF EXISTS app.probation_reviews;
-- DROP TYPE IF EXISTS app.probation_outcome;
