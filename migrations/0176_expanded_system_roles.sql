-- Migration: 0176_expanded_system_roles
-- Created: 2026-03-14
-- Description: Expand system roles from 5 to 18, add role hierarchy columns,
--              role templates, and custom role governance.
--              Backwards-compatible: existing roles untouched.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enable system context for seeding
SELECT app.enable_system_context();

-- -----------------------------------------------------------------------------
-- Add hierarchy & governance columns to roles table
-- -----------------------------------------------------------------------------
ALTER TABLE app.roles
    ADD COLUMN IF NOT EXISTS parent_role_id uuid REFERENCES app.roles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS permission_ceiling smallint NOT NULL DEFAULT 4,
    ADD COLUMN IF NOT EXISTS role_category varchar(50) NOT NULL DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS max_sensitivity_tier smallint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN app.roles.parent_role_id IS 'Parent role for inheritance; custom roles inherit from system roles';
COMMENT ON COLUMN app.roles.permission_ceiling IS 'Maximum permission tier this role can grant (0-4)';
COMMENT ON COLUMN app.roles.role_category IS 'Category: platform, hr, payroll, recruitment, lms, compliance, management, employee, audit';
COMMENT ON COLUMN app.roles.max_sensitivity_tier IS 'Maximum data sensitivity tier accessible (0=public, 4=privileged)';
COMMENT ON COLUMN app.roles.is_template IS 'If true, this role can be cloned by tenants as a starting point';

-- Index for parent role lookups
CREATE INDEX IF NOT EXISTS idx_roles_parent_role_id ON app.roles(parent_role_id) WHERE parent_role_id IS NOT NULL;

-- Index for role templates
CREATE INDEX IF NOT EXISTS idx_roles_is_template ON app.roles(is_template) WHERE is_template = true;

-- Index for role category
CREATE INDEX IF NOT EXISTS idx_roles_category ON app.roles(role_category);

-- -----------------------------------------------------------------------------
-- Update existing system roles with hierarchy metadata
-- -----------------------------------------------------------------------------
UPDATE app.roles SET
    role_category = 'platform',
    max_sensitivity_tier = 4,
    permission_ceiling = 4
WHERE name = 'super_admin' AND is_system = true;

UPDATE app.roles SET
    parent_role_id = 'a0000000-0000-0000-0000-000000000001'::uuid,
    role_category = 'platform',
    max_sensitivity_tier = 4,
    permission_ceiling = 4
WHERE name = 'tenant_admin' AND is_system = true;

UPDATE app.roles SET
    parent_role_id = 'a0000000-0000-0000-0000-000000000002'::uuid,
    role_category = 'hr',
    max_sensitivity_tier = 3,
    permission_ceiling = 3
WHERE name = 'hr_admin' AND is_system = true;

UPDATE app.roles SET
    parent_role_id = 'a0000000-0000-0000-0000-000000000003'::uuid,
    role_category = 'management',
    max_sensitivity_tier = 1,
    permission_ceiling = 2
WHERE name = 'manager' AND is_system = true;

UPDATE app.roles SET
    role_category = 'employee',
    max_sensitivity_tier = 0,
    permission_ceiling = 0
WHERE name = 'employee' AND is_system = true;

-- -----------------------------------------------------------------------------
-- Seed New System Roles
-- -----------------------------------------------------------------------------

