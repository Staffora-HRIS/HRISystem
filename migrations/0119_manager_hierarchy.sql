-- Migration: 0119_manager_hierarchy
-- Created: 2026-01-17
-- Description: Create manager hierarchy functions for manager portal data isolation
--              Provides functions to get subordinates (direct and indirect)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Manager Subordinates Materialized View (for performance)
-- -----------------------------------------------------------------------------
-- Caches the reporting hierarchy for fast lookups
-- Refreshed when org structure changes
CREATE MATERIALIZED VIEW IF NOT EXISTS app.manager_subordinates AS
WITH RECURSIVE hierarchy AS (
    -- Base case: direct reports from position assignments
    SELECT
        pa_mgr.employee_id as manager_id,
        pa.employee_id as subordinate_id,
        pa.tenant_id,
        1 as depth,
        ARRAY[pa_mgr.employee_id] as path
    FROM app.position_assignments pa
    JOIN app.positions p ON p.id = pa.position_id
    JOIN app.position_assignments pa_mgr ON pa_mgr.position_id = p.reports_to_position_id
        AND pa_mgr.tenant_id = pa.tenant_id
        AND pa_mgr.is_primary = true
        AND (pa_mgr.effective_to IS NULL OR pa_mgr.effective_to > now())
    WHERE pa.is_primary = true
      AND (pa.effective_to IS NULL OR pa.effective_to > now())

    UNION ALL

    -- Recursive case: indirect reports
    SELECT
        h.manager_id,
        pa.employee_id as subordinate_id,
        pa.tenant_id,
        h.depth + 1 as depth,
        h.path || pa.employee_id
    FROM hierarchy h
    JOIN app.position_assignments pa_sub ON pa_sub.employee_id = h.subordinate_id
        AND pa_sub.tenant_id = h.tenant_id
        AND pa_sub.is_primary = true
        AND (pa_sub.effective_to IS NULL OR pa_sub.effective_to > now())
    JOIN app.positions p ON p.id = pa_sub.position_id
    JOIN app.position_assignments pa ON pa.position_id IN (
        SELECT id FROM app.positions WHERE reports_to_position_id = pa_sub.position_id
    )
        AND pa.tenant_id = h.tenant_id
        AND pa.is_primary = true
        AND (pa.effective_to IS NULL OR pa.effective_to > now())
    WHERE h.depth < 10  -- Limit recursion depth
      AND NOT pa.employee_id = ANY(h.path)  -- Prevent cycles
)
SELECT DISTINCT
    manager_id,
    subordinate_id,
    tenant_id,
    MIN(depth) as depth
FROM hierarchy
GROUP BY manager_id, subordinate_id, tenant_id;

-- Unique index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_manager_subordinates_pk
    ON app.manager_subordinates(tenant_id, manager_id, subordinate_id);

-- Index for manager lookups
CREATE INDEX IF NOT EXISTS idx_manager_subordinates_manager
    ON app.manager_subordinates(tenant_id, manager_id);

