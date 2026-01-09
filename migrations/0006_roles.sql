-- Migration: 0006_roles
-- Created: 2026-01-07
-- Description: Create the roles table for RBAC (Role-Based Access Control)
--              Roles define sets of permissions that can be assigned to users
--              System roles are predefined and cannot be modified by tenants

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Roles table - RBAC role definitions
-- Roles are tenant-scoped (each tenant can have custom roles)
-- System roles are shared but appear in each tenant
CREATE TABLE IF NOT EXISTS app.roles (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this role
    -- NULL for system-wide roles (super_admin)
    tenant_id uuid REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Role name (unique within tenant)
    name varchar(100) NOT NULL,

    -- Human-readable description of the role
    description text,

    -- Whether this is a system-defined role
    -- System roles cannot be modified or deleted by tenants
    is_system boolean NOT NULL DEFAULT false,

    -- Permission definitions embedded in the role (denormalized for performance)
    -- Structure: { "resource:action": true, ... }
    -- Example: { "employees:read": true, "employees:write": true }
    -- Note: This is a cache; source of truth is role_permissions table
    permissions jsonb NOT NULL DEFAULT '{}',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Role name must be unique within a tenant (or globally for system roles)
    CONSTRAINT roles_name_unique UNIQUE NULLS NOT DISTINCT (tenant_id, name)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Index for finding roles by tenant (tenant_id first for RLS)
CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON app.roles(tenant_id);

-- Index for system roles
CREATE INDEX IF NOT EXISTS idx_roles_is_system ON app.roles(is_system) WHERE is_system = true;

-- Index for role name searches within tenant
CREATE INDEX IF NOT EXISTS idx_roles_tenant_name ON app.roles(tenant_id, name);

-- GIN index for JSONB permission queries
CREATE INDEX IF NOT EXISTS idx_roles_permissions ON app.roles USING gin(permissions);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.roles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see roles for their current tenant OR system roles
CREATE POLICY tenant_isolation ON app.roles
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR tenant_id IS NULL  -- System roles visible to all
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant (not system roles)
CREATE POLICY tenant_isolation_insert ON app.roles
    FOR INSERT
    WITH CHECK (
        (
            tenant_id = current_setting('app.current_tenant', true)::uuid
            AND is_system = false
        )
        OR app.is_system_context()
    );

-- Policy for UPDATE: Cannot update system roles (except in system context)
CREATE POLICY no_system_role_update ON app.roles
    FOR UPDATE
    USING (
        (is_system = false AND tenant_id = current_setting('app.current_tenant', true)::uuid)
        OR app.is_system_context()
    );

-- Policy for DELETE: Cannot delete system roles
CREATE POLICY no_system_role_delete ON app.roles
    FOR DELETE
    USING (
        (is_system = false AND tenant_id = current_setting('app.current_tenant', true)::uuid)
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_roles_updated_at
    BEFORE UPDATE ON app.roles
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Prevent modification of system roles
CREATE OR REPLACE FUNCTION app.protect_system_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = app, public
AS $$
BEGIN
    -- Allow changes in system context (migrations, seeds)
    IF app.is_system_context() THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Prevent modification of system roles
    IF TG_OP = 'UPDATE' AND OLD.is_system = true THEN
        RAISE EXCEPTION 'System roles cannot be modified';
    END IF;

    IF TG_OP = 'DELETE' AND OLD.is_system = true THEN
        RAISE EXCEPTION 'System roles cannot be deleted';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER protect_system_roles
    BEFORE UPDATE OR DELETE ON app.roles
    FOR EACH ROW
    EXECUTE FUNCTION app.protect_system_roles();

-- =============================================================================
-- Seed System Roles
-- =============================================================================

-- Insert system roles (these are global, tenant_id = NULL)
-- Using ON CONFLICT to make migration idempotent
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions) VALUES
    -- Super Admin: Full system access (platform level)
    (
        'a0000000-0000-0000-0000-000000000001'::uuid,
        NULL,
        'super_admin',
        'Platform super administrator with unrestricted access to all features and tenants',
        true,
        '{"*:*": true}'::jsonb
    ),
    -- Tenant Admin: Full access within a tenant
    (
        'a0000000-0000-0000-0000-000000000002'::uuid,
        NULL,
        'tenant_admin',
        'Tenant administrator with full access to all features within the tenant',
        true,
        '{
            "tenant:read": true,
            "tenant:write": true,
            "users:read": true,
            "users:write": true,
            "users:invite": true,
            "roles:read": true,
            "roles:write": true,
            "employees:read": true,
            "employees:write": true,
            "employees:delete": true,
            "org:read": true,
            "org:write": true,
            "time:read": true,
            "time:write": true,
            "time:approve": true,
            "absence:read": true,
            "absence:write": true,
            "absence:approve": true,
            "reports:read": true,
            "reports:export": true,
            "audit:read": true,
            "settings:read": true,
            "settings:write": true
        }'::jsonb
    ),
    -- HR Admin: HR-focused administration
    (
        'a0000000-0000-0000-0000-000000000003'::uuid,
        NULL,
        'hr_admin',
        'HR administrator with access to employee management, time, absence, and HR reports',
        true,
        '{
            "employees:read": true,
            "employees:write": true,
            "employees:delete": true,
            "org:read": true,
            "org:write": true,
            "time:read": true,
            "time:write": true,
            "time:approve": true,
            "absence:read": true,
            "absence:write": true,
            "absence:approve": true,
            "reports:read": true,
            "reports:export": true,
            "cases:read": true,
            "cases:write": true,
            "onboarding:read": true,
            "onboarding:write": true
        }'::jsonb
    ),
    -- Manager: Team management capabilities
    (
        'a0000000-0000-0000-0000-000000000004'::uuid,
        NULL,
        'manager',
        'Manager role with access to direct reports, time approval, and team absence management',
        true,
        '{
            "employees:read": true,
            "time:read": true,
            "time:approve": true,
            "absence:read": true,
            "absence:approve": true,
            "reports:read": true,
            "team:read": true
        }'::jsonb
    ),
    -- Employee: Basic self-service access
    (
        'a0000000-0000-0000-0000-000000000005'::uuid,
        NULL,
        'employee',
        'Standard employee role with self-service access to personal data, time, and absence',
        true,
        '{
            "self:read": true,
            "self:write": true,
            "time:read": true,
            "time:write": true,
            "absence:read": true,
            "absence:write": true
        }'::jsonb
    )
