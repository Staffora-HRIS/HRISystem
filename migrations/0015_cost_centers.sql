-- Migration: 0015_cost_centers
-- Created: 2026-01-07
-- Description: Create the cost_centers table for financial allocation
--              Cost centers are used for budgeting, expense tracking, and reporting
--              Supports hierarchical structure for roll-up reporting

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cost Centers Table
-- -----------------------------------------------------------------------------
-- Represents financial cost centers for expense allocation and budgeting
-- Supports self-referential hierarchy for roll-up reporting
CREATE TABLE IF NOT EXISTS app.cost_centers (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this cost center
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Unique code within tenant (e.g., 'CC-1001', 'DEPT-ENG')
    code varchar(50) NOT NULL,

    -- Display name (e.g., 'Engineering Department', 'Marketing - APAC')
    name varchar(255) NOT NULL,

    -- Detailed description of the cost center's purpose
    description text,

    -- Parent cost center for hierarchy (NULL = top-level)
    -- Enables roll-up reporting and budget aggregation
    parent_id uuid REFERENCES app.cost_centers(id) ON DELETE RESTRICT,

    -- Whether this cost center is currently active
    -- Inactive cost centers cannot receive new expenses
    is_active boolean NOT NULL DEFAULT true,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Code must be unique within tenant
    CONSTRAINT cost_centers_code_unique UNIQUE (tenant_id, code),

    -- Code format: alphanumeric with hyphens, uppercase preferred
    CONSTRAINT cost_centers_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]*$'),

    -- Cannot be own parent
    CONSTRAINT cost_centers_no_self_parent CHECK (parent_id != id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + code
CREATE INDEX IF NOT EXISTS idx_cost_centers_tenant_code
    ON app.cost_centers(tenant_id, code);

-- Hierarchy queries: find children of a parent
CREATE INDEX IF NOT EXISTS idx_cost_centers_tenant_parent
    ON app.cost_centers(tenant_id, parent_id);

-- Active cost centers (common filter)
CREATE INDEX IF NOT EXISTS idx_cost_centers_tenant_active
    ON app.cost_centers(tenant_id, is_active)
    WHERE is_active = true;

-- Name search within tenant
CREATE INDEX IF NOT EXISTS idx_cost_centers_tenant_name
    ON app.cost_centers(tenant_id, name);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.cost_centers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see cost centers for their current tenant
CREATE POLICY tenant_isolation ON app.cost_centers
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.cost_centers
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_cost_centers_updated_at
    BEFORE UPDATE ON app.cost_centers
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to prevent circular references in cost center hierarchy
CREATE OR REPLACE FUNCTION app.prevent_cost_center_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_current_id uuid;
    v_visited uuid[] := ARRAY[]::uuid[];
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Walk up the tree to detect cycles
    v_current_id := NEW.parent_id;

    WHILE v_current_id IS NOT NULL LOOP
        -- Check if we've seen this ID before (cycle detected)
        IF v_current_id = ANY(v_visited) OR v_current_id = NEW.id THEN
            RAISE EXCEPTION 'Circular reference detected in cost center hierarchy. Cannot set parent_id to % for cost center %',
                NEW.parent_id, NEW.id;
        END IF;

        v_visited := array_append(v_visited, v_current_id);

        -- Move to parent
        SELECT parent_id INTO v_current_id
        FROM app.cost_centers
        WHERE id = v_current_id;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_cost_center_cycle
    BEFORE INSERT OR UPDATE OF parent_id ON app.cost_centers
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_cost_center_cycle();

-- Function to get all descendants of a cost center (for roll-up reports)
CREATE OR REPLACE FUNCTION app.get_cost_center_descendants(
    p_cost_center_id uuid
)
RETURNS TABLE (
    id uuid,
    parent_id uuid,
    code varchar(50),
    name varchar(255),
    level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE descendants AS (
        -- Base case: the cost center itself
        SELECT cc.id, cc.parent_id, cc.code, cc.name, 0 AS level
        FROM app.cost_centers cc
        WHERE cc.id = p_cost_center_id
          AND cc.is_active = true

        UNION ALL

        -- Recursive case: children of current level
        SELECT cc.id, cc.parent_id, cc.code, cc.name, d.level + 1
        FROM app.cost_centers cc
        INNER JOIN descendants d ON cc.parent_id = d.id
        WHERE cc.is_active = true
    )
    SELECT d.id, d.parent_id, d.code, d.name, d.level
    FROM descendants d
    ORDER BY d.level, d.name;
END;
$$;

-- Function to get the full path (ancestry) of a cost center
CREATE OR REPLACE FUNCTION app.get_cost_center_path(
    p_cost_center_id uuid
)
RETURNS TABLE (
    id uuid,
    code varchar(50),
    name varchar(255),
    level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE ancestors AS (
        -- Base case: the cost center itself
        SELECT cc.id, cc.parent_id, cc.code, cc.name, 0 AS level
        FROM app.cost_centers cc
        WHERE cc.id = p_cost_center_id

        UNION ALL

        -- Recursive case: parent of current level
        SELECT cc.id, cc.parent_id, cc.code, cc.name, a.level - 1
        FROM app.cost_centers cc
        INNER JOIN ancestors a ON cc.id = a.parent_id
    )
    SELECT a.id, a.code, a.name, a.level
    FROM ancestors a
    ORDER BY a.level;
END;
$$;

-- =============================================================================
-- Add Foreign Key to org_units
-- =============================================================================

-- Now that cost_centers exists, add the FK constraint to org_units
ALTER TABLE app.org_units
    ADD CONSTRAINT org_units_cost_center_fk
    FOREIGN KEY (cost_center_id)
    REFERENCES app.cost_centers(id)
    ON DELETE SET NULL;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.cost_centers IS 'Financial cost centers for expense allocation, budgeting, and roll-up reporting';
COMMENT ON COLUMN app.cost_centers.id IS 'Primary UUID identifier for the cost center';
COMMENT ON COLUMN app.cost_centers.tenant_id IS 'Tenant that owns this cost center';
COMMENT ON COLUMN app.cost_centers.code IS 'Unique alphanumeric code within tenant';
COMMENT ON COLUMN app.cost_centers.name IS 'Display name of the cost center';
COMMENT ON COLUMN app.cost_centers.description IS 'Detailed description of the cost center purpose';
COMMENT ON COLUMN app.cost_centers.parent_id IS 'Parent cost center for hierarchical roll-up (NULL = top-level)';
COMMENT ON COLUMN app.cost_centers.is_active IS 'Whether cost center is currently active for expense allocation';
COMMENT ON FUNCTION app.prevent_cost_center_cycle IS 'Trigger function to prevent circular references in hierarchy';
COMMENT ON FUNCTION app.get_cost_center_descendants IS 'Returns all descendant cost centers for roll-up reporting';
COMMENT ON FUNCTION app.get_cost_center_path IS 'Returns the full ancestry path of a cost center';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- ALTER TABLE app.org_units DROP CONSTRAINT IF EXISTS org_units_cost_center_fk;
-- DROP FUNCTION IF EXISTS app.get_cost_center_path(uuid);
-- DROP FUNCTION IF EXISTS app.get_cost_center_descendants(uuid);
-- DROP TRIGGER IF EXISTS prevent_cost_center_cycle ON app.cost_centers;
-- DROP FUNCTION IF EXISTS app.prevent_cost_center_cycle();
-- DROP TRIGGER IF EXISTS update_cost_centers_updated_at ON app.cost_centers;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.cost_centers;
-- DROP POLICY IF EXISTS tenant_isolation ON app.cost_centers;
-- DROP INDEX IF EXISTS app.idx_cost_centers_tenant_name;
-- DROP INDEX IF EXISTS app.idx_cost_centers_tenant_active;
-- DROP INDEX IF EXISTS app.idx_cost_centers_tenant_parent;
-- DROP INDEX IF EXISTS app.idx_cost_centers_tenant_code;
-- DROP TABLE IF EXISTS app.cost_centers;
