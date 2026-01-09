-- Migration: 0007_permissions
-- Created: 2026-01-07
-- Description: Create the permissions table for granular access control
--              Permissions are resource:action pairs that can be assigned to roles
--              This table is NOT tenant-scoped - permissions are system-wide definitions

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Permissions table - Granular permission definitions
-- Permissions are system-wide (not tenant-scoped)
-- They define what actions can be performed on which resources
CREATE TABLE IF NOT EXISTS app.permissions (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Resource this permission applies to
    -- Examples: employees, time, absence, reports, users, roles
    resource varchar(100) NOT NULL,

    -- Action that can be performed
    -- Examples: read, write, delete, approve, export, invite
    action varchar(100) NOT NULL,

    -- Human-readable description
    description text,

    -- Module this permission belongs to (for grouping in UI)
    -- Examples: core_hr, time_attendance, absence, security
    module varchar(100),

    -- Whether this permission requires MFA verification
    requires_mfa boolean NOT NULL DEFAULT false,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT permissions_resource_action_unique UNIQUE (resource, action)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Index for finding permissions by resource
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON app.permissions(resource);

-- Index for finding permissions by module
CREATE INDEX IF NOT EXISTS idx_permissions_module ON app.permissions(module);

-- Index for MFA-required permissions
CREATE INDEX IF NOT EXISTS idx_permissions_requires_mfa ON app.permissions(requires_mfa) WHERE requires_mfa = true;

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_permissions_updated_at
    BEFORE UPDATE ON app.permissions
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Seed Base Permissions
-- =============================================================================

-- Insert base permissions for all modules
-- Using ON CONFLICT to make migration idempotent
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    -- Tenant Management
    ('tenant', 'read', 'View tenant settings and configuration', 'platform', false),
    ('tenant', 'write', 'Modify tenant settings and configuration', 'platform', true),

    -- User Management
    ('users', 'read', 'View user accounts and profiles', 'security', false),
    ('users', 'write', 'Create and modify user accounts', 'security', true),
    ('users', 'delete', 'Delete or deactivate user accounts', 'security', true),
    ('users', 'invite', 'Invite new users to the tenant', 'security', false),

    -- Role Management
    ('roles', 'read', 'View role definitions and assignments', 'security', false),
    ('roles', 'write', 'Create and modify roles', 'security', true),
    ('roles', 'delete', 'Delete custom roles', 'security', true),
    ('roles', 'assign', 'Assign and unassign roles to users', 'security', true),

    -- Self-Service
    ('self', 'read', 'View own profile and data', 'portal', false),
    ('self', 'write', 'Update own profile information', 'portal', false),

    -- Team Management (for managers)
    ('team', 'read', 'View direct reports and team data', 'portal', false),

    -- Employee Management
    ('employees', 'read', 'View employee records and profiles', 'core_hr', false),
    ('employees', 'write', 'Create and modify employee records', 'core_hr', false),
    ('employees', 'delete', 'Delete or archive employee records', 'core_hr', true),
    ('employees', 'sensitive', 'Access sensitive employee data (PII, compensation)', 'core_hr', true),

    -- Organization Management
    ('org', 'read', 'View organizational structure', 'core_hr', false),
    ('org', 'write', 'Modify organizational units and hierarchy', 'core_hr', true),

    -- Position Management
    ('positions', 'read', 'View position definitions', 'core_hr', false),
    ('positions', 'write', 'Create and modify positions', 'core_hr', false),

    -- Contract Management
    ('contracts', 'read', 'View employment contracts', 'core_hr', false),
    ('contracts', 'write', 'Create and modify contracts', 'core_hr', true),

    -- Compensation
    ('compensation', 'read', 'View compensation data', 'core_hr', true),
    ('compensation', 'write', 'Modify compensation data', 'core_hr', true),

    -- Time & Attendance
    ('time', 'read', 'View time records and timesheets', 'time_attendance', false),
    ('time', 'write', 'Submit time entries and corrections', 'time_attendance', false),
    ('time', 'approve', 'Approve time entries and timesheets', 'time_attendance', false),
    ('time', 'admin', 'Administer time policies and schedules', 'time_attendance', true),

    -- Scheduling
    ('schedules', 'read', 'View work schedules', 'time_attendance', false),
    ('schedules', 'write', 'Create and modify schedules', 'time_attendance', false),

    -- Absence Management
    ('absence', 'read', 'View absence records and balances', 'absence', false),
    ('absence', 'write', 'Submit absence requests', 'absence', false),
    ('absence', 'approve', 'Approve absence requests', 'absence', false),
    ('absence', 'admin', 'Administer absence policies', 'absence', true),

    -- Leave Policies
    ('leave_policies', 'read', 'View leave policy definitions', 'absence', false),
    ('leave_policies', 'write', 'Create and modify leave policies', 'absence', true),

    -- Reporting
    ('reports', 'read', 'View standard reports', 'reporting', false),
    ('reports', 'export', 'Export report data', 'reporting', true),
    ('reports', 'create', 'Create custom reports', 'reporting', false),
    ('reports', 'admin', 'Administer report definitions', 'reporting', true),

    -- Dashboards
    ('dashboards', 'read', 'View dashboards', 'reporting', false),
    ('dashboards', 'write', 'Create and modify dashboards', 'reporting', false),

    -- Audit
    ('audit', 'read', 'View audit logs', 'security', true),
    ('audit', 'export', 'Export audit logs', 'security', true),

    -- Settings
    ('settings', 'read', 'View system settings', 'platform', false),
    ('settings', 'write', 'Modify system settings', 'platform', true),

    -- Workflows
    ('workflows', 'read', 'View workflow definitions', 'workflows', false),
    ('workflows', 'write', 'Create and modify workflows', 'workflows', true),
    ('workflows', 'execute', 'Execute workflow tasks', 'workflows', false),

    -- Cases
    ('cases', 'read', 'View HR cases', 'cases', false),
    ('cases', 'write', 'Create and manage cases', 'cases', false),
    ('cases', 'sensitive', 'Access restricted/sensitive cases', 'cases', true),

    -- Onboarding
    ('onboarding', 'read', 'View onboarding plans and progress', 'onboarding', false),
    ('onboarding', 'write', 'Create and manage onboarding', 'onboarding', false),
    ('onboarding', 'admin', 'Administer onboarding templates', 'onboarding', true),

    -- Learning (LMS)
    ('courses', 'read', 'View course catalog', 'lms', false),
    ('courses', 'write', 'Create and modify courses', 'lms', false),
    ('learning', 'assign', 'Assign learning to employees', 'lms', false),
    ('learning', 'admin', 'Administer LMS settings', 'lms', true),

    -- Talent Management
    ('requisitions', 'read', 'View job requisitions', 'talent', false),
    ('requisitions', 'write', 'Create and manage requisitions', 'talent', false),
    ('candidates', 'read', 'View candidate profiles', 'talent', false),
    ('candidates', 'write', 'Manage candidates', 'talent', false),
    ('performance', 'read', 'View performance reviews', 'talent', false),
    ('performance', 'write', 'Create and manage performance reviews', 'talent', false),
    ('performance', 'admin', 'Administer performance cycles', 'talent', true),

    -- Salary Modelling
    ('salary_models', 'read', 'View salary scenarios', 'compensation', true),
    ('salary_models', 'write', 'Create and modify salary scenarios', 'compensation', true),
    ('salary_models', 'publish', 'Publish salary changes', 'compensation', true),

    -- People Analytics
    ('analytics', 'read', 'View people analytics', 'analytics', true),
    ('analytics', 'admin', 'Administer analytics models', 'analytics', true)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to get all permissions grouped by module
CREATE OR REPLACE FUNCTION app.get_permissions_by_module()
RETURNS TABLE (
    module varchar(100),
    permissions jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.module,
        jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'resource', p.resource,
                'action', p.action,
                'key', p.resource || ':' || p.action,
                'description', p.description,
                'requires_mfa', p.requires_mfa
            )
            ORDER BY p.resource, p.action
        ) AS permissions
    FROM app.permissions p
    GROUP BY p.module
    ORDER BY p.module;
