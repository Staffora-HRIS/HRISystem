-- Migration: 0023_position_assignments
-- Created: 2026-01-07
-- Description: Create the position_assignments table for effective-dated position assignments
--              Links employees to positions and org units
--              Supports primary/secondary positions and tracks assignment reasons

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Position Assignments Table
-- -----------------------------------------------------------------------------
-- Effective-dated position assignments linking employees to positions
-- An employee can have multiple positions but only ONE primary position at a time
-- Position changes (promotions, transfers) create new records with reasons
CREATE TABLE IF NOT EXISTS app.position_assignments (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this data
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee being assigned
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Effective dating
    -- effective_from: When this assignment becomes valid
    -- effective_to: When this assignment ends (NULL = currently effective)
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,

    -- Position being assigned to
    position_id uuid NOT NULL REFERENCES app.positions(id) ON DELETE RESTRICT,

    -- Org unit for this assignment (may differ from position's default org unit)
    org_unit_id uuid NOT NULL REFERENCES app.org_units(id) ON DELETE RESTRICT,

    -- Primary position flag
    -- Only ONE primary position assignment can be active at a time per employee
    is_primary boolean NOT NULL DEFAULT true,

    -- Reason for this assignment (for audit trail)
    -- Examples: 'hire', 'promotion', 'transfer', 'restructure', 'acting'
    assignment_reason varchar(100),

    -- Audit trail
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Effective dates validation
    CONSTRAINT position_assignments_effective_dates CHECK (
        effective_to IS NULL OR effective_to > effective_from
    )
);

-- =============================================================================
-- Partial Unique Index for Primary Position
-- =============================================================================

-- Ensure only one primary position per employee at any given time
-- This is a partial unique index that only applies to primary assignments
CREATE UNIQUE INDEX IF NOT EXISTS idx_position_assignments_primary_unique
    ON app.position_assignments(tenant_id, employee_id, effective_from)
    WHERE is_primary = true AND effective_to IS NULL;

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: find assignments for an employee
CREATE INDEX IF NOT EXISTS idx_position_assignments_tenant_employee
    ON app.position_assignments(tenant_id, employee_id);

-- Find current assignments (effective_to IS NULL)
CREATE INDEX IF NOT EXISTS idx_position_assignments_current
    ON app.position_assignments(tenant_id, employee_id)
    WHERE effective_to IS NULL;

-- Effective date range queries
CREATE INDEX IF NOT EXISTS idx_position_assignments_effective_range
    ON app.position_assignments(tenant_id, employee_id, effective_from, effective_to);

-- Find employees in a position
CREATE INDEX IF NOT EXISTS idx_position_assignments_position
    ON app.position_assignments(tenant_id, position_id)
    WHERE effective_to IS NULL;

-- Find employees in an org unit
CREATE INDEX IF NOT EXISTS idx_position_assignments_org_unit
    ON app.position_assignments(tenant_id, org_unit_id)
    WHERE effective_to IS NULL;

-- Primary position lookup
CREATE INDEX IF NOT EXISTS idx_position_assignments_primary
    ON app.position_assignments(tenant_id, employee_id)
    WHERE is_primary = true AND effective_to IS NULL;

-- Assignment reason filtering (for reports)
CREATE INDEX IF NOT EXISTS idx_position_assignments_reason
    ON app.position_assignments(tenant_id, assignment_reason, effective_from)
    WHERE assignment_reason IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.position_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see assignments for their current tenant
CREATE POLICY tenant_isolation ON app.position_assignments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.position_assignments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_position_assignments_updated_at
    BEFORE UPDATE ON app.position_assignments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get current position assignment(s) for an employee
CREATE OR REPLACE FUNCTION app.get_employee_position_assignments(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    position_id uuid,
    position_code varchar(50),
    position_title varchar(255),
    org_unit_id uuid,
    org_unit_name varchar(255),
    is_primary boolean,
    assignment_reason varchar(100),
    effective_from date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT pa.id, pa.position_id, p.code AS position_code, p.title AS position_title,
           pa.org_unit_id, ou.name AS org_unit_name, pa.is_primary,
           pa.assignment_reason, pa.effective_from
    FROM app.position_assignments pa
    INNER JOIN app.positions p ON pa.position_id = p.id
    INNER JOIN app.org_units ou ON pa.org_unit_id = ou.id
    WHERE pa.employee_id = p_employee_id
      AND pa.effective_to IS NULL
    ORDER BY pa.is_primary DESC, pa.effective_from DESC;
END;
$$;

-- Function to get primary position for an employee
CREATE OR REPLACE FUNCTION app.get_employee_primary_position(
    p_employee_id uuid
)
RETURNS TABLE (
    position_id uuid,
    position_code varchar(50),
    position_title varchar(255),
    org_unit_id uuid,
    org_unit_name varchar(255),
    job_grade varchar(20),
    effective_from date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT pa.position_id, p.code AS position_code, p.title AS position_title,
           pa.org_unit_id, ou.name AS org_unit_name, p.job_grade, pa.effective_from
    FROM app.position_assignments pa
    INNER JOIN app.positions p ON pa.position_id = p.id
    INNER JOIN app.org_units ou ON pa.org_unit_id = ou.id
    WHERE pa.employee_id = p_employee_id
      AND pa.is_primary = true
      AND pa.effective_to IS NULL
    LIMIT 1;
END;
$$;

-- Function to get employees in a position
CREATE OR REPLACE FUNCTION app.get_employees_in_position(
    p_position_id uuid
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    is_primary boolean,
    effective_from date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT pa.employee_id, e.employee_number, pa.is_primary, pa.effective_from
    FROM app.position_assignments pa
    INNER JOIN app.employees e ON pa.employee_id = e.id
    WHERE pa.position_id = p_position_id
      AND pa.effective_to IS NULL
      AND e.status IN ('active', 'on_leave')
    ORDER BY pa.is_primary DESC, pa.effective_from;
END;
$$;

-- Function to get employees in an org unit
CREATE OR REPLACE FUNCTION app.get_employees_in_org_unit(
    p_org_unit_id uuid,
    p_include_children boolean DEFAULT false
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    position_title varchar(255),
    is_primary boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    IF p_include_children THEN
        -- Include employees in child org units
        RETURN QUERY
        SELECT pa.employee_id, e.employee_number, p.title AS position_title, pa.is_primary
        FROM app.position_assignments pa
        INNER JOIN app.employees e ON pa.employee_id = e.id
        INNER JOIN app.positions p ON pa.position_id = p.id
        INNER JOIN app.org_units ou ON pa.org_unit_id = ou.id
        INNER JOIN app.org_units parent ON ou.path <@ parent.path
        WHERE parent.id = p_org_unit_id
          AND pa.effective_to IS NULL
          AND e.status IN ('active', 'on_leave')
        ORDER BY pa.is_primary DESC, e.employee_number;
    ELSE
        -- Only direct org unit
        RETURN QUERY
        SELECT pa.employee_id, e.employee_number, p.title AS position_title, pa.is_primary
        FROM app.position_assignments pa
        INNER JOIN app.employees e ON pa.employee_id = e.id
        INNER JOIN app.positions p ON pa.position_id = p.id
        WHERE pa.org_unit_id = p_org_unit_id
          AND pa.effective_to IS NULL
          AND e.status IN ('active', 'on_leave')
        ORDER BY pa.is_primary DESC, e.employee_number;
    END IF;
END;
$$;

-- Function to get position assignment history
CREATE OR REPLACE FUNCTION app.get_position_assignment_history(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    position_title varchar(255),
    org_unit_name varchar(255),
    is_primary boolean,
    assignment_reason varchar(100),
    effective_from date,
    effective_to date,
    created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT pa.id, p.title AS position_title, ou.name AS org_unit_name,
           pa.is_primary, pa.assignment_reason, pa.effective_from, pa.effective_to,
           pa.created_by
    FROM app.position_assignments pa
    INNER JOIN app.positions p ON pa.position_id = p.id
    INNER JOIN app.org_units ou ON pa.org_unit_id = ou.id
    WHERE pa.employee_id = p_employee_id
    ORDER BY pa.effective_from DESC;
END;
$$;

-- Function to assign employee to position (effective-dated)
CREATE OR REPLACE FUNCTION app.assign_employee_to_position(
    p_employee_id uuid,
    p_position_id uuid,
    p_org_unit_id uuid,
    p_is_primary boolean,
    p_assignment_reason varchar(100),
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

    -- If this is a primary position, close any existing primary assignment
    IF p_is_primary THEN
        UPDATE app.position_assignments
        SET effective_to = p_effective_from,
            updated_at = now()
        WHERE employee_id = p_employee_id
          AND is_primary = true
          AND effective_to IS NULL
          AND effective_from < p_effective_from;
    END IF;

    -- Insert the new assignment
    INSERT INTO app.position_assignments (
        tenant_id, employee_id, effective_from,
        position_id, org_unit_id, is_primary, assignment_reason,
        created_by
    )
    VALUES (
        v_tenant_id, p_employee_id, p_effective_from,
        p_position_id, p_org_unit_id, p_is_primary, p_assignment_reason,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- Function to end a position assignment
CREATE OR REPLACE FUNCTION app.end_position_assignment(
    p_assignment_id uuid,
    p_effective_to date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.position_assignments
    SET effective_to = p_effective_to,
        updated_at = now()
    WHERE id = p_assignment_id
      AND effective_to IS NULL
      AND effective_from < p_effective_to;

    RETURN FOUND;
END;
$$;

-- Function to count employees in each position (headcount report)
CREATE OR REPLACE FUNCTION app.get_position_headcount(
    p_tenant_id uuid
)
RETURNS TABLE (
    position_id uuid,
    position_code varchar(50),
    position_title varchar(255),
    headcount_limit integer,
    current_headcount bigint,
    is_overstaffed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.code, p.title, p.headcount,
           COUNT(pa.id)::bigint AS current_headcount,
           COUNT(pa.id) > p.headcount AS is_overstaffed
    FROM app.positions p
    LEFT JOIN app.position_assignments pa ON p.id = pa.position_id
        AND pa.effective_to IS NULL
    LEFT JOIN app.employees e ON pa.employee_id = e.id
        AND e.status IN ('active', 'on_leave')
    WHERE p.tenant_id = p_tenant_id
      AND p.is_active = true
    GROUP BY p.id, p.code, p.title, p.headcount
    ORDER BY p.title;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.position_assignments IS 'Effective-dated position assignments linking employees to positions and org units';
COMMENT ON COLUMN app.position_assignments.id IS 'Primary UUID identifier for this assignment';
COMMENT ON COLUMN app.position_assignments.tenant_id IS 'Tenant that owns this data';
COMMENT ON COLUMN app.position_assignments.employee_id IS 'Employee being assigned';
COMMENT ON COLUMN app.position_assignments.effective_from IS 'Date this assignment becomes effective';
COMMENT ON COLUMN app.position_assignments.effective_to IS 'Date this assignment ends (NULL = current)';
COMMENT ON COLUMN app.position_assignments.position_id IS 'Position being assigned to';
COMMENT ON COLUMN app.position_assignments.org_unit_id IS 'Org unit for this assignment';
COMMENT ON COLUMN app.position_assignments.is_primary IS 'Whether this is the primary position (only one allowed)';
COMMENT ON COLUMN app.position_assignments.assignment_reason IS 'Reason for assignment (hire, promotion, transfer, etc.)';
COMMENT ON COLUMN app.position_assignments.created_by IS 'User who created this assignment';
COMMENT ON FUNCTION app.get_employee_position_assignments IS 'Returns all current position assignments for an employee';
COMMENT ON FUNCTION app.get_employee_primary_position IS 'Returns primary position for an employee';
COMMENT ON FUNCTION app.get_employees_in_position IS 'Returns employees assigned to a position';
COMMENT ON FUNCTION app.get_employees_in_org_unit IS 'Returns employees in an org unit (optionally including children)';
COMMENT ON FUNCTION app.get_position_assignment_history IS 'Returns position assignment history for audit';
COMMENT ON FUNCTION app.assign_employee_to_position IS 'Assigns employee to a position with effective dating';
COMMENT ON FUNCTION app.end_position_assignment IS 'Ends a position assignment on a given date';
COMMENT ON FUNCTION app.get_position_headcount IS 'Returns headcount by position for staffing analysis';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_position_headcount(uuid);
-- DROP FUNCTION IF EXISTS app.end_position_assignment(uuid, date);
-- DROP FUNCTION IF EXISTS app.assign_employee_to_position(uuid, uuid, uuid, boolean, varchar, date, uuid);
-- DROP FUNCTION IF EXISTS app.get_position_assignment_history(uuid);
-- DROP FUNCTION IF EXISTS app.get_employees_in_org_unit(uuid, boolean);
-- DROP FUNCTION IF EXISTS app.get_employees_in_position(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_primary_position(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_position_assignments(uuid);
-- DROP TRIGGER IF EXISTS update_position_assignments_updated_at ON app.position_assignments;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.position_assignments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.position_assignments;
-- DROP INDEX IF EXISTS app.idx_position_assignments_reason;
-- DROP INDEX IF EXISTS app.idx_position_assignments_primary;
-- DROP INDEX IF EXISTS app.idx_position_assignments_org_unit;
-- DROP INDEX IF EXISTS app.idx_position_assignments_position;
-- DROP INDEX IF EXISTS app.idx_position_assignments_effective_range;
-- DROP INDEX IF EXISTS app.idx_position_assignments_current;
-- DROP INDEX IF EXISTS app.idx_position_assignments_tenant_employee;
-- DROP INDEX IF EXISTS app.idx_position_assignments_primary_unique;
-- DROP TABLE IF EXISTS app.position_assignments;
