-- Migration: 0077_case_categories
-- Created: 2026-01-07
-- Description: Create the case_categories table - hierarchical case categorization
--              This table defines categories and subcategories for cases
--              Supports nested hierarchy and SLA configuration per category

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Case Categories Table
-- -----------------------------------------------------------------------------
-- Hierarchical categorization for cases
-- Categories determine routing, SLA, and required fields
CREATE TABLE IF NOT EXISTS app.case_categories (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this category
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Parent category (NULL for top-level categories)
    parent_id uuid REFERENCES app.case_categories(id) ON DELETE CASCADE,

    -- Category identification
    code varchar(50) NOT NULL,
    name varchar(255) NOT NULL,
    description text,

    -- Hierarchy path (for efficient tree queries)
    -- Format: /parent_id/child_id/grandchild_id/
    path ltree,

    -- Hierarchy level (0 = root, 1 = child, etc.)
    level integer NOT NULL DEFAULT 0,

    -- Default case settings for this category
    default_priority app.case_priority NOT NULL DEFAULT 'medium',
    default_case_type app.case_type NOT NULL DEFAULT 'inquiry',

    -- SLA configuration (in hours)
    sla_response_hours integer,        -- Time to first response
    sla_resolution_hours integer,      -- Time to resolution
    sla_warning_threshold_percent integer DEFAULT 75,

    -- Assignment configuration
    -- Structure: {
    --   "assignment_type": "round_robin" | "load_balanced" | "manual",
    --   "assignee_pool": ["user_id1", "user_id2"],
    --   "assignee_role_id": "uuid",
    --   "fallback_assignee_id": "uuid"
    -- }
    assignment_config jsonb NOT NULL DEFAULT '{}',

    -- Required fields for cases in this category
    -- Structure: ["field1", "field2"]
    required_fields jsonb NOT NULL DEFAULT '[]',

    -- Custom form schema for additional data collection
    -- Structure: JSON Schema
    custom_form_schema jsonb,

    -- Display settings
    display_order integer NOT NULL DEFAULT 0,
    icon varchar(50),
    color varchar(20),

    -- Active status
    is_active boolean NOT NULL DEFAULT true,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Code must be unique within tenant
    CONSTRAINT case_categories_code_unique UNIQUE (tenant_id, code),

    -- SLA hours must be positive
    CONSTRAINT case_categories_sla_positive CHECK (
        (sla_response_hours IS NULL OR sla_response_hours > 0) AND
        (sla_resolution_hours IS NULL OR sla_resolution_hours > 0)
    ),

    -- Warning threshold must be 0-100
    CONSTRAINT case_categories_warning_threshold_valid CHECK (
        sla_warning_threshold_percent >= 0 AND sla_warning_threshold_percent <= 100
    ),

    -- Prevent circular references (parent cannot be self)
    CONSTRAINT case_categories_no_self_parent CHECK (
        parent_id IS NULL OR parent_id != id
    )
);

-- Enable ltree extension if not already enabled
CREATE EXTENSION IF NOT EXISTS ltree;

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + code
CREATE INDEX IF NOT EXISTS idx_case_categories_tenant_code
    ON app.case_categories(tenant_id, code);

-- Parent lookup (for tree navigation)
CREATE INDEX IF NOT EXISTS idx_case_categories_tenant_parent
    ON app.case_categories(tenant_id, parent_id);

-- Root categories
CREATE INDEX IF NOT EXISTS idx_case_categories_tenant_root
    ON app.case_categories(tenant_id, display_order)
    WHERE parent_id IS NULL AND is_active = true;

-- Active categories
CREATE INDEX IF NOT EXISTS idx_case_categories_tenant_active
    ON app.case_categories(tenant_id, is_active)
    WHERE is_active = true;

-- Path queries (using ltree)
CREATE INDEX IF NOT EXISTS idx_case_categories_path
    ON app.case_categories USING gist(path);

-- Level filtering
CREATE INDEX IF NOT EXISTS idx_case_categories_tenant_level
    ON app.case_categories(tenant_id, level);

-- GIN index for assignment config queries
CREATE INDEX IF NOT EXISTS idx_case_categories_assignment_config
    ON app.case_categories USING gin(assignment_config);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.case_categories ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see categories for their current tenant
