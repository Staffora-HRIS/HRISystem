-- Migration: 0112_seed_demo_employees
-- Created: 2026-01-16
-- Description: Seed 50 demo employees with realistic company hierarchy
--              Company: Acme Technologies Inc.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Run in system context to bypass RLS
SELECT set_config('app.system_context', 'true', false);

-- -----------------------------------------------------------------------------
-- Create Demo Tenant
-- -----------------------------------------------------------------------------
INSERT INTO app.tenants (id, name, slug, settings, status)
VALUES (
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Acme Technologies Inc.',
    'acme-tech',
    '{"industry": "Technology", "size": "medium", "founded": 2018}'::jsonb,
    'active'
)
ON CONFLICT (slug) DO NOTHING;

SELECT set_config('app.current_tenant', '11111111-1111-1111-1111-111111111111', false);

-- -----------------------------------------------------------------------------
-- Create Org Units (Departments)
-- -----------------------------------------------------------------------------
INSERT INTO app.org_units (id, tenant_id, parent_id, code, name, description, is_active)
VALUES 
    ('aaaaaaaa-0001-0001-0001-000000000001'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, NULL, 'ACME', 'Acme Technologies Inc.', 'Parent company', true),
    ('aaaaaaaa-0001-0001-0001-000000000002'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-0001-0001-0001-000000000001'::uuid, 'EXEC', 'Executive Office', 'C-Suite Leadership', true),
    ('aaaaaaaa-0001-0001-0001-000000000003'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-0001-0001-0001-000000000001'::uuid, 'ENG', 'Engineering', 'Product Development', true),
    ('aaaaaaaa-0001-0001-0001-000000000004'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-0001-0001-0001-000000000001'::uuid, 'SALES', 'Sales', 'Sales Department', true),
    ('aaaaaaaa-0001-0001-0001-000000000005'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-0001-0001-0001-000000000001'::uuid, 'MKT', 'Marketing', 'Marketing Department', true),
    ('aaaaaaaa-0001-0001-0001-000000000006'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-0001-0001-0001-000000000001'::uuid, 'HR', 'Human Resources', 'People Operations', true),
    ('aaaaaaaa-0001-0001-0001-000000000007'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-0001-0001-0001-000000000001'::uuid, 'FIN', 'Finance', 'Finance and Accounting', true),
    ('aaaaaaaa-0001-0001-0001-000000000008'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-0001-0001-0001-000000000001'::uuid, 'OPS', 'Operations', 'IT Operations', true),
    ('aaaaaaaa-0001-0001-0001-000000000009'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-0001-0001-0001-000000000003'::uuid, 'ENG-BE', 'Backend Engineering', 'Backend Team', true),
    ('aaaaaaaa-0001-0001-0001-000000000010'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-0001-0001-0001-000000000003'::uuid, 'ENG-FE', 'Frontend Engineering', 'Frontend Team', true),
    ('aaaaaaaa-0001-0001-0001-000000000011'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-0001-0001-0001-000000000003'::uuid, 'ENG-QA', 'Quality Assurance', 'QA Team', true),
    ('aaaaaaaa-0001-0001-0001-000000000012'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-0001-0001-0001-000000000004'::uuid, 'SALES-ENT', 'Enterprise Sales', 'Enterprise Team', true),
    ('aaaaaaaa-0001-0001-0001-000000000013'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-0001-0001-0001-000000000004'::uuid, 'SALES-SMB', 'SMB Sales', 'SMB Team', true)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Create Positions
-- -----------------------------------------------------------------------------
INSERT INTO app.positions (id, tenant_id, code, title, org_unit_id, job_grade, min_salary, max_salary, currency, is_manager, headcount, reports_to_position_id, is_active)
VALUES 
    -- C-Suite
    ('bbbbbbbb-0001-0001-0001-000000000001'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'CEO', 'Chief Executive Officer', 'aaaaaaaa-0001-0001-0001-000000000002'::uuid, 'E1', 350000, 500000, 'USD', true, 1, NULL, true),
    ('bbbbbbbb-0001-0001-0001-000000000002'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'CTO', 'Chief Technology Officer', 'aaaaaaaa-0001-0001-0001-000000000003'::uuid, 'E2', 280000, 400000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000001'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000003'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'CFO', 'Chief Financial Officer', 'aaaaaaaa-0001-0001-0001-000000000007'::uuid, 'E2', 260000, 380000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000001'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000004'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'COO', 'Chief Operating Officer', 'aaaaaaaa-0001-0001-0001-000000000008'::uuid, 'E2', 260000, 380000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000001'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000005'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'CMO', 'Chief Marketing Officer', 'aaaaaaaa-0001-0001-0001-000000000005'::uuid, 'E2', 240000, 350000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000001'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000006'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'CHRO', 'Chief HR Officer', 'aaaaaaaa-0001-0001-0001-000000000006'::uuid, 'E2', 220000, 320000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000001'::uuid, true),
    -- VP
    ('bbbbbbbb-0001-0001-0001-000000000007'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'VP-ENG', 'VP of Engineering', 'aaaaaaaa-0001-0001-0001-000000000003'::uuid, 'VP', 200000, 280000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000002'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000008'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'VP-SALES', 'VP of Sales', 'aaaaaaaa-0001-0001-0001-000000000004'::uuid, 'VP', 200000, 300000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000001'::uuid, true),
    -- Directors
    ('bbbbbbbb-0001-0001-0001-000000000009'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'DIR-BE', 'Dir Backend Eng', 'aaaaaaaa-0001-0001-0001-000000000009'::uuid, 'D1', 160000, 220000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000007'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000010'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'DIR-FE', 'Dir Frontend Eng', 'aaaaaaaa-0001-0001-0001-000000000010'::uuid, 'D1', 160000, 220000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000007'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000011'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'DIR-QA', 'Dir of QA', 'aaaaaaaa-0001-0001-0001-000000000011'::uuid, 'D1', 150000, 200000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000007'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000012'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'DIR-ESALES', 'Dir Enterprise Sales', 'aaaaaaaa-0001-0001-0001-000000000012'::uuid, 'D1', 150000, 220000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000008'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000013'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'DIR-MKT', 'Dir of Marketing', 'aaaaaaaa-0001-0001-0001-000000000005'::uuid, 'D1', 140000, 200000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000005'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000014'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'DIR-HR', 'Dir of HR', 'aaaaaaaa-0001-0001-0001-000000000006'::uuid, 'D1', 130000, 180000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000006'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000015'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'DIR-FIN', 'Dir of Finance', 'aaaaaaaa-0001-0001-0001-000000000007'::uuid, 'D1', 140000, 190000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000003'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000016'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'DIR-OPS', 'Dir of IT Ops', 'aaaaaaaa-0001-0001-0001-000000000008'::uuid, 'D1', 140000, 190000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000004'::uuid, true),
    -- Managers
    ('bbbbbbbb-0001-0001-0001-000000000017'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'MGR-BE', 'Backend Eng Manager', 'aaaaaaaa-0001-0001-0001-000000000009'::uuid, 'M1', 130000, 170000, 'USD', true, 2, 'bbbbbbbb-0001-0001-0001-000000000009'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000018'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'MGR-FE', 'Frontend Eng Manager', 'aaaaaaaa-0001-0001-0001-000000000010'::uuid, 'M1', 130000, 170000, 'USD', true, 2, 'bbbbbbbb-0001-0001-0001-000000000010'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000019'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'MGR-QA', 'QA Manager', 'aaaaaaaa-0001-0001-0001-000000000011'::uuid, 'M1', 110000, 150000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000011'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000020'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'MGR-ESALES', 'Ent Sales Manager', 'aaaaaaaa-0001-0001-0001-000000000012'::uuid, 'M1', 120000, 180000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000012'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000021'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'MGR-SMB', 'SMB Sales Manager', 'aaaaaaaa-0001-0001-0001-000000000013'::uuid, 'M1', 100000, 150000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000008'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000022'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'MGR-MKT', 'Marketing Manager', 'aaaaaaaa-0001-0001-0001-000000000005'::uuid, 'M1', 95000, 130000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000013'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000023'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'MGR-HR', 'HR Manager', 'aaaaaaaa-0001-0001-0001-000000000006'::uuid, 'M1', 85000, 120000, 'USD', true, 1, 'bbbbbbbb-0001-0001-0001-000000000014'::uuid, true),
    -- ICs
    ('bbbbbbbb-0001-0001-0001-000000000024'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'SR-BE', 'Sr Backend Engineer', 'aaaaaaaa-0001-0001-0001-000000000009'::uuid, 'IC4', 120000, 160000, 'USD', false, 5, 'bbbbbbbb-0001-0001-0001-000000000017'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000025'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'SR-FE', 'Sr Frontend Engineer', 'aaaaaaaa-0001-0001-0001-000000000010'::uuid, 'IC4', 115000, 155000, 'USD', false, 5, 'bbbbbbbb-0001-0001-0001-000000000018'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000026'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'SR-QA', 'Sr QA Engineer', 'aaaaaaaa-0001-0001-0001-000000000011'::uuid, 'IC4', 100000, 140000, 'USD', false, 3, 'bbbbbbbb-0001-0001-0001-000000000019'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000027'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'SR-AE', 'Sr Account Exec', 'aaaaaaaa-0001-0001-0001-000000000012'::uuid, 'IC4', 90000, 150000, 'USD', false, 3, 'bbbbbbbb-0001-0001-0001-000000000020'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000028'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'BE-ENG', 'Backend Engineer', 'aaaaaaaa-0001-0001-0001-000000000009'::uuid, 'IC3', 90000, 130000, 'USD', false, 8, 'bbbbbbbb-0001-0001-0001-000000000017'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000029'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'FE-ENG', 'Frontend Engineer', 'aaaaaaaa-0001-0001-0001-000000000010'::uuid, 'IC3', 85000, 125000, 'USD', false, 8, 'bbbbbbbb-0001-0001-0001-000000000018'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000030'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'QA-ENG', 'QA Engineer', 'aaaaaaaa-0001-0001-0001-000000000011'::uuid, 'IC3', 75000, 110000, 'USD', false, 5, 'bbbbbbbb-0001-0001-0001-000000000019'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000031'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'AE', 'Account Executive', 'aaaaaaaa-0001-0001-0001-000000000012'::uuid, 'IC3', 70000, 120000, 'USD', false, 5, 'bbbbbbbb-0001-0001-0001-000000000020'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000032'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'SDR', 'Sales Dev Rep', 'aaaaaaaa-0001-0001-0001-000000000013'::uuid, 'IC2', 55000, 80000, 'USD', false, 5, 'bbbbbbbb-0001-0001-0001-000000000021'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000033'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'MKT-SPEC', 'Marketing Specialist', 'aaaaaaaa-0001-0001-0001-000000000005'::uuid, 'IC3', 60000, 90000, 'USD', false, 3, 'bbbbbbbb-0001-0001-0001-000000000022'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000034'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'HR-GEN', 'HR Generalist', 'aaaaaaaa-0001-0001-0001-000000000006'::uuid, 'IC3', 55000, 80000, 'USD', false, 3, 'bbbbbbbb-0001-0001-0001-000000000023'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000035'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'ACCT', 'Accountant', 'aaaaaaaa-0001-0001-0001-000000000007'::uuid, 'IC3', 60000, 90000, 'USD', false, 3, 'bbbbbbbb-0001-0001-0001-000000000015'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000036'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'IT-SPEC', 'IT Specialist', 'aaaaaaaa-0001-0001-0001-000000000008'::uuid, 'IC3', 60000, 90000, 'USD', false, 3, 'bbbbbbbb-0001-0001-0001-000000000016'::uuid, true),
    ('bbbbbbbb-0001-0001-0001-000000000037'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'EXEC-ASST', 'Executive Assistant', 'aaaaaaaa-0001-0001-0001-000000000002'::uuid, 'IC3', 55000, 80000, 'USD', false, 1, 'bbbbbbbb-0001-0001-0001-000000000001'::uuid, true)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- =============================================================================
-- DOWN Migration
-- =============================================================================
-- DELETE FROM app.position_assignments WHERE tenant_id = '11111111-1111-1111-1111-111111111111'::uuid;
-- DELETE FROM app.employee_personal WHERE tenant_id = '11111111-1111-1111-1111-111111111111'::uuid;
-- DELETE FROM app.employees WHERE tenant_id = '11111111-1111-1111-1111-111111111111'::uuid;
-- DELETE FROM app.positions WHERE tenant_id = '11111111-1111-1111-1111-111111111111'::uuid;
-- DELETE FROM app.org_units WHERE tenant_id = '11111111-1111-1111-1111-111111111111'::uuid;
-- DELETE FROM app.tenants WHERE id = '11111111-1111-1111-1111-111111111111'::uuid;
