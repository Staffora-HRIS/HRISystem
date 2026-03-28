# Database Migration Changelog

> Complete changelog of all database migrations for the Staffora HRIS platform.
> **Total:** 320 migration files | **Range:** 0001--0234 (with duplicate numbers from parallel branches)
> **Schema:** All tables in the `app` schema | **Database:** PostgreSQL 16 with Row-Level Security
> *Last updated: 2026-03-28*

---

## How to Read This Changelog

- **Number** -- The 4-digit migration prefix. Some numbers appear more than once because parallel feature branches chose the same next number.
- **Type** column values:
  - **Schema** -- Extensions, schemas, or database-level configuration
  - **Table** -- `CREATE TABLE` (new table)
  - **Enum** -- `CREATE TYPE ... AS ENUM` (new enum types)
  - **Alter** -- `ALTER TABLE` / `ALTER TYPE` (modify existing objects)
  - **Function** -- `CREATE FUNCTION` / stored procedures / triggers
  - **Seed** -- `INSERT` seed data (demo data, system defaults)
  - **Index** -- `CREATE INDEX` (performance optimisation)
  - **Fix** -- Bug fix or data correction
  - **View** -- Materialized views or regular views
  - **Security** -- RLS policies, role grants, security hardening
  - **Drop** -- `DROP TABLE` / `DROP COLUMN` / cleanup

---

## Phase 1: Core Infrastructure (0001--0012)

Foundation tables for multi-tenancy, authentication, RBAC, auditing, and platform patterns.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0001 | extensions | Schema | Enable `uuid-ossp` and `pgcrypto` PostgreSQL extensions |
| 0002 | tenants | Table | Create `tenants` table -- root of multi-tenancy hierarchy (no RLS) |
| 0003 | users | Table | Create `users` table for authentication accounts (global, not tenant-scoped) |
| 0004 | sessions | Table | Create `sessions` table for session management with expiration |
| 0005 | user_tenants | Table | Create `user_tenants` junction table linking users to tenants with RLS |
| 0006 | roles | Table | Create `roles` table for RBAC role definitions (tenant-scoped) |
| 0007 | permissions | Table | Create `permissions` table for granular resource:action pairs (system-wide) |
| 0008 | role_permissions | Table | Create `role_permissions` junction table linking roles to permissions |
| 0009 | role_assignments | Table | Create `role_assignments` table for assigning roles to users with scoping |
| 0010 | audit_log | Table | Create `audit_log` table with monthly partitioning -- append-only audit trail |
| 0011 | domain_outbox | Table | Create `domain_outbox` table for transactional outbox pattern |
| 0012 | idempotency_keys | Table | Create `idempotency_keys` table for request deduplication (24h expiry) |

---

## Phase 2: Core HR Module (0013--0026)

Employee records, organisational structure, contracts, and compensation -- the core HR data model.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0013 | hr_enums | Enum | Create HR enums: employee_status, contract_type, gender, marital_status, address_type, contact_type, identifier_type |
| 0014 | org_units | Table | Create `org_units` table with `ltree` hierarchy and effective dating |
| 0015 | cost_centers | Table | Create `cost_centers` table for financial reporting units |
| 0016 | positions | Table | Create `positions` table for position definitions within org units |
| 0017 | employees | Table | Create `employees` table -- core employee record with status lifecycle |
| 0018 | employee_personal | Table | Create `employee_personal` table -- effective-dated personal details |
| 0019 | employee_contacts | Table | Create `employee_contacts` table for phone, email, etc. |
| 0020 | employee_addresses | Table | Create `employee_addresses` table for postal addresses |
| 0021 | employee_identifiers | Table | Create `employee_identifiers` table for NINO, passport numbers, etc. |
| 0022 | employment_contracts | Table | Create `employment_contracts` table -- effective-dated contract details (type, FTE, hours, probation) |
| 0023 | position_assignments | Table | Create `position_assignments` table -- effective-dated employee-to-position links |
| 0024 | reporting_lines | Table | Create `reporting_lines` table for manager-employee relationships |
| 0025 | compensation_history | Table | Create `compensation_history` table -- effective-dated salary and compensation records |
| 0026 | employee_status_history | Table | Create `employee_status_history` table -- immutable record of status transitions |

---

## Phase 3: Workflow Engine (0027--0034)

Configurable workflow definitions, instances, tasks, and SLA tracking.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0027 | workflow_enums | Enum | Create workflow enums: workflow_status, instance_status, task_status, action_type, trigger_type, escalation_action |
| 0028 | workflow_definitions | Table | Create `workflow_definitions` table for reusable workflow templates |
| 0029 | workflow_versions | Table | Create `workflow_versions` table for versioned workflow step definitions |
| 0030 | workflow_instances | Table | Create `workflow_instances` table for running workflow executions |
| 0031 | workflow_tasks | Table | Create `workflow_tasks` table for individual steps within a workflow instance |
| 0032 | workflow_transitions | Table | Create `workflow_transitions` table for state change audit trail |
| 0033 | workflow_slas | Table | Create `workflow_slas` table for SLA definitions per workflow step |
| 0034 | workflow_sla_events | Table | Create `workflow_sla_events` table for SLA breach/warning events |

---

## Phase 4: Time and Attendance (0035--0045)

Clock-in/out, schedules, shifts, timesheets, and overtime.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0035 | time_enums | Enum | Create Time and Attendance enums: time_event_type, device_type, timesheet_status, schedule_status, shift_swap_status |
| 0036 | time_devices | Table | Create `time_devices` table for clock devices and kiosks |
| 0037 | time_events | Table | Create `time_events` table for clock-in/out events (partitioned) |
| 0038 | schedules | Table | Create `schedules` table for work schedule definitions |
| 0039 | shifts | Table | Create `shifts` table for shift pattern definitions |
| 0040 | shift_assignments | Table | Create `shift_assignments` table for employee-to-shift links |
| 0041 | shift_swap_requests | Table | Create `shift_swap_requests` table for shift swap workflows |
| 0042 | timesheets | Table | Create `timesheets` table for weekly/monthly timesheet headers |
| 0043 | timesheet_lines | Table | Create `timesheet_lines` table for daily time entries within timesheets |
| 0044 | timesheet_approvals | Table | Create `timesheet_approvals` table for approval workflow tracking |
| 0045 | overtime_rules | Table | Create `overtime_rules` table for overtime calculation configuration |

