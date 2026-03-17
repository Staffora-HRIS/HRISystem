-- Migration: 0199_income_protection_insurance
-- Created: 2026-03-17
-- Description: Income Protection Insurance management (TODO-259)
--
--              Two tables:
--              - income_protection_policies: employer-level policy configuration
--              - income_protection_enrollments: employee enrollment records
--
--              Income protection (also known as permanent health insurance)
--              provides a replacement income if an employee is unable to work
--              due to illness or injury. Typical UK group income protection
--              pays 50-75% of salary after a deferred period (e.g. 13/26/52 weeks).
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enum: income_protection_policy_status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.income_protection_policy_status AS ENUM (
    'draft',
    'active',
    'suspended',
    'terminated'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.income_protection_policy_status IS 'Lifecycle status of an income protection policy';

-- -----------------------------------------------------------------------------
-- Enum: income_protection_enrollment_status
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.income_protection_enrollment_status AS ENUM (
    'pending',
    'active',
    'on_claim',
    'suspended',
    'terminated',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.income_protection_enrollment_status IS 'Status of an employee income protection enrollment';

-- -----------------------------------------------------------------------------
-- Enum: income_protection_benefit_basis
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.income_protection_benefit_basis AS ENUM (
    'percentage_of_salary',
    'fixed_amount',
    'tiered'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.income_protection_benefit_basis IS 'How the income protection benefit amount is calculated';

-- -----------------------------------------------------------------------------
-- Enum: income_protection_deferred_period
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app.income_protection_deferred_period AS ENUM (
    '4_weeks',
    '8_weeks',
    '13_weeks',
    '26_weeks',
    '52_weeks'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE app.income_protection_deferred_period IS 'Waiting period before income protection benefits begin';

-- -----------------------------------------------------------------------------
-- Table: income_protection_policies
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.income_protection_policies (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  name          text        NOT NULL,
  policy_number text,
  provider_name text        NOT NULL,
  provider_contact_email text,
  provider_contact_phone text,
  status        app.income_protection_policy_status NOT NULL DEFAULT 'draft',
  benefit_basis app.income_protection_benefit_basis NOT NULL DEFAULT 'percentage_of_salary',
  benefit_percentage numeric(5, 2) CHECK (benefit_percentage IS NULL OR (benefit_percentage > 0 AND benefit_percentage <= 100)),
  benefit_fixed_amount numeric(12, 2) CHECK (benefit_fixed_amount IS NULL OR benefit_fixed_amount > 0),
  benefit_cap   numeric(12, 2) CHECK (benefit_cap IS NULL OR benefit_cap > 0),
  deferred_period app.income_protection_deferred_period NOT NULL DEFAULT '26_weeks',
  max_benefit_age integer NOT NULL DEFAULT 65 CHECK (max_benefit_age >= 50 AND max_benefit_age <= 75),
  employer_contribution_pct numeric(5, 2) NOT NULL DEFAULT 100.00 CHECK (employer_contribution_pct >= 0 AND employer_contribution_pct <= 100),
  employee_contribution_pct numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (employee_contribution_pct >= 0 AND employee_contribution_pct <= 100),
  effective_from date        NOT NULL,
  effective_to   date,
  eligibility_rules jsonb   NOT NULL DEFAULT '{}'::jsonb,
  notes         text,
  created_by    uuid,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ip_policy_effective_dates CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT ip_policy_contributions CHECK (employer_contribution_pct + employee_contribution_pct <= 100)
);

COMMENT ON TABLE app.income_protection_policies IS 'Employer income protection insurance policy configuration';
COMMENT ON COLUMN app.income_protection_policies.benefit_percentage IS 'Percentage of salary paid as benefit (e.g. 75 for 75%)';
COMMENT ON COLUMN app.income_protection_policies.benefit_cap IS 'Maximum annual benefit amount in GBP';
COMMENT ON COLUMN app.income_protection_policies.deferred_period IS 'Waiting period before benefits start paying';
COMMENT ON COLUMN app.income_protection_policies.max_benefit_age IS 'Age at which benefits cease (typically state pension age)';
COMMENT ON COLUMN app.income_protection_policies.eligibility_rules IS 'JSON rules defining employee eligibility criteria';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ip_policies_tenant
  ON app.income_protection_policies (tenant_id);

CREATE INDEX IF NOT EXISTS idx_ip_policies_status
  ON app.income_protection_policies (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_ip_policies_effective
  ON app.income_protection_policies (tenant_id, effective_from, effective_to);

-- RLS
ALTER TABLE app.income_protection_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.income_protection_policies
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.income_protection_policies
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Grant to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.income_protection_policies TO hris_app;

-- -----------------------------------------------------------------------------
-- Table: income_protection_enrollments
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.income_protection_enrollments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  policy_id     uuid        NOT NULL REFERENCES app.income_protection_policies(id) ON DELETE RESTRICT,
  employee_id   uuid        NOT NULL,
  status        app.income_protection_enrollment_status NOT NULL DEFAULT 'pending',
  effective_from date       NOT NULL,
  effective_to   date,
  annual_salary_at_enrollment numeric(12, 2),
  annual_benefit_amount numeric(12, 2),
  employee_premium_monthly numeric(10, 2) NOT NULL DEFAULT 0,
  employer_premium_monthly numeric(10, 2) NOT NULL DEFAULT 0,
  claim_start_date date,
  claim_end_date   date,
  claim_reason     text,
  notes         text,
  created_by    uuid,
  updated_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ip_enrollment_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT ip_enrollment_claim_dates CHECK (
    (claim_start_date IS NULL AND claim_end_date IS NULL)
    OR (claim_start_date IS NOT NULL)
  ),
  CONSTRAINT ip_enrollment_claim_end CHECK (
    claim_end_date IS NULL OR (claim_start_date IS NOT NULL AND claim_end_date >= claim_start_date)
  )
);

COMMENT ON TABLE app.income_protection_enrollments IS 'Employee enrollment in an income protection policy';
COMMENT ON COLUMN app.income_protection_enrollments.annual_salary_at_enrollment IS 'Salary snapshot at time of enrollment for benefit calculation';
COMMENT ON COLUMN app.income_protection_enrollments.annual_benefit_amount IS 'Calculated annual benefit amount based on policy rules';
COMMENT ON COLUMN app.income_protection_enrollments.claim_start_date IS 'Date the employee began claiming (after deferred period)';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ip_enrollments_tenant
  ON app.income_protection_enrollments (tenant_id);

CREATE INDEX IF NOT EXISTS idx_ip_enrollments_policy
  ON app.income_protection_enrollments (policy_id);

CREATE INDEX IF NOT EXISTS idx_ip_enrollments_employee
  ON app.income_protection_enrollments (tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_ip_enrollments_status
  ON app.income_protection_enrollments (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_ip_enrollments_effective
  ON app.income_protection_enrollments (tenant_id, employee_id, effective_from, effective_to);

-- Prevent overlapping active enrollments for the same employee under the same policy
CREATE UNIQUE INDEX IF NOT EXISTS idx_ip_enrollments_no_overlap
  ON app.income_protection_enrollments (tenant_id, employee_id, policy_id)
  WHERE status IN ('pending', 'active', 'on_claim') AND effective_to IS NULL;

-- RLS
ALTER TABLE app.income_protection_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.income_protection_enrollments
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.income_protection_enrollments
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Grant to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.income_protection_enrollments TO hris_app;


-- =============================================================================
-- DOWN Migration
-- =============================================================================
-- To rollback:
--   DROP TABLE IF EXISTS app.income_protection_enrollments CASCADE;
--   DROP TABLE IF EXISTS app.income_protection_policies CASCADE;
--   DROP TYPE IF EXISTS app.income_protection_deferred_period;
--   DROP TYPE IF EXISTS app.income_protection_benefit_basis;
--   DROP TYPE IF EXISTS app.income_protection_enrollment_status;
--   DROP TYPE IF EXISTS app.income_protection_policy_status;
