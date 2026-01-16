-- Migration: 0095_org_chart_functions
-- Created: 2026-01-16
-- Description: Add functions for org chart visualization

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Function to get org chart data with employee counts
CREATE OR REPLACE FUNCTION app.get_org_chart_data(
    p_tenant_id uuid,
    p_root_id uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    parent_id uuid,
    code varchar,
    name varchar,
    level integer,
    manager_id uuid,
    manager_name text,
    manager_position text,
    employee_count bigint,
    direct_reports_count bigint,
    is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE org_tree AS (
        -- Base case: start from root or all top-level units
        SELECT
            ou.id,
            ou.parent_id,
            ou.code,
            ou.name,
            ou.level,
            ou.is_active,
            1 as tree_depth
        FROM app.org_units ou
        WHERE ou.tenant_id = p_tenant_id
          AND ou.is_active = true
          AND (
              (p_root_id IS NULL AND ou.parent_id IS NULL)
              OR (p_root_id IS NOT NULL AND ou.id = p_root_id)
          )

        UNION ALL

        -- Recursive: get children
        SELECT
            ou.id,
            ou.parent_id,
            ou.code,
            ou.name,
            ou.level,
            ou.is_active,
            ot.tree_depth + 1
        FROM app.org_units ou
        INNER JOIN org_tree ot ON ou.parent_id = ot.id
        WHERE ou.tenant_id = p_tenant_id
          AND ou.is_active = true
          AND ot.tree_depth < 20
    )
    SELECT
        ot.id,
        ot.parent_id,
        ot.code,
        ot.name,
        ot.level,
        -- Get manager from manager position
        (
            SELECT pa.employee_id
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            INNER JOIN app.employees e ON pa.employee_id = e.id
            WHERE p.id = ou_full.manager_position_id
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
            LIMIT 1
        ) as manager_id,
        (
            SELECT app.get_employee_display_name(pa.employee_id)
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            INNER JOIN app.employees e ON pa.employee_id = e.id
            WHERE p.id = ou_full.manager_position_id
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
            LIMIT 1
        ) as manager_name,
        (
            SELECT p.title
            FROM app.positions p
            WHERE p.id = ou_full.manager_position_id
        ) as manager_position,
        -- Count employees in this org unit
        (
            SELECT COUNT(DISTINCT pa.employee_id)
            FROM app.position_assignments pa
            INNER JOIN app.employees e ON pa.employee_id = e.id
            WHERE pa.org_unit_id = ot.id
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
        ) as employee_count,
        -- Count direct child org units
        (
            SELECT COUNT(*)
            FROM app.org_units child
            WHERE child.parent_id = ot.id
              AND child.is_active = true
        ) as direct_reports_count,
        ot.is_active
    FROM org_tree ot
    INNER JOIN app.org_units ou_full ON ot.id = ou_full.id
    ORDER BY ot.level, ot.name;
END;
$$;

-- Function to get employee org chart (reporting lines based)
CREATE OR REPLACE FUNCTION app.get_employee_org_chart(
    p_tenant_id uuid,
    p_root_employee_id uuid DEFAULT NULL
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar,
    employee_name text,
    position_title varchar,
    org_unit_name varchar,
    manager_id uuid,
    level integer,
    direct_reports_count bigint,
    photo_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE emp_tree AS (
        -- Base case: start from root employee or all top-level employees
        SELECT
            e.id as employee_id,
            e.employee_number,
            NULL::uuid as manager_id,
            1 as level
        FROM app.employees e
        WHERE e.tenant_id = p_tenant_id
          AND e.status IN ('active', 'on_leave')
          AND (
              (p_root_employee_id IS NULL AND NOT EXISTS (
                  SELECT 1 FROM app.reporting_lines rl
                  WHERE rl.employee_id = e.id
                    AND rl.is_primary = true
                    AND rl.effective_to IS NULL
              ))
              OR (p_root_employee_id IS NOT NULL AND e.id = p_root_employee_id)
          )

        UNION ALL

        -- Recursive: get direct reports
        SELECT
            e.id as employee_id,
            e.employee_number,
            rl.manager_id,
            et.level + 1
        FROM app.employees e
        INNER JOIN app.reporting_lines rl ON rl.employee_id = e.id
        INNER JOIN emp_tree et ON rl.manager_id = et.employee_id
        WHERE e.tenant_id = p_tenant_id
          AND e.status IN ('active', 'on_leave')
          AND rl.is_primary = true
          AND rl.effective_to IS NULL
          AND et.level < 20
    )
    SELECT
        et.employee_id,
        et.employee_number,
        app.get_employee_display_name(et.employee_id) as employee_name,
        (
            SELECT p.title
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            WHERE pa.employee_id = et.employee_id
              AND pa.is_primary = true
              AND pa.effective_to IS NULL
            LIMIT 1
        ) as position_title,
        (
            SELECT ou.name
            FROM app.position_assignments pa
            INNER JOIN app.org_units ou ON pa.org_unit_id = ou.id
            WHERE pa.employee_id = et.employee_id
              AND pa.is_primary = true
              AND pa.effective_to IS NULL
            LIMIT 1
        ) as org_unit_name,
        et.manager_id,
        et.level,
        (
            SELECT COUNT(*)
            FROM app.reporting_lines rl
            INNER JOIN app.employees e ON rl.employee_id = e.id
            WHERE rl.manager_id = et.employee_id
              AND rl.is_primary = true
              AND rl.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
        ) as direct_reports_count,
        NULL::text as photo_url
    FROM emp_tree et
    ORDER BY et.level, et.employee_number;
END;
$$;

-- Function to get org chart node details
CREATE OR REPLACE FUNCTION app.get_org_chart_node_details(
    p_org_unit_id uuid
)
RETURNS TABLE (
    org_unit_id uuid,
    org_unit_name varchar,
    org_unit_code varchar,
    manager_name text,
    manager_position varchar,
    employee_count bigint,
    vacant_positions bigint,
    budget_headcount bigint,
    employees jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ou.id as org_unit_id,
        ou.name as org_unit_name,
        ou.code as org_unit_code,
        (
            SELECT app.get_employee_display_name(pa.employee_id)
            FROM app.position_assignments pa
            INNER JOIN app.positions p ON pa.position_id = p.id
            INNER JOIN app.employees e ON pa.employee_id = e.id
            WHERE p.id = ou.manager_position_id
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
            LIMIT 1
        ) as manager_name,
        (
            SELECT p.title
            FROM app.positions p
            WHERE p.id = ou.manager_position_id
        ) as manager_position,
        (
            SELECT COUNT(DISTINCT pa.employee_id)
            FROM app.position_assignments pa
            INNER JOIN app.employees e ON pa.employee_id = e.id
            WHERE pa.org_unit_id = ou.id
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
        ) as employee_count,
        (
            SELECT COALESCE(SUM(p.headcount), 0) - COUNT(DISTINCT pa.employee_id)
            FROM app.positions p
            LEFT JOIN app.position_assignments pa ON pa.position_id = p.id
              AND pa.effective_to IS NULL
            LEFT JOIN app.employees e ON pa.employee_id = e.id
              AND e.status IN ('active', 'on_leave')
            WHERE p.org_unit_id = ou.id
              AND p.is_active = true
        ) as vacant_positions,
        (
            SELECT COALESCE(SUM(p.headcount), 0)
            FROM app.positions p
            WHERE p.org_unit_id = ou.id
              AND p.is_active = true
        ) as budget_headcount,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'id', e.id,
                'employee_number', e.employee_number,
                'name', app.get_employee_display_name(e.id),
                'position', p.title,
                'hire_date', e.hire_date
            ) ORDER BY e.employee_number)
            FROM app.position_assignments pa
            INNER JOIN app.employees e ON pa.employee_id = e.id
            INNER JOIN app.positions p ON pa.position_id = p.id
            WHERE pa.org_unit_id = ou.id
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
        ) as employees
    FROM app.org_units ou
    WHERE ou.id = p_org_unit_id;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON FUNCTION app.get_org_chart_data IS 'Returns hierarchical org chart data with employee counts';
COMMENT ON FUNCTION app.get_employee_org_chart IS 'Returns employee-based org chart using reporting lines';
COMMENT ON FUNCTION app.get_org_chart_node_details IS 'Returns detailed information for a single org chart node';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_org_chart_node_details(uuid);
-- DROP FUNCTION IF EXISTS app.get_employee_org_chart(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_org_chart_data(uuid, uuid);