ON CONFLICT (tenant_id, name) DO NOTHING;

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get all roles for a tenant (including system roles)
CREATE OR REPLACE FUNCTION app.get_tenant_roles(p_tenant_id uuid)
RETURNS TABLE (
    id uuid,
    name varchar(100),
    description text,
    is_system boolean,
    permissions jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.name,
        r.description,
        r.is_system,
        r.permissions
    FROM app.roles r
    WHERE r.tenant_id = p_tenant_id
       OR r.tenant_id IS NULL  -- Include system roles
    ORDER BY r.is_system DESC, r.name ASC;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.roles IS 'RBAC role definitions. System roles are predefined; tenants can create custom roles.';
COMMENT ON COLUMN app.roles.id IS 'Primary UUID identifier for the role';
COMMENT ON COLUMN app.roles.tenant_id IS 'Owning tenant, NULL for system-wide roles';
COMMENT ON COLUMN app.roles.name IS 'Role name, unique within tenant';
COMMENT ON COLUMN app.roles.description IS 'Human-readable description of the role';
COMMENT ON COLUMN app.roles.is_system IS 'Whether this is a system role (cannot be modified)';
COMMENT ON COLUMN app.roles.permissions IS 'Cached permission map for quick lookups';
COMMENT ON FUNCTION app.get_tenant_roles IS 'Returns all roles available to a tenant (custom + system)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DELETE FROM app.roles WHERE is_system = true;
-- DROP FUNCTION IF EXISTS app.get_tenant_roles(uuid);
-- DROP TRIGGER IF EXISTS protect_system_roles ON app.roles;
-- DROP FUNCTION IF EXISTS app.protect_system_roles();
-- DROP TRIGGER IF EXISTS update_roles_updated_at ON app.roles;
-- DROP POLICY IF EXISTS no_system_role_delete ON app.roles;
-- DROP POLICY IF EXISTS no_system_role_update ON app.roles;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.roles;
-- DROP POLICY IF EXISTS tenant_isolation ON app.roles;
-- DROP INDEX IF EXISTS app.idx_roles_permissions;
-- DROP INDEX IF EXISTS app.idx_roles_tenant_name;
-- DROP INDEX IF EXISTS app.idx_roles_is_system;
-- DROP INDEX IF EXISTS app.idx_roles_tenant_id;
-- DROP TABLE IF EXISTS app.roles;