---

## Phase 5: Absence Management (0046--0055)

Leave types, policies, accruals, balances, requests, and public holidays.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0046 | absence_enums | Enum | Create Absence enums: leave_category, request_status, accrual_frequency, balance_transaction_type, leave_unit |
| 0047 | leave_types | Table | Create `leave_types` table for configurable leave categories |
| 0048 | leave_policies | Table | Create `leave_policies` table for entitlement rules per leave type |
| 0049 | leave_accrual_rules | Table | Create `leave_accrual_rules` table for accrual frequency and amounts |
| 0050 | leave_balances | Table | Create `leave_balances` table for current balance per employee per leave type |
| 0051 | leave_balance_ledger | Table | Create `leave_balance_ledger` table -- immutable transaction log for balance changes |
| 0052 | leave_requests | Table | Create `leave_requests` table for leave request submissions |
| 0053 | leave_approvals | Table | Create `leave_approvals` table for leave request approval workflow |
| 0054 | public_holidays | Table | Create `public_holidays` table for bank holiday calendars |
| 0055 | blackout_periods | Table | Create `blackout_periods` table for no-leave date ranges |

---

## Phase 6: Talent Management (0056--0067)

Recruitment pipeline, performance cycles, goals, reviews, and development plans.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0056 | talent_enums | Enum | Create Talent enums: requisition_status, candidate_stage, offer_status, performance_cycle_status, goal_status, review_status |
| 0057 | requisitions | Table | Create `requisitions` table for job vacancy requests |
| 0058 | candidates | Table | Create `candidates` table for applicant tracking |
| 0059 | candidate_stage_events | Table | Create `candidate_stage_events` table for pipeline stage transitions |
| 0060 | interviews | Table | Create `interviews` table for interview scheduling |
| 0061 | interview_feedback | Table | Create `interview_feedback` table for interviewer scorecards |
| 0062 | offers | Table | Create `offers` table for job offer tracking |
| 0063 | performance_cycles | Table | Create `performance_cycles` table for review period configuration |
| 0064 | goals | Table | Create `goals` table for employee goal setting and tracking |
| 0065 | reviews | Table | Create `reviews` table for performance review records |
| 0066 | feedback_items | Table | Create `feedback_items` table for review feedback entries |
| 0067 | development_plans | Table | Create `development_plans` table for career development tracking |

---

## Phase 7: Learning Management System (0068--0075)

Courses, learning paths, assignments, completions, and certificates.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0068 | lms_enums | Enum | Create LMS enums: course_status, completion_status, skill_level, assignment_type |
| 0069 | courses | Table | Create `courses` table for training course definitions |
| 0070 | course_versions | Table | Create `course_versions` table for versioned course content |
| 0071 | learning_paths | Table | Create `learning_paths` table for structured learning journeys |
| 0072 | learning_path_courses | Table | Create `learning_path_courses` junction table for path-to-course ordering |
| 0073 | assignments | Table | Create `assignments` table for course/path assignments to employees |
| 0074 | completions | Table | Create `completions` table for tracking course completion records |
| 0075 | certificates | Table | Create `certificates` table for generated completion certificates |

---

## Phase 8: Case Management and Cross-Cutting (0076--0084)

HR service desk, notifications, exports, documents, analytics, and platform features. This range contains duplicate numbers from parallel branches.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0076 | case_enums | Enum | Create Case Management enums: case_status, case_priority, case_type, escalation_level |
| 0076 | notifications | Table | Create `notifications` table with delivery tracking and push tokens |
| 0077 | case_categories | Table | Create `case_categories` table for HR case classification |
| 0077 | exports | Table | Create `exports` table for export job tracking (CSV, Excel) |
| 0078 | cases | Table | Create `cases` table for HR service desk case records |
| 0078 | documents | Table | Create `documents` table for document management (PDF worker) |
| 0079 | case_comments | Table | Create `case_comments` table for case discussion threads |
| 0079 | analytics | Table | Create analytics tables: `analytics_aggregates`, `analytics_snapshots`, `analytics_dashboards` |
| 0080 | case_attachments | Table | Create `case_attachments` table for case file uploads |
| 0081 | notifications | Table | Duplicate of 0076 notifications (parallel branch) |
| 0081 | onboarding_enums | Enum | Create Onboarding enums: template_status, task_status, task_type |
| 0082 | exports | Table | Duplicate of 0077 exports (parallel branch) |
| 0082 | onboarding_templates | Table | Create `onboarding_templates` table for onboarding workflow definitions |
| 0083 | documents | Table | Duplicate of 0078 documents (parallel branch) |
| 0083 | onboarding_template_tasks | Table | Create `onboarding_template_tasks` table for template step definitions |
| 0084 | analytics | Table | Duplicate of 0079 analytics (parallel branch) |
| 0084 | onboarding_instances | Table | Create `onboarding_instances` table for active onboarding processes |

---

## Phase 9: Onboarding and Bug Fixes (0085--0093)

Onboarding completion, system fixes, Better Auth integration, and admin seeding.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0085 | onboarding_enums | Enum | Duplicate of 0081 onboarding enums (parallel branch) |
| 0085 | onboarding_task_completions | Table | Create `onboarding_task_completions` table for tracking task completion |
| 0086 | fix_immutable_system_context | Fix | Fix `prevent_update()` function to allow system context cleanup on immutable tables |
| 0086 | onboarding_templates | Table | Duplicate of 0082 onboarding templates (parallel branch) |
| 0087 | fix_employee_status_history_triggers | Fix | Make status history triggers resilient when `app.current_user` is unset |
| 0087 | onboarding_template_tasks | Table | Duplicate of 0083 template tasks (parallel branch) |
| 0088 | better_auth_tables | Table | Create Better Auth `account` and `verification` tables for OAuth |
| 0088 | onboarding_instances | Table | Duplicate of 0084 onboarding instances (parallel branch) |
| 0089 | better_auth_core_tables | Table | Create Better Auth core tables: `user`, `session`, `account`, `verification` (separate from legacy tables) |
| 0089 | onboarding_task_completions | Table | Duplicate of 0085 task completions (parallel branch) |
| 0090 | fix_immutable_system_context | Fix | Duplicate of 0086 system context fix (parallel branch) |
| 0090 | seed_admin_user | Seed | Seed admin user with super_admin role for development |
| 0091 | fix_employee_status_history_triggers | Fix | Duplicate of 0087 trigger fix (parallel branch) |
| 0091 | migrate_users_to_better_auth | Seed | Migrate existing users from `app.users` to Better Auth tables |
| 0092 | better_auth_tables | Table | Duplicate of 0088 Better Auth tables (parallel branch) |
| 0092 | better_auth_twofactor_columns | Alter | Add `twoFactorEnabled`, `twoFactorSecret`, `twoFactorBackupCodes` to Better Auth `user` table |
| 0093 | better_auth_core_tables | Table | Duplicate of 0089 Better Auth core tables (parallel branch) |
| 0093 | better_auth_session_current_tenant | Alter | Add `currentTenantId` column to Better Auth `session` table |

