-- Migration: 0049_leave_accrual_rules
-- Created: 2026-01-07
-- Description: Create the leave_accrual_rules table - defines how leave accrues
--              Accrual rules are linked to leave policies and define:
--              - Accrual frequency (monthly, quarterly, yearly, etc.)
--              - Accrual amount per period
--              - Maximum accrual per period (caps)
--              - Tenure-based bonus accruals (more leave for longer service)
--              - First period proration for new employees

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leave Accrual Rules Table
-- -----------------------------------------------------------------------------
-- Defines how leave entitlements accrue for employees under a policy
-- A policy can have multiple accrual rules (e.g., different tiers by tenure)
-- Accrual processing runs periodically to credit earned leave to balances
CREATE TABLE IF NOT EXISTS app.leave_accrual_rules (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this rule
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The policy this accrual rule belongs to
    policy_id uuid NOT NULL REFERENCES app.leave_policies(id) ON DELETE CASCADE,

    -- ==========================================================================
    -- ACCRUAL FREQUENCY AND AMOUNT
    -- ==========================================================================

    -- How often leave accrues
    -- monthly: Credits leave on the 1st of each month
    -- quarterly: Credits leave on Jan 1, Apr 1, Jul 1, Oct 1
    -- yearly: Credits full entitlement on Jan 1 (or hire anniversary)
    -- hire_anniversary: Credits on employee's hire date anniversary
    -- calendar_year: Credits on January 1st
    frequency app.accrual_frequency NOT NULL,

    -- Amount of leave that accrues per period
    -- For monthly: typically (annual_entitlement / 12)
    -- For yearly: full annual entitlement
    amount numeric(6,2) NOT NULL,

    -- Maximum that can accrue in a single period (cap)
    -- Useful for preventing over-accrual in edge cases
    -- NULL = no cap
    max_per_period numeric(6,2),

    -- ==========================================================================
    -- TENURE BONUS CONFIGURATION
    -- ==========================================================================

    -- JSON array defining additional accrual based on years of service
    -- Structure: [{"after_years": 5, "additional_days": 5}, {"after_years": 10, "additional_days": 10}]
    -- This allows progressive increases in entitlement as employees gain tenure
    -- Example: After 5 years, employee gets 5 additional days per year
    --          After 10 years, they get 10 additional days per year
    tenure_bonus jsonb,

    -- ==========================================================================
    -- PRORATION SETTINGS
    -- ==========================================================================

    -- Whether to prorate the first accrual period for new employees
    -- true = employee hired mid-period gets proportional accrual
    -- false = employee gets full period accrual regardless of hire date
    prorate_first_period boolean NOT NULL DEFAULT true,

    -- ==========================================================================
    -- STATUS
    -- ==========================================================================

    -- Whether this accrual rule is currently active
    is_active boolean NOT NULL DEFAULT true,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Accrual amount must be positive
    CONSTRAINT leave_accrual_rules_amount_check CHECK (amount > 0),

    -- Max per period must be >= amount if specified
    CONSTRAINT leave_accrual_rules_max_check CHECK (
        max_per_period IS NULL OR max_per_period >= amount
    ),

    -- Validate tenure_bonus JSON structure
    CONSTRAINT leave_accrual_rules_tenure_bonus_check CHECK (
        tenure_bonus IS NULL
        OR jsonb_typeof(tenure_bonus) = 'array'
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: policy's accrual rules
CREATE INDEX IF NOT EXISTS idx_leave_accrual_rules_policy
    ON app.leave_accrual_rules(tenant_id, policy_id);

-- Frequency-based lookups (for batch accrual processing)
CREATE INDEX IF NOT EXISTS idx_leave_accrual_rules_frequency
    ON app.leave_accrual_rules(tenant_id, frequency)
    WHERE is_active = true;

-- Active rules only
CREATE INDEX IF NOT EXISTS idx_leave_accrual_rules_active
    ON app.leave_accrual_rules(tenant_id)
    WHERE is_active = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.leave_accrual_rules ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see accrual rules for their current tenant
CREATE POLICY tenant_isolation ON app.leave_accrual_rules
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.leave_accrual_rules
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_leave_accrual_rules_updated_at
    BEFORE UPDATE ON app.leave_accrual_rules
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get accrual rules for a policy
CREATE OR REPLACE FUNCTION app.get_accrual_rules_for_policy(
    p_policy_id uuid
)
RETURNS TABLE (
    id uuid,
    frequency app.accrual_frequency,
    amount numeric(6,2),
    max_per_period numeric(6,2),
    tenure_bonus jsonb,
    prorate_first_period boolean,
    is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ar.id,
        ar.frequency,
        ar.amount,
        ar.max_per_period,
        ar.tenure_bonus,
        ar.prorate_first_period,
        ar.is_active
    FROM app.leave_accrual_rules ar
    WHERE ar.policy_id = p_policy_id
      AND ar.is_active = true
    ORDER BY ar.frequency;
END;
$$;

-- Function to calculate tenure bonus for an employee
-- Returns additional days/hours based on years of service
CREATE OR REPLACE FUNCTION app.calculate_tenure_bonus(
    p_tenure_bonus jsonb,
    p_tenure_years numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_bonus numeric := 0;
    v_tier record;
BEGIN
    IF p_tenure_bonus IS NULL OR jsonb_typeof(p_tenure_bonus) != 'array' THEN
        RETURN 0;
    END IF;

    -- Find the highest applicable tier
    -- Tiers are sorted by after_years descending to find the best match
    FOR v_tier IN
        SELECT
            (tier->>'after_years')::numeric AS after_years,
            (tier->>'additional_days')::numeric AS additional_days
        FROM jsonb_array_elements(p_tenure_bonus) AS tier
        WHERE (tier->>'after_years')::numeric <= p_tenure_years
        ORDER BY (tier->>'after_years')::numeric DESC
        LIMIT 1
    LOOP
        v_bonus := v_tier.additional_days;
    END LOOP;

    RETURN COALESCE(v_bonus, 0);
END;
$$;

-- Function to calculate accrual amount for a given period
-- Considers proration for first period and tenure bonuses
CREATE OR REPLACE FUNCTION app.calculate_period_accrual(
    p_accrual_rule_id uuid,
    p_employee_id uuid,
    p_period_start date,
    p_period_end date
)
RETURNS TABLE (
    base_amount numeric,
    tenure_bonus numeric,
    proration_factor numeric,
    final_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_rule app.leave_accrual_rules%ROWTYPE;
    v_employee_hire_date date;
    v_tenure_years numeric;
    v_base_amount numeric;
    v_bonus numeric;
    v_proration numeric := 1.0;
    v_days_in_period integer;
    v_days_employed integer;
BEGIN
    -- Get accrual rule details
    SELECT * INTO v_rule
    FROM app.leave_accrual_rules
    WHERE id = p_accrual_rule_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, 0::numeric;
        RETURN;
    END IF;

    -- Get employee hire date
    SELECT e.hire_date INTO v_employee_hire_date
    FROM app.employees e
    WHERE e.id = p_employee_id;

    IF v_employee_hire_date IS NULL THEN
        RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, 0::numeric;
        RETURN;
    END IF;

    -- Calculate tenure in years
    v_tenure_years := EXTRACT(EPOCH FROM (p_period_start - v_employee_hire_date)) / (365.25 * 24 * 60 * 60);
    v_tenure_years := GREATEST(v_tenure_years, 0);

    -- Calculate base accrual amount
    v_base_amount := v_rule.amount;

    -- Calculate tenure bonus
    v_bonus := app.calculate_tenure_bonus(v_rule.tenure_bonus, v_tenure_years);

    -- Calculate proration if employee was hired during this period
    IF v_rule.prorate_first_period AND v_employee_hire_date > p_period_start AND v_employee_hire_date <= p_period_end THEN
        v_days_in_period := p_period_end - p_period_start + 1;
        v_days_employed := p_period_end - v_employee_hire_date + 1;
        v_proration := v_days_employed::numeric / v_days_in_period::numeric;
    ELSIF v_employee_hire_date > p_period_end THEN
        -- Employee not hired yet in this period
        v_proration := 0;
    END IF;

    -- Calculate final amount (apply cap if specified)
    RETURN QUERY SELECT
        v_base_amount,
        v_bonus,
        ROUND(v_proration, 4),
        LEAST(
            ROUND((v_base_amount + v_bonus) * v_proration, 2),
            COALESCE(v_rule.max_per_period, (v_base_amount + v_bonus) * v_proration)
        );
END;
$$;

-- Function to get all employees due for accrual
-- Used by batch accrual processing job
CREATE OR REPLACE FUNCTION app.get_employees_for_accrual(
    p_tenant_id uuid,
    p_frequency app.accrual_frequency,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    employee_id uuid,
    policy_id uuid,
    accrual_rule_id uuid,
    leave_type_id uuid,
    last_accrual_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        e.id AS employee_id,
        lp.id AS policy_id,
        ar.id AS accrual_rule_id,
        lp.leave_type_id,
        lb.last_accrual_date
    FROM app.employees e
    -- Join to find applicable policies (simplified - production should use find_applicable_leave_policy)
    CROSS JOIN app.leave_policies lp
    INNER JOIN app.leave_accrual_rules ar ON ar.policy_id = lp.id
    LEFT JOIN app.leave_balances lb ON lb.employee_id = e.id
        AND lb.leave_type_id = lp.leave_type_id
        AND lb.year = EXTRACT(YEAR FROM p_as_of_date)::integer
    WHERE e.tenant_id = p_tenant_id
      AND e.status IN ('active', 'on_leave')
      AND lp.tenant_id = p_tenant_id
      AND lp.is_active = true
      AND lp.effective_from <= p_as_of_date
      AND (lp.effective_to IS NULL OR lp.effective_to >= p_as_of_date)
      AND ar.frequency = p_frequency
      AND ar.is_active = true
    ORDER BY e.id;
END;
$$;

-- Function to determine if accrual is due based on frequency and date
CREATE OR REPLACE FUNCTION app.is_accrual_due(
    p_frequency app.accrual_frequency,
    p_as_of_date date,
    p_last_accrual_date date,
    p_hire_date date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_period_start date;
BEGIN
    -- Calculate the start of the current period based on frequency
    CASE p_frequency
        WHEN 'monthly' THEN
            v_current_period_start := date_trunc('month', p_as_of_date)::date;
        WHEN 'quarterly' THEN
            v_current_period_start := date_trunc('quarter', p_as_of_date)::date;
        WHEN 'yearly' THEN
            v_current_period_start := date_trunc('year', p_as_of_date)::date;
        WHEN 'calendar_year' THEN
            v_current_period_start := date_trunc('year', p_as_of_date)::date;
        WHEN 'hire_anniversary' THEN
            -- Calculate the most recent hire anniversary
            v_current_period_start := make_date(
                EXTRACT(YEAR FROM p_as_of_date)::integer,
                EXTRACT(MONTH FROM p_hire_date)::integer,
                EXTRACT(DAY FROM p_hire_date)::integer
            );
            -- If anniversary hasn't happened this year yet, use last year's
            IF v_current_period_start > p_as_of_date THEN
                v_current_period_start := v_current_period_start - interval '1 year';
            END IF;
        ELSE
            RETURN false;
    END CASE;

    -- Accrual is due if we haven't accrued for this period yet
    RETURN p_last_accrual_date IS NULL OR p_last_accrual_date < v_current_period_start;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.leave_accrual_rules IS 'Accrual rules defining how leave entitlements build up over time';
COMMENT ON COLUMN app.leave_accrual_rules.id IS 'Primary UUID identifier for the accrual rule';
COMMENT ON COLUMN app.leave_accrual_rules.tenant_id IS 'Tenant that owns this rule';
COMMENT ON COLUMN app.leave_accrual_rules.policy_id IS 'The policy this rule belongs to';
COMMENT ON COLUMN app.leave_accrual_rules.frequency IS 'How often leave accrues: monthly, quarterly, yearly, etc.';
COMMENT ON COLUMN app.leave_accrual_rules.amount IS 'Amount of leave that accrues per period';
COMMENT ON COLUMN app.leave_accrual_rules.max_per_period IS 'Maximum accrual per period (cap)';
COMMENT ON COLUMN app.leave_accrual_rules.tenure_bonus IS 'JSON array of tenure-based bonus tiers';
COMMENT ON COLUMN app.leave_accrual_rules.prorate_first_period IS 'Whether to prorate first period for new hires';
COMMENT ON COLUMN app.leave_accrual_rules.is_active IS 'Whether this rule is currently active';
COMMENT ON FUNCTION app.get_accrual_rules_for_policy IS 'Returns accrual rules for a policy';
COMMENT ON FUNCTION app.calculate_tenure_bonus IS 'Calculates additional entitlement based on years of service';
COMMENT ON FUNCTION app.calculate_period_accrual IS 'Calculates accrual amount for a period with proration';
COMMENT ON FUNCTION app.get_employees_for_accrual IS 'Returns employees due for accrual processing';
COMMENT ON FUNCTION app.is_accrual_due IS 'Determines if accrual is due based on frequency and last accrual date';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.is_accrual_due(app.accrual_frequency, date, date, date);
-- DROP FUNCTION IF EXISTS app.get_employees_for_accrual(uuid, app.accrual_frequency, date);
-- DROP FUNCTION IF EXISTS app.calculate_period_accrual(uuid, uuid, date, date);
-- DROP FUNCTION IF EXISTS app.calculate_tenure_bonus(jsonb, numeric);
-- DROP FUNCTION IF EXISTS app.get_accrual_rules_for_policy(uuid);
-- DROP TRIGGER IF EXISTS update_leave_accrual_rules_updated_at ON app.leave_accrual_rules;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.leave_accrual_rules;
-- DROP POLICY IF EXISTS tenant_isolation ON app.leave_accrual_rules;
-- DROP INDEX IF EXISTS app.idx_leave_accrual_rules_active;
-- DROP INDEX IF EXISTS app.idx_leave_accrual_rules_frequency;
-- DROP INDEX IF EXISTS app.idx_leave_accrual_rules_policy;
-- DROP TABLE IF EXISTS app.leave_accrual_rules;
