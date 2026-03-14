-- Migration: 0161_payroll_integration
-- Created: 2026-03-14
-- Description: Payroll integration tables for payroll runs, payroll line items,
--              and employee tax details (UK PAYE/NI).
--
--              - payroll_runs: tracks payroll processing lifecycle (draft -> paid)
--              - payroll_lines: per-employee pay breakdown for each run
--              - employee_tax_details: effective-dated tax code and NI storage
--
--              All tables are tenant-scoped with RLS policies.
--              Supports CSV/JSON export for external payroll providers.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: payroll_run_status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.payroll_run_status AS ENUM (
    'draft',
    'calculating',
    'review',
    'approved',
    'submitted',
    'paid'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.payroll_run_status IS 'Payroll run lifecycle: draft -> calculating -> review -> approved -> submitted -> paid';

-- -----------------------------------------------------------------------------
-- Enum: payroll_run_type
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.payroll_run_type AS ENUM (
    'monthly',
    'weekly',
    'supplemental'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.payroll_run_type IS 'Type of payroll run: monthly, weekly, or supplemental (ad-hoc)';

-- -----------------------------------------------------------------------------
-- Enum: student_loan_plan
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.student_loan_plan AS ENUM (
    'none',
    'plan1',
    'plan2',
    'plan4',
    'plan5',
    'postgrad'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.student_loan_plan IS 'UK student loan repayment plan types';

-- -----------------------------------------------------------------------------
-- Enum: payment_method
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.payment_method AS ENUM (
    'bacs',
    'faster_payments',
    'cheque',
    'cash'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.payment_method IS 'Employee payment method for salary disbursement';

-- -----------------------------------------------------------------------------
-- Table: payroll_runs
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.payroll_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,

  -- Pay period definition
  pay_period_start      date NOT NULL,
  pay_period_end        date NOT NULL,
  pay_date              date NOT NULL,

  -- Run metadata
  status                app.payroll_run_status NOT NULL DEFAULT 'draft',
  run_type              app.payroll_run_type NOT NULL DEFAULT 'monthly',

  -- Aggregated totals (populated during calculation)
  employee_count        int NOT NULL DEFAULT 0,
  total_gross           numeric(15, 2) NOT NULL DEFAULT 0,
  total_deductions      numeric(15, 2) NOT NULL DEFAULT 0,
  total_net             numeric(15, 2) NOT NULL DEFAULT 0,
  total_employer_costs  numeric(15, 2) NOT NULL DEFAULT 0,

  -- Approval workflow
  approved_by           uuid,
  approved_at           timestamptz,
  submitted_at          timestamptz,

  -- Notes for the run (optional)
  notes                 text,

  -- Standard timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_payroll_period_dates CHECK (pay_period_end >= pay_period_start),
  CONSTRAINT chk_payroll_pay_date CHECK (pay_date >= pay_period_start)
);

-- RLS
ALTER TABLE app.payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.payroll_runs
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.payroll_runs
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant
  ON app.payroll_runs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant_status
  ON app.payroll_runs (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant_period
  ON app.payroll_runs (tenant_id, pay_period_start, pay_period_end);

-- Prevent duplicate runs for same period and type within a tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_runs_tenant_period_type
  ON app.payroll_runs (tenant_id, pay_period_start, pay_period_end, run_type)
  WHERE status != 'draft';

-- Updated_at trigger
CREATE TRIGGER trg_payroll_runs_updated_at
  BEFORE UPDATE ON app.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Comments
COMMENT ON TABLE app.payroll_runs IS 'Payroll run tracking with lifecycle management and aggregated totals';
COMMENT ON COLUMN app.payroll_runs.status IS 'Payroll run status: draft, calculating, review, approved, submitted, paid';
COMMENT ON COLUMN app.payroll_runs.run_type IS 'Type of payroll run: monthly, weekly, or supplemental';
COMMENT ON COLUMN app.payroll_runs.employee_count IS 'Number of employees included in this payroll run';
COMMENT ON COLUMN app.payroll_runs.total_gross IS 'Sum of gross pay across all employees in this run';
COMMENT ON COLUMN app.payroll_runs.total_employer_costs IS 'Sum of employer-side costs (employer NI, employer pension)';

-- -----------------------------------------------------------------------------
-- Table: payroll_lines
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.payroll_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  payroll_run_id        uuid NOT NULL REFERENCES app.payroll_runs(id) ON DELETE CASCADE,
  employee_id           uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

  -- Earnings breakdown
  basic_pay             numeric(15, 2) NOT NULL DEFAULT 0,
  overtime_pay          numeric(15, 2) NOT NULL DEFAULT 0,
  bonus_pay             numeric(15, 2) NOT NULL DEFAULT 0,
  total_gross           numeric(15, 2) NOT NULL DEFAULT 0,

  -- Employee deductions
  tax_deduction         numeric(15, 2) NOT NULL DEFAULT 0,
  ni_employee           numeric(15, 2) NOT NULL DEFAULT 0,
  pension_employee      numeric(15, 2) NOT NULL DEFAULT 0,
  student_loan          numeric(15, 2) NOT NULL DEFAULT 0,
  other_deductions      numeric(15, 2) NOT NULL DEFAULT 0,
  total_deductions      numeric(15, 2) NOT NULL DEFAULT 0,

  -- Net pay
  net_pay               numeric(15, 2) NOT NULL DEFAULT 0,

  -- Employer costs (not deducted from employee)
  ni_employer           numeric(15, 2) NOT NULL DEFAULT 0,
  pension_employer      numeric(15, 2) NOT NULL DEFAULT 0,

  -- Tax/NI details at time of calculation (snapshot)
  tax_code              varchar(10),
  ni_category           char(1),

  -- Payment details
  payment_method        app.payment_method NOT NULL DEFAULT 'bacs',

  -- Standard timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Constraints: one line per employee per run
  CONSTRAINT uq_payroll_lines_run_employee UNIQUE (payroll_run_id, employee_id),
  CONSTRAINT chk_payroll_lines_gross CHECK (total_gross >= 0),
  CONSTRAINT chk_payroll_lines_deductions CHECK (total_deductions >= 0),
  CONSTRAINT chk_payroll_lines_net CHECK (net_pay >= 0)
);

-- RLS
ALTER TABLE app.payroll_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.payroll_lines
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.payroll_lines
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payroll_lines_tenant
  ON app.payroll_lines (tenant_id);

CREATE INDEX IF NOT EXISTS idx_payroll_lines_run
  ON app.payroll_lines (payroll_run_id);

CREATE INDEX IF NOT EXISTS idx_payroll_lines_employee
  ON app.payroll_lines (tenant_id, employee_id);

-- Updated_at trigger
CREATE TRIGGER trg_payroll_lines_updated_at
  BEFORE UPDATE ON app.payroll_lines
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Comments
COMMENT ON TABLE app.payroll_lines IS 'Per-employee payroll line items within a payroll run';
COMMENT ON COLUMN app.payroll_lines.basic_pay IS 'Base salary pay for the period';
COMMENT ON COLUMN app.payroll_lines.overtime_pay IS 'Overtime pay based on approved timesheet hours';
COMMENT ON COLUMN app.payroll_lines.bonus_pay IS 'Bonus and incentive payments for the period';
COMMENT ON COLUMN app.payroll_lines.tax_code IS 'Snapshot of the employee tax code at time of calculation';
COMMENT ON COLUMN app.payroll_lines.ni_category IS 'Snapshot of the NI category letter at time of calculation';
COMMENT ON COLUMN app.payroll_lines.payment_method IS 'Payment method: bacs, faster_payments, cheque, cash';

-- -----------------------------------------------------------------------------
-- Table: employee_tax_details
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.employee_tax_details (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  employee_id           uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

  -- HMRC tax details
  tax_code              varchar(10) NOT NULL,
  ni_number             varchar(13),
  ni_category           char(1) NOT NULL DEFAULT 'A',

  -- Student loan
  student_loan_plan     app.student_loan_plan NOT NULL DEFAULT 'none',

  -- Effective dating (NULL effective_to = current)
  effective_from        date NOT NULL,
  effective_to          date,

  -- Standard timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_tax_details_dates CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  CONSTRAINT chk_tax_code_format CHECK (
    tax_code ~ '^[0-9]{1,4}[LMNPTKY]$'
    OR tax_code IN ('BR', 'D0', 'D1', 'NT', 'S0T', 'SBR', 'SD0', 'SD1', 'SD2', 'C0T', 'CBR', 'CD0', 'CD1')
    OR tax_code ~ '^(S|C|K)?[0-9]{1,4}[LMNPTKY]$'
  ),
  CONSTRAINT chk_ni_category_letter CHECK (
    ni_category IN ('A', 'B', 'C', 'F', 'H', 'I', 'J', 'L', 'M', 'S', 'V', 'Z')
  ),
  CONSTRAINT chk_ni_number_format CHECK (
    ni_number IS NULL OR ni_number ~ '^[A-CEGHJ-PR-TW-Z]{2}[0-9]{6}[A-D]$'
  )
);

-- RLS
ALTER TABLE app.employee_tax_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.employee_tax_details
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.employee_tax_details
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employee_tax_details_tenant
  ON app.employee_tax_details (tenant_id);

CREATE INDEX IF NOT EXISTS idx_employee_tax_details_employee
  ON app.employee_tax_details (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_tax_details_effective
  ON app.employee_tax_details (tenant_id, employee_id, effective_from, effective_to);

-- Exclusion constraint to prevent overlapping effective date ranges per employee
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE app.employee_tax_details
  ADD CONSTRAINT excl_tax_details_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    employee_id WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  );

-- Updated_at trigger
CREATE TRIGGER trg_employee_tax_details_updated_at
  BEFORE UPDATE ON app.employee_tax_details
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Comments
COMMENT ON TABLE app.employee_tax_details IS 'Effective-dated HMRC tax details per employee (tax code, NI number, NI category, student loan plan)';
COMMENT ON COLUMN app.employee_tax_details.tax_code IS 'HMRC PAYE tax code (e.g., 1257L, BR, D0, K500L, S1257L)';
COMMENT ON COLUMN app.employee_tax_details.ni_number IS 'National Insurance number (format: XX123456A)';
COMMENT ON COLUMN app.employee_tax_details.ni_category IS 'HMRC NI category letter: A, B, C, F, H, I, J, L, M, S, V, Z';
COMMENT ON COLUMN app.employee_tax_details.student_loan_plan IS 'Student loan repayment plan: none, plan1, plan2, plan4, plan5, postgrad';
COMMENT ON COLUMN app.employee_tax_details.effective_from IS 'Start date for these tax details';
COMMENT ON COLUMN app.employee_tax_details.effective_to IS 'End date for these tax details (NULL = current/open-ended)';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- ALTER TABLE app.employee_tax_details DROP CONSTRAINT IF EXISTS excl_tax_details_overlap;
-- DROP TRIGGER IF EXISTS trg_employee_tax_details_updated_at ON app.employee_tax_details;
-- DROP TABLE IF EXISTS app.employee_tax_details;
-- DROP TRIGGER IF EXISTS trg_payroll_lines_updated_at ON app.payroll_lines;
-- DROP TABLE IF EXISTS app.payroll_lines;
-- DROP TRIGGER IF EXISTS trg_payroll_runs_updated_at ON app.payroll_runs;
-- DROP TABLE IF EXISTS app.payroll_runs;
-- DROP TYPE IF EXISTS app.payment_method;
-- DROP TYPE IF EXISTS app.student_loan_plan;
-- DROP TYPE IF EXISTS app.payroll_run_type;
-- DROP TYPE IF EXISTS app.payroll_run_status;