---

## Phase 10: Portal and Enhanced Features (0094--0106)

Portal tasks, org chart, enhanced documents, benefits, succession, competencies, equipment, geofence, delegation, analytics, and jobs.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0094 | portal_tasks | Table | Create `tasks` table for portal task inbox |
| 0094 | seed_admin_user | Seed | Duplicate of 0090 admin seed (parallel branch) |
| 0095 | org_chart_functions | Function | Create `get_org_chart_data()` function for org chart visualisation |
| 0095 | migrate_users_to_better_auth | Seed | Duplicate of 0091 user migration (parallel branch) |
| 0096 | documents_enhanced | Alter | Enhanced document management with categories, expiry alerts, and versioning |
| 0096 | better_auth_twofactor_columns | Alter | Duplicate of 0092 2FA columns (parallel branch) |
| 0097 | benefits_types | Enum | Create benefits enums: benefit_category, enrollment_status, life_event_type |
| 0097 | better_auth_session_current_tenant | Alter | Duplicate of 0093 session tenant (parallel branch) |
| 0098 | benefit_plans | Table | Create `benefit_plans` table for employer-offered benefit configurations |
| 0098 | portal_tasks | Table | Duplicate of 0094 portal tasks (parallel branch) |
| 0099 | benefit_enrollments | Table | Create `benefit_enrollments` table for employee benefit participation |
| 0099 | org_chart_functions | Function | Duplicate of 0095 org chart functions (parallel branch) |
| 0100 | documents_enhanced | Alter | Duplicate of 0096 enhanced documents (parallel branch) |
| 0100 | life_events | Table | Create `life_events` and open enrollment tables for benefits |
| 0101 | benefits_types | Enum | Duplicate of 0097 benefits types (parallel branch) |
| 0101 | succession_planning | Table | Create succession planning tables: `succession_plans`, `succession_candidates` with readiness levels |
| 0101b | jobs | Table | Create `jobs` table for job catalog/classification (early version) |
| 0102 | benefit_plans | Table | Duplicate of 0098 benefit plans (parallel branch) |
| 0102 | competencies | Table | Create competency management tables: `competency_frameworks`, `competencies`, `employee_competencies` |
| 0103 | benefit_enrollments | Table | Duplicate of 0099 benefit enrollments (parallel branch) |
| 0103 | equipment | Table | Create `equipment_catalog` and `equipment_assignments` tables for onboarding equipment provisioning |
| 0104 | geofence | Table | Create `geofence_locations` and `geofence_rules` tables for Time and Attendance geofencing |
| 0105 | delegation | Table | Create `approval_delegations` table for workflow approval delegation |
| 0106 | analytics | Table | Create analytics and reporting infrastructure: `report_definitions`, `analytics_headcount`, `analytics_turnover` |
| 0106 | jobs | Table | Create `jobs` table for job catalog/classification |

---

## Phase 11: Demo Data and Security (0107--0122)

Demo employee seeding, field-level security, portal system, manager hierarchy, Better Auth organisation.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0107 | competencies | Table | Duplicate of 0102 competencies (parallel branch) |
| 0107 | seed_demo_employees | Seed | Seed 50 demo employees with realistic Acme Technologies hierarchy |
| 0108 | seed_demo_employees_data | Seed | Seed personal data, contracts, and addresses for demo employees |
| 0109 | seed_demo_position_assignments | Seed | Seed position assignments for demo employees |
| 0110 | field_registry | Table | Create `field_registry` table for Field-Level Security (FLS) metadata |
| 0110 | link_admin_to_demo_data | Seed | Link admin user to demo tenant and employee record |
| 0111 | role_field_permissions | Table | Create `role_field_permissions` table for granular field access per role |
| 0112 | portal_system | Table | Create portal system tables: `portals`, `portal_configurations`, `portal_menu_items` for multi-portal architecture |
| 0113 | manager_hierarchy | Function | Create manager hierarchy functions: `get_subordinates()`, `get_direct_reports()` for portal data isolation |
| 0114 | seed_field_registry | Seed | Seed field registry with all HR field definitions |
| 0115 | seed_default_role_permissions | Seed | Seed default role-to-permission mappings |
| 0116 | better_auth_organization | Table | Create Better Auth organisation plugin tables: `organization`, `member`, `invitation` |
| 0120 | seed_field_registry | Seed | Duplicate of 0114 field registry seed (parallel branch) |
| 0121 | seed_default_role_permissions | Seed | Duplicate of 0115 role permissions seed (parallel branch) |
| 0122 | better_auth_organization | Table | Duplicate of 0116 Better Auth org tables (parallel branch) |

---

## Phase 12: Application Role and UK Compliance (0123--0162)

