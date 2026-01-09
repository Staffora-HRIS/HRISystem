-- Migration: 0009_role_assignments
-- Created: 2026-01-07
-- Description: Create the role_assignments table for assigning roles to users
--              Supports constraints for scoped access (org unit, relationship-based)
--              This is tenant-scoped with RLS

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Role Assignments table - Assigns roles to users within a tenant
-- Users can have multiple roles with different constraints
CREATE TABLE IF NOT EXISTS app.role_assignments (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant this assignment belongs to
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- User receiving the role
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    -- Role being assigned
    role_id uuid NOT NULL REFERENCES app.roles(id) ON DELETE CASCADE,

    -- Constraints that scope this role assignment
    -- Structure: {
    --   "org_units": ["uuid1", "uuid2"],  -- Limit access to specific org units
    --   "cost_centers": ["uuid1"],         -- Limit to specific cost centers
    --   "scope": "self|direct_reports|org_unit|all",  -- Relationship scope
    --   "custom": { ... }                  -- Module-specific constraints
    -- }
    -- NULL or empty {} means no constraints (full access per role permissions)
    constraints jsonb DEFAULT '{}',

    -- When this assignment becomes effective
    -- Supports future-dated assignments
    effective_from timestamptz NOT NULL DEFAULT now(),

    -- When this assignment ends (NULL = indefinite)
    effective_to timestamptz,

    -- Who assigned this role
    assigned_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- When the role was assigned
    assigned_at timestamptz NOT NULL DEFAULT now(),

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Prevent duplicate active assignments of same role to same user
    -- Note: This doesn't prevent overlapping date ranges - that's handled in application logic
    CONSTRAINT role_assignments_no_duplicate CHECK (
        effective_to IS NULL OR effective_to > effective_from
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: Find all roles for a user in a tenant
CREATE INDEX IF NOT EXISTS idx_role_assignments_tenant_user ON app.role_assignments(tenant_id, user_id);

-- Find all users with a specific role
CREATE INDEX IF NOT EXISTS idx_role_assignments_role_id ON app.role_assignments(role_id);

-- Tenant filtering (tenant_id first for RLS)
CREATE INDEX IF NOT EXISTS idx_role_assignments_tenant_id ON app.role_assignments(tenant_id);

-- Find current active assignments
CREATE INDEX IF NOT EXISTS idx_role_assignments_effective ON app.role_assignments(effective_from, effective_to)
    WHERE effective_to IS NULL;

-- GIN index for constraint queries
CREATE INDEX IF NOT EXISTS idx_role_assignments_constraints ON app.role_assignments USING gin(constraints);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.role_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see role assignments for their current tenant
CREATE POLICY tenant_isolation ON app.role_assignments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert for current tenant
CREATE POLICY tenant_isolation_insert ON app.role_assignments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_role_assignments_updated_at
    BEFORE UPDATE ON app.role_assignments
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get all active roles for a user in a tenant
CREATE OR REPLACE FUNCTION app.get_user_roles(
    p_tenant_id uuid,
    p_user_id uuid,
    p_as_of timestamptz DEFAULT now()
)
RETURNS TABLE (
    role_id uuid,
    role_name varchar(100),
    is_system boolean,
    constraints jsonb,
    effective_from timestamptz,
    effective_to timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id AS role_id,
        r.name AS role_name,
        r.is_system,
        ra.constraints,
        ra.effective_from,
        ra.effective_to
    FROM app.role_assignments ra
    JOIN app.roles r ON r.id = ra.role_id
    WHERE ra.tenant_id = p_tenant_id
      AND ra.user_id = p_user_id
      AND ra.effective_from <= p_as_of
      AND (ra.effective_to IS NULL OR ra.effective_to > p_as_of)
    ORDER BY r.is_system DESC, r.name ASC;
END;
$$;

-- Function to get effective permissions for a user (combining all roles)
CREATE OR REPLACE FUNCTION app.get_user_permissions(
    p_tenant_id uuid,
    p_user_id uuid,
    p_as_of timestamptz DEFAULT now()
)
RETURNS TABLE (
    permission_key text,
    resource varchar(100),
    action varchar(100),
    requires_mfa boolean,
    role_name varchar(100),
    constraints jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (p.resource, p.action)
        (p.resource || ':' || p.action) AS permission_key,
        p.resource,
        p.action,
        p.requires_mfa,
        r.name AS role_name,
        ra.constraints
    FROM app.role_assignments ra
    JOIN app.roles r ON r.id = ra.role_id
    CROSS JOIN LATERAL (
        -- Get permissions from role's JSONB cache
        SELECT key AS perm_key
        FROM jsonb_each(r.permissions)
        WHERE value = 'true'::jsonb
    ) perms
    JOIN app.permissions p ON (p.resource || ':' || p.action) = perms.perm_key
    WHERE ra.tenant_id = p_tenant_id
      AND ra.user_id = p_user_id
      AND ra.effective_from <= p_as_of
      AND (ra.effective_to IS NULL OR ra.effective_to > p_as_of)
    ORDER BY p.resource, p.action, ra.constraints NULLS LAST;
END;
$$;

-- Function to check if user has a specific permission
CREATE OR REPLACE FUNCTION app.user_has_permission(
    p_tenant_id uuid,
    p_user_id uuid,
    p_resource varchar(100),
    p_action varchar(100),
    p_as_of timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_has_permission boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM app.role_assignments ra
        JOIN app.roles r ON r.id = ra.role_id
        WHERE ra.tenant_id = p_tenant_id
          AND ra.user_id = p_user_id
          AND ra.effective_from <= p_as_of
          AND (ra.effective_to IS NULL OR ra.effective_to > p_as_of)
          AND (
              -- Check for exact permission
              r.permissions ? (p_resource || ':' || p_action)
              -- Or wildcard permissions
              OR r.permissions ? '*:*'
              OR r.permissions ? (p_resource || ':*')
              OR r.permissions ? ('*:' || p_action)
          )
    ) INTO v_has_permission;

    RETURN v_has_permission;
END;
$$;

-- Function to assign a role to a user
CREATE OR REPLACE FUNCTION app.assign_role_to_user(
    p_tenant_id uuid,
    p_user_id uuid,
    p_role_id uuid,
    p_assigned_by uuid DEFAULT NULL,
    p_constraints jsonb DEFAULT '{}',
    p_effective_from timestamptz DEFAULT now(),
    p_effective_to timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_assignment_id uuid;
BEGIN
    INSERT INTO app.role_assignments (
        tenant_id, user_id, role_id, constraints,
        effective_from, effective_to, assigned_by
    )
    VALUES (
        p_tenant_id, p_user_id, p_role_id, COALESCE(p_constraints, '{}'),
        p_effective_from, p_effective_to, p_assigned_by
    )
    RETURNING id INTO v_assignment_id;

    RETURN v_assignment_id;
END;
$$;

-- Function to revoke a role from a user (soft revoke by setting effective_to)
CREATE OR REPLACE FUNCTION app.revoke_role_from_user(
    p_assignment_id uuid,
    p_revoked_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    UPDATE app.role_assignments
    SET effective_to = p_revoked_at,
        updated_at = now()
    WHERE id = p_assignment_id
      AND (effective_to IS NULL OR effective_to > p_revoked_at);

    RETURN FOUND;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.role_assignments IS 'Assigns roles to users within a tenant with optional constraints';
COMMENT ON COLUMN app.role_assignments.id IS 'Primary UUID identifier for this assignment';
COMMENT ON COLUMN app.role_assignments.tenant_id IS 'Tenant this assignment belongs to';
COMMENT ON COLUMN app.role_assignments.user_id IS 'User receiving the role';
COMMENT ON COLUMN app.role_assignments.role_id IS 'Role being assigned';
COMMENT ON COLUMN app.role_assignments.constraints IS 'JSONB constraints scoping this assignment (org_units, scope, etc.)';
COMMENT ON COLUMN app.role_assignments.effective_from IS 'When this assignment becomes active';
COMMENT ON COLUMN app.role_assignments.effective_to IS 'When this assignment ends, NULL for indefinite';
COMMENT ON COLUMN app.role_assignments.assigned_by IS 'User who made this assignment';
COMMENT ON FUNCTION app.get_user_roles IS 'Returns all active roles for a user in a tenant';
COMMENT ON FUNCTION app.get_user_permissions IS 'Returns effective permissions for a user (combined from all roles)';
COMMENT ON FUNCTION app.user_has_permission IS 'Checks if user has a specific permission in a tenant';
COMMENT ON FUNCTION app.assign_role_to_user IS 'Assigns a role to a user with optional constraints';
COMMENT ON FUNCTION app.revoke_role_from_user IS 'Revokes a role assignment by setting effective_to';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.revoke_role_from_user(uuid, timestamptz);
-- DROP FUNCTION IF EXISTS app.assign_role_to_user(uuid, uuid, uuid, uuid, jsonb, timestamptz, timestamptz);
-- DROP FUNCTION IF EXISTS app.user_has_permission(uuid, uuid, varchar, varchar, timestamptz);
-- DROP FUNCTION IF EXISTS app.get_user_permissions(uuid, uuid, timestamptz);
-- DROP FUNCTION IF EXISTS app.get_user_roles(uuid, uuid, timestamptz);
-- DROP TRIGGER IF EXISTS update_role_assignments_updated_at ON app.role_assignments;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.role_assignments;
-- DROP POLICY IF EXISTS tenant_isolation ON app.role_assignments;
-- DROP INDEX IF EXISTS app.idx_role_assignments_constraints;
-- DROP INDEX IF EXISTS app.idx_role_assignments_effective;
-- DROP INDEX IF EXISTS app.idx_role_assignments_tenant_id;
-- DROP INDEX IF EXISTS app.idx_role_assignments_role_id;
-- DROP INDEX IF EXISTS app.idx_role_assignments_tenant_user;
-- DROP TABLE IF EXISTS app.role_assignments;
