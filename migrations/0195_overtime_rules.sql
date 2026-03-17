-- Migration: 0195_overtime_rules
-- Created: 2026-03-17
-- Description: Overtime calculation rules with effective dating.
--              Supports configurable rate multipliers per tenant with
--              applicability scoping to departments/roles via JSONB.
--              Standard UK patterns: 1.0x base, 1.5x overtime, 2.0x bank holidays.
--              Effective-dated with overlap prevention per tenant+name dimension.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: overtime_day_type
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.overtime_day_type AS ENUM (
    'weekday',
    'weekend',
    'bank_holiday'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.overtime_day_type IS 'Type of day the overtime rule applies to';

-- -----------------------------------------------------------------------------
-- Table: overtime_rules
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.overtime_rules (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL,

  -- Rule definition
  name                     varchar(255) NOT NULL,
  description              text,
  day_type                 app.overtime_day_type NOT NULL DEFAULT 'weekday',
  threshold_hours_weekly   numeric(6,2) NOT NULL DEFAULT 0,
  rate_multiplier          numeric(4,2) NOT NULL DEFAULT 1.50,
  is_active                boolean NOT NULL DEFAULT true,

  -- Applicability scope (departments, roles, etc.)
  -- Example: {"departmentIds": ["uuid1", "uuid2"], "roleIds": ["uuid3"]}
  -- NULL or empty object = applies to all employees in the tenant
  applies_to               jsonb DEFAULT '{}'::jsonb,

  -- Effective dating (NULL effective_to = current/open-ended)
  effective_from           date NOT NULL,
  effective_to             date,

  -- Standard timestamps
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_overtime_rule_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  CONSTRAINT chk_overtime_threshold_positive CHECK (
    threshold_hours_weekly >= 0
  ),
  CONSTRAINT chk_overtime_rate_positive CHECK (
    rate_multiplier > 0
  )
);

-- RLS
ALTER TABLE app.overtime_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.overtime_rules
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.overtime_rules
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_overtime_rules_tenant
  ON app.overtime_rules (tenant_id);

CREATE INDEX IF NOT EXISTS idx_overtime_rules_tenant_active
  ON app.overtime_rules (tenant_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_overtime_rules_effective
  ON app.overtime_rules (tenant_id, name, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_overtime_rules_day_type
  ON app.overtime_rules (tenant_id, day_type);

-- Exclusion constraint: prevent overlapping rules with the same name within a tenant
-- This ensures no two rules with the same name have overlapping effective periods
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE app.overtime_rules
  ADD CONSTRAINT excl_overtime_rule_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    name WITH =,
    day_type WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  );

-- Updated_at trigger
CREATE TRIGGER trg_overtime_rules_updated_at
  BEFORE UPDATE ON app.overtime_rules
  FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- Comments
COMMENT ON TABLE app.overtime_rules IS 'Configurable overtime calculation rules with effective dating and tenant isolation';
COMMENT ON COLUMN app.overtime_rules.name IS 'Human-readable name for the overtime rule (e.g. Standard Overtime, Bank Holiday Premium)';
COMMENT ON COLUMN app.overtime_rules.description IS 'Optional description of when/how this rule applies';
COMMENT ON COLUMN app.overtime_rules.day_type IS 'Type of day: weekday, weekend, or bank_holiday';
COMMENT ON COLUMN app.overtime_rules.threshold_hours_weekly IS 'Weekly hours threshold after which this rate applies (e.g. 37.5 for standard UK)';
COMMENT ON COLUMN app.overtime_rules.rate_multiplier IS 'Pay rate multiplier (e.g. 1.00 = standard, 1.50 = time-and-a-half, 2.00 = double time)';
COMMENT ON COLUMN app.overtime_rules.is_active IS 'Whether this rule is currently active and should be used in calculations';
COMMENT ON COLUMN app.overtime_rules.applies_to IS 'JSONB scoping: {"departmentIds": [...], "roleIds": [...]}. Empty = applies to all employees';
COMMENT ON COLUMN app.overtime_rules.effective_from IS 'Start date for this rule version';
COMMENT ON COLUMN app.overtime_rules.effective_to IS 'End date for this rule version (NULL = current/open-ended)';

-- -----------------------------------------------------------------------------
-- Table: overtime_calculations
-- -----------------------------------------------------------------------------
-- Stores computed overtime results per employee per period for auditability.

CREATE TABLE IF NOT EXISTS app.overtime_calculations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL,
  employee_id              uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
  rule_id                  uuid NOT NULL REFERENCES app.overtime_rules(id) ON DELETE RESTRICT,

  -- Period
  period_start             date NOT NULL,
  period_end               date NOT NULL,

  -- Calculated values
  total_hours_worked       numeric(8,2) NOT NULL DEFAULT 0,
  regular_hours            numeric(8,2) NOT NULL DEFAULT 0,
  overtime_hours           numeric(8,2) NOT NULL DEFAULT 0,
  rate_multiplier          numeric(4,2) NOT NULL,
  overtime_pay_units       numeric(10,2) NOT NULL DEFAULT 0,

  -- Breakdown by day type
  weekday_hours            numeric(8,2) NOT NULL DEFAULT 0,
  weekend_hours            numeric(8,2) NOT NULL DEFAULT 0,
  bank_holiday_hours       numeric(8,2) NOT NULL DEFAULT 0,

  -- Metadata
  calculated_at            timestamptz NOT NULL DEFAULT now(),
  calculated_by            uuid,

  -- Standard timestamps
  created_at               timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_overtime_calc_period CHECK (
    period_end >= period_start
  ),
  CONSTRAINT chk_overtime_calc_hours_positive CHECK (
    total_hours_worked >= 0 AND regular_hours >= 0 AND overtime_hours >= 0
  )
);

-- RLS
ALTER TABLE app.overtime_calculations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.overtime_calculations
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.overtime_calculations
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_overtime_calculations_tenant_employee
  ON app.overtime_calculations (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_overtime_calculations_period
  ON app.overtime_calculations (tenant_id, employee_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_overtime_calculations_rule
  ON app.overtime_calculations (tenant_id, rule_id);

-- Comments
COMMENT ON TABLE app.overtime_calculations IS 'Immutable overtime calculation results per employee and period for audit trail';
COMMENT ON COLUMN app.overtime_calculations.overtime_pay_units IS 'Overtime hours multiplied by rate_multiplier — used for payroll costing';
COMMENT ON COLUMN app.overtime_calculations.calculated_by IS 'User who triggered the calculation (NULL if system-triggered)';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- DROP INDEX IF EXISTS app.idx_overtime_calculations_rule;
-- DROP INDEX IF EXISTS app.idx_overtime_calculations_period;
-- DROP INDEX IF EXISTS app.idx_overtime_calculations_tenant_employee;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.overtime_calculations;
-- DROP POLICY IF EXISTS tenant_isolation ON app.overtime_calculations;
-- DROP TABLE IF EXISTS app.overtime_calculations;

-- ALTER TABLE app.overtime_rules DROP CONSTRAINT IF EXISTS excl_overtime_rule_overlap;
-- DROP TRIGGER IF EXISTS trg_overtime_rules_updated_at ON app.overtime_rules;
-- DROP INDEX IF EXISTS app.idx_overtime_rules_day_type;
-- DROP INDEX IF EXISTS app.idx_overtime_rules_effective;
-- DROP INDEX IF EXISTS app.idx_overtime_rules_tenant_active;
-- DROP INDEX IF EXISTS app.idx_overtime_rules_tenant;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.overtime_rules;
-- DROP POLICY IF EXISTS tenant_isolation ON app.overtime_rules;
-- DROP TABLE IF EXISTS app.overtime_rules;
-- DROP TYPE IF EXISTS app.overtime_day_type;
