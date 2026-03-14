-- Migration: 0143_nmw_compliance
-- Created: 2026-03-13
-- Description: National Minimum Wage / National Living Wage compliance checking.
--              UK employers are legally required to pay at least NMW/NLW based
--              on employee age (National Minimum Wage Act 1998).
--
--              Implements:
--              - nmw_rates: System-wide and tenant-override NMW/NLW rates
--              - nmw_compliance_checks: Audit trail of compliance checks
--
--              Current UK rates (April 2025):
--              - NLW (21+):  £12.21/hour
--              - 18-20:      £10.00/hour
--              - 16-17:      £7.55/hour
--              - Apprentice:  £7.55/hour
--
--              All tables are tenant-scoped with RLS policies.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- NMW rate type
DO $$ BEGIN
  CREATE TYPE app.nmw_rate_type AS ENUM (
    'national_living_wage',
    'national_minimum_wage',
    'apprentice'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- nmw_rates - NMW/NLW Rate Configuration
-- -----------------------------------------------------------------------------
-- Stores the statutory minimum wage rates by age band and effective date.
-- Rows with tenant_id IS NULL are system-wide defaults (seeded below).
-- Tenants can override rates for their own compliance views, but they cannot
-- go below the statutory minimum (enforced at the service layer, not DB).

CREATE TABLE IF NOT EXISTS app.nmw_rates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- NULL = system-wide rate; set = tenant-specific override
    tenant_id       uuid REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Human-readable label, e.g. "NLW 21+"
    rate_name       varchar(100) NOT NULL,

    -- Age band: age_from <= employee age < age_to (NULL age_to = no upper bound)
    age_from        int NOT NULL CHECK (age_from >= 0),
    age_to          int CHECK (age_to IS NULL OR age_to > age_from),

    -- Hourly rate in GBP
    hourly_rate     numeric(6,2) NOT NULL CHECK (hourly_rate > 0),

    -- Effective dating for rate validity
    effective_from  date NOT NULL,
    effective_to    date CHECK (effective_to IS NULL OR effective_to > effective_from),

    -- Classification
    rate_type       app.nmw_rate_type NOT NULL,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),

    -- Prevent duplicate rates for the same age band and effective period
    CONSTRAINT nmw_rates_no_duplicate_band UNIQUE (tenant_id, rate_type, age_from, effective_from)
);

-- RLS
ALTER TABLE app.nmw_rates ENABLE ROW LEVEL SECURITY;

-- System rows (tenant_id IS NULL) are visible to everyone.
-- Tenant rows are only visible to that tenant.
CREATE POLICY nmw_rates_tenant_isolation ON app.nmw_rates
    USING (
        tenant_id IS NULL
        OR tenant_id = current_setting('app.current_tenant', true)::uuid
    );

CREATE POLICY nmw_rates_tenant_insert ON app.nmw_rates
    FOR INSERT
    WITH CHECK (
        tenant_id IS NULL
        OR tenant_id = current_setting('app.current_tenant', true)::uuid
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nmw_rates_tenant
    ON app.nmw_rates(tenant_id)
    WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nmw_rates_effective
    ON app.nmw_rates(effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_nmw_rates_age_band
    ON app.nmw_rates(age_from, age_to);

-- -----------------------------------------------------------------------------
-- nmw_compliance_checks - Compliance Check Audit Trail
-- -----------------------------------------------------------------------------
-- Records every NMW/NLW compliance check performed, whether automated or
-- manual. Stores the employee's age at check time, the applicable rate,
-- the actual hourly rate derived from their compensation, and the result.

CREATE TABLE IF NOT EXISTS app.nmw_compliance_checks (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant scope (required for all compliance checks)
    tenant_id           uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The employee being checked
    employee_id         uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- When the check was performed
    check_date          date NOT NULL DEFAULT CURRENT_DATE,

    -- Employee's age at the time of the check
    employee_age        int NOT NULL CHECK (employee_age >= 0 AND employee_age <= 120),

    -- The statutory rate that applies based on age
    applicable_rate     numeric(6,2) NOT NULL CHECK (applicable_rate > 0),

    -- The employee's actual derived hourly rate
    actual_hourly_rate  numeric(6,2) NOT NULL CHECK (actual_hourly_rate >= 0),

    -- Whether the employee is compliant (actual >= applicable)
    compliant           boolean NOT NULL,

    -- Hourly shortfall if non-compliant (applicable - actual), NULL when compliant
    shortfall           numeric(6,2) CHECK (
                            (compliant = true AND shortfall IS NULL)
                            OR (compliant = false AND shortfall IS NOT NULL AND shortfall > 0)
                        ),

    -- Who/what triggered the check
    checked_by          varchar(50) NOT NULL DEFAULT 'system',

    -- Free-text notes (e.g. "Apprentice exemption applied", "Manual review")
    notes               text,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.nmw_compliance_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY nmw_compliance_checks_tenant_isolation ON app.nmw_compliance_checks
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY nmw_compliance_checks_tenant_insert ON app.nmw_compliance_checks
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nmw_compliance_checks_tenant
    ON app.nmw_compliance_checks(tenant_id);

CREATE INDEX IF NOT EXISTS idx_nmw_compliance_checks_employee
    ON app.nmw_compliance_checks(tenant_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_nmw_compliance_checks_date
    ON app.nmw_compliance_checks(tenant_id, check_date);

CREATE INDEX IF NOT EXISTS idx_nmw_compliance_checks_non_compliant
    ON app.nmw_compliance_checks(tenant_id, check_date)
    WHERE compliant = false;

-- -----------------------------------------------------------------------------
-- Seed: Current UK NMW/NLW Rates (April 2025 onwards)
-- -----------------------------------------------------------------------------
-- These are system-wide rows (tenant_id = NULL). Inserted via system context
-- since RLS won't allow inserts without a tenant.

SELECT app.enable_system_context();

INSERT INTO app.nmw_rates (id, tenant_id, rate_name, age_from, age_to, hourly_rate, effective_from, effective_to, rate_type, created_at)
VALUES
    -- National Living Wage: 21 and over
    (gen_random_uuid(), NULL, 'National Living Wage (21+)', 21, NULL, 12.21, '2025-04-01', NULL, 'national_living_wage', now()),
    -- National Minimum Wage: 18 to 20
    (gen_random_uuid(), NULL, 'National Minimum Wage (18-20)', 18, 21, 10.00, '2025-04-01', NULL, 'national_minimum_wage', now()),
    -- National Minimum Wage: 16 to 17
    (gen_random_uuid(), NULL, 'National Minimum Wage (16-17)', 16, 18, 7.55, '2025-04-01', NULL, 'national_minimum_wage', now()),
    -- Apprentice rate: any age (apprentice in first year or under 19)
    (gen_random_uuid(), NULL, 'Apprentice Rate', 0, NULL, 7.55, '2025-04-01', NULL, 'apprentice', now())
ON CONFLICT DO NOTHING;

SELECT app.disable_system_context();

-- =============================================================================
-- DOWN Migration
-- =============================================================================
-- To rollback:
--   DROP TABLE IF EXISTS app.nmw_compliance_checks CASCADE;
--   DROP TABLE IF EXISTS app.nmw_rates CASCADE;
--   DROP TYPE IF EXISTS app.nmw_rate_type CASCADE;