-- Index for subordinate lookups
CREATE INDEX IF NOT EXISTS idx_manager_subordinates_subordinate
    ON app.manager_subordinates(tenant_id, subordinate_id);

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get direct reports for a manager
CREATE OR REPLACE FUNCTION app.get_direct_reports(
    p_manager_employee_id uuid
)
RETURNS TABLE (
    employee_id uuid,
    employee_number varchar(50),
    hire_date date,
    status app.employee_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id as employee_id,
        e.employee_number,
        e.hire_date,
        e.status
    FROM app.employees e
    JOIN app.manager_subordinates ms ON ms.subordinate_id = e.id
        AND ms.tenant_id = current_setting('app.current_tenant', true)::uuid
    WHERE ms.manager_id = p_manager_employee_id
      AND ms.depth = 1
      AND e.status IN ('active', 'on_leave');
END;
$$;

-- Function to get all subordinates (direct and indirect)
CREATE OR REPLACE FUNCTION app.get_all_subordinates(
    p_manager_employee_id uuid,
    p_max_depth integer DEFAULT 10
)
RETURNS TABLE (
    employee_id uuid,
    depth integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ms.subordinate_id as employee_id,
        ms.depth
    FROM app.manager_subordinates ms
    WHERE ms.manager_id = p_manager_employee_id
      AND ms.tenant_id = current_setting('app.current_tenant', true)::uuid
      AND ms.depth <= p_max_depth;
END;
$$;

-- Function to check if employee is subordinate of manager
CREATE OR REPLACE FUNCTION app.is_subordinate_of(
    p_employee_id uuid,
    p_manager_employee_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_exists boolean;
BEGIN
    SELECT EXISTS(
        SELECT 1
        FROM app.manager_subordinates ms
        WHERE ms.manager_id = p_manager_employee_id
          AND ms.subordinate_id = p_employee_id
          AND ms.tenant_id = current_setting('app.current_tenant', true)::uuid
    ) INTO v_exists;

    RETURN v_exists;
END;
$$;

-- Function to get manager chain for an employee
CREATE OR REPLACE FUNCTION app.get_manager_chain(
    p_employee_id uuid
)
RETURNS TABLE (
    manager_id uuid,
    level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE chain AS (
        -- Get immediate manager
        SELECT
            pa_mgr.employee_id as mgr_id,
            1 as lvl
        FROM app.position_assignments pa
        JOIN app.positions p ON p.id = pa.position_id
        JOIN app.position_assignments pa_mgr ON pa_mgr.position_id = p.reports_to_position_id
            AND pa_mgr.tenant_id = pa.tenant_id
            AND pa_mgr.is_primary = true
            AND (pa_mgr.effective_to IS NULL OR pa_mgr.effective_to > now())
        WHERE pa.employee_id = p_employee_id
          AND pa.tenant_id = current_setting('app.current_tenant', true)::uuid
          AND pa.is_primary = true
          AND (pa.effective_to IS NULL OR pa.effective_to > now())

        UNION ALL

        -- Get manager's manager
        SELECT
            pa_mgr.employee_id,
            c.lvl + 1
        FROM chain c
        JOIN app.position_assignments pa ON pa.employee_id = c.mgr_id
            AND pa.tenant_id = current_setting('app.current_tenant', true)::uuid
            AND pa.is_primary = true
            AND (pa.effective_to IS NULL OR pa.effective_to > now())
        JOIN app.positions p ON p.id = pa.position_id
        JOIN app.position_assignments pa_mgr ON pa_mgr.position_id = p.reports_to_position_id
            AND pa_mgr.tenant_id = pa.tenant_id
            AND pa_mgr.is_primary = true
            AND (pa_mgr.effective_to IS NULL OR pa_mgr.effective_to > now())
        WHERE c.lvl < 10
    )
    SELECT mgr_id as manager_id, lvl as level
    FROM chain
    ORDER BY lvl;
END;
$$;

-- Function to refresh the manager subordinates cache
CREATE OR REPLACE FUNCTION app.refresh_manager_hierarchy()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY app.manager_subordinates;
END;
$$;

-- =============================================================================
-- Trigger to Refresh Hierarchy on Changes
-- =============================================================================

CREATE OR REPLACE FUNCTION app.trigger_refresh_manager_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = app, public
AS $$
BEGIN
    -- Schedule a refresh (async would be better in production)
    -- For now, we'll just mark it as needing refresh
    -- The actual refresh should be done by a background job
    PERFORM pg_notify('manager_hierarchy_changed', json_build_object(
        'tenant_id', COALESCE(NEW.tenant_id, OLD.tenant_id),
        'timestamp', now()
    )::text);

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger on position assignments changes
CREATE TRIGGER refresh_manager_hierarchy_on_assignment
    AFTER INSERT OR UPDATE OR DELETE ON app.position_assignments
    FOR EACH ROW
    EXECUTE FUNCTION app.trigger_refresh_manager_hierarchy();

-- Trigger on position changes (reports_to changes)
CREATE TRIGGER refresh_manager_hierarchy_on_position
    AFTER UPDATE OF reports_to_position_id ON app.positions
    FOR EACH ROW
    EXECUTE FUNCTION app.trigger_refresh_manager_hierarchy();

-- =============================================================================
-- Manager Portal RLS Helper
-- =============================================================================

-- Function to check if current session is in manager portal context
-- and should restrict to subordinates only
CREATE OR REPLACE FUNCTION app.is_manager_portal_context()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = app, public
AS $$
BEGIN
    RETURN current_setting('app.portal_type', true) = 'manager';
END;
$$;

-- Function to get current user's employee_id
CREATE OR REPLACE FUNCTION app.get_current_employee_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = app, public
AS $$
DECLARE
    v_user_id uuid;
    v_employee_id uuid;
BEGIN
    v_user_id := current_setting('app.current_user', true)::uuid;

    SELECT id INTO v_employee_id
    FROM app.employees
    WHERE user_id = v_user_id
      AND tenant_id = current_setting('app.current_tenant', true)::uuid
      AND status IN ('active', 'on_leave');

    RETURN v_employee_id;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON MATERIALIZED VIEW app.manager_subordinates IS 'Cached view of all manager-subordinate relationships';
COMMENT ON FUNCTION app.get_direct_reports IS 'Returns employees who directly report to the given manager';
COMMENT ON FUNCTION app.get_all_subordinates IS 'Returns all subordinates (direct and indirect) for a manager';
COMMENT ON FUNCTION app.is_subordinate_of IS 'Checks if an employee is a subordinate of a manager';
COMMENT ON FUNCTION app.get_manager_chain IS 'Returns the chain of managers above an employee';
COMMENT ON FUNCTION app.refresh_manager_hierarchy IS 'Refreshes the manager subordinates cache';
COMMENT ON FUNCTION app.is_manager_portal_context IS 'Checks if current session is in manager portal mode';
COMMENT ON FUNCTION app.get_current_employee_id IS 'Returns the employee ID for the current user';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS refresh_manager_hierarchy_on_position ON app.positions;
-- DROP TRIGGER IF EXISTS refresh_manager_hierarchy_on_assignment ON app.position_assignments;
-- DROP FUNCTION IF EXISTS app.trigger_refresh_manager_hierarchy();
-- DROP FUNCTION IF EXISTS app.get_current_employee_id();
-- DROP FUNCTION IF EXISTS app.is_manager_portal_context();
-- DROP FUNCTION IF EXISTS app.refresh_manager_hierarchy();
-- DROP FUNCTION IF EXISTS app.get_manager_chain(uuid);
-- DROP FUNCTION IF EXISTS app.is_subordinate_of(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_all_subordinates(uuid, integer);
-- DROP FUNCTION IF EXISTS app.get_direct_reports(uuid);
-- DROP INDEX IF EXISTS app.idx_manager_subordinates_subordinate;
-- DROP INDEX IF EXISTS app.idx_manager_subordinates_manager;
-- DROP INDEX IF EXISTS app.idx_manager_subordinates_pk;
-- DROP MATERIALIZED VIEW IF EXISTS app.manager_subordinates;
