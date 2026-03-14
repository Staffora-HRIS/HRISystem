-- Migration: 0177_expanded_permissions_catalog
-- Created: 2026-03-14
-- Description: Expand the permissions catalog from ~60 to ~350+ permissions
--              covering all HRIS modules. Backwards-compatible: existing
--              permission keys are preserved via ON CONFLICT DO UPDATE.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Core HR Permissions (expanded from employees/org/positions/contracts)
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    -- Employees (expanded)
    ('employees', 'create', 'Create new employee records', 'core_hr', false),
    ('employees', 'archive', 'Archive terminated employee records', 'core_hr', false),
    ('employees', 'restore', 'Restore archived employee records', 'core_hr', true),
    ('employees', 'export', 'Export employee data', 'core_hr', true),
    ('employees', 'import', 'Bulk import employees', 'core_hr', true),
    ('employees', 'bulk_update', 'Bulk update employee fields', 'core_hr', true),
    ('employees', 'view_sensitive', 'View Tier 2+ fields (salary, performance)', 'core_hr', true),
    ('employees', 'edit_sensitive', 'Edit Tier 2+ fields', 'core_hr', true),
    ('employees', 'view_salary', 'View salary/compensation data', 'core_hr', true),
    ('employees', 'edit_salary', 'Edit salary/compensation data', 'core_hr', true),
    ('employees', 'view_disciplinary', 'View disciplinary records', 'core_hr', false),
    ('employees', 'view_medical', 'View medical/health records', 'core_hr', true),
    ('employees', 'manage_photos', 'Upload/change employee photos', 'core_hr', false),

    -- Positions (expanded)
    ('positions', 'assign', 'Assign employee to position', 'core_hr', false),
    ('positions', 'unassign', 'Remove employee from position', 'core_hr', false),
    ('positions', 'bulk_manage', 'Bulk position operations', 'core_hr', true),
    ('positions', 'delete', 'Delete vacant positions', 'core_hr', false),
    ('positions', 'create', 'Create position definitions', 'core_hr', false),
    ('positions', 'update', 'Update position definitions', 'core_hr', false),

    -- Departments (expanded)
    ('departments', 'create', 'Create departments/org units', 'core_hr', false),
    ('departments', 'read', 'View department structure', 'core_hr', false),
    ('departments', 'update', 'Update department details', 'core_hr', false),
    ('departments', 'delete', 'Delete empty departments', 'core_hr', true),
    ('departments', 'restructure', 'Restructure department hierarchy', 'core_hr', true),

    -- Org Structure
    ('org_structure', 'view', 'View organisation chart', 'core_hr', false),
    ('org_structure', 'edit', 'Edit org chart relationships', 'core_hr', false),
    ('org_structure', 'restructure', 'Major restructuring operations', 'core_hr', true),
    ('org_structure', 'export', 'Export org chart data', 'core_hr', false),

    -- Contracts (expanded)
    ('contracts', 'create', 'Create employment contracts', 'core_hr', false),
    ('contracts', 'terminate', 'Terminate a contract', 'core_hr', true),
    ('contracts', 'renew', 'Renew a contract', 'core_hr', false),
    ('contracts', 'amend', 'Amend contract terms', 'core_hr', true),
    ('contracts', 'view_terms', 'View detailed contract terms', 'core_hr', false),

    -- Emergency Contacts
    ('emergency_contacts', 'read', 'View emergency contacts', 'core_hr', false),
    ('emergency_contacts', 'write', 'Edit emergency contacts', 'core_hr', false),
    ('emergency_contacts', 'manage_for_team', 'Edit team emergency contacts', 'core_hr', false),

    -- Bank Details
    ('bank_details', 'read', 'View bank details', 'core_hr', true),
    ('bank_details', 'write', 'Edit bank details', 'core_hr', true),
    ('bank_details', 'approve_changes', 'Approve bank detail changes', 'core_hr', true),

    -- Probation
    ('probation', 'create', 'Create probation periods', 'core_hr', false),
    ('probation', 'read', 'View probation status', 'core_hr', false),
    ('probation', 'update', 'Update probation details', 'core_hr', false),
    ('probation', 'extend', 'Extend probation period', 'core_hr', false),
    ('probation', 'complete', 'Mark probation as complete', 'core_hr', false),
    ('probation', 'fail', 'Fail probation', 'core_hr', true),

    -- Right to Work
    ('right_to_work', 'create', 'Create RTW records', 'core_hr', false),
    ('right_to_work', 'read', 'View RTW documents', 'core_hr', true),
    ('right_to_work', 'update', 'Update RTW records', 'core_hr', false),
    ('right_to_work', 'verify', 'Verify RTW status', 'core_hr', false),
    ('right_to_work', 'expire_alerts', 'Configure RTW expiry alerts', 'core_hr', false),

    -- Warnings
    ('warnings', 'create', 'Issue formal warnings', 'core_hr', false),
    ('warnings', 'read', 'View warning records', 'core_hr', false),
    ('warnings', 'update', 'Update warning details', 'core_hr', false),
    ('warnings', 'escalate', 'Escalate warning level', 'core_hr', false),
    ('warnings', 'expire', 'Mark warning as expired', 'core_hr', false),
    ('warnings', 'view_history', 'View full warning history', 'core_hr', false)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Time & Attendance Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('time_entries', 'create', 'Create time entries', 'time_attendance', false),
    ('time_entries', 'read', 'View time entries', 'time_attendance', false),
    ('time_entries', 'update', 'Update time entries', 'time_attendance', false),
    ('time_entries', 'delete', 'Delete time entries', 'time_attendance', false),
    ('time_entries', 'approve', 'Approve time entries', 'time_attendance', false),
    ('time_entries', 'reject', 'Reject time entries', 'time_attendance', false),
    ('time_entries', 'lock', 'Lock time period', 'time_attendance', true),
    ('time_entries', 'unlock', 'Unlock time period', 'time_attendance', true),
    ('time_entries', 'bulk_approve', 'Bulk approve time entries', 'time_attendance', false),
    ('time_entries', 'export', 'Export time data', 'time_attendance', false),
    ('timesheets', 'view_own', 'View own timesheets', 'time_attendance', false),
    ('timesheets', 'view_team', 'View team timesheets', 'time_attendance', false),
    ('timesheets', 'view_all', 'View all timesheets', 'time_attendance', false),
    ('timesheets', 'approve', 'Approve timesheets', 'time_attendance', false),
    ('timesheets', 'reject', 'Reject timesheets', 'time_attendance', false),
    ('timesheets', 'submit', 'Submit own timesheet', 'time_attendance', false),
    ('timesheets', 'recall', 'Recall submitted timesheet', 'time_attendance', false),
    ('schedules', 'create', 'Create work schedules', 'time_attendance', false),
    ('schedules', 'assign', 'Assign schedule to employees', 'time_attendance', false),
    ('schedules', 'publish', 'Publish draft schedules', 'time_attendance', false),
    ('schedules', 'unpublish', 'Unpublish schedules', 'time_attendance', false),
    ('schedules', 'delete', 'Delete schedules', 'time_attendance', false),
    ('overtime', 'request', 'Request overtime', 'time_attendance', false),
    ('overtime', 'approve', 'Approve overtime requests', 'time_attendance', false),
    ('overtime', 'reject', 'Reject overtime requests', 'time_attendance', false),
    ('overtime', 'view_reports', 'View overtime reports', 'time_attendance', false),
    ('geofence', 'configure', 'Configure geofencing rules', 'time_attendance', true),
    ('geofence', 'view_violations', 'View geofence violations', 'time_attendance', false),
    ('geofence', 'manage_locations', 'Manage geofence locations', 'time_attendance', false)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Absence & Leave Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('leave_requests', 'create_own', 'Submit own leave request', 'absence', false),
    ('leave_requests', 'view_own', 'View own leave requests', 'absence', false),
    ('leave_requests', 'view_team', 'View team leave requests', 'absence', false),
    ('leave_requests', 'view_all', 'View all leave requests', 'absence', false),
    ('leave_requests', 'approve', 'Approve leave requests', 'absence', false),
    ('leave_requests', 'reject', 'Reject leave requests', 'absence', false),
    ('leave_requests', 'cancel', 'Cancel own pending request', 'absence', false),
    ('leave_requests', 'force_cancel', 'Force cancel any leave request', 'absence', false),
    ('leave_requests', 'override_balance', 'Override leave balance check', 'absence', true),
    ('leave_types', 'create', 'Create leave types', 'absence', false),
    ('leave_types', 'read', 'View leave types', 'absence', false),
    ('leave_types', 'update', 'Update leave types', 'absence', false),
    ('leave_types', 'delete', 'Delete leave types', 'absence', true),
    ('leave_types', 'configure_accrual', 'Configure accrual rules', 'absence', false),
    ('leave_balances', 'view_own', 'View own leave balances', 'absence', false),
    ('leave_balances', 'view_team', 'View team leave balances', 'absence', false),
    ('leave_balances', 'view_all', 'View all leave balances', 'absence', false),
    ('leave_balances', 'adjust', 'Manually adjust balances', 'absence', true),
    ('leave_balances', 'carry_forward', 'Process carry-forward', 'absence', false),
    ('ssp', 'create', 'Create SSP records', 'absence', false),
    ('ssp', 'read', 'View SSP records', 'absence', false),
    ('ssp', 'update', 'Update SSP records', 'absence', false),
    ('ssp', 'calculate', 'Calculate SSP entitlements', 'absence', false),
    ('ssp', 'manage_fit_notes', 'Manage fit notes', 'absence', false),
    ('parental_leave', 'request', 'Request parental leave', 'absence', false),
    ('parental_leave', 'approve', 'Approve parental leave', 'absence', false),
    ('parental_leave', 'configure', 'Configure parental leave policies', 'absence', false),
    ('parental_leave', 'view_reports', 'View parental leave reports', 'absence', false),
    ('bereavement', 'request', 'Request bereavement leave', 'absence', false),
    ('bereavement', 'approve', 'Approve bereavement leave', 'absence', false),
    ('bereavement', 'configure', 'Configure bereavement policies', 'absence', false),
    ('carers_leave', 'request', 'Request carers leave', 'absence', false),
    ('carers_leave', 'approve', 'Approve carers leave', 'absence', false),
    ('carers_leave', 'configure', 'Configure carers leave policies', 'absence', false)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Payroll Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('payroll_runs', 'create', 'Create payroll run', 'payroll', true),
    ('payroll_runs', 'read', 'View payroll runs', 'payroll', true),
    ('payroll_runs', 'approve', 'Approve payroll run', 'payroll', true),
    ('payroll_runs', 'reject', 'Reject payroll run', 'payroll', true),
    ('payroll_runs', 'lock', 'Lock payroll run', 'payroll', true),
    ('payroll_runs', 'export', 'Export payroll data', 'payroll', true),
    ('payroll_runs', 'reopen', 'Reopen locked payroll run', 'payroll', true),
    ('pay_elements', 'create', 'Create pay elements', 'payroll', false),
    ('pay_elements', 'read', 'View pay elements', 'payroll', false),
    ('pay_elements', 'update', 'Update pay elements', 'payroll', false),
    ('pay_elements', 'delete', 'Delete pay elements', 'payroll', true),
    ('deductions', 'create', 'Create deductions', 'payroll', false),
    ('deductions', 'read', 'View deductions', 'payroll', false),
    ('deductions', 'update', 'Update deductions', 'payroll', false),
    ('deductions', 'delete', 'Delete deductions', 'payroll', true),
    ('deductions', 'approve', 'Approve deduction changes', 'payroll', true),
    ('tax_codes', 'view', 'View tax codes', 'payroll', false),
    ('tax_codes', 'update', 'Update tax codes', 'payroll', true),
    ('tax_codes', 'import', 'Import HMRC tax codes', 'payroll', true),
    ('tax_codes', 'verify', 'Verify tax code accuracy', 'payroll', false),
    ('pension', 'configure', 'Configure pension schemes', 'payroll', true),
    ('pension', 'view', 'View pension details', 'payroll', false),
    ('pension', 'auto_enrol', 'Run auto-enrolment assessment', 'payroll', true),
    ('pension', 'opt_out', 'Process pension opt-outs', 'payroll', false),
    ('pension', 'assess', 'Assess pension eligibility', 'payroll', false),
    ('payslips', 'generate', 'Generate payslips', 'payroll', true),
    ('payslips', 'view_own', 'View own payslips', 'payroll', false),
    ('payslips', 'view_all', 'View all payslips', 'payroll', true),
    ('payslips', 'distribute', 'Distribute payslips', 'payroll', false),
    ('payslips', 'reissue', 'Reissue payslips', 'payroll', false),
    ('bonus_payments', 'create', 'Create bonus payments', 'payroll', true),
    ('bonus_payments', 'approve', 'Approve bonus payments', 'payroll', true),
    ('bonus_payments', 'reject', 'Reject bonus payments', 'payroll', true),
    ('bonus_payments', 'view_reports', 'View bonus reports', 'payroll', true),
    ('p45_p60', 'generate', 'Generate P45/P60 documents', 'payroll', true),
    ('p45_p60', 'view', 'View P45/P60 documents', 'payroll', false),
    ('p45_p60', 'distribute', 'Distribute P45/P60 documents', 'payroll', false)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Talent Management Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('performance_reviews', 'create', 'Create performance reviews', 'talent', false),
    ('performance_reviews', 'read', 'View performance reviews', 'talent', false),
    ('performance_reviews', 'update', 'Update performance reviews', 'talent', false),
    ('performance_reviews', 'submit', 'Submit completed review', 'talent', false),
    ('performance_reviews', 'approve', 'Approve/finalise reviews', 'talent', false),
    ('performance_reviews', 'calibrate', 'Calibrate ratings across teams', 'talent', true),
    ('performance_reviews', 'view_ratings', 'View calibrated ratings', 'talent', false),
    ('performance_reviews', 'override_rating', 'Override final rating', 'talent', true),
    ('goals', 'create_own', 'Create own goals', 'talent', false),
    ('goals', 'create_for_team', 'Create goals for team', 'talent', false),
    ('goals', 'read', 'View goals', 'talent', false),
    ('goals', 'update', 'Update goals', 'talent', false),
    ('goals', 'cascade', 'Cascade goals down hierarchy', 'talent', false),
    ('goals', 'align', 'Align goals to org objectives', 'talent', false),
    ('competencies', 'define', 'Define competency frameworks', 'talent', false),
    ('competencies', 'assess', 'Assess competencies', 'talent', false),
    ('competencies', 'view_matrix', 'View competency matrix', 'talent', false),
    ('competencies', 'manage_frameworks', 'Manage frameworks', 'talent', false),
    ('succession', 'view_plans', 'View succession plans', 'talent', true),
    ('succession', 'create_plans', 'Create succession plans', 'talent', true),
    ('succession', 'nominate', 'Nominate successors', 'talent', false),
    ('succession', 'assess_readiness', 'Assess successor readiness', 'talent', false),
    ('training_budgets', 'allocate', 'Allocate training budgets', 'talent', false),
    ('training_budgets', 'view', 'View training budgets', 'talent', false),
    ('training_budgets', 'approve_spend', 'Approve training spend', 'talent', false),
    ('training_budgets', 'view_reports', 'View budget reports', 'talent', false),
    ('cpd', 'create', 'Create CPD records', 'talent', false),
    ('cpd', 'read', 'View CPD records', 'talent', false),
    ('cpd', 'approve', 'Approve CPD submissions', 'talent', false),
    ('cpd', 'view_reports', 'View CPD reports', 'talent', false)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Recruitment Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('job_postings', 'create', 'Create job postings', 'recruitment', false),
    ('job_postings', 'read', 'View job postings', 'recruitment', false),
    ('job_postings', 'update', 'Update job postings', 'recruitment', false),
    ('job_postings', 'publish', 'Publish job postings', 'recruitment', false),
    ('job_postings', 'unpublish', 'Unpublish job postings', 'recruitment', false),
    ('job_postings', 'close', 'Close job postings', 'recruitment', false),
    ('candidates', 'create', 'Add candidates', 'recruitment', false),
    ('candidates', 'update', 'Update candidate details', 'recruitment', false),
    ('candidates', 'reject', 'Reject candidates', 'recruitment', false),
    ('candidates', 'shortlist', 'Shortlist candidates', 'recruitment', false),
    ('candidates', 'view_sensitive', 'View sensitive candidate data', 'recruitment', true),
    ('interviews', 'schedule', 'Schedule interviews', 'recruitment', false),
    ('interviews', 'conduct', 'Record interview conducted', 'recruitment', false),
    ('interviews', 'score', 'Score interviews', 'recruitment', false),
    ('interviews', 'view_feedback', 'View all interview feedback', 'recruitment', false),
    ('offers', 'create', 'Create job offers', 'recruitment', false),
    ('offers', 'approve', 'Approve job offers', 'recruitment', true),
    ('offers', 'send', 'Send offers to candidates', 'recruitment', false),
    ('offers', 'withdraw', 'Withdraw offers', 'recruitment', true),
    ('offers', 'negotiate', 'Negotiate offer terms', 'recruitment', false),
    ('assessments', 'create', 'Create assessments', 'recruitment', false),
    ('assessments', 'assign', 'Assign assessments', 'recruitment', false),
    ('assessments', 'score', 'Score assessments', 'recruitment', false),
    ('assessments', 'view_results', 'View assessment results', 'recruitment', false),
    ('dbs_checks', 'request', 'Request DBS checks', 'recruitment', false),
    ('dbs_checks', 'view', 'View DBS check status', 'recruitment', false),
    ('dbs_checks', 'update_status', 'Update DBS check status', 'recruitment', false),
    ('dbs_checks', 'view_sensitive', 'View DBS results detail', 'recruitment', true),
    ('reference_checks', 'request', 'Request references', 'recruitment', false),
    ('reference_checks', 'view', 'View references', 'recruitment', false),
    ('reference_checks', 'complete', 'Complete reference check', 'recruitment', false),
    ('reference_checks', 'verify', 'Verify reference authenticity', 'recruitment', false),
    ('agencies', 'create', 'Add recruitment agencies', 'recruitment', false),
    ('agencies', 'read', 'View agency details', 'recruitment', false),
    ('agencies', 'update', 'Update agency details', 'recruitment', false),
    ('agencies', 'manage_terms', 'Manage agency terms/rates', 'recruitment', true),
    ('agencies', 'view_fees', 'View agency fees', 'recruitment', false)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- LMS Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('courses', 'create', 'Create courses', 'lms', false),
    ('courses', 'update', 'Update courses', 'lms', false),
    ('courses', 'delete', 'Delete courses', 'lms', true),
    ('courses', 'publish', 'Publish courses', 'lms', false),
    ('courses', 'assign', 'Assign courses to individuals', 'lms', false),
    ('courses', 'bulk_assign', 'Bulk assign courses', 'lms', false),
    ('learning_paths', 'create', 'Create learning paths', 'lms', false),
    ('learning_paths', 'read', 'View learning paths', 'lms', false),
    ('learning_paths', 'update', 'Update learning paths', 'lms', false),
    ('learning_paths', 'assign', 'Assign learning paths', 'lms', false),
    ('certifications', 'issue', 'Issue certifications', 'lms', false),
    ('certifications', 'revoke', 'Revoke certifications', 'lms', true),
    ('certifications', 'verify', 'Verify certifications', 'lms', false),
    ('certifications', 'view_expiring', 'View expiring certs', 'lms', false),
    ('course_ratings', 'submit', 'Submit course ratings', 'lms', false),
    ('course_ratings', 'view', 'View course ratings', 'lms', false),
    ('course_ratings', 'moderate', 'Moderate course ratings', 'lms', false),
    ('mandatory_training', 'configure', 'Configure mandatory training', 'lms', false),
    ('mandatory_training', 'assign', 'Assign mandatory training', 'lms', false),
    ('mandatory_training', 'track_compliance', 'Track compliance status', 'lms', false),
    ('mandatory_training', 'escalate', 'Escalate non-compliance', 'lms', false)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Cases & Disciplinary Permissions (expanded)
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('cases', 'create', 'Create HR cases', 'cases', false),
    ('cases', 'update', 'Update case details', 'cases', false),
    ('cases', 'close', 'Close cases', 'cases', false),
    ('cases', 'reopen', 'Reopen closed cases', 'cases', true),
    ('cases', 'escalate', 'Escalate cases', 'cases', false),
    ('cases', 'assign', 'Assign cases to handlers', 'cases', false),
    ('cases', 'view_all', 'View all cases in tenant', 'cases', false),
    ('cases', 'view_sensitive', 'View sensitive case details', 'cases', true),
    ('cases', 'add_notes', 'Add case notes', 'cases', false),
    ('cases', 'manage_documents', 'Manage case documents', 'cases', false),
    ('disciplinary', 'initiate', 'Initiate disciplinary process', 'cases', false),
    ('disciplinary', 'view', 'View disciplinary records', 'cases', false),
    ('disciplinary', 'update', 'Update disciplinary details', 'cases', false),
    ('disciplinary', 'escalate', 'Escalate disciplinary action', 'cases', false),
    ('disciplinary', 'close', 'Close disciplinary case', 'cases', false),
    ('disciplinary', 'appeal', 'Process appeal', 'cases', false),
    ('disciplinary', 'view_acas', 'View ACAS guidance/records', 'cases', false),
    ('grievances', 'submit', 'Submit grievance', 'cases', false),
    ('grievances', 'view', 'View grievances', 'cases', false),
    ('grievances', 'investigate', 'Investigate grievances', 'cases', false),
    ('grievances', 'resolve', 'Resolve grievances', 'cases', false),
    ('grievances', 'appeal', 'Process grievance appeals', 'cases', false)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Onboarding Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('onboarding_templates', 'create', 'Create onboarding templates', 'onboarding', false),
    ('onboarding_templates', 'read', 'View templates', 'onboarding', false),
    ('onboarding_templates', 'update', 'Update templates', 'onboarding', false),
    ('onboarding_templates', 'delete', 'Delete templates', 'onboarding', true),
    ('onboarding_templates', 'publish', 'Publish templates', 'onboarding', false),
    ('onboarding_templates', 'clone', 'Clone templates', 'onboarding', false),
    ('onboarding_instances', 'create', 'Create onboarding instance', 'onboarding', false),
    ('onboarding_instances', 'view', 'View onboarding progress', 'onboarding', false),
    ('onboarding_instances', 'manage', 'Manage onboarding tasks', 'onboarding', false),
    ('onboarding_instances', 'complete_task', 'Complete a task', 'onboarding', false),
    ('onboarding_instances', 'reassign', 'Reassign tasks', 'onboarding', false),
    ('onboarding_checklists', 'view_own', 'View own checklist', 'onboarding', false),
    ('onboarding_checklists', 'view_all', 'View all checklists', 'onboarding', false),
    ('onboarding_checklists', 'update_progress', 'Update progress', 'onboarding', false),
    ('onboarding_checklists', 'sign_off', 'Sign off completed onboarding', 'onboarding', false)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Documents Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('documents', 'upload', 'Upload documents', 'documents', false),
    ('documents', 'read', 'View documents', 'documents', false),
    ('documents', 'update', 'Update document metadata', 'documents', false),
    ('documents', 'delete', 'Delete documents', 'documents', true),
    ('documents', 'share', 'Share documents with others', 'documents', false),
    ('documents', 'version', 'Create new document versions', 'documents', false),
    ('documents', 'archive', 'Archive documents', 'documents', false),
    ('document_templates', 'create', 'Create document templates', 'documents', false),
    ('document_templates', 'read', 'View document templates', 'documents', false),
    ('document_templates', 'update', 'Update templates', 'documents', false),
    ('document_templates', 'delete', 'Delete templates', 'documents', true),
    ('document_templates', 'merge', 'Merge data into templates', 'documents', false),
    ('document_templates', 'generate', 'Generate documents from templates', 'documents', false),
    ('contracts_docs', 'generate', 'Generate contract documents', 'documents', false),
    ('contracts_docs', 'sign', 'Sign contract (employee)', 'documents', false),
    ('contracts_docs', 'countersign', 'Countersign contract (employer)', 'documents', false),
    ('contracts_docs', 'view', 'View contract documents', 'documents', false),
    ('contracts_docs', 'archive', 'Archive contract documents', 'documents', false),
    ('letters', 'generate', 'Generate letters', 'documents', false),
    ('letters', 'approve', 'Approve letters', 'documents', false),
    ('letters', 'send', 'Send letters', 'documents', false),
    ('letters', 'view_templates', 'View letter templates', 'documents', false)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Benefits Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('benefit_plans', 'create', 'Create benefit plans', 'benefits', false),
    ('benefit_plans', 'read', 'View benefit plans', 'benefits', false),
    ('benefit_plans', 'update', 'Update benefit plans', 'benefits', false),
    ('benefit_plans', 'delete', 'Delete benefit plans', 'benefits', true),
    ('benefit_plans', 'publish', 'Publish benefit plans', 'benefits', false),
    ('enrollments', 'enrol_self', 'Self-enrol in benefits', 'benefits', false),
    ('enrollments', 'enrol_team', 'Enrol team members', 'benefits', false),
    ('enrollments', 'approve', 'Approve benefit enrolments', 'benefits', false),
    ('enrollments', 'reject', 'Reject benefit enrolments', 'benefits', false),
    ('enrollments', 'view_all', 'View all enrolments', 'benefits', false),
    ('life_events', 'submit', 'Submit life event', 'benefits', false),
    ('life_events', 'approve', 'Approve life event', 'benefits', false),
    ('life_events', 'process', 'Process life event changes', 'benefits', false),
    ('life_events', 'view', 'View life events', 'benefits', false)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Compliance & Data Protection Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('dsar', 'submit', 'Submit data subject access request', 'compliance', false),
    ('dsar', 'view', 'View DSARs', 'compliance', false),
    ('dsar', 'process', 'Process DSARs', 'compliance', true),
    ('dsar', 'extend', 'Extend DSAR deadline', 'compliance', true),
    ('dsar', 'complete', 'Mark DSAR complete', 'compliance', true),
    ('dsar', 'export', 'Export DSAR data', 'compliance', true),
    ('data_breach', 'report', 'Report data breach', 'compliance', false),
    ('data_breach', 'investigate', 'Investigate breach', 'compliance', true),
    ('data_breach', 'notify', 'Notify ICO/data subjects', 'compliance', true),
    ('data_breach', 'close', 'Close breach record', 'compliance', true),
    ('data_breach', 'view_all', 'View all breaches', 'compliance', true),
    ('consent', 'manage', 'Manage consent records', 'compliance', false),
    ('consent', 'view_audit', 'View consent audit trail', 'compliance', false),
    ('consent', 'configure_purposes', 'Configure consent purposes', 'compliance', false),
    ('data_erasure', 'request', 'Request data erasure', 'compliance', false),
    ('data_erasure', 'approve', 'Approve erasure request', 'compliance', true),
    ('data_erasure', 'execute', 'Execute data erasure', 'compliance', true),
    ('data_erasure', 'verify', 'Verify erasure completed', 'compliance', true),
    ('data_erasure', 'view_log', 'View erasure log', 'compliance', false),
    ('data_retention', 'configure', 'Configure retention policies', 'compliance', true),
    ('data_retention', 'view_policies', 'View retention policies', 'compliance', false),
    ('data_retention', 'execute_purge', 'Execute data purge', 'compliance', true),
    ('data_retention', 'audit', 'Audit retention compliance', 'compliance', false),
    ('privacy_notices', 'create', 'Create privacy notices', 'compliance', false),
    ('privacy_notices', 'update', 'Update privacy notices', 'compliance', false),
    ('privacy_notices', 'publish', 'Publish privacy notices', 'compliance', false),
    ('privacy_notices', 'view_acceptance', 'View notice acceptance', 'compliance', false),
    ('gender_pay_gap', 'generate', 'Generate GPG report', 'compliance', true),
    ('gender_pay_gap', 'view', 'View GPG reports', 'compliance', false),
    ('gender_pay_gap', 'submit', 'Submit to gov.uk', 'compliance', true),
    ('gender_pay_gap', 'export', 'Export GPG data', 'compliance', true),
    ('diversity_monitoring', 'configure', 'Configure diversity fields', 'compliance', false),
    ('diversity_monitoring', 'view_reports', 'View diversity reports', 'compliance', false),
    ('diversity_monitoring', 'export', 'Export diversity data', 'compliance', true),
    ('nmw_compliance', 'check', 'Run NMW compliance check', 'compliance', false),
    ('nmw_compliance', 'view_alerts', 'View NMW alerts', 'compliance', false),
    ('nmw_compliance', 'resolve', 'Resolve NMW issues', 'compliance', false),
    ('nmw_compliance', 'export', 'Export NMW compliance data', 'compliance', true)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Workflows & Approvals Permissions (expanded)
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('workflows', 'activate', 'Activate workflows', 'workflows', false),
    ('workflows', 'deactivate', 'Deactivate workflows', 'workflows', false),
    ('workflows', 'delete', 'Delete workflow definitions', 'workflows', true),
    ('workflow_instances', 'view', 'View running instances', 'workflows', false),
    ('workflow_instances', 'approve', 'Approve workflow step', 'workflows', false),
    ('workflow_instances', 'reject', 'Reject workflow step', 'workflows', false),
    ('workflow_instances', 'escalate', 'Manually escalate', 'workflows', false),
    ('workflow_instances', 'reassign', 'Reassign approval step', 'workflows', false),
    ('approval_chains', 'configure', 'Configure approval chains', 'workflows', false),
    ('approval_chains', 'view', 'View approval chain config', 'workflows', false),
    ('approval_chains', 'override', 'Override approval chain', 'workflows', true)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Analytics & Reports Permissions (expanded)
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('reports', 'view_standard', 'View standard reports', 'reporting', false),
    ('reports', 'view_custom', 'View custom reports', 'reporting', false),
    ('reports', 'create_custom', 'Create custom reports', 'reporting', false),
    ('reports', 'schedule', 'Schedule report delivery', 'reporting', false),
    ('reports', 'share', 'Share reports with others', 'reporting', false),
    ('reports', 'delete_custom', 'Delete custom reports', 'reporting', false),
    ('dashboards', 'customise', 'Customise own dashboard', 'reporting', false),
    ('dashboards', 'create', 'Create shared dashboards', 'reporting', false),
    ('dashboards', 'share', 'Share dashboards', 'reporting', false),
    ('dashboards', 'manage_widgets', 'Manage dashboard widgets', 'reporting', false),
    ('analytics', 'view_workforce', 'View workforce analytics', 'reporting', false),
    ('analytics', 'view_absence', 'View absence analytics', 'reporting', false),
    ('analytics', 'view_turnover', 'View turnover analytics', 'reporting', false),
    ('analytics', 'view_headcount', 'View headcount analytics', 'reporting', false),
    ('analytics', 'view_compensation', 'View compensation analytics', 'reporting', true),
    ('analytics', 'view_diversity', 'View diversity analytics', 'reporting', false),
    ('analytics', 'export', 'Export analytics data', 'reporting', true)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Security Permissions (expanded)
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('users', 'create', 'Create user accounts', 'security', true),
    ('users', 'update', 'Update user accounts', 'security', true),
    ('users', 'deactivate', 'Deactivate user accounts', 'security', true),
    ('users', 'reset_password', 'Reset user passwords', 'security', true),
    ('users', 'unlock', 'Unlock locked accounts', 'security', true),
    ('users', 'manage_mfa', 'Manage MFA settings', 'security', true),
    ('users', 'impersonate', 'Impersonate another user', 'security', true),
    ('roles', 'assign', 'Assign roles to users', 'security', true),
    ('roles', 'unassign', 'Remove roles from users', 'security', true),
    ('roles', 'manage_permissions', 'Manage role permissions', 'security', true),
    ('audit_log', 'view', 'View audit logs', 'security', true),
    ('audit_log', 'export', 'Export audit logs', 'security', true),
    ('audit_log', 'configure_retention', 'Configure log retention', 'security', true),
    ('settings', 'manage_integrations', 'Manage integrations', 'security', true),
    ('delegations', 'create', 'Create approval delegations', 'security', false),
    ('delegations', 'revoke', 'Revoke delegations', 'security', false),
    ('delegations', 'view', 'View active delegations', 'security', false),
    ('delegations', 'manage_for_org', 'Manage org-wide delegations', 'security', false),
    ('field_permissions', 'view', 'View FLS configuration', 'security', false),
    ('field_permissions', 'configure', 'Configure FLS', 'security', true),
    ('field_permissions', 'manage_sensitive', 'Manage sensitive field access', 'security', true),
    ('portal_access', 'grant', 'Grant portal access', 'security', false),
    ('portal_access', 'revoke', 'Revoke portal access', 'security', false),
    ('portal_access', 'configure', 'Configure portal settings', 'security', false),
    ('api_keys', 'create', 'Create API keys', 'security', true),
    ('api_keys', 'view', 'View API keys', 'security', true),
    ('api_keys', 'revoke', 'Revoke API keys', 'security', true),
    ('api_keys', 'manage_scopes', 'Manage API key scopes', 'security', true)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Health & Safety Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('incidents', 'report', 'Report H&S incidents', 'health_safety', false),
    ('incidents', 'view', 'View incident records', 'health_safety', false),
    ('incidents', 'investigate', 'Investigate incidents', 'health_safety', false),
    ('incidents', 'close', 'Close incident records', 'health_safety', false),
    ('incidents', 'view_reports', 'View incident reports', 'health_safety', false),
    ('risk_assessments', 'create', 'Create risk assessments', 'health_safety', false),
    ('risk_assessments', 'view', 'View risk assessments', 'health_safety', false),
    ('risk_assessments', 'update', 'Update risk assessments', 'health_safety', false),
    ('risk_assessments', 'approve', 'Approve risk assessments', 'health_safety', false),
    ('risk_assessments', 'review', 'Review risk assessments', 'health_safety', false),
    ('dse_assessments', 'submit', 'Submit DSE self-assessment', 'health_safety', false),
    ('dse_assessments', 'view', 'View DSE assessments', 'health_safety', false),
    ('dse_assessments', 'action', 'Action DSE assessment items', 'health_safety', false),
    ('dse_assessments', 'review', 'Review DSE assessments', 'health_safety', false)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Equipment Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('equipment', 'assign', 'Assign equipment to employees', 'equipment', false),
    ('equipment', 'return', 'Process equipment returns', 'equipment', false),
    ('equipment', 'view', 'View equipment records', 'equipment', false),
    ('equipment', 'manage_inventory', 'Manage equipment inventory', 'equipment', false),
    ('equipment', 'write_off', 'Write off equipment', 'equipment', true)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- Headcount Planning Permissions
-- -----------------------------------------------------------------------------
INSERT INTO app.permissions (resource, action, description, module, requires_mfa) VALUES
    ('headcount', 'view_plans', 'View headcount plans', 'headcount', false),
    ('headcount', 'create_plans', 'Create headcount plans', 'headcount', false),
    ('headcount', 'approve', 'Approve headcount plans', 'headcount', true),
    ('headcount', 'forecast', 'Run headcount forecasts', 'headcount', false),
    ('headcount', 'lock', 'Lock approved plans', 'headcount', true)
ON CONFLICT (resource, action) DO UPDATE SET
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    requires_mfa = EXCLUDED.requires_mfa,
    updated_at = now();

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- No rollback needed; permissions are additive and ON CONFLICT handles idempotency.
-- Removing permissions would break existing role_permissions references.
