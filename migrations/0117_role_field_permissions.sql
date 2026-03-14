-- Migration: 0117_role_field_permissions
-- Created: 2026-01-17
-- Description: Create role field permissions table for Field-Level Security
--              Maps permission levels (edit/view/hidden) for each field per role

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Role Field Permissions Table
-- -----------------------------------------------------------------------------
-- Stores the permission level for each field per role
-- Permission levels: 'edit' (can modify), 'view' (read-only), 'hidden' (not visible)
CREATE TABLE IF NOT EXISTS app.role_field_permissions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant scope (NULL for global/default permissions)
    tenant_id uuid REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Foreign keys
    role_id uuid NOT NULL REFERENCES app.roles(id) ON DELETE CASCADE,
    field_id uuid NOT NULL REFERENCES app.field_registry(id) ON DELETE CASCADE,

    -- Permission level
    permission varchar(20) NOT NULL CHECK (permission IN ('edit', 'view', 'hidden')),

    -- Audit fields
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.users(id),
    updated_by uuid REFERENCES app.users(id),

    -- Unique constraint: one permission per role per field per tenant
    CONSTRAINT role_field_permissions_unique UNIQUE (tenant_id, role_id, field_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Fast lookup by role (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_role_field_permissions_role
    ON app.role_field_permissions(tenant_id, role_id);

-- Lookup by field
CREATE INDEX IF NOT EXISTS idx_role_field_permissions_field
    ON app.role_field_permissions(tenant_id, field_id);

-- Filter by permission type
CREATE INDEX IF NOT EXISTS idx_role_field_permissions_type
    ON app.role_field_permissions(tenant_id, role_id, permission);

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.role_field_permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see permissions for their tenant or global defaults
CREATE POLICY role_field_permissions_tenant_isolation ON app.role_field_permissions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR tenant_id IS NULL
        OR app.is_system_context()
    );

-- Policy for INSERT
CREATE POLICY role_field_permissions_insert ON app.role_field_permissions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR tenant_id IS NULL
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_role_field_permissions_updated_at
    BEFORE UPDATE ON app.role_field_permissions
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get all field permissions for a role
CREATE OR REPLACE FUNCTION app.get_role_field_permissions(
    p_role_id uuid
)
RETURNS TABLE (
    entity_name varchar(100),
    field_name varchar(100),
    field_label varchar(255),
    field_group varchar(100),
    permission varchar(20),
    is_sensitive boolean,
    data_type varchar(50)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        fr.entity_name,
        fr.field_name,
        fr.field_label,
        fr.field_group,
        COALESCE(rfp.permission, fr.default_permission) as permission,
        fr.is_sensitive,
        fr.data_type
    FROM app.field_registry fr
    LEFT JOIN app.role_field_permissions rfp
        ON rfp.field_id = fr.id
        AND rfp.role_id = p_role_id
    WHERE fr.tenant_id = current_setting('app.current_tenant', true)::uuid
       OR fr.tenant_id IS NULL
    ORDER BY fr.entity_name, fr.display_order, fr.field_name;
END;
$$;

-- Function to get effective field permissions for a user (considering all roles)
CREATE OR REPLACE FUNCTION app.get_user_field_permissions(
    p_user_id uuid
)
RETURNS TABLE (
    entity_name varchar(100),
    field_name varchar(100),
    effective_permission varchar(20)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    -- For each field, get the highest permission across all user's roles
    -- Permission hierarchy: edit > view > hidden
    RETURN QUERY
    WITH user_roles AS (
        SELECT ra.role_id
        FROM app.role_assignments ra
        WHERE ra.user_id = p_user_id
          AND ra.tenant_id = current_setting('app.current_tenant', true)::uuid
    ),
    field_perms AS (
        SELECT
            fr.entity_name,
            fr.field_name,
            COALESCE(rfp.permission, fr.default_permission) as permission,
            -- Convert to numeric for comparison (higher is more permissive)
            CASE COALESCE(rfp.permission, fr.default_permission)
                WHEN 'edit' THEN 3
                WHEN 'view' THEN 2
                WHEN 'hidden' THEN 1
                ELSE 1
            END as perm_level
        FROM app.field_registry fr
        CROSS JOIN user_roles ur
        LEFT JOIN app.role_field_permissions rfp
            ON rfp.field_id = fr.id
            AND rfp.role_id = ur.role_id
        WHERE fr.tenant_id = current_setting('app.current_tenant', true)::uuid
           OR fr.tenant_id IS NULL
    )
    SELECT
        fp.entity_name,
        fp.field_name,
        -- Get the most permissive level across all roles
        CASE MAX(fp.perm_level)
            WHEN 3 THEN 'edit'::varchar(20)
            WHEN 2 THEN 'view'::varchar(20)
            ELSE 'hidden'::varchar(20)
        END as effective_permission
    FROM field_perms fp
    GROUP BY fp.entity_name, fp.field_name;
END;
$$;

-- Function to check if user can edit a specific field
CREATE OR REPLACE FUNCTION app.can_user_edit_field(
    p_user_id uuid,
    p_entity_name varchar(100),
    p_field_name varchar(100)
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_permission varchar(20);
BEGIN
    SELECT effective_permission INTO v_permission
    FROM app.get_user_field_permissions(p_user_id)
    WHERE entity_name = p_entity_name
      AND field_name = p_field_name;

    RETURN COALESCE(v_permission, 'hidden') = 'edit';
END;
$$;

-- Function to bulk set field permissions for a role
CREATE OR REPLACE FUNCTION app.set_role_field_permissions(
    p_role_id uuid,
    p_permissions jsonb,  -- Array of {field_id, permission}
    p_updated_by uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id uuid;
    v_count integer := 0;
    v_perm jsonb;
BEGIN
    -- Get tenant context
    v_tenant_id := current_setting('app.current_tenant', true)::uuid;

    -- Process each permission
    FOR v_perm IN SELECT * FROM jsonb_array_elements(p_permissions)
    LOOP
        INSERT INTO app.role_field_permissions (
            tenant_id, role_id, field_id, permission, created_by, updated_by
        )
        VALUES (
            v_tenant_id,
            p_role_id,
            (v_perm->>'field_id')::uuid,
            v_perm->>'permission',
            p_updated_by,
            p_updated_by
        )
        ON CONFLICT (tenant_id, role_id, field_id)
        DO UPDATE SET
            permission = EXCLUDED.permission,
            updated_by = EXCLUDED.updated_by,
            updated_at = now();

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.role_field_permissions IS 'Maps permission levels for each field per role';
COMMENT ON COLUMN app.role_field_permissions.permission IS 'Permission level: edit (modify), view (read-only), hidden (invisible)';
COMMENT ON FUNCTION app.get_role_field_permissions IS 'Returns all field permissions for a specific role';
COMMENT ON FUNCTION app.get_user_field_permissions IS 'Returns effective field permissions for a user (most permissive across all roles)';
COMMENT ON FUNCTION app.can_user_edit_field IS 'Checks if a user can edit a specific field';
COMMENT ON FUNCTION app.set_role_field_permissions IS 'Bulk sets field permissions for a role';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.set_role_field_permissions(uuid, jsonb, uuid);
-- DROP FUNCTION IF EXISTS app.can_user_edit_field(uuid, varchar, varchar);
-- DROP FUNCTION IF EXISTS app.get_user_field_permissions(uuid);
-- DROP FUNCTION IF EXISTS app.get_role_field_permissions(uuid);
-- DROP TRIGGER IF EXISTS update_role_field_permissions_updated_at ON app.role_field_permissions;
-- DROP POLICY IF EXISTS role_field_permissions_insert ON app.role_field_permissions;
-- DROP POLICY IF EXISTS role_field_permissions_tenant_isolation ON app.role_field_permissions;
-- DROP INDEX IF EXISTS app.idx_role_field_permissions_type;
-- DROP INDEX IF EXISTS app.idx_role_field_permissions_field;
-- DROP INDEX IF EXISTS app.idx_role_field_permissions_role;
-- DROP TABLE IF EXISTS app.role_field_permissions;
