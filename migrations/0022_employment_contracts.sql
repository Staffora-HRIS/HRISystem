-- Migration: 0022_employment_contracts
-- Created: 2026-01-07
-- Description: Create the employment_contracts table for effective-dated contract details
--              Stores contract type, employment type, FTE, working hours, probation
--              Uses effective dating for contract changes and renewals

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Employment Contracts Table
-- -----------------------------------------------------------------------------
-- Effective-dated employment contract information
-- Each row represents a contract version valid for a date range
-- Contract changes (renewals, amendments) create new records
CREATE TABLE IF NOT EXISTS app.employment_contracts (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this data
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee this contract belongs to
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Effective dating
    -- effective_from: When this contract version becomes valid
    -- effective_to: When this contract ends (NULL = currently effective)
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,

    -- Contract type (permanent, fixed-term, contractor, intern, temporary)
    contract_type app.contract_type NOT NULL,

    -- Employment type (full-time, part-time)
    employment_type app.employment_type NOT NULL,

    -- Full-Time Equivalent (1.0 = full-time, 0.5 = half-time, etc.)
    -- Used for headcount calculations and benefits eligibility
    fte numeric(3, 2) NOT NULL DEFAULT 1.00,

    -- Standard working hours per week
    working_hours_per_week numeric(4, 1),

    -- Probation period end date
    probation_end_date date,

    -- Notice period required for termination (in days)
    notice_period_days integer,

    -- Audit trail
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Only one contract can be effective at a given time per employee
    CONSTRAINT employment_contracts_effective_unique UNIQUE (tenant_id, employee_id, effective_from),

    -- Effective dates validation
    CONSTRAINT employment_contracts_effective_dates CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),

    -- FTE must be between 0 (exclusive) and 1 (inclusive)
    CONSTRAINT employment_contracts_fte_range CHECK (
        fte > 0 AND fte <= 1
    ),

    -- Working hours must be positive
    CONSTRAINT employment_contracts_hours_positive CHECK (
        working_hours_per_week IS NULL OR working_hours_per_week > 0
    ),

    -- Notice period must be non-negative
    CONSTRAINT employment_contracts_notice_positive CHECK (
        notice_period_days IS NULL OR notice_period_days >= 0
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: find contracts for an employee
CREATE INDEX IF NOT EXISTS idx_employment_contracts_tenant_employee
    ON app.employment_contracts(tenant_id, employee_id);

-- Find current contract (effective_to IS NULL)
CREATE INDEX IF NOT EXISTS idx_employment_contracts_current
    ON app.employment_contracts(tenant_id, employee_id, effective_from)
    WHERE effective_to IS NULL;

-- Effective date range queries
CREATE INDEX IF NOT EXISTS idx_employment_contracts_effective_range
    ON app.employment_contracts(tenant_id, employee_id, effective_from, effective_to);

-- Contract type filtering
CREATE INDEX IF NOT EXISTS idx_employment_contracts_type
    ON app.employment_contracts(tenant_id, contract_type)
    WHERE effective_to IS NULL;

-- Employment type filtering
CREATE INDEX IF NOT EXISTS idx_employment_contracts_employment_type
    ON app.employment_contracts(tenant_id, employment_type)
    WHERE effective_to IS NULL;

-- Probation ending soon (for HR tracking)
CREATE INDEX IF NOT EXISTS idx_employment_contracts_probation
    ON app.employment_contracts(tenant_id, probation_end_date)
    WHERE effective_to IS NULL AND probation_end_date IS NOT NULL;

-- Fixed-term contracts ending soon
CREATE INDEX IF NOT EXISTS idx_employment_contracts_ending
    ON app.employment_contracts(tenant_id, effective_to)
    WHERE effective_to IS NOT NULL AND contract_type = 'fixed_term';

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.employment_contracts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see contracts for their current tenant
CREATE POLICY tenant_isolation ON app.employment_contracts
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.employment_contracts
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_employment_contracts_updated_at
    BEFORE UPDATE ON app.employment_contracts
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get current contract for an employee
CREATE OR REPLACE FUNCTION app.get_current_employment_contract(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    contract_type app.contract_type,
    employment_type app.employment_type,
    fte numeric(3, 2),
    working_hours_per_week numeric(4, 1),
    probation_end_date date,
    notice_period_days integer,
    effective_from date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ec.id, ec.contract_type, ec.employment_type, ec.fte,
           ec.working_hours_per_week, ec.probation_end_date, ec.notice_period_days,
           ec.effective_from
    FROM app.employment_contracts ec
    WHERE ec.employee_id = p_employee_id
      AND ec.effective_to IS NULL
    LIMIT 1;
END;
$$;

-- Function to get contract as of a specific date
CREATE OR REPLACE FUNCTION app.get_employment_contract_as_of(
    p_employee_id uuid,
    p_as_of_date date
)
RETURNS TABLE (
    id uuid,
    contract_type app.contract_type,
    employment_type app.employment_type,
    fte numeric(3, 2),
    working_hours_per_week numeric(4, 1),
    probation_end_date date,
    notice_period_days integer,
    effective_from date,
    effective_to date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ec.id, ec.contract_type, ec.employment_type, ec.fte,
           ec.working_hours_per_week, ec.probation_end_date, ec.notice_period_days,
           ec.effective_from, ec.effective_to
    FROM app.employment_contracts ec
    WHERE ec.employee_id = p_employee_id
      AND ec.effective_from <= p_as_of_date
      AND (ec.effective_to IS NULL OR ec.effective_to > p_as_of_date)
    ORDER BY ec.effective_from DESC
    LIMIT 1;
END;
$$;

-- Function to get full contract history for an employee
CREATE OR REPLACE FUNCTION app.get_employment_contract_history(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    contract_type app.contract_type,
    employment_type app.employment_type,
    fte numeric(3, 2),
    effective_from date,
    effective_to date,
    created_at timestamptz,
    created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ec.id, ec.contract_type, ec.employment_type, ec.fte,
           ec.effective_from, ec.effective_to, ec.created_at, ec.created_by
    FROM app.employment_contracts ec
    WHERE ec.employee_id = p_employee_id
    ORDER BY ec.effective_from DESC;
END;
$$;

-- Function to check if employee is on probation
CREATE OR REPLACE FUNCTION app.is_employee_on_probation(
    p_employee_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_probation_end date;
BEGIN
    SELECT probation_end_date INTO v_probation_end
    FROM app.employment_contracts
    WHERE employee_id = p_employee_id
      AND effective_to IS NULL;

    RETURN v_probation_end IS NOT NULL AND v_probation_end > CURRENT_DATE;
END;
$$;

-- Function to get employees with probation ending soon
CREATE OR REPLACE FUNCTION app.get_probation_ending_soon(
    p_tenant_id uuid,
    p_days_ahead integer DEFAULT 30
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    probation_end_date date,
    days_until_end integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ec.employee_id, e.employee_number, ec.probation_end_date,
           (ec.probation_end_date - CURRENT_DATE)::integer AS days_until_end
    FROM app.employment_contracts ec
    INNER JOIN app.employees e ON ec.employee_id = e.id
    WHERE ec.tenant_id = p_tenant_id
      AND ec.effective_to IS NULL
      AND ec.probation_end_date IS NOT NULL
      AND ec.probation_end_date <= CURRENT_DATE + p_days_ahead
      AND ec.probation_end_date >= CURRENT_DATE
      AND e.status = 'active'
    ORDER BY ec.probation_end_date, e.employee_number;
END;
$$;

-- Function to get fixed-term contracts ending soon
CREATE OR REPLACE FUNCTION app.get_contracts_ending_soon(
    p_tenant_id uuid,
    p_days_ahead integer DEFAULT 90
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    contract_type app.contract_type,
    contract_end_date date,
    days_until_end integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ec.employee_id, e.employee_number, ec.contract_type, ec.effective_to,
           (ec.effective_to - CURRENT_DATE)::integer AS days_until_end
    FROM app.employment_contracts ec
    INNER JOIN app.employees e ON ec.employee_id = e.id
    WHERE ec.tenant_id = p_tenant_id
      AND ec.contract_type IN ('fixed_term', 'contractor', 'intern', 'temporary')
      AND ec.effective_to IS NOT NULL
      AND ec.effective_to <= CURRENT_DATE + p_days_ahead
      AND ec.effective_to >= CURRENT_DATE
      AND e.status IN ('active', 'on_leave')
    ORDER BY ec.effective_to, e.employee_number;
END;
$$;

-- Function to update contract (close current and insert new)
CREATE OR REPLACE FUNCTION app.update_employment_contract(
    p_employee_id uuid,
    p_contract_type app.contract_type,
    p_employment_type app.employment_type,
    p_fte numeric(3, 2),
    p_working_hours_per_week numeric(4, 1),
    p_probation_end_date date,
    p_notice_period_days integer,
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
    v_new_id uuid;
BEGIN
    -- Get tenant from employee
    SELECT tenant_id INTO v_tenant_id
    FROM app.employees
    WHERE id = p_employee_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Employee not found: %', p_employee_id;
    END IF;

    -- Close the current contract (if any)
    UPDATE app.employment_contracts
    SET effective_to = p_effective_from,
        updated_at = now()
    WHERE employee_id = p_employee_id
      AND effective_to IS NULL
      AND effective_from < p_effective_from;

    -- Insert the new contract
    INSERT INTO app.employment_contracts (
        tenant_id, employee_id, effective_from,
        contract_type, employment_type, fte,
        working_hours_per_week, probation_end_date, notice_period_days,
        created_by
    )
    VALUES (
        v_tenant_id, p_employee_id, p_effective_from,
        p_contract_type, p_employment_type, p_fte,
        p_working_hours_per_week, p_probation_end_date, p_notice_period_days,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- Function to calculate total FTE for a tenant (headcount report)
CREATE OR REPLACE FUNCTION app.get_tenant_total_fte(
    p_tenant_id uuid
)
RETURNS numeric(10, 2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_total_fte numeric(10, 2);
BEGIN
    SELECT COALESCE(SUM(ec.fte), 0) INTO v_total_fte
    FROM app.employment_contracts ec
    INNER JOIN app.employees e ON ec.employee_id = e.id
    WHERE ec.tenant_id = p_tenant_id
      AND ec.effective_to IS NULL
      AND e.status = 'active';

    RETURN v_total_fte;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.employment_contracts IS 'Effective-dated employment contracts (type, FTE, hours, probation)';
COMMENT ON COLUMN app.employment_contracts.id IS 'Primary UUID identifier for this contract record';
COMMENT ON COLUMN app.employment_contracts.tenant_id IS 'Tenant that owns this data';
COMMENT ON COLUMN app.employment_contracts.employee_id IS 'Employee this contract belongs to';
COMMENT ON COLUMN app.employment_contracts.effective_from IS 'Date this contract version becomes effective';
COMMENT ON COLUMN app.employment_contracts.effective_to IS 'Date this contract ends (NULL = current)';
COMMENT ON COLUMN app.employment_contracts.contract_type IS 'Type of contract (permanent, fixed-term, etc.)';
COMMENT ON COLUMN app.employment_contracts.employment_type IS 'Full-time or part-time classification';
COMMENT ON COLUMN app.employment_contracts.fte IS 'Full-Time Equivalent (1.0 = full-time)';
COMMENT ON COLUMN app.employment_contracts.working_hours_per_week IS 'Standard weekly working hours';
COMMENT ON COLUMN app.employment_contracts.probation_end_date IS 'End date of probation period';
COMMENT ON COLUMN app.employment_contracts.notice_period_days IS 'Required notice period for termination';
COMMENT ON COLUMN app.employment_contracts.created_by IS 'User who created this contract version';
COMMENT ON FUNCTION app.get_current_employment_contract IS 'Returns current active contract for an employee';
COMMENT ON FUNCTION app.get_employment_contract_as_of IS 'Returns contract effective at a specific date';
COMMENT ON FUNCTION app.get_employment_contract_history IS 'Returns all contract versions for audit';
COMMENT ON FUNCTION app.is_employee_on_probation IS 'Checks if employee is currently on probation';
COMMENT ON FUNCTION app.get_probation_ending_soon IS 'Returns employees with probation ending soon';
COMMENT ON FUNCTION app.get_contracts_ending_soon IS 'Returns fixed-term contracts ending soon';
COMMENT ON FUNCTION app.update_employment_contract IS 'Closes current contract and creates new version';
COMMENT ON FUNCTION app.get_tenant_total_fte IS 'Returns total FTE headcount for a tenant';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_tenant_total_fte(uuid);
-- DROP FUNCTION IF EXISTS app.update_employment_contract(uuid, app.contract_type, app.employment_type, numeric, numeric, date, integer, date, uuid);
-- DROP FUNCTION IF EXISTS app.get_contracts_ending_soon(uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_probation_ending_soon(uuid, integer);
-- DROP FUNCTION IF EXISTS app.is_employee_on_probation(uuid);
-- DROP FUNCTION IF EXISTS app.get_employment_contract_history(uuid);
-- DROP FUNCTION IF EXISTS app.get_employment_contract_as_of(uuid, date);
-- DROP FUNCTION IF EXISTS app.get_current_employment_contract(uuid);
-- DROP TRIGGER IF EXISTS update_employment_contracts_updated_at ON app.employment_contracts;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.employment_contracts;
-- DROP POLICY IF EXISTS tenant_isolation ON app.employment_contracts;
-- DROP INDEX IF EXISTS app.idx_employment_contracts_ending;
-- DROP INDEX IF EXISTS app.idx_employment_contracts_probation;
-- DROP INDEX IF EXISTS app.idx_employment_contracts_employment_type;
-- DROP INDEX IF EXISTS app.idx_employment_contracts_type;
-- DROP INDEX IF EXISTS app.idx_employment_contracts_effective_range;
-- DROP INDEX IF EXISTS app.idx_employment_contracts_current;
-- DROP INDEX IF EXISTS app.idx_employment_contracts_tenant_employee;
-- DROP TABLE IF EXISTS app.employment_contracts;
