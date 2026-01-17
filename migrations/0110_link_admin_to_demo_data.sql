-- Migration: 0110_link_admin_to_demo_data
-- Created: 2026-01-17
-- Description: Link admin user to demo tenant and CEO employee for full access

-- =============================================================================
-- UP Migration
-- =============================================================================

SELECT app.enable_system_context();

DO $$
DECLARE
    v_admin_user_id uuid := 'b0000000-0000-0000-0000-000000000001'::uuid;
    v_demo_tenant_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
    v_ceo_employee_id uuid := 'cccccccc-0001-0001-0001-000000000001'::uuid;
    v_super_admin_role_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
BEGIN
    -- 1. Link admin user to demo tenant (Acme Technologies)
    INSERT INTO app.user_tenants (user_id, tenant_id, is_primary, status)
    VALUES (v_admin_user_id, v_demo_tenant_id, true, 'active')
    ON CONFLICT (user_id, tenant_id) DO UPDATE SET
        is_primary = true,
        status = 'active',
        updated_at = now();
    
    -- Make demo tenant the primary tenant for admin
    UPDATE app.user_tenants
    SET is_primary = false
    WHERE user_id = v_admin_user_id
      AND tenant_id != v_demo_tenant_id;
    
    -- 2. Assign super_admin role to admin user in demo tenant
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
        v_demo_tenant_id,
        v_admin_user_id,
        v_super_admin_role_id,
        '{}'::jsonb,
        now(),
        now()
    ) ON CONFLICT DO NOTHING;
    
    -- 3. Link admin user to CEO employee record (for Manager portal access)
    UPDATE app.employees
    SET user_id = v_admin_user_id
    WHERE id = v_ceo_employee_id
      AND tenant_id = v_demo_tenant_id;
    
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Admin user linked to demo data successfully!';
    RAISE NOTICE '=================================================';
    RAISE NOTICE 'Email: admin@hris.local';
    RAISE NOTICE 'Password: Admin123!';
    RAISE NOTICE 'Tenant: Acme Technologies Inc.';
    RAISE NOTICE 'Employee: Michael Richardson (CEO)';
    RAISE NOTICE '';
    RAISE NOTICE 'You now have:';
    RAISE NOTICE '  - HR Admin access to see ALL 50 employees';
    RAISE NOTICE '  - Manager Portal access as CEO (all subordinates)';
    RAISE NOTICE '=================================================';
END $$;

SELECT app.disable_system_context();

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- UPDATE app.employees SET user_id = NULL WHERE id = 'cccccccc-0001-0001-0001-000000000001'::uuid;
-- DELETE FROM app.role_assignments WHERE user_id = 'b0000000-0000-0000-0000-000000000001'::uuid AND tenant_id = '11111111-1111-1111-1111-111111111111'::uuid;
-- DELETE FROM app.user_tenants WHERE user_id = 'b0000000-0000-0000-0000-000000000001'::uuid AND tenant_id = '11111111-1111-1111-1111-111111111111'::uuid;
