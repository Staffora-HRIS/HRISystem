-- Migration: 0098_benefit_plans
-- Created: 2026-01-16
-- Description: Create benefit plans table for Benefits Administration

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Benefit carriers table
CREATE TABLE IF NOT EXISTS app.benefit_carriers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    code varchar(50),
    contact_email varchar(255),
    contact_phone varchar(50),
    website varchar(500),
    address jsonb,
    notes text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_carrier_name UNIQUE (tenant_id, name)
);

-- Benefit plans table
CREATE TABLE IF NOT EXISTS app.benefit_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    carrier_id uuid REFERENCES app.benefit_carriers(id),

    -- Plan identification
    name varchar(100) NOT NULL,
    plan_code varchar(50),
    category app.benefit_category NOT NULL,
    description text,

    -- Contributions
    contribution_type app.contribution_type NOT NULL,
    employee_contribution_amount decimal(10,2),
    employee_contribution_percentage decimal(5,2),
    employer_contribution_amount decimal(10,2),
    employer_contribution_percentage decimal(5,2),
    contribution_frequency varchar(20) DEFAULT 'monthly', -- weekly, biweekly, monthly

    -- Coverage details
    coverage_details jsonb DEFAULT '{}',
    deductible_individual decimal(10,2),
    deductible_family decimal(10,2),
    out_of_pocket_max_individual decimal(10,2),
    out_of_pocket_max_family decimal(10,2),
    copay_details jsonb DEFAULT '{}',

    -- Eligibility
    eligibility_rules jsonb DEFAULT '{}',
    waiting_period_days integer DEFAULT 0,
    minimum_hours_per_week numeric(5,2),
    eligible_employment_types text[],

    -- Plan periods
    effective_from date NOT NULL,
    effective_to date,
    plan_year_start date,
    plan_year_end date,

    -- Status
    is_active boolean NOT NULL DEFAULT true,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_plan_code UNIQUE (tenant_id, plan_code)
);

-- Benefit plan costs by coverage level
CREATE TABLE IF NOT EXISTS app.benefit_plan_costs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    plan_id uuid NOT NULL REFERENCES app.benefit_plans(id) ON DELETE CASCADE,
    coverage_level app.coverage_level NOT NULL,
    employee_cost decimal(10,2) NOT NULL,
    employer_cost decimal(10,2) NOT NULL,
    total_cost decimal(10,2) GENERATED ALWAYS AS (employee_cost + employer_cost) STORED,
    effective_from date NOT NULL,
    effective_to date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_plan_coverage_level UNIQUE (plan_id, coverage_level, effective_from)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_benefit_carriers_tenant
    ON app.benefit_carriers(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_benefit_plans_tenant_category
    ON app.benefit_plans(tenant_id, category, is_active);

CREATE INDEX IF NOT EXISTS idx_benefit_plans_effective
    ON app.benefit_plans(tenant_id, effective_from, effective_to)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_benefit_plan_costs_plan
    ON app.benefit_plan_costs(plan_id, effective_from);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.benefit_carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.benefit_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.benefit_plan_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.benefit_carriers
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.benefit_plans
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.benefit_plan_costs
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_benefit_carriers_updated_at
    BEFORE UPDATE ON app.benefit_carriers
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_benefit_plans_updated_at
    BEFORE UPDATE ON app.benefit_plans
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_benefit_plan_costs_updated_at
    BEFORE UPDATE ON app.benefit_plan_costs
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Get active benefit plans for a tenant
CREATE OR REPLACE FUNCTION app.get_active_benefit_plans(
    p_tenant_id uuid,
    p_category app.benefit_category DEFAULT NULL,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    id uuid,
    name varchar,
    plan_code varchar,
    category app.benefit_category,
    carrier_name varchar,
    contribution_type app.contribution_type,
    description text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        bp.id,
        bp.name,
        bp.plan_code,
        bp.category,
        bc.name as carrier_name,
        bp.contribution_type,
        bp.description
    FROM app.benefit_plans bp
    LEFT JOIN app.benefit_carriers bc ON bp.carrier_id = bc.id
    WHERE bp.tenant_id = p_tenant_id
      AND bp.is_active = true
      AND bp.effective_from <= p_as_of_date
      AND (bp.effective_to IS NULL OR bp.effective_to > p_as_of_date)
      AND (p_category IS NULL OR bp.category = p_category)
    ORDER BY bp.category, bp.name;
END;
$$;

-- Get plan costs by coverage level
CREATE OR REPLACE FUNCTION app.get_plan_costs(
    p_plan_id uuid,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    coverage_level app.coverage_level,
    employee_cost decimal,
    employer_cost decimal,
    total_cost decimal
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        bpc.coverage_level,
        bpc.employee_cost,
        bpc.employer_cost,
        bpc.total_cost
    FROM app.benefit_plan_costs bpc
    WHERE bpc.plan_id = p_plan_id
      AND bpc.effective_from <= p_as_of_date
      AND (bpc.effective_to IS NULL OR bpc.effective_to > p_as_of_date)
    ORDER BY
        CASE bpc.coverage_level
            WHEN 'employee_only' THEN 1
            WHEN 'employee_spouse' THEN 2
            WHEN 'employee_children' THEN 3
            WHEN 'family' THEN 4
        END;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.benefit_carriers IS 'Insurance carriers and benefit providers';
COMMENT ON TABLE app.benefit_plans IS 'Benefit plan definitions';
COMMENT ON TABLE app.benefit_plan_costs IS 'Cost structure by coverage level for each plan';

COMMENT ON COLUMN app.benefit_plans.eligibility_rules IS 'JSON rules for determining employee eligibility';
COMMENT ON COLUMN app.benefit_plans.coverage_details IS 'Type-specific coverage details (in/out network, etc.)';
COMMENT ON COLUMN app.benefit_plans.copay_details IS 'Copay information by service type';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_plan_costs(uuid, date);
-- DROP FUNCTION IF EXISTS app.get_active_benefit_plans(uuid, app.benefit_category, date);
-- DROP TRIGGER IF EXISTS trg_benefit_plan_costs_updated_at ON app.benefit_plan_costs;
-- DROP TRIGGER IF EXISTS trg_benefit_plans_updated_at ON app.benefit_plans;
-- DROP TRIGGER IF EXISTS trg_benefit_carriers_updated_at ON app.benefit_carriers;
-- DROP POLICY IF EXISTS tenant_isolation ON app.benefit_plan_costs;
-- DROP POLICY IF EXISTS tenant_isolation ON app.benefit_plans;
-- DROP POLICY IF EXISTS tenant_isolation ON app.benefit_carriers;
-- DROP TABLE IF EXISTS app.benefit_plan_costs;
-- DROP TABLE IF EXISTS app.benefit_plans;
-- DROP TABLE IF EXISTS app.benefit_carriers;
