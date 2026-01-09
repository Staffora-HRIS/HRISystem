-- Migration: 0024_reporting_lines
-- Created: 2026-01-07
-- Description: Create the reporting_lines table for effective-dated manager relationships
--              Defines who reports to whom (direct, dotted-line, matrix relationships)
--              Supports one primary manager with optional secondary/matrix managers

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reporting Lines Table
-- -----------------------------------------------------------------------------
-- Effective-dated manager relationships between employees
-- Each employee should have ONE primary manager but can have multiple secondary
-- Supports different relationship types: direct, dotted, matrix
CREATE TABLE IF NOT EXISTS app.reporting_lines (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this data
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Employee being managed (the report)
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Effective dating
    -- effective_from: When this reporting relationship becomes valid
    -- effective_to: When this relationship ends (NULL = currently effective)
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,

    -- Manager (the person being reported to)
    manager_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Primary manager flag
    -- Only ONE primary manager can be active at a time per employee
    is_primary boolean NOT NULL DEFAULT true,

    -- Type of reporting relationship
    -- direct: Standard hierarchical reporting
    -- dotted: Secondary/functional reporting (dotted line)
    -- matrix: Matrix organization reporting
    relationship_type varchar(50) NOT NULL DEFAULT 'direct',

    -- Audit trail
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Effective dates validation
    CONSTRAINT reporting_lines_effective_dates CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),

    -- Cannot report to self
    CONSTRAINT reporting_lines_no_self_report CHECK (
        manager_id != employee_id
    ),

    -- Valid relationship types
    CONSTRAINT reporting_lines_type_check CHECK (
        relationship_type IN ('direct', 'dotted', 'matrix')
    )
);

-- =============================================================================
-- Partial Unique Index for Primary Manager
-- =============================================================================

-- Ensure only one primary manager per employee at any given time
CREATE UNIQUE INDEX IF NOT EXISTS idx_reporting_lines_primary_unique
    ON app.reporting_lines(tenant_id, employee_id, effective_from)
    WHERE is_primary = true AND effective_to IS NULL;

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: find reporting lines for an employee
CREATE INDEX IF NOT EXISTS idx_reporting_lines_tenant_employee
    ON app.reporting_lines(tenant_id, employee_id);

-- Find current reporting lines (effective_to IS NULL)
CREATE INDEX IF NOT EXISTS idx_reporting_lines_current
    ON app.reporting_lines(tenant_id, employee_id)
    WHERE effective_to IS NULL;

-- Effective date range queries
CREATE INDEX IF NOT EXISTS idx_reporting_lines_effective_range
    ON app.reporting_lines(tenant_id, employee_id, effective_from, effective_to);

-- Find direct reports for a manager
CREATE INDEX IF NOT EXISTS idx_reporting_lines_manager
    ON app.reporting_lines(tenant_id, manager_id)
    WHERE effective_to IS NULL;

-- Primary manager lookup
CREATE INDEX IF NOT EXISTS idx_reporting_lines_primary
    ON app.reporting_lines(tenant_id, employee_id)
    WHERE is_primary = true AND effective_to IS NULL;

-- Relationship type filtering
CREATE INDEX IF NOT EXISTS idx_reporting_lines_type
    ON app.reporting_lines(tenant_id, relationship_type)
    WHERE effective_to IS NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.reporting_lines ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see reporting lines for their current tenant
CREATE POLICY tenant_isolation ON app.reporting_lines
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.reporting_lines
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_reporting_lines_updated_at
    BEFORE UPDATE ON app.reporting_lines
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Cycle Detection
-- =============================================================================

-- Function to prevent circular reporting relationships
CREATE OR REPLACE FUNCTION app.prevent_reporting_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_manager_id uuid;
    v_visited uuid[] := ARRAY[]::uuid[];
