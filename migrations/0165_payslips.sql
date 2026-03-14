-- Migration: 0165_payslips
-- Created: 2026-03-14
-- Description: Payslip templates and generated payslips.
--              Templates define the visual layout; payslips store the calculated
--              breakdown for each employee per pay period.
--              Tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: payslip_status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.payslip_status AS ENUM (
    'draft',
    'approved',
    'issued'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.payslip_status IS 'Payslip lifecycle status: draft -> approved -> issued';

-- -----------------------------------------------------------------------------
-- Table: payslip_templates
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.payslip_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  name              varchar(255) NOT NULL,
  layout_config     jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Standard timestamps
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.payslip_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.payslip_templates
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.payslip_templates
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payslip_templates_tenant
  ON app.payslip_templates (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payslip_templates_tenant_name
  ON app.payslip_templates (tenant_id, name);

-- Updated_at trigger
CREATE TRIGGER trg_payslip_templates_updated_at
  BEFORE UPDATE ON app.payslip_templates
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Comments
COMMENT ON TABLE app.payslip_templates IS 'Payslip layout templates for PDF generation';
COMMENT ON COLUMN app.payslip_templates.layout_config IS 'JSONB configuration defining the payslip layout (header, sections, footer, branding)';

-- -----------------------------------------------------------------------------
-- Table: payslips
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.payslips (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  employee_id           uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
  pay_period_id         uuid REFERENCES app.pay_periods(id) ON DELETE SET NULL,

  -- Pay breakdown
  gross_pay             numeric(12,2) NOT NULL DEFAULT 0,
  net_pay               numeric(12,2) NOT NULL DEFAULT 0,
  tax_deducted          numeric(12,2) NOT NULL DEFAULT 0,
  ni_employee           numeric(12,2) NOT NULL DEFAULT 0,
  ni_employer           numeric(12,2) NOT NULL DEFAULT 0,
  pension_employee      numeric(12,2) NOT NULL DEFAULT 0,
  pension_employer      numeric(12,2) NOT NULL DEFAULT 0,

  -- Flexible additions/deductions
  other_deductions      jsonb NOT NULL DEFAULT '[]'::jsonb,
  other_additions       jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Payment info
  payment_date          date NOT NULL,

  -- Status
  status                app.payslip_status NOT NULL DEFAULT 'draft',

  -- Standard timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_payslip_gross_pay CHECK (gross_pay >= 0),
  CONSTRAINT chk_payslip_net_pay CHECK (net_pay >= 0),
  CONSTRAINT chk_payslip_tax CHECK (tax_deducted >= 0),
  CONSTRAINT chk_payslip_ni_ee CHECK (ni_employee >= 0),
  CONSTRAINT chk_payslip_ni_er CHECK (ni_employer >= 0),
  CONSTRAINT chk_payslip_pension_ee CHECK (pension_employee >= 0),
  CONSTRAINT chk_payslip_pension_er CHECK (pension_employer >= 0)
);

-- RLS
ALTER TABLE app.payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.payslips
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.payslips
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payslips_tenant_employee
  ON app.payslips (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_payslips_tenant_pay_period
  ON app.payslips (tenant_id, pay_period_id);

CREATE INDEX IF NOT EXISTS idx_payslips_payment_date
  ON app.payslips (tenant_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_payslips_status
  ON app.payslips (tenant_id, status);

-- Unique constraint: one payslip per employee per pay period
CREATE UNIQUE INDEX IF NOT EXISTS idx_payslips_employee_period
  ON app.payslips (tenant_id, employee_id, pay_period_id)
  WHERE pay_period_id IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER trg_payslips_updated_at
  BEFORE UPDATE ON app.payslips
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Comments
COMMENT ON TABLE app.payslips IS 'Generated payslips containing the full pay breakdown for each employee per pay period';
COMMENT ON COLUMN app.payslips.gross_pay IS 'Total gross pay before deductions';
COMMENT ON COLUMN app.payslips.net_pay IS 'Net pay after all deductions';
COMMENT ON COLUMN app.payslips.tax_deducted IS 'PAYE income tax deducted';
COMMENT ON COLUMN app.payslips.ni_employee IS 'Employee National Insurance contribution';
COMMENT ON COLUMN app.payslips.ni_employer IS 'Employer National Insurance contribution';
COMMENT ON COLUMN app.payslips.pension_employee IS 'Employee pension contribution';
COMMENT ON COLUMN app.payslips.pension_employer IS 'Employer pension contribution';
COMMENT ON COLUMN app.payslips.other_deductions IS 'JSONB array of additional deductions [{name, amount, code}]';
COMMENT ON COLUMN app.payslips.other_additions IS 'JSONB array of additional pay items [{name, amount, code}]';
COMMENT ON COLUMN app.payslips.payment_date IS 'Date the payment was/will be made';
COMMENT ON COLUMN app.payslips.status IS 'Payslip status: draft (calculated), approved (reviewed), issued (sent to employee)';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_payslips_updated_at ON app.payslips;
-- DROP TABLE IF EXISTS app.payslips;
-- DROP TRIGGER IF EXISTS trg_payslip_templates_updated_at ON app.payslip_templates;
-- DROP TABLE IF EXISTS app.payslip_templates;
-- DROP TYPE IF EXISTS app.payslip_status;