-- HR Officer (reports to HR Admin)
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000010'::uuid,
    NULL,
    'hr_officer',
    'Day-to-day HR operations: onboarding, contracts, employee record maintenance',
    true,
    '{
        "employees:read": true, "employees:create": true, "employees:update": true,
        "positions:read": true, "positions:assign": true,
        "departments:read": true,
        "contracts:read": true, "contracts:create": true, "contracts:update": true,
        "emergency_contacts:read": true, "emergency_contacts:write": true,
        "probation:read": true, "probation:create": true, "probation:update": true,
        "right_to_work:read": true, "right_to_work:create": true,
        "onboarding:read": true, "onboarding:write": true,
        "documents:read": true, "documents:upload": true,
        "cases:read": true, "cases:create": true, "cases:add_notes": true
    }'::jsonb,
    'admin',
    'a0000000-0000-0000-0000-000000000003'::uuid,
    'hr',
    2,
    2
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Payroll Admin
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000011'::uuid,
    NULL,
    'payroll_admin',
    'Full payroll operations: runs, pay elements, tax codes, pension, payslips',
    true,
    '{
        "payroll_runs:create": true, "payroll_runs:read": true, "payroll_runs:approve": true,
        "payroll_runs:lock": true, "payroll_runs:export": true,
        "pay_elements:create": true, "pay_elements:read": true, "pay_elements:update": true, "pay_elements:delete": true,
        "deductions:create": true, "deductions:read": true, "deductions:update": true, "deductions:approve": true,
        "tax_codes:view": true, "tax_codes:update": true, "tax_codes:import": true,
        "pension:configure": true, "pension:view": true, "pension:auto_enrol": true,
        "payslips:generate": true, "payslips:view_all": true, "payslips:distribute": true,
        "bank_details:read": true, "bank_details:approve_changes": true,
        "employees:view_salary": true,
        "bonus_payments:create": true, "bonus_payments:view_reports": true,
        "p45_p60:generate": true, "p45_p60:view": true, "p45_p60:distribute": true,
        "time_entries:export": true, "time_entries:lock": true,
        "nmw_compliance:check": true, "nmw_compliance:view_alerts": true, "nmw_compliance:resolve": true
    }'::jsonb,
    'admin',
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'payroll',
    3,
    3
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Recruitment Admin
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000012'::uuid,
    NULL,
    'recruitment_admin',
    'Full recruitment lifecycle: postings, candidates, offers, DBS checks',
    true,
    '{
        "job_postings:create": true, "job_postings:read": true, "job_postings:update": true,
        "job_postings:publish": true, "job_postings:unpublish": true, "job_postings:close": true,
        "candidates:create": true, "candidates:read": true, "candidates:update": true,
        "candidates:reject": true, "candidates:shortlist": true, "candidates:view_sensitive": true,
        "interviews:schedule": true, "interviews:conduct": true, "interviews:view_feedback": true,
        "offers:create": true, "offers:send": true, "offers:withdraw": true, "offers:negotiate": true,
        "assessments:create": true, "assessments:assign": true, "assessments:score": true, "assessments:view_results": true,
        "dbs_checks:request": true, "dbs_checks:view": true, "dbs_checks:update_status": true,
        "reference_checks:request": true, "reference_checks:view": true, "reference_checks:complete": true,
        "agencies:create": true, "agencies:read": true, "agencies:update": true, "agencies:manage_terms": true, "agencies:view_fees": true
    }'::jsonb,
    'admin',
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'recruitment',
    2,
    2
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- LMS Admin
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000013'::uuid,
    NULL,
    'lms_admin',
    'Learning management: courses, paths, certifications, mandatory training',
    true,
    '{
        "courses:create": true, "courses:read": true, "courses:update": true,
        "courses:delete": true, "courses:publish": true, "courses:assign": true, "courses:bulk_assign": true,
        "learning_paths:create": true, "learning_paths:read": true, "learning_paths:update": true, "learning_paths:assign": true,
        "certifications:issue": true, "certifications:revoke": true, "certifications:verify": true, "certifications:view_expiring": true,
        "course_ratings:view": true, "course_ratings:moderate": true,
        "mandatory_training:configure": true, "mandatory_training:assign": true,
        "mandatory_training:track_compliance": true, "mandatory_training:escalate": true,
        "learning:assign": true, "learning:admin": true,
        "training_budgets:view": true
    }'::jsonb,
    'admin',
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'lms',
    1,
    1
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Compliance Officer
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000014'::uuid,
    NULL,
    'compliance_officer',
    'GDPR/data protection: DSARs, data breaches, retention, consent, diversity monitoring',
    true,
    '{
        "dsar:view": true, "dsar:process": true, "dsar:extend": true, "dsar:complete": true, "dsar:export": true,
        "data_breach:investigate": true, "data_breach:notify": true, "data_breach:close": true, "data_breach:view_all": true,
        "consent:manage": true, "consent:view_audit": true, "consent:configure_purposes": true,
        "data_erasure:request": true, "data_erasure:approve": true, "data_erasure:execute": true,
        "data_erasure:verify": true, "data_erasure:view_log": true,
        "data_retention:configure": true, "data_retention:view_policies": true, "data_retention:audit": true,
        "privacy_notices:create": true, "privacy_notices:update": true, "privacy_notices:publish": true, "privacy_notices:view_acceptance": true,
        "gender_pay_gap:generate": true, "gender_pay_gap:view": true, "gender_pay_gap:submit": true, "gender_pay_gap:export": true,
        "diversity_monitoring:configure": true, "diversity_monitoring:view_reports": true, "diversity_monitoring:export": true,
        "nmw_compliance:check": true, "nmw_compliance:export": true,
        "audit_log:view": true, "audit_log:export": true,
        "employees:view_disciplinary": true,
        "right_to_work:read": true, "right_to_work:verify": true,
        "cases:view_sensitive": true,
        "disciplinary:view_acas": true,
        "warnings:view_history": true
    }'::jsonb,
    'admin',
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'compliance',
    3,
    3
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Health & Safety Officer
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000015'::uuid,
    NULL,
    'health_safety_officer',
    'H&S incidents, risk assessments, DSE assessments',
    true,
    '{
        "incidents:view": true, "incidents:investigate": true, "incidents:close": true, "incidents:view_reports": true,
        "risk_assessments:create": true, "risk_assessments:view": true, "risk_assessments:update": true,
        "risk_assessments:approve": true, "risk_assessments:review": true,
        "dse_assessments:view": true, "dse_assessments:action": true, "dse_assessments:review": true,
        "employees:view_medical": true
    }'::jsonb,
    'admin',
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'health_safety',
    2,
    2
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Department Head
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000016'::uuid,
    NULL,
    'department_head',
    'Department-wide visibility, approval authority, performance calibration',
    true,
    '{
        "employees:read": true,
        "time:read": true, "time:approve": true,
        "absence:read": true, "absence:approve": true,
        "time_entries:approve": true, "time_entries:bulk_approve": true,
        "leave_requests:view_team": true, "leave_requests:approve": true,
        "performance_reviews:approve": true, "performance_reviews:calibrate": true,
        "goals:cascade": true,
        "headcount:view_plans": true,
        "training_budgets:allocate": true, "training_budgets:approve_spend": true,
        "succession:nominate": true,
        "offers:approve": true,
        "reports:read": true, "reports:export": true,
        "team:read": true
    }'::jsonb,
    'manager',
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'management',
    2,
    2
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Line Manager (rename display, keep "manager" slug for backwards compat)
-- The existing 'manager' role IS the line_manager; we add a 'line_manager' alias
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000017'::uuid,
    NULL,
    'line_manager',
    'Direct reports management, approvals, performance reviews (alias for manager)',
    true,
    '{
        "employees:read": true,
        "time:read": true, "time:approve": true,
        "absence:read": true, "absence:approve": true,
        "time_entries:approve": true,
        "leave_requests:view_team": true, "leave_requests:approve": true, "leave_requests:reject": true,
        "timesheets:view_team": true, "timesheets:approve": true,
        "schedules:create": true, "schedules:read": true, "schedules:update": true, "schedules:assign": true, "schedules:publish": true,
        "overtime:approve": true,
        "performance_reviews:create": true, "performance_reviews:read": true, "performance_reviews:update": true, "performance_reviews:submit": true,
        "goals:create_for_team": true, "goals:read": true,
        "competencies:assess": true, "competencies:view_matrix": true,
        "warnings:create": true, "warnings:read": true,
        "probation:read": true, "probation:complete": true,
        "disciplinary:initiate": true,
        "equipment:assign": true,
        "courses:assign": true,
        "onboarding_instances:view": true, "onboarding_checklists:sign_off": true,
        "delegations:create": true, "delegations:view": true,
        "reports:read": true,
        "team:read": true
    }'::jsonb,
    'manager',
    'a0000000-0000-0000-0000-000000000016'::uuid,
    'management',
    1,
    1
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Team Leader
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000018'::uuid,
    NULL,
    'team_leader',
    'Team visibility, limited approvals (no salary/disciplinary access)',
    true,
    '{
        "employees:read": true,
        "time:read": true,
        "absence:read": true,
        "timesheets:view_team": true,
        "leave_requests:view_team": true,
        "schedules:read": true,
        "goals:read": true,
        "team:read": true,
        "reports:read": true
    }'::jsonb,
    'manager',
    'a0000000-0000-0000-0000-000000000017'::uuid,
    'management',
    1,
    1
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Contractor
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000019'::uuid,
    NULL,
    'contractor',
    'Limited self-service with time-bounded access, time entry focus',
    true,
    '{
        "self:read": true, "self:write": true,
        "time:read": true, "time:write": true,
        "timesheets:view_own": true, "timesheets:submit": true,
        "documents:read": true
    }'::jsonb,
    'employee',
    NULL,
    'employee',
    0,
    0
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Temp Worker
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000020'::uuid,
    NULL,
    'temp_worker',
    'Minimal self-service, time entry only, no benefits access',
    true,
    '{
        "self:read": true,
        "time:read": true, "time:write": true,
        "timesheets:view_own": true, "timesheets:submit": true
    }'::jsonb,
    'employee',
    NULL,
    'employee',
    0,
    0
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Intern
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000021'::uuid,
    NULL,
    'intern',
    'Basic self-service, learning access, no compensation visibility',
    true,
    '{
        "self:read": true, "self:write": true,
        "time:read": true, "time:write": true,
        "absence:read": true, "absence:write": true,
        "courses:read": true,
        "learning_paths:read": true,
        "documents:read": true
    }'::jsonb,
    'employee',
    NULL,
    'employee',
    0,
    0
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- External Auditor
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000022'::uuid,
    NULL,
    'external_auditor',
    'Read-only audit and compliance reports, time-bounded access',
    true,
    '{
        "audit_log:view": true, "audit_log:export": true,
        "reports:view_standard": true,
        "analytics:view_workforce": true,
        "analytics:view_headcount": true,
        "data_retention:view_policies": true,
        "data_retention:audit": true,
        "gender_pay_gap:view": true,
        "diversity_monitoring:view_reports": true
    }'::jsonb,
    'admin',
    NULL,
    'audit',
    2,
    2
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Board Member
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, portal_type, parent_role_id, role_category, max_sensitivity_tier, permission_ceiling) VALUES
(
    'a0000000-0000-0000-0000-000000000023'::uuid,
    NULL,
    'board_member',
    'Board-level reports, succession plans, executive compensation',
    true,
    '{
        "succession:view_plans": true,
        "headcount:view_plans": true,
        "analytics:view_workforce": true, "analytics:view_headcount": true, "analytics:view_turnover": true,
        "analytics:view_compensation": true, "analytics:view_diversity": true,
        "reports:view_standard": true,
        "gender_pay_gap:view": true
    }'::jsonb,
    'admin',
    NULL,
    'audit',
    4,
    4
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Disable system context
SELECT app.disable_system_context();

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- SELECT app.enable_system_context();
-- DELETE FROM app.roles WHERE id IN (
--   'a0000000-0000-0000-0000-000000000010'::uuid,
--   'a0000000-0000-0000-0000-000000000011'::uuid,
--   'a0000000-0000-0000-0000-000000000012'::uuid,
--   'a0000000-0000-0000-0000-000000000013'::uuid,
--   'a0000000-0000-0000-0000-000000000014'::uuid,
--   'a0000000-0000-0000-0000-000000000015'::uuid,
--   'a0000000-0000-0000-0000-000000000016'::uuid,
--   'a0000000-0000-0000-0000-000000000017'::uuid,
--   'a0000000-0000-0000-0000-000000000018'::uuid,
--   'a0000000-0000-0000-0000-000000000019'::uuid,
--   'a0000000-0000-0000-0000-000000000020'::uuid,
--   'a0000000-0000-0000-0000-000000000021'::uuid,
--   'a0000000-0000-0000-0000-000000000022'::uuid,
--   'a0000000-0000-0000-0000-000000000023'::uuid
-- );
-- SELECT app.disable_system_context();
-- ALTER TABLE app.roles DROP COLUMN IF EXISTS parent_role_id;
-- ALTER TABLE app.roles DROP COLUMN IF EXISTS permission_ceiling;
-- ALTER TABLE app.roles DROP COLUMN IF EXISTS role_category;
-- ALTER TABLE app.roles DROP COLUMN IF EXISTS max_sensitivity_tier;
-- ALTER TABLE app.roles DROP COLUMN IF EXISTS is_template;
