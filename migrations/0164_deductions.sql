-- Migration: 0164_deductions
-- Created: 2026-03-14
-- Description: Payroll deduction types and employee deduction assignments.
--              Supports statutory (tax, NI, pension, student loan) and voluntary deductions.
--              Employee deductions are effective-dated with overlap prevention per type.
--              Tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: deduction_category
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.deduction_category AS ENUM (
    'tax',
    'ni',
    'pension',
    'student_loan',
    'attachment_of_earnings',
    'voluntary',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.deduction_category IS 'Category of payroll deduction';

-- -----------------------------------------------------------------------------
-- Enum: calculation_method
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.calculation_method AS ENUM (
    'fixed',
    'percentage',
    'tiered'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.calculation_method IS 'How the deduction amount is calculated';

-- -----------------------------------------------------------------------------
-- Table: deduction_types
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.deduction_types (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  name                 varchar(255) NOT NULL,
  code                 varchar(50) NOT NULL,
  category             app.deduction_category NOT NULL,
  is_statutory         boolean NOT NULL DEFAULT false,
  calculation_method   app.calculation_method NOT NULL DEFAULT 'fixed',

  -- Standard timestamps
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.deduction_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.deduction_types
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.deduction_types
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deduction_types_tenant
  ON app.deduction_types (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deduction_types_tenant_code
  ON app.deduction_types (tenant_id, code);

-- Updated_at trigger
CREATE TRIGGER trg_deduction_types_updated_at
  BEFORE UPDATE ON app.deduction_types
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Comments
COMMENT ON TABLE app.deduction_types IS 'Catalogue of deduction types available for payroll processing';
COMMENT ON COLUMN app.deduction_types.code IS 'Unique code for the deduction type within the tenant (e.g. PAYE, NI_EE, STUDENT_LOAN)';
COMMENT ON COLUMN app.deduction_types.category IS 'Deduction category: tax, ni, pension, student_loan, attachment_of_earnings, voluntary, other';
COMMENT ON COLUMN app.deduction_types.is_statutory IS 'Whether this is a legally required deduction';
COMMENT ON COLUMN app.deduction_types.calculation_method IS 'How the deduction is calculated: fixed amount, percentage, or tiered';

-- -----------------------------------------------------------------------------
-- Table: employee_deductions
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.employee_deductions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  employee_id          uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
  deduction_type_id    uuid NOT NULL REFERENCES app.deduction_types(id) ON DELETE RESTRICT,

  -- Amounts (one of amount or percentage should be set based on calculation_method)
  amount               numeric(12,2),
  percentage           numeric(5,2),

  -- Effective dating (NULL effective_to = current)
  effective_from       date NOT NULL,
  effective_to         date,

  -- Optional reference (e.g. court order number, student loan plan)
  reference            varchar(255),

  -- Standard timestamps
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_deduction_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  CONSTRAINT chk_deduction_amounts CHECK (
    amount IS NOT NULL OR percentage IS NOT NULL
  ),
  CONSTRAINT chk_deduction_amount_positive CHECK (
    amount IS NULL OR amount >= 0
  ),
  CONSTRAINT chk_deduction_percentage_range CHECK (
    percentage IS NULL OR (percentage >= 0 AND percentage <= 100)
  )
);

-- RLS
ALTER TABLE app.employee_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.employee_deductions
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.employee_deductions
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employee_deductions_tenant_employee
  ON app.employee_deductions (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_deductions_type
  ON app.employee_deductions (tenant_id, deduction_type_id);

CREATE INDEX IF NOT EXISTS idx_employee_deductions_effective
  ON app.employee_deductions (tenant_id, employee_id, deduction_type_id, effective_from, effective_to);

-- Exclusion constraint: prevent overlapping deductions of the same type for the same employee
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE app.employee_deductions
  ADD CONSTRAINT excl_employee_deduction_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    employee_id WITH =,
    deduction_type_id WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  );

-- Updated_at trigger
CREATE TRIGGER trg_employee_deductions_updated_at
  BEFORE UPDATE ON app.employee_deductions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Comments
COMMENT ON TABLE app.employee_deductions IS 'Effective-dated payroll deductions assigned to individual employees';
COMMENT ON COLUMN app.employee_deductions.amount IS 'Fixed deduction amount (used when calculation_method is fixed)';
COMMENT ON COLUMN app.employee_deductions.percentage IS 'Deduction percentage of gross pay (used when calculation_method is percentage)';
COMMENT ON COLUMN app.employee_deductions.effective_from IS 'Start date for this deduction';
COMMENT ON COLUMN app.employee_deductions.effective_to IS 'End date for this deduction (NULL = current/open-ended)';
COMMENT ON COLUMN app.employee_deductions.reference IS 'External reference (e.g. court order number, student loan plan type)';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- ALTER TABLE app.employee_deductions DROP CONSTRAINT IF EXISTS excl_employee_deduction_overlap;
-- DROP TRIGGER IF EXISTS trg_employee_deductions_updated_at ON app.employee_deductions;
-- DROP TABLE IF EXISTS app.employee_deductions;
-- DROP TRIGGER IF EXISTS trg_deduction_types_updated_at ON app.deduction_types;
-- DROP TABLE IF EXISTS app.deduction_types;
-- DROP TYPE IF EXISTS app.calculation_method;
-- DROP TYPE IF EXISTS app.deduction_category;
