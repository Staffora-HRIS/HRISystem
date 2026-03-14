-- Migration: 0124_ssp
-- Created: 2026-03-13
-- Description: Create Statutory Sick Pay (SSP) tables for UK employment law compliance
--
-- SSP is a UK legal requirement. Key rules:
-- - 4+ consecutive days of incapacity (including non-working days)
-- - 3 waiting days before SSP payments begin
-- - Maximum 28 weeks of SSP per Period of Incapacity for Work (PIW)
-- - Periods separated by 8 weeks or less link into a single PIW
-- - Qualifying days are days the employee normally works

-- =============================================================================
-- UP Migration
-- =============================================================================

-- SSP record status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ssp_record_status') THEN
    CREATE TYPE app.ssp_record_status AS ENUM (
      'active',
      'completed',
      'exhausted',
      'ineligible'
    );
  END IF;
END
$$;

-- SSP daily log day type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ssp_day_type') THEN
    CREATE TYPE app.ssp_day_type AS ENUM (
      'waiting',
      'paid',
      'non_qualifying',
      'weekend',
      'bank_holiday'
    );
  END IF;
END
$$;

-- =============================================================================
-- ssp_records: Main SSP record per Period of Incapacity for Work (PIW)
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.ssp_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  employee_id     uuid NOT NULL,

  -- Period of Incapacity dates
  start_date      date NOT NULL,
  end_date        date,                        -- NULL = still active

  -- Qualifying days pattern: array of ISO day numbers (1=Mon ... 7=Sun)
  -- e.g. [1,2,3,4,5] for a standard Mon-Fri worker
  qualifying_days_pattern jsonb NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,

  -- Waiting days tracking (max 3)
  waiting_days_served integer NOT NULL DEFAULT 0
    CHECK (waiting_days_served >= 0 AND waiting_days_served <= 3),

  -- Payment tracking
  total_days_paid     integer NOT NULL DEFAULT 0
    CHECK (total_days_paid >= 0),
  total_amount_paid   numeric(10, 2) NOT NULL DEFAULT 0
    CHECK (total_amount_paid >= 0),

  -- Weekly SSP rate at time of record creation (frozen for the PIW)
  weekly_rate     numeric(10, 2) NOT NULL,

  -- Status
  status          app.ssp_record_status NOT NULL DEFAULT 'active',

  -- Linked PIW: if this period links to a previous PIW (<=8 weeks gap)
  linked_piw_id   uuid REFERENCES app.ssp_records(id),

  -- Administrative
  fit_note_required boolean NOT NULL DEFAULT false,
  notes             text,
  ineligibility_reason text,            -- populated when status = 'ineligible'

  -- Audit
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Foreign keys
  CONSTRAINT fk_ssp_records_employee
    FOREIGN KEY (employee_id) REFERENCES app.employees(id)
);

-- =============================================================================
-- ssp_daily_log: Day-by-day SSP calculation breakdown
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.ssp_daily_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  ssp_record_id   uuid NOT NULL,

  -- The date this entry covers
  log_date        date NOT NULL,

  -- Classification of this day
  day_type        app.ssp_day_type NOT NULL,

  -- Amount paid for this day (0 for waiting/non_qualifying days)
  amount          numeric(10, 2) NOT NULL DEFAULT 0
    CHECK (amount >= 0),

  -- Audit
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Foreign keys
  CONSTRAINT fk_ssp_daily_log_record
    FOREIGN KEY (ssp_record_id) REFERENCES app.ssp_records(id) ON DELETE CASCADE,

  -- One entry per day per SSP record
  CONSTRAINT uq_ssp_daily_log_record_date
    UNIQUE (ssp_record_id, log_date)
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.ssp_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ssp_daily_log ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation ON app.ssp_records
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.ssp_records
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation ON app.ssp_daily_log
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.ssp_daily_log
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass policies (for admin operations)
CREATE POLICY system_bypass ON app.ssp_records
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass ON app.ssp_daily_log
  USING (current_setting('app.system_context', true) = 'true');

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_ssp_records_tenant_id
  ON app.ssp_records (tenant_id);

CREATE INDEX IF NOT EXISTS idx_ssp_records_employee_id
  ON app.ssp_records (employee_id);

CREATE INDEX IF NOT EXISTS idx_ssp_records_employee_dates
  ON app.ssp_records (employee_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_ssp_records_status
  ON app.ssp_records (status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_ssp_records_linked_piw
  ON app.ssp_records (linked_piw_id) WHERE linked_piw_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ssp_daily_log_tenant_id
  ON app.ssp_daily_log (tenant_id);

CREATE INDEX IF NOT EXISTS idx_ssp_daily_log_record_id
  ON app.ssp_daily_log (ssp_record_id);

CREATE INDEX IF NOT EXISTS idx_ssp_daily_log_date
  ON app.ssp_daily_log (ssp_record_id, log_date);

-- =============================================================================
-- Grants for hris_app role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.ssp_records TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.ssp_daily_log TO hris_app;

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- DROP TABLE IF EXISTS app.ssp_daily_log;
-- DROP TABLE IF EXISTS app.ssp_records;
-- DROP TYPE IF EXISTS app.ssp_day_type;
-- DROP TYPE IF EXISTS app.ssp_record_status;
