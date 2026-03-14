-- Migration: 0158_pension_auto_enrolment
-- Created: 2026-03-14
-- Description: UK Workplace Pension Auto-Enrolment (Pensions Act 2008)
--
--              Employers face criminal prosecution for failing to comply.
--
--              Three tables:
--              - pension_schemes: employer pension scheme configuration
--              - pension_enrolments: employee enrolment records with status tracking
--              - pension_contributions: pay-period contribution calculations
--
--              Key compliance rules implemented:
--              - Eligible jobholders (22-SPA, >£10,000/yr): MUST auto-enrol
--              - Non-eligible jobholders (16-74, £6,240-£10,000): may opt in
--              - Entitled workers (16-74, <£6,240): may request membership
--              - Qualifying earnings band: £6,240 - £50,270 (2024/25)
--              - Employer min 3%, Employee min 5% of qualifying earnings
--              - Opt-out window: 1 month from enrolment date
--              - Re-enrolment every 3 years for opted-out workers
--              - Postponement: up to 3 months deferral
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: pension_scheme_type
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.pension_scheme_type AS ENUM (
    'defined_contribution',
    'master_trust'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.pension_scheme_type IS 'Type of workplace pension scheme';

-- -----------------------------------------------------------------------------
-- Enum: pension_scheme_status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.pension_scheme_status AS ENUM (
    'active',
    'closed',
    'suspended'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.pension_scheme_status IS 'Operational status of a pension scheme';

-- -----------------------------------------------------------------------------
-- Enum: pension_enrolment_status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.pension_enrolment_status AS ENUM (
    'eligible',
    'enrolled',
    'opted_out',
    'ceased',
    're_enrolled',
    'postponed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.pension_enrolment_status IS 'Auto-enrolment lifecycle status (Pensions Act 2008)';

-- -----------------------------------------------------------------------------
-- Enum: pension_worker_category
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.pension_worker_category AS ENUM (
    'eligible_jobholder',
    'non_eligible_jobholder',
    'entitled_worker',
    'not_applicable'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.pension_worker_category IS 'Worker category for auto-enrolment assessment';

-- -----------------------------------------------------------------------------
-- Enum: pension_contribution_status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.pension_contribution_status AS ENUM (
    'calculated',
    'submitted',
    'confirmed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.pension_contribution_status IS 'Processing status of pension contribution records';

-- -----------------------------------------------------------------------------
-- Table: pension_schemes
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.pension_schemes (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL,

  -- Scheme details
  name                        varchar(255) NOT NULL,
  provider                    varchar(255) NOT NULL,
  scheme_type                 app.pension_scheme_type NOT NULL,

  -- Contribution rates (stored as percentage, e.g., 3.00 = 3%)
  employer_contribution_pct   numeric(5,2) NOT NULL DEFAULT 3.00,
  employee_contribution_pct   numeric(5,2) NOT NULL DEFAULT 5.00,

  -- Qualifying earnings band thresholds (annual, in pence for precision)
  -- 2024/25: lower = £6,240, upper = £50,270
  qualifying_earnings_lower   integer NOT NULL DEFAULT 624000,
  qualifying_earnings_upper   integer NOT NULL DEFAULT 5027000,

  -- Flags
  is_default                  boolean NOT NULL DEFAULT false,
  status                      app.pension_scheme_status NOT NULL DEFAULT 'active',

  -- Standard timestamps
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- Constraints: minimum statutory contribution rates
  CONSTRAINT chk_employer_contribution_min CHECK (employer_contribution_pct >= 3.00),
  CONSTRAINT chk_employee_contribution_min CHECK (employee_contribution_pct >= 0),
  CONSTRAINT chk_total_contribution_min CHECK (employer_contribution_pct + employee_contribution_pct >= 8.00),
  CONSTRAINT chk_qualifying_earnings_band CHECK (qualifying_earnings_upper > qualifying_earnings_lower),
  CONSTRAINT chk_qualifying_earnings_lower_positive CHECK (qualifying_earnings_lower >= 0)
);

-- RLS
ALTER TABLE app.pension_schemes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.pension_schemes
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.pension_schemes
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pension_schemes_tenant
  ON app.pension_schemes (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pension_schemes_tenant_name
  ON app.pension_schemes (tenant_id, name);

-- Only one default scheme per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_pension_schemes_tenant_default
  ON app.pension_schemes (tenant_id)
  WHERE is_default = true;

-- Updated_at trigger
CREATE TRIGGER trg_pension_schemes_updated_at
  BEFORE UPDATE ON app.pension_schemes
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Comments
COMMENT ON TABLE app.pension_schemes IS 'Workplace pension schemes for UK auto-enrolment compliance (Pensions Act 2008)';
COMMENT ON COLUMN app.pension_schemes.employer_contribution_pct IS 'Employer contribution percentage (minimum 3% statutory)';
COMMENT ON COLUMN app.pension_schemes.employee_contribution_pct IS 'Employee contribution percentage (minimum 5% of qualifying earnings when combined with employer to meet 8% total)';
COMMENT ON COLUMN app.pension_schemes.qualifying_earnings_lower IS 'Lower limit of qualifying earnings band in pence (2024/25: 624000 = £6,240)';
COMMENT ON COLUMN app.pension_schemes.qualifying_earnings_upper IS 'Upper limit of qualifying earnings band in pence (2024/25: 5027000 = £50,270)';
COMMENT ON COLUMN app.pension_schemes.is_default IS 'Whether this is the default pension scheme for auto-enrolment';

-- -----------------------------------------------------------------------------
-- Table: pension_enrolments
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.pension_enrolments (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL,
  employee_id                 uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
  scheme_id                   uuid NOT NULL REFERENCES app.pension_schemes(id) ON DELETE RESTRICT,

  -- Worker classification at time of assessment
  worker_category             app.pension_worker_category NOT NULL DEFAULT 'not_applicable',

  -- Enrolment status lifecycle
  status                      app.pension_enrolment_status NOT NULL DEFAULT 'eligible',

  -- Key dates
  enrolment_date              date,
  opt_out_deadline            date,
  opted_out_at                timestamptz,
  opt_out_reason              text,
  re_enrolment_date           date,
  postponement_end_date       date,
  contributions_start_date    date,

  -- Assessment data snapshot (annual earnings at assessment time, in pence)
  assessed_annual_earnings    integer,
  assessed_age                integer,

  -- Standard timestamps
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_opt_out_deadline CHECK (
    opt_out_deadline IS NULL OR enrolment_date IS NULL
    OR opt_out_deadline >= enrolment_date
  ),
  CONSTRAINT chk_postponement_max CHECK (
    postponement_end_date IS NULL
    OR postponement_end_date <= (created_at::date + INTERVAL '3 months')::date
  ),
  CONSTRAINT chk_contributions_start CHECK (
    contributions_start_date IS NULL OR enrolment_date IS NULL
    OR contributions_start_date >= enrolment_date
  )
);

-- RLS
ALTER TABLE app.pension_enrolments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.pension_enrolments
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.pension_enrolments
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pension_enrolments_tenant
  ON app.pension_enrolments (tenant_id);

CREATE INDEX IF NOT EXISTS idx_pension_enrolments_tenant_employee
  ON app.pension_enrolments (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_pension_enrolments_tenant_status
  ON app.pension_enrolments (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_pension_enrolments_scheme
  ON app.pension_enrolments (tenant_id, scheme_id);

CREATE INDEX IF NOT EXISTS idx_pension_enrolments_re_enrolment
  ON app.pension_enrolments (tenant_id, re_enrolment_date)
  WHERE status = 'opted_out' AND re_enrolment_date IS NOT NULL;

-- Updated_at trigger
CREATE TRIGGER trg_pension_enrolments_updated_at
  BEFORE UPDATE ON app.pension_enrolments
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Comments
COMMENT ON TABLE app.pension_enrolments IS 'Employee pension auto-enrolment records tracking the full lifecycle (Pensions Act 2008)';
COMMENT ON COLUMN app.pension_enrolments.worker_category IS 'Worker category at time of assessment: eligible_jobholder, non_eligible_jobholder, entitled_worker, not_applicable';
COMMENT ON COLUMN app.pension_enrolments.status IS 'Enrolment lifecycle status: eligible, enrolled, opted_out, ceased, re_enrolled, postponed';
COMMENT ON COLUMN app.pension_enrolments.opt_out_deadline IS 'Last date the employee can opt out (1 month from enrolment_date)';
COMMENT ON COLUMN app.pension_enrolments.re_enrolment_date IS 'Date for automatic re-enrolment (every 3 years from opt-out)';
COMMENT ON COLUMN app.pension_enrolments.postponement_end_date IS 'End date of assessment postponement (max 3 months)';
COMMENT ON COLUMN app.pension_enrolments.assessed_annual_earnings IS 'Annualised earnings in pence at time of assessment';
COMMENT ON COLUMN app.pension_enrolments.assessed_age IS 'Employee age at time of assessment';

-- -----------------------------------------------------------------------------
-- Table: pension_contributions
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.pension_contributions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL,
  enrolment_id                uuid NOT NULL REFERENCES app.pension_enrolments(id) ON DELETE CASCADE,
  employee_id                 uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

  -- Pay period
  pay_period_start            date NOT NULL,
  pay_period_end              date NOT NULL,

  -- Amounts (in pence for precision)
  qualifying_earnings         integer NOT NULL DEFAULT 0,
  employer_amount             integer NOT NULL DEFAULT 0,
  employee_amount             integer NOT NULL DEFAULT 0,
  total_amount                integer NOT NULL DEFAULT 0,

  -- Processing status
  status                      app.pension_contribution_status NOT NULL DEFAULT 'calculated',

  -- Standard timestamps
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT chk_contribution_pay_period CHECK (pay_period_end >= pay_period_start),
  CONSTRAINT chk_contribution_amounts_positive CHECK (
    qualifying_earnings >= 0
    AND employer_amount >= 0
    AND employee_amount >= 0
    AND total_amount >= 0
  ),
  CONSTRAINT chk_contribution_total CHECK (
    total_amount = employer_amount + employee_amount
  )
);

-- RLS
ALTER TABLE app.pension_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.pension_contributions
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.pension_contributions
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pension_contributions_tenant
  ON app.pension_contributions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_pension_contributions_enrolment
  ON app.pension_contributions (tenant_id, enrolment_id);

CREATE INDEX IF NOT EXISTS idx_pension_contributions_employee
  ON app.pension_contributions (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_pension_contributions_period
  ON app.pension_contributions (tenant_id, pay_period_start, pay_period_end);

CREATE INDEX IF NOT EXISTS idx_pension_contributions_status
  ON app.pension_contributions (tenant_id, status);

-- Prevent duplicate contribution records for the same enrolment and pay period
CREATE UNIQUE INDEX IF NOT EXISTS idx_pension_contributions_unique_period
  ON app.pension_contributions (tenant_id, enrolment_id, pay_period_start, pay_period_end);

-- Updated_at trigger
CREATE TRIGGER trg_pension_contributions_updated_at
  BEFORE UPDATE ON app.pension_contributions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Comments
COMMENT ON TABLE app.pension_contributions IS 'Pension contribution calculations per pay period for auto-enrolled employees';
COMMENT ON COLUMN app.pension_contributions.qualifying_earnings IS 'Qualifying earnings for this pay period in pence (gross pay capped to qualifying earnings band)';
COMMENT ON COLUMN app.pension_contributions.employer_amount IS 'Employer contribution amount in pence';
COMMENT ON COLUMN app.pension_contributions.employee_amount IS 'Employee contribution amount in pence';
COMMENT ON COLUMN app.pension_contributions.total_amount IS 'Total contribution (employer + employee) in pence';
COMMENT ON COLUMN app.pension_contributions.status IS 'Processing status: calculated, submitted, confirmed';

-- =============================================================================
-- DOWN Migration (commented out for safety)
-- =============================================================================

-- DROP TRIGGER IF EXISTS trg_pension_contributions_updated_at ON app.pension_contributions;
-- DROP TABLE IF EXISTS app.pension_contributions;
-- DROP TRIGGER IF EXISTS trg_pension_enrolments_updated_at ON app.pension_enrolments;
-- DROP TABLE IF EXISTS app.pension_enrolments;
-- DROP TRIGGER IF EXISTS trg_pension_schemes_updated_at ON app.pension_schemes;
-- DROP TABLE IF EXISTS app.pension_schemes;
-- DROP TYPE IF EXISTS app.pension_contribution_status;
-- DROP TYPE IF EXISTS app.pension_worker_category;
-- DROP TYPE IF EXISTS app.pension_enrolment_status;
-- DROP TYPE IF EXISTS app.pension_scheme_status;
-- DROP TYPE IF EXISTS app.pension_scheme_type;
