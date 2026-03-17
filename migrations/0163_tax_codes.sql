-- Migration: 0163_tax_codes
-- Created: 2026-03-14
-- Description: Employee tax code tracking for UK payroll (HMRC tax codes).
--              Effective-dated records with source tracking (HMRC/manual).
--              Tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: tax_code_source
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.tax_code_source AS ENUM (
    'hmrc',
    'manual'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.tax_code_source IS 'Source of the tax code assignment: HMRC notification or manual entry';

-- -----------------------------------------------------------------------------
-- Table: employee_tax_codes
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.employee_tax_codes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  employee_id       uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

  -- Tax code fields
  tax_code          varchar(10) NOT NULL,
  is_cumulative     boolean NOT NULL DEFAULT true,
  week1_month1      boolean NOT NULL DEFAULT false,

  -- Effective dating (NULL effective_to = current)
  effective_from    date NOT NULL,
  effective_to      date,

  -- Source tracking
  source            app.tax_code_source NOT NULL DEFAULT 'manual',

  -- Standard timestamps
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_tax_code_format CHECK (
    tax_code ~ '^[0-9]{1,4}[LMNPTKY]?[1]?$|^BR$|^D[01]$|^NT$|^S[0-9]{1,4}[LMNPTKY]?$|^C[0-9]{1,4}[LMNPTKY]?$|^K[0-9]{1,4}$|^SK[0-9]{1,4}$|^CK[0-9]{1,4}$'
  ),
  CONSTRAINT chk_tax_code_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  CONSTRAINT chk_week1_month1_consistency CHECK (
    NOT (is_cumulative = true AND week1_month1 = true)
  )
);

-- RLS
ALTER TABLE app.employee_tax_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.employee_tax_codes
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.employee_tax_codes
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employee_tax_codes_tenant_employee
  ON app.employee_tax_codes (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_tax_codes_effective
  ON app.employee_tax_codes (tenant_id, employee_id, effective_from, effective_to);

-- Exclusion constraint to prevent overlapping effective date ranges per employee
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE app.employee_tax_codes
  ADD CONSTRAINT excl_tax_code_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    employee_id WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  );

-- Updated_at trigger
CREATE TRIGGER trg_employee_tax_codes_updated_at
  BEFORE UPDATE ON app.employee_tax_codes
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- Comments
COMMENT ON TABLE app.employee_tax_codes IS 'Effective-dated HMRC tax code tracking per employee for UK payroll';
COMMENT ON COLUMN app.employee_tax_codes.tax_code IS 'HMRC tax code (e.g. 1257L, BR, D0, K100, S1257L)';
COMMENT ON COLUMN app.employee_tax_codes.is_cumulative IS 'Whether tax is calculated cumulatively (standard) or on week1/month1 basis';
COMMENT ON COLUMN app.employee_tax_codes.week1_month1 IS 'If true, tax calculated on non-cumulative (week 1/month 1) basis';
COMMENT ON COLUMN app.employee_tax_codes.effective_from IS 'Start date for this tax code';
COMMENT ON COLUMN app.employee_tax_codes.effective_to IS 'End date for this tax code (NULL = current/open-ended)';
COMMENT ON COLUMN app.employee_tax_codes.source IS 'Source of the tax code: hmrc (P6/P9 notification) or manual entry';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- ALTER TABLE app.employee_tax_codes DROP CONSTRAINT IF EXISTS excl_tax_code_overlap;
-- DROP TRIGGER IF EXISTS trg_employee_tax_codes_updated_at ON app.employee_tax_codes;
-- DROP TABLE IF EXISTS app.employee_tax_codes;
-- DROP TYPE IF EXISTS app.tax_code_source;