BEGIN
    -- Only check for cycles on active relationships
    IF NEW.effective_to IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Walk up the reporting tree from the new manager
    v_current_manager_id := NEW.manager_id;

    WHILE v_current_manager_id IS NOT NULL LOOP
        -- Check if we've found the employee (cycle detected)
        IF v_current_manager_id = NEW.employee_id THEN
            RAISE EXCEPTION 'Circular reference detected in reporting structure. Employee % cannot report to % as it would create a cycle.',
                NEW.employee_id, NEW.manager_id;
        END IF;

        -- Check if we've visited this manager before (infinite loop protection)
        IF v_current_manager_id = ANY(v_visited) THEN
            EXIT;
        END IF;

        v_visited := array_append(v_visited, v_current_manager_id);

        -- Get the manager's primary manager
        SELECT manager_id INTO v_current_manager_id
        FROM app.reporting_lines
        WHERE employee_id = v_current_manager_id
          AND is_primary = true
          AND effective_to IS NULL;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_reporting_cycle
    BEFORE INSERT OR UPDATE ON app.reporting_lines
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_reporting_cycle();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get current manager(s) for an employee
CREATE OR REPLACE FUNCTION app.get_employee_managers(
    p_employee_id uuid
)
RETURNS TABLE (
    id uuid,
    manager_id uuid,
    manager_number varchar(50),
    manager_name text,
    is_primary boolean,
    relationship_type varchar(50),
    effective_from date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT rl.id, rl.manager_id, e.employee_number,
           app.get_employee_display_name(rl.manager_id) AS manager_name,
           rl.is_primary, rl.relationship_type, rl.effective_from
    FROM app.reporting_lines rl
    INNER JOIN app.employees e ON rl.manager_id = e.id
    WHERE rl.employee_id = p_employee_id
      AND rl.effective_to IS NULL
    ORDER BY rl.is_primary DESC, rl.relationship_type;
END;
$$;

-- Function to get primary manager for an employee
CREATE OR REPLACE FUNCTION app.get_employee_primary_manager(
    p_employee_id uuid
)
RETURNS TABLE (
    manager_id uuid,
    manager_number varchar(50),
    manager_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT rl.manager_id, e.employee_number,
           app.get_employee_display_name(rl.manager_id) AS manager_name
    FROM app.reporting_lines rl
    INNER JOIN app.employees e ON rl.manager_id = e.id
    WHERE rl.employee_id = p_employee_id
      AND rl.is_primary = true
      AND rl.effective_to IS NULL
    LIMIT 1;
END;
$$;

-- Function to get direct reports for a manager
CREATE OR REPLACE FUNCTION app.get_direct_reports(
    p_manager_id uuid
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    employee_name text,
    relationship_type varchar(50),
    effective_from date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT rl.employee_id, e.employee_number,
           app.get_employee_display_name(rl.employee_id) AS employee_name,
           rl.relationship_type, rl.effective_from
    FROM app.reporting_lines rl
    INNER JOIN app.employees e ON rl.employee_id = e.id
    WHERE rl.manager_id = p_manager_id
      AND rl.effective_to IS NULL
      AND e.status IN ('active', 'on_leave')
    ORDER BY rl.is_primary DESC, e.employee_number;
END;
$$;

-- Function to get all reports (direct and indirect) for a manager
CREATE OR REPLACE FUNCTION app.get_all_reports(
    p_manager_id uuid
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    employee_name text,
    level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE report_hierarchy AS (
        -- Direct reports (level 1)
        SELECT rl.employee_id, e.employee_number,
               app.get_employee_display_name(rl.employee_id) AS employee_name,
               1 AS level
        FROM app.reporting_lines rl
        INNER JOIN app.employees e ON rl.employee_id = e.id
        WHERE rl.manager_id = p_manager_id
          AND rl.is_primary = true
          AND rl.effective_to IS NULL
          AND e.status IN ('active', 'on_leave')

        UNION ALL

        -- Indirect reports (recursive)
        SELECT rl.employee_id, e.employee_number,
               app.get_employee_display_name(rl.employee_id) AS employee_name,
               rh.level + 1
        FROM app.reporting_lines rl
        INNER JOIN report_hierarchy rh ON rl.manager_id = rh.employee_id
        INNER JOIN app.employees e ON rl.employee_id = e.id
        WHERE rl.is_primary = true
          AND rl.effective_to IS NULL
          AND e.status IN ('active', 'on_leave')
    )
    SELECT rh.employee_id, rh.employee_number, rh.employee_name, rh.level
    FROM report_hierarchy rh
    ORDER BY rh.level, rh.employee_number;
END;
$$;

-- Function to get reporting chain (upward hierarchy)
CREATE OR REPLACE FUNCTION app.get_reporting_chain(
    p_employee_id uuid
)
RETURNS TABLE (
    manager_id uuid,
    manager_number varchar(50),
    manager_name text,
    level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE manager_hierarchy AS (
        -- Direct manager (level 1)
        SELECT rl.manager_id, e.employee_number,
               app.get_employee_display_name(rl.manager_id) AS manager_name,
               1 AS level
        FROM app.reporting_lines rl
        INNER JOIN app.employees e ON rl.manager_id = e.id
        WHERE rl.employee_id = p_employee_id
          AND rl.is_primary = true
          AND rl.effective_to IS NULL

        UNION ALL

        -- Higher level managers (recursive)
        SELECT rl.manager_id, e.employee_number,
               app.get_employee_display_name(rl.manager_id) AS manager_name,
               mh.level + 1
        FROM app.reporting_lines rl
        INNER JOIN manager_hierarchy mh ON rl.employee_id = mh.manager_id
        INNER JOIN app.employees e ON rl.manager_id = e.id
        WHERE rl.is_primary = true
          AND rl.effective_to IS NULL
    )
    SELECT mh.manager_id, mh.manager_number, mh.manager_name, mh.level
    FROM manager_hierarchy mh
    ORDER BY mh.level;
END;
$$;

-- Function to set primary manager for an employee
CREATE OR REPLACE FUNCTION app.set_employee_manager(
    p_employee_id uuid,
    p_manager_id uuid,
    p_relationship_type varchar(50),
    p_is_primary boolean,
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

    -- Validate manager exists and is active
    IF NOT EXISTS (
        SELECT 1 FROM app.employees
        WHERE id = p_manager_id AND status IN ('active', 'on_leave')
    ) THEN
        RAISE EXCEPTION 'Manager not found or not active: %', p_manager_id;
    END IF;

    -- If this is a primary manager, close any existing primary relationship
    IF p_is_primary THEN
        UPDATE app.reporting_lines
        SET effective_to = p_effective_from,
            updated_at = now()
        WHERE employee_id = p_employee_id
          AND is_primary = true
          AND effective_to IS NULL
          AND effective_from < p_effective_from;
    END IF;

    -- Insert the new reporting relationship
    INSERT INTO app.reporting_lines (
        tenant_id, employee_id, effective_from,
        manager_id, is_primary, relationship_type,
        created_by
    )
    VALUES (
        v_tenant_id, p_employee_id, p_effective_from,
        p_manager_id, p_is_primary, p_relationship_type,
        p_created_by
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- Function to end a reporting relationship
CREATE OR REPLACE FUNCTION app.end_reporting_line(
    p_reporting_line_id uuid,
    p_effective_to date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.reporting_lines
    SET effective_to = p_effective_to,
        updated_at = now()
    WHERE id = p_reporting_line_id
      AND effective_to IS NULL
      AND effective_from < p_effective_to;

    RETURN FOUND;
END;
$$;

-- Function to check if employee is a manager (has direct reports)
CREATE OR REPLACE FUNCTION app.is_employee_manager(
    p_employee_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM app.reporting_lines rl
        INNER JOIN app.employees e ON rl.employee_id = e.id
        WHERE rl.manager_id = p_employee_id
          AND rl.effective_to IS NULL
          AND e.status IN ('active', 'on_leave')
    );
END;
$$;

-- Function to get manager span of control (count of direct reports)
CREATE OR REPLACE FUNCTION app.get_manager_span_of_control(
    p_manager_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_count integer;
BEGIN
    SELECT COUNT(*)::integer INTO v_count
    FROM app.reporting_lines rl
    INNER JOIN app.employees e ON rl.employee_id = e.id
    WHERE rl.manager_id = p_manager_id
      AND rl.is_primary = true
      AND rl.effective_to IS NULL
      AND e.status IN ('active', 'on_leave');

    RETURN v_count;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.reporting_lines IS 'Effective-dated manager relationships (direct, dotted-line, matrix)';
COMMENT ON COLUMN app.reporting_lines.id IS 'Primary UUID identifier for this reporting relationship';
COMMENT ON COLUMN app.reporting_lines.tenant_id IS 'Tenant that owns this data';
COMMENT ON COLUMN app.reporting_lines.employee_id IS 'Employee being managed (the report)';
COMMENT ON COLUMN app.reporting_lines.effective_from IS 'Date this relationship becomes effective';
COMMENT ON COLUMN app.reporting_lines.effective_to IS 'Date this relationship ends (NULL = current)';
COMMENT ON COLUMN app.reporting_lines.manager_id IS 'Manager (person being reported to)';
COMMENT ON COLUMN app.reporting_lines.is_primary IS 'Whether this is the primary manager (only one allowed)';
COMMENT ON COLUMN app.reporting_lines.relationship_type IS 'Type of relationship (direct, dotted, matrix)';
COMMENT ON COLUMN app.reporting_lines.created_by IS 'User who created this relationship';
COMMENT ON FUNCTION app.prevent_reporting_cycle IS 'Trigger function to prevent circular reporting relationships';
COMMENT ON FUNCTION app.get_employee_managers IS 'Returns all current managers for an employee';
COMMENT ON FUNCTION app.get_employee_primary_manager IS 'Returns primary manager for an employee';
COMMENT ON FUNCTION app.get_direct_reports IS 'Returns employees who report to a manager';
COMMENT ON FUNCTION app.get_all_reports IS 'Returns all direct and indirect reports (org tree)';
COMMENT ON FUNCTION app.get_reporting_chain IS 'Returns upward reporting chain to top of org';
COMMENT ON FUNCTION app.set_employee_manager IS 'Sets a manager relationship with effective dating';
COMMENT ON FUNCTION app.end_reporting_line IS 'Ends a reporting relationship on a given date';
COMMENT ON FUNCTION app.is_employee_manager IS 'Checks if employee has direct reports';
COMMENT ON FUNCTION app.get_manager_span_of_control IS 'Returns count of direct reports for a manager';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_manager_span_of_control(uuid);
-- DROP FUNCTION IF EXISTS app.is_employee_manager(uuid);
-- DROP FUNCTION IF EXISTS app.end_reporting_line(uuid, date);
-- DROP FUNCTION IF EXISTS app.set_employee_manager(uuid, uuid, varchar, boolean, date, uuid);
-- DROP FUNCTION IF EXISTS app.get_reporting_chain(uuid);
-- DROP FUNCTION IF EXISTS app.get_all_reports(uuid);
-- DROP FUNCTION IF EXISTS app.get_direct_reports(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_primary_manager(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_managers(uuid);
-- DROP TRIGGER IF EXISTS prevent_reporting_cycle ON app.reporting_lines;
-- DROP FUNCTION IF EXISTS app.prevent_reporting_cycle();
-- DROP TRIGGER IF EXISTS update_reporting_lines_updated_at ON app.reporting_lines;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.reporting_lines;
-- DROP POLICY IF EXISTS tenant_isolation ON app.reporting_lines;
-- DROP INDEX IF EXISTS app.idx_reporting_lines_type;
-- DROP INDEX IF EXISTS app.idx_reporting_lines_primary;
-- DROP INDEX IF EXISTS app.idx_reporting_lines_manager;
-- DROP INDEX IF EXISTS app.idx_reporting_lines_effective_range;
-- DROP INDEX IF EXISTS app.idx_reporting_lines_current;
-- DROP INDEX IF EXISTS app.idx_reporting_lines_tenant_employee;
-- DROP INDEX IF EXISTS app.idx_reporting_lines_primary_unique;
-- DROP TABLE IF EXISTS app.reporting_lines;
