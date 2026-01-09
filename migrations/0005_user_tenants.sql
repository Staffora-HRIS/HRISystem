-- Migration: 0005_user_tenants
-- Created: 2026-01-07
-- Description: Create the user_tenants junction table linking users to tenants
--              A user can belong to multiple tenants with different roles in each
--              This table IS tenant-scoped with RLS for proper isolation

-- =============================================================================
-- UP Migration
-- =============================================================================

-- User-Tenant junction table - Maps users to tenants
-- This table IS tenant-scoped as it represents tenant membership
CREATE TABLE IF NOT EXISTS app.user_tenants (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The tenant this association belongs to
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- The user who is a member of this tenant
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

    -- Whether this is the user's primary/default tenant
    -- Only one tenant can be primary per user
    is_primary boolean NOT NULL DEFAULT false,

    -- When the user joined this tenant
    joined_at timestamptz NOT NULL DEFAULT now(),

    -- Membership status within this tenant
    -- active: Normal access
    -- suspended: Temporarily disabled in this tenant
    -- removed: Soft-removed from tenant
    status varchar(20) NOT NULL DEFAULT 'active',

    -- Who invited this user to the tenant
    invited_by uuid REFERENCES app.users(id) ON DELETE SET NULL,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT user_tenants_status_check CHECK (status IN ('active', 'suspended', 'removed')),
    CONSTRAINT user_tenants_unique UNIQUE (tenant_id, user_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Index for finding all tenants a user belongs to
CREATE INDEX IF NOT EXISTS idx_user_tenants_user_id ON app.user_tenants(user_id);

-- Index for finding all users in a tenant (tenant_id first for RLS)
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_id ON app.user_tenants(tenant_id);

-- Index for finding primary tenant for a user
CREATE INDEX IF NOT EXISTS idx_user_tenants_primary ON app.user_tenants(user_id, is_primary) WHERE is_primary = true;

-- Index for status filtering within tenant
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_status ON app.user_tenants(tenant_id, status);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.user_tenants ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see memberships for tenants they have access to
-- Uses the current_tenant setting to filter rows
CREATE POLICY tenant_isolation ON app.user_tenants
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant context
CREATE POLICY tenant_isolation_insert ON app.user_tenants
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_user_tenants_updated_at
    BEFORE UPDATE ON app.user_tenants
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Trigger to ensure only one primary tenant per user
CREATE OR REPLACE FUNCTION app.ensure_single_primary_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = app, public
AS $$
BEGIN
    -- If setting this as primary, unset all other primaries for this user
    IF NEW.is_primary = true THEN
        -- Use system context to bypass RLS for this cross-tenant operation
        PERFORM app.enable_system_context();

        UPDATE app.user_tenants
        SET is_primary = false, updated_at = now()
        WHERE user_id = NEW.user_id
          AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND is_primary = true;

        PERFORM app.disable_system_context();
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_single_primary_tenant
    BEFORE INSERT OR UPDATE ON app.user_tenants
    FOR EACH ROW
    WHEN (NEW.is_primary = true)
    EXECUTE FUNCTION app.ensure_single_primary_tenant();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get all tenants for a user (bypasses RLS intentionally)
-- Used during login to show tenant selection
CREATE OR REPLACE FUNCTION app.get_user_tenants(p_user_id uuid)
RETURNS TABLE (
    tenant_id uuid,
    tenant_name varchar(255),
    tenant_slug varchar(100),
    is_primary boolean,
    status varchar(20),
    joined_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        ut.is_primary,
        ut.status,
        ut.joined_at
    FROM app.user_tenants ut
    JOIN app.tenants t ON t.id = ut.tenant_id
    WHERE ut.user_id = p_user_id
      AND ut.status = 'active'
      AND t.status = 'active'
    ORDER BY ut.is_primary DESC, t.name ASC;
END;
$$;

-- Function to check if a user has access to a specific tenant
CREATE OR REPLACE FUNCTION app.user_has_tenant_access(
    p_user_id uuid,
    p_tenant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM app.user_tenants ut
        JOIN app.tenants t ON t.id = ut.tenant_id
        WHERE ut.user_id = p_user_id
          AND ut.tenant_id = p_tenant_id
          AND ut.status = 'active'
          AND t.status = 'active'
    );
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.user_tenants IS 'Junction table linking users to tenants. A user can belong to multiple tenants.';
COMMENT ON COLUMN app.user_tenants.id IS 'Primary UUID identifier for this membership';
COMMENT ON COLUMN app.user_tenants.tenant_id IS 'The tenant the user is a member of';
COMMENT ON COLUMN app.user_tenants.user_id IS 'The user who is a member of the tenant';
COMMENT ON COLUMN app.user_tenants.is_primary IS 'Whether this is the users default tenant (only one allowed)';
COMMENT ON COLUMN app.user_tenants.joined_at IS 'When the user joined this tenant';
COMMENT ON COLUMN app.user_tenants.status IS 'Membership status: active, suspended, or removed';
COMMENT ON COLUMN app.user_tenants.invited_by IS 'The user who invited this member to the tenant';
COMMENT ON FUNCTION app.get_user_tenants IS 'Returns all active tenants for a user (used during login)';
COMMENT ON FUNCTION app.user_has_tenant_access IS 'Checks if a user has active access to a specific tenant';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.user_has_tenant_access(uuid, uuid);
-- DROP FUNCTION IF EXISTS app.get_user_tenants(uuid);
-- DROP TRIGGER IF EXISTS ensure_single_primary_tenant ON app.user_tenants;
-- DROP FUNCTION IF EXISTS app.ensure_single_primary_tenant();
-- DROP TRIGGER IF EXISTS update_user_tenants_updated_at ON app.user_tenants;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.user_tenants;
-- DROP POLICY IF EXISTS tenant_isolation ON app.user_tenants;
-- DROP INDEX IF EXISTS app.idx_user_tenants_tenant_status;
-- DROP INDEX IF EXISTS app.idx_user_tenants_primary;
-- DROP INDEX IF EXISTS app.idx_user_tenants_tenant_id;
-- DROP INDEX IF EXISTS app.idx_user_tenants_user_id;
-- DROP TABLE IF EXISTS app.user_tenants;
