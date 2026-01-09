-- Migration: 0048_leave_policies
-- Created: 2026-01-07
-- Description: Create the leave_policies table - defines leave entitlements by scope
--              Policies determine how much leave employees get based on:
--              - Organization unit (department/division)
--              - Country/region (for global organizations)
--              - Employment type (full-time, part-time)
--              - Tenure (years of service)
--              Supports effective dating for policy changes over time
--              Priority field enables policy matching when multiple policies apply

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leave Policies Table
-- -----------------------------------------------------------------------------
-- Defines leave entitlement policies that can be scoped to different groups
-- Multiple policies can exist for the same leave type with different scopes
-- Priority determines which policy applies when multiple match an employee
CREATE TABLE IF NOT EXISTS app.leave_policies (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this policy
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Human-readable name (e.g., 'US Annual Leave - Full Time')
    name varchar(255) NOT NULL,

    -- Detailed description of the policy
    description text,

    -- The leave type this policy applies to
    leave_type_id uuid NOT NULL REFERENCES app.leave_types(id) ON DELETE RESTRICT,

    -- ==========================================================================
    -- SCOPE FIELDS - Define who this policy applies to
    -- NULL values mean "applies to all" for that dimension
    -- ==========================================================================

    -- Organization unit scope (NULL = applies to all org units)
    -- If specified, applies to employees in this org unit and descendants
    org_unit_id uuid REFERENCES app.org_units(id) ON DELETE SET NULL,

    -- Country code scope (ISO 3166-1 alpha-3, e.g., 'USA', 'GBR', 'DEU')
    -- NULL = applies to all countries
    country_code varchar(3),

    -- Employment type scope (full_time, part_time from contract)
    -- NULL = applies to all employment types
    employment_type app.employment_type,

    -- ==========================================================================
    -- ELIGIBILITY FIELDS - Determine when policy becomes applicable
    -- ==========================================================================

    -- Minimum days of tenure before this policy applies
    -- 0 = no tenure requirement (applies immediately)
    -- 90 = applies after 3 months (probation period)
    min_tenure_days integer NOT NULL DEFAULT 0,

    -- ==========================================================================
    -- ENTITLEMENT FIELDS - Define the leave balance granted
    -- ==========================================================================

    -- Default annual entitlement in days (or hours if leave type uses hours)
    -- This is the base entitlement before tenure bonuses
    default_balance numeric(6,2) NOT NULL,

    -- Maximum balance cap (prevents excessive accumulation)
    -- NULL = no cap
    -- Important for companies with "use it or lose it" policies
    max_balance numeric(6,2),

    -- ==========================================================================
    -- CARRYOVER FIELDS - Define year-end carryover rules
    -- ==========================================================================

    -- Maximum days that can be carried over to next year
    -- 0 = no carryover allowed (use it or lose it)
    -- NULL treated as 0 for calculation purposes
    max_carryover numeric(6,2) DEFAULT 0,

    -- Months after year-end until carried over balance expires
    -- NULL = never expires (carries indefinitely)
    -- 3 = carried balance expires after Q1 of new year
    carryover_expiry_months integer,

    -- ==========================================================================
    -- PRORATION FIELDS - Handle partial year employment
    -- ==========================================================================

    -- Whether to prorate entitlement for employees who start mid-year
    -- true = calculate based on remaining days in year
    -- false = grant full entitlement regardless of start date
    prorate_on_hire boolean NOT NULL DEFAULT true,

    -- ==========================================================================
    -- EFFECTIVE DATING - Support for policy changes over time
    -- ==========================================================================

    -- When this policy version becomes effective
    -- Allows scheduling future policy changes
    effective_from date NOT NULL,

    -- When this policy version ends (NULL = currently effective)
    -- Setting this date "archives" the policy version
    effective_to date,

    -- Whether this policy is currently active
    -- Inactive policies are not matched but preserved for history
    is_active boolean NOT NULL DEFAULT true,

    -- ==========================================================================
    -- PRIORITY - Policy matching precedence
    -- ==========================================================================

    -- Higher priority policies are matched first when multiple apply
    -- Use this to create specific overrides for certain groups
    -- Example: priority 100 for company-wide default, 200 for department-specific
    priority integer NOT NULL DEFAULT 0,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Default balance must be positive
    CONSTRAINT leave_policies_default_balance_check CHECK (default_balance >= 0),

    -- Max balance must be >= default balance if specified
    CONSTRAINT leave_policies_max_balance_check CHECK (
        max_balance IS NULL OR max_balance >= default_balance
    ),

    -- Max carryover must be non-negative
    CONSTRAINT leave_policies_max_carryover_check CHECK (
        max_carryover IS NULL OR max_carryover >= 0
    ),

    -- Carryover expiry must be positive if specified
    CONSTRAINT leave_policies_carryover_expiry_check CHECK (
        carryover_expiry_months IS NULL OR carryover_expiry_months > 0
    ),

    -- Min tenure days must be non-negative
    CONSTRAINT leave_policies_min_tenure_check CHECK (min_tenure_days >= 0),

    -- Effective dates validation
    CONSTRAINT leave_policies_effective_dates CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),

    -- Priority must be non-negative
    CONSTRAINT leave_policies_priority_check CHECK (priority >= 0),

    -- Country code format (ISO 3166-1 alpha-3)
    CONSTRAINT leave_policies_country_code_format CHECK (
        country_code IS NULL OR country_code ~ '^[A-Z]{3}$'
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + leave type
CREATE INDEX IF NOT EXISTS idx_leave_policies_tenant_leave_type
    ON app.leave_policies(tenant_id, leave_type_id);

-- Policy matching: find applicable policies for an employee
-- This is the most critical query path for leave calculations
CREATE INDEX IF NOT EXISTS idx_leave_policies_matching
    ON app.leave_policies(tenant_id, leave_type_id, is_active, priority DESC)
    WHERE is_active = true;

-- Org unit scope filtering
CREATE INDEX IF NOT EXISTS idx_leave_policies_org_unit
    ON app.leave_policies(tenant_id, org_unit_id)
    WHERE org_unit_id IS NOT NULL;

-- Country scope filtering
CREATE INDEX IF NOT EXISTS idx_leave_policies_country
    ON app.leave_policies(tenant_id, country_code)
    WHERE country_code IS NOT NULL;

-- Employment type scope filtering
CREATE INDEX IF NOT EXISTS idx_leave_policies_employment_type
    ON app.leave_policies(tenant_id, employment_type)
    WHERE employment_type IS NOT NULL;

-- Effective date range queries
CREATE INDEX IF NOT EXISTS idx_leave_policies_effective
    ON app.leave_policies(tenant_id, effective_from, effective_to)
    WHERE is_active = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.leave_policies ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see leave policies for their current tenant
CREATE POLICY tenant_isolation ON app.leave_policies
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.leave_policies
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_leave_policies_updated_at
    BEFORE UPDATE ON app.leave_policies
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to find the best matching policy for an employee and leave type
-- Considers: org unit hierarchy, country, employment type, tenure, effective dates
-- Returns the highest priority matching policy
CREATE OR REPLACE FUNCTION app.find_applicable_leave_policy(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    policy_id uuid,
    policy_name varchar(255),
    default_balance numeric(6,2),
    max_balance numeric(6,2),
    max_carryover numeric(6,2),
    carryover_expiry_months integer,
    prorate_on_hire boolean,
    priority integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_employee_org_unit_id uuid;
    v_employee_country varchar(3);
    v_employee_employment_type app.employment_type;
    v_employee_tenure_days integer;
BEGIN
    -- Get employee details needed for policy matching
    -- This requires joining to employee's current position/contract
    SELECT
        pa.org_unit_id,
        ea.country_code,
        ec.employment_type,
        (p_as_of_date - e.hire_date)
    INTO
        v_employee_org_unit_id,
        v_employee_country,
        v_employee_employment_type,
        v_employee_tenure_days
    FROM app.employees e
    LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id
        AND pa.is_primary = true
        AND pa.start_date <= p_as_of_date
        AND (pa.end_date IS NULL OR pa.end_date >= p_as_of_date)
    LEFT JOIN app.positions pos ON pos.id = pa.position_id
    LEFT JOIN app.employee_addresses ea ON ea.employee_id = e.id
        AND ea.address_type = 'home'
        AND ea.is_primary = true
    LEFT JOIN app.employment_contracts ec ON ec.employee_id = e.id
        AND ec.start_date <= p_as_of_date
        AND (ec.end_date IS NULL OR ec.end_date >= p_as_of_date)
    WHERE e.id = p_employee_id
      AND e.tenant_id = p_tenant_id
    LIMIT 1;

    -- Find best matching policy
    -- Policies are matched by scope (NULL = matches all)
    -- Ordered by priority DESC to get the most specific matching policy
    RETURN QUERY
    SELECT
        lp.id AS policy_id,
        lp.name AS policy_name,
        lp.default_balance,
        lp.max_balance,
        lp.max_carryover,
        lp.carryover_expiry_months,
        lp.prorate_on_hire,
        lp.priority
    FROM app.leave_policies lp
    WHERE lp.tenant_id = p_tenant_id
      AND lp.leave_type_id = p_leave_type_id
      AND lp.is_active = true
      -- Effective date check
      AND lp.effective_from <= p_as_of_date
      AND (lp.effective_to IS NULL OR lp.effective_to >= p_as_of_date)
      -- Tenure eligibility check
      AND lp.min_tenure_days <= COALESCE(v_employee_tenure_days, 0)
      -- Scope matching (NULL means "matches all")
      AND (lp.org_unit_id IS NULL OR lp.org_unit_id = v_employee_org_unit_id)
      AND (lp.country_code IS NULL OR lp.country_code = v_employee_country)
      AND (lp.employment_type IS NULL OR lp.employment_type = v_employee_employment_type)
    ORDER BY lp.priority DESC
    LIMIT 1;
END;
$$;

-- Function to calculate prorated entitlement for mid-year hires
CREATE OR REPLACE FUNCTION app.calculate_prorated_balance(
    p_full_balance numeric,
    p_hire_date date,
    p_year integer
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_year_start date;
    v_year_end date;
    v_days_in_year integer;
    v_days_remaining integer;
BEGIN
    v_year_start := make_date(p_year, 1, 1);
    v_year_end := make_date(p_year, 12, 31);
    v_days_in_year := v_year_end - v_year_start + 1;

    -- If hired before this year, return full balance
    IF p_hire_date < v_year_start THEN
        RETURN p_full_balance;
    END IF;

    -- If hired after this year, return 0
    IF p_hire_date > v_year_end THEN
        RETURN 0;
    END IF;

    -- Calculate prorated amount based on remaining days in year
    v_days_remaining := v_year_end - p_hire_date + 1;

    RETURN ROUND((p_full_balance * v_days_remaining::numeric / v_days_in_year::numeric), 2);
END;
$$;

-- Function to get all policies for a leave type
CREATE OR REPLACE FUNCTION app.get_leave_policies_for_type(
    p_tenant_id uuid,
    p_leave_type_id uuid,
    p_active_only boolean DEFAULT true
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    description text,
    org_unit_id uuid,
    country_code varchar(3),
    employment_type app.employment_type,
    min_tenure_days integer,
    default_balance numeric(6,2),
    max_balance numeric(6,2),
    max_carryover numeric(6,2),
    effective_from date,
    effective_to date,
    is_active boolean,
    priority integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lp.id,
        lp.name,
        lp.description,
        lp.org_unit_id,
        lp.country_code,
        lp.employment_type,
        lp.min_tenure_days,
        lp.default_balance,
        lp.max_balance,
        lp.max_carryover,
        lp.effective_from,
        lp.effective_to,
        lp.is_active,
        lp.priority
    FROM app.leave_policies lp
    WHERE lp.tenant_id = p_tenant_id
      AND lp.leave_type_id = p_leave_type_id
      AND (NOT p_active_only OR lp.is_active = true)
    ORDER BY lp.priority DESC, lp.name ASC;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.leave_policies IS 'Leave entitlement policies scoped by org unit, country, employment type with effective dating';
COMMENT ON COLUMN app.leave_policies.id IS 'Primary UUID identifier for the policy';
COMMENT ON COLUMN app.leave_policies.tenant_id IS 'Tenant that owns this policy';
COMMENT ON COLUMN app.leave_policies.name IS 'Human-readable name for the policy';
COMMENT ON COLUMN app.leave_policies.description IS 'Detailed description of the policy';
COMMENT ON COLUMN app.leave_policies.leave_type_id IS 'The leave type this policy applies to';
COMMENT ON COLUMN app.leave_policies.org_unit_id IS 'Org unit scope (NULL = all org units)';
COMMENT ON COLUMN app.leave_policies.country_code IS 'Country scope (ISO 3166-1 alpha-3, NULL = all countries)';
COMMENT ON COLUMN app.leave_policies.employment_type IS 'Employment type scope (NULL = all types)';
COMMENT ON COLUMN app.leave_policies.min_tenure_days IS 'Minimum days of tenure before policy applies';
COMMENT ON COLUMN app.leave_policies.default_balance IS 'Default annual entitlement in days/hours';
COMMENT ON COLUMN app.leave_policies.max_balance IS 'Maximum balance cap (NULL = no cap)';
COMMENT ON COLUMN app.leave_policies.max_carryover IS 'Maximum days to carry over to next year';
COMMENT ON COLUMN app.leave_policies.carryover_expiry_months IS 'Months until carried balance expires (NULL = never)';
COMMENT ON COLUMN app.leave_policies.prorate_on_hire IS 'Whether to prorate for mid-year hires';
COMMENT ON COLUMN app.leave_policies.effective_from IS 'When this policy version becomes effective';
COMMENT ON COLUMN app.leave_policies.effective_to IS 'When this policy version ends (NULL = current)';
COMMENT ON COLUMN app.leave_policies.is_active IS 'Whether this policy is currently active';
COMMENT ON COLUMN app.leave_policies.priority IS 'Higher priority policies matched first (specificity)';
COMMENT ON FUNCTION app.find_applicable_leave_policy IS 'Finds the best matching policy for an employee and leave type';
COMMENT ON FUNCTION app.calculate_prorated_balance IS 'Calculates prorated entitlement for mid-year hires';
COMMENT ON FUNCTION app.get_leave_policies_for_type IS 'Returns all policies for a leave type';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_leave_policies_for_type(uuid, uuid, boolean);
-- DROP FUNCTION IF EXISTS app.calculate_prorated_balance(numeric, date, integer);
-- DROP FUNCTION IF EXISTS app.find_applicable_leave_policy(uuid, uuid, uuid, date);
-- DROP TRIGGER IF EXISTS update_leave_policies_updated_at ON app.leave_policies;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.leave_policies;
-- DROP POLICY IF EXISTS tenant_isolation ON app.leave_policies;
-- DROP INDEX IF EXISTS app.idx_leave_policies_effective;
-- DROP INDEX IF EXISTS app.idx_leave_policies_employment_type;
-- DROP INDEX IF EXISTS app.idx_leave_policies_country;
-- DROP INDEX IF EXISTS app.idx_leave_policies_org_unit;
-- DROP INDEX IF EXISTS app.idx_leave_policies_matching;
-- DROP INDEX IF EXISTS app.idx_leave_policies_tenant_leave_type;
-- DROP TABLE IF EXISTS app.leave_policies;
