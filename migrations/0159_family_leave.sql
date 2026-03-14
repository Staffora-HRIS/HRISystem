-- =============================================================================
-- Migration 0159: Family Leave Enhancements
--
-- Extends statutory leave tables with UK family leave compliance fields:
-- - Notice tracking (MATB1, notice dates, qualifying week)
-- - Statutory pay qualification flag
-- - Formal notice records for maternity/paternity/shared parental
--
-- Also adds a dedicated family_leave_notices table for tracking the formal
-- notice process required by UK legislation (15 weeks before EWC for
-- maternity, 56 days for paternity, 8 weeks for ShPL).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Alter statutory_leave_records: add family leave compliance columns
-- ---------------------------------------------------------------------------

-- Notice given date: when the employee formally notified the employer
ALTER TABLE app.statutory_leave_records
  ADD COLUMN IF NOT EXISTS notice_given_date date;

-- Qualifying week: the 15th week before the expected week of childbirth (EWC)
-- Used for eligibility calculations
ALTER TABLE app.statutory_leave_records
  ADD COLUMN IF NOT EXISTS qualifying_week date;

-- Whether the employee qualifies for statutory pay
ALTER TABLE app.statutory_leave_records
  ADD COLUMN IF NOT EXISTS qualifies_for_statutory_pay boolean NOT NULL DEFAULT false;

-- Lower Earnings Limit check: employee must earn above this to qualify for pay
ALTER TABLE app.statutory_leave_records
  ADD COLUMN IF NOT EXISTS earnings_above_lel boolean NOT NULL DEFAULT false;

-- Paternity: can be taken in 2 separate 1-week blocks since April 2024
-- Track which block this is (1 or 2) for paternity leave
ALTER TABLE app.statutory_leave_records
  ADD COLUMN IF NOT EXISTS paternity_block_number smallint;

-- ShPL: total weeks of leave mother is curtailing (enables ShPL pool)
ALTER TABLE app.statutory_leave_records
  ADD COLUMN IF NOT EXISTS spl_weeks_available integer;

-- ShPL: total weeks of pay available from curtailed leave
ALTER TABLE app.statutory_leave_records
  ADD COLUMN IF NOT EXISTS spl_pay_weeks_available integer;

-- Constraint: paternity block must be 1 or 2 if set
ALTER TABLE app.statutory_leave_records
  ADD CONSTRAINT chk_paternity_block_number
    CHECK (paternity_block_number IS NULL OR paternity_block_number IN (1, 2));

-- ---------------------------------------------------------------------------
-- Table: family_leave_notices
--
-- Tracks formal notices required by UK legislation for family leave.
-- Maternity: written notice by 15th week before EWC
-- Paternity: form SC3 or written notice
-- ShPL: formal opt-in notice (8 weeks before first ShPL block)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.family_leave_notices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  leave_record_id       uuid NOT NULL,
  employee_id           uuid NOT NULL,
  notice_type           varchar(50) NOT NULL,
  notice_date           date NOT NULL,
  received_date         date,
  acknowledged_by       uuid,
  acknowledged_date     date,
  document_reference    varchar(255),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Foreign keys
  CONSTRAINT fk_family_notice_tenant
    FOREIGN KEY (tenant_id) REFERENCES app.tenants(id),
  CONSTRAINT fk_family_notice_leave_record
    FOREIGN KEY (leave_record_id) REFERENCES app.statutory_leave_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_family_notice_employee
    FOREIGN KEY (employee_id) REFERENCES app.employees(id),

  -- Notice type validation
  CONSTRAINT chk_notice_type CHECK (notice_type IN (
    'maternity_notification',     -- Initial notification of pregnancy
    'maternity_leave_dates',      -- Confirmation of leave start date
    'maternity_return_early',     -- 8 weeks notice to return early
    'matb1_certificate',          -- MATB1 certificate submission
    'paternity_notification',     -- Form SC3 or written notice
    'spl_opt_in',                 -- Shared parental leave opt-in notice
    'spl_period_of_leave',        -- ShPL period of leave notice
    'spl_curtailment',            -- Maternity/adoption curtailment notice
    'adoption_notification',      -- Notification of adoption placement
    'adoption_matching_cert'      -- Matching certificate for adoption
  ))
);

-- ---------------------------------------------------------------------------
-- RLS: family_leave_notices
-- ---------------------------------------------------------------------------
ALTER TABLE app.family_leave_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.family_leave_notices
  USING (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert ON app.family_leave_notices
  FOR INSERT WITH CHECK (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

-- ---------------------------------------------------------------------------
-- Indexes: family_leave_notices
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_family_notice_tenant
  ON app.family_leave_notices (tenant_id);

CREATE INDEX IF NOT EXISTS idx_family_notice_leave_record
  ON app.family_leave_notices (leave_record_id);

CREATE INDEX IF NOT EXISTS idx_family_notice_employee
  ON app.family_leave_notices (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_family_notice_type
  ON app.family_leave_notices (tenant_id, notice_type);

-- ---------------------------------------------------------------------------
-- Indexes: statutory_leave_records (new columns)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_statutory_leave_qualifying_week
  ON app.statutory_leave_records (tenant_id, qualifying_week)
  WHERE qualifying_week IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_statutory_leave_notice_date
  ON app.statutory_leave_records (tenant_id, notice_given_date)
  WHERE notice_given_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Grants for application role
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON app.family_leave_notices TO hris_app;

-- ---------------------------------------------------------------------------
-- Updated-at trigger for family_leave_notices
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER family_leave_notices_updated_at
  BEFORE UPDATE ON app.family_leave_notices
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- DOWN Migration
-- =============================================================================
-- DROP TABLE IF EXISTS app.family_leave_notices;
-- ALTER TABLE app.statutory_leave_records DROP COLUMN IF EXISTS notice_given_date;
-- ALTER TABLE app.statutory_leave_records DROP COLUMN IF EXISTS qualifying_week;
-- ALTER TABLE app.statutory_leave_records DROP COLUMN IF EXISTS qualifies_for_statutory_pay;
-- ALTER TABLE app.statutory_leave_records DROP COLUMN IF EXISTS earnings_above_lel;
-- ALTER TABLE app.statutory_leave_records DROP COLUMN IF EXISTS paternity_block_number;
-- ALTER TABLE app.statutory_leave_records DROP COLUMN IF EXISTS spl_weeks_available;
-- ALTER TABLE app.statutory_leave_records DROP COLUMN IF EXISTS spl_pay_weeks_available;
-- ALTER TABLE app.statutory_leave_records DROP CONSTRAINT IF EXISTS chk_paternity_block_number;