END;
$$;

-- Function to check if a permission requires MFA
CREATE OR REPLACE FUNCTION app.permission_requires_mfa(
    p_resource varchar(100),
    p_action varchar(100)
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_requires_mfa boolean;
BEGIN
    SELECT requires_mfa INTO v_requires_mfa
    FROM app.permissions
    WHERE resource = p_resource AND action = p_action;

    RETURN COALESCE(v_requires_mfa, false);
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.permissions IS 'System-wide permission definitions. Permissions are resource:action pairs.';
COMMENT ON COLUMN app.permissions.id IS 'Primary UUID identifier for the permission';
COMMENT ON COLUMN app.permissions.resource IS 'Resource this permission applies to (e.g., employees, time)';
COMMENT ON COLUMN app.permissions.action IS 'Action that can be performed (e.g., read, write, approve)';
COMMENT ON COLUMN app.permissions.description IS 'Human-readable description of the permission';
COMMENT ON COLUMN app.permissions.module IS 'Module grouping for UI organization';
COMMENT ON COLUMN app.permissions.requires_mfa IS 'Whether this permission requires MFA verification';
COMMENT ON FUNCTION app.get_permissions_by_module IS 'Returns all permissions grouped by module for UI display';
COMMENT ON FUNCTION app.permission_requires_mfa IS 'Checks if a specific permission requires MFA verification';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.permission_requires_mfa(varchar, varchar);
-- DROP FUNCTION IF EXISTS app.get_permissions_by_module();
-- DROP TRIGGER IF EXISTS update_permissions_updated_at ON app.permissions;
-- DROP INDEX IF EXISTS app.idx_permissions_requires_mfa;
-- DROP INDEX IF EXISTS app.idx_permissions_module;
-- DROP INDEX IF EXISTS app.idx_permissions_resource;
-- DROP TABLE IF EXISTS app.permissions;
