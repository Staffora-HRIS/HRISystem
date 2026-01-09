-- Migration: 0008_role_permissions
-- Created: 2026-01-07
-- Description: Create the role_permissions junction table linking roles to permissions
--              This is the source of truth for what permissions a role grants
--              The roles.permissions JSONB field is a cache of this data

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Role-Permission junction table
-- Links roles to their granted permissions
CREATE TABLE IF NOT EXISTS app.role_permissions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this role-permission mapping
    -- NULL for system role mappings
    tenant_id uuid REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The role being granted the permission
    role_id uuid NOT NULL REFERENCES app.roles(id) ON DELETE CASCADE,

    -- The permission being granted
    permission_id uuid NOT NULL REFERENCES app.permissions(id) ON DELETE CASCADE,

    -- Who created this mapping
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- A permission can only be granted once per role
    CONSTRAINT role_permissions_unique UNIQUE (role_id, permission_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Index for finding all permissions for a role
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON app.role_permissions(role_id);

-- Index for finding all roles with a permission
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON app.role_permissions(permission_id);

-- Index for tenant filtering (tenant_id first for RLS)
CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant_id ON app.role_permissions(tenant_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.role_permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see role-permissions for their tenant or system (NULL tenant)
CREATE POLICY tenant_isolation ON app.role_permissions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR tenant_id IS NULL  -- System role-permission mappings visible to all
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert for current tenant (not system mappings)
CREATE POLICY tenant_isolation_insert ON app.role_permissions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to sync role's permissions cache from role_permissions table
CREATE OR REPLACE FUNCTION app.sync_role_permissions_cache(p_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_permissions jsonb;
BEGIN
    -- Build permissions JSONB from role_permissions
    SELECT COALESCE(
        jsonb_object_agg(
            p.resource || ':' || p.action,
            true
        ),
        '{}'::jsonb
    )
    INTO v_permissions
    FROM app.role_permissions rp
    JOIN app.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = p_role_id;

    -- Update the role's cached permissions
    UPDATE app.roles
    SET permissions = v_permissions,
        updated_at = now()
    WHERE id = p_role_id;
END;
$$;

-- Function to grant a permission to a role
CREATE OR REPLACE FUNCTION app.grant_permission_to_role(
    p_tenant_id uuid,
    p_role_id uuid,
    p_resource varchar(100),
    p_action varchar(100),
    p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_permission_id uuid;
    v_role_permission_id uuid;
BEGIN
    -- Find the permission
    SELECT id INTO v_permission_id
    FROM app.permissions
    WHERE resource = p_resource AND action = p_action;

    IF v_permission_id IS NULL THEN
        RAISE EXCEPTION 'Permission not found: %:%', p_resource, p_action;
    END IF;

    -- Insert the role-permission mapping
    INSERT INTO app.role_permissions (tenant_id, role_id, permission_id, created_by)
    VALUES (p_tenant_id, p_role_id, v_permission_id, p_created_by)
    ON CONFLICT (role_id, permission_id) DO NOTHING
    RETURNING id INTO v_role_permission_id;

    -- Sync the permissions cache
    PERFORM app.sync_role_permissions_cache(p_role_id);

    RETURN v_role_permission_id;
END;
$$;

-- Function to revoke a permission from a role
CREATE OR REPLACE FUNCTION app.revoke_permission_from_role(
    p_role_id uuid,
    p_resource varchar(100),
    p_action varchar(100)
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_permission_id uuid;
    v_deleted boolean;
BEGIN
    -- Find the permission
    SELECT id INTO v_permission_id
    FROM app.permissions
    WHERE resource = p_resource AND action = p_action;

    IF v_permission_id IS NULL THEN
        RETURN false;
    END IF;

    -- Delete the role-permission mapping
    DELETE FROM app.role_permissions
    WHERE role_id = p_role_id AND permission_id = v_permission_id;

    v_deleted := FOUND;

    -- Sync the permissions cache
    IF v_deleted THEN
        PERFORM app.sync_role_permissions_cache(p_role_id);
    END IF;

    RETURN v_deleted;
END;
$$;

-- Function to get all permissions for a role (expanded)
CREATE OR REPLACE FUNCTION app.get_role_permissions(p_role_id uuid)
RETURNS TABLE (
    permission_id uuid,
    resource varchar(100),
    action varchar(100),
    permission_key text,
    description text,
    requires_mfa boolean,
    module varchar(100)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id AS permission_id,
        p.resource,
        p.action,
        (p.resource || ':' || p.action) AS permission_key,
        p.description,
        p.requires_mfa,
        p.module
    FROM app.role_permissions rp
    JOIN app.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = p_role_id
    ORDER BY p.module, p.resource, p.action;
END;
$$;

-- =============================================================================
-- Trigger to keep permissions cache in sync
-- =============================================================================

CREATE OR REPLACE FUNCTION app.sync_role_permissions_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = app, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM app.sync_role_permissions_cache(OLD.role_id);
        RETURN OLD;
    ELSE
        PERFORM app.sync_role_permissions_cache(NEW.role_id);
        RETURN NEW;
    END IF;
END;
$$;

CREATE TRIGGER sync_role_permissions_cache
    AFTER INSERT OR UPDATE OR DELETE ON app.role_permissions
    FOR EACH ROW
    EXECUTE FUNCTION app.sync_role_permissions_on_change();

-- =============================================================================
-- Seed System Role Permissions
-- =============================================================================

-- Note: System roles have their permissions cached in the roles.permissions JSONB
-- We don't create explicit role_permissions entries for system roles
-- This keeps the table clean and allows the JSONB cache to be the source of truth for system roles

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.role_permissions IS 'Junction table linking roles to permissions. Source of truth for role permissions.';
COMMENT ON COLUMN app.role_permissions.id IS 'Primary UUID identifier for this mapping';
COMMENT ON COLUMN app.role_permissions.tenant_id IS 'Owning tenant, NULL for system role mappings';
COMMENT ON COLUMN app.role_permissions.role_id IS 'The role being granted the permission';
COMMENT ON COLUMN app.role_permissions.permission_id IS 'The permission being granted';
COMMENT ON COLUMN app.role_permissions.created_by IS 'User who created this mapping';
COMMENT ON FUNCTION app.sync_role_permissions_cache IS 'Syncs the roles.permissions JSONB cache from role_permissions table';
COMMENT ON FUNCTION app.grant_permission_to_role IS 'Grants a permission to a role and syncs cache';
COMMENT ON FUNCTION app.revoke_permission_from_role IS 'Revokes a permission from a role and syncs cache';
COMMENT ON FUNCTION app.get_role_permissions IS 'Returns all permissions for a role with details';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS sync_role_permissions_cache ON app.role_permissions;
-- DROP FUNCTION IF EXISTS app.sync_role_permissions_on_change();
-- DROP FUNCTION IF EXISTS app.get_role_permissions(uuid);
-- DROP FUNCTION IF EXISTS app.revoke_permission_from_role(uuid, varchar, varchar);
-- DROP FUNCTION IF EXISTS app.grant_permission_to_role(uuid, uuid, varchar, varchar, uuid);
-- DROP FUNCTION IF EXISTS app.sync_role_permissions_cache(uuid);
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.role_permissions;
-- DROP POLICY IF EXISTS tenant_isolation ON app.role_permissions;
-- DROP INDEX IF EXISTS app.idx_role_permissions_tenant_id;
-- DROP INDEX IF EXISTS app.idx_role_permissions_permission_id;
-- DROP INDEX IF EXISTS app.idx_role_permissions_role_id;
-- DROP TABLE IF EXISTS app.role_permissions;
