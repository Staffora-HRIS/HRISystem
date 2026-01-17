-- Migration: 0114_seed_field_registry
-- Created: 2026-01-17
-- Description: Seed the field registry with all system fields
--              These are global field definitions (tenant_id = NULL)

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enable system context for seeding
SELECT app.enable_system_context();

-- -----------------------------------------------------------------------------
-- Employee Entity Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    -- System fields
    (NULL, 'employee', 'id', 'Employee ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'employee', 'tenant_id', 'Tenant ID', 'System', 'uuid', false, true, 'hidden', 1),
    (NULL, 'employee', 'created_at', 'Created At', 'System', 'timestamp', false, true, 'view', 2),
    (NULL, 'employee', 'updated_at', 'Updated At', 'System', 'timestamp', false, true, 'view', 3),

    -- Core employee fields
    (NULL, 'employee', 'employee_number', 'Employee Number', 'Core', 'string', false, false, 'view', 10),
    (NULL, 'employee', 'status', 'Employment Status', 'Core', 'enum', false, false, 'view', 11),
    (NULL, 'employee', 'hire_date', 'Hire Date', 'Core', 'date', false, false, 'view', 12),
    (NULL, 'employee', 'termination_date', 'Termination Date', 'Core', 'date', false, false, 'view', 13),
    (NULL, 'employee', 'termination_reason', 'Termination Reason', 'Core', 'string', true, false, 'hidden', 14),

    -- Personal details
    (NULL, 'employee_personal', 'first_name', 'First Name', 'Personal', 'string', false, false, 'edit', 20),
    (NULL, 'employee_personal', 'middle_name', 'Middle Name', 'Personal', 'string', false, false, 'edit', 21),
    (NULL, 'employee_personal', 'last_name', 'Last Name', 'Personal', 'string', false, false, 'edit', 22),
    (NULL, 'employee_personal', 'preferred_name', 'Preferred Name', 'Personal', 'string', false, false, 'edit', 23),
    (NULL, 'employee_personal', 'date_of_birth', 'Date of Birth', 'Personal', 'date', true, false, 'view', 24),
    (NULL, 'employee_personal', 'gender', 'Gender', 'Personal', 'enum', true, false, 'view', 25),
    (NULL, 'employee_personal', 'nationality', 'Nationality', 'Personal', 'string', true, false, 'view', 26),
    (NULL, 'employee_personal', 'marital_status', 'Marital Status', 'Personal', 'enum', true, false, 'hidden', 27),
    (NULL, 'employee_personal', 'photo_url', 'Photo', 'Personal', 'file', false, false, 'view', 28)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group,
    data_type = EXCLUDED.data_type,
    is_sensitive = EXCLUDED.is_sensitive;

-- -----------------------------------------------------------------------------
-- Employee Contact Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'employee_contact', 'email', 'Work Email', 'Contact', 'email', false, false, 'view', 30),
    (NULL, 'employee_contact', 'personal_email', 'Personal Email', 'Contact', 'email', true, false, 'view', 31),
    (NULL, 'employee_contact', 'work_phone', 'Work Phone', 'Contact', 'phone', false, false, 'view', 32),
    (NULL, 'employee_contact', 'mobile_phone', 'Mobile Phone', 'Contact', 'phone', true, false, 'edit', 33),
    (NULL, 'employee_contact', 'home_phone', 'Home Phone', 'Contact', 'phone', true, false, 'hidden', 34)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Employee Address Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'employee_address', 'address_line1', 'Address Line 1', 'Address', 'string', true, false, 'view', 40),
    (NULL, 'employee_address', 'address_line2', 'Address Line 2', 'Address', 'string', true, false, 'view', 41),
    (NULL, 'employee_address', 'city', 'City', 'Address', 'string', true, false, 'view', 42),
    (NULL, 'employee_address', 'state', 'State/Province', 'Address', 'string', true, false, 'view', 43),
    (NULL, 'employee_address', 'postal_code', 'Postal Code', 'Address', 'string', true, false, 'view', 44),
    (NULL, 'employee_address', 'country', 'Country', 'Address', 'string', true, false, 'view', 45)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Employee Identifiers Fields (Highly Sensitive)
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'employee_identifier', 'national_insurance_number', 'National Insurance Number', 'Identifiers', 'string', true, false, 'hidden', 50),
    (NULL, 'employee_identifier', 'tax_id', 'Tax ID', 'Identifiers', 'string', true, false, 'hidden', 51),
    (NULL, 'employee_identifier', 'passport_number', 'Passport Number', 'Identifiers', 'string', true, false, 'hidden', 52),
    (NULL, 'employee_identifier', 'passport_expiry', 'Passport Expiry', 'Identifiers', 'date', true, false, 'hidden', 53),
    (NULL, 'employee_identifier', 'drivers_license', 'Drivers License', 'Identifiers', 'string', true, false, 'hidden', 54),
    (NULL, 'employee_identifier', 'work_permit_number', 'Work Permit Number', 'Identifiers', 'string', true, false, 'hidden', 55),
    (NULL, 'employee_identifier', 'work_permit_expiry', 'Work Permit Expiry', 'Identifiers', 'date', true, false, 'hidden', 56)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Emergency Contact Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'emergency_contact', 'name', 'Emergency Contact Name', 'Emergency', 'string', true, false, 'edit', 60),
    (NULL, 'emergency_contact', 'relationship', 'Relationship', 'Emergency', 'string', true, false, 'edit', 61),
    (NULL, 'emergency_contact', 'phone', 'Emergency Phone', 'Emergency', 'phone', true, false, 'edit', 62),
    (NULL, 'emergency_contact', 'email', 'Emergency Email', 'Emergency', 'email', true, false, 'edit', 63)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Position/Employment Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'position', 'id', 'Position ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'position', 'title', 'Job Title', 'Employment', 'string', false, false, 'view', 70),
    (NULL, 'position', 'department_id', 'Department', 'Employment', 'uuid', false, false, 'view', 71),
    (NULL, 'position', 'location_id', 'Location', 'Employment', 'uuid', false, false, 'view', 72),
    (NULL, 'position', 'reports_to_position_id', 'Reports To', 'Employment', 'uuid', false, false, 'view', 73),
    (NULL, 'position', 'cost_center_id', 'Cost Center', 'Employment', 'uuid', false, false, 'view', 74),
    (NULL, 'position', 'fte', 'FTE', 'Employment', 'number', false, false, 'view', 75),
    (NULL, 'position', 'employment_type', 'Employment Type', 'Employment', 'enum', false, false, 'view', 76),
    (NULL, 'position', 'grade', 'Grade/Level', 'Employment', 'string', false, false, 'view', 77)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Position Assignment Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'position_assignment', 'id', 'Assignment ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'position_assignment', 'effective_from', 'Effective From', 'Assignment', 'date', false, false, 'view', 80),
    (NULL, 'position_assignment', 'effective_to', 'Effective To', 'Assignment', 'date', false, false, 'view', 81),
    (NULL, 'position_assignment', 'is_primary', 'Is Primary Position', 'Assignment', 'boolean', false, false, 'view', 82),
    (NULL, 'position_assignment', 'assignment_reason', 'Assignment Reason', 'Assignment', 'string', false, false, 'view', 83)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Compensation Fields (Highly Sensitive)
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'compensation', 'id', 'Compensation ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'compensation', 'base_salary', 'Base Salary', 'Compensation', 'money', true, false, 'hidden', 90),
    (NULL, 'compensation', 'currency', 'Currency', 'Compensation', 'string', true, false, 'hidden', 91),
    (NULL, 'compensation', 'pay_frequency', 'Pay Frequency', 'Compensation', 'enum', true, false, 'hidden', 92),
    (NULL, 'compensation', 'effective_from', 'Effective From', 'Compensation', 'date', true, false, 'hidden', 93),
    (NULL, 'compensation', 'effective_to', 'Effective To', 'Compensation', 'date', true, false, 'hidden', 94),
    (NULL, 'compensation', 'change_reason', 'Change Reason', 'Compensation', 'string', true, false, 'hidden', 95),
    (NULL, 'compensation', 'bonus_target', 'Bonus Target %', 'Compensation', 'number', true, false, 'hidden', 96),
    (NULL, 'compensation', 'commission_rate', 'Commission Rate %', 'Compensation', 'number', true, false, 'hidden', 97)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Bank Details Fields (Highly Sensitive)
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'bank_details', 'id', 'Bank Details ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'bank_details', 'account_name', 'Account Name', 'Banking', 'string', true, false, 'hidden', 100),
    (NULL, 'bank_details', 'account_number', 'Account Number', 'Banking', 'string', true, false, 'hidden', 101),
    (NULL, 'bank_details', 'sort_code', 'Sort Code', 'Banking', 'string', true, false, 'hidden', 102),
    (NULL, 'bank_details', 'bank_name', 'Bank Name', 'Banking', 'string', true, false, 'hidden', 103),
    (NULL, 'bank_details', 'iban', 'IBAN', 'Banking', 'string', true, false, 'hidden', 104),
    (NULL, 'bank_details', 'swift_code', 'SWIFT/BIC Code', 'Banking', 'string', true, false, 'hidden', 105)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Leave/Absence Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'leave_request', 'id', 'Request ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'leave_request', 'leave_type_id', 'Leave Type', 'Leave', 'uuid', false, false, 'view', 110),
    (NULL, 'leave_request', 'start_date', 'Start Date', 'Leave', 'date', false, false, 'view', 111),
    (NULL, 'leave_request', 'end_date', 'End Date', 'Leave', 'date', false, false, 'view', 112),
    (NULL, 'leave_request', 'duration_days', 'Duration (Days)', 'Leave', 'number', false, false, 'view', 113),
    (NULL, 'leave_request', 'status', 'Status', 'Leave', 'enum', false, false, 'view', 114),
    (NULL, 'leave_request', 'notes', 'Notes', 'Leave', 'text', false, false, 'edit', 115),
    (NULL, 'leave_request', 'medical_certificate', 'Medical Certificate', 'Leave', 'file', true, false, 'hidden', 116),
    (NULL, 'leave_request', 'return_to_work_notes', 'Return to Work Notes', 'Leave', 'text', true, false, 'hidden', 117)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Leave Balance Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'leave_balance', 'id', 'Balance ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'leave_balance', 'leave_type_id', 'Leave Type', 'Balance', 'uuid', false, false, 'view', 120),
    (NULL, 'leave_balance', 'year', 'Year', 'Balance', 'number', false, false, 'view', 121),
    (NULL, 'leave_balance', 'entitled_days', 'Entitled Days', 'Balance', 'number', false, false, 'view', 122),
    (NULL, 'leave_balance', 'used_days', 'Used Days', 'Balance', 'number', false, false, 'view', 123),
    (NULL, 'leave_balance', 'pending_days', 'Pending Days', 'Balance', 'number', false, false, 'view', 124),
    (NULL, 'leave_balance', 'available_days', 'Available Days', 'Balance', 'number', false, false, 'view', 125),
    (NULL, 'leave_balance', 'carried_over', 'Carried Over', 'Balance', 'number', false, false, 'view', 126)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Timesheet Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'timesheet', 'id', 'Timesheet ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'timesheet', 'period_start', 'Period Start', 'Time', 'date', false, false, 'view', 130),
    (NULL, 'timesheet', 'period_end', 'Period End', 'Time', 'date', false, false, 'view', 131),
    (NULL, 'timesheet', 'status', 'Status', 'Time', 'enum', false, false, 'view', 132),
    (NULL, 'timesheet', 'total_hours', 'Total Hours', 'Time', 'number', false, false, 'view', 133),
    (NULL, 'timesheet', 'overtime_hours', 'Overtime Hours', 'Time', 'number', false, false, 'view', 134),
    (NULL, 'timesheet', 'submitted_at', 'Submitted At', 'Time', 'timestamp', false, false, 'view', 135),
    (NULL, 'timesheet', 'approved_at', 'Approved At', 'Time', 'timestamp', false, false, 'view', 136)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Performance Review Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'performance_review', 'id', 'Review ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'performance_review', 'review_period', 'Review Period', 'Performance', 'string', false, false, 'view', 140),
    (NULL, 'performance_review', 'review_type', 'Review Type', 'Performance', 'enum', false, false, 'view', 141),
    (NULL, 'performance_review', 'status', 'Status', 'Performance', 'enum', false, false, 'view', 142),
    (NULL, 'performance_review', 'overall_rating', 'Overall Rating', 'Performance', 'number', false, false, 'view', 143),
    (NULL, 'performance_review', 'manager_comments', 'Manager Comments', 'Performance', 'text', false, false, 'view', 144),
    (NULL, 'performance_review', 'employee_comments', 'Employee Comments', 'Performance', 'text', false, false, 'edit', 145),
    (NULL, 'performance_review', 'goals_rating', 'Goals Rating', 'Performance', 'number', false, false, 'view', 146),
    (NULL, 'performance_review', 'competency_rating', 'Competency Rating', 'Performance', 'number', false, false, 'view', 147),
    (NULL, 'performance_review', 'calibrated_rating', 'Calibrated Rating', 'Performance', 'number', true, false, 'hidden', 148)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Goals Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'goal', 'id', 'Goal ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'goal', 'title', 'Goal Title', 'Goals', 'string', false, false, 'edit', 150),
    (NULL, 'goal', 'description', 'Description', 'Goals', 'text', false, false, 'edit', 151),
    (NULL, 'goal', 'category', 'Category', 'Goals', 'enum', false, false, 'view', 152),
    (NULL, 'goal', 'target_date', 'Target Date', 'Goals', 'date', false, false, 'edit', 153),
    (NULL, 'goal', 'progress', 'Progress %', 'Goals', 'number', false, false, 'edit', 154),
    (NULL, 'goal', 'status', 'Status', 'Goals', 'enum', false, false, 'view', 155),
    (NULL, 'goal', 'rating', 'Rating', 'Goals', 'number', false, false, 'view', 156),
    (NULL, 'goal', 'weight', 'Weight %', 'Goals', 'number', false, false, 'view', 157)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Training/Learning Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'course', 'id', 'Course ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'course', 'name', 'Course Name', 'Learning', 'string', false, false, 'view', 160),
    (NULL, 'course', 'description', 'Description', 'Learning', 'text', false, false, 'view', 161),
    (NULL, 'course', 'provider', 'Provider', 'Learning', 'string', false, false, 'view', 162),
    (NULL, 'course', 'duration_hours', 'Duration (Hours)', 'Learning', 'number', false, false, 'view', 163),
    (NULL, 'course', 'is_mandatory', 'Mandatory', 'Learning', 'boolean', false, false, 'view', 164),

    (NULL, 'course_completion', 'id', 'Completion ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'course_completion', 'completed_date', 'Completed Date', 'Learning', 'date', false, false, 'view', 170),
    (NULL, 'course_completion', 'score', 'Score', 'Learning', 'number', false, false, 'view', 171),
    (NULL, 'course_completion', 'certificate_url', 'Certificate', 'Learning', 'file', false, false, 'view', 172),
    (NULL, 'course_completion', 'expiry_date', 'Expiry Date', 'Learning', 'date', false, false, 'view', 173)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Document Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'document', 'id', 'Document ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'document', 'document_type', 'Document Type', 'Documents', 'enum', false, false, 'view', 180),
    (NULL, 'document', 'name', 'Document Name', 'Documents', 'string', false, false, 'view', 181),
    (NULL, 'document', 'file_url', 'File', 'Documents', 'file', false, false, 'view', 182),
    (NULL, 'document', 'uploaded_at', 'Uploaded Date', 'Documents', 'date', false, false, 'view', 183),
    (NULL, 'document', 'expiry_date', 'Expiry Date', 'Documents', 'date', false, false, 'view', 184),
    (NULL, 'document', 'is_confidential', 'Confidential', 'Documents', 'boolean', true, false, 'view', 185),
    (NULL, 'document', 'description', 'Description', 'Documents', 'text', false, false, 'view', 186)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Contract Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'contract', 'id', 'Contract ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'contract', 'contract_type', 'Contract Type', 'Contract', 'enum', false, false, 'view', 190),
    (NULL, 'contract', 'start_date', 'Start Date', 'Contract', 'date', false, false, 'view', 191),
    (NULL, 'contract', 'end_date', 'End Date', 'Contract', 'date', false, false, 'view', 192),
    (NULL, 'contract', 'probation_end_date', 'Probation End Date', 'Contract', 'date', false, false, 'view', 193),
    (NULL, 'contract', 'notice_period_days', 'Notice Period (Days)', 'Contract', 'number', false, false, 'view', 194),
    (NULL, 'contract', 'working_hours_per_week', 'Working Hours/Week', 'Contract', 'number', false, false, 'view', 195),
    (NULL, 'contract', 'annual_leave_days', 'Annual Leave Days', 'Contract', 'number', false, false, 'view', 196)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- -----------------------------------------------------------------------------
-- Org Unit Fields
-- -----------------------------------------------------------------------------
INSERT INTO app.field_registry (tenant_id, entity_name, field_name, field_label, field_group, data_type, is_sensitive, is_system_field, default_permission, display_order) VALUES
    (NULL, 'org_unit', 'id', 'Org Unit ID', 'System', 'uuid', false, true, 'view', 0),
    (NULL, 'org_unit', 'name', 'Name', 'Organisation', 'string', false, false, 'view', 200),
    (NULL, 'org_unit', 'code', 'Code', 'Organisation', 'string', false, false, 'view', 201),
    (NULL, 'org_unit', 'type', 'Type', 'Organisation', 'enum', false, false, 'view', 202),
    (NULL, 'org_unit', 'parent_id', 'Parent Unit', 'Organisation', 'uuid', false, false, 'view', 203),
    (NULL, 'org_unit', 'manager_position_id', 'Manager Position', 'Organisation', 'uuid', false, false, 'view', 204),
    (NULL, 'org_unit', 'is_active', 'Active', 'Organisation', 'boolean', false, false, 'view', 205),
    (NULL, 'org_unit', 'effective_from', 'Effective From', 'Organisation', 'date', false, false, 'view', 206),
    (NULL, 'org_unit', 'effective_to', 'Effective To', 'Organisation', 'date', false, false, 'view', 207)
ON CONFLICT (tenant_id, entity_name, field_name) DO UPDATE SET
    field_label = EXCLUDED.field_label,
    field_group = EXCLUDED.field_group;

-- Disable system context
SELECT app.disable_system_context();

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DELETE FROM app.field_registry WHERE tenant_id IS NULL;
