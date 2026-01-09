-- Migration: 0017_employees
-- Created: 2026-01-07
-- Description: Create the employees table - the core employee record
--              This is the anchor table for all HR data
--              Includes status lifecycle with state machine constraints
--              Links to auth user for self-service access

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Employees Table
-- -----------------------------------------------------------------------------
-- The central employee record and anchor for all HR data
-- One employee record per employment relationship (rehires create new records)
-- Status follows state machine: pending -> active -> on_leave <-> active -> terminated
CREATE TABLE IF NOT EXISTS app.employees (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that employs this person
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Unique employee number within tenant (e.g., 'EMP-001', '12345')
    -- Format is tenant-configurable but must be unique
    employee_number varchar(50) NOT NULL,

    -- Link to auth user for self-service portal access
    -- NULL if employee doesn't have system access (e.g., warehouse workers)
    user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Current employment status (state machine)
    -- pending: Hired but not yet started
    -- active: Currently employed
    -- on_leave: On approved extended leave
    -- terminated: Employment ended
    status app.employee_status NOT NULL DEFAULT 'pending',

    -- Employment dates
    hire_date date NOT NULL,
    termination_date date,
    termination_reason text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Employee number must be unique within tenant
    CONSTRAINT employees_number_unique UNIQUE (tenant_id, employee_number),

    -- Termination date must be on or after hire date
    CONSTRAINT employees_termination_after_hire CHECK (
        termination_date IS NULL OR termination_date >= hire_date
    ),

    -- Termination date required when status is terminated
    CONSTRAINT employees_terminated_has_date CHECK (
        status != 'terminated' OR termination_date IS NOT NULL
    ),

    -- Termination reason required when terminated
    CONSTRAINT employees_terminated_has_reason CHECK (
        status != 'terminated' OR termination_reason IS NOT NULL
    ),

    -- User can only be linked to one employee per tenant (one person, one employment)
    CONSTRAINT employees_user_unique UNIQUE (tenant_id, user_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + employee number
CREATE INDEX IF NOT EXISTS idx_employees_tenant_number
    ON app.employees(tenant_id, employee_number);

-- User lookup (for self-service portal)
CREATE INDEX IF NOT EXISTS idx_employees_tenant_user
    ON app.employees(tenant_id, user_id)
    WHERE user_id IS NOT NULL;

-- Status filtering (find active employees)
CREATE INDEX IF NOT EXISTS idx_employees_tenant_status
    ON app.employees(tenant_id, status);

-- Active employees (very common query)
CREATE INDEX IF NOT EXISTS idx_employees_tenant_active
    ON app.employees(tenant_id)
    WHERE status = 'active';

-- Hire date queries (anniversary, tenure reports)
CREATE INDEX IF NOT EXISTS idx_employees_tenant_hire_date
    ON app.employees(tenant_id, hire_date);

-- Termination date queries (exit reports)
CREATE INDEX IF NOT EXISTS idx_employees_tenant_termination
    ON app.employees(tenant_id, termination_date)
    WHERE termination_date IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.employees ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see employees for their current tenant
CREATE POLICY tenant_isolation ON app.employees
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.employees
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_employees_updated_at
    BEFORE UPDATE ON app.employees
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- State Machine Validation
-- =============================================================================

-- Function to validate employee status transitions
-- State machine:
--   pending -> active (onboarding complete)
--   active -> on_leave (leave started)
--   on_leave -> active (leave ended)
--   active -> terminated (employment ended)
--   on_leave -> terminated (terminated while on leave)
--   terminated -> (no transitions - terminal state; rehire creates new record)
CREATE OR REPLACE FUNCTION app.validate_employee_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- If status hasn't changed, allow the update
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Validate transition based on current (old) status
    CASE OLD.status
        WHEN 'pending' THEN
            -- pending can only transition to active
            IF NEW.status NOT IN ('active') THEN
                RAISE EXCEPTION 'Invalid status transition: pending can only transition to active, not %', NEW.status;
            END IF;

        WHEN 'active' THEN
            -- active can transition to on_leave or terminated
            IF NEW.status NOT IN ('on_leave', 'terminated') THEN
                RAISE EXCEPTION 'Invalid status transition: active can only transition to on_leave or terminated, not %', NEW.status;
            END IF;

        WHEN 'on_leave' THEN
            -- on_leave can transition to active or terminated
            IF NEW.status NOT IN ('active', 'terminated') THEN
                RAISE EXCEPTION 'Invalid status transition: on_leave can only transition to active or terminated, not %', NEW.status;
            END IF;

        WHEN 'terminated' THEN
            -- terminated is a terminal state - no transitions allowed
            -- Rehires should create a new employee record
            RAISE EXCEPTION 'Invalid status transition: terminated is a terminal state. Create a new employee record for rehires.';

        ELSE
            RAISE EXCEPTION 'Unknown status: %', OLD.status;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_employee_status_transition
    BEFORE UPDATE OF status ON app.employees
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_employee_status_transition();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get employee by user ID (for self-service)
CREATE OR REPLACE FUNCTION app.get_employee_by_user(
    p_user_id uuid
)
RETURNS TABLE (
    id uuid,
    tenant_id uuid,
    employee_number varchar(50),
    status app.employee_status,
    hire_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.tenant_id, e.employee_number, e.status, e.hire_date
    FROM app.employees e
    WHERE e.user_id = p_user_id
      AND e.status != 'terminated'
    LIMIT 1;
END;
$$;

-- Function to get employee tenure in years
CREATE OR REPLACE FUNCTION app.get_employee_tenure_years(
    p_employee_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_hire_date date;
    v_end_date date;
BEGIN
    SELECT hire_date, COALESCE(termination_date, CURRENT_DATE)
    INTO v_hire_date, v_end_date
    FROM app.employees
    WHERE id = p_employee_id;

    IF v_hire_date IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN ROUND(EXTRACT(EPOCH FROM (v_end_date - v_hire_date)) / (365.25 * 24 * 60 * 60), 2);
END;
$$;

-- Function to check if employee is currently active
CREATE OR REPLACE FUNCTION app.is_employee_active(
    p_employee_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_status app.employee_status;
BEGIN
    SELECT status INTO v_status
    FROM app.employees
    WHERE id = p_employee_id;

    RETURN v_status = 'active';
END;
$$;

-- Function to generate next employee number for tenant
CREATE OR REPLACE FUNCTION app.generate_employee_number(
    p_tenant_id uuid,
    p_prefix varchar(10) DEFAULT 'EMP'
)
RETURNS varchar(50)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_max_num integer;
    v_next_num integer;
BEGIN
    -- Find the highest numeric suffix for the given prefix
    SELECT COALESCE(MAX(
        CASE
            WHEN employee_number ~ ('^' || p_prefix || '-[0-9]+$')
            THEN CAST(SUBSTRING(employee_number FROM '[0-9]+$') AS integer)
            ELSE 0
        END
    ), 0) INTO v_max_num
    FROM app.employees
    WHERE tenant_id = p_tenant_id;

    v_next_num := v_max_num + 1;

    RETURN p_prefix || '-' || LPAD(v_next_num::text, 5, '0');
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.employees IS 'Core employee record - anchor for all HR data. One record per employment (rehires create new records).';
COMMENT ON COLUMN app.employees.id IS 'Primary UUID identifier for the employee';
COMMENT ON COLUMN app.employees.tenant_id IS 'Tenant that employs this person';
COMMENT ON COLUMN app.employees.employee_number IS 'Unique employee identifier within tenant';
COMMENT ON COLUMN app.employees.user_id IS 'Link to auth user for self-service access (NULL if no system access)';
COMMENT ON COLUMN app.employees.status IS 'Current employment status (state machine: pending->active->on_leave<->active->terminated)';
COMMENT ON COLUMN app.employees.hire_date IS 'Date employment started';
COMMENT ON COLUMN app.employees.termination_date IS 'Date employment ended (required when terminated)';
COMMENT ON COLUMN app.employees.termination_reason IS 'Reason for termination (required when terminated)';
COMMENT ON FUNCTION app.validate_employee_status_transition IS 'Trigger function enforcing valid status state transitions';
COMMENT ON FUNCTION app.get_employee_by_user IS 'Returns active employee record for a user ID (self-service)';
COMMENT ON FUNCTION app.get_employee_tenure_years IS 'Calculates employee tenure in years';
COMMENT ON FUNCTION app.is_employee_active IS 'Returns true if employee status is active';
COMMENT ON FUNCTION app.generate_employee_number IS 'Generates next sequential employee number for a tenant';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.generate_employee_number(uuid, varchar);
-- DROP FUNCTION IF EXISTS app.is_employee_active(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_tenure_years(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_by_user(uuid);
-- DROP TRIGGER IF EXISTS validate_employee_status_transition ON app.employees;
-- DROP FUNCTION IF EXISTS app.validate_employee_status_transition();
-- DROP TRIGGER IF EXISTS update_employees_updated_at ON app.employees;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.employees;
-- DROP POLICY IF EXISTS tenant_isolation ON app.employees;
-- DROP INDEX IF EXISTS app.idx_employees_tenant_termination;
-- DROP INDEX IF EXISTS app.idx_employees_tenant_hire_date;
-- DROP INDEX IF EXISTS app.idx_employees_tenant_active;
-- DROP INDEX IF EXISTS app.idx_employees_tenant_status;
-- DROP INDEX IF EXISTS app.idx_employees_tenant_user;
-- DROP INDEX IF EXISTS app.idx_employees_tenant_number;
-- DROP TABLE IF EXISTS app.employees;