Application database role, UK statutory compliance modules (SSP, statutory leave, right to work, GDPR, health and safety, parental leave, employment law, payroll).

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0123 | hris_app_role | Security | Create `hris_app` database role with `NOBYPASSRLS` for runtime RLS enforcement |
| 0124 | ssp | Table | Create Statutory Sick Pay tables: `ssp_records`, `ssp_qualifying_days`, `ssp_piw_links` (UK SSP rules) |
| 0125 | statutory_leave | Table | Create statutory leave tables for maternity, paternity, shared parental, and adoption leave |
| 0126 | right_to_work | Table | Create Right to Work verification tables: `rtw_checks`, `rtw_documents` (UK employment law) |
| 0127 | dsar | Table | Create DSAR tables: `dsar_requests`, `dsar_data_items`, `dsar_audit_log` (UK GDPR Article 15) |
| 0128 | consent_management | Table | Create GDPR consent tables: `consent_purposes`, `consent_records` (UK GDPR Articles 6-7) |
| 0129 | data_erasure | Table | Create data erasure tables and anonymisation function (UK GDPR Article 17 -- Right to be Forgotten) |
| 0130 | working_time_regulations | Table | Create Working Time Regulations tables: `wtr_opt_outs`, `wtr_compliance_alerts` (WTR 1998) |
| 0131 | account_lockout | Alter | Add account lockout columns to Better Auth user table (failed attempts, lockout tracking) |
| 0132 | health_safety | Table | Create Health and Safety tables: `hs_incidents`, `riddor_reports`, `risk_assessments`, `dse_assessments` |
| 0133 | parental_bereavement | Table | Create parental bereavement leave tables (Jack's Law -- Parental Bereavement Act 2018) |
| 0134 | bank_holiday_config | Table | Create `bank_holiday_configs` for per-tenant bank holiday treatment (England, Scotland, etc.) |
| 0135 | contract_amendments | Table | Create `contract_amendments` table for Employment Rights Act 1996 s.4 notification tracking |
| 0136 | carers_leave | Table/Seed | Carer's Leave Act 2023 support -- seed CARERS leave type and helper function |
| 0137 | return_to_work | Table | Create `return_to_work_interviews` table for post-absence fit-for-work assessment |
| 0138 | flexible_working | Table | Create `flexible_working_requests` table (Employment Relations (Flexible Working) Act 2023) |
| 0139 | gender_pay_gap | Table | Create `gender_pay_gap_reports` table for UK gender pay gap reporting (250+ employees) |
| 0140 | data_breach | Table | Create data breach tables: `data_breaches`, `data_breach_timeline` (UK GDPR ICO 72-hour notification) |
| 0141 | contract_statements | Table | Create `contract_statements` table for UK Written Statement of Employment Particulars |
| 0142 | privacy_notices | Table | Create `privacy_notices` and `privacy_notice_acknowledgements` tables (UK GDPR) |
| 0143 | nmw_compliance | Table | Create NMW/NLW compliance tables: `nmw_rates`, `nmw_compliance_checks` (National Minimum Wage Act 1998) |
| 0144 | diversity_monitoring | Table | Create `diversity_data` table for voluntary Equality Act 2010 monitoring |
| 0145 | emergency_contacts | Table | Create `emergency_contacts` table with primary contact support |
| 0146 | unpaid_parental_leave | Table | Create `unpaid_parental_leave` tracking (18 weeks per child, Employment Rights Act 1996) |
| 0147 | reasonable_adjustments | Table | Create `reasonable_adjustments` table for Equality Act 2010 ss.20-22 compliance |
| 0148 | probation_management | Table | Create `probation_reviews` table with outcomes (passed, extended, failed, terminated) |
| 0149 | pay_periods | Table | Create `pay_schedules`, `employee_pay_assignments`, `ni_categories` tables for UK payroll |
| 0150 | warnings | Table | Create `employee_warnings` table with UK disciplinary levels (verbal, first/final written) and auto-expiry |
| 0151 | employee_photos | Table | Create `employee_photos` table for profile photo S3 references |
| 0152 | employee_bank_details | Table | Create `employee_bank_details` table for UK bank accounts (sort code, account number) with effective dating |
| 0153 | document_templates | Table | Create `letter_templates` and `generated_letters` tables with placeholder syntax |
| 0154 | fix_onboarding_templates_default_constraint | Fix | Drop broken `UNIQUE (tenant_id, is_default)` constraint on onboarding templates |
| 0155 | ssp_fit_notes | Table | Create `ssp_fit_notes` table for UK fit note tracking (required after 7 days sickness) |
| 0155 | uk_holiday_entitlement | Alter | Add `contracted_days_per_week` to leave_policies, seed UK bank holidays, add `leave_year_start` to tenants |
| 0156 | bonus_payments | Table | Create `bonus_payments` table for UK Gender Pay Gap bonus reporting |
| 0157 | data_breach_enhanced | Alter | Enhance data breach workflow: add risk assessment, DPO details, ICO/subject notification tracking |
| 0157 | flexible_working_enhancements | Alter | Extend flexible working: add consultation tracking table, 8th statutory rejection ground |
| 0158 | pension_auto_enrolment | Table | Create UK pension tables: `pension_schemes`, `pension_enrolments`, `pension_contributions` (Pensions Act 2008) |
| 0158 | time_policies | Table | Create `time_policies` and `employee_time_policy_assignments` for working hours configuration |
| 0159 | family_leave | Alter | Extend statutory leave with MATB1 notice tracking, qualifying week, and `family_leave_notices` table |
| 0160 | acas_disciplinary | Table | Create ACAS Code compliant tables: `disciplinary_cases`, `grievance_cases` with statutory workflows |
| 0161 | payroll_integration | Table | Create `payroll_runs`, `payroll_lines`, `employee_tax_details` tables for UK PAYE/NI |
| 0162 | data_retention | Table | Create data retention tables: `retention_policies`, `retention_reviews`, `retention_exceptions` (UK GDPR Article 5(1)(e)) |

---

## Phase 13: Recruitment, Payroll, and LMS Enhancements (0163--0170)

Tax codes, training budgets, DBS checks, payroll deductions, assessments, course ratings, payslips, cascading goals, headcount planning, agencies, and secondments.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0163 | reference_checks | Table | Create `reference_checks` table for pre-employment verification lifecycle |
| 0163 | tax_codes | Table | Create `employee_tax_codes` table for effective-dated HMRC tax code tracking |
| 0163 | training_budgets | Table | Create `training_budgets` and `training_expenses` tables for LMS budget management |
| 0164 | cpd_records | Table | Create `cpd_records` table for Continuing Professional Development tracking |
| 0164 | dbs_checks | Table | Create `dbs_checks` table for DBS (Disclosure and Barring Service) check lifecycle |
| 0164 | deductions | Table | Create `deduction_types` and `employee_deductions` tables for payroll deductions |
| 0165 | assessments | Table | Create `assessment_templates` and `candidate_assessments` tables for recruitment |
| 0165 | course_ratings | Table | Create `course_ratings` table for LMS course reviews and ratings |
| 0165 | payslips | Table | Create `payslip_templates` and `payslips` tables for payslip generation |
| 0166 | cascading_goals | Alter | Add `alignment_type` column to goals table for cascading goal hierarchies |
| 0168 | headcount_planning | Table | Create `headcount_plans` and `headcount_plan_items` tables for workforce planning |
| 0169 | agencies | Table | Create `recruitment_agencies` and `agency_placements` tables for agency management |
| 0170 | secondments | Table | Create `secondments` table for internal/external secondment tracking |

---

## Phase 14: Reporting and RBAC Expansion (0171--0181)

Report builder, field catalog, system reports, performance indexes, NI categories, expanded roles and permissions, data scopes, case appeals, and approval instances.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0171 | reporting_field_catalog | Table | Create `reporting_field_catalog` table with field metadata for report builder |
| 0172 | reporting_definitions | Table | Create report types enum, execution history, and favourites tables |
| 0173 | seed_field_catalog | Seed | Seed ~180 reportable fields covering all employee-linked data domains |
| 0174 | performance_indexes | Index | Add indexes for org views, leave management, performance cycles, recruitment, and outbox |
| 0174 | seed_system_reports | Seed | Seed 30 system report templates via `seed_system_report_templates()` function |
| 0175 | ni_categories | Alter | Add NI category enum and column to employees table for payroll |
| 0176 | expanded_system_roles | Seed | Expand system roles from 5 to 18 with role hierarchy and templates |
| 0177 | expanded_permissions_catalog | Seed | Expand permissions catalog from ~60 to ~350+ permissions across all modules |
| 0178 | data_scopes_and_conditions | Table | Create data-scoped access (Layer 2), contextual permissions (Layer 3), approval chains and SoD (Layer 4), access reviews (Layer 5) |
| 0179 | seed_expanded_role_permissions | Seed | Seed expanded role-to-permission mappings for all 18 roles |
| 0180 | case_appeals | Table | Create `case_appeals` table for disciplinary/grievance appeal process |
| 0181 | approval_instances | Table | Create approval workflow execution tables and permission change audit log |

---

## Phase 15: Platform Fixes and Client Portal (0182--0192)

RLS policy fixes, bootstrap helpers, trigger fixes, UK compliance cleanup, client portal, portal auth cleanup, account lockout functions, user sync triggers.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0182 | fix_missing_insert_rls_policies | Security | Add explicit `FOR INSERT WITH CHECK` RLS policies to tables from 0076-0181 |
| 0183 | fix_analytics_widgets_tenant_id | Fix | Add `tenant_id` column to `analytics_widgets` table |
| 0184 | bootstrap_helper_functions | Function | Create `update_updated_at_column()`, `enable_system_context()`, `disable_system_context()` as migration-managed functions |
| 0185 | fix_broken_trigger_references | Fix | Fix triggers referencing `update_updated_at()` instead of `update_updated_at_column()` |
| 0186 | uk_compliance_cleanup | Alter | Remove US-specific logic: add `nino` identifier, rename `flsa_status` to `wtr_status`, update default currency to GBP |
| 0187 | client_portal | Table | Create client portal tables: `portal_users`, `portal_sessions`, `portal_tickets`, `portal_licenses`, `portal_invoices`, `portal_documents`, `portal_announcements` |
| 0187 | remove_ssn_enum_value | Alter | Fully remove deprecated `ssn` value from `identifier_type` enum (requires enum recreation) |
| 0189 | portal_betterauth_cleanup | Drop | Remove custom portal auth tables (sessions, password resets) in favour of BetterAuth; add `user_id` FK to `portal_users` |
| 0190 | account_lockout | Function | Create account lockout functions: check, record, and reset failed login attempts with exponential backoff |
| 0191 | analytics_composite_indexes | Index | Add composite indexes on `analytics_aggregates` and `analytics_snapshots` for dashboard queries |
| 0191 | employee_change_requests | Table | Create `employee_change_requests` table for sensitive field change approval workflow |
| 0191 | integrations | Table | Create `integrations` table for third-party service connection management |
| 0191 | ni_categories_updated_at | Alter | Add `updated_at` column and trigger to `ni_categories` table; drop unused enum |
| 0191 | recruitment_costs | Table | Create `recruitment_costs` table for cost-per-hire analytics |
| 0191 | report_schedule_history | Table | Create `report_schedule_history` table for schedule change audit trail |
| 0191 | tax_codes_enhancements | Alter | Extend `employee_tax_codes` source enum with P45, P46, starter_declaration; add notes column |
| 0192 | employee_pay_assignments_updates | Alter | Add `updated_at` and `updated_by` columns to `employee_pay_assignments` |
| 0192 | user_table_sync_trigger | Function | Create database trigger to auto-sync Better Auth `user` table to legacy `users` table |

---

## Phase 16: Extended Modules (0193--0199)

API keys, SLA escalation, ACAS compliance, RTI submissions, agency workers, case hearings, webhooks, TOIL, DPIA, bulk documents, e-signatures, background checks, and many more feature tables.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0193 | api_keys | Table | Create `api_keys` table for M2M authentication with SHA-256 hashed keys |
| 0193 | case_appeals_acas_compliance | Alter | Enhance `case_appeals` for ACAS Code compliance: hearing details, appellant link, different-person enforcement |
| 0193 | sla_escalation_log | Table | Create `sla_escalation_log` table for automatic SLA escalation event tracking |
| 0194 | mandatory_training_compliance | Alter | Add `is_mandatory` flag to `courses` table for compliance reporting |
| 0194 | payroll_rti_submissions | Table | Create `payroll_rti_submissions` table for HMRC PAYE/FPS/EPS submission tracking |
| 0195 | agency_worker_assignments | Table | Create `agency_worker_assignments` table for AWR 2010 12-week qualifying period tracking |
| 0195 | announcements | Table | Create `announcements` table for company news and announcements |
| 0195 | case_hearings | Table | Create `case_hearings` table for disciplinary/grievance hearing scheduling (ACAS 5-day notice) |
| 0195 | dbs_checks_renewal_tracking | Alter | Add renewal tracking to DBS checks: `renewal_due_date`, `update_service_id`, `last_status_check_at` |
| 0195 | ir35_assessments | Table | Create `ir35_assessments` table for off-payroll working compliance (IR35 since April 2021) |
| 0195 | one_on_one_meetings | Table | Create `one_on_one_meetings` table for manager 1:1 meeting notes and action items |
| 0195 | overtime_rules | Table | Create enhanced `overtime_rules` with effective dating and department/role scoping |
| 0195 | peer_recognitions | Table | Create `peer_recognitions` table for peer feedback (teamwork, innovation, leadership categories) |
| 0195 | webhook_subscriptions_deliveries | Table | Create `webhook_subscriptions` and `webhook_deliveries` tables with HMAC-SHA256 signing |
| 0195 | whistleblowing_cases | Table | Create `whistleblowing_cases` table for PIDA 1998 compliance with anonymous reporting |
| 0196 | course_prerequisites | Table | Create `course_prerequisites` table for learning path prerequisite chain enforcement |
| 0196 | employee_suspensions | Table | Create `employee_suspensions` table for disciplinary suspension tracking |
| 0196 | processing_activities_ropa | Table | Create ROPA register table per UK GDPR Article 30 |
| 0196 | toil_management | Table | Create `toil_balances` and `toil_transactions` tables for Time Off In Lieu |
| 0197 | dpia | Table | Create `dpia_assessments` table for GDPR Article 35 Data Protection Impact Assessments |
| 0198 | bulk_document_generation | Table | Create `document_generation_batches` table for bulk document batch tracking |
| 0198 | email_delivery_log | Table | Create `email_delivery_log` table for email bounce handling and delivery status |
| 0198 | employee_addresses_uk_enhancements | Alter | UK-specific address field enhancements for employee addresses |
| 0198 | lookup_values | Table | Create `lookup_categories` and `lookup_values` tables for tenant-configurable dropdowns |
| 0198 | onboarding_task_dependencies | Table | Create `onboarding_task_dependencies` and `onboarding_instance_task_dependencies` tables |
| 0198 | payroll_period_locks | Table | Create `payroll_period_locks` table to prevent data modifications during/after payroll processing |
| 0198 | policy_distributions | Table | Create `policy_distributions` and `policy_acknowledgements` tables for policy read receipts |
| 0198 | salary_sacrifices | Table | Create `salary_sacrifices` table for UK salary sacrifice arrangements (pension, cycle to work, etc.) |
| 0198 | talent_pools | Table | Create `talent_pools` and `talent_pool_members` tables for proactive talent pipeline |
| 0198 | tenant_usage_stats | Table | Create `tenant_usage_stats` table for per-tenant usage analytics |
| 0199 | beneficiary_nominations | Table | Create `beneficiary_nominations` table for benefits beneficiary designation |
| 0199 | cost_centre_assignments | Table | Create `cost_centre_assignments` table for effective-dated cost centre tracking |
| 0199 | data_import_jobs | Table | Create `import_jobs` table for structured CSV/Excel bulk data loading |
| 0199 | employee_positions_fte | Alter | Add FTE percentage tracking to `position_assignments` for concurrent positions |
| 0199 | employment_records | Table | Create `employment_records` table for rehire/employment history tracking |
| 0199 | income_protection_insurance | Table | Create `income_protection_policies` and `income_protection_enrollments` tables |
| 0199 | job_board_postings | Table | Create `job_board_postings` table for recruitment job board integration |
| 0199 | onboarding_compliance_checks | Table | Create `onboarding_compliance_checks` table for pre-employment verification |
| 0199 | overtime_requests | Table | Create `overtime_requests` table for overtime authorisation workflow |
| 0199 | payroll_journal_entries | Table | Create `payroll_journal_entries` table for double-entry accounting integration |
| 0199 | timesheet_approval_chains | Table | Create `timesheet_approval_chains` table for multi-level timesheet approval |
| 0199 | tribunal_cases | Table | Create `tribunal_cases` table for employment tribunal preparation tracking |

---

## Phase 17: Integrations and Analytics (0200--0202)

Benefits data exchange, calendar sync, data archival, 360 feedback, international assignments, push notifications, SSO, e-signatures, workflow branching, background checks.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0200 | benefits_data_exchanges | Table | Create `benefits_data_exchanges` table for provider data exchange file tracking |
| 0200 | calendar_connections | Table | Create `calendar_connections` table for Google Calendar, Outlook, and iCal sync |
| 0200 | data_archival | Table | Create `archived_records` table for data archival system |
| 0200 | feedback_360 | Table | Create 360-degree feedback tables: `feedback_360_cycles`, `feedback_360_responses` with anonymised aggregation |
| 0200 | international_assignments | Table | Create `international_assignments` table for global mobility tracking |
| 0200 | push_subscriptions | Table | Create `push_subscriptions` table for Web Push (VAPID) notifications (W3C Push API) |
| 0200 | sso_configurations | Table | Create `sso_configurations` table for SAML/OIDC enterprise SSO with AES-256 encrypted secrets |
| 0201 | e_signature_requests | Table | Create `signature_requests` table for document signing workflows (internal + DocuSign/HelloSign) |
| 0201 | workflow_condition_rules | Alter | Add `condition_rules` JSONB column to `workflow_tasks` for conditional workflow branching |
| 0202 | background_check_requests | Table | Create `background_check_requests` table for external DBS/credit/employment checks with webhook callbacks |

---

## Phase 18: Analytics Indexes and Feature Enhancements (0210--0218)

Performance indexes, DPIA, flexible benefits, total reward statements, company cars, mandatory training, tenant provisioning, ROPA, sickness analytics, webhooks, UK benefits, feature flags.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0210 | workforce_planning_analytics_indexes | Index | Composite indexes for headcount trends, turnover rate, retirement projection, tenure distribution |
| 0211 | recruitment_analytics_indexes | Index | Composite indexes for time-to-fill, cost-per-hire, source effectiveness, pipeline analytics |
| 0211 | shift_swaps | Alter | Add `pending_target` and `pending_manager` states for two-phase shift swap approval |
| 0212 | dpia_assessments | Table | Create DPIA tables with risk register, DPO opinion tracking (UK GDPR Article 35) |
| 0212 | flexible_benefits | Table | Create `flex_benefit_funds` and `flex_benefit_allocations` tables for benefit credit pools |
| 0212 | total_reward_statements | Table | Create `total_reward_statements` table for point-in-time compensation snapshots |
| 0213 | company_cars | Table | Create `company_cars` and `car_allowances` tables for vehicle BIK calculation (HMRC) |
| 0213 | mandatory_training | Table | Create `mandatory_training_rules` and `mandatory_training_assignments` tables |
| 0213 | tenant_provisioning_logs | Table | Create `provisioning_logs` and `background_job_runs` tables for admin monitoring |
| 0214 | ropa_register | Table | Create enhanced ROPA register for UK GDPR Article 30 compliance |
| 0215 | sickness_analytics_indexes | Index | Composite indexes for sickness absence trend analytics (by month, reason, department) |
| 0216 | outbound_webhooks | Table | Create `webhook_subscriptions` table for configurable outbound webhooks with delivery tracking |
| 0217 | uk_benefit_types | Alter | Replace US-specific benefit categories (HSA, FSA) with UK salary sacrifice schemes; update HIPAA to GDPR |
| 0218 | feature_flags | Table | Create feature flags system: `feature_flags`, `feature_flag_overrides` with percentage-based targeting |

---

## Phase 19: Stabilisation and Bug Fixes (0219--0234)

Schema fixes, RLS corrections, missing columns, partition management, enum extensions, performance tuning, and CI test stabilisation.

| Number | Name | Type | Description |
|--------|------|------|-------------|
| 0219 | fix_missing_columns_and_views | Alter | Add missing columns to `report_definitions`, create dashboard materialised views, add `get_user_display_name()` function |
| 0220 | fix_idempotency_keys_rls | Security | Fix RLS policies on `idempotency_keys` that blocked all mutating endpoints |
| 0221 | audit_log_default_partition | Alter | Add DEFAULT partition to `audit_log` and ensure 6-month partition lookahead |
| 0222 | document_type_enum_extend | Alter | Add `nda` and `custom` values to `document_type` enum |
| 0223 | schedules_add_is_template | Alter | Add `is_template` column to `schedules` table; add `active` to schedule status enum |
| 0224 | analytics_composite_indexes | Index | Add composite indexes for analytics worker staleness checks, report listing, and dashboard lookups |
| 0225 | fix_extract_on_date_subtraction | Fix | Fix `get_employee_tenure_years()` function: use `age()` instead of date subtraction for EXTRACT |
| 0226 | add_missing_rls_policies | Security | Add RLS policies to all tenant-owned tables with RLS enabled but no policies defined |
| 0227 | add_employee_name_columns | Alter | Add `first_name` and `last_name` convenience columns to `employees` table |
| 0228 | p45_p60_documents | Table | Create `p45_documents` and `p60_documents` tables for UK statutory tax documents |
| 0229 | timesheet_approval_hierarchies | Table | Create `timesheet_approval_hierarchies` table for configurable multi-level approval chains per department |
| 0230 | fix_tenant_usage_stats_rls | Security | Fix RLS policies on `tenant_usage_stats` to include system_context bypass and missing_ok |
| 0231 | fix_rls_policy_detection | Fix | Fix non-standard RLS policy names on `audit_log` for test compatibility |
| 0232 | add_onboarding_task_completions_columns | Alter | Add missing columns to `onboarding_task_completions` (task_id, category, assignee_type, etc.) |
| 0233 | fix_ci_test_failures | Fix | Ensure `set_tenant_context()` exists, create time_events 2026 partitions, add employee_compensation view |
| 0234 | fix_ci_test_failures_round2 | Fix | Fix address constraint, add users name columns, fix manager_subordinates view, fix NMW column references |

---

## Non-Numbered Migrations

| File | Type | Description |
|------|------|-------------|
| fix_schema_migrations_filenames.sql | Fix | Correct migration filenames in the schema_migrations tracking table |

---

## Statistics

| Metric | Count |
|--------|-------|
| Total migration files | 320 |
| Unique migration numbers | 0001--0234 |
| Duplicate numbers (parallel branches) | ~86 files share a number with another file |
| Table creation migrations | ~200 |
| Enum creation migrations | ~15 |
| Alter/enhancement migrations | ~40 |
| Seed data migrations | ~15 |
| Fix/bug-fix migrations | ~20 |
| Index migrations | ~10 |
| Security/RLS migrations | ~8 |
| Function/trigger migrations | ~10 |

### Module Coverage

| Module | First Migration | Key Tables |
|--------|----------------|------------|
| Core Infrastructure | 0001 | tenants, users, sessions, audit_log, domain_outbox |
| RBAC | 0006 | roles, permissions, role_permissions, role_assignments |
| Core HR | 0013 | employees, employee_personal, org_units, positions, employment_contracts |
| Workflows | 0027 | workflow_definitions, workflow_instances, workflow_tasks |
| Time and Attendance | 0035 | time_events, schedules, shifts, timesheets |
| Absence Management | 0046 | leave_types, leave_balances, leave_requests, public_holidays |
| Talent/Recruitment | 0056 | requisitions, candidates, interviews, offers |
| Performance | 0063 | performance_cycles, goals, reviews |
| LMS | 0068 | courses, learning_paths, assignments, certificates |
| Case Management | 0076 | cases, case_comments, case_attachments |
| Onboarding | 0081 | onboarding_templates, onboarding_instances, onboarding_task_completions |
| Better Auth | 0088 | "user", "session", "account", "verification", "twoFactor" |
| Benefits | 0097 | benefit_plans, benefit_enrollments, life_events |
| Succession | 0101 | succession_plans, succession_candidates |
| Competencies | 0102 | competency_frameworks, competencies, employee_competencies |
| Field-Level Security | 0110 | field_registry, role_field_permissions |
| Portal System | 0112 | portals, portal_configurations |
| SSP (UK) | 0124 | ssp_records, ssp_qualifying_days, ssp_fit_notes |
| Statutory Leave (UK) | 0125 | statutory_leave_records, family_leave_notices |
| Right to Work (UK) | 0126 | rtw_checks, rtw_documents |
| GDPR | 0127 | dsar_requests, consent_records, data_erasure_requests, privacy_notices, data_breaches |
| Health and Safety | 0132 | hs_incidents, riddor_reports, risk_assessments |
| Disciplinary/Grievance | 0160 | disciplinary_cases, grievance_cases, case_hearings |
| Payroll | 0149/0161 | payroll_runs, payroll_lines, employee_tax_details, payslips |
| Pension | 0158 | pension_schemes, pension_enrolments, pension_contributions |
| Data Retention | 0162 | retention_policies, retention_reviews |
| Reporting | 0171 | reporting_field_catalog, report_definitions |
| Client Portal | 0187 | portal_users, portal_tickets, portal_licenses |
| Feature Flags | 0218 | feature_flags, feature_flag_overrides |

---

## Duplicate Number Reference

The following migration numbers have multiple files due to parallel feature branches. All files are applied; PostgreSQL migration tracking records each file individually.

| Number | File Count | Files |
|--------|-----------|-------|
| 0076 | 2 | case_enums, notifications |
| 0077 | 2 | case_categories, exports |
| 0078 | 2 | cases, documents |
| 0079 | 2 | case_comments, analytics |
| 0081 | 2 | notifications, onboarding_enums |
| 0082 | 2 | exports, onboarding_templates |
| 0083 | 2 | documents, onboarding_template_tasks |
| 0084 | 2 | analytics, onboarding_instances |
| 0085 | 2 | onboarding_enums, onboarding_task_completions |
| 0086 | 2 | fix_immutable_system_context, onboarding_templates |
| 0087 | 2 | fix_employee_status_history_triggers, onboarding_template_tasks |
| 0088 | 2 | better_auth_tables, onboarding_instances |
| 0089 | 2 | better_auth_core_tables, onboarding_task_completions |
| 0090 | 2 | fix_immutable_system_context, seed_admin_user |
| 0091 | 2 | fix_employee_status_history_triggers, migrate_users_to_better_auth |
| 0092 | 2 | better_auth_tables, better_auth_twofactor_columns |
| 0093 | 2 | better_auth_core_tables, better_auth_session_current_tenant |
| 0094 | 2 | portal_tasks, seed_admin_user |
| 0095 | 2 | org_chart_functions, migrate_users_to_better_auth |
| 0096 | 2 | documents_enhanced, better_auth_twofactor_columns |
| 0097 | 2 | benefits_types, better_auth_session_current_tenant |
| 0098 | 2 | benefit_plans, portal_tasks |
| 0099 | 2 | benefit_enrollments, org_chart_functions |
| 0100 | 2 | documents_enhanced, life_events |
| 0101 | 2 | benefits_types, succession_planning |
| 0102 | 2 | benefit_plans, competencies |
| 0103 | 2 | benefit_enrollments, equipment |
| 0106 | 2 | analytics, jobs |
| 0107 | 2 | competencies, seed_demo_employees |
| 0110 | 2 | field_registry, link_admin_to_demo_data |
| 0155 | 2 | ssp_fit_notes, uk_holiday_entitlement |
| 0157 | 2 | data_breach_enhanced, flexible_working_enhancements |
| 0158 | 2 | pension_auto_enrolment, time_policies |
| 0163 | 3 | reference_checks, tax_codes, training_budgets |
| 0164 | 3 | cpd_records, dbs_checks, deductions |
| 0165 | 3 | assessments, course_ratings, payslips |
| 0174 | 2 | performance_indexes, seed_system_reports |
| 0187 | 2 | client_portal, remove_ssn_enum_value |
| 0191 | 7 | analytics_composite_indexes, employee_change_requests, integrations, ni_categories_updated_at, recruitment_costs, report_schedule_history, tax_codes_enhancements |
| 0192 | 2 | employee_pay_assignments_updates, user_table_sync_trigger |
| 0193 | 3 | api_keys, case_appeals_acas_compliance, sla_escalation_log |
| 0194 | 2 | mandatory_training_compliance, payroll_rti_submissions |
| 0195 | 10 | agency_worker_assignments, announcements, case_hearings, dbs_checks_renewal_tracking, ir35_assessments, one_on_one_meetings, overtime_rules, peer_recognitions, webhook_subscriptions_deliveries, whistleblowing_cases |
| 0196 | 4 | course_prerequisites, employee_suspensions, processing_activities_ropa, toil_management |
| 0198 | 10 | bulk_document_generation, email_delivery_log, employee_addresses_uk_enhancements, lookup_values, onboarding_task_dependencies, payroll_period_locks, policy_distributions, salary_sacrifices, talent_pools, tenant_usage_stats |
| 0199 | 12 | beneficiary_nominations, cost_centre_assignments, data_import_jobs, employee_positions_fte, employment_records, income_protection_insurance, job_board_postings, onboarding_compliance_checks, overtime_requests, payroll_journal_entries, timesheet_approval_chains, tribunal_cases |
| 0200 | 7 | benefits_data_exchanges, calendar_connections, data_archival, feedback_360, international_assignments, push_subscriptions, sso_configurations |
| 0201 | 2 | e_signature_requests, workflow_condition_rules |
| 0211 | 2 | recruitment_analytics_indexes, shift_swaps |
| 0212 | 3 | dpia_assessments, flexible_benefits, total_reward_statements |
| 0213 | 3 | company_cars, mandatory_training, tenant_provisioning_logs |

---

## Creating New Migrations

When adding a new migration:

1. Check the highest existing number: currently **0234**
2. Use 4-digit zero-padded format: `0235_description.sql`
3. All tenant-owned tables must have `tenant_id` + RLS policies
4. Include both `tenant_isolation` (FOR ALL) and `tenant_isolation_insert` (FOR INSERT) policies
5. Use `CREATE TABLE IF NOT EXISTS` and `DO $$ BEGIN ... END $$` for idempotent enum creation
6. See `migrations/README.md` for full conventions
