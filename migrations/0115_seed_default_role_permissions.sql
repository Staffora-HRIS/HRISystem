-- Migration: 0115_seed_default_role_permissions
-- Created: 2026-01-17
-- Description: Seed default field permissions for system roles
--              Configures HR Admin, Manager, and Employee role field access

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Enable system context for seeding
SELECT app.enable_system_context();

-- -----------------------------------------------------------------------------
-- HR Admin Role Field Permissions
-- HR Admins can view most fields, edit many, but not banking details
-- -----------------------------------------------------------------------------
INSERT INTO app.role_field_permissions (tenant_id, role_id, field_id, permission)
SELECT
    NULL as tenant_id,
    'a0000000-0000-0000-0000-000000000003'::uuid as role_id,  -- hr_admin
    fr.id as field_id,
    CASE
        -- System fields - view only
        WHEN fr.is_system_field THEN 'view'

        -- Banking details - hidden even from HR
        WHEN fr.entity_name = 'bank_details' AND fr.field_name NOT IN ('id') THEN 'hidden'

        -- Sensitive identifiers - view only
        WHEN fr.entity_name = 'employee_identifier' THEN 'view'

        -- Compensation - view only for HR (payroll team edits)
        WHEN fr.entity_name = 'compensation' AND fr.field_name NOT IN ('id') THEN 'view'

        -- Most employee data - edit
        WHEN fr.entity_name IN ('employee', 'employee_personal', 'employee_contact', 'employee_address', 'emergency_contact') THEN 'edit'

        -- Position and assignments - edit
        WHEN fr.entity_name IN ('position', 'position_assignment', 'contract') THEN 'edit'

        -- Leave requests - edit (can process requests)
        WHEN fr.entity_name IN ('leave_request', 'leave_balance') THEN 'edit'

        -- Performance - view (managers own this)
        WHEN fr.entity_name IN ('performance_review', 'goal') THEN 'view'

        -- Everything else based on default
        ELSE fr.default_permission
    END as permission
FROM app.field_registry fr
WHERE fr.tenant_id IS NULL
ON CONFLICT (tenant_id, role_id, field_id) DO UPDATE SET permission = EXCLUDED.permission;

-- -----------------------------------------------------------------------------
-- Manager Role Field Permissions
-- Managers can view team member data (limited), approve leave/time
-- -----------------------------------------------------------------------------
INSERT INTO app.role_field_permissions (tenant_id, role_id, field_id, permission)
SELECT
    NULL as tenant_id,
    'a0000000-0000-0000-0000-000000000004'::uuid as role_id,  -- manager
    fr.id as field_id,
    CASE
        -- System fields - view only
        WHEN fr.is_system_field THEN 'view'

        -- Banking details - completely hidden
        WHEN fr.entity_name = 'bank_details' THEN 'hidden'

        -- All sensitive identifiers - hidden
        WHEN fr.entity_name = 'employee_identifier' THEN 'hidden'

        -- Compensation - completely hidden
        WHEN fr.entity_name = 'compensation' THEN 'hidden'

        -- Personal details - only basic info visible
        WHEN fr.entity_name = 'employee_personal' AND fr.field_name IN ('first_name', 'middle_name', 'last_name', 'preferred_name', 'photo_url') THEN 'view'
        WHEN fr.entity_name = 'employee_personal' THEN 'hidden'

        -- Contact - work contact only
        WHEN fr.entity_name = 'employee_contact' AND fr.field_name IN ('email', 'work_phone') THEN 'view'
        WHEN fr.entity_name = 'employee_contact' THEN 'hidden'

        -- Address - hidden
        WHEN fr.entity_name = 'employee_address' THEN 'hidden'

        -- Emergency contact - view only
        WHEN fr.entity_name = 'emergency_contact' THEN 'view'

        -- Core employee fields
        WHEN fr.entity_name = 'employee' AND fr.field_name IN ('employee_number', 'status', 'hire_date') THEN 'view'
        WHEN fr.entity_name = 'employee' THEN 'hidden'

        -- Position - view
        WHEN fr.entity_name IN ('position', 'position_assignment') THEN 'view'

        -- Contract - basic info only
        WHEN fr.entity_name = 'contract' AND fr.field_name IN ('contract_type', 'start_date', 'end_date') THEN 'view'
        WHEN fr.entity_name = 'contract' THEN 'hidden'

        -- Leave - view and can add notes (approve via workflow)
        WHEN fr.entity_name = 'leave_request' AND fr.field_name = 'notes' THEN 'edit'
        WHEN fr.entity_name IN ('leave_request', 'leave_balance') THEN 'view'

        -- Timesheet - view
        WHEN fr.entity_name = 'timesheet' THEN 'view'

        -- Performance - edit (managers own reviews)
        WHEN fr.entity_name = 'performance_review' AND fr.field_name = 'employee_comments' THEN 'view'
        WHEN fr.entity_name IN ('performance_review', 'goal') THEN 'edit'

        -- Learning - view
        WHEN fr.entity_name IN ('course', 'course_completion') THEN 'view'

        -- Documents - view
        WHEN fr.entity_name = 'document' THEN 'view'

        -- Org units - view
        WHEN fr.entity_name = 'org_unit' THEN 'view'

        -- Default to hidden for safety
        ELSE 'hidden'
    END as permission
