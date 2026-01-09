-- Migration: 0045_overtime_rules
-- Created: 2026-01-07
-- Description: Create the overtime_rules table for overtime calculation rules
--              Defines thresholds and multipliers for overtime pay
--              Can be scoped to org units for different rules per department

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Overtime Rules Table
-- -----------------------------------------------------------------------------
-- Defines overtime calculation rules that can vary by org unit and time
-- Supports daily and weekly thresholds with different multipliers
-- Effective dating allows rules to change over time
CREATE TABLE IF NOT EXISTS app.overtime_rules (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this rule
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Rule name for identification
    name varchar(255) NOT NULL,

    -- Description of when/why this rule applies
    description text,

    -- Org unit scope (NULL = company-wide default)
    -- More specific org unit rules take precedence
    org_unit_id uuid REFERENCES app.org_units(id) ON DELETE SET NULL,

    -- Daily overtime threshold (hours per day)
    -- NULL means no daily overtime calculation
    -- e.g., 8.0 means overtime starts after 8 hours/day
    daily_threshold_hours numeric(4, 2),

    -- Weekly overtime threshold (hours per week)
    -- NULL means no weekly overtime calculation
    -- e.g., 40.0 means overtime starts after 40 hours/week
    weekly_threshold_hours numeric(4, 2),

    -- Standard overtime multiplier (e.g., 1.5 for time-and-a-half)
    overtime_multiplier numeric(3, 2) NOT NULL DEFAULT 1.5,

    -- Double-time threshold (hours beyond which double-time applies)
    -- NULL means no double-time
    -- e.g., 12.0 means double-time starts after 12 hours/day
    double_time_threshold_hours numeric(4, 2),

    -- Double-time multiplier (e.g., 2.0 for double-time)
    double_time_multiplier numeric(3, 2) NOT NULL DEFAULT 2.0,

    -- Whether to include breaks in hour calculations
    -- false = net hours (exclude breaks), true = gross hours (include breaks)
    include_breaks boolean NOT NULL DEFAULT false,

    -- Whether this rule is currently active
    is_active boolean NOT NULL DEFAULT true,

    -- Effective dating for historical tracking
    effective_from date NOT NULL,
    effective_to date,

    -- Metadata for additional configuration
    -- e.g., holiday rules, weekend rules, shift differentials
    metadata jsonb NOT NULL DEFAULT '{}',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- At least one threshold must be set
    CONSTRAINT overtime_rules_threshold_required CHECK (
        daily_threshold_hours IS NOT NULL OR weekly_threshold_hours IS NOT NULL
    ),

    -- Thresholds must be positive
    CONSTRAINT overtime_rules_daily_positive CHECK (
        daily_threshold_hours IS NULL OR daily_threshold_hours > 0
    ),

    CONSTRAINT overtime_rules_weekly_positive CHECK (
        weekly_threshold_hours IS NULL OR weekly_threshold_hours > 0
    ),

    CONSTRAINT overtime_rules_double_time_positive CHECK (
        double_time_threshold_hours IS NULL OR double_time_threshold_hours > 0
    ),

    -- Double-time threshold must be greater than daily threshold
    CONSTRAINT overtime_rules_double_time_after_regular CHECK (
        double_time_threshold_hours IS NULL OR daily_threshold_hours IS NULL OR
        double_time_threshold_hours > daily_threshold_hours
    ),

    -- Multipliers must be >= 1
    CONSTRAINT overtime_rules_multiplier_range CHECK (
        overtime_multiplier >= 1 AND double_time_multiplier >= 1
    ),

    -- Double-time multiplier must be >= overtime multiplier
    CONSTRAINT overtime_rules_multiplier_order CHECK (
        double_time_multiplier >= overtime_multiplier
    ),

    -- Effective dates validation
    CONSTRAINT overtime_rules_effective_dates CHECK (
        effective_to IS NULL OR effective_to > effective_from
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + org unit + effective date
CREATE INDEX IF NOT EXISTS idx_overtime_rules_tenant_org_effective
    ON app.overtime_rules(tenant_id, org_unit_id, effective_from, effective_to);

-- Active rules (common query)
CREATE INDEX IF NOT EXISTS idx_overtime_rules_active
    ON app.overtime_rules(tenant_id, is_active)
    WHERE is_active = true;

-- Org unit rules lookup
CREATE INDEX IF NOT EXISTS idx_overtime_rules_org_unit
    ON app.overtime_rules(org_unit_id)
    WHERE org_unit_id IS NOT NULL;

-- Company-wide rules (NULL org_unit_id)
CREATE INDEX IF NOT EXISTS idx_overtime_rules_company_wide
    ON app.overtime_rules(tenant_id, effective_from)
    WHERE org_unit_id IS NULL AND is_active = true;

-- Effective date range queries
CREATE INDEX IF NOT EXISTS idx_overtime_rules_effective
    ON app.overtime_rules(tenant_id, effective_from DESC, effective_to);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.overtime_rules ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see rules for their current tenant
CREATE POLICY tenant_isolation ON app.overtime_rules
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.overtime_rules
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_overtime_rules_updated_at
    BEFORE UPDATE ON app.overtime_rules
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get applicable overtime rule for an employee on a date
-- Uses hierarchy: employee's org unit -> parent org units -> company-wide
CREATE OR REPLACE FUNCTION app.get_applicable_overtime_rule(
    p_employee_id uuid,
    p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    org_unit_id uuid,
    daily_threshold_hours numeric,
    weekly_threshold_hours numeric,
    overtime_multiplier numeric,
    double_time_threshold_hours numeric,
    double_time_multiplier numeric,
    include_breaks boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_employee_org_unit uuid;
    v_rule RECORD;
BEGIN
    -- Get employee's current org unit
    SELECT p.org_unit_id INTO v_employee_org_unit
    FROM app.employees e
    JOIN app.position_assignments pa ON e.id = pa.employee_id AND pa.is_current = true
    JOIN app.positions p ON pa.position_id = p.id
    WHERE e.id = p_employee_id;

    -- Try to find rule for employee's org unit
    SELECT * INTO v_rule
    FROM app.overtime_rules orr
    WHERE orr.org_unit_id = v_employee_org_unit
      AND orr.is_active = true
      AND orr.effective_from <= p_date
      AND (orr.effective_to IS NULL OR orr.effective_to >= p_date)
    ORDER BY orr.effective_from DESC
    LIMIT 1;

    -- If found, return it
    IF v_rule.id IS NOT NULL THEN
        RETURN QUERY SELECT
            v_rule.id,
            v_rule.name,
            v_rule.org_unit_id,
            v_rule.daily_threshold_hours,
            v_rule.weekly_threshold_hours,
            v_rule.overtime_multiplier,
            v_rule.double_time_threshold_hours,
            v_rule.double_time_multiplier,
            v_rule.include_breaks;
        RETURN;
    END IF;

    -- Try parent org units (if we have the function available)
    -- This would require org_unit hierarchy traversal
    -- For now, fall back to company-wide rule

    -- Get company-wide rule (org_unit_id IS NULL)
    RETURN QUERY
    SELECT
        orr.id,
        orr.name,
        orr.org_unit_id,
        orr.daily_threshold_hours,
        orr.weekly_threshold_hours,
        orr.overtime_multiplier,
        orr.double_time_threshold_hours,
        orr.double_time_multiplier,
        orr.include_breaks
    FROM app.overtime_rules orr
    WHERE orr.org_unit_id IS NULL
      AND orr.is_active = true
      AND orr.effective_from <= p_date
      AND (orr.effective_to IS NULL OR orr.effective_to >= p_date)
    ORDER BY orr.effective_from DESC
    LIMIT 1;
END;
$$;

COMMENT ON FUNCTION app.get_applicable_overtime_rule IS 'Returns the applicable overtime rule for an employee on a given date';

-- Function to calculate overtime hours for a given total
CREATE OR REPLACE FUNCTION app.calculate_overtime(
    p_rule_id uuid,
    p_total_hours numeric,
    p_is_daily boolean DEFAULT true
)
RETURNS TABLE (
    regular_hours numeric,
    overtime_hours numeric,
    double_time_hours numeric,
    overtime_pay_factor numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_rule RECORD;
    v_threshold numeric;
    v_double_threshold numeric;
    v_regular numeric;
    v_overtime numeric;
    v_double_time numeric;
BEGIN
    -- Get rule details
    SELECT * INTO v_rule
    FROM app.overtime_rules
    WHERE id = p_rule_id;

    IF v_rule IS NULL THEN
        -- No rule, all hours are regular
        regular_hours := p_total_hours;
        overtime_hours := 0;
        double_time_hours := 0;
        overtime_pay_factor := 1;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Determine which threshold to use
    IF p_is_daily THEN
        v_threshold := v_rule.daily_threshold_hours;
        v_double_threshold := v_rule.double_time_threshold_hours;
    ELSE
        v_threshold := v_rule.weekly_threshold_hours;
        v_double_threshold := NULL; -- Double-time typically only applies daily
    END IF;

    -- If no applicable threshold, all hours are regular
    IF v_threshold IS NULL THEN
        regular_hours := p_total_hours;
        overtime_hours := 0;
        double_time_hours := 0;
        overtime_pay_factor := 1;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Calculate hours breakdown
    IF p_total_hours <= v_threshold THEN
        -- All regular
        v_regular := p_total_hours;
        v_overtime := 0;
        v_double_time := 0;
    ELSIF v_double_threshold IS NOT NULL AND p_total_hours > v_double_threshold THEN
        -- Regular + overtime + double-time
        v_regular := v_threshold;
        v_overtime := v_double_threshold - v_threshold;
        v_double_time := p_total_hours - v_double_threshold;
    ELSE
        -- Regular + overtime
        v_regular := v_threshold;
        v_overtime := p_total_hours - v_threshold;
        v_double_time := 0;
    END IF;

    -- Calculate effective pay factor
    -- (regular * 1 + overtime * OT_mult + double_time * DT_mult) / total
    regular_hours := ROUND(v_regular, 2);
    overtime_hours := ROUND(v_overtime, 2);
    double_time_hours := ROUND(v_double_time, 2);

    IF p_total_hours > 0 THEN
        overtime_pay_factor := ROUND(
            (v_regular * 1 +
             v_overtime * v_rule.overtime_multiplier +
             v_double_time * v_rule.double_time_multiplier) / p_total_hours,
            4
        );
    ELSE
        overtime_pay_factor := 1;
    END IF;

    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION app.calculate_overtime IS 'Calculates overtime breakdown for given total hours using a specific rule';

-- Function to get all active overtime rules
CREATE OR REPLACE FUNCTION app.get_active_overtime_rules(
    p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    id uuid,
    name varchar(255),
    org_unit_id uuid,
    org_unit_name varchar(255),
    daily_threshold_hours numeric,
    weekly_threshold_hours numeric,
    overtime_multiplier numeric,
    double_time_threshold_hours numeric,
    double_time_multiplier numeric,
    effective_from date,
    effective_to date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        orr.id,
        orr.name,
        orr.org_unit_id,
        ou.name AS org_unit_name,
        orr.daily_threshold_hours,
        orr.weekly_threshold_hours,
        orr.overtime_multiplier,
        orr.double_time_threshold_hours,
        orr.double_time_multiplier,
        orr.effective_from,
        orr.effective_to
    FROM app.overtime_rules orr
    LEFT JOIN app.org_units ou ON orr.org_unit_id = ou.id
    WHERE orr.is_active = true
      AND orr.effective_from <= p_date
      AND (orr.effective_to IS NULL OR orr.effective_to >= p_date)
    ORDER BY ou.name NULLS FIRST, orr.name;
END;
$$;

COMMENT ON FUNCTION app.get_active_overtime_rules IS 'Returns all currently active overtime rules';

-- Function to validate overtime rule before insert/update
CREATE OR REPLACE FUNCTION app.validate_overtime_rule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_overlapping RECORD;
BEGIN
    -- Check for overlapping rules for same org unit
    SELECT id, name, effective_from, effective_to
    INTO v_overlapping
    FROM app.overtime_rules
    WHERE tenant_id = NEW.tenant_id
      AND (
          (NEW.org_unit_id IS NULL AND org_unit_id IS NULL) OR
          (org_unit_id = NEW.org_unit_id)
      )
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND is_active = true
      AND (
          -- Date ranges overlap
          (effective_from <= COALESCE(NEW.effective_to, '9999-12-31'::date) AND
           COALESCE(effective_to, '9999-12-31'::date) >= NEW.effective_from)
      )
    LIMIT 1;

    IF v_overlapping.id IS NOT NULL THEN
        RAISE WARNING 'Overtime rule overlaps with existing rule: % (% to %)',
            v_overlapping.name,
            v_overlapping.effective_from,
            COALESCE(v_overlapping.effective_to::text, 'ongoing');
        -- Allow but warn - might want to make this an error in production
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_overtime_rule
    BEFORE INSERT OR UPDATE ON app.overtime_rules
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_overtime_rule();

-- Function to apply overtime calculation to timesheet lines
CREATE OR REPLACE FUNCTION app.apply_overtime_to_timesheet(
    p_timesheet_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_timesheet RECORD;
    v_rule RECORD;
    v_line RECORD;
    v_calc RECORD;
    v_weekly_total numeric := 0;
BEGIN
    -- Get timesheet details
    SELECT * INTO v_timesheet
    FROM app.timesheets
    WHERE id = p_timesheet_id;

    IF v_timesheet IS NULL THEN
        RAISE EXCEPTION 'Timesheet not found: %', p_timesheet_id;
    END IF;

    IF v_timesheet.status IN ('approved', 'locked') THEN
        RAISE EXCEPTION 'Cannot modify % timesheet', v_timesheet.status;
    END IF;

    -- Get applicable overtime rule
    SELECT * INTO v_rule
    FROM app.get_applicable_overtime_rule(v_timesheet.employee_id, v_timesheet.period_start);

    IF v_rule.id IS NULL THEN
        -- No overtime rule, nothing to apply
        RETURN false;
    END IF;

    -- Process each line
    FOR v_line IN
        SELECT *
        FROM app.timesheet_lines
        WHERE timesheet_id = p_timesheet_id
        ORDER BY work_date
    LOOP
        -- Skip leave/holiday days
        IF v_line.is_leave OR v_line.is_holiday THEN
            CONTINUE;
        END IF;

        -- Calculate daily overtime
        SELECT * INTO v_calc
        FROM app.calculate_overtime(v_rule.id, v_line.regular_hours + v_line.overtime_hours, true);

        -- Update line with calculated overtime
        UPDATE app.timesheet_lines
        SET regular_hours = v_calc.regular_hours,
            overtime_hours = v_calc.overtime_hours + v_calc.double_time_hours
        WHERE id = v_line.id;

        -- Track weekly total
        v_weekly_total := v_weekly_total + v_line.regular_hours + v_line.overtime_hours;

        -- Check for weekly overtime at week boundaries or end of period
        -- This is a simplified implementation - production would need
        -- proper week boundary handling
    END LOOP;

    -- Recalculate timesheet totals
    PERFORM app.recalculate_timesheet_totals(p_timesheet_id);

    RETURN true;
END;
$$;

COMMENT ON FUNCTION app.apply_overtime_to_timesheet IS 'Applies overtime rules to calculate overtime hours for a timesheet';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.overtime_rules IS 'Overtime calculation rules with thresholds and multipliers. Can be scoped to org units.';
COMMENT ON COLUMN app.overtime_rules.id IS 'Primary UUID identifier for the rule';
COMMENT ON COLUMN app.overtime_rules.tenant_id IS 'Tenant that owns this rule';
COMMENT ON COLUMN app.overtime_rules.name IS 'Rule name for identification';
COMMENT ON COLUMN app.overtime_rules.description IS 'Description of when/why this rule applies';
COMMENT ON COLUMN app.overtime_rules.org_unit_id IS 'Org unit scope (NULL = company-wide)';
COMMENT ON COLUMN app.overtime_rules.daily_threshold_hours IS 'Hours per day before overtime (e.g., 8)';
COMMENT ON COLUMN app.overtime_rules.weekly_threshold_hours IS 'Hours per week before overtime (e.g., 40)';
COMMENT ON COLUMN app.overtime_rules.overtime_multiplier IS 'Pay multiplier for overtime (e.g., 1.5)';
COMMENT ON COLUMN app.overtime_rules.double_time_threshold_hours IS 'Daily hours before double-time (e.g., 12)';
COMMENT ON COLUMN app.overtime_rules.double_time_multiplier IS 'Pay multiplier for double-time (e.g., 2.0)';
COMMENT ON COLUMN app.overtime_rules.include_breaks IS 'Whether to include breaks in hour calculations';
COMMENT ON COLUMN app.overtime_rules.is_active IS 'Whether this rule is currently active';
COMMENT ON COLUMN app.overtime_rules.effective_from IS 'When this rule becomes effective';
COMMENT ON COLUMN app.overtime_rules.effective_to IS 'When this rule ends (NULL = ongoing)';
COMMENT ON COLUMN app.overtime_rules.metadata IS 'Additional configuration (holiday rules, etc.)';
COMMENT ON FUNCTION app.validate_overtime_rule IS 'Trigger function to validate overtime rules and warn about overlaps';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.apply_overtime_to_timesheet(uuid);
-- DROP TRIGGER IF EXISTS validate_overtime_rule ON app.overtime_rules;
-- DROP FUNCTION IF EXISTS app.validate_overtime_rule();
-- DROP FUNCTION IF EXISTS app.get_active_overtime_rules(date);
-- DROP FUNCTION IF EXISTS app.calculate_overtime(uuid, numeric, boolean);
-- DROP FUNCTION IF EXISTS app.get_applicable_overtime_rule(uuid, date);
-- DROP TRIGGER IF EXISTS update_overtime_rules_updated_at ON app.overtime_rules;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.overtime_rules;
-- DROP POLICY IF EXISTS tenant_isolation ON app.overtime_rules;
-- DROP INDEX IF EXISTS app.idx_overtime_rules_effective;
-- DROP INDEX IF EXISTS app.idx_overtime_rules_company_wide;
-- DROP INDEX IF EXISTS app.idx_overtime_rules_org_unit;
-- DROP INDEX IF EXISTS app.idx_overtime_rules_active;
-- DROP INDEX IF EXISTS app.idx_overtime_rules_tenant_org_effective;
-- DROP TABLE IF EXISTS app.overtime_rules;
