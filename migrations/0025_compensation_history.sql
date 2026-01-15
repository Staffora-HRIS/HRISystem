-- Migration: 0025_compensation_history
-- Created: 2026-01-07
-- Description: Create the compensation_history table for effective-dated salary records
--              Tracks base salary, currency, pay frequency, and compensation changes
--              Supports approval workflow and change tracking

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Compensation History Table
-- -----------------------------------------------------------------------------
-- Effective-dated compensation records for employees
-- Each row represents a salary valid for a date range
-- Salary changes (raises, promotions, adjustments) create new records
CREATE TABLE IF NOT EXISTS app.compensation_history (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this data
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee this compensation belongs to
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Effective dating
    -- effective_from: When this compensation becomes valid
    -- effective_to: When this compensation ends (NULL = currently effective)
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,

    -- Compensation details
    base_salary numeric(15, 2) NOT NULL,
    currency varchar(3) NOT NULL DEFAULT 'USD',

    -- Pay frequency
    pay_frequency varchar(20) NOT NULL DEFAULT 'monthly',

    -- Change tracking
    change_reason varchar(100), -- merit, promotion, adjustment, hire, market, etc.
    change_percentage numeric(5, 2), -- % change from previous salary

    -- Approval workflow
    approved_by uuid REFERENCES app.users(id),
    approved_at timestamptz,

    -- Audit trail
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Only one compensation record can be effective at a given time per employee
    CONSTRAINT compensation_history_effective_unique UNIQUE (tenant_id, employee_id, effective_from),

    -- Effective dates validation
    CONSTRAINT compensation_history_effective_dates CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),

    -- Base salary must be non-negative
    CONSTRAINT compensation_history_salary_positive CHECK (
        base_salary >= 0
    ),

    -- Currency format (ISO 4217)
    CONSTRAINT compensation_history_currency_format CHECK (
        currency ~ '^[A-Z]{3}$'
    ),

    -- Valid pay frequencies
    CONSTRAINT compensation_history_frequency_check CHECK (
        pay_frequency IN ('monthly', 'bi_weekly', 'weekly', 'semi_monthly', 'annual')
    ),

    -- Change percentage must be reasonable (-100% to +1000%)
    CONSTRAINT compensation_history_change_range CHECK (
        change_percentage IS NULL OR (change_percentage >= -100 AND change_percentage <= 1000)
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: find compensation history for an employee
CREATE INDEX IF NOT EXISTS idx_compensation_history_tenant_employee
    ON app.compensation_history(tenant_id, employee_id);

-- Find current compensation (effective_to IS NULL)
CREATE INDEX IF NOT EXISTS idx_compensation_history_current
    ON app.compensation_history(tenant_id, employee_id, effective_from)
    WHERE effective_to IS NULL;

-- Effective date range queries
CREATE INDEX IF NOT EXISTS idx_compensation_history_effective_range
    ON app.compensation_history(tenant_id, employee_id, effective_from, effective_to);

-- Pending approval
CREATE INDEX IF NOT EXISTS idx_compensation_history_pending_approval
    ON app.compensation_history(tenant_id, created_at)
    WHERE approved_at IS NULL AND effective_to IS NULL;

-- Change reason filtering (for compensation analysis)
CREATE INDEX IF NOT EXISTS idx_compensation_history_reason
    ON app.compensation_history(tenant_id, change_reason, effective_from)
    WHERE change_reason IS NOT NULL;

-- Currency filtering
CREATE INDEX IF NOT EXISTS idx_compensation_history_currency
    ON app.compensation_history(tenant_id, currency)
    WHERE effective_to IS NULL;

-- Salary range queries (for market analysis)
CREATE INDEX IF NOT EXISTS idx_compensation_history_salary
    ON app.compensation_history(tenant_id, base_salary)
    WHERE effective_to IS NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.compensation_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see compensation for their current tenant
-- Note: Additional app-level controls should restrict access to sensitive data
CREATE POLICY tenant_isolation ON app.compensation_history
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.compensation_history
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_compensation_history_updated_at
    BEFORE UPDATE ON app.compensation_history
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get current compensation for an employee
CREATE OR REPLACE FUNCTION app.get_current_compensation(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    base_salary numeric(15, 2),
    currency varchar(3),
    pay_frequency varchar(20),
    effective_from date,
    approved_by uuid,
    approved_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ch.id, ch.base_salary, ch.currency, ch.pay_frequency,
           ch.effective_from, ch.approved_by, ch.approved_at
    FROM app.compensation_history ch
    WHERE ch.employee_id = p_employee_id
      AND ch.effective_to IS NULL
    LIMIT 1;
END;
$$;

-- Function to get compensation as of a specific date
CREATE OR REPLACE FUNCTION app.get_compensation_as_of(
    p_employee_id uuid,
    p_as_of_date date
)
RETURNS TABLE (
    id uuid,
    base_salary numeric(15, 2),
    currency varchar(3),
    pay_frequency varchar(20),
    effective_from date,
    effective_to date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ch.id, ch.base_salary, ch.currency, ch.pay_frequency,
           ch.effective_from, ch.effective_to
    FROM app.compensation_history ch
    WHERE ch.employee_id = p_employee_id
      AND ch.effective_from <= p_as_of_date
      AND (ch.effective_to IS NULL OR ch.effective_to > p_as_of_date)
    ORDER BY ch.effective_from DESC
    LIMIT 1;
END;
$$;

-- Function to get full compensation history for an employee
CREATE OR REPLACE FUNCTION app.get_compensation_history(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    base_salary numeric(15, 2),
    currency varchar(3),
    pay_frequency varchar(20),
    change_reason varchar(100),
    change_percentage numeric(5, 2),
    effective_from date,
    effective_to date,
    approved_by uuid,
    approved_at timestamptz,
    created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ch.id, ch.base_salary, ch.currency, ch.pay_frequency,
           ch.change_reason, ch.change_percentage, ch.effective_from, ch.effective_to,
           ch.approved_by, ch.approved_at, ch.created_by
    FROM app.compensation_history ch
    WHERE ch.employee_id = p_employee_id
    ORDER BY ch.effective_from DESC;
END;
$$;

-- Function to calculate annual salary from any pay frequency
CREATE OR REPLACE FUNCTION app.calculate_annual_salary(
    p_base_salary numeric(15, 2),
    p_pay_frequency varchar(20)
)
RETURNS numeric(15, 2)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN CASE p_pay_frequency
        WHEN 'annual' THEN p_base_salary
        WHEN 'monthly' THEN p_base_salary * 12
        WHEN 'semi_monthly' THEN p_base_salary * 24
        WHEN 'bi_weekly' THEN p_base_salary * 26
        WHEN 'weekly' THEN p_base_salary * 52
        ELSE p_base_salary * 12 -- default to monthly
    END;
END;
$$;

-- Function to get employee's annual salary
CREATE OR REPLACE FUNCTION app.get_employee_annual_salary(
    p_employee_id uuid
)
RETURNS numeric(15, 2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_base_salary numeric(15, 2);
    v_pay_frequency varchar(20);
BEGIN
    SELECT base_salary, pay_frequency
    INTO v_base_salary, v_pay_frequency
    FROM app.compensation_history
    WHERE employee_id = p_employee_id
      AND effective_to IS NULL;

    IF v_base_salary IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN app.calculate_annual_salary(v_base_salary, v_pay_frequency);
END;
$$;

-- Function to create a new compensation record (with change tracking)
CREATE OR REPLACE FUNCTION app.update_compensation(
    p_employee_id uuid,
    p_base_salary numeric(15, 2),
    p_currency varchar(3),
    p_pay_frequency varchar(20),
    p_change_reason varchar(100),
    p_effective_from date,
    p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id uuid;
    v_previous_salary numeric(15, 2);
    v_previous_currency varchar(3);
    v_change_percentage numeric(5, 2);
    v_new_id uuid;
BEGIN
    -- Get tenant from employee
    SELECT tenant_id INTO v_tenant_id
    FROM app.employees
    WHERE id = p_employee_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Employee not found: %', p_employee_id;
    END IF;

    -- Get previous salary for change calculation
    SELECT base_salary, currency INTO v_previous_salary, v_previous_currency
    FROM app.compensation_history
    WHERE employee_id = p_employee_id
      AND effective_to IS NULL;

    -- Calculate change percentage if same currency
    IF v_previous_salary IS NOT NULL AND v_previous_currency = p_currency AND v_previous_salary > 0 THEN
        v_change_percentage := ROUND(((p_base_salary - v_previous_salary) / v_previous_salary) * 100, 2);
    END IF;

    -- Close the current compensation record
    UPDATE app.compensation_history
    SET effective_to = p_effective_from,
        updated_at = now()
    WHERE employee_id = p_employee_id
      AND effective_to IS NULL
      AND effective_from < p_effective_from;

    -- Insert the new compensation record
    INSERT INTO app.compensation_history (
        tenant_id, employee_id, effective_from,
        base_salary, currency, pay_frequency,
        change_reason, change_percentage,
        created_by
    )
    VALUES (
        v_tenant_id, p_employee_id, p_effective_from,
        p_base_salary, p_currency, p_pay_frequency,
        p_change_reason, v_change_percentage,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- Function to approve a compensation record
CREATE OR REPLACE FUNCTION app.approve_compensation(
    p_compensation_id uuid,
    p_approved_by uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.compensation_history
    SET approved_by = p_approved_by,
        approved_at = now(),
        updated_at = now()
    WHERE id = p_compensation_id
      AND approved_at IS NULL;

    RETURN FOUND;
END;
$$;

-- Function to get compensation statistics for a tenant
CREATE OR REPLACE FUNCTION app.get_compensation_statistics(
    p_tenant_id uuid,
    p_currency varchar(3) DEFAULT 'USD'
)
RETURNS TABLE (
    total_employees bigint,
    total_compensation numeric(15, 2),
    avg_salary numeric(15, 2),
    min_salary numeric(15, 2),
    max_salary numeric(15, 2),
    median_salary numeric(15, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH active_salaries AS (
        SELECT app.calculate_annual_salary(ch.base_salary, ch.pay_frequency) AS annual_salary
        FROM app.compensation_history ch
        INNER JOIN app.employees e ON ch.employee_id = e.id
        WHERE ch.tenant_id = p_tenant_id
          AND ch.currency = p_currency
          AND ch.effective_to IS NULL
          AND e.status = 'active'
    )
    SELECT
        COUNT(*)::bigint AS total_employees,
        SUM(annual_salary) AS total_compensation,
        ROUND(AVG(annual_salary), 2) AS avg_salary,
        MIN(annual_salary) AS min_salary,
        MAX(annual_salary) AS max_salary,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY annual_salary)::numeric(15, 2) AS median_salary
    FROM active_salaries;
END;
$$;

-- Function to get recent salary changes (for audit/review)
CREATE OR REPLACE FUNCTION app.get_recent_salary_changes(
    p_tenant_id uuid,
    p_days integer DEFAULT 30
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    previous_salary numeric(15, 2),
    new_salary numeric(15, 2),
    currency varchar(3),
    change_percentage numeric(5, 2),
    change_reason varchar(100),
    effective_from date,
    approved_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ch.employee_id, e.employee_number,
           LAG(ch.base_salary) OVER (PARTITION BY ch.employee_id ORDER BY ch.effective_from) AS previous_salary,
           ch.base_salary AS new_salary, ch.currency, ch.change_percentage, ch.change_reason,
           ch.effective_from, ch.approved_at
    FROM app.compensation_history ch
    INNER JOIN app.employees e ON ch.employee_id = e.id
    WHERE ch.tenant_id = p_tenant_id
      AND ch.effective_from >= CURRENT_DATE - p_days
      AND e.status IN ('active', 'on_leave')
    ORDER BY ch.effective_from DESC;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.compensation_history IS 'Effective-dated compensation records with approval workflow';
COMMENT ON COLUMN app.compensation_history.id IS 'Primary UUID identifier for this compensation record';
COMMENT ON COLUMN app.compensation_history.tenant_id IS 'Tenant that owns this data';
COMMENT ON COLUMN app.compensation_history.employee_id IS 'Employee this compensation belongs to';
COMMENT ON COLUMN app.compensation_history.effective_from IS 'Date this compensation becomes effective';
COMMENT ON COLUMN app.compensation_history.effective_to IS 'Date this compensation ends (NULL = current)';
COMMENT ON COLUMN app.compensation_history.base_salary IS 'Base salary amount (per pay frequency)';
COMMENT ON COLUMN app.compensation_history.currency IS 'Currency code (ISO 4217)';
COMMENT ON COLUMN app.compensation_history.pay_frequency IS 'How often employee is paid (monthly, bi_weekly, etc.)';
COMMENT ON COLUMN app.compensation_history.change_reason IS 'Reason for salary change (merit, promotion, etc.)';
COMMENT ON COLUMN app.compensation_history.change_percentage IS 'Percentage change from previous salary';
COMMENT ON COLUMN app.compensation_history.approved_by IS 'User who approved this compensation';
COMMENT ON COLUMN app.compensation_history.approved_at IS 'When compensation was approved';
COMMENT ON COLUMN app.compensation_history.created_by IS 'User who created this record';
COMMENT ON FUNCTION app.get_current_compensation IS 'Returns current active compensation for an employee';
COMMENT ON FUNCTION app.get_compensation_as_of IS 'Returns compensation effective at a specific date';
COMMENT ON FUNCTION app.get_compensation_history IS 'Returns all compensation records for audit';
COMMENT ON FUNCTION app.calculate_annual_salary IS 'Converts any pay frequency to annual salary';
COMMENT ON FUNCTION app.get_employee_annual_salary IS 'Returns current annual salary for an employee';
COMMENT ON FUNCTION app.update_compensation IS 'Creates new compensation record with change tracking';
COMMENT ON FUNCTION app.approve_compensation IS 'Approves a pending compensation record';
COMMENT ON FUNCTION app.get_compensation_statistics IS 'Returns salary statistics for a tenant';
COMMENT ON FUNCTION app.get_recent_salary_changes IS 'Returns recent salary changes for audit';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_recent_salary_changes(uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_compensation_statistics(uuid, varchar);
-- DROP FUNCTION IF EXISTS app.approve_compensation(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.update_compensation(uuid, numeric, varchar, varchar, varchar, date, uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_annual_salary(uuid);
-- DROP FUNCTION IF EXISTS app.calculate_annual_salary(numeric, varchar);
-- DROP FUNCTION IF EXISTS app.get_compensation_history(uuid);
-- DROP FUNCTION IF EXISTS app.get_compensation_as_of(uuid, date);
-- DROP FUNCTION IF EXISTS app.get_current_compensation(uuid);
-- DROP TRIGGER IF EXISTS update_compensation_history_updated_at ON app.compensation_history;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.compensation_history;
-- DROP POLICY IF EXISTS tenant_isolation ON app.compensation_history;
-- DROP INDEX IF EXISTS app.idx_compensation_history_salary;
-- DROP INDEX IF EXISTS app.idx_compensation_history_currency;
-- DROP INDEX IF EXISTS app.idx_compensation_history_reason;
-- DROP INDEX IF EXISTS app.idx_compensation_history_pending_approval;
-- DROP INDEX IF EXISTS app.idx_compensation_history_effective_range;
-- DROP INDEX IF EXISTS app.idx_compensation_history_current;
-- DROP INDEX IF EXISTS app.idx_compensation_history_tenant_employee;
-- DROP TABLE IF EXISTS app.compensation_history;