CREATE POLICY tenant_isolation ON app.case_categories
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.case_categories
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_case_categories_updated_at
    BEFORE UPDATE ON app.case_categories
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Function to maintain hierarchy path
CREATE OR REPLACE FUNCTION app.maintain_case_category_path()
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
        -- Root category
        NEW.path := text2ltree(replace(NEW.id::text, '-', '_'));
        NEW.level := 0;
    ELSE
        -- Get parent's path and level
        SELECT path, level INTO v_parent_path, v_parent_level
        FROM app.case_categories
        WHERE id = NEW.parent_id;

        IF v_parent_path IS NULL THEN
            RAISE EXCEPTION 'Parent category not found: %', NEW.parent_id;
        END IF;

        NEW.path := v_parent_path || text2ltree(replace(NEW.id::text, '-', '_'));
        NEW.level := v_parent_level + 1;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER maintain_case_category_path
    BEFORE INSERT OR UPDATE OF parent_id ON app.case_categories
    FOR EACH ROW
    EXECUTE FUNCTION app.maintain_case_category_path();

-- Function to prevent deep nesting
CREATE OR REPLACE FUNCTION app.validate_case_category_depth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- Limit category depth to 4 levels (0-3)
    IF NEW.level > 3 THEN
        RAISE EXCEPTION 'Category hierarchy cannot exceed 4 levels';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_case_category_depth
    BEFORE INSERT OR UPDATE ON app.case_categories
    FOR EACH ROW
    EXECUTE FUNCTION app.validate_case_category_depth();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get category tree
