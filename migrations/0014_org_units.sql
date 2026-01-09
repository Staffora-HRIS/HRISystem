-- Migration: 0014_org_units
-- Created: 2026-01-07
-- Description: Create the org_units table for organizational structure
--              Supports hierarchical org charts with ltree for efficient hierarchy queries
--              Effective-dated for tracking organizational changes over time

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enable ltree Extension
-- -----------------------------------------------------------------------------
-- ltree provides efficient support for hierarchical/tree-like data
-- Enables fast ancestor/descendant queries with operators like @>, <@, ~, ?
CREATE EXTENSION IF NOT EXISTS ltree;

COMMENT ON EXTENSION ltree IS 'Hierarchical tree-like data types and operators for org chart queries';

-- -----------------------------------------------------------------------------
-- Org Units Table
-- -----------------------------------------------------------------------------
-- Represents organizational units (departments, divisions, teams, etc.)
-- Supports self-referential hierarchy via parent_id
-- Uses ltree for efficient hierarchy queries (ancestors, descendants, path matching)
CREATE TABLE IF NOT EXISTS app.org_units (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this org unit
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent org unit for hierarchy (NULL = root/top-level)
    parent_id uuid REFERENCES app.org_units(id) ON DELETE RESTRICT,

    -- Unique code within tenant (e.g., 'CORP', 'ENG', 'HR-RECRUITING')
    code varchar(50) NOT NULL,

    -- Display name (e.g., 'Engineering', 'Human Resources')
    name varchar(255) NOT NULL,

    -- Detailed description of the org unit's purpose
    description text,

    -- Hierarchy level (0 = root, 1 = child of root, etc.)
    -- Computed on insert/update based on parent
    level integer NOT NULL DEFAULT 0,

    -- Materialized path for efficient hierarchy queries
    -- Format: 'root_code.child_code.grandchild_code'
    -- Example: 'CORP.ENG.ENG_BACKEND'
    path ltree,

    -- Manager position for this org unit (FK added after positions table exists)
    manager_position_id uuid,

    -- Cost center for financial allocation (FK added after cost_centers table exists)
    cost_center_id uuid,

    -- Whether this org unit is currently active
    is_active boolean NOT NULL DEFAULT true,

    -- Effective dating for historical tracking
    -- effective_from: When this version of the org unit becomes effective
    -- effective_to: When this version ends (NULL = currently effective)
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_to timestamptz,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Code must be unique within tenant for active org units
    CONSTRAINT org_units_code_unique UNIQUE (tenant_id, code),

    -- Code format: alphanumeric with hyphens/underscores, uppercase preferred
    CONSTRAINT org_units_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]*$'),

    -- Level must be non-negative
    CONSTRAINT org_units_level_check CHECK (level >= 0),

    -- Effective dates validation
    CONSTRAINT org_units_effective_dates CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),

    -- Cannot be own parent
    CONSTRAINT org_units_no_self_parent CHECK (parent_id != id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + code
CREATE INDEX IF NOT EXISTS idx_org_units_tenant_code
    ON app.org_units(tenant_id, code);

-- Hierarchy queries: find children of a parent
CREATE INDEX IF NOT EXISTS idx_org_units_tenant_parent
    ON app.org_units(tenant_id, parent_id);

-- ltree path queries: ancestors, descendants, path matching
-- GiST index is optimal for ltree
CREATE INDEX IF NOT EXISTS idx_org_units_path
    ON app.org_units USING gist(path);

-- Also create a btree index on path for exact matching and ordering
CREATE INDEX IF NOT EXISTS idx_org_units_tenant_path
    ON app.org_units(tenant_id, path);

-- Active org units (common filter)
CREATE INDEX IF NOT EXISTS idx_org_units_tenant_active
    ON app.org_units(tenant_id, is_active)
    WHERE is_active = true;

-- Effective date range queries
CREATE INDEX IF NOT EXISTS idx_org_units_effective
    ON app.org_units(tenant_id, effective_from, effective_to);

-- Level-based queries (e.g., find all departments at level 1)
CREATE INDEX IF NOT EXISTS idx_org_units_tenant_level
    ON app.org_units(tenant_id, level);

-- Manager position lookups
CREATE INDEX IF NOT EXISTS idx_org_units_manager_position
    ON app.org_units(manager_position_id)
    WHERE manager_position_id IS NOT NULL;

-- Cost center lookups
CREATE INDEX IF NOT EXISTS idx_org_units_cost_center
    ON app.org_units(cost_center_id)
    WHERE cost_center_id IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.org_units ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see org units for their current tenant
CREATE POLICY tenant_isolation ON app.org_units
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.org_units
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_org_units_updated_at
    BEFORE UPDATE ON app.org_units
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to calculate and update the ltree path for an org unit
-- Called on insert/update to maintain the materialized path
CREATE OR REPLACE FUNCTION app.calculate_org_unit_path()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_parent_path ltree;
    v_parent_level integer;
BEGIN
    IF NEW.parent_id IS NULL THEN
        -- Root level org unit
        NEW.path := text2ltree(NEW.code);
        NEW.level := 0;
    ELSE
        -- Get parent's path and level
        SELECT path, level INTO v_parent_path, v_parent_level
        FROM app.org_units
        WHERE id = NEW.parent_id;

        IF v_parent_path IS NULL THEN
            RAISE EXCEPTION 'Parent org unit not found or has no path: %', NEW.parent_id;
        END IF;

        -- Build path: parent_path.this_code
        NEW.path := v_parent_path || text2ltree(NEW.code);
        NEW.level := v_parent_level + 1;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER calculate_org_unit_path
    BEFORE INSERT OR UPDATE OF parent_id, code ON app.org_units
    FOR EACH ROW
    EXECUTE FUNCTION app.calculate_org_unit_path();

-- Function to prevent circular references in hierarchy
CREATE OR REPLACE FUNCTION app.prevent_org_unit_cycle()
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
            RAISE EXCEPTION 'Circular reference detected in org unit hierarchy. Cannot set parent_id to % for org unit %',
                NEW.parent_id, NEW.id;
        END IF;

        v_visited := array_append(v_visited, v_current_id);

        -- Move to parent
        SELECT parent_id INTO v_current_id
        FROM app.org_units
        WHERE id = v_current_id;
    END LOOP;

    RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_org_unit_cycle
    BEFORE INSERT OR UPDATE OF parent_id ON app.org_units
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_org_unit_cycle();

-- Function to get all descendants of an org unit
CREATE OR REPLACE FUNCTION app.get_org_unit_descendants(
    p_org_unit_id uuid
)
RETURNS TABLE (
    id uuid,
    parent_id uuid,
    code varchar(50),
    name varchar(255),
    level integer,
    path ltree
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_path ltree;
BEGIN
    -- Get the path of the specified org unit
    SELECT ou.path INTO v_path
    FROM app.org_units ou
    WHERE ou.id = p_org_unit_id;

    IF v_path IS NULL THEN
        RETURN;
    END IF;

    -- Return all org units whose path starts with the given path
    -- (descendants include the org unit itself with @)
    RETURN QUERY
    SELECT ou.id, ou.parent_id, ou.code, ou.name, ou.level, ou.path
    FROM app.org_units ou
    WHERE ou.path <@ v_path
      AND ou.is_active = true
    ORDER BY ou.level, ou.name;
END;
$$;

-- Function to get all ancestors of an org unit (path to root)
CREATE OR REPLACE FUNCTION app.get_org_unit_ancestors(
    p_org_unit_id uuid
)
RETURNS TABLE (
    id uuid,
    parent_id uuid,
    code varchar(50),
    name varchar(255),
    level integer,
    path ltree
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_path ltree;
BEGIN
    -- Get the path of the specified org unit
    SELECT ou.path INTO v_path
    FROM app.org_units ou
    WHERE ou.id = p_org_unit_id;

    IF v_path IS NULL THEN
        RETURN;
    END IF;

    -- Return all org units that are ancestors (whose path is prefix of given path)
    RETURN QUERY
    SELECT ou.id, ou.parent_id, ou.code, ou.name, ou.level, ou.path
    FROM app.org_units ou
    WHERE ou.path @> v_path
      AND ou.is_active = true
    ORDER BY ou.level;
END;
$$;

-- Function to get direct children of an org unit
CREATE OR REPLACE FUNCTION app.get_org_unit_children(
    p_org_unit_id uuid
)
RETURNS TABLE (
    id uuid,
    code varchar(50),
    name varchar(255),
    level integer,
    is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT ou.id, ou.code, ou.name, ou.level, ou.is_active
    FROM app.org_units ou
    WHERE ou.parent_id = p_org_unit_id
    ORDER BY ou.name;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.org_units IS 'Organizational units (departments, divisions, teams) with hierarchical structure using ltree';
COMMENT ON COLUMN app.org_units.id IS 'Primary UUID identifier for the org unit';
COMMENT ON COLUMN app.org_units.tenant_id IS 'Tenant that owns this org unit';
COMMENT ON COLUMN app.org_units.parent_id IS 'Parent org unit ID for hierarchy (NULL = root level)';
COMMENT ON COLUMN app.org_units.code IS 'Unique alphanumeric code within tenant (uppercase)';
COMMENT ON COLUMN app.org_units.name IS 'Display name of the org unit';
COMMENT ON COLUMN app.org_units.description IS 'Detailed description of the org unit purpose';
COMMENT ON COLUMN app.org_units.level IS 'Hierarchy depth level (0 = root)';
COMMENT ON COLUMN app.org_units.path IS 'Materialized ltree path for efficient hierarchy queries';
COMMENT ON COLUMN app.org_units.manager_position_id IS 'Position that manages this org unit';
COMMENT ON COLUMN app.org_units.cost_center_id IS 'Default cost center for financial allocation';
COMMENT ON COLUMN app.org_units.is_active IS 'Whether org unit is currently active';
COMMENT ON COLUMN app.org_units.effective_from IS 'When this version becomes effective';
COMMENT ON COLUMN app.org_units.effective_to IS 'When this version ends (NULL = current)';
COMMENT ON FUNCTION app.calculate_org_unit_path IS 'Trigger function to maintain ltree path on insert/update';
COMMENT ON FUNCTION app.prevent_org_unit_cycle IS 'Trigger function to prevent circular references in hierarchy';
COMMENT ON FUNCTION app.get_org_unit_descendants IS 'Returns all descendant org units using ltree';
COMMENT ON FUNCTION app.get_org_unit_ancestors IS 'Returns all ancestor org units (path to root)';
COMMENT ON FUNCTION app.get_org_unit_children IS 'Returns direct children of an org unit';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_org_unit_children(uuid);
-- DROP FUNCTION IF EXISTS app.get_org_unit_ancestors(uuid);
-- DROP FUNCTION IF EXISTS app.get_org_unit_descendants(uuid);
-- DROP TRIGGER IF EXISTS prevent_org_unit_cycle ON app.org_units;
-- DROP FUNCTION IF EXISTS app.prevent_org_unit_cycle();
-- DROP TRIGGER IF EXISTS calculate_org_unit_path ON app.org_units;
-- DROP FUNCTION IF EXISTS app.calculate_org_unit_path();
-- DROP TRIGGER IF EXISTS update_org_units_updated_at ON app.org_units;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.org_units;
-- DROP POLICY IF EXISTS tenant_isolation ON app.org_units;
-- DROP INDEX IF EXISTS app.idx_org_units_cost_center;
-- DROP INDEX IF EXISTS app.idx_org_units_manager_position;
-- DROP INDEX IF EXISTS app.idx_org_units_tenant_level;
-- DROP INDEX IF EXISTS app.idx_org_units_effective;
-- DROP INDEX IF EXISTS app.idx_org_units_tenant_active;
-- DROP INDEX IF EXISTS app.idx_org_units_tenant_path;
-- DROP INDEX IF EXISTS app.idx_org_units_path;
-- DROP INDEX IF EXISTS app.idx_org_units_tenant_parent;
-- DROP INDEX IF EXISTS app.idx_org_units_tenant_code;
-- DROP TABLE IF EXISTS app.org_units;
-- DROP EXTENSION IF EXISTS ltree;
