-- Migration: 0152_employee_bank_details
-- Created: 2026-03-13
-- Description: Employee bank details for payroll.
--              Stores UK bank account information (sort code, account number)
--              with effective-dating support for historical tracking.
--
--              Sensitive field -- access should be restricted to HR admin
--              and payroll roles.
--
--              Sort code format: NN-NN-NN (stored as 6 digits).
--              Account number: 8 digits.
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: employee_bank_details
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.employee_bank_details (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL,
  employee_id                 uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

  -- Bank account information
  account_name                varchar(255) NOT NULL,
  sort_code                   varchar(8) NOT NULL,
  account_number              varchar(8) NOT NULL,
  bank_name                   varchar(255),
  building_society_reference  varchar(50),

  -- Designation
  is_primary                  boolean NOT NULL DEFAULT true,

  -- Effective dating (NULL effective_to = current record)
  effective_from              date NOT NULL DEFAULT CURRENT_DATE,
  effective_to                date,

  -- Audit
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- Ensure effective_from < effective_to when both are set
  CONSTRAINT chk_bank_details_effective_dates CHECK (
    effective_to IS NULL OR effective_from < effective_to
  )
);

COMMENT ON TABLE app.employee_bank_details IS 'Sensitive field -- access should be restricted to HR admin and payroll roles. Sort code format: NN-NN-NN. Account number: 8 digits.';
COMMENT ON COLUMN app.employee_bank_details.sort_code IS 'UK bank sort code, 6 digits (stored without hyphens)';
COMMENT ON COLUMN app.employee_bank_details.account_number IS 'UK bank account number, 8 digits';
COMMENT ON COLUMN app.employee_bank_details.is_primary IS 'Whether this is the primary account for salary payments';
COMMENT ON COLUMN app.employee_bank_details.effective_from IS 'Date from which this bank detail is effective';
COMMENT ON COLUMN app.employee_bank_details.effective_to IS 'Date until which this bank detail is effective (NULL = current)';

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_employee_bank_details_tenant_employee
  ON app.employee_bank_details (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_bank_details_effective
  ON app.employee_bank_details (employee_id, effective_from, effective_to);

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE app.employee_bank_details ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: SELECT, UPDATE, DELETE
CREATE POLICY tenant_isolation ON app.employee_bank_details
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Tenant isolation: INSERT
CREATE POLICY tenant_isolation_insert ON app.employee_bank_details
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System bypass (used by administrative operations)
CREATE POLICY system_bypass ON app.employee_bank_details
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.employee_bank_details
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- -----------------------------------------------------------------------------
-- Trigger: updated_at auto-update
-- -----------------------------------------------------------------------------

CREATE OR REPLACE TRIGGER trg_employee_bank_details_updated_at
  BEFORE UPDATE ON app.employee_bank_details
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at();

-- =============================================================================
-- DOWN Migration
-- =============================================================================

-- DROP TABLE IF EXISTS app.employee_bank_details CASCADE;
