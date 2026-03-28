# Staffora Enterprise Permissions & Access Control System

> Complete design for a 7-layer enterprise HRIS permissions system.
> Extends the existing RBAC foundation without breaking backwards compatibility.

*Last updated: 2026-03-28*

---

## Table of Contents

1. [Layer 1: Role & Permission Architecture](#layer-1-role--permission-architecture)
2. [Layer 2: Data-Scoped Access](#layer-2-data-scoped-access)
3. [Layer 3: Contextual & Conditional Permissions](#layer-3-contextual--conditional-permissions)
4. [Layer 4: Approval Chains & Delegation](#layer-4-approval-chains--delegation)
5. [Layer 5: Audit, Compliance & Monitoring](#layer-5-audit-compliance--monitoring)
6. [Layer 6: API & Technical Enforcement](#layer-6-api--technical-enforcement)
7. [Layer 7: UI/UX Permission Controls](#layer-7-uiux-permission-controls)
8. [Migration Plan](#migration-plan)
9. [Edge Cases](#edge-cases)

---

## Layer 1: Role & Permission Architecture

### 1.1 System Roles (Immutable, Platform-Defined)

| Role Slug | Purpose | Portal | Scope Default | Max Sensitivity Tier |
|---|---|---|---|---|
| `super_admin` | Platform-level unrestricted access across all tenants | admin | `all` | 4 |
| `tenant_admin` | Full access within a single tenant, cannot grant super_admin | admin | `all` | 4 |
| `hr_admin` | Full HR operations: employee lifecycle, org structure, cases | admin | `all` | 3 |
| `hr_officer` | Day-to-day HR operations: onboarding, contracts, employee edits | admin | `all` | 2 |
| `payroll_admin` | Payroll runs, pay elements, tax codes, pension, payslips | admin | `all` | 3 |
| `recruitment_admin` | Full recruitment lifecycle: postings, candidates, offers, DBS | admin | `all` | 2 |
| `lms_admin` | Learning management: courses, paths, certifications, compliance | admin | `all` | 1 |
| `compliance_officer` | GDPR/data protection: DSARs, breaches, retention, consent | admin | `all` | 3 |
| `health_safety_officer` | H&S incidents, risk assessments, DSE | admin | `all` | 2 |
| `department_head` | Department-wide visibility and approval authority | manager | `department` | 2 |
| `line_manager` | Direct reports management, approvals, performance reviews | manager | `direct_reports` | 1 |
| `team_leader` | Team visibility, limited approvals (no salary/disciplinary) | manager | `direct_reports` | 1 |
| `employee` | Self-service: own profile, leave, time, payslips, learning | employee | `self` | 0 |
| `contractor` | Limited self-service with time-bounded access | employee | `self` | 0 |
| `temp_worker` | Minimal self-service, time entry, no benefits access | employee | `self` | 0 |
| `intern` | Basic self-service, learning access, no compensation visibility | employee | `self` | 0 |
| `external_auditor` | Read-only audit and compliance reports, time-bounded | admin | `all` | 2 |
| `board_member` | Board-level reports, succession plans, executive compensation | admin | `custom` | 4 |

### 1.2 Custom Roles (Tenant-Created)

**Creation Rules:**
- Custom roles always have `tenant_id` set (never NULL)
- Custom roles have `is_system = false`
- Each custom role specifies a `parent_role_id` (optional) for inheritance
- A `permission_ceiling` (max tier) prevents privilege escalation
- Custom roles cannot exceed the permission set of `tenant_admin`
- Custom roles cannot grant `super_admin` privileges
- Maximum 50 custom roles per tenant (configurable)

**Inheritance Model:**
- A custom role may extend a system role via `parent_role_id`
- Inherited permissions are read from the parent; the custom role can only ADD
  permissions within its ceiling, never exceed the parent's scope
- If a parent role's permissions change, all children inherit the change automatically

**Role Templates:**
- System provides clonable templates: "Benefits Administrator", "Payroll Clerk",
  "Regional HR Manager", "IT Admin (user provisioning only)"
- Templates are stored in `app.role_templates` with `is_template = true`
- Cloning creates a new tenant-scoped custom role with copied permissions

### 1.3 Role Hierarchy & Inheritance

```
super_admin (tier 4 — platform)
└── tenant_admin (tier 4 — tenant boundary)
    ├── hr_admin (tier 3)
    │   ├── hr_officer (tier 2)
    │   └── compliance_officer (tier 3)
    ├── payroll_admin (tier 3)
    ├── recruitment_admin (tier 2)
    ├── lms_admin (tier 1)
    ├── health_safety_officer (tier 2)
    ├── department_head (tier 2)
    │   └── line_manager (tier 1)
    │       └── team_leader (tier 1)
    └── board_member (tier 4 — restricted scope)

employee (tier 0 — self only)
├── contractor (tier 0 — time-bounded)
├── temp_worker (tier 0 — minimal)
└── intern (tier 0 — learning-focused)
```

**Conflict Resolution:** When a user has multiple roles, the **most permissive**
permission wins (union of all granted permissions). For data scope, scopes are
**unioned** (e.g., `direct_reports` + `department` = both sets visible).
Constraints are resolved as the **least restrictive** across roles.

**Role Stacking Rules:**
1. All active role assignments are collected at permission resolution time
2. Permission keys from all roles are merged into a single Set
3. For each permission key, the least restrictive constraint applies
4. Sensitivity tier access is the maximum across all roles
5. Portal access is the union of all role portal_types

**Temporary Role Elevation:**
- `role_assignments.effective_from` / `effective_to` for time-bounded assignments
- "Acting manager" = assign `line_manager` role with `effective_to` set
- Holiday cover = delegation system (Layer 4) for approval-specific elevation

### 1.4 Complete Permission Catalog

Format: `module:resource:action` — backwards compatible with existing `resource:action`.

#### Core HR Module (`core_hr`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `employees:create` | Create new employee records | N | hr_admin, hr_officer |
| `employees:read` | View employee records | N | hr_admin, hr_officer, line_manager, department_head |
| `employees:update` | Update employee records | N | hr_admin, hr_officer |
| `employees:delete` | Soft-delete employee records | Y | hr_admin |
| `employees:archive` | Archive terminated employee records | N | hr_admin |
| `employees:restore` | Restore archived employee records | Y | hr_admin |
| `employees:export` | Export employee data | Y | hr_admin, compliance_officer |
| `employees:import` | Bulk import employees | Y | hr_admin |
| `employees:bulk_update` | Bulk update employee fields | Y | hr_admin |
| `employees:view_sensitive` | View Tier 2+ fields (salary, performance) | Y | hr_admin, payroll_admin |
| `employees:edit_sensitive` | Edit Tier 2+ fields | Y | hr_admin |
| `employees:view_salary` | View salary/compensation data | Y | hr_admin, payroll_admin |
| `employees:edit_salary` | Edit salary/compensation data | Y | payroll_admin |
| `employees:view_disciplinary` | View disciplinary records | N | hr_admin, compliance_officer |
| `employees:view_medical` | View medical/health records | Y | hr_admin, health_safety_officer |
| `employees:manage_photos` | Upload/change employee photos | N | hr_admin, hr_officer, employee(self) |
| `positions:create` | Create position definitions | N | hr_admin |
| `positions:read` | View positions | N | hr_admin, hr_officer, line_manager |
| `positions:update` | Update position definitions | N | hr_admin |
| `positions:delete` | Delete vacant positions | N | hr_admin |
| `positions:assign` | Assign employee to position | N | hr_admin, hr_officer |
| `positions:unassign` | Remove employee from position | N | hr_admin |
| `positions:bulk_manage` | Bulk position operations | Y | hr_admin |
| `departments:create` | Create departments/org units | N | hr_admin |
| `departments:read` | View department structure | N | hr_admin, hr_officer, line_manager, employee |
| `departments:update` | Update department details | N | hr_admin |
| `departments:delete` | Delete empty departments | Y | hr_admin |
| `departments:restructure` | Restructure department hierarchy | Y | hr_admin, tenant_admin |
| `org_structure:view` | View org chart | N | all authenticated |
| `org_structure:edit` | Edit org chart relationships | N | hr_admin |
| `org_structure:restructure` | Major restructuring operations | Y | tenant_admin |
| `org_structure:export` | Export org chart data | N | hr_admin |
| `contracts:create` | Create employment contracts | N | hr_admin, hr_officer |
| `contracts:read` | View contract details | N | hr_admin, hr_officer, line_manager(team) |
| `contracts:update` | Update contract details | N | hr_admin |
| `contracts:terminate` | Terminate a contract | Y | hr_admin |
| `contracts:renew` | Renew a contract | N | hr_admin |
| `contracts:amend` | Amend contract terms | Y | hr_admin |
| `contracts:view_terms` | View detailed contract terms | N | hr_admin, employee(self) |
| `emergency_contacts:read` | View emergency contacts | N | hr_admin, line_manager(team) |
| `emergency_contacts:write` | Edit emergency contacts | N | hr_admin, employee(self) |
| `emergency_contacts:manage_for_team` | Edit team's emergency contacts | N | hr_admin |
| `bank_details:read` | View bank details | Y | payroll_admin |
| `bank_details:write` | Edit bank details | Y | payroll_admin, employee(self, via approval) |
| `bank_details:approve_changes` | Approve bank detail changes | Y | payroll_admin |
| `probation:create` | Create probation periods | N | hr_admin, hr_officer |
| `probation:read` | View probation status | N | hr_admin, hr_officer, line_manager(team) |
| `probation:update` | Update probation details | N | hr_admin, hr_officer |
| `probation:extend` | Extend probation period | N | hr_admin |
| `probation:complete` | Mark probation as complete | N | hr_admin, line_manager(team) |
| `probation:fail` | Fail probation | Y | hr_admin |
| `right_to_work:create` | Create RTW records | N | hr_admin, hr_officer |
| `right_to_work:read` | View RTW documents | Y | hr_admin, hr_officer, compliance_officer |
| `right_to_work:update` | Update RTW records | N | hr_admin |
| `right_to_work:verify` | Verify RTW status | N | hr_admin, compliance_officer |
| `right_to_work:expire_alerts` | Configure RTW expiry alerts | N | hr_admin |
| `warnings:create` | Issue formal warnings | N | hr_admin, line_manager |
| `warnings:read` | View warning records | N | hr_admin, line_manager(team) |
| `warnings:update` | Update warning details | N | hr_admin |
| `warnings:escalate` | Escalate warning level | N | hr_admin |
| `warnings:expire` | Mark warning as expired | N | hr_admin |
| `warnings:view_history` | View full warning history | N | hr_admin, compliance_officer |

#### Time & Attendance Module (`time_attendance`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `time_entries:create` | Create time entries | N | employee, line_manager |
| `time_entries:read` | View time entries | N | employee(self), line_manager(team) |
| `time_entries:update` | Update time entries | N | employee(self,draft), hr_admin |
| `time_entries:delete` | Delete time entries | N | hr_admin |
| `time_entries:approve` | Approve time entries | N | line_manager, department_head |
| `time_entries:reject` | Reject time entries | N | line_manager, department_head |
| `time_entries:lock` | Lock time period | Y | hr_admin, payroll_admin |
| `time_entries:unlock` | Unlock time period | Y | hr_admin |
| `time_entries:bulk_approve` | Bulk approve time entries | N | hr_admin, department_head |
| `time_entries:export` | Export time data | N | hr_admin, payroll_admin |
| `timesheets:view_own` | View own timesheets | N | employee |
| `timesheets:view_team` | View team timesheets | N | line_manager, team_leader |
| `timesheets:view_all` | View all timesheets | N | hr_admin, payroll_admin |
| `timesheets:approve` | Approve timesheets | N | line_manager |
| `timesheets:reject` | Reject timesheets | N | line_manager |
| `timesheets:submit` | Submit own timesheet | N | employee |
| `timesheets:recall` | Recall submitted timesheet | N | employee(own,pending) |
| `schedules:create` | Create work schedules | N | hr_admin, line_manager |
| `schedules:read` | View schedules | N | employee(own), line_manager(team), hr_admin |
| `schedules:update` | Update schedules | N | hr_admin, line_manager |
| `schedules:delete` | Delete schedules | N | hr_admin |
| `schedules:assign` | Assign schedule to employees | N | hr_admin, line_manager |
| `schedules:publish` | Publish draft schedules | N | hr_admin, line_manager |
| `schedules:unpublish` | Unpublish schedules | N | hr_admin |
| `overtime:request` | Request overtime | N | employee, line_manager |
| `overtime:approve` | Approve overtime requests | N | line_manager, department_head |
| `overtime:reject` | Reject overtime requests | N | line_manager, department_head |
| `overtime:view_reports` | View overtime reports | N | hr_admin, payroll_admin |
| `geofence:configure` | Configure geofencing rules | Y | hr_admin, tenant_admin |
| `geofence:view_violations` | View geofence violations | N | hr_admin, line_manager |
| `geofence:manage_locations` | Manage geofence locations | N | hr_admin |

#### Absence & Leave Module (`absence`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `leave_requests:create_own` | Submit own leave request | N | employee |
| `leave_requests:view_own` | View own leave requests | N | employee |
| `leave_requests:view_team` | View team leave requests | N | line_manager, team_leader |
| `leave_requests:view_all` | View all leave requests | N | hr_admin |
| `leave_requests:approve` | Approve leave requests | N | line_manager, department_head |
| `leave_requests:reject` | Reject leave requests | N | line_manager, department_head |
| `leave_requests:cancel` | Cancel own pending request | N | employee |
| `leave_requests:force_cancel` | Force cancel any leave request | N | hr_admin |
| `leave_requests:override_balance` | Override leave balance check | Y | hr_admin |
| `leave_types:create` | Create leave types | N | hr_admin |
| `leave_types:read` | View leave types | N | all authenticated |
| `leave_types:update` | Update leave types | N | hr_admin |
| `leave_types:delete` | Delete leave types | Y | hr_admin |
| `leave_types:configure_accrual` | Configure accrual rules | N | hr_admin |
| `leave_policies:create` | Create leave policies | N | hr_admin |
| `leave_policies:read` | View leave policies | N | hr_admin, hr_officer |
| `leave_policies:update` | Update leave policies | N | hr_admin |
| `leave_policies:delete` | Delete leave policies | Y | hr_admin |
| `leave_policies:assign` | Assign policies to groups | N | hr_admin |
| `leave_balances:view_own` | View own leave balances | N | employee |
| `leave_balances:view_team` | View team leave balances | N | line_manager |
| `leave_balances:view_all` | View all leave balances | N | hr_admin |
| `leave_balances:adjust` | Manually adjust balances | Y | hr_admin |
| `leave_balances:carry_forward` | Process carry-forward | N | hr_admin |
| `ssp:create` | Create SSP records | N | hr_admin, hr_officer |
| `ssp:read` | View SSP records | N | hr_admin, payroll_admin |
| `ssp:update` | Update SSP records | N | hr_admin |
| `ssp:calculate` | Calculate SSP entitlements | N | payroll_admin |
| `ssp:manage_fit_notes` | Manage fit notes | N | hr_admin |
| `parental_leave:request` | Request parental leave | N | employee |
| `parental_leave:approve` | Approve parental leave | N | hr_admin |
| `parental_leave:configure` | Configure parental leave policies | N | hr_admin |
| `parental_leave:view_reports` | View parental leave reports | N | hr_admin |
| `bereavement:request` | Request bereavement leave | N | employee |
| `bereavement:approve` | Approve bereavement leave | N | line_manager, hr_admin |
| `bereavement:configure` | Configure bereavement policies | N | hr_admin |
| `carers_leave:request` | Request carer's leave | N | employee |
| `carers_leave:approve` | Approve carer's leave | N | line_manager, hr_admin |
| `carers_leave:configure` | Configure carer's leave policies | N | hr_admin |

#### Payroll Module (`payroll`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `payroll_runs:create` | Create payroll run | Y | payroll_admin |
| `payroll_runs:read` | View payroll runs | Y | payroll_admin, tenant_admin |
| `payroll_runs:approve` | Approve payroll run | Y | tenant_admin |
| `payroll_runs:reject` | Reject payroll run | Y | tenant_admin |
| `payroll_runs:lock` | Lock payroll run | Y | payroll_admin |
| `payroll_runs:export` | Export payroll data | Y | payroll_admin |
| `payroll_runs:reopen` | Reopen locked payroll run | Y | tenant_admin |
| `pay_elements:create` | Create pay elements | N | payroll_admin |
| `pay_elements:read` | View pay elements | N | payroll_admin |
| `pay_elements:update` | Update pay elements | N | payroll_admin |
| `pay_elements:delete` | Delete pay elements | Y | payroll_admin |
| `deductions:create` | Create deductions | N | payroll_admin |
| `deductions:read` | View deductions | N | payroll_admin |
| `deductions:update` | Update deductions | N | payroll_admin |
| `deductions:delete` | Delete deductions | Y | payroll_admin |
| `deductions:approve` | Approve deduction changes | Y | payroll_admin |
| `tax_codes:view` | View tax codes | N | payroll_admin |
| `tax_codes:update` | Update tax codes | Y | payroll_admin |
| `tax_codes:import` | Import HMRC tax codes | Y | payroll_admin |
| `tax_codes:verify` | Verify tax code accuracy | N | payroll_admin |
| `pension:configure` | Configure pension schemes | Y | payroll_admin |
| `pension:view` | View pension details | N | payroll_admin, employee(self) |
| `pension:auto_enrol` | Run auto-enrolment assessment | Y | payroll_admin |
| `pension:opt_out` | Process pension opt-outs | N | payroll_admin |
| `pension:assess` | Assess pension eligibility | N | payroll_admin |
| `payslips:generate` | Generate payslips | Y | payroll_admin |
| `payslips:view_own` | View own payslips | N | employee |
| `payslips:view_all` | View all payslips | Y | payroll_admin |
| `payslips:distribute` | Distribute payslips | N | payroll_admin |
| `payslips:reissue` | Reissue payslips | N | payroll_admin |
| `bonus_payments:create` | Create bonus payments | Y | hr_admin, payroll_admin |
| `bonus_payments:approve` | Approve bonus payments | Y | tenant_admin |
| `bonus_payments:reject` | Reject bonus payments | Y | tenant_admin |
| `bonus_payments:view_reports` | View bonus reports | Y | hr_admin, payroll_admin |
| `p45_p60:generate` | Generate P45/P60 documents | Y | payroll_admin |
| `p45_p60:view` | View P45/P60 documents | N | payroll_admin, employee(self) |
| `p45_p60:distribute` | Distribute P45/P60 documents | N | payroll_admin |

#### Talent Management Module (`talent`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `performance_reviews:create` | Create performance reviews | N | hr_admin, line_manager |
| `performance_reviews:read` | View performance reviews | N | hr_admin, line_manager(team), employee(self) |
| `performance_reviews:update` | Update performance reviews | N | hr_admin, line_manager(team) |
| `performance_reviews:submit` | Submit completed review | N | line_manager |
| `performance_reviews:approve` | Approve/finalise reviews | N | hr_admin, department_head |
| `performance_reviews:calibrate` | Calibrate ratings across teams | Y | hr_admin, department_head |
| `performance_reviews:view_ratings` | View calibrated ratings | N | hr_admin |
| `performance_reviews:override_rating` | Override final rating | Y | hr_admin |
| `goals:create_own` | Create own goals | N | employee |
| `goals:create_for_team` | Create goals for team | N | line_manager |
| `goals:read` | View goals | N | employee(self), line_manager(team) |
| `goals:update` | Update goals | N | employee(own), line_manager(team) |
| `goals:cascade` | Cascade goals down hierarchy | N | hr_admin, department_head |
| `goals:align` | Align goals to org objectives | N | hr_admin |
| `competencies:define` | Define competency frameworks | N | hr_admin |
| `competencies:assess` | Assess competencies | N | line_manager |
| `competencies:view_matrix` | View competency matrix | N | hr_admin, line_manager |
| `competencies:manage_frameworks` | Manage frameworks | N | hr_admin |
| `succession:view_plans` | View succession plans | Y | hr_admin, board_member |
| `succession:create_plans` | Create succession plans | Y | hr_admin |
| `succession:nominate` | Nominate successors | N | hr_admin, department_head |
| `succession:assess_readiness` | Assess successor readiness | N | hr_admin |
| `training_budgets:allocate` | Allocate training budgets | N | hr_admin, department_head |
| `training_budgets:view` | View training budgets | N | hr_admin, department_head, lms_admin |
| `training_budgets:approve_spend` | Approve training spend | N | department_head |
| `training_budgets:view_reports` | View budget reports | N | hr_admin |
| `cpd:create` | Create CPD records | N | employee, lms_admin |
| `cpd:read` | View CPD records | N | employee(self), line_manager(team), lms_admin |
| `cpd:approve` | Approve CPD submissions | N | line_manager, lms_admin |
| `cpd:view_reports` | View CPD reports | N | hr_admin, lms_admin |

#### Recruitment Module (`recruitment`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `job_postings:create` | Create job postings | N | recruitment_admin, hr_admin |
| `job_postings:read` | View job postings | N | recruitment_admin, hr_admin, line_manager |
| `job_postings:update` | Update job postings | N | recruitment_admin |
| `job_postings:publish` | Publish job postings | N | recruitment_admin |
| `job_postings:unpublish` | Unpublish job postings | N | recruitment_admin |
| `job_postings:close` | Close job postings | N | recruitment_admin |
| `candidates:create` | Add candidates | N | recruitment_admin |
| `candidates:read` | View candidate profiles | N | recruitment_admin, line_manager(hiring) |
| `candidates:update` | Update candidate details | N | recruitment_admin |
| `candidates:reject` | Reject candidates | N | recruitment_admin, line_manager |
| `candidates:shortlist` | Shortlist candidates | N | recruitment_admin, line_manager |
| `candidates:view_sensitive` | View sensitive candidate data | Y | recruitment_admin |
| `interviews:schedule` | Schedule interviews | N | recruitment_admin |
| `interviews:conduct` | Record interview conducted | N | line_manager, recruitment_admin |
| `interviews:score` | Score interviews | N | line_manager |
| `interviews:view_feedback` | View all interview feedback | N | recruitment_admin |
| `offers:create` | Create job offers | N | recruitment_admin |
| `offers:approve` | Approve job offers | Y | hr_admin, department_head |
| `offers:send` | Send offers to candidates | N | recruitment_admin |
| `offers:withdraw` | Withdraw offers | Y | recruitment_admin, hr_admin |
| `offers:negotiate` | Negotiate offer terms | N | recruitment_admin |
| `assessments:create` | Create assessments | N | recruitment_admin |
| `assessments:assign` | Assign assessments | N | recruitment_admin |
| `assessments:score` | Score assessments | N | recruitment_admin, line_manager |
| `assessments:view_results` | View assessment results | N | recruitment_admin |
| `dbs_checks:request` | Request DBS checks | N | recruitment_admin, hr_admin |
| `dbs_checks:view` | View DBS check status | N | recruitment_admin, hr_admin |
| `dbs_checks:update_status` | Update DBS check status | N | recruitment_admin |
| `dbs_checks:view_sensitive` | View DBS results detail | Y | hr_admin, compliance_officer |
| `reference_checks:request` | Request references | N | recruitment_admin |
| `reference_checks:view` | View references | N | recruitment_admin, hr_admin |
| `reference_checks:complete` | Complete reference check | N | recruitment_admin |
| `reference_checks:verify` | Verify reference authenticity | N | hr_admin |
| `agencies:create` | Add recruitment agencies | N | recruitment_admin |
| `agencies:read` | View agency details | N | recruitment_admin |
| `agencies:update` | Update agency details | N | recruitment_admin |
| `agencies:manage_terms` | Manage agency terms/rates | Y | recruitment_admin, hr_admin |
| `agencies:view_fees` | View agency fees | N | recruitment_admin, hr_admin |

#### Learning (LMS) Module (`lms`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `courses:create` | Create courses | N | lms_admin |
| `courses:read` | View course catalog | N | all authenticated |
| `courses:update` | Update courses | N | lms_admin |
| `courses:delete` | Delete courses | Y | lms_admin |
| `courses:publish` | Publish courses | N | lms_admin |
| `courses:assign` | Assign courses to individuals | N | lms_admin, line_manager |
| `courses:bulk_assign` | Bulk assign courses | N | lms_admin |
| `learning_paths:create` | Create learning paths | N | lms_admin |
| `learning_paths:read` | View learning paths | N | all authenticated |
| `learning_paths:update` | Update learning paths | N | lms_admin |
| `learning_paths:assign` | Assign learning paths | N | lms_admin |
| `certifications:issue` | Issue certifications | N | lms_admin |
| `certifications:revoke` | Revoke certifications | Y | lms_admin |
| `certifications:verify` | Verify certifications | N | lms_admin, hr_admin |
| `certifications:view_expiring` | View expiring certs | N | lms_admin, line_manager |
| `course_ratings:submit` | Submit course ratings | N | employee |
| `course_ratings:view` | View course ratings | N | lms_admin |
| `course_ratings:moderate` | Moderate course ratings | N | lms_admin |
| `mandatory_training:configure` | Configure mandatory training | N | lms_admin, compliance_officer |
| `mandatory_training:assign` | Assign mandatory training | N | lms_admin |
| `mandatory_training:track_compliance` | Track compliance status | N | lms_admin, hr_admin |
| `mandatory_training:escalate` | Escalate non-compliance | N | lms_admin, hr_admin |

#### Cases & Disciplinary Module (`cases`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `cases:create` | Create HR cases | N | hr_admin, hr_officer |
| `cases:read` | View assigned cases | N | hr_admin, hr_officer |
| `cases:update` | Update case details | N | hr_admin, hr_officer |
| `cases:close` | Close cases | N | hr_admin |
| `cases:reopen` | Reopen closed cases | Y | hr_admin |
| `cases:escalate` | Escalate cases | N | hr_admin, hr_officer |
| `cases:assign` | Assign cases to handlers | N | hr_admin |
| `cases:view_all` | View all cases in tenant | N | hr_admin |
| `cases:view_sensitive` | View sensitive case details | Y | hr_admin, compliance_officer |
| `cases:add_notes` | Add case notes | N | hr_admin, hr_officer |
| `cases:manage_documents` | Manage case documents | N | hr_admin |
| `disciplinary:initiate` | Initiate disciplinary process | N | hr_admin, line_manager |
| `disciplinary:view` | View disciplinary records | N | hr_admin |
| `disciplinary:update` | Update disciplinary details | N | hr_admin |
| `disciplinary:escalate` | Escalate disciplinary action | N | hr_admin |
| `disciplinary:close` | Close disciplinary case | N | hr_admin |
| `disciplinary:appeal` | Process appeal | N | hr_admin |
| `disciplinary:view_acas` | View ACAS guidance/records | N | hr_admin, compliance_officer |
| `grievances:submit` | Submit grievance | N | employee |
| `grievances:view` | View grievances | N | hr_admin |
| `grievances:investigate` | Investigate grievances | N | hr_admin |
| `grievances:resolve` | Resolve grievances | N | hr_admin |
| `grievances:appeal` | Process grievance appeals | N | hr_admin |

#### Onboarding Module (`onboarding`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `onboarding_templates:create` | Create onboarding templates | N | hr_admin |
| `onboarding_templates:read` | View templates | N | hr_admin, hr_officer |
| `onboarding_templates:update` | Update templates | N | hr_admin |
| `onboarding_templates:delete` | Delete templates | Y | hr_admin |
| `onboarding_templates:publish` | Publish templates | N | hr_admin |
| `onboarding_templates:clone` | Clone templates | N | hr_admin |
| `onboarding_instances:create` | Create onboarding instance | N | hr_admin, hr_officer |
| `onboarding_instances:view` | View onboarding progress | N | hr_admin, line_manager(team) |
| `onboarding_instances:manage` | Manage onboarding tasks | N | hr_admin, hr_officer |
| `onboarding_instances:complete_task` | Complete a task | N | employee(assigned), line_manager |
| `onboarding_instances:reassign` | Reassign tasks | N | hr_admin |
| `onboarding_checklists:view_own` | View own checklist | N | employee |
| `onboarding_checklists:view_all` | View all checklists | N | hr_admin |
| `onboarding_checklists:update_progress` | Update progress | N | employee(own), hr_admin |
| `onboarding_checklists:sign_off` | Sign off completed onboarding | N | hr_admin, line_manager |

#### Documents Module (`documents`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `documents:upload` | Upload documents | N | employee(self), hr_admin |
| `documents:read` | View documents | N | employee(own), hr_admin |
| `documents:update` | Update document metadata | N | hr_admin |
| `documents:delete` | Delete documents | Y | hr_admin |
| `documents:share` | Share documents with others | N | hr_admin |
| `documents:version` | Create new document versions | N | hr_admin |
| `documents:archive` | Archive documents | N | hr_admin |
| `document_templates:create` | Create document templates | N | hr_admin |
| `document_templates:read` | View document templates | N | hr_admin, hr_officer |
| `document_templates:update` | Update templates | N | hr_admin |
| `document_templates:delete` | Delete templates | Y | hr_admin |
| `document_templates:merge` | Merge data into templates | N | hr_admin |
| `document_templates:generate` | Generate documents from templates | N | hr_admin, hr_officer |
| `contracts_docs:generate` | Generate contract documents | N | hr_admin |
| `contracts_docs:sign` | Sign contract (employee) | N | employee |
| `contracts_docs:countersign` | Countersign contract (employer) | N | hr_admin |
| `contracts_docs:view` | View contract documents | N | employee(own), hr_admin |
| `contracts_docs:archive` | Archive contract documents | N | hr_admin |
| `letters:generate` | Generate letters | N | hr_admin, hr_officer |
| `letters:approve` | Approve letters | N | hr_admin |
| `letters:send` | Send letters | N | hr_admin |
| `letters:view_templates` | View letter templates | N | hr_admin, hr_officer |

#### Benefits Module (`benefits`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `benefit_plans:create` | Create benefit plans | N | hr_admin |
| `benefit_plans:read` | View benefit plans | N | hr_admin, employee |
| `benefit_plans:update` | Update benefit plans | N | hr_admin |
| `benefit_plans:delete` | Delete benefit plans | Y | hr_admin |
| `benefit_plans:publish` | Publish benefit plans | N | hr_admin |
| `enrollments:enrol_self` | Self-enrol in benefits | N | employee |
| `enrollments:enrol_team` | Enrol team members | N | hr_admin |
| `enrollments:approve` | Approve benefit enrolments | N | hr_admin |
| `enrollments:reject` | Reject benefit enrolments | N | hr_admin |
| `enrollments:view_all` | View all enrolments | N | hr_admin |
| `life_events:submit` | Submit life event | N | employee |
| `life_events:approve` | Approve life event | N | hr_admin |
| `life_events:process` | Process life event changes | N | hr_admin |
| `life_events:view` | View life events | N | hr_admin |

#### Compliance & Data Protection Module (`compliance`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `dsar:submit` | Submit data subject access request | N | employee |
| `dsar:view` | View DSARs | N | compliance_officer |
| `dsar:process` | Process DSARs | Y | compliance_officer |
| `dsar:extend` | Extend DSAR deadline | Y | compliance_officer |
| `dsar:complete` | Mark DSAR complete | Y | compliance_officer |
| `dsar:export` | Export DSAR data | Y | compliance_officer |
| `data_breach:report` | Report data breach | N | all authenticated |
| `data_breach:investigate` | Investigate breach | Y | compliance_officer |
| `data_breach:notify` | Notify ICO/data subjects | Y | compliance_officer, tenant_admin |
| `data_breach:close` | Close breach record | Y | compliance_officer |
| `data_breach:view_all` | View all breaches | Y | compliance_officer, tenant_admin |
| `consent:manage` | Manage consent records | N | compliance_officer |
| `consent:view_audit` | View consent audit trail | N | compliance_officer |
| `consent:configure_purposes` | Configure consent purposes | N | compliance_officer |
| `data_erasure:request` | Request data erasure | N | employee, compliance_officer |
| `data_erasure:approve` | Approve erasure request | Y | compliance_officer |
| `data_erasure:execute` | Execute data erasure | Y | compliance_officer (two-person rule) |
| `data_erasure:verify` | Verify erasure completed | Y | compliance_officer |
| `data_erasure:view_log` | View erasure log | N | compliance_officer |
| `data_retention:configure` | Configure retention policies | Y | compliance_officer, tenant_admin |
| `data_retention:view_policies` | View retention policies | N | compliance_officer |
| `data_retention:execute_purge` | Execute data purge | Y | compliance_officer (two-person rule) |
| `data_retention:audit` | Audit retention compliance | N | compliance_officer |
| `privacy_notices:create` | Create privacy notices | N | compliance_officer |
| `privacy_notices:update` | Update privacy notices | N | compliance_officer |
| `privacy_notices:publish` | Publish privacy notices | N | compliance_officer |
| `privacy_notices:view_acceptance` | View notice acceptance | N | compliance_officer |
| `gender_pay_gap:generate` | Generate GPG report | Y | hr_admin, compliance_officer |
| `gender_pay_gap:view` | View GPG reports | N | hr_admin, compliance_officer |
| `gender_pay_gap:submit` | Submit to gov.uk | Y | compliance_officer |
| `gender_pay_gap:export` | Export GPG data | Y | compliance_officer |
| `diversity_monitoring:configure` | Configure diversity fields | N | compliance_officer |
| `diversity_monitoring:view_reports` | View diversity reports | N | hr_admin, compliance_officer |
| `diversity_monitoring:export` | Export diversity data | Y | compliance_officer |
| `nmw_compliance:check` | Run NMW compliance check | N | payroll_admin, compliance_officer |
| `nmw_compliance:view_alerts` | View NMW alerts | N | payroll_admin |
| `nmw_compliance:resolve` | Resolve NMW issues | N | payroll_admin |
| `nmw_compliance:export` | Export NMW compliance data | Y | compliance_officer |

#### Workflows & Approvals Module (`workflows`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `workflows:create` | Create workflow definitions | N | hr_admin, tenant_admin |
| `workflows:read` | View workflow definitions | N | hr_admin |
| `workflows:update` | Update workflow definitions | N | hr_admin |
| `workflows:delete` | Delete workflow definitions | Y | hr_admin |
| `workflows:activate` | Activate workflows | N | hr_admin |
| `workflows:deactivate` | Deactivate workflows | N | hr_admin |
| `workflow_instances:view` | View running instances | N | hr_admin, participant |
| `workflow_instances:approve` | Approve workflow step | N | designated approver |
| `workflow_instances:reject` | Reject workflow step | N | designated approver |
| `workflow_instances:escalate` | Manually escalate | N | hr_admin |
| `workflow_instances:reassign` | Reassign approval step | N | hr_admin |
| `approval_chains:configure` | Configure approval chains | N | hr_admin, tenant_admin |
| `approval_chains:view` | View approval chain config | N | hr_admin |
| `approval_chains:override` | Override approval chain | Y | tenant_admin |

#### Analytics & Reports Module (`reporting`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `reports:view_standard` | View standard reports | N | hr_admin, hr_officer |
| `reports:view_custom` | View custom reports | N | hr_admin |
| `reports:create_custom` | Create custom reports | N | hr_admin |
| `reports:schedule` | Schedule report delivery | N | hr_admin |
| `reports:export` | Export report data | Y | hr_admin |
| `reports:share` | Share reports with others | N | hr_admin |
| `reports:delete_custom` | Delete custom reports | N | hr_admin |
| `dashboards:view` | View dashboards | N | hr_admin, line_manager |
| `dashboards:customise` | Customise own dashboard | N | hr_admin, line_manager |
| `dashboards:create` | Create shared dashboards | N | hr_admin |
| `dashboards:share` | Share dashboards | N | hr_admin |
| `dashboards:manage_widgets` | Manage dashboard widgets | N | hr_admin |
| `analytics:view_workforce` | View workforce analytics | N | hr_admin |
| `analytics:view_absence` | View absence analytics | N | hr_admin, line_manager |
| `analytics:view_turnover` | View turnover analytics | N | hr_admin |
| `analytics:view_headcount` | View headcount analytics | N | hr_admin |
| `analytics:view_compensation` | View compensation analytics | Y | hr_admin, payroll_admin |
| `analytics:view_diversity` | View diversity analytics | N | hr_admin, compliance_officer |
| `analytics:export` | Export analytics data | Y | hr_admin |

#### System & Security Module (`security`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `users:create` | Create user accounts | Y | tenant_admin |
| `users:read` | View user accounts | N | tenant_admin, hr_admin |
| `users:update` | Update user accounts | Y | tenant_admin |
| `users:deactivate` | Deactivate user accounts | Y | tenant_admin |
| `users:reset_password` | Reset user passwords | Y | tenant_admin |
| `users:unlock` | Unlock locked accounts | Y | tenant_admin |
| `users:manage_mfa` | Manage MFA settings | Y | tenant_admin |
| `users:impersonate` | Impersonate another user | Y | super_admin |
| `roles:create` | Create custom roles | Y | tenant_admin |
| `roles:read` | View roles | N | tenant_admin, hr_admin |
| `roles:update` | Update custom roles | Y | tenant_admin |
| `roles:delete` | Delete custom roles | Y | tenant_admin |
| `roles:assign` | Assign roles to users | Y | tenant_admin |
| `roles:unassign` | Remove roles from users | Y | tenant_admin |
| `roles:manage_permissions` | Manage role permissions | Y | tenant_admin |
| `audit_log:view` | View audit logs | Y | tenant_admin, compliance_officer |
| `audit_log:export` | Export audit logs | Y | tenant_admin, compliance_officer |
| `audit_log:configure_retention` | Configure log retention | Y | tenant_admin |
| `settings:view` | View system settings | N | tenant_admin |
| `settings:update` | Update system settings | Y | tenant_admin |
| `settings:manage_integrations` | Manage integrations | Y | tenant_admin |
| `delegations:create` | Create approval delegations | N | line_manager, department_head |
| `delegations:revoke` | Revoke delegations | N | line_manager, hr_admin |
| `delegations:view` | View active delegations | N | line_manager, hr_admin |
| `delegations:manage_for_org` | Manage org-wide delegations | N | hr_admin |
| `field_permissions:view` | View FLS configuration | N | tenant_admin |
| `field_permissions:configure` | Configure FLS | Y | tenant_admin |
| `field_permissions:manage_sensitive` | Manage sensitive field access | Y | tenant_admin |
| `portal_access:grant` | Grant portal access | N | tenant_admin |
| `portal_access:revoke` | Revoke portal access | N | tenant_admin |
| `portal_access:configure` | Configure portal settings | N | tenant_admin |
| `api_keys:create` | Create API keys | Y | tenant_admin |
| `api_keys:view` | View API keys | Y | tenant_admin |
| `api_keys:revoke` | Revoke API keys | Y | tenant_admin |
| `api_keys:manage_scopes` | Manage API key scopes | Y | tenant_admin |

#### Health & Safety Module (`health_safety`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `incidents:report` | Report H&S incidents | N | all authenticated |
| `incidents:view` | View incident records | N | health_safety_officer, hr_admin |
| `incidents:investigate` | Investigate incidents | N | health_safety_officer |
| `incidents:close` | Close incident records | N | health_safety_officer |
| `incidents:view_reports` | View incident reports | N | health_safety_officer, hr_admin |
| `risk_assessments:create` | Create risk assessments | N | health_safety_officer |
| `risk_assessments:view` | View risk assessments | N | health_safety_officer, line_manager |
| `risk_assessments:update` | Update risk assessments | N | health_safety_officer |
| `risk_assessments:approve` | Approve risk assessments | N | health_safety_officer |
| `risk_assessments:review` | Review risk assessments | N | health_safety_officer |
| `dse_assessments:submit` | Submit DSE self-assessment | N | employee |
| `dse_assessments:view` | View DSE assessments | N | health_safety_officer, line_manager(team) |
| `dse_assessments:action` | Action DSE assessment items | N | health_safety_officer |
| `dse_assessments:review` | Review DSE assessments | N | health_safety_officer |

#### Equipment Module (`equipment`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `equipment:assign` | Assign equipment to employees | N | hr_admin, line_manager |
| `equipment:return` | Process equipment returns | N | hr_admin |
| `equipment:view` | View equipment records | N | employee(own), hr_admin |
| `equipment:manage_inventory` | Manage equipment inventory | N | hr_admin |
| `equipment:write_off` | Write off equipment | Y | hr_admin, tenant_admin |

#### Headcount Planning Module (`headcount`)

| Permission Key | Description | MFA | Default Roles |
|---|---|---|---|
| `headcount:view_plans` | View headcount plans | N | hr_admin, department_head |
| `headcount:create_plans` | Create headcount plans | N | hr_admin |
| `headcount:approve` | Approve headcount plans | Y | tenant_admin |
| `headcount:forecast` | Run headcount forecasts | N | hr_admin |
| `headcount:lock` | Lock approved plans | Y | hr_admin |

---

## Layer 2: Data-Scoped Access

### 2.1 Scope Types

Each permission can be qualified by a **data scope** that limits WHOSE data the
permission applies to.

| Scope | Description | SQL Condition |
|---|---|---|
| `self` | Only the user's own record | `e.user_id = :currentUserId` |
| `direct_reports` | Direct team (1 level) | `e.user_id IN (SELECT subordinate_id FROM app.get_direct_reports(:userId))` |
| `indirect_reports` | Full downline (all levels) | `e.user_id IN (SELECT subordinate_id FROM app.get_all_subordinates(:userId))` |
| `department` | Everyone in user's department(s) | `e.department_id IN (:userDepartmentIds)` |
| `division` | Everyone in user's division | `e.division_id IN (:userDivisionIds)` |
| `location` | Everyone at user's location(s) | `e.location_id IN (:userLocationIds)` |
| `cost_centre` | Everyone in user's cost centre(s) | `e.cost_centre_id IN (:userCostCentreIds)` |
| `legal_entity` | Everyone in user's legal entity | `e.legal_entity_id IN (:userLegalEntityIds)` |
| `all` | Everyone in the tenant | (no filter) |
| `custom` | Custom employee group/tag filter | `e.id IN (SELECT employee_id FROM app.scope_members WHERE scope_id = :scopeId)` |

### 2.2 Scope Stacking

When a user has multiple scopes from multiple roles, they are **unioned** (most
permissive). Example: a user with `direct_reports` from line_manager role AND
`department` from a custom "Department Coordinator" role can see all direct
reports AND all department members.

### 2.3 Cross-Entity Access

Cross-legal-entity access is handled via explicit `scope_overrides` on the
role assignment. The `constraints` JSONB on `role_assignments` can include:

```json
{
  "scope": "legal_entity",
  "legal_entity_ids": ["uuid-entity-a", "uuid-entity-b"],
  "cross_entity": true
}
```

### 2.4 Sensitive Data Tiers

| Tier | Classification | Fields | Default Access |
|---|---|---|---|
| **0** Public | Name, job title, department, work email, work phone, photo | All authenticated users |
| **1** Internal | Start date, manager, location, cost centre, contract type | employee(self), manager(team), hr_admin |
| **2** Restricted | Salary, bonus, performance rating, disciplinary records, warnings | hr_admin, payroll_admin(salary), compliance_officer(disciplinary) |
| **3** Confidential | Medical records, bank details, NI number, DBS results, RTW docs, diversity data | hr_admin(MFA), payroll_admin(bank/MFA), compliance_officer(RTW/MFA) |
| **4** Privileged | Succession plans, redundancy lists, investigation details, board compensation | tenant_admin(MFA), board_member(compensation only), super_admin |

**FLS Override**: The `role_field_permissions` table provides per-field granularity
that can override tier defaults. The most permissive permission across all user roles
wins (existing behaviour preserved).

---

## Layer 3: Contextual & Conditional Permissions

### 3.1 Time-Based Permissions

Implemented via `permission_conditions` table:

| Condition Type | Description | Implementation |
|---|---|---|
| `payroll_lock` | No edits after payroll period close | Check `payroll_periods.is_locked`; deny `time_entries:update` if locked |
| `review_window` | Performance ratings only during cycle | Check `performance_cycles.is_active`; deny `performance_reviews:update` outside window |
| `probation_extended` | Extended access for probation manager | Probation manager gets `probation:*` scoped to probationary employee during period |
| `notice_period` | Restricted access for departing employee | Employee on notice: read-only access, cannot approve, cannot export |
| `holiday_cover` | Temporary elevated access via delegation | Delegation system (Layer 4) with auto-expiry |

### 3.2 Workflow-Based Permissions

| State | Who Can Act | Allowed Actions |
|---|---|---|
| `draft` | Creator only | edit, submit, delete |
| `pending_approval` | Designated approver(s) only | approve, reject, request_changes |
| `approved` | No edits (admin override only) | admin can unlock |
| `rejected` | Original submitter | edit, resubmit, withdraw |
| `locked` | Nobody (admin can unlock) | admin can unlock with MFA |

### 3.3 Employment Status-Based

| Status | System Access | Permission Modifications |
|---|---|---|
| `active` | Full access per role | Standard permissions apply |
| `on_leave` | Read-only access | Can view data, submit emergency requests; cannot create/approve |
| `suspended` | **No access** | All sessions terminated, login blocked |
| `terminated` | **No access** | Account deactivated, data retained per retention policy |
| `pre_hire` | Onboarding portal only | Can complete onboarding tasks, submit personal details |
| `notice_period` | Reduced access | Read-only + limited self-service; cannot export data |

### 3.4 Compliance-Driven Permissions

| Requirement | Enforcement |
|---|---|
| GDPR data minimisation | Field-level security hides fields not needed for the user's current task context |
| Right to be forgotten | `data_erasure:execute` permission exists; two-person rule enforced |
| Audit trail immutability | `audit_log` table has `BEFORE UPDATE/DELETE` triggers that raise exceptions |
| Separation of duties | `separation_of_duties` rules table; checked at approval time |

---

## Layer 4: Approval Chains & Delegation

### 4.1 Multi-Level Approval Routing

Stored in `app.approval_chain_definitions`:

```
approval_type: 'leave_request' | 'expense' | 'recruitment' | 'payroll' | 'contract_change' | 'salary_change'
steps: [
  { level: 1, approver_type: 'line_manager', skip_if: { condition: 'amount_below', value: 100 } },
  { level: 2, approver_type: 'department_head', skip_if: null },
  { level: 3, approver_type: 'role:hr_admin', skip_if: null }
]
parallel: false
escalation_hours: 48
sla_hours: 24
```

### 4.2 Delegation Rules

| Rule | Enforcement |
|---|---|
| Who can delegate | Any user with approval permissions + `delegations:create` |
| What can be delegated | Scoped by `approval_delegations.scope` (e.g., 'leave', 'expenses') |
| Amount limits | `scope_filters.max_amount` on delegation record |
| Duration limits | Max 90 days per delegation (configurable per tenant) |
| Chain prevention | Delegate cannot re-delegate (checked at delegation creation) |
| Notification | Delegator notified on every delegated action |
| Auto-expiry | Cron job deactivates expired delegations; notification sent |
| Emergency delegation | HR admin can create delegation on behalf of any manager |

### 4.3 Separation of Duties

Stored in `app.separation_of_duties_rules`:

| Rule | Description |
|---|---|
| `self_approval` | Cannot approve own requests (leave, expenses, salary changes) |
| `payroll_segregation` | Cannot both create AND approve payroll runs |
| `recruitment_segregation` | Interviewer cannot be sole hiring decision maker |
| `two_person_rule` | Data erasure and salary bulk updates require two approvers |
| `four_eyes_payroll` | Payroll requires creator ≠ approver |

---

## Layer 5: Audit, Compliance & Monitoring

### 5.1 Permission Audit Trail

Every permission-related event is logged to `app.audit_log`:
- Permission check attempts (resource, action, result, user, IP, timestamp)
- Role assignment/removal
- Permission grant/revoke on roles
- Delegation creation/usage/expiry
- Field-level permission changes
- Sensitive data access (Tier 2+)

The audit log is **append-only** (existing implementation with UPDATE/DELETE triggers).

### 5.2 Access Reviews

`app.access_review_campaigns` table:
- Quarterly campaigns auto-generated
- Manager reviews team permissions
- HR reviews admin-level access
- Stale permission detection: flag unused permissions for >90 days
- Orphaned access cleanup: auto-revoke for terminated employees

### 5.3 Anomaly Detection

`app.security_alerts` table, populated by background jobs:
- Bulk data export (>1000 records in single request)
- Off-hours access (configurable per tenant)
- Permission escalation attempts (3+ denied requests in 5 minutes)
- Failed access threshold (10+ failures in 1 hour)
- Cross-tenant access attempts
- Sensitive data access frequency (>50 Tier 3 accesses per hour)

### 5.4 Compliance Reports

Pre-built report definitions:
- **Permission Matrix**: roles × permissions grid
- **Who Has Access To What**: per-user effective permission dump
- **Sensitive Data Access Log**: Tier 2+ access events over time period
- **Permission Changes**: role/permission modifications timeline
- **SoD Violations**: separation of duties violation report
- **GDPR Article 30**: records of processing activities

---

## Layer 6: API & Technical Enforcement

### 6.1 Backend Enforcement Points

```
Request Flow:
  1. Route Guard (beforeHandle) → requirePermission('resource', 'action')
  2. Service Layer → business logic validation + scope checking
  3. Repository Layer → query scoping by data access rules
  4. Database RLS → tenant isolation (cannot be bypassed)
```

### 6.2 Performance Requirements

| Operation | Target | Strategy |
|---|---|---|
| Permission check (cached) | < 5ms | Redis-cached effective permissions, 15-min TTL |
| Permission check (uncached) | < 50ms | Optimised SQL with proper indexes |
| Bulk field permission check | < 10ms | Pre-computed field permission map (cached) |
| Cache invalidation | Immediate | Invalidate on role/permission change |
| Full permission matrix | < 200ms | Materialised view refreshed on change |

### 6.3 API Security

- Every endpoint declares required permissions via `beforeHandle`
- No endpoint accessible without authentication (except `/health`)
- Rate limiting: 1000 req/min per user, 100 req/min for sensitive endpoints
- API key scoping: external integrations limited to declared permission set
- Webhook security: HMAC-SHA256 signed payloads

---

## Layer 7: UI/UX Permission Controls

### 7.1 Frontend Enforcement

| Control | Implementation |
|---|---|
| Navigation hiding | `useCanAccessRoute()` hides nav items without permission |
| Button disabling | `PermissionGate` wraps buttons; shows tooltip explaining why disabled |
| Field visibility | `SecureField` component checks field-level permissions |
| Data masking | NI number shows `****1234`, bank account shows `****5678` |
| Export controls | Export buttons gated by `resource:export` permission |

### 7.2 Permission Management UI

- **Role Management Dashboard**: CRUD for custom roles, view system roles
- **Permission Matrix View**: roles × permissions grid with toggles
- **User Permission Inspector**: shows effective permissions with source attribution
- **Role Comparison Tool**: side-by-side diff of two roles
- **Permission Simulator**: "what if user X had role Y?" preview
- **Bulk Role Assignment**: assign/remove roles for multiple users

### 7.3 Self-Service Controls

- Employee can view their permission summary at `/me/permissions`
- Manager can view team access levels at `/manager/team-access`
- "Request Access" flow: employee submits request, routed to admin

---

## Migration Plan

### Phase 1: Schema Extension (Non-Breaking)

1. Add new columns to `app.roles`: `parent_role_id`, `permission_ceiling`,
   `max_custom_roles`, `role_category`
2. Create `app.role_templates` table
3. Create `app.data_scopes` table for custom scopes
4. Create `app.permission_conditions` table
5. Create `app.separation_of_duties_rules` table
6. Create `app.approval_chain_definitions` table
7. Create `app.access_review_campaigns` table
8. Create `app.security_alerts` table
9. Seed new system roles (hr_officer, payroll_admin, etc.)
10. Seed expanded permission catalog (~350 permissions)

### Phase 2: Permission Key Migration

1. Existing `resource:action` format still works (backwards compatible)
2. New permissions use the same format
3. Wildcard `*:*` still grants all permissions
4. `resource:*` still grants all actions on a resource

### Phase 3: Role Assignment Migration

1. Existing role assignments remain valid
2. New system roles are added alongside existing ones
3. Tenants can opt-in to expanded role set at their own pace
4. No forced migration — existing 5-role system continues to work

---

## Edge Cases

| Edge Case | Resolution |
|---|---|
| User with no roles | Deny all access; redirect to "no access" page; logged as security event |
| Conflicting permissions from multiple roles | Most permissive wins (union of all grants) |
| Manager viewing own review | Scope check: `self` scope for own data, `direct_reports` for team; dual-context handled |
| Super admin impersonating user | Impersonation logs in audit; impersonator sees exactly what target user sees |
| Tenant admin trying to grant super_admin | Blocked: `is_system` check prevents assigning system roles above tenant_admin |
| Delegation expires mid-approval | Approval remains valid if delegation was active at time of action; logged |
| Manager changes mid-leave-request | Approval reroutes to new manager; old approver notified; pending items reassigned |
| Cross-legal-entity reporting | Requires explicit `cross_entity: true` in role constraints with entity IDs |
| Contractor with time-limited access | `effective_to` on role assignment; auto-revoke on expiry; cannot log in after |
| TUPE transfer between tenants | Admin creates new role assignments in target tenant; source tenant access revoked |
| Redundancy planning visibility | Tier 4 data; only `tenant_admin` + `board_member` with explicit `succession:view_plans` |
| Board compensation visibility | `board_member` role with `custom` scope limited to executive-level positions |