CREATE OR REPLACE FUNCTION app.get_case_category_tree(
    p_tenant_id uuid,
    p_root_id uuid DEFAULT NULL,
    p_active_only boolean DEFAULT true
)
RETURNS TABLE (
    id uuid,
    parent_id uuid,
    code varchar(50),
    name varchar(255),
    description text,
    level integer,
    default_priority app.case_priority,
    default_case_type app.case_type,
    sla_response_hours integer,
    sla_resolution_hours integer,
    is_active boolean,
    children_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE category_tree AS (
        -- Base case: root categories or specified root
        SELECT
            c.id,
            c.parent_id,
            c.code,
            c.name,
            c.description,
            c.level,
            c.default_priority,
            c.default_case_type,
            c.sla_response_hours,
            c.sla_resolution_hours,
            c.is_active,
            c.display_order
        FROM app.case_categories c
        WHERE c.tenant_id = p_tenant_id
          AND (
              (p_root_id IS NULL AND c.parent_id IS NULL) OR
              (p_root_id IS NOT NULL AND c.id = p_root_id)
          )
          AND (NOT p_active_only OR c.is_active = true)

        UNION ALL

        -- Recursive case: children
        SELECT
            c.id,
            c.parent_id,
            c.code,
            c.name,
            c.description,
            c.level,
            c.default_priority,
            c.default_case_type,
            c.sla_response_hours,
            c.sla_resolution_hours,
            c.is_active,
            c.display_order
        FROM app.case_categories c
        JOIN category_tree ct ON ct.id = c.parent_id
        WHERE c.tenant_id = p_tenant_id
          AND (NOT p_active_only OR c.is_active = true)
    )
    SELECT
        ct.id,
        ct.parent_id,
        ct.code,
        ct.name,
        ct.description,
        ct.level,
        ct.default_priority,
        ct.default_case_type,
        ct.sla_response_hours,
        ct.sla_resolution_hours,
        ct.is_active,
        (SELECT COUNT(*) FROM app.case_categories c2 WHERE c2.parent_id = ct.id) AS children_count
    FROM category_tree ct
    ORDER BY ct.level, ct.display_order, ct.name;
END;
$$;

-- Function to get ancestors of a category
CREATE OR REPLACE FUNCTION app.get_case_category_ancestors(
    p_category_id uuid
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
DECLARE
    v_path ltree;
BEGIN
    -- Get the category's path
    SELECT path INTO v_path
    FROM app.case_categories
    WHERE id = p_category_id;

    IF v_path IS NULL THEN
        RETURN;
    END IF;

    -- Return all ancestors
    RETURN QUERY
    SELECT
        c.id,
        c.code,
        c.name,
        c.level
    FROM app.case_categories c
    WHERE c.path @> v_path AND c.id != p_category_id
    ORDER BY c.level;
END;
$$;

-- Function to get effective SLA for a category (inherits from parent if not set)
CREATE OR REPLACE FUNCTION app.get_effective_category_sla(
    p_category_id uuid
)
RETURNS TABLE (
    response_hours integer,
    resolution_hours integer,
    warning_threshold_percent integer,
    inherited_from_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_path ltree;
    v_response integer;
    v_resolution integer;
    v_warning integer;
    v_inherited_from uuid;
BEGIN
    -- Get the category's path
    SELECT path INTO v_path
    FROM app.case_categories
    WHERE id = p_category_id;

    -- Find the first ancestor (including self) with SLA defined
    SELECT
        c.sla_response_hours,
        c.sla_resolution_hours,
        c.sla_warning_threshold_percent,
        c.id
    INTO v_response, v_resolution, v_warning, v_inherited_from
    FROM app.case_categories c
    WHERE c.path @> v_path
      AND (c.sla_response_hours IS NOT NULL OR c.sla_resolution_hours IS NOT NULL)
    ORDER BY c.level DESC
    LIMIT 1;

    RETURN QUERY SELECT v_response, v_resolution, v_warning, v_inherited_from;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.case_categories IS 'Hierarchical categorization for HR cases with SLA configuration.';
COMMENT ON COLUMN app.case_categories.id IS 'Primary UUID identifier';
COMMENT ON COLUMN app.case_categories.tenant_id IS 'Tenant that owns this category';
COMMENT ON COLUMN app.case_categories.parent_id IS 'Parent category (NULL for root)';
COMMENT ON COLUMN app.case_categories.code IS 'Unique category code within tenant';
COMMENT ON COLUMN app.case_categories.name IS 'Human-readable category name';
COMMENT ON COLUMN app.case_categories.description IS 'Category description';
COMMENT ON COLUMN app.case_categories.path IS 'ltree path for efficient hierarchy queries';
COMMENT ON COLUMN app.case_categories.level IS 'Hierarchy level (0 = root)';
COMMENT ON COLUMN app.case_categories.default_priority IS 'Default priority for cases in this category';
COMMENT ON COLUMN app.case_categories.default_case_type IS 'Default type for cases in this category';
COMMENT ON COLUMN app.case_categories.sla_response_hours IS 'SLA target for first response (hours)';
COMMENT ON COLUMN app.case_categories.sla_resolution_hours IS 'SLA target for resolution (hours)';
COMMENT ON COLUMN app.case_categories.sla_warning_threshold_percent IS 'Percent of SLA at which to warn';
COMMENT ON COLUMN app.case_categories.assignment_config IS 'Auto-assignment configuration';
COMMENT ON COLUMN app.case_categories.required_fields IS 'Required fields for cases in this category';
COMMENT ON COLUMN app.case_categories.custom_form_schema IS 'JSON Schema for custom data collection';
COMMENT ON COLUMN app.case_categories.display_order IS 'Sort order for display';
COMMENT ON COLUMN app.case_categories.icon IS 'Icon identifier for UI';
COMMENT ON COLUMN app.case_categories.color IS 'Color for UI display';
COMMENT ON COLUMN app.case_categories.is_active IS 'Whether category is active';
COMMENT ON FUNCTION app.maintain_case_category_path IS 'Maintains ltree path for hierarchy';
COMMENT ON FUNCTION app.validate_case_category_depth IS 'Validates max category depth';
COMMENT ON FUNCTION app.get_case_category_tree IS 'Returns category hierarchy tree';
COMMENT ON FUNCTION app.get_case_category_ancestors IS 'Returns ancestors of a category';
COMMENT ON FUNCTION app.get_effective_category_sla IS 'Returns effective SLA with inheritance';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_effective_category_sla(uuid);
-- DROP FUNCTION IF EXISTS app.get_case_category_ancestors(uuid);
-- DROP FUNCTION IF EXISTS app.get_case_category_tree(uuid, uuid, boolean);
-- DROP TRIGGER IF EXISTS validate_case_category_depth ON app.case_categories;
-- DROP FUNCTION IF EXISTS app.validate_case_category_depth();
-- DROP TRIGGER IF EXISTS maintain_case_category_path ON app.case_categories;
-- DROP FUNCTION IF EXISTS app.maintain_case_category_path();
-- DROP TRIGGER IF EXISTS update_case_categories_updated_at ON app.case_categories;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.case_categories;
-- DROP POLICY IF EXISTS tenant_isolation ON app.case_categories;
-- DROP INDEX IF EXISTS app.idx_case_categories_assignment_config;
-- DROP INDEX IF EXISTS app.idx_case_categories_tenant_level;
-- DROP INDEX IF EXISTS app.idx_case_categories_path;
-- DROP INDEX IF EXISTS app.idx_case_categories_tenant_active;
-- DROP INDEX IF EXISTS app.idx_case_categories_tenant_root;
-- DROP INDEX IF EXISTS app.idx_case_categories_tenant_parent;
-- DROP INDEX IF EXISTS app.idx_case_categories_tenant_code;
-- DROP TABLE IF EXISTS app.case_categories;
