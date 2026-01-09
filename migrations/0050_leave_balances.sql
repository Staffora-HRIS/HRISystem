-- Migration: 0050_leave_balances
-- Created: 2026-01-07
-- Description: Create the leave_balances table - current balance snapshot per employee/type/year
--              This is a DERIVED TABLE that should always match the aggregated ledger entries
--              IMPORTANT: All balance modifications MUST go through the ledger (0051)
--              This table exists for query performance - it's a materialized view of the ledger
--              Includes computed columns for closing_balance and available_balance

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leave Balances Table
-- -----------------------------------------------------------------------------
-- Stores the current balance state per employee/leave type/year
-- This is a denormalized view of the ledger for fast balance queries
-- CRITICAL: Never modify this table directly - all changes must flow through the ledger
CREATE TABLE IF NOT EXISTS app.leave_balances (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this balance
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The employee this balance belongs to
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- The leave type for this balance
    leave_type_id uuid NOT NULL REFERENCES app.leave_types(id) ON DELETE RESTRICT,

    -- The policy that governs this balance (for reference)
    -- Can be NULL if manually assigned or policy changed
    policy_id uuid REFERENCES app.leave_policies(id) ON DELETE SET NULL,

    -- The calendar year this balance is for
    -- Balances are tracked per year for carryover calculations
    year integer NOT NULL,

    -- ==========================================================================
    -- BALANCE COMPONENTS
    -- All values are in the unit defined by the leave type (days or hours)
    -- ==========================================================================

    -- Opening balance at start of year (usually = previous year's carryover)
    opening_balance numeric(8,2) NOT NULL DEFAULT 0,

    -- Total accrued during this year (from accrual transactions)
    accrued numeric(8,2) NOT NULL DEFAULT 0,

    -- Total used/consumed (from approved leave requests)
    used numeric(8,2) NOT NULL DEFAULT 0,

    -- Total currently pending (in pending approval requests)
    -- This is a soft reservation that may be released if requests are rejected
    pending numeric(8,2) NOT NULL DEFAULT 0,

    -- Net manual adjustments (positive or negative)
    adjustments numeric(8,2) NOT NULL DEFAULT 0,

    -- Amount carried over from previous year
    carryover numeric(8,2) NOT NULL DEFAULT 0,

    -- Amount forfeited (expired carryover, use-it-or-lose-it, etc.)
    forfeited numeric(8,2) NOT NULL DEFAULT 0,

    -- ==========================================================================
    -- COMPUTED BALANCE COLUMNS
    -- These are automatically calculated from the component columns
    -- ==========================================================================

    -- Closing balance = opening + accrued + carryover + adjustments - used - forfeited
    -- This is the actual balance without considering pending requests
    closing_balance numeric(8,2) GENERATED ALWAYS AS (
        opening_balance + accrued + carryover + adjustments - used - forfeited
    ) STORED,

    -- Available balance = closing_balance - pending
    -- This is what the employee can actually request (considers pending requests)
    available_balance numeric(8,2) GENERATED ALWAYS AS (
        opening_balance + accrued + carryover + adjustments - used - pending - forfeited
    ) STORED,

    -- ==========================================================================
    -- TRACKING FIELDS
    -- ==========================================================================

    -- Date of last accrual transaction (for determining next accrual)
    last_accrual_date date,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- One balance record per employee/leave type/year combination
    CONSTRAINT leave_balances_unique UNIQUE (tenant_id, employee_id, leave_type_id, year),

    -- Year must be reasonable (1970-2100)
    CONSTRAINT leave_balances_year_check CHECK (year >= 1970 AND year <= 2100),

    -- Component values must be non-negative (except adjustments which can be negative)
    CONSTRAINT leave_balances_opening_check CHECK (opening_balance >= 0),
    CONSTRAINT leave_balances_accrued_check CHECK (accrued >= 0),
    CONSTRAINT leave_balances_used_check CHECK (used >= 0),
    CONSTRAINT leave_balances_pending_check CHECK (pending >= 0),
    CONSTRAINT leave_balances_carryover_check CHECK (carryover >= 0),
    CONSTRAINT leave_balances_forfeited_check CHECK (forfeited >= 0)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: employee's balances for a year
CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_year
    ON app.leave_balances(tenant_id, employee_id, year);

-- Leave type balance lookup
CREATE INDEX IF NOT EXISTS idx_leave_balances_leave_type
    ON app.leave_balances(tenant_id, leave_type_id, year);

-- Current year balances (most common query)
CREATE INDEX IF NOT EXISTS idx_leave_balances_current_year
    ON app.leave_balances(tenant_id, year)
    WHERE year IS NOT NULL;

-- Employees with pending requests (for approval dashboards)
CREATE INDEX IF NOT EXISTS idx_leave_balances_pending
    ON app.leave_balances(tenant_id, employee_id)
    WHERE pending > 0;

-- Employees with available balance (for reporting)
CREATE INDEX IF NOT EXISTS idx_leave_balances_available
    ON app.leave_balances(tenant_id, leave_type_id, year);

-- Policy lookup (for policy impact analysis)
CREATE INDEX IF NOT EXISTS idx_leave_balances_policy
    ON app.leave_balances(tenant_id, policy_id)
    WHERE policy_id IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.leave_balances ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see balances for their current tenant
CREATE POLICY tenant_isolation ON app.leave_balances
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.leave_balances
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_leave_balances_updated_at
    BEFORE UPDATE ON app.leave_balances
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get or create a balance record for an employee/leave type/year
-- This ensures a balance record exists before ledger entries are created
CREATE OR REPLACE FUNCTION app.ensure_leave_balance(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer,
    p_policy_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_balance_id uuid;
BEGIN
    -- Try to get existing balance
    SELECT id INTO v_balance_id
    FROM app.leave_balances
    WHERE tenant_id = p_tenant_id
      AND employee_id = p_employee_id
      AND leave_type_id = p_leave_type_id
      AND year = p_year;

    -- If not found, create new balance record
    IF v_balance_id IS NULL THEN
        INSERT INTO app.leave_balances (
            tenant_id,
            employee_id,
            leave_type_id,
            policy_id,
            year
        ) VALUES (
            p_tenant_id,
            p_employee_id,
            p_leave_type_id,
            p_policy_id,
            p_year
        )
        RETURNING id INTO v_balance_id;
    END IF;

    RETURN v_balance_id;
END;
$$;

-- Function to get an employee's balance for a specific leave type and year
CREATE OR REPLACE FUNCTION app.get_leave_balance(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer
)
RETURNS TABLE (
    balance_id uuid,
    opening_balance numeric(8,2),
    accrued numeric(8,2),
    used numeric(8,2),
    pending numeric(8,2),
    adjustments numeric(8,2),
    carryover numeric(8,2),
    forfeited numeric(8,2),
    closing_balance numeric(8,2),
    available_balance numeric(8,2),
    last_accrual_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lb.id AS balance_id,
        lb.opening_balance,
        lb.accrued,
        lb.used,
        lb.pending,
        lb.adjustments,
        lb.carryover,
        lb.forfeited,
        lb.closing_balance,
        lb.available_balance,
        lb.last_accrual_date
    FROM app.leave_balances lb
    WHERE lb.tenant_id = p_tenant_id
      AND lb.employee_id = p_employee_id
      AND lb.leave_type_id = p_leave_type_id
      AND lb.year = p_year;
END;
$$;

-- Function to get all balances for an employee for the current year
CREATE OR REPLACE FUNCTION app.get_employee_balances(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer
)
RETURNS TABLE (
    balance_id uuid,
    leave_type_id uuid,
    leave_type_code varchar(50),
    leave_type_name varchar(255),
    leave_type_color varchar(7),
    closing_balance numeric(8,2),
    available_balance numeric(8,2),
    pending numeric(8,2),
    used numeric(8,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lb.id AS balance_id,
        lt.id AS leave_type_id,
        lt.code AS leave_type_code,
        lt.name AS leave_type_name,
        lt.color AS leave_type_color,
        lb.closing_balance,
        lb.available_balance,
        lb.pending,
        lb.used
    FROM app.leave_balances lb
    INNER JOIN app.leave_types lt ON lt.id = lb.leave_type_id
    WHERE lb.tenant_id = p_tenant_id
      AND lb.employee_id = p_employee_id
      AND lb.year = p_year
      AND lt.is_active = true
    ORDER BY lt.category, lt.name;
END;
$$;

-- Function to check if employee has sufficient balance for a request
-- This considers pending requests to prevent double-booking
CREATE OR REPLACE FUNCTION app.check_balance_availability(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_leave_type_id uuid,
    p_requested_days numeric,
    p_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer
)
RETURNS TABLE (
    is_available boolean,
    available_balance numeric(8,2),
    shortfall numeric(8,2),
    allow_negative boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_available numeric;
    v_allow_negative boolean;
BEGIN
    -- Get available balance
    SELECT lb.available_balance INTO v_available
    FROM app.leave_balances lb
    WHERE lb.tenant_id = p_tenant_id
      AND lb.employee_id = p_employee_id
      AND lb.leave_type_id = p_leave_type_id
      AND lb.year = p_year;

    -- Default to 0 if no balance record exists
    v_available := COALESCE(v_available, 0);

    -- Check if leave type allows negative balance
    SELECT lt.allow_negative_balance INTO v_allow_negative
    FROM app.leave_types lt
    WHERE lt.id = p_leave_type_id;

    v_allow_negative := COALESCE(v_allow_negative, false);

    -- Return availability check result
    RETURN QUERY SELECT
        (v_available >= p_requested_days OR v_allow_negative) AS is_available,
        v_available AS available_balance,
        GREATEST(p_requested_days - v_available, 0) AS shortfall,
        v_allow_negative AS allow_negative;
END;
$$;

-- Function to get balance summary for a team (manager view)
CREATE OR REPLACE FUNCTION app.get_team_balance_summary(
    p_tenant_id uuid,
    p_manager_employee_id uuid,
    p_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    leave_type_id uuid,
    leave_type_name varchar(255),
    available_balance numeric(8,2),
    pending numeric(8,2),
    used numeric(8,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Get balances for employees reporting to this manager
    RETURN QUERY
    SELECT
        e.id AS employee_id,
        e.employee_number,
        lt.id AS leave_type_id,
        lt.name AS leave_type_name,
        lb.available_balance,
        lb.pending,
        lb.used
    FROM app.employees e
    INNER JOIN app.reporting_lines rl ON rl.employee_id = e.id
        AND rl.is_primary = true
        AND rl.end_date IS NULL
    INNER JOIN app.leave_balances lb ON lb.employee_id = e.id AND lb.year = p_year
    INNER JOIN app.leave_types lt ON lt.id = lb.leave_type_id AND lt.is_active = true
    WHERE e.tenant_id = p_tenant_id
      AND rl.manager_employee_id = p_manager_employee_id
      AND e.status = 'active'
    ORDER BY e.employee_number, lt.name;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.leave_balances IS 'Leave balance snapshots per employee/type/year. DERIVED from ledger - never update directly.';
COMMENT ON COLUMN app.leave_balances.id IS 'Primary UUID identifier for the balance record';
COMMENT ON COLUMN app.leave_balances.tenant_id IS 'Tenant that owns this balance';
COMMENT ON COLUMN app.leave_balances.employee_id IS 'The employee this balance belongs to';
COMMENT ON COLUMN app.leave_balances.leave_type_id IS 'The leave type for this balance';
COMMENT ON COLUMN app.leave_balances.policy_id IS 'The policy governing this balance (reference only)';
COMMENT ON COLUMN app.leave_balances.year IS 'Calendar year this balance is for';
COMMENT ON COLUMN app.leave_balances.opening_balance IS 'Balance at start of year';
COMMENT ON COLUMN app.leave_balances.accrued IS 'Total accrued during this year';
COMMENT ON COLUMN app.leave_balances.used IS 'Total used/consumed';
COMMENT ON COLUMN app.leave_balances.pending IS 'Total in pending requests (soft reservation)';
COMMENT ON COLUMN app.leave_balances.adjustments IS 'Net manual adjustments';
COMMENT ON COLUMN app.leave_balances.carryover IS 'Amount carried from previous year';
COMMENT ON COLUMN app.leave_balances.forfeited IS 'Amount forfeited/expired';
COMMENT ON COLUMN app.leave_balances.closing_balance IS 'Computed: opening + accrued + carryover + adjustments - used - forfeited';
COMMENT ON COLUMN app.leave_balances.available_balance IS 'Computed: closing_balance - pending (what can be requested)';
COMMENT ON COLUMN app.leave_balances.last_accrual_date IS 'Date of last accrual transaction';
COMMENT ON FUNCTION app.ensure_leave_balance IS 'Gets or creates a balance record for employee/type/year';
COMMENT ON FUNCTION app.get_leave_balance IS 'Returns balance details for a specific employee/type/year';
COMMENT ON FUNCTION app.get_employee_balances IS 'Returns all balances for an employee for a year';
COMMENT ON FUNCTION app.check_balance_availability IS 'Checks if employee has sufficient balance for a request';
COMMENT ON FUNCTION app.get_team_balance_summary IS 'Returns balance summary for employees reporting to a manager';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_team_balance_summary(uuid, uuid, integer);
-- DROP FUNCTION IF EXISTS app.check_balance_availability(uuid, uuid, uuid, numeric, integer);
-- DROP FUNCTION IF EXISTS app.get_employee_balances(uuid, uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_leave_balance(uuid, uuid, uuid, integer);
-- DROP FUNCTION IF EXISTS app.ensure_leave_balance(uuid, uuid, uuid, integer, uuid);
-- DROP TRIGGER IF EXISTS update_leave_balances_updated_at ON app.leave_balances;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.leave_balances;
-- DROP POLICY IF EXISTS tenant_isolation ON app.leave_balances;
-- DROP INDEX IF EXISTS app.idx_leave_balances_policy;
-- DROP INDEX IF EXISTS app.idx_leave_balances_available;
-- DROP INDEX IF EXISTS app.idx_leave_balances_pending;
-- DROP INDEX IF EXISTS app.idx_leave_balances_current_year;
-- DROP INDEX IF EXISTS app.idx_leave_balances_leave_type;
-- DROP INDEX IF EXISTS app.idx_leave_balances_employee_year;
-- DROP TABLE IF EXISTS app.leave_balances;
