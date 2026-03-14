-- Migration: 0179_seed_expanded_role_permissions
-- Created: 2026-03-14
-- Description: Seed role_permissions rows linking the 13 new expanded system roles
--              (from migration 0176) to their permission entries (from migration 0177).
--              This creates the formal role_permissions join-table rows so that the
--              permission resolution engine can use JOIN-based lookups in addition to
--              the JSONB permissions cache on the roles table.
--
-- Idempotent: Uses ON CONFLICT DO NOTHING on the unique (role_id, permission_id) constraint.

-- =============================================================================
-- UP Migration
-- =============================================================================

SELECT app.enable_system_context();

-- Helper function to bulk-insert role_permissions from a role name + array of resource:action keys
CREATE OR REPLACE FUNCTION app._seed_role_perms(
    p_role_name varchar,
    p_permission_keys text[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_role_id uuid;
    v_key text;
    v_parts text[];
    v_perm_id uuid;
BEGIN
    SELECT id INTO v_role_id FROM app.roles WHERE name = p_role_name AND is_system = true LIMIT 1;
    IF v_role_id IS NULL THEN
        RAISE NOTICE 'Role % not found, skipping', p_role_name;
        RETURN;
    END IF;

    FOREACH v_key IN ARRAY p_permission_keys LOOP
        v_parts := string_to_array(v_key, ':');
        SELECT id INTO v_perm_id FROM app.permissions
        WHERE resource = v_parts[1] AND action = v_parts[2];

        IF v_perm_id IS NOT NULL THEN
            INSERT INTO app.role_permissions (role_id, permission_id)
            VALUES (v_role_id, v_perm_id)
            ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- HR Officer
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('hr_officer', ARRAY[
    'employees:read', 'employees:create', 'employees:archive',
    'employees:manage_photos',
    'positions:read', 'positions:assign', 'positions:create', 'positions:update',
    'departments:read',
    'contracts:read', 'contracts:create', 'contracts:view_terms',
    'emergency_contacts:read', 'emergency_contacts:write', 'emergency_contacts:manage_for_team',
    'probation:read', 'probation:create', 'probation:update', 'probation:extend', 'probation:complete',
    'right_to_work:read', 'right_to_work:create', 'right_to_work:update', 'right_to_work:verify',
    'onboarding_templates:read',
    'onboarding_instances:create', 'onboarding_instances:view', 'onboarding_instances:manage',
    'onboarding_checklists:view_all', 'onboarding_checklists:update_progress',
    'documents:read', 'documents:upload', 'documents:update',
    'cases:create', 'cases:update', 'cases:add_notes', 'cases:manage_documents',
    'warnings:create', 'warnings:read', 'warnings:update',
    'leave_requests:view_all',
    'leave_balances:view_all'
]);

-- -----------------------------------------------------------------------------
-- Payroll Admin
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('payroll_admin', ARRAY[
    'payroll_runs:create', 'payroll_runs:read', 'payroll_runs:approve',
    'payroll_runs:lock', 'payroll_runs:export', 'payroll_runs:reject', 'payroll_runs:reopen',
    'pay_elements:create', 'pay_elements:read', 'pay_elements:update', 'pay_elements:delete',
    'deductions:create', 'deductions:read', 'deductions:update', 'deductions:delete', 'deductions:approve',
    'tax_codes:view', 'tax_codes:update', 'tax_codes:import', 'tax_codes:verify',
    'pension:configure', 'pension:view', 'pension:auto_enrol', 'pension:opt_out', 'pension:assess',
    'payslips:generate', 'payslips:view_all', 'payslips:distribute', 'payslips:reissue',
    'bank_details:read', 'bank_details:approve_changes',
    'employees:view_salary', 'employees:edit_salary',
    'bonus_payments:create', 'bonus_payments:approve', 'bonus_payments:reject', 'bonus_payments:view_reports',
    'p45_p60:generate', 'p45_p60:view', 'p45_p60:distribute',
    'time_entries:export', 'time_entries:lock', 'time_entries:unlock',
    'nmw_compliance:check', 'nmw_compliance:view_alerts', 'nmw_compliance:resolve'
]);

-- -----------------------------------------------------------------------------
-- Recruitment Admin
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('recruitment_admin', ARRAY[
    'job_postings:create', 'job_postings:read', 'job_postings:update',
    'job_postings:publish', 'job_postings:unpublish', 'job_postings:close',
    'candidates:create', 'candidates:update', 'candidates:reject',
    'candidates:shortlist', 'candidates:view_sensitive',
    'interviews:schedule', 'interviews:conduct', 'interviews:score', 'interviews:view_feedback',
    'offers:create', 'offers:approve', 'offers:send', 'offers:withdraw', 'offers:negotiate',
    'assessments:create', 'assessments:assign', 'assessments:score', 'assessments:view_results',
    'dbs_checks:request', 'dbs_checks:view', 'dbs_checks:update_status', 'dbs_checks:view_sensitive',
    'reference_checks:request', 'reference_checks:view', 'reference_checks:complete', 'reference_checks:verify',
    'agencies:create', 'agencies:read', 'agencies:update', 'agencies:manage_terms', 'agencies:view_fees'
]);

-- -----------------------------------------------------------------------------
-- LMS Admin
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('lms_admin', ARRAY[
    'courses:create', 'courses:update', 'courses:delete', 'courses:publish',
    'courses:assign', 'courses:bulk_assign',
    'learning_paths:create', 'learning_paths:read', 'learning_paths:update', 'learning_paths:assign',
    'certifications:issue', 'certifications:revoke', 'certifications:verify', 'certifications:view_expiring',
    'course_ratings:view', 'course_ratings:moderate',
    'mandatory_training:configure', 'mandatory_training:assign',
    'mandatory_training:track_compliance', 'mandatory_training:escalate',
    'training_budgets:view', 'training_budgets:view_reports'
]);

-- -----------------------------------------------------------------------------
-- Compliance Officer
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('compliance_officer', ARRAY[
    'dsar:view', 'dsar:process', 'dsar:extend', 'dsar:complete', 'dsar:export',
    'data_breach:investigate', 'data_breach:notify', 'data_breach:close', 'data_breach:view_all',
    'consent:manage', 'consent:view_audit', 'consent:configure_purposes',
    'data_erasure:request', 'data_erasure:approve', 'data_erasure:execute',
    'data_erasure:verify', 'data_erasure:view_log',
    'data_retention:configure', 'data_retention:view_policies', 'data_retention:audit', 'data_retention:execute_purge',
    'privacy_notices:create', 'privacy_notices:update', 'privacy_notices:publish', 'privacy_notices:view_acceptance',
    'gender_pay_gap:generate', 'gender_pay_gap:view', 'gender_pay_gap:submit', 'gender_pay_gap:export',
    'diversity_monitoring:configure', 'diversity_monitoring:view_reports', 'diversity_monitoring:export',
    'nmw_compliance:check', 'nmw_compliance:export',
    'audit_log:view', 'audit_log:export',
    'employees:view_disciplinary',
    'right_to_work:read', 'right_to_work:verify',
    'cases:view_sensitive',
    'disciplinary:view', 'disciplinary:view_acas',
    'warnings:read', 'warnings:view_history'
]);

-- -----------------------------------------------------------------------------
-- Health & Safety Officer
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('health_safety_officer', ARRAY[
    'incidents:report', 'incidents:view', 'incidents:investigate', 'incidents:close', 'incidents:view_reports',
    'risk_assessments:create', 'risk_assessments:view', 'risk_assessments:update',
    'risk_assessments:approve', 'risk_assessments:review',
    'dse_assessments:view', 'dse_assessments:action', 'dse_assessments:review',
    'employees:view_medical'
]);

-- -----------------------------------------------------------------------------
-- Department Head
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('department_head', ARRAY[
    'employees:read',
    'time_entries:approve', 'time_entries:bulk_approve',
    'timesheets:view_team', 'timesheets:approve',
    'leave_requests:view_team', 'leave_requests:approve', 'leave_requests:reject',
    'leave_balances:view_team',
    'performance_reviews:approve', 'performance_reviews:calibrate',
    'goals:cascade', 'goals:read', 'goals:create_for_team',
    'headcount:view_plans',
    'training_budgets:allocate', 'training_budgets:approve_spend',
    'succession:nominate', 'succession:view_plans',
    'offers:approve',
    'reports:view_standard', 'reports:view_custom',
    'analytics:view_workforce', 'analytics:view_absence', 'analytics:view_turnover',
    'overtime:approve',
    'schedules:create', 'schedules:assign', 'schedules:publish'
]);

-- -----------------------------------------------------------------------------
-- Line Manager
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('line_manager', ARRAY[
    'employees:read',
    'time_entries:approve',
    'timesheets:view_team', 'timesheets:approve', 'timesheets:reject',
    'leave_requests:view_team', 'leave_requests:approve', 'leave_requests:reject',
    'leave_balances:view_team',
    'schedules:create', 'schedules:assign', 'schedules:publish',
    'overtime:approve',
    'performance_reviews:create', 'performance_reviews:read',
    'performance_reviews:update', 'performance_reviews:submit',
    'goals:create_for_team', 'goals:read', 'goals:update',
    'competencies:assess', 'competencies:view_matrix',
    'warnings:create', 'warnings:read',
    'probation:read', 'probation:complete',
    'disciplinary:initiate', 'disciplinary:view',
    'equipment:assign', 'equipment:view',
    'courses:assign',
    'onboarding_instances:view',
    'onboarding_checklists:sign_off',
    'delegations:create', 'delegations:view',
    'reports:view_standard'
]);

-- -----------------------------------------------------------------------------
-- Team Leader
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('team_leader', ARRAY[
    'employees:read',
    'timesheets:view_team',
    'leave_requests:view_team',
    'leave_balances:view_team',
    'goals:read',
    'reports:view_standard'
]);

-- -----------------------------------------------------------------------------
-- Contractor
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('contractor', ARRAY[
    'timesheets:view_own', 'timesheets:submit',
    'time_entries:create', 'time_entries:read', 'time_entries:update',
    'documents:read'
]);

-- -----------------------------------------------------------------------------
-- Temp Worker
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('temp_worker', ARRAY[
    'timesheets:view_own', 'timesheets:submit',
    'time_entries:create', 'time_entries:read'
]);

-- -----------------------------------------------------------------------------
-- Intern
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('intern', ARRAY[
    'time_entries:create', 'time_entries:read',
    'timesheets:view_own', 'timesheets:submit',
    'leave_requests:create_own', 'leave_requests:view_own',
    'leave_balances:view_own',
    'courses:read',
    'learning_paths:read',
    'documents:read'
]);

-- -----------------------------------------------------------------------------
-- External Auditor
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('external_auditor', ARRAY[
    'audit_log:view', 'audit_log:export',
    'reports:view_standard',
    'analytics:view_workforce', 'analytics:view_headcount',
    'data_retention:view_policies', 'data_retention:audit',
    'gender_pay_gap:view',
    'diversity_monitoring:view_reports'
]);

-- -----------------------------------------------------------------------------
-- Board Member
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('board_member', ARRAY[
    'succession:view_plans',
    'headcount:view_plans',
    'analytics:view_workforce', 'analytics:view_headcount',
    'analytics:view_turnover', 'analytics:view_compensation', 'analytics:view_diversity',
    'reports:view_standard',
    'gender_pay_gap:view'
]);

-- -----------------------------------------------------------------------------
-- Also seed self-service permissions for the base 'employee' role
-- (ensuring existing employees get the new granular permissions)
-- -----------------------------------------------------------------------------
SELECT app._seed_role_perms('employee', ARRAY[
    'leave_requests:create_own', 'leave_requests:view_own', 'leave_requests:cancel',
    'leave_balances:view_own',
    'timesheets:view_own', 'timesheets:submit', 'timesheets:recall',
    'time_entries:create', 'time_entries:read', 'time_entries:update',
    'payslips:view_own',
    'documents:read', 'documents:upload',
    'courses:read',
    'learning_paths:read',
    'goals:create_own', 'goals:read', 'goals:update',
    'cpd:create', 'cpd:read',
    'onboarding_checklists:view_own', 'onboarding_checklists:update_progress',
    'benefit_plans:read',
    'enrollments:enrol_self',
    'life_events:submit', 'life_events:view',
    'emergency_contacts:read', 'emergency_contacts:write',
    'incidents:report',
    'dse_assessments:submit',
    'grievances:submit',
    'dsar:submit',
    'data_breach:report',
    'overtime:request',
    'delegations:create', 'delegations:view'
]);

-- Drop the helper function (it was only needed for seeding)
DROP FUNCTION IF EXISTS app._seed_role_perms(varchar, text[]);

SELECT app.disable_system_context();

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- To rollback, delete role_permissions for the expanded roles:
-- DELETE FROM app.role_permissions WHERE role_id IN (
--   SELECT id FROM app.roles WHERE name IN (
--     'hr_officer', 'payroll_admin', 'recruitment_admin', 'lms_admin',
--     'compliance_officer', 'health_safety_officer', 'department_head',
--     'line_manager', 'team_leader', 'contractor', 'temp_worker',
--     'intern', 'external_auditor', 'board_member'
--   )
-- );
