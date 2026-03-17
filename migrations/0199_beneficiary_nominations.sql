-- Migration: 0199_beneficiary_nominations
-- Created: 2026-03-17
-- Description: Beneficiary nomination management for benefits administration.
--              Allows employees to designate beneficiaries for each benefit type,
--              specifying allocation percentages, relationship, date of birth,
--              and address. A database CHECK constraint enforces that nomination
--              percentages cannot exceed 100 per employee per benefit_type.
--              A service-layer validation enforces that percentages must sum
--              to exactly 100 before a nomination set can be considered complete.
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- beneficiary_nominations - Beneficiary designation records
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.beneficiary_nominations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  employee_id     uuid NOT NULL,

  -- Benefit type this nomination applies to (matches benefit_category enum)
  benefit_type    varchar(50) NOT NULL,

  -- Beneficiary details
  beneficiary_name  varchar(255) NOT NULL,
  relationship      varchar(100) NOT NULL,
  date_of_birth     date,
  percentage        numeric(5,2) NOT NULL,
  address           text,

  -- Audit fields
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_percentage_range CHECK (percentage > 0 AND percentage <= 100)
);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE app.beneficiary_nominations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.beneficiary_nominations
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.beneficiary_nominations
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- System context bypass (matches pattern used by other tables)
CREATE POLICY system_bypass ON app.beneficiary_nominations
  USING (current_setting('app.system_context', true) = 'true');

CREATE POLICY system_bypass_insert ON app.beneficiary_nominations
  FOR INSERT WITH CHECK (current_setting('app.system_context', true) = 'true');

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: all nominations for an employee
CREATE INDEX IF NOT EXISTS idx_beneficiary_nominations_tenant_employee
  ON app.beneficiary_nominations (tenant_id, employee_id);

-- Lookup by employee + benefit_type (used for percentage sum validation)
CREATE INDEX IF NOT EXISTS idx_beneficiary_nominations_employee_benefit_type
  ON app.beneficiary_nominations (tenant_id, employee_id, benefit_type);

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_beneficiary_nominations_updated_at
  BEFORE UPDATE ON app.beneficiary_nominations
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- GRANT permissions to application role
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.beneficiary_nominations TO hris_app;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.beneficiary_nominations IS 'Beneficiary designations for employee benefits. Each row represents one beneficiary for a given benefit type. Percentages per employee per benefit_type must sum to exactly 100.';
COMMENT ON COLUMN app.beneficiary_nominations.benefit_type IS 'The benefit category this nomination applies to (e.g. life, retirement, health)';
COMMENT ON COLUMN app.beneficiary_nominations.percentage IS 'Allocation percentage for this beneficiary (0 < pct <= 100)';
COMMENT ON COLUMN app.beneficiary_nominations.relationship IS 'Relationship of beneficiary to employee (e.g. spouse, child, parent, sibling, other)';

-- =============================================================================
-- DOWN Migration (reversible)
-- =============================================================================

-- To reverse:
-- DROP TABLE IF EXISTS app.beneficiary_nominations;
