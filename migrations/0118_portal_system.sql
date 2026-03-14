-- Migration: 0118_portal_system
-- Created: 2026-01-17
-- Description: Create portal system for multi-portal architecture
--              Admin Portal, Manager Portal, Employee Self-Service Portal

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Portal Type Enum
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE app.portal_type AS ENUM ('admin', 'manager', 'employee');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- Portals Table
-- -----------------------------------------------------------------------------
-- Defines the available portals in the system
CREATE TABLE IF NOT EXISTS app.portals (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Portal identification
    code app.portal_type NOT NULL UNIQUE,
    name varchar(100) NOT NULL,
    description text,
    base_path varchar(50) NOT NULL,           -- '/admin', '/manager', '/ess'

    -- Portal configuration
    is_active boolean NOT NULL DEFAULT true,
    theme_config jsonb DEFAULT '{}',          -- Portal-specific theming
    default_route varchar(100) DEFAULT '/dashboard',
    icon varchar(50),                         -- Icon for portal selector

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- User Portal Access Table
-- -----------------------------------------------------------------------------
-- Maps which portals a user can access (users can have access to multiple portals)
CREATE TABLE IF NOT EXISTS app.user_portal_access (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant scope
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- User and portal
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    portal_id uuid NOT NULL REFERENCES app.portals(id) ON DELETE CASCADE,

    -- Access configuration
    is_default boolean NOT NULL DEFAULT false,  -- Default portal on login
    is_active boolean NOT NULL DEFAULT true,    -- Can be temporarily disabled

    -- Audit
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by uuid REFERENCES app.users(id),
    revoked_at timestamptz,
    revoked_by uuid REFERENCES app.users(id),

    -- Unique constraint
    CONSTRAINT user_portal_access_unique UNIQUE (tenant_id, user_id, portal_id)
);

-- =============================================================================
-- Alter Roles Table
-- =============================================================================

-- Add portal_type to roles
ALTER TABLE app.roles
    ADD COLUMN IF NOT EXISTS portal_type app.portal_type;

-- Enable system context to allow updating system roles
SELECT set_config('app.system_context', 'true', false);

-- Update existing system roles with portal types
UPDATE app.roles SET portal_type = 'admin' WHERE name IN ('super_admin', 'tenant_admin', 'hr_admin');
UPDATE app.roles SET portal_type = 'manager' WHERE name = 'manager';
UPDATE app.roles SET portal_type = 'employee' WHERE name = 'employee';

-- Reset system context
SELECT set_config('app.system_context', 'false', false);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Portal access by user
CREATE INDEX IF NOT EXISTS idx_user_portal_access_user
    ON app.user_portal_access(tenant_id, user_id);

-- Active portal access
CREATE INDEX IF NOT EXISTS idx_user_portal_access_active
    ON app.user_portal_access(tenant_id, user_id, portal_id)
    WHERE is_active = true AND revoked_at IS NULL;

-- Roles by portal type
CREATE INDEX IF NOT EXISTS idx_roles_portal_type
    ON app.roles(portal_type)
    WHERE portal_type IS NOT NULL;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Portals table doesn't need RLS (global reference data)

ALTER TABLE app.user_portal_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_portal_access_tenant_isolation ON app.user_portal_access
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY user_portal_access_insert ON app.user_portal_access
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_portals_updated_at
    BEFORE UPDATE ON app.portals
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Ensure only one default portal per user per tenant
CREATE OR REPLACE FUNCTION app.ensure_single_default_portal()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = app, public
AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE app.user_portal_access
        SET is_default = false
        WHERE tenant_id = NEW.tenant_id
          AND user_id = NEW.user_id
          AND id != NEW.id
          AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_single_default_portal
    BEFORE INSERT OR UPDATE ON app.user_portal_access
    FOR EACH ROW
    WHEN (NEW.is_default = true)
    EXECUTE FUNCTION app.ensure_single_default_portal();

-- =============================================================================
-- Seed Portal Data
-- =============================================================================

INSERT INTO app.portals (code, name, description, base_path, icon) VALUES
    ('admin', 'Admin Portal', 'Full HR administration and system management', '/admin', 'shield'),
    ('manager', 'Manager Portal', 'Line manager self-service for team management', '/manager', 'users'),
    ('employee', 'Employee Self-Service', 'Employee self-service portal', '/ess', 'user')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    base_path = EXCLUDED.base_path,
    icon = EXCLUDED.icon;

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get user's available portals
CREATE OR REPLACE FUNCTION app.get_user_portals(
    p_user_id uuid
)
RETURNS TABLE (
    portal_id uuid,
    portal_code app.portal_type,
    portal_name varchar(100),
    base_path varchar(50),
    is_default boolean,
    icon varchar(50)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id as portal_id,
        p.code as portal_code,
        p.name as portal_name,
        p.base_path,
        upa.is_default,
        p.icon
    FROM app.user_portal_access upa
    JOIN app.portals p ON p.id = upa.portal_id
    WHERE upa.user_id = p_user_id
      AND upa.tenant_id = current_setting('app.current_tenant', true)::uuid
      AND upa.is_active = true
      AND upa.revoked_at IS NULL
      AND p.is_active = true
    ORDER BY upa.is_default DESC, p.name ASC;
END;
$$;

-- Function to get user's default portal
CREATE OR REPLACE FUNCTION app.get_user_default_portal(
    p_user_id uuid
)
RETURNS TABLE (
    portal_code app.portal_type,
    base_path varchar(50)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT p.code, p.base_path
    FROM app.user_portal_access upa
    JOIN app.portals p ON p.id = upa.portal_id
    WHERE upa.user_id = p_user_id
      AND upa.tenant_id = current_setting('app.current_tenant', true)::uuid
      AND upa.is_active = true
      AND upa.revoked_at IS NULL
      AND p.is_active = true
    ORDER BY upa.is_default DESC
    LIMIT 1;
END;
$$;

-- Function to grant portal access to a user
CREATE OR REPLACE FUNCTION app.grant_portal_access(
    p_user_id uuid,
    p_portal_code app.portal_type,
    p_is_default boolean DEFAULT false,
    p_granted_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id uuid;
    v_portal_id uuid;
    v_access_id uuid;
BEGIN
    v_tenant_id := current_setting('app.current_tenant', true)::uuid;

    SELECT id INTO v_portal_id FROM app.portals WHERE code = p_portal_code;

    IF v_portal_id IS NULL THEN
        RAISE EXCEPTION 'Portal not found: %', p_portal_code;
    END IF;

    INSERT INTO app.user_portal_access (
        tenant_id, user_id, portal_id, is_default, granted_by
    )
    VALUES (
        v_tenant_id, p_user_id, v_portal_id, p_is_default, p_granted_by
    )
    ON CONFLICT (tenant_id, user_id, portal_id) DO UPDATE SET
        is_active = true,
        is_default = EXCLUDED.is_default,
        revoked_at = NULL,
        revoked_by = NULL
    RETURNING id INTO v_access_id;

    RETURN v_access_id;
END;
$$;

-- Function to revoke portal access
CREATE OR REPLACE FUNCTION app.revoke_portal_access(
    p_user_id uuid,
    p_portal_code app.portal_type,
    p_revoked_by uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id uuid;
    v_portal_id uuid;
BEGIN
    v_tenant_id := current_setting('app.current_tenant', true)::uuid;

    SELECT id INTO v_portal_id FROM app.portals WHERE code = p_portal_code;

    UPDATE app.user_portal_access
    SET is_active = false,
        revoked_at = now(),
        revoked_by = p_revoked_by
    WHERE tenant_id = v_tenant_id
      AND user_id = p_user_id
      AND portal_id = v_portal_id;

    RETURN FOUND;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.portals IS 'Defines available portals: Admin, Manager, Employee Self-Service';
COMMENT ON TABLE app.user_portal_access IS 'Maps which portals each user can access';
COMMENT ON COLUMN app.portals.code IS 'Portal type identifier';
COMMENT ON COLUMN app.portals.base_path IS 'URL base path for the portal';
COMMENT ON COLUMN app.user_portal_access.is_default IS 'Whether this is the users default portal on login';
COMMENT ON COLUMN app.roles.portal_type IS 'Which portal this role is primarily associated with';
COMMENT ON FUNCTION app.get_user_portals IS 'Returns all active portals a user can access';
COMMENT ON FUNCTION app.get_user_default_portal IS 'Returns the users default portal';
COMMENT ON FUNCTION app.grant_portal_access IS 'Grants access to a portal for a user';
COMMENT ON FUNCTION app.revoke_portal_access IS 'Revokes portal access for a user';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.revoke_portal_access(uuid, app.portal_type, uuid);
-- DROP FUNCTION IF EXISTS app.grant_portal_access(uuid, app.portal_type, boolean, uuid);
-- DROP FUNCTION IF EXISTS app.get_user_default_portal(uuid);
-- DROP FUNCTION IF EXISTS app.get_user_portals(uuid);
-- DROP TRIGGER IF EXISTS ensure_single_default_portal ON app.user_portal_access;
-- DROP FUNCTION IF EXISTS app.ensure_single_default_portal();
-- DROP TRIGGER IF EXISTS update_portals_updated_at ON app.portals;
-- DROP POLICY IF EXISTS user_portal_access_insert ON app.user_portal_access;
-- DROP POLICY IF EXISTS user_portal_access_tenant_isolation ON app.user_portal_access;
-- DROP INDEX IF EXISTS app.idx_roles_portal_type;
-- DROP INDEX IF EXISTS app.idx_user_portal_access_active;
-- DROP INDEX IF EXISTS app.idx_user_portal_access_user;
-- ALTER TABLE app.roles DROP COLUMN IF EXISTS portal_type;
-- DROP TABLE IF EXISTS app.user_portal_access;
-- DROP TABLE IF EXISTS app.portals;
-- DROP TYPE IF EXISTS app.portal_type;
