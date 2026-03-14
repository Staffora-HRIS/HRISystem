-- Migration: 0149_pay_periods
-- Created: 2026-03-13
-- Description: Pay period configuration, employee pay schedule assignments,
--              and NI category tracking for UK payroll.
--
--              - pay_schedules: configurable pay frequencies with day-of-week/month
--              - employee_pay_assignments: effective-dated employee-to-schedule links
--              - ni_categories: effective-dated NI category letter tracking per employee
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: pay_frequency
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.pay_frequency AS ENUM (
    'weekly',
    'fortnightly',
    'four_weekly',
    'monthly',
    'annually'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.pay_frequency IS 'UK standard pay frequencies for payroll schedules';

-- -----------------------------------------------------------------------------
-- Table: pay_schedules
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.pay_schedules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  name              varchar(255) NOT NULL,
  frequency         app.pay_frequency NOT NULL,

  -- For weekly/fortnightly/four_weekly: which day of the week (0=Sun, 6=Sat)
  pay_day_of_week   int,
  -- For monthly/annually: which day of the month (1-31)
  pay_day_of_month  int,

  -- UK tax year alignment: the date of the Monday of tax week 1
  tax_week_start    date,

  -- Whether this is the default schedule for the tenant
  is_default        boolean NOT NULL DEFAULT false,

  -- Standard timestamps
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_pay_day_of_week CHECK (
    pay_day_of_week IS NULL OR (pay_day_of_week >= 0 AND pay_day_of_week <= 6)
  ),
  CONSTRAINT chk_pay_day_of_month CHECK (
    pay_day_of_month IS NULL OR (pay_day_of_month >= 1 AND pay_day_of_month <= 31)
  ),
  -- Ensure weekly-type schedules have day-of-week; monthly/annually have day-of-month
  CONSTRAINT chk_pay_day_consistency CHECK (
    (frequency IN ('weekly', 'fortnightly', 'four_weekly') AND pay_day_of_week IS NOT NULL)
    OR (frequency IN ('monthly', 'annually') AND pay_day_of_month IS NOT NULL)
  )
);

-- RLS
ALTER TABLE app.pay_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.pay_schedules
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.pay_schedules
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pay_schedules_tenant
  ON app.pay_schedules (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pay_schedules_tenant_name
  ON app.pay_schedules (tenant_id, name);

-- Only one default schedule per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_pay_schedules_tenant_default
  ON app.pay_schedules (tenant_id)
  WHERE is_default = true;

-- Updated_at trigger
CREATE TRIGGER trg_pay_schedules_updated_at
  BEFORE UPDATE ON app.pay_schedules
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Comments
COMMENT ON TABLE app.pay_schedules IS 'Configurable pay schedules defining frequency and pay day for payroll processing';
COMMENT ON COLUMN app.pay_schedules.frequency IS 'Pay frequency: weekly, fortnightly, four_weekly, monthly, annually';
COMMENT ON COLUMN app.pay_schedules.pay_day_of_week IS 'Day of week for weekly-type schedules (0=Sunday, 6=Saturday)';
COMMENT ON COLUMN app.pay_schedules.pay_day_of_month IS 'Day of month for monthly/annual schedules (1-31)';
COMMENT ON COLUMN app.pay_schedules.tax_week_start IS 'Date of Monday of tax week 1 for HMRC alignment';
COMMENT ON COLUMN app.pay_schedules.is_default IS 'Whether this is the default pay schedule for new employees in this tenant';

-- -----------------------------------------------------------------------------
-- Table: employee_pay_assignments
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.employee_pay_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  employee_id       uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
  pay_schedule_id   uuid NOT NULL REFERENCES app.pay_schedules(id) ON DELETE RESTRICT,

  -- Effective dating (NULL effective_to = current)
  effective_from    date NOT NULL,
  effective_to      date,

  -- Standard timestamps
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_pay_assignment_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

-- RLS
ALTER TABLE app.employee_pay_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.employee_pay_assignments
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.employee_pay_assignments
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employee_pay_assignments_tenant_employee
  ON app.employee_pay_assignments (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_pay_assignments_schedule
  ON app.employee_pay_assignments (tenant_id, pay_schedule_id);

-- Overlapping effective dates per employee (used for overlap checks)
CREATE INDEX IF NOT EXISTS idx_employee_pay_assignments_effective
  ON app.employee_pay_assignments (tenant_id, employee_id, effective_from, effective_to);

-- Exclusion constraint to prevent overlapping effective date ranges per employee.
-- Uses the btree_gist extension for daterange overlap checking.
-- The gist index on tenant_id + employee_id with = and daterange with &&
-- ensures no two assignments for the same employee in the same tenant overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE app.employee_pay_assignments
  ADD CONSTRAINT excl_pay_assignment_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    employee_id WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  );

-- Comments
COMMENT ON TABLE app.employee_pay_assignments IS 'Effective-dated assignment of employees to pay schedules';
COMMENT ON COLUMN app.employee_pay_assignments.effective_from IS 'Start date of this pay schedule assignment';
COMMENT ON COLUMN app.employee_pay_assignments.effective_to IS 'End date of this assignment (NULL = current/open-ended)';

-- -----------------------------------------------------------------------------
-- Table: ni_categories
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.ni_categories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  employee_id       uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

  -- NI category letter (HMRC categories)
  category_letter   char(1) NOT NULL,

  -- Effective dating (NULL effective_to = current)
  effective_from    date NOT NULL,
  effective_to      date,

  -- Optional notes (e.g., reason for category change)
  notes             text,

  -- Standard timestamps
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_ni_category_letter CHECK (
    category_letter IN ('A', 'B', 'C', 'F', 'H', 'I', 'J', 'L', 'M', 'S', 'V', 'Z')
  ),
  CONSTRAINT chk_ni_category_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

-- RLS
ALTER TABLE app.ni_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.ni_categories
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.ni_categories
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ni_categories_tenant_employee
  ON app.ni_categories (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_ni_categories_effective
  ON app.ni_categories (tenant_id, employee_id, effective_from, effective_to);

-- Exclusion constraint to prevent overlapping NI category date ranges per employee
ALTER TABLE app.ni_categories
  ADD CONSTRAINT excl_ni_category_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    employee_id WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  );

-- Comments
COMMENT ON TABLE app.ni_categories IS 'Effective-dated National Insurance category tracking per employee for UK payroll';
COMMENT ON COLUMN app.ni_categories.category_letter IS 'HMRC NI category letter: A, B, C, F, H, I, J, L, M, S, V, Z';
COMMENT ON COLUMN app.ni_categories.effective_from IS 'Start date for this NI category';
COMMENT ON COLUMN app.ni_categories.effective_to IS 'End date for this NI category (NULL = current/open-ended)';
COMMENT ON COLUMN app.ni_categories.notes IS 'Optional notes explaining why the category was set or changed';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- ALTER TABLE app.ni_categories DROP CONSTRAINT IF EXISTS excl_ni_category_overlap;
-- DROP TABLE IF EXISTS app.ni_categories;
-- ALTER TABLE app.employee_pay_assignments DROP CONSTRAINT IF EXISTS excl_pay_assignment_overlap;
-- DROP TABLE IF EXISTS app.employee_pay_assignments;
-- DROP TRIGGER IF EXISTS trg_pay_schedules_updated_at ON app.pay_schedules;
-- DROP TABLE IF EXISTS app.pay_schedules;
-- DROP TYPE IF EXISTS app.pay_frequency;
