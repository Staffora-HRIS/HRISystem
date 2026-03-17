-- Migration: 0198_payroll_period_locks
-- Description: Add payroll period locking to prevent data modifications during/after payroll processing
-- Reversible: Yes (DROP TABLE)

-- =============================================================================
-- Table: payroll_period_locks
-- =============================================================================
-- Tracks locked payroll periods per tenant. When a period is locked, no
-- modifications should be allowed to time entries, absence records, or
-- compensation changes that fall within that period.
--
-- A period can be unlocked with a mandatory reason for audit purposes.
-- =============================================================================

-- Ensure btree_gist extension is available for the exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS app.payroll_period_locks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  period_start    date        NOT NULL,
  period_end      date        NOT NULL,
  locked_at       timestamptz NOT NULL DEFAULT now(),
  locked_by       uuid        NOT NULL,
  unlock_reason   text,
  unlocked_at     timestamptz,
  unlocked_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Ensure period_end >= period_start
  CONSTRAINT chk_period_lock_dates CHECK (period_end >= period_start),

  -- Prevent duplicate active locks for overlapping periods per tenant.
  -- A lock is "active" when unlocked_at IS NULL.
  -- We use an exclusion constraint to prevent overlapping active locks.
  CONSTRAINT excl_active_period_lock_overlap
    EXCLUDE USING gist (
      tenant_id WITH =,
      daterange(period_start, period_end, '[]') WITH &&
    ) WHERE (unlocked_at IS NULL)
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.payroll_period_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
  ON app.payroll_period_locks
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
  ON app.payroll_period_locks
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Fast lookup for active locks by tenant and date range
CREATE INDEX idx_period_locks_tenant_active
  ON app.payroll_period_locks (tenant_id)
  WHERE unlocked_at IS NULL;

-- Lookup by period dates for overlap checks
CREATE INDEX idx_period_locks_period_dates
  ON app.payroll_period_locks (tenant_id, period_start, period_end);

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON app.payroll_period_locks TO hris_app;

-- =============================================================================
-- Rollback:
-- DROP TABLE IF EXISTS app.payroll_period_locks;
-- =============================================================================
