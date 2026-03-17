-- Migration: 0196_toil_management
-- Created: 2026-03-17
-- Description: Time Off In Lieu (TOIL) management tables.
--              Tracks TOIL balances per employee with configurable expiry periods,
--              and an immutable transaction log for accruals and usage.
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: toil_balances
-- Tracks the running TOIL balance per employee per period.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.toil_balances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  employee_id       uuid NOT NULL,

  -- Hours tracking
  accrued_hours     numeric(8, 2) NOT NULL DEFAULT 0,
  used_hours        numeric(8, 2) NOT NULL DEFAULT 0,
  balance_hours     numeric(8, 2) NOT NULL GENERATED ALWAYS AS (accrued_hours - used_hours) STORED,

  -- Period
  period_start      date NOT NULL,
  period_end        date NOT NULL,

  -- Expiry configuration (days from accrual date; NULL = no expiry, default 90 = 3 months)
  expiry_days       integer NOT NULL DEFAULT 90,

  -- Audit
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT toil_balances_period_check CHECK (period_end > period_start),
  CONSTRAINT toil_balances_accrued_non_negative CHECK (accrued_hours >= 0),
  CONSTRAINT toil_balances_used_non_negative CHECK (used_hours >= 0),
  CONSTRAINT toil_balances_used_le_accrued CHECK (used_hours <= accrued_hours)
);

-- RLS
ALTER TABLE app.toil_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.toil_balances
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.toil_balances
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_toil_balances_tenant
  ON app.toil_balances (tenant_id);

CREATE INDEX IF NOT EXISTS idx_toil_balances_employee
  ON app.toil_balances (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_toil_balances_period
  ON app.toil_balances (tenant_id, employee_id, period_start, period_end);

-- Prevent overlapping periods for the same employee within a tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_toil_balances_no_overlap
  ON app.toil_balances (tenant_id, employee_id, period_start, period_end);

-- Updated_at trigger
CREATE TRIGGER trg_toil_balances_updated_at
  BEFORE UPDATE ON app.toil_balances
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- Comments
COMMENT ON TABLE app.toil_balances IS 'TOIL (Time Off In Lieu) balance records per employee per period';
COMMENT ON COLUMN app.toil_balances.accrued_hours IS 'Total hours of TOIL accrued (from overtime worked)';
COMMENT ON COLUMN app.toil_balances.used_hours IS 'Total hours of TOIL used (time taken off)';
COMMENT ON COLUMN app.toil_balances.balance_hours IS 'Generated column: accrued_hours - used_hours';
COMMENT ON COLUMN app.toil_balances.period_start IS 'Start date of the TOIL accrual period';
COMMENT ON COLUMN app.toil_balances.period_end IS 'End date of the TOIL accrual period';
COMMENT ON COLUMN app.toil_balances.expiry_days IS 'Number of days after accrual date before TOIL expires (default 90 = ~3 months)';


-- -----------------------------------------------------------------------------
-- Table: toil_transactions
-- Immutable log of all TOIL accruals and usage.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.toil_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  employee_id       uuid NOT NULL,
  balance_id        uuid NOT NULL REFERENCES app.toil_balances(id),

  -- Transaction details
  type              varchar(20) NOT NULL,
  hours             numeric(8, 2) NOT NULL,
  reason            text,
  authorized_by     uuid,
  date              date NOT NULL,

  -- Expiry tracking (for accrual transactions)
  expires_at        date,

  -- Audit
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT toil_transactions_type_check CHECK (type IN ('accrual', 'usage')),
  CONSTRAINT toil_transactions_hours_positive CHECK (hours > 0)
);

-- RLS
ALTER TABLE app.toil_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.toil_transactions
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.toil_transactions
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_toil_transactions_tenant
  ON app.toil_transactions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_toil_transactions_employee
  ON app.toil_transactions (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_toil_transactions_balance
  ON app.toil_transactions (balance_id);

CREATE INDEX IF NOT EXISTS idx_toil_transactions_date
  ON app.toil_transactions (tenant_id, employee_id, date);

CREATE INDEX IF NOT EXISTS idx_toil_transactions_type
  ON app.toil_transactions (tenant_id, employee_id, type);

CREATE INDEX IF NOT EXISTS idx_toil_transactions_expires
  ON app.toil_transactions (tenant_id, expires_at)
  WHERE type = 'accrual' AND expires_at IS NOT NULL;

-- Comments
COMMENT ON TABLE app.toil_transactions IS 'Immutable transaction log for TOIL accruals and usage';
COMMENT ON COLUMN app.toil_transactions.type IS 'Transaction type: accrual (overtime earned) or usage (time taken off)';
COMMENT ON COLUMN app.toil_transactions.hours IS 'Number of hours accrued or used (always positive)';
COMMENT ON COLUMN app.toil_transactions.reason IS 'Reason for the accrual (e.g., overtime description) or usage request reason';
COMMENT ON COLUMN app.toil_transactions.authorized_by IS 'Manager/supervisor who authorised this TOIL transaction';
COMMENT ON COLUMN app.toil_transactions.date IS 'Date the overtime was worked (accrual) or date the time off is taken (usage)';
COMMENT ON COLUMN app.toil_transactions.expires_at IS 'Date this accrual expires (calculated from date + expiry_days on the balance)';


-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_toil_balances_updated_at ON app.toil_balances;
-- DROP TABLE IF EXISTS app.toil_transactions;
-- DROP TABLE IF EXISTS app.toil_balances;
