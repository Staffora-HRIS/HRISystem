-- Migration: 0090_seed_admin_user
-- Created: 2026-01-09
-- Description: Seed an admin user with super_admin role for development/testing

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enable system context for this migration
SELECT app.enable_system_context();

-- Create the admin user
-- Password: Admin123!
-- IMPORTANT: Use pre-computed bcryptjs hash ($2b$) instead of pgcrypto ($2a$)
-- pgcrypto's bcrypt hashes are NOT compatible with bcryptjs used by Better Auth
-- Hash generated with: bcryptjs.hashSync('Admin123!', 12)
INSERT INTO app.users (
    id,
    email,
    email_verified,
    name,
    password_hash,
    mfa_enabled,
    status,
    created_at,
    updated_at
) VALUES (
    'b0000000-0000-0000-0000-000000000001'::uuid,
    'admin@hris.local',
    true,
    'System Administrator',
    '$2b$12$0gSBShkWCRLnKq/2QT0QE.5catDSG2AuKO9NuJm.Xzvm.0OvbMDe.',
    false,
    'active',
    now(),
    now()
) ON CONFLICT (email) DO UPDATE SET
    password_hash = '$2b$12$0gSBShkWCRLnKq/2QT0QE.5catDSG2AuKO9NuJm.Xzvm.0OvbMDe.',
    status = 'active',
    updated_at = now();

-- Get the default tenant (first tenant, or create one if none exists)
DO $$
DECLARE
    v_tenant_id uuid;
    v_user_id uuid := 'b0000000-0000-0000-0000-000000000001'::uuid;
    v_super_admin_role_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
BEGIN
    -- Get or create a default tenant
    SELECT id INTO v_tenant_id FROM app.tenants ORDER BY created_at ASC LIMIT 1;
    
    IF v_tenant_id IS NULL THEN
        INSERT INTO app.tenants (id, name, slug, status, settings)
        VALUES (
            'c0000000-0000-0000-0000-000000000001'::uuid,
            'Default Organization',
            'default',
            'active',
            '{}'::jsonb
        )
        RETURNING id INTO v_tenant_id;
    END IF;
    
    -- Link user to tenant
    UPDATE app.user_tenants
    SET
        is_primary = true,
        status = 'active',
        updated_at = now()
    WHERE user_id = v_user_id
      AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
        INSERT INTO app.user_tenants (user_id, tenant_id, is_primary, status)
        VALUES (v_user_id, v_tenant_id, true, 'active');
    END IF;
    
    -- Assign super_admin role to the user
    INSERT INTO app.role_assignments (
        id,
        tenant_id,
        user_id,
        role_id,
        constraints,
        effective_from,
        assigned_at
    ) VALUES (
        gen_random_uuid(),
        v_tenant_id,
        v_user_id,
        v_super_admin_role_id,
        '{}'::jsonb,
        now(),
        now()
    ) ON CONFLICT DO NOTHING;
    
    RAISE NOTICE 'Admin user created successfully';
    RAISE NOTICE 'Email: admin@hris.local';
    RAISE NOTICE 'Password: Admin123!';
    RAISE NOTICE 'Tenant ID: %', v_tenant_id;
END $$;

-- Disable system context
SELECT app.disable_system_context();

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DELETE FROM app.role_assignments WHERE user_id = 'b0000000-0000-0000-0000-000000000001'::uuid;
-- DELETE FROM app.user_tenants WHERE user_id = 'b0000000-0000-0000-0000-000000000001'::uuid;
-- DELETE FROM app.users WHERE id = 'b0000000-0000-0000-0000-000000000001'::uuid;