FROM app.field_registry fr
WHERE fr.tenant_id IS NULL
ON CONFLICT (tenant_id, role_id, field_id) DO UPDATE SET permission = EXCLUDED.permission;

-- -----------------------------------------------------------------------------
-- Employee Role Field Permissions
-- Employees can view and edit their own data (limited)
-- ESS Portal - self-service access only
-- -----------------------------------------------------------------------------
INSERT INTO app.role_field_permissions (tenant_id, role_id, field_id, permission)
SELECT
    NULL as tenant_id,
    'a0000000-0000-0000-0000-000000000005'::uuid as role_id,  -- employee
    fr.id as field_id,
    CASE
        -- System fields - view only
        WHEN fr.is_system_field THEN 'view'

        -- Banking details - can view and edit own (via approval workflow)
        WHEN fr.entity_name = 'bank_details' AND fr.field_name IN ('account_name', 'account_number', 'sort_code', 'bank_name') THEN 'edit'
        WHEN fr.entity_name = 'bank_details' THEN 'view'

        -- Sensitive identifiers - hidden
        WHEN fr.entity_name = 'employee_identifier' THEN 'hidden'

        -- Compensation - view own salary
        WHEN fr.entity_name = 'compensation' AND fr.field_name IN ('base_salary', 'currency', 'pay_frequency') THEN 'view'
        WHEN fr.entity_name = 'compensation' THEN 'hidden'

        -- Personal details - can edit contact info, view the rest
        WHEN fr.entity_name = 'employee_personal' AND fr.field_name IN ('preferred_name', 'photo_url') THEN 'edit'
        WHEN fr.entity_name = 'employee_personal' THEN 'view'

        -- Contact - can edit personal contact info
        WHEN fr.entity_name = 'employee_contact' AND fr.field_name IN ('personal_email', 'mobile_phone', 'home_phone') THEN 'edit'
        WHEN fr.entity_name = 'employee_contact' THEN 'view'

        -- Address - can edit
        WHEN fr.entity_name = 'employee_address' THEN 'edit'

        -- Emergency contact - can edit
        WHEN fr.entity_name = 'emergency_contact' THEN 'edit'

        -- Core employee fields - view only
        WHEN fr.entity_name = 'employee' THEN 'view'

        -- Position - view only
        WHEN fr.entity_name IN ('position', 'position_assignment') THEN 'view'

        -- Contract - view basic info
        WHEN fr.entity_name = 'contract' AND fr.field_name IN ('contract_type', 'start_date', 'end_date', 'annual_leave_days', 'working_hours_per_week') THEN 'view'
        WHEN fr.entity_name = 'contract' THEN 'hidden'

        -- Leave - can edit own requests
        WHEN fr.entity_name = 'leave_request' AND fr.field_name IN ('notes', 'medical_certificate') THEN 'edit'
        WHEN fr.entity_name IN ('leave_request', 'leave_balance') THEN 'view'

        -- Timesheet - can edit own
        WHEN fr.entity_name = 'timesheet' THEN 'edit'

        -- Performance - can edit self-assessment
        WHEN fr.entity_name = 'performance_review' AND fr.field_name = 'employee_comments' THEN 'edit'
        WHEN fr.entity_name IN ('performance_review', 'goal') AND fr.field_name = 'calibrated_rating' THEN 'hidden'
        WHEN fr.entity_name IN ('performance_review', 'goal') THEN 'view'

        -- Goals - can edit own progress
        WHEN fr.entity_name = 'goal' AND fr.field_name IN ('progress', 'description') THEN 'edit'
        WHEN fr.entity_name = 'goal' THEN 'view'

        -- Learning - view own
        WHEN fr.entity_name IN ('course', 'course_completion') THEN 'view'

        -- Documents - view own, upload own
        WHEN fr.entity_name = 'document' THEN 'view'

        -- Org units - view (for directory)
        WHEN fr.entity_name = 'org_unit' THEN 'view'

        -- Default based on field default
        ELSE fr.default_permission
    END as permission
FROM app.field_registry fr
WHERE fr.tenant_id IS NULL
ON CONFLICT (tenant_id, role_id, field_id) DO UPDATE SET permission = EXCLUDED.permission;

-- -----------------------------------------------------------------------------
-- Tenant Admin Role Field Permissions
-- Full access to all fields including sensitive data
-- -----------------------------------------------------------------------------
INSERT INTO app.role_field_permissions (tenant_id, role_id, field_id, permission)
SELECT
    NULL as tenant_id,
    'a0000000-0000-0000-0000-000000000002'::uuid as role_id,  -- tenant_admin
    fr.id as field_id,
    CASE
        -- System fields - view only
        WHEN fr.is_system_field THEN 'view'
        -- Everything else - full edit
        ELSE 'edit'
    END as permission
FROM app.field_registry fr
WHERE fr.tenant_id IS NULL
ON CONFLICT (tenant_id, role_id, field_id) DO UPDATE SET permission = EXCLUDED.permission;

-- Disable system context
SELECT app.disable_system_context();

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DELETE FROM app.role_field_permissions WHERE tenant_id IS NULL;
