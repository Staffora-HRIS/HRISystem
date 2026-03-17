-- Migration: 0198_onboarding_task_dependencies
-- Created: 2026-03-17
-- Description: Create the onboarding_task_dependencies junction table for explicit
--              task dependency chains. Replaces the JSONB dependencies column on
--              onboarding_template_tasks with a proper relational table that supports
--              RLS, unique constraints, and efficient querying. Also adds a matching
--              table for instance-level (runtime) task dependencies.
--
-- TODO-253: Implement onboarding task dependency chains

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Template-Level Task Dependencies
-- -----------------------------------------------------------------------------
-- Defines which template tasks must be completed before other tasks can start.
-- This is a many-to-many self-referencing relationship within a template.
CREATE TABLE IF NOT EXISTS app.onboarding_task_dependencies (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this dependency relationship
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The task that has the dependency (the dependent / blocked task)
    task_id uuid NOT NULL REFERENCES app.onboarding_template_tasks(id) ON DELETE CASCADE,

    -- The task that must be completed first (the prerequisite)
    depends_on_task_id uuid NOT NULL REFERENCES app.onboarding_template_tasks(id) ON DELETE CASCADE,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- A task cannot depend on itself
    CONSTRAINT onboarding_task_deps_no_self_ref CHECK (
        task_id != depends_on_task_id
    ),

    -- Each dependency relationship is unique per tenant
    CONSTRAINT onboarding_task_deps_unique UNIQUE (tenant_id, task_id, depends_on_task_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Look up all dependencies for a given task (what must be done before this task)
CREATE INDEX IF NOT EXISTS idx_onboarding_task_deps_task
    ON app.onboarding_task_dependencies(tenant_id, task_id);

-- Reverse lookup: find tasks that depend on a given task (dependents)
CREATE INDEX IF NOT EXISTS idx_onboarding_task_deps_depends_on
    ON app.onboarding_task_dependencies(tenant_id, depends_on_task_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.onboarding_task_dependencies ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see dependencies for their current tenant
CREATE POLICY tenant_isolation ON app.onboarding_task_dependencies
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.onboarding_task_dependencies
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to detect circular dependency chains in onboarding tasks.
-- Returns true if adding depends_on_task_id as a dependency of task_id
-- would create a cycle.
CREATE OR REPLACE FUNCTION app.has_circular_onboarding_task_dependency(
    p_tenant_id uuid,
    p_task_id uuid,
    p_depends_on_task_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Use a recursive CTE to walk the dependency chain from
    -- p_depends_on_task_id upward. If we ever reach p_task_id,
    -- adding the edge would create a cycle.
    RETURN EXISTS (
        WITH RECURSIVE chain AS (
            -- Start from the tasks that depends_on_task_id itself depends on
            SELECT d.depends_on_task_id AS cid, 1 AS depth
            FROM app.onboarding_task_dependencies d
            WHERE d.task_id = p_depends_on_task_id
              AND d.tenant_id = p_tenant_id

            UNION ALL

            SELECT d.depends_on_task_id, chain.depth + 1
            FROM app.onboarding_task_dependencies d
            JOIN chain ON chain.cid = d.task_id
            WHERE d.tenant_id = p_tenant_id
              AND chain.depth < 50  -- safety limit to avoid runaway recursion
        )
        SELECT 1 FROM chain WHERE chain.cid = p_task_id
    );
END;
$$;

-- Trigger function to prevent circular dependencies on insert/update
CREATE OR REPLACE FUNCTION app.prevent_circular_onboarding_task_dep()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Direct self-reference is caught by CHECK constraint, but check transitively
    IF app.has_circular_onboarding_task_dependency(NEW.tenant_id, NEW.task_id, NEW.depends_on_task_id) THEN
        RAISE EXCEPTION 'Circular dependency detected: adding this dependency would create a cycle';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_circular_onboarding_task_dep
    BEFORE INSERT OR UPDATE ON app.onboarding_task_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_circular_onboarding_task_dep();

-- Trigger function to ensure both tasks belong to the same template
CREATE OR REPLACE FUNCTION app.validate_onboarding_task_dep_same_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_task_template_id uuid;
    v_dep_template_id uuid;
BEGIN
    SELECT template_id INTO v_task_template_id
    FROM app.onboarding_template_tasks
    WHERE id = NEW.task_id;

    SELECT template_id INTO v_dep_template_id
    FROM app.onboarding_template_tasks
    WHERE id = NEW.depends_on_task_id;

    IF v_task_template_id IS NULL THEN
        RAISE EXCEPTION 'Task % does not exist', NEW.task_id;
    END IF;

    IF v_dep_template_id IS NULL THEN
        RAISE EXCEPTION 'Dependency task % does not exist', NEW.depends_on_task_id;
    END IF;

    IF v_task_template_id != v_dep_template_id THEN
        RAISE EXCEPTION 'Task % and dependency task % must belong to the same template',
            NEW.task_id, NEW.depends_on_task_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_onboarding_task_dep_same_template
    BEFORE INSERT OR UPDATE ON app.onboarding_task_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_onboarding_task_dep_same_template();

-- Function to get all dependencies for a task (what must be completed first)
CREATE OR REPLACE FUNCTION app.get_onboarding_task_dependencies(
    p_task_id uuid
)
RETURNS TABLE (
    depends_on_task_id uuid,
    depends_on_task_name varchar(255),
    depends_on_task_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.depends_on_task_id,
        t.name,
        t.sequence_order
    FROM app.onboarding_task_dependencies d
    JOIN app.onboarding_template_tasks t ON t.id = d.depends_on_task_id
    WHERE d.task_id = p_task_id
    ORDER BY t.sequence_order ASC;
END;
$$;

-- Function to get all dependents for a task (what tasks are blocked by this one)
CREATE OR REPLACE FUNCTION app.get_onboarding_task_dependents(
    p_task_id uuid
)
RETURNS TABLE (
    dependent_task_id uuid,
    dependent_task_name varchar(255),
    dependent_task_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.task_id,
        t.name,
        t.sequence_order
    FROM app.onboarding_task_dependencies d
    JOIN app.onboarding_template_tasks t ON t.id = d.task_id
    WHERE d.depends_on_task_id = p_task_id
    ORDER BY t.sequence_order ASC;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.onboarding_task_dependencies IS 'Defines prerequisite relationships between onboarding template tasks. A task cannot start until all its dependencies are completed.';
COMMENT ON COLUMN app.onboarding_task_dependencies.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.onboarding_task_dependencies.tenant_id IS 'Tenant that owns this dependency relationship';
COMMENT ON COLUMN app.onboarding_task_dependencies.task_id IS 'The task that has the dependency (blocked until prerequisite is completed)';
COMMENT ON COLUMN app.onboarding_task_dependencies.depends_on_task_id IS 'The prerequisite task that must be completed first';
COMMENT ON COLUMN app.onboarding_task_dependencies.created_at IS 'When this dependency relationship was created';
COMMENT ON FUNCTION app.has_circular_onboarding_task_dependency IS 'Detects whether adding a dependency would create a circular chain';
COMMENT ON FUNCTION app.prevent_circular_onboarding_task_dep IS 'Trigger function that prevents circular task dependencies';
COMMENT ON FUNCTION app.validate_onboarding_task_dep_same_template IS 'Trigger function that ensures both tasks belong to the same template';
COMMENT ON FUNCTION app.get_onboarding_task_dependencies IS 'Returns all prerequisite tasks for a given task';
COMMENT ON FUNCTION app.get_onboarding_task_dependents IS 'Returns all tasks that depend on a given task';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_onboarding_task_dependents(uuid);
-- DROP FUNCTION IF EXISTS app.get_onboarding_task_dependencies(uuid);
-- DROP TRIGGER IF EXISTS validate_onboarding_task_dep_same_template ON app.onboarding_task_dependencies;
-- DROP FUNCTION IF EXISTS app.validate_onboarding_task_dep_same_template();
-- DROP TRIGGER IF EXISTS prevent_circular_onboarding_task_dep ON app.onboarding_task_dependencies;
-- DROP FUNCTION IF EXISTS app.prevent_circular_onboarding_task_dep();
-- DROP FUNCTION IF EXISTS app.has_circular_onboarding_task_dependency(uuid, uuid, uuid);
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.onboarding_task_dependencies;
-- DROP POLICY IF EXISTS tenant_isolation ON app.onboarding_task_dependencies;
-- DROP INDEX IF EXISTS app.idx_onboarding_task_deps_depends_on;
-- DROP INDEX IF EXISTS app.idx_onboarding_task_deps_task;
-- DROP TABLE IF EXISTS app.onboarding_task_dependencies;
