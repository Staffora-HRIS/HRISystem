-- Migration: 0199_payroll_journal_entries
-- Description: Add payroll journal entries table for accounting integration (TODO-233)
-- Reversible: Yes (DROP TABLE)

-- =============================================================================
-- Table: payroll_journal_entries
-- =============================================================================
-- Stores double-entry accounting journal lines generated from approved payroll
-- runs. Each payroll run can produce multiple journal entries (debits and
-- credits) covering gross pay, tax, NI, pension, and net pay accounts.
--
-- Journal entries are generated as a batch from a payroll run and are
-- immutable once created. If corrections are needed, a reversing journal
-- must be posted.
--
-- The cost_centre_id is a nullable UUID for future linkage to a cost centres
-- table. For now it allows free-form grouping by cost centre.
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.payroll_journal_entries (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid          NOT NULL,
  payroll_run_id    uuid          NOT NULL REFERENCES app.payroll_runs(id),
  entry_date        date          NOT NULL,
  account_code      varchar(50)   NOT NULL,
  description       text          NOT NULL,
  debit             numeric(15,2) NOT NULL DEFAULT 0.00,
  credit            numeric(15,2) NOT NULL DEFAULT 0.00,
  cost_centre_id    uuid,
  created_at        timestamptz   NOT NULL DEFAULT now(),

  -- At least one of debit or credit must be non-zero
  CONSTRAINT chk_journal_debit_or_credit CHECK (debit > 0 OR credit > 0),
  -- Cannot have both debit and credit on the same line
  CONSTRAINT chk_journal_not_both CHECK (NOT (debit > 0 AND credit > 0))
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE app.payroll_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation
  ON app.payroll_journal_entries
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert
  ON app.payroll_journal_entries
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Fast lookup by payroll run (the most common query pattern)
CREATE INDEX idx_journal_entries_run_id
  ON app.payroll_journal_entries (payroll_run_id);

-- Lookup by tenant and entry date for period queries
CREATE INDEX idx_journal_entries_tenant_date
  ON app.payroll_journal_entries (tenant_id, entry_date);

-- Lookup by account code for ledger queries
CREATE INDEX idx_journal_entries_account_code
  ON app.payroll_journal_entries (tenant_id, account_code);

-- Lookup by cost centre for departmental reporting
CREATE INDEX idx_journal_entries_cost_centre
  ON app.payroll_journal_entries (tenant_id, cost_centre_id)
  WHERE cost_centre_id IS NOT NULL;

-- =============================================================================
-- Grants
-- =============================================================================

GRANT SELECT, INSERT ON app.payroll_journal_entries TO hris_app;

-- =============================================================================
-- Rollback:
-- DROP TABLE IF EXISTS app.payroll_journal_entries;
-- =============================================================================
