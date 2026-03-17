# Staffora Enterprise Permissions & Access Control System

> Complete design specification for a production-ready, 7-layer permissions system.
> Extends the existing RBAC, FLS, portal, delegation, and manager hierarchy foundations.
> **Last updated:** 2026-03-17

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

The existing 5 system roles are expanded to 18. Each system role has a fixed UUID, is marked `is_system = true`, and has `tenant_id = NULL`. Tenants cannot modify system role permissions — they can only create custom roles that inherit from them.

| UUID | Role Slug | Purpose | Portal Access | Scope |
|------|-----------|---------|---------------|-------|
| `a0..01` | `super_admin` | Platform operator. Full cross-tenant access. | admin | all tenants |
| `a0..02` | `tenant_admin` | Tenant owner. Full access within tenant. | admin | tenant-wide |
| `a0..03` | `hr_admin` | Head of HR. All HR modules, no payroll approve. | admin | tenant-wide |
| `a0..04` | `hr_officer` | Day-to-day HR operations. No sensitive config. | admin | tenant-wide |
| `a0..05` | `payroll_admin` | Payroll processing, tax, pension. | admin | tenant-wide |
| `a0..06` | `recruitment_admin` | Full recruitment lifecycle. | admin | tenant-wide |
| `a0..07` | `lms_admin` | Course management, mandatory training. | admin | tenant-wide |
| `a0..08` | `compliance_officer` | GDPR, DSAR, data breach, retention, audit. | admin | tenant-wide |
| `a0..09` | `health_safety_officer` | H&S incidents, risk assessments, DSE. | admin | tenant-wide |
| `a0..0a` | `department_head` | Department-scoped manager with budget authority. | admin, manager | department |
| `a0..0b` | `line_manager` | Direct team management, approvals, reviews. | manager | direct_reports |
| `a0..0c` | `team_leader` | Limited team view, no salary/disciplinary. | manager | direct_reports |
| `a0..0d` | `employee` | Self-service only. | employee | self |
| `a0..0e` | `contractor` | Limited self-service, time entry, no benefits. | employee | self |
| `a0..0f` | `temp_worker` | Time-bounded, minimal access. | employee | self |
| `a0..10` | `intern` | Read-only profile, learning access. | employee | self |
| `a0..11` | `external_auditor` | Read-only audit logs, compliance reports. Time-bounded. | admin | tenant-wide (read-only) |
| `a0..12` | `board_member` | Board-level reports, succession, exec compensation. | admin | tenant-wide (read-only) |

#### Role Hierarchy & Inheritance Chain

```
super_admin (inherits nothing — has everything)
└── tenant_admin (ceiling: all permissions within one tenant)
    ├── hr_admin (ceiling: all HR, no payroll approve, no system config)
    │   └── hr_officer (ceiling: operational HR, no config, no sensitive)
    ├── payroll_admin (ceiling: payroll, compensation, tax, pension)
    ├── recruitment_admin (ceiling: recruitment pipeline, offers, agencies)
    ├── lms_admin (ceiling: courses, paths, certifications, budgets)
    ├── compliance_officer (ceiling: GDPR, DSAR, audit, data governance)
    ├── health_safety_officer (ceiling: H&S incidents, risk, DSE)
    └── department_head (ceiling: department-scoped HR + manager perms)
        └── line_manager (ceiling: direct team management)
            └── team_leader (ceiling: team view, limited approvals)
                └── employee (base: self-service only)
                    ├── contractor (restricted employee: no benefits, no pension)
                    ├── temp_worker (restricted employee: time-bounded)
                    └── intern (restricted employee: read-only + learning)

external_auditor (no inheritance — standalone read-only)
board_member (no inheritance — standalone exec-level read-only)
```

**Inheritance Rule:** A child role inherits all permissions from its parent UNLESS explicitly denied at the child level. Inherited permissions can be narrowed (remove actions) but never expanded beyond the parent's ceiling.

**Conflict Resolution (Multi-Role):** When a user holds multiple roles, effective permissions are computed as the **union** (most permissive wins) for action grants, but **intersection** (most restrictive wins) for explicit denials. An explicit `deny` on any role overrides a `grant` on another role.

Priority: `deny` > `grant` > `inherit` > `not_set`

### 1.2 Custom Roles (Tenant-Created)

#### Schema Extension for Custom Roles

```sql
-- Add columns to existing app.roles table
ALTER TABLE app.roles
  ADD COLUMN IF NOT EXISTS parent_role_id uuid REFERENCES app.roles(id),
  ADD COLUMN IF NOT EXISTS max_permission_ceiling jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES app.users(id),
  ADD COLUMN IF NOT EXISTS cloned_from uuid REFERENCES app.roles(id),
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Index for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_roles_parent
  ON app.roles(parent_role_id) WHERE parent_role_id IS NOT NULL;

-- Index for active custom roles
CREATE INDEX IF NOT EXISTS idx_roles_active_custom
  ON app.roles(tenant_id, is_system, is_archived)
  WHERE is_system = false AND is_archived = false;
```

**Rules for Custom Roles:**
1. Every custom role MUST have a `parent_role_id` pointing to a system role or another custom role.
2. `max_permission_ceiling` is auto-computed from the parent — a custom role can never exceed its parent's permissions.
3. Tenants can clone any system role as a starting template (`cloned_from` tracks lineage).
4. Custom roles cannot grant `super_admin` or `tenant_admin` level access — the ceiling is `hr_admin`.
5. A tenant can create up to 50 custom roles (configurable per tenant plan).
6. Archiving soft-deletes the role; users with that role lose those permissions on next cache refresh.

#### Role Templates

```sql
CREATE TABLE app.role_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL,
    description text,
    base_role_id uuid NOT NULL REFERENCES app.roles(id),
    permissions jsonb NOT NULL DEFAULT '{}',
    field_permissions jsonb DEFAULT '{}',
    data_scope jsonb DEFAULT '{}',
    is_active boolean NOT NULL DEFAULT true,
    category varchar(50) NOT NULL DEFAULT 'general',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- No tenant_id: templates are global, available to all tenants.
-- No RLS needed: read-only reference data.
```

Seeded templates: "HR Business Partner", "Payroll Clerk", "Recruitment Coordinator", "L&D Specialist", "Office Manager", "Receptionist", "IT Support", "Finance Controller", "Department Secretary".

### 1.3 Permission Key Format

**Format:** `module:resource:action`

All permissions follow a three-segment colon-delimited key. Wildcards supported at each level:
- `*:*:*` — all permissions (super_admin only)
- `hr:*:*` — all HR permissions
- `hr:employees:*` — all actions on employees
- `hr:employees:read` — specific permission

### 1.4 Complete Permission Registry

#### Core HR Module (`hr:`)

```
hr:employees:create
hr:employees:read
hr:employees:update
hr:employees:delete
hr:employees:archive
hr:employees:restore
hr:employees:export
hr:employees:import
hr:employees:bulk_update
hr:employees:view_sensitive
hr:employees:edit_sensitive
hr:employees:view_salary
hr:employees:edit_salary
hr:employees:view_disciplinary
hr:employees:view_medical
hr:employees:manage_photos

hr:positions:create
hr:positions:read
hr:positions:update
hr:positions:delete
hr:positions:assign
hr:positions:unassign
hr:positions:bulk_manage

hr:departments:create
hr:departments:read
hr:departments:update
hr:departments:delete
hr:departments:restructure

hr:org_structure:view
hr:org_structure:edit
hr:org_structure:restructure
hr:org_structure:export

hr:contracts:create
hr:contracts:read
hr:contracts:update
hr:contracts:terminate
hr:contracts:renew
hr:contracts:amend
hr:contracts:view_terms

hr:emergency_contacts:read
hr:emergency_contacts:write
hr:emergency_contacts:manage_for_team

hr:bank_details:read
hr:bank_details:write
hr:bank_details:approve_changes

hr:probation:create
hr:probation:read
hr:probation:update
hr:probation:extend
hr:probation:complete
hr:probation:fail

hr:right_to_work:create
hr:right_to_work:read
hr:right_to_work:update
hr:right_to_work:verify
hr:right_to_work:expire_alerts

hr:warnings:create
hr:warnings:read
hr:warnings:update
hr:warnings:escalate
hr:warnings:expire
hr:warnings:view_history
```

#### Time & Attendance Module (`time:`)

```
time:time_entries:create
time:time_entries:read
time:time_entries:update
time:time_entries:delete
time:time_entries:approve
time:time_entries:reject
time:time_entries:lock
time:time_entries:unlock
time:time_entries:bulk_approve
time:time_entries:export

time:timesheets:view_own
time:timesheets:view_team
time:timesheets:view_all
time:timesheets:approve
time:timesheets:reject
time:timesheets:submit
time:timesheets:recall

time:schedules:create
time:schedules:read
time:schedules:update
time:schedules:delete
time:schedules:assign
time:schedules:publish
time:schedules:unpublish

time:overtime:request
time:overtime:approve
time:overtime:reject
time:overtime:view_reports

time:geofence:configure
time:geofence:view_violations
time:geofence:manage_locations
```

#### Absence & Leave Module (`absence:`)

```
absence:leave_requests:create_own
absence:leave_requests:view_own
absence:leave_requests:view_team
absence:leave_requests:view_all
absence:leave_requests:approve
absence:leave_requests:reject
absence:leave_requests:cancel
absence:leave_requests:force_cancel
absence:leave_requests:override_balance

absence:leave_types:create
absence:leave_types:read
absence:leave_types:update
absence:leave_types:delete
absence:leave_types:configure_accrual

absence:leave_policies:create
absence:leave_policies:read
absence:leave_policies:update
absence:leave_policies:delete
absence:leave_policies:assign

absence:leave_balances:view_own
absence:leave_balances:view_team
absence:leave_balances:view_all
absence:leave_balances:adjust
absence:leave_balances:carry_forward

absence:ssp:create
absence:ssp:read
absence:ssp:update
absence:ssp:calculate
absence:ssp:manage_fit_notes

absence:parental_leave:request
absence:parental_leave:approve
absence:parental_leave:configure
absence:parental_leave:view_reports

absence:bereavement:request
absence:bereavement:approve
absence:bereavement:configure

absence:carers_leave:request
absence:carers_leave:approve
absence:carers_leave:configure
```

#### Payroll Module (`payroll:`)

```
payroll:payroll_runs:create
payroll:payroll_runs:read
payroll:payroll_runs:approve
payroll:payroll_runs:reject
payroll:payroll_runs:lock
payroll:payroll_runs:export
payroll:payroll_runs:reopen

payroll:pay_elements:create
payroll:pay_elements:read
payroll:pay_elements:update
payroll:pay_elements:delete

payroll:deductions:create
payroll:deductions:read
payroll:deductions:update
payroll:deductions:delete
payroll:deductions:approve

payroll:tax_codes:view
payroll:tax_codes:update
payroll:tax_codes:import
payroll:tax_codes:verify

payroll:pension:configure
payroll:pension:view
payroll:pension:auto_enrol
payroll:pension:opt_out
payroll:pension:assess

payroll:payslips:generate
payroll:payslips:view_own
payroll:payslips:view_all
payroll:payslips:distribute
payroll:payslips:reissue

payroll:bonus_payments:create
payroll:bonus_payments:approve
payroll:bonus_payments:reject
payroll:bonus_payments:view_reports

payroll:p45_p60:generate
payroll:p45_p60:view
payroll:p45_p60:distribute
```

#### Talent Management Module (`talent:`)

```
talent:performance_reviews:create
talent:performance_reviews:read
talent:performance_reviews:update
talent:performance_reviews:submit
talent:performance_reviews:approve
talent:performance_reviews:calibrate
talent:performance_reviews:view_ratings
talent:performance_reviews:override_rating

talent:goals:create_own
talent:goals:create_for_team
talent:goals:read
talent:goals:update
talent:goals:cascade
talent:goals:align

talent:competencies:define
talent:competencies:assess
talent:competencies:view_matrix
talent:competencies:manage_frameworks

talent:succession:view_plans
talent:succession:create_plans
talent:succession:nominate
talent:succession:assess_readiness

talent:training_budgets:allocate
talent:training_budgets:view
talent:training_budgets:approve_spend
talent:training_budgets:view_reports

talent:cpd:create
talent:cpd:read
talent:cpd:approve
talent:cpd:view_reports
```

#### Recruitment Module (`recruitment:`)

```
recruitment:job_postings:create
recruitment:job_postings:read
recruitment:job_postings:update
recruitment:job_postings:publish
recruitment:job_postings:unpublish
recruitment:job_postings:close

recruitment:candidates:create
recruitment:candidates:read
recruitment:candidates:update
recruitment:candidates:reject
recruitment:candidates:shortlist
recruitment:candidates:view_sensitive

recruitment:interviews:schedule
recruitment:interviews:conduct
recruitment:interviews:score
recruitment:interviews:view_feedback

recruitment:offers:create
recruitment:offers:approve
recruitment:offers:send
recruitment:offers:withdraw
recruitment:offers:negotiate

recruitment:assessments:create
recruitment:assessments:assign
recruitment:assessments:score
recruitment:assessments:view_results

recruitment:dbs_checks:request
recruitment:dbs_checks:view
recruitment:dbs_checks:update_status
recruitment:dbs_checks:view_sensitive

recruitment:reference_checks:request
recruitment:reference_checks:view
recruitment:reference_checks:complete
recruitment:reference_checks:verify

recruitment:agencies:create
recruitment:agencies:read
recruitment:agencies:update
recruitment:agencies:manage_terms
recruitment:agencies:view_fees
```

#### Learning Module (`lms:`)

```
lms:courses:create
lms:courses:read
lms:courses:update
lms:courses:delete
lms:courses:publish
lms:courses:assign
lms:courses:bulk_assign

lms:learning_paths:create
lms:learning_paths:read
lms:learning_paths:update
lms:learning_paths:assign

lms:certifications:issue
lms:certifications:revoke
lms:certifications:verify
lms:certifications:view_expiring

lms:course_ratings:submit
lms:course_ratings:view
lms:course_ratings:moderate

lms:mandatory_training:configure
lms:mandatory_training:assign
lms:mandatory_training:track_compliance
lms:mandatory_training:escalate
```

#### Cases & Disciplinary Module (`cases:`)

```
cases:cases:create
cases:cases:read
cases:cases:update
cases:cases:close
cases:cases:reopen
cases:cases:escalate
cases:cases:assign
cases:cases:view_all
cases:cases:view_sensitive
cases:cases:add_notes
cases:cases:manage_documents

cases:disciplinary:initiate
cases:disciplinary:view
cases:disciplinary:update
cases:disciplinary:escalate
cases:disciplinary:close
cases:disciplinary:appeal
cases:disciplinary:view_acas

cases:grievances:submit
cases:grievances:view
cases:grievances:investigate
cases:grievances:resolve
cases:grievances:appeal
```

#### Onboarding Module (`onboarding:`)

```
onboarding:templates:create
onboarding:templates:read
onboarding:templates:update
onboarding:templates:delete
onboarding:templates:publish
onboarding:templates:clone

onboarding:instances:create
onboarding:instances:view
onboarding:instances:manage
onboarding:instances:complete_task
onboarding:instances:reassign

onboarding:checklists:view_own
onboarding:checklists:view_all
onboarding:checklists:update_progress
onboarding:checklists:sign_off
```

#### Documents Module (`documents:`)

```
documents:documents:upload
documents:documents:read
documents:documents:update
documents:documents:delete
documents:documents:share
documents:documents:version
documents:documents:archive

documents:templates:create
documents:templates:read
documents:templates:update
documents:templates:delete
documents:templates:merge
documents:templates:generate

documents:contracts_docs:generate
documents:contracts_docs:sign
documents:contracts_docs:countersign
documents:contracts_docs:view
documents:contracts_docs:archive

documents:letters:generate
documents:letters:approve
documents:letters:send
documents:letters:view_templates
```

#### Benefits Module (`benefits:`)

```
benefits:benefit_plans:create
benefits:benefit_plans:read
benefits:benefit_plans:update
benefits:benefit_plans:delete
benefits:benefit_plans:publish

benefits:enrollments:enrol_self
benefits:enrollments:enrol_team
benefits:enrollments:approve
benefits:enrollments:reject
benefits:enrollments:view_all

benefits:life_events:submit
benefits:life_events:approve
benefits:life_events:process
benefits:life_events:view
```

#### Compliance & Data Protection Module (`compliance:`)

```
compliance:dsar:submit
compliance:dsar:view
compliance:dsar:process
compliance:dsar:extend
compliance:dsar:complete
compliance:dsar:export

compliance:data_breach:report
compliance:data_breach:investigate
compliance:data_breach:notify
compliance:data_breach:close
compliance:data_breach:view_all

compliance:consent:manage
compliance:consent:view_audit
compliance:consent:configure_purposes

compliance:data_erasure:request
compliance:data_erasure:approve
compliance:data_erasure:execute
compliance:data_erasure:verify
compliance:data_erasure:view_log

compliance:data_retention:configure
compliance:data_retention:view_policies
compliance:data_retention:execute_purge
compliance:data_retention:audit

compliance:privacy_notices:create
compliance:privacy_notices:update
compliance:privacy_notices:publish
compliance:privacy_notices:view_acceptance

compliance:gender_pay_gap:generate
compliance:gender_pay_gap:view
compliance:gender_pay_gap:submit
compliance:gender_pay_gap:export

compliance:diversity_monitoring:configure
compliance:diversity_monitoring:view_reports
compliance:diversity_monitoring:export

compliance:nmw_compliance:check
compliance:nmw_compliance:view_alerts
compliance:nmw_compliance:resolve
compliance:nmw_compliance:export
```

#### Workflows & Approvals Module (`workflows:`)

```
workflows:workflows:create
workflows:workflows:read
workflows:workflows:update
workflows:workflows:delete
workflows:workflows:activate
workflows:workflows:deactivate

workflows:workflow_instances:view
workflows:workflow_instances:approve
workflows:workflow_instances:reject
workflows:workflow_instances:escalate
workflows:workflow_instances:reassign

workflows:approval_chains:configure
workflows:approval_chains:view
workflows:approval_chains:override
```

#### Analytics & Reports Module (`analytics:`)

```
analytics:reports:view_standard
analytics:reports:view_custom
analytics:reports:create_custom
analytics:reports:schedule
analytics:reports:export
analytics:reports:share
analytics:reports:delete_custom

analytics:dashboards:view
analytics:dashboards:customise
analytics:dashboards:create
analytics:dashboards:share
analytics:dashboards:manage_widgets

analytics:analytics:view_workforce
analytics:analytics:view_absence
analytics:analytics:view_turnover
analytics:analytics:view_headcount
analytics:analytics:view_compensation
analytics:analytics:view_diversity
analytics:analytics:export
```

#### System & Security Module (`system:`)

```
system:users:create
system:users:read
system:users:update
system:users:deactivate
system:users:reset_password
system:users:unlock
system:users:manage_mfa
system:users:impersonate

system:roles:create
system:roles:read
system:roles:update
system:roles:delete
system:roles:assign
system:roles:unassign
system:roles:manage_permissions

system:audit_log:view
system:audit_log:export
system:audit_log:configure_retention

system:settings:view
system:settings:update
system:settings:manage_integrations

system:delegations:create
system:delegations:revoke
system:delegations:view
system:delegations:manage_for_org

system:field_permissions:view
system:field_permissions:configure
system:field_permissions:manage_sensitive

system:portal_access:grant
system:portal_access:revoke
system:portal_access:configure

system:api_keys:create
system:api_keys:view
system:api_keys:revoke
system:api_keys:manage_scopes
```

#### Health & Safety Module (`health_safety:`)

```
health_safety:incidents:report
health_safety:incidents:view
health_safety:incidents:investigate
health_safety:incidents:close
health_safety:incidents:view_reports

health_safety:risk_assessments:create
health_safety:risk_assessments:view
health_safety:risk_assessments:update
health_safety:risk_assessments:approve
health_safety:risk_assessments:review

health_safety:dse_assessments:submit
health_safety:dse_assessments:view
health_safety:dse_assessments:action
health_safety:dse_assessments:review
```

#### Equipment Module (`equipment:`)

```
equipment:equipment:assign
equipment:equipment:return
equipment:equipment:view
equipment:equipment:manage_inventory
equipment:equipment:write_off
```

#### Headcount Planning Module (`headcount:`)

```
headcount:headcount:view_plans
headcount:headcount:create_plans
headcount:headcount:approve
headcount:headcount:forecast
headcount:headcount:lock
```

**Total permission keys: 283**

### 1.5 System Role → Permission Matrix

Each role receives permissions as `grant`, `deny`, or `inherit` (from parent). Only deviations from parent are stored; the rest is inherited.

#### super_admin
```
*:*:* = grant
```

#### tenant_admin
```
*:*:* = grant
EXCEPT:
  system:users:impersonate = deny  (only super_admin)
```

#### hr_admin
```
hr:*:* = grant
absence:*:* = grant
onboarding:*:* = grant
cases:*:* = grant
documents:*:* = grant
benefits:*:* = grant
equipment:*:* = grant
headcount:*:* = grant
health_safety:*:* = grant
time:*:* = grant
talent:*:* = grant
recruitment:*:* = grant
lms:*:* = grant
compliance:*:* = grant
workflows:*:* = grant
analytics:*:* = grant
system:users:read = grant
system:users:create = grant
system:users:update = grant
system:users:deactivate = grant
system:users:reset_password = grant
system:users:unlock = grant
system:roles:read = grant
system:roles:assign = grant
system:roles:unassign = grant
system:audit_log:view = grant
system:audit_log:export = grant
system:delegations:* = grant
system:field_permissions:view = grant
system:portal_access:* = grant
system:settings:view = grant

DENY:
  payroll:payroll_runs:approve = deny  (separation of duties)
  system:users:impersonate = deny
  system:roles:create = deny
  system:roles:update = deny
  system:roles:delete = deny
  system:roles:manage_permissions = deny
  system:settings:update = deny
  system:settings:manage_integrations = deny
  system:api_keys:* = deny
```

#### hr_officer
```
INHERIT from hr_admin EXCEPT:
  hr:employees:delete = deny
  hr:employees:import = deny
  hr:employees:bulk_update = deny
  hr:employees:edit_sensitive = deny
  hr:departments:restructure = deny
  hr:org_structure:restructure = deny
  hr:contracts:terminate = deny
  absence:leave_types:create = deny
  absence:leave_types:delete = deny
  absence:leave_policies:create = deny
  absence:leave_policies:delete = deny
  cases:disciplinary:initiate = deny  (hr_admin only)
  compliance:data_erasure:execute = deny
  compliance:data_retention:execute_purge = deny
  headcount:headcount:approve = deny
  headcount:headcount:lock = deny
  system:users:create = deny
  system:users:deactivate = deny
```

#### payroll_admin
```
payroll:*:* = grant
hr:employees:read = grant
hr:employees:view_salary = grant
hr:employees:edit_salary = grant
hr:bank_details:* = grant
hr:contracts:read = grant
hr:contracts:view_terms = grant
absence:ssp:* = grant
absence:leave_balances:view_all = grant
compliance:nmw_compliance:* = grant
compliance:gender_pay_gap:* = grant
analytics:reports:view_standard = grant
analytics:reports:export = grant
analytics:analytics:view_compensation = grant
```

#### recruitment_admin
```
recruitment:*:* = grant
hr:positions:read = grant
hr:departments:read = grant
hr:employees:create = grant  (convert candidate to employee)
onboarding:instances:create = grant
analytics:reports:view_standard = grant
```

#### lms_admin
```
lms:*:* = grant
talent:training_budgets:* = grant
talent:cpd:* = grant
talent:competencies:view_matrix = grant
analytics:reports:view_standard = grant
hr:employees:read = grant
```

#### compliance_officer
```
compliance:*:* = grant
system:audit_log:* = grant
analytics:reports:view_standard = grant
analytics:reports:export = grant
analytics:analytics:view_diversity = grant
hr:employees:read = grant
hr:employees:view_sensitive = grant (for DSAR processing)
documents:documents:read = grant
```

#### health_safety_officer
```
health_safety:*:* = grant
hr:employees:read = grant
analytics:reports:view_standard = grant
cases:cases:create = grant  (H&S-related cases)
cases:cases:read = grant
```

#### department_head
```
INHERIT from line_manager PLUS:
  hr:departments:read = grant
  hr:departments:update = grant (own department only — enforced by data scope)
  hr:positions:create = grant
  hr:positions:update = grant
  headcount:headcount:view_plans = grant
  headcount:headcount:create_plans = grant
  talent:training_budgets:view = grant
  talent:training_budgets:approve_spend = grant
  analytics:dashboards:view = grant
  analytics:analytics:view_headcount = grant
  analytics:analytics:view_absence = grant
  analytics:analytics:view_turnover = grant
```

#### line_manager
```
INHERIT from team_leader PLUS:
  hr:employees:view_salary = grant (team only — data scope)
  hr:employees:view_disciplinary = grant
  hr:probation:* = grant
  hr:warnings:create = grant
  hr:warnings:read = grant
  hr:warnings:update = grant
  absence:leave_requests:approve = grant
  absence:leave_requests:reject = grant
  absence:leave_balances:view_team = grant
  time:time_entries:approve = grant
  time:time_entries:reject = grant
  time:timesheets:approve = grant
  time:timesheets:reject = grant
  talent:performance_reviews:create = grant
  talent:performance_reviews:submit = grant
  talent:goals:create_for_team = grant
  talent:competencies:assess = grant
  onboarding:instances:manage = grant
  cases:cases:create = grant
  cases:cases:read = grant
  equipment:equipment:assign = grant
  equipment:equipment:return = grant
  system:delegations:create = grant (own approvals only)
```

#### team_leader
```
INHERIT from employee PLUS:
  hr:employees:read = grant (team only — data scope)
  absence:leave_requests:view_team = grant
  time:timesheets:view_team = grant
  time:schedules:read = grant
  talent:goals:read = grant (team)
  onboarding:checklists:view_all = grant (team)
  lms:certifications:view_expiring = grant (team)
```

#### employee
```
hr:employees:read = grant (self only)
hr:emergency_contacts:read = grant (self)
hr:emergency_contacts:write = grant (self)
hr:bank_details:read = grant (self)
hr:bank_details:write = grant (self)
hr:contracts:read = grant (self)
absence:leave_requests:create_own = grant
absence:leave_requests:view_own = grant
absence:leave_requests:cancel = grant (own, if draft/pending)
absence:leave_balances:view_own = grant
absence:parental_leave:request = grant
absence:bereavement:request = grant
absence:carers_leave:request = grant
time:time_entries:create = grant (self)
time:time_entries:read = grant (self)
time:time_entries:update = grant (self, if not locked)
time:timesheets:view_own = grant
time:timesheets:submit = grant
time:timesheets:recall = grant (if pending)
time:overtime:request = grant
talent:goals:create_own = grant
talent:goals:read = grant (self)
talent:goals:update = grant (self)
talent:performance_reviews:read = grant (self)
talent:performance_reviews:update = grant (self-assessment)
talent:cpd:create = grant
talent:cpd:read = grant (self)
lms:courses:read = grant
lms:course_ratings:submit = grant
onboarding:checklists:view_own = grant
onboarding:checklists:update_progress = grant (assigned tasks)
documents:documents:upload = grant (self)
documents:documents:read = grant (self)
benefits:enrollments:enrol_self = grant
benefits:life_events:submit = grant
payroll:payslips:view_own = grant
compliance:dsar:submit = grant
compliance:consent:manage = grant (own)
health_safety:incidents:report = grant
health_safety:dse_assessments:submit = grant
analytics:dashboards:view = grant (personal dashboard)
cases:grievances:submit = grant
```

#### contractor
```
INHERIT from employee EXCEPT:
  benefits:* = deny
  payroll:pension:* = deny
  absence:parental_leave:* = deny
  absence:carers_leave:* = deny
  absence:ssp:* = deny
  talent:succession:* = deny
  headcount:* = deny
```

#### temp_worker
```
INHERIT from contractor
(Same restrictions plus access is always time-bounded via role_assignments.effective_to)
```

#### intern
```
INHERIT from employee EXCEPT:
  hr:bank_details:write = deny
  time:overtime:request = deny
  benefits:* = deny
  payroll:* = deny (except payslips:view_own)
  absence:parental_leave:* = deny
  absence:carers_leave:* = deny
PLUS:
  lms:learning_paths:read = grant
```

#### external_auditor
```
system:audit_log:view = grant
system:audit_log:export = grant
compliance:*:view = grant (view actions only across all compliance)
analytics:reports:view_standard = grant
analytics:reports:export = grant
(All access is read-only; always time-bounded via role_assignments.effective_to)
```

#### board_member
```
talent:succession:view_plans = grant
talent:succession:assess_readiness = grant
analytics:analytics:view_workforce = grant
analytics:analytics:view_headcount = grant
analytics:analytics:view_turnover = grant
analytics:analytics:view_compensation = grant (exec level)
analytics:analytics:view_diversity = grant
analytics:dashboards:view = grant
analytics:reports:view_standard = grant
headcount:headcount:view_plans = grant
hr:employees:view_salary = grant (exec band only — data scope)
(All access is read-only)
```

---

## Layer 2: Data-Scoped Access (Who Can See Whose Data)

### 2.1 Data Scope Model

Every role assignment carries a **data scope** that restricts WHICH employees' data the permission applies to. This is stored in the `constraints` JSONB column of `role_assignments`.

```sql
-- New table: explicit data scope definitions
CREATE TABLE app.data_scopes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    description text,
    scope_type varchar(30) NOT NULL CHECK (scope_type IN (
        'self', 'direct_reports', 'indirect_reports',
        'department', 'division', 'location',
        'cost_centre', 'legal_entity', 'all', 'custom'
    )),
    -- For 'custom' scope type: filters define the employee population
    filters jsonb DEFAULT '{}',
    -- e.g. {"employee_tags": ["remote"], "locations": ["uuid1", "uuid2"],
    --       "employment_types": ["full_time", "part_time"]}
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT data_scopes_name_unique UNIQUE NULLS NOT DISTINCT (tenant_id, name)
);

ALTER TABLE app.data_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY data_scopes_tenant_isolation ON app.data_scopes
    USING (tenant_id = current_setting('app.current_tenant')::uuid OR is_system = true);
CREATE POLICY data_scopes_insert ON app.data_scopes FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_data_scopes_tenant ON app.data_scopes(tenant_id, scope_type);
```

#### Default Scope per System Role

| Role | Default Scope | Notes |
|------|---------------|-------|
| super_admin | `all` (cross-tenant) | Platform-level |
| tenant_admin | `all` | Tenant-wide |
| hr_admin | `all` | Tenant-wide |
| hr_officer | `all` | Tenant-wide |
| payroll_admin | `all` | Needs all employee salary data |
| recruitment_admin | `all` | Tenant-wide for candidate→employee flow |
| lms_admin | `all` | Needs to assign training to anyone |
| compliance_officer | `all` | GDPR applies to all data |
| health_safety_officer | `all` | Incidents can involve anyone |
| department_head | `department` | Their department(s) only |
| line_manager | `direct_reports` | Direct team only |
| team_leader | `direct_reports` | Direct team only |
| employee | `self` | Own data only |
| contractor | `self` | Own data only |
| temp_worker | `self` | Own data only |
| intern | `self` | Own data only |
| external_auditor | `all` (read-only) | Audit requires full view |
| board_member | `custom` | Exec band + aggregate data only |

### 2.2 Scope Stacking (Multi-Role Resolution)

When a user holds multiple roles with different scopes, the scopes **union** (most permissive) for data visibility:

```
User has:
  - line_manager role → scope: direct_reports
  - department_head role → scope: department (Engineering)

Effective scope: union(direct_reports, department:Engineering)
  = All employees in Engineering department (includes their direct reports)
```

**Exception:** If any role carries an explicit `deny` for a data tier, the deny wins regardless of other roles' grants.

### 2.3 Scope Resolution Function

```sql
CREATE OR REPLACE FUNCTION app.resolve_data_scope(
    p_tenant_id uuid,
    p_user_id uuid,
    p_resource varchar,
    p_action varchar,
    p_as_of timestamptz DEFAULT now()
) RETURNS TABLE (employee_id uuid) AS $$
DECLARE
    v_employee_id uuid;
    v_scope_type varchar;
    v_has_all_scope boolean := false;
BEGIN
    -- Get the user's employee_id
    SELECT e.id INTO v_employee_id
    FROM app.employees e
    WHERE e.user_id = p_user_id AND e.tenant_id = p_tenant_id;

    -- Iterate over all active role assignments with matching permission
    FOR v_scope_type IN
        SELECT DISTINCT
            COALESCE(ds.scope_type, 'self') as scope_type
        FROM app.role_assignments ra
        JOIN app.roles r ON r.id = ra.role_id
        LEFT JOIN app.data_scopes ds ON ds.id = (ra.constraints->>'data_scope_id')::uuid
        WHERE ra.tenant_id = p_tenant_id
          AND ra.user_id = p_user_id
          AND (ra.effective_to IS NULL OR ra.effective_to > p_as_of)
          AND ra.effective_from <= p_as_of
          AND app.role_has_permission(r.id, p_resource, p_action)
    LOOP
        CASE v_scope_type
            WHEN 'all' THEN
                v_has_all_scope := true;
                RETURN QUERY
                    SELECT e.id FROM app.employees e
                    WHERE e.tenant_id = p_tenant_id;
                RETURN;

            WHEN 'self' THEN
                RETURN QUERY SELECT v_employee_id;

            WHEN 'direct_reports' THEN
                RETURN QUERY
                    SELECT ms.subordinate_id FROM app.manager_subordinates ms
                    WHERE ms.tenant_id = p_tenant_id
                      AND ms.manager_id = v_employee_id
                      AND ms.depth = 1;
                -- Also include self
                RETURN QUERY SELECT v_employee_id;

            WHEN 'indirect_reports' THEN
                RETURN QUERY
                    SELECT ms.subordinate_id FROM app.manager_subordinates ms
                    WHERE ms.tenant_id = p_tenant_id
                      AND ms.manager_id = v_employee_id;
                RETURN QUERY SELECT v_employee_id;

            WHEN 'department' THEN
                RETURN QUERY
                    SELECT e.id FROM app.employees e
                    JOIN app.position_assignments pa ON pa.employee_id = e.id
                        AND pa.is_primary = true
                        AND (pa.effective_to IS NULL OR pa.effective_to > p_as_of)
                    JOIN app.positions p ON p.id = pa.position_id
                    WHERE e.tenant_id = p_tenant_id
                      AND p.department_id IN (
                          SELECT p2.department_id FROM app.positions p2
                          JOIN app.position_assignments pa2 ON pa2.position_id = p2.id
                          WHERE pa2.employee_id = v_employee_id AND pa2.is_primary = true
                      );

            WHEN 'division' THEN
                RETURN QUERY
                    SELECT e.id FROM app.employees e
                    JOIN app.position_assignments pa ON pa.employee_id = e.id
                        AND pa.is_primary = true
                        AND (pa.effective_to IS NULL OR pa.effective_to > p_as_of)
                    JOIN app.positions p ON p.id = pa.position_id
                    JOIN app.org_units ou ON ou.id = p.department_id
                    WHERE e.tenant_id = p_tenant_id
                      AND ou.parent_id IN (
                          SELECT ou2.parent_id FROM app.org_units ou2
                          JOIN app.positions p3 ON p3.department_id = ou2.id
                          JOIN app.position_assignments pa3 ON pa3.position_id = p3.id
                          WHERE pa3.employee_id = v_employee_id AND pa3.is_primary = true
                      );

            WHEN 'location' THEN
                RETURN QUERY
                    SELECT e.id FROM app.employees e
                    JOIN app.position_assignments pa ON pa.employee_id = e.id
                        AND pa.is_primary = true
                        AND (pa.effective_to IS NULL OR pa.effective_to > p_as_of)
                    JOIN app.positions p ON p.id = pa.position_id
                    WHERE e.tenant_id = p_tenant_id
                      AND p.location_id IN (
                          SELECT p2.location_id FROM app.positions p2
                          JOIN app.position_assignments pa2 ON pa2.position_id = p2.id
                          WHERE pa2.employee_id = v_employee_id AND pa2.is_primary = true
                      );

            WHEN 'cost_centre' THEN
                RETURN QUERY
                    SELECT e.id FROM app.employees e
                    JOIN app.position_assignments pa ON pa.employee_id = e.id
                        AND pa.is_primary = true
                        AND (pa.effective_to IS NULL OR pa.effective_to > p_as_of)
                    JOIN app.positions p ON p.id = pa.position_id
                    WHERE e.tenant_id = p_tenant_id
                      AND p.cost_center_id IN (
                          SELECT p2.cost_center_id FROM app.positions p2
                          JOIN app.position_assignments pa2 ON pa2.position_id = p2.id
                          WHERE pa2.employee_id = v_employee_id AND pa2.is_primary = true
                      );

            WHEN 'legal_entity' THEN
                RETURN QUERY
                    SELECT e.id FROM app.employees e
                    WHERE e.tenant_id = p_tenant_id
                      AND e.legal_entity_id IN (
                          SELECT e2.legal_entity_id FROM app.employees e2
                          WHERE e2.id = v_employee_id
                      );

            WHEN 'custom' THEN
                -- Custom scopes use filters stored in data_scopes.filters
                -- Resolved at application layer
                NULL;
        END CASE;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

### 2.4 Sensitive Data Tiers

| Tier | Level | Fields | Default Access |
|------|-------|--------|----------------|
| **Tier 0** | Public | name, job_title, department, work_email, work_phone, photo_url | All authenticated users |
| **Tier 1** | Internal | start_date, manager, location, cost_centre, employment_type, grade | employee (self) + team_leader+ |
| **Tier 2** | Restricted | salary, bonus, performance_rating, disciplinary_records, leave_balances | line_manager (team) + hr_admin + payroll_admin |
| **Tier 3** | Confidential | NI_number, bank_details, medical_records, DBS_results, right_to_work_docs, diversity_data, date_of_birth, home_address | hr_admin + payroll_admin (bank) + compliance_officer (DSAR) |
| **Tier 4** | Privileged | succession_plans, redundancy_lists, investigation_details, board_compensation, salary_benchmarks | tenant_admin + board_member (exec only) + hr_admin (succession) |

**FLS Override:** The `role_field_permissions` table can override defaults at the field level. The existing three-level system (`edit`, `view`, `hidden`) maps to tiers:
- `hidden` = field not visible at all (used for higher tiers)
- `view` = read-only access (appropriate tier access)
- `edit` = read-write access (requires both tier access AND write permission)

**Cross-Entity Access:**
```sql
-- Add to role_assignments.constraints:
{
  "data_scope_id": "uuid",
  "cross_entity_access": ["legal-entity-uuid-1", "legal-entity-uuid-2"],
  "cross_entity_permissions": ["hr:employees:read", "analytics:*:*"]
}
```

A department head in Legal Entity A can view employees in Legal Entity B only if:
1. Their role assignment explicitly lists Entity B in `cross_entity_access`
2. The permissions they can exercise cross-entity are limited to `cross_entity_permissions`
3. This is audited separately (flagged in audit log as cross-entity access)

---

## Layer 3: Contextual & Conditional Permissions

Permissions that activate or deactivate based on runtime conditions.

### 3.1 Permission Conditions Table

```sql
CREATE TABLE app.permission_conditions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    description text,
    condition_type varchar(30) NOT NULL CHECK (condition_type IN (
        'time_based', 'workflow_state', 'employment_status',
        'compliance', 'record_ownership', 'approval_context'
    )),
    -- Condition definition as structured JSON
    condition_rules jsonb NOT NULL,
    -- Which permissions this condition applies to
    affected_permissions text[] NOT NULL DEFAULT '{}',
    -- Whether the condition grants or restricts
    effect varchar(10) NOT NULL CHECK (effect IN ('grant', 'deny')),
    is_active boolean NOT NULL DEFAULT true,
    priority integer NOT NULL DEFAULT 100,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT permission_conditions_unique UNIQUE (tenant_id, name)
);

ALTER TABLE app.permission_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pc_tenant_isolation ON app.permission_conditions
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY pc_insert ON app.permission_conditions FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_permission_conditions_type ON app.permission_conditions(tenant_id, condition_type);
CREATE INDEX idx_permission_conditions_active ON app.permission_conditions(tenant_id, is_active)
    WHERE is_active = true;
```

### 3.2 Time-Based Permissions

#### Payroll Lock Period
```json
{
  "condition_type": "time_based",
  "condition_rules": {
    "check": "payroll_period_locked",
    "lookup": "payroll_periods WHERE status = 'locked' AND period_covers(target_date)"
  },
  "affected_permissions": [
    "time:time_entries:create", "time:time_entries:update", "time:time_entries:delete",
    "payroll:payroll_runs:reopen", "payroll:pay_elements:update"
  ],
  "effect": "deny"
}
```

**Resolution:** Before any time/payroll mutation, the system checks if the affected date falls within a locked payroll period. If locked, the permission is denied regardless of role.

#### Annual Review Window
```json
{
  "condition_type": "time_based",
  "condition_rules": {
    "check": "review_cycle_active",
    "lookup": "performance_cycles WHERE status = 'active' AND now() BETWEEN start_date AND end_date"
  },
  "affected_permissions": [
    "talent:performance_reviews:create", "talent:performance_reviews:update",
    "talent:performance_reviews:submit"
  ],
  "effect": "grant"
}
```

**Resolution:** Performance review create/update permissions only active during an open review cycle. Outside the cycle window, these actions are denied even for hr_admin (they must reopen the cycle first).

#### Probation Period Extended Access
```json
{
  "condition_type": "time_based",
  "condition_rules": {
    "check": "employee_in_probation",
    "lookup": "probation_periods WHERE employee_id = :target AND status = 'active'"
  },
  "affected_permissions": [
    "hr:probation:update", "hr:probation:extend", "hr:probation:complete", "hr:probation:fail"
  ],
  "effect": "grant"
}
```

#### Notice Period Restrictions
```json
{
  "condition_type": "time_based",
  "condition_rules": {
    "check": "employee_in_notice_period",
    "lookup": "employees WHERE id = :current_user_employee AND termination_date IS NOT NULL AND termination_date > now()"
  },
  "affected_permissions": [
    "system:settings:update", "system:roles:*", "system:api_keys:*",
    "hr:employees:delete", "hr:employees:bulk_update",
    "analytics:reports:create_custom", "documents:documents:delete"
  ],
  "effect": "deny"
}
```

#### Holiday Cover / Temporary Elevation
Handled via the existing `role_assignments` table with `effective_from` / `effective_to`:

```sql
-- Grant temporary line_manager role during holiday cover
INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints, effective_from, effective_to, assigned_by)
VALUES (
    :tenant_id,
    :cover_user_id,
    (SELECT id FROM app.roles WHERE name = 'line_manager' AND is_system = true),
    jsonb_build_object(
        'data_scope_id', :absent_managers_scope_id,
        'reason', 'holiday_cover',
        'original_holder', :absent_manager_user_id
    ),
    :cover_start,
    :cover_end,
    :assigned_by
);
```

### 3.3 Workflow-Based Permissions

Permissions that change based on the state of a record:

```typescript
interface WorkflowPermissionRule {
  entity_type: string;         // 'leave_request', 'payroll_run', 'case', etc.
  state: string;               // The record's current status
  allowed_actions: string[];   // Permission actions allowed in this state
  allowed_actors: ActorRule[]; // Who can perform the action
}

interface ActorRule {
  type: 'creator' | 'assigned_approver' | 'role' | 'delegated_approver';
  role_slugs?: string[];       // If type = 'role', which roles
  same_as_creator?: boolean;   // If true, must NOT be the creator (separation of duties)
}
```

#### Leave Request Workflow Permissions

| State | Action | Allowed Actors |
|-------|--------|----------------|
| `draft` | `update`, `submit`, `delete` | Creator only |
| `draft` | `force_cancel` | hr_admin, tenant_admin |
| `pending` | `approve`, `reject` | Assigned approver, delegated approver |
| `pending` | `cancel` | Creator (own request) |
| `pending` | `force_cancel` | hr_admin, tenant_admin |
| `pending` | `reassign` | hr_admin, tenant_admin |
| `approved` | `cancel` | Creator (with re-approval required) |
| `approved` | `force_cancel` | hr_admin, tenant_admin |
| `rejected` | `resubmit` | Creator |
| `cancelled` | (none) | Immutable |

#### Payroll Run Workflow Permissions

| State | Action | Allowed Actors |
|-------|--------|----------------|
| `draft` | `update`, `add_elements` | payroll_admin |
| `draft` | `submit` | payroll_admin |
| `pending_approval` | `approve` | tenant_admin, hr_admin (NOT payroll_admin — separation of duties) |
| `pending_approval` | `reject` | tenant_admin, hr_admin |
| `approved` | `lock` | payroll_admin |
| `approved` | `export` | payroll_admin |
| `locked` | `reopen` | tenant_admin only (requires reason) |
| `locked` | `export` | payroll_admin, tenant_admin |

#### Case Workflow Permissions

| State | Action | Allowed Actors |
|-------|--------|----------------|
| `open` | `update`, `assign`, `add_notes` | Creator, assigned_to, hr_admin |
| `open` | `escalate` | assigned_to, hr_admin |
| `open` | `close` | hr_admin only |
| `in_progress` | `update`, `add_notes` | assigned_to, hr_admin |
| `in_progress` | `escalate` | assigned_to, hr_admin |
| `in_progress` | `resolve` | assigned_to, hr_admin |
| `resolved` | `close` | Creator, hr_admin |
| `resolved` | `reopen` | Creator, hr_admin |
| `closed` | `reopen` | hr_admin only |

### 3.4 Employment Status-Based Permissions

The user's own employment status affects their access:

| Status | System Access | Portal Access | Can Create | Can Approve | Special Rules |
|--------|---------------|---------------|------------|-------------|---------------|
| `pre_hire` | Limited | employee (onboarding only) | Onboarding tasks only | No | Can only access onboarding checklist and document upload |
| `active` | Full per role | All assigned portals | Yes per role | Yes per role | Standard access |
| `on_leave` | Reduced | employee only | View only + emergency | No | Can view own data, submit DSAR, report incidents. Cannot create leave requests or time entries |
| `suspended` | None | None | No | No | All access revoked. HR can still view their records |
| `notice_period` | Reduced | employee only | Limited | Only existing chains | Cannot delete data, limited system config access |
| `terminated` | None | None | No | No | Account deactivated. Data retained per retention policy |

```sql
-- Function to check employment status restrictions
CREATE OR REPLACE FUNCTION app.check_employment_status_access(
    p_user_id uuid,
    p_resource varchar,
    p_action varchar
) RETURNS boolean AS $$
DECLARE
    v_status varchar;
BEGIN
    SELECT e.status INTO v_status
    FROM app.employees e
    WHERE e.user_id = p_user_id
      AND e.tenant_id = current_setting('app.current_tenant')::uuid;

    -- No employee record found (system user / external)
    IF v_status IS NULL THEN RETURN true; END IF;

    CASE v_status
        WHEN 'active' THEN RETURN true;
        WHEN 'pre_hire' THEN
            RETURN p_resource IN ('onboarding:checklists', 'onboarding:instances', 'documents:documents')
               AND p_action IN ('view_own', 'update_progress', 'upload', 'read');
        WHEN 'on_leave' THEN
            RETURN p_action IN ('view_own', 'read', 'view', 'submit')
               AND p_resource NOT IN ('time:time_entries', 'absence:leave_requests');
        WHEN 'suspended' THEN RETURN false;
        WHEN 'notice_period' THEN
            RETURN p_action NOT IN ('delete', 'bulk_update', 'manage_permissions', 'manage_integrations');
        WHEN 'terminated' THEN RETURN false;
        ELSE RETURN false;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

### 3.5 Compliance-Driven Permissions

#### GDPR Data Minimisation
Every data access must declare its **purpose**. The system validates that the requested fields are necessary for the stated purpose:

```sql
CREATE TABLE app.data_access_purposes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar(50) NOT NULL UNIQUE,
    name varchar(200) NOT NULL,
    description text,
    allowed_fields jsonb NOT NULL,  -- {"employee": ["first_name", "last_name", "email"], ...}
    requires_consent boolean NOT NULL DEFAULT false,
    retention_days integer,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Seeded purposes:
-- 'payroll_processing': salary, bank_details, tax_code, NI — no consent needed (contractual)
-- 'performance_management': goals, ratings, comments — no consent needed (legitimate interest)
-- 'diversity_reporting': gender, ethnicity, disability — consent required
-- 'marketing': personal_email — consent required
-- 'dsar_response': all fields — no consent needed (legal obligation)
```

#### Separation of Duties Enforcement

```sql
CREATE TABLE app.separation_of_duties_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    description text,
    -- Two permission sets that cannot be held by the same person acting on the same record
    permission_set_a text[] NOT NULL,
    permission_set_b text[] NOT NULL,
    -- Enforcement: 'hard' = system prevents, 'soft' = warns but allows with audit flag
    enforcement varchar(10) NOT NULL DEFAULT 'hard' CHECK (enforcement IN ('hard', 'soft')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.separation_of_duties_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY sod_tenant_isolation ON app.separation_of_duties_rules
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

**Default SoD Rules:**
1. **Self-approval prohibition:** `absence:leave_requests:create_own` ↔ `absence:leave_requests:approve` (cannot approve own leave)
2. **Payroll dual control:** `payroll:payroll_runs:create` ↔ `payroll:payroll_runs:approve` (cannot create and approve same run)
3. **Recruitment fairness:** `recruitment:interviews:score` ↔ `recruitment:offers:approve` (interviewer cannot solely approve offer)
4. **Data erasure dual control:** `compliance:data_erasure:request` ↔ `compliance:data_erasure:execute` (requester cannot execute)
5. **Salary change dual control:** `hr:employees:edit_salary` ↔ `payroll:payroll_runs:approve` (salary editor cannot approve payroll containing their changes)

---

## Layer 4: Approval Chains & Delegation

### 4.1 Approval Chain Configuration

```sql
CREATE TABLE app.approval_chain_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    description text,
    -- What triggers this chain
    trigger_type varchar(50) NOT NULL,
    -- e.g., 'leave_request', 'expense_claim', 'salary_change', 'payroll_run',
    --       'job_posting', 'offer', 'contract_change', 'data_erasure',
    --       'headcount_request', 'bonus_payment', 'recruitment_offer'

    -- Condition for when this chain applies (optional)
    condition_rules jsonb DEFAULT '{}',
    -- e.g., {"leave_type": "annual", "duration_days_gte": 5}
    -- e.g., {"salary_change_pct_gte": 10}
    -- e.g., {"amount_gte": 5000, "currency": "GBP"}

    -- Chain steps (ordered)
    steps jsonb NOT NULL,
    -- Array of step definitions (see below)

    -- Chain behaviour
    is_sequential boolean NOT NULL DEFAULT true,  -- false = parallel approval
    require_all boolean NOT NULL DEFAULT true,     -- false = any one approver sufficient

    -- Escalation
    auto_escalate_after_hours integer DEFAULT 48,
    escalation_target varchar(30) DEFAULT 'next_level_manager',
    max_escalation_levels integer DEFAULT 3,

    -- SLA
    sla_hours integer DEFAULT 72,
    sla_breach_action varchar(30) DEFAULT 'notify_hr',
    -- 'notify_hr', 'auto_approve', 'auto_reject', 'escalate'

    is_active boolean NOT NULL DEFAULT true,
    priority integer NOT NULL DEFAULT 100,  -- Lower = higher priority when multiple chains match
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT approval_chain_unique UNIQUE (tenant_id, name)
);

ALTER TABLE app.approval_chain_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY acd_tenant_isolation ON app.approval_chain_definitions
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY acd_insert ON app.approval_chain_definitions FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_approval_chains_trigger ON app.approval_chain_definitions(tenant_id, trigger_type)
    WHERE is_active = true;
```

#### Step Definition Schema

```typescript
interface ApprovalStep {
  step_number: number;           // 1, 2, 3...
  name: string;                  // "Line Manager", "HR Review", "Finance Approval"
  approver_type: ApproverType;
  approver_config: ApproverConfig;
  skip_conditions?: SkipCondition[];
  timeout_hours?: number;        // Step-level timeout (overrides chain default)
  required_action: 'approve' | 'approve_or_reject' | 'acknowledge';
}

type ApproverType =
  | 'direct_manager'            // Employee's line manager
  | 'skip_level_manager'        // Manager's manager
  | 'department_head'           // Head of the employee's department
  | 'specific_role'             // Any user with a specific role
  | 'specific_user'             // A named user
  | 'cost_centre_owner'         // Owner of the employee's cost centre
  | 'hr_business_partner'       // Assigned HR BP for the department
  | 'payroll_admin'             // Any payroll admin
  | 'pool'                      // Any member of a user group/pool

interface ApproverConfig {
  role_slug?: string;           // For 'specific_role'
  user_id?: string;             // For 'specific_user'
  pool_id?: string;             // For 'pool'
  fallback_role?: string;       // If primary approver unavailable
  allow_delegation?: boolean;   // Can this step be delegated?
}

interface SkipCondition {
  field: string;                // e.g., 'amount', 'duration_days', 'leave_type'
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq' | 'in';
  value: any;
}
```

#### Example Approval Chains

**Leave Request (< 3 days):**
```json
{
  "trigger_type": "leave_request",
  "condition_rules": {"duration_days_lt": 3, "leave_type_in": ["annual", "personal"]},
  "steps": [
    {"step_number": 1, "name": "Line Manager", "approver_type": "direct_manager", "approver_config": {"allow_delegation": true}}
  ],
  "auto_escalate_after_hours": 48,
  "sla_hours": 24
}
```

**Leave Request (>= 3 days):**
```json
{
  "trigger_type": "leave_request",
  "condition_rules": {"duration_days_gte": 3},
  "steps": [
    {"step_number": 1, "name": "Line Manager", "approver_type": "direct_manager", "approver_config": {"allow_delegation": true}},
    {"step_number": 2, "name": "Department Head", "approver_type": "department_head", "approver_config": {"allow_delegation": false},
     "skip_conditions": [{"field": "duration_days", "operator": "lt", "value": 10}]}
  ],
  "auto_escalate_after_hours": 48
}
```

**Salary Change (any amount):**
```json
{
  "trigger_type": "salary_change",
  "steps": [
    {"step_number": 1, "name": "HR Review", "approver_type": "specific_role", "approver_config": {"role_slug": "hr_admin"}},
    {"step_number": 2, "name": "Finance Approval", "approver_type": "specific_role", "approver_config": {"role_slug": "payroll_admin"},
     "skip_conditions": [{"field": "change_pct", "operator": "lt", "value": 5}]},
    {"step_number": 3, "name": "Director Sign-off", "approver_type": "skip_level_manager", "approver_config": {},
     "skip_conditions": [{"field": "new_salary", "operator": "lt", "value": 80000}]}
  ],
  "is_sequential": true,
  "auto_escalate_after_hours": 72
}
```

**Data Erasure (GDPR Right to be Forgotten):**
```json
{
  "trigger_type": "data_erasure",
  "steps": [
    {"step_number": 1, "name": "Compliance Review", "approver_type": "specific_role", "approver_config": {"role_slug": "compliance_officer"}},
    {"step_number": 2, "name": "DPO Approval", "approver_type": "specific_user", "approver_config": {"user_id": ":tenant_dpo_user_id"}}
  ],
  "require_all": true,
  "sla_hours": 720
}
```

### 4.2 Approval Instance Tracking

```sql
CREATE TABLE app.approval_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    chain_definition_id uuid NOT NULL REFERENCES app.approval_chain_definitions(id),

    -- What's being approved
    entity_type varchar(50) NOT NULL,
    entity_id uuid NOT NULL,

    -- Who submitted
    submitted_by uuid NOT NULL REFERENCES app.users(id),
    submitted_at timestamptz NOT NULL DEFAULT now(),

    -- Current state
    current_step integer NOT NULL DEFAULT 1,
    status varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'escalated', 'expired')),

    -- Metadata
    metadata jsonb DEFAULT '{}',
    completed_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.approval_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_tenant_isolation ON app.approval_instances
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY ai_insert ON app.approval_instances FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_approval_instances_entity ON app.approval_instances(tenant_id, entity_type, entity_id);
CREATE INDEX idx_approval_instances_status ON app.approval_instances(tenant_id, status) WHERE status = 'pending';
CREATE INDEX idx_approval_instances_submitted_by ON app.approval_instances(tenant_id, submitted_by);

-- Individual step decisions
CREATE TABLE app.approval_step_decisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    approval_instance_id uuid NOT NULL REFERENCES app.approval_instances(id) ON DELETE CASCADE,

    step_number integer NOT NULL,
    step_name varchar(100) NOT NULL,

    -- Who should approve
    assigned_to uuid NOT NULL REFERENCES app.users(id),
    -- Who actually approved (may differ if delegated)
    decided_by uuid REFERENCES app.users(id),
    -- If delegated
    delegation_id uuid REFERENCES app.approval_delegations(id),

    decision varchar(20) CHECK (decision IN ('approved', 'rejected', 'skipped', 'escalated')),
    decision_at timestamptz,
    comments text,

    -- SLA tracking
    due_at timestamptz,
    escalated_at timestamptz,
    escalated_to uuid REFERENCES app.users(id),

    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.approval_step_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY asd_tenant_isolation ON app.approval_step_decisions
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_approval_step_decisions_instance ON app.approval_step_decisions(approval_instance_id, step_number);
CREATE INDEX idx_approval_step_decisions_assigned ON app.approval_step_decisions(tenant_id, assigned_to, decision)
    WHERE decision IS NULL;
```

### 4.3 Enhanced Delegation Rules

Extend the existing `approval_delegations` table:

```sql
ALTER TABLE app.approval_delegations
  ADD COLUMN IF NOT EXISTS max_amount numeric,
  ADD COLUMN IF NOT EXISTS currency varchar(3) DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS allowed_actions text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS chain_prevention boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_delegation_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS requires_hr_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_notify_on_use boolean NOT NULL DEFAULT true;

-- Prevent re-delegation (delegate cannot delegate further)
CREATE OR REPLACE FUNCTION app.prevent_delegation_chain()
RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM app.approval_delegations ad
        WHERE ad.delegate_id = NEW.delegator_id
          AND ad.is_active = true
          AND ad.start_date <= NEW.end_date
          AND ad.end_date >= NEW.start_date
          AND ad.chain_prevention = true
    ) THEN
        RAISE EXCEPTION 'Cannot create delegation: delegator is themselves a delegate (chain prevention)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_delegation_chain
    BEFORE INSERT ON app.approval_delegations
    FOR EACH ROW
    EXECUTE FUNCTION app.prevent_delegation_chain();
```

#### Delegation Scope Rules

| Who Can Delegate | Scope | Duration Limit | Amount Limit | HR Approval Required |
|------------------|-------|----------------|--------------|---------------------|
| line_manager+ | Own approval authority only | 30 days max | Inherited from role | No (< 14 days), Yes (>= 14 days) |
| department_head+ | Own + team approvals | 60 days max | Up to department budget | No (< 30 days) |
| hr_admin | Any HR approval | 90 days max | Unlimited | No |
| tenant_admin | Any approval | 180 days max | Unlimited | No |
| employee, contractor, intern | Cannot delegate | N/A | N/A | N/A |

#### Emergency Delegation
HR admin or tenant_admin can force-create a delegation on behalf of an absent manager:

```typescript
interface EmergencyDelegation {
  absent_user_id: string;
  delegate_user_id: string;
  scope: string;
  reason: 'medical_emergency' | 'unexpected_absence' | 'system_continuity';
  created_by: string; // Must be hr_admin or tenant_admin
  // No max_delegation_days limit for emergency
  // Auto-expires after 14 days unless extended
}
```

### 4.4 Separation of Duties Resolution

```typescript
// Pseudocode for SoD check before allowing an approval action
function checkSeparationOfDuties(
  tenantId: string,
  userId: string,
  entityType: string,
  entityId: string,
  action: string
): { allowed: boolean; reason?: string } {
  // 1. Get all SoD rules for this tenant
  const rules = getSoDRules(tenantId);

  for (const rule of rules) {
    // 2. Check if current action is in either permission set
    const actionInSetA = rule.permission_set_a.includes(`${entityType}:${action}`);
    const actionInSetB = rule.permission_set_b.includes(`${entityType}:${action}`);

    if (!actionInSetA && !actionInSetB) continue;

    // 3. Check if user already performed the conflicting action on this entity
    const conflictSet = actionInSetA ? rule.permission_set_b : rule.permission_set_a;
    const priorActions = getAuditLog(tenantId, userId, entityType, entityId, conflictSet);

    if (priorActions.length > 0) {
      if (rule.enforcement === 'hard') {
        return {
          allowed: false,
          reason: `Separation of duties violation: you already performed ${priorActions[0].action} on this record. Rule: ${rule.name}`
        };
      } else {
        // Soft enforcement: allow but flag
        logSoDViolation(tenantId, userId, entityId, rule.id);
        return { allowed: true, reason: `SoD soft warning: ${rule.name}` };
      }
    }
  }

  return { allowed: true };
}
```

---

## Layer 5: Audit, Compliance & Monitoring

### 5.1 Permission Audit Trail

#### Permission Check Log (High-Volume)

```sql
-- Append-only table for permission check audit
-- Partitioned by month for performance
CREATE TABLE app.permission_audit_log (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    employee_id uuid,            -- Target employee (if applicable)

    -- What was checked
    resource varchar(100) NOT NULL,
    action varchar(50) NOT NULL,
    permission_key varchar(200) NOT NULL,

    -- Result
    result varchar(10) NOT NULL CHECK (result IN ('granted', 'denied', 'error')),
    denial_reason varchar(200),

    -- Context
    data_scope varchar(30),
    ip_address inet,
    user_agent text,
    request_id uuid,
    session_id uuid,

    -- How permission was resolved
    resolved_via varchar(30),    -- 'cache', 'computed', 'delegation', 'condition'
    roles_evaluated text[],
    conditions_evaluated text[],

    created_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions (automated via cron)
CREATE TABLE app.permission_audit_log_2026_03 PARTITION OF app.permission_audit_log
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE app.permission_audit_log_2026_04 PARTITION OF app.permission_audit_log
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Indexes on each partition
CREATE INDEX idx_pal_tenant_user ON app.permission_audit_log(tenant_id, user_id, created_at DESC);
CREATE INDEX idx_pal_resource ON app.permission_audit_log(tenant_id, resource, action, created_at DESC);
CREATE INDEX idx_pal_denied ON app.permission_audit_log(tenant_id, result, created_at DESC)
    WHERE result = 'denied';
CREATE INDEX idx_pal_request ON app.permission_audit_log(request_id);

-- No RLS on audit log (accessed via system context only)
-- No UPDATE or DELETE policies — append-only
REVOKE UPDATE, DELETE ON app.permission_audit_log FROM hris_app;
```

**Volume management:** Only log denied checks and sensitive resource access by default. Configurable per-tenant to log all checks (compliance mode).

```sql
CREATE TABLE app.audit_log_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    log_all_checks boolean NOT NULL DEFAULT false,
    log_denied_only boolean NOT NULL DEFAULT true,
    sensitive_resources text[] NOT NULL DEFAULT '{
        hr:employees:view_sensitive, hr:employees:view_salary,
        hr:employees:view_medical, hr:employees:view_disciplinary,
        hr:bank_details:read, compliance:dsar:*,
        compliance:data_erasure:*, compliance:data_breach:*,
        system:users:impersonate, talent:succession:*,
        payroll:payroll_runs:*, payroll:payslips:view_all
    }',
    retention_days integer NOT NULL DEFAULT 2555,  -- 7 years (UK HMRC requirement)
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_config_unique UNIQUE (tenant_id)
);
```

#### Role & Permission Change Log

```sql
CREATE TABLE app.permission_change_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    change_type varchar(30) NOT NULL CHECK (change_type IN (
        'role_created', 'role_updated', 'role_deleted', 'role_archived',
        'role_assigned', 'role_revoked',
        'permission_granted', 'permission_revoked',
        'field_permission_changed',
        'delegation_created', 'delegation_revoked', 'delegation_used', 'delegation_expired',
        'portal_access_granted', 'portal_access_revoked',
        'data_scope_changed', 'condition_changed',
        'sod_violation'
    )),
    -- Who and what
    actor_id uuid NOT NULL,
    target_user_id uuid,
    target_role_id uuid,
    -- Before/after state
    previous_state jsonb,
    new_state jsonb,
    -- Metadata
    reason text,
    ip_address inet,
    request_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only
REVOKE UPDATE, DELETE ON app.permission_change_log FROM hris_app;

CREATE INDEX idx_pcl_tenant_time ON app.permission_change_log(tenant_id, created_at DESC);
CREATE INDEX idx_pcl_target_user ON app.permission_change_log(tenant_id, target_user_id, created_at DESC);
CREATE INDEX idx_pcl_change_type ON app.permission_change_log(tenant_id, change_type, created_at DESC);
CREATE INDEX idx_pcl_actor ON app.permission_change_log(tenant_id, actor_id, created_at DESC);
```

### 5.2 Access Reviews (Periodic Certification)

```sql
CREATE TABLE app.access_review_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    name varchar(200) NOT NULL,
    description text,
    campaign_type varchar(30) NOT NULL CHECK (campaign_type IN (
        'quarterly_certification',  -- Standard quarterly review
        'sensitive_access',         -- Review of Tier 2-4 data access
        'admin_review',             -- Review of admin-level roles
        'stale_access',             -- Clean up unused permissions
        'new_starter',              -- Review permissions granted to new starters
        'custom'
    )),
    -- Who reviews
    reviewer_type varchar(30) NOT NULL CHECK (reviewer_type IN (
        'direct_manager', 'hr_admin', 'compliance_officer', 'specific_user'
    )),
    reviewer_user_id uuid REFERENCES app.users(id),  -- For 'specific_user'
    -- Scope
    scope_filter jsonb DEFAULT '{}',
    -- e.g., {"roles": ["hr_admin", "payroll_admin"], "departments": ["uuid"]}
    -- Timeline
    start_date date NOT NULL,
    due_date date NOT NULL,
    -- Status
    status varchar(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
    total_reviews integer DEFAULT 0,
    completed_reviews integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.access_review_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY arc_tenant_isolation ON app.access_review_campaigns
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE TABLE app.access_review_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    campaign_id uuid NOT NULL REFERENCES app.access_review_campaigns(id) ON DELETE CASCADE,
    -- What's being reviewed
    user_id uuid NOT NULL REFERENCES app.users(id),
    role_assignment_id uuid REFERENCES app.role_assignments(id),
    -- Review details
    reviewer_id uuid NOT NULL REFERENCES app.users(id),
    decision varchar(20) CHECK (decision IN ('certify', 'revoke', 'modify', 'pending')),
    decision_at timestamptz,
    comments text,
    -- Auto-detection flags
    is_stale boolean DEFAULT false,         -- No permission usage in 90+ days
    is_over_provisioned boolean DEFAULT false, -- Has permissions never used
    last_used_at timestamptz,
    usage_count integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.access_review_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY ari_tenant_isolation ON app.access_review_items
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_ari_campaign ON app.access_review_items(campaign_id, decision);
CREATE INDEX idx_ari_reviewer ON app.access_review_items(tenant_id, reviewer_id, decision)
    WHERE decision = 'pending';
```

### 5.3 Anomaly Detection Rules

```sql
CREATE TABLE app.security_alert_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    description text,
    rule_type varchar(30) NOT NULL CHECK (rule_type IN (
        'bulk_export',          -- Large data export in short period
        'off_hours_access',     -- Access outside business hours
        'failed_access_burst',  -- Multiple denied access attempts
        'privilege_escalation', -- Attempt to access higher-tier data
        'cross_tenant_attempt', -- Attempted cross-tenant access
        'sensitive_data_spike', -- Unusual frequency of sensitive data access
        'mass_record_access',   -- Accessing many employee records rapidly
        'api_key_abuse'         -- API key used from unexpected IP/pattern
    )),
    -- Thresholds
    threshold_config jsonb NOT NULL,
    -- e.g., {"count_threshold": 100, "time_window_minutes": 15}
    -- e.g., {"business_hours_start": "08:00", "business_hours_end": "18:00", "timezone": "Europe/London"}
    -- e.g., {"max_failures": 10, "time_window_minutes": 5}
    -- Actions when triggered
    alert_actions text[] NOT NULL DEFAULT '{"notify_admin"}',
    -- 'notify_admin', 'notify_compliance', 'lock_account', 'require_mfa', 'block_ip', 'log_only'
    severity varchar(10) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.security_alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY sar_tenant_isolation ON app.security_alert_rules
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE TABLE app.security_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    rule_id uuid NOT NULL REFERENCES app.security_alert_rules(id),
    user_id uuid NOT NULL,
    severity varchar(10) NOT NULL,
    description text NOT NULL,
    context jsonb NOT NULL,
    -- e.g., {"ip": "1.2.3.4", "records_accessed": 150, "time_window": "15 min"}
    status varchar(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')),
    resolved_by uuid REFERENCES app.users(id),
    resolved_at timestamptz,
    resolution_notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- No RLS on alerts — accessed via system context by admins only
CREATE INDEX idx_security_alerts_tenant ON app.security_alerts(tenant_id, status, created_at DESC);
CREATE INDEX idx_security_alerts_user ON app.security_alerts(tenant_id, user_id, created_at DESC);
CREATE INDEX idx_security_alerts_severity ON app.security_alerts(tenant_id, severity, status)
    WHERE status IN ('open', 'investigating');
```

### 5.4 Compliance Reports

Pre-built report definitions for common compliance needs:

| Report | Description | Required Role | Data Source |
|--------|-------------|---------------|-------------|
| **Permission Matrix** | Who has access to what — full role×permission grid | compliance_officer, tenant_admin | roles, role_assignments, data_scopes |
| **Sensitive Data Access** | Who accessed Tier 2-4 data in period X | compliance_officer, tenant_admin | permission_audit_log |
| **Permission Changes** | All role/permission changes over time | compliance_officer, tenant_admin | permission_change_log |
| **SoD Violations** | Separation of duties violations (soft) | compliance_officer, tenant_admin | permission_change_log where change_type='sod_violation' |
| **Stale Permissions** | Unused permissions for 90+ days | hr_admin, tenant_admin | permission_audit_log aggregated |
| **GDPR Article 30** | Records of processing activities | compliance_officer | data_access_purposes, permission_audit_log |
| **User Effective Permissions** | Detailed breakdown for a specific user | hr_admin, tenant_admin | Computed: roles + conditions + scopes + delegations |
| **Role Membership** | All users assigned to each role | hr_admin, tenant_admin | role_assignments |
| **Delegation History** | All delegations created, used, expired | hr_admin, tenant_admin | approval_delegations, delegation_log |
| **Access Review Status** | Campaign completion rates | compliance_officer, tenant_admin | access_review_campaigns, access_review_items |

---

## Layer 6: API & Technical Enforcement

### 6.1 Four Enforcement Points

Every data access passes through four enforcement layers. A request is blocked at the FIRST layer that denies it:

```
Request → [1. Route Guard] → [2. Service Check] → [3. Repository Scope] → [4. Database RLS]
```

#### Point 1: Route-Level Guard (Elysia Plugin)

Every route declares its required permission. The `rbacPlugin` checks before the handler runs:

```typescript
// Enhanced RBAC plugin with data scope and condition support
interface PermissionRequirement {
  resource: string;
  action: string;
  dataScope?: 'self' | 'team' | 'all';  // Hint for which scope level is needed
  conditions?: string[];                   // Named conditions to evaluate
  sodCheck?: boolean;                      // Enable SoD validation for this route
}

// Route declaration
app.post('/api/v1/leave-requests', {
  beforeHandle: [
    requireAuth(),
    requirePermission({
      resource: 'absence:leave_requests',
      action: 'create_own',
      dataScope: 'self'
    })
  ]
}, handler);

app.post('/api/v1/leave-requests/:id/approve', {
  beforeHandle: [
    requireAuth(),
    requirePermission({
      resource: 'absence:leave_requests',
      action: 'approve',
      dataScope: 'team',
      sodCheck: true  // Cannot approve own request
    })
  ]
}, handler);
```

#### Point 2: Service-Level Check (Business Logic)

The service layer validates contextual permissions that can't be expressed as simple route guards:

```typescript
// Service-level permission check
async approveLeaveRequest(ctx: TenantContext, requestId: string): Promise<ServiceResult<LeaveRequest>> {
  const request = await this.repo.findById(ctx, requestId);

  // Check 1: Request exists and is in approvable state
  if (request.status !== 'pending') {
    return { error: 'INVALID_STATE', message: 'Request is not pending approval' };
  }

  // Check 2: Separation of duties — cannot approve own request
  if (request.submitted_by === ctx.userId) {
    return { error: 'SOD_VIOLATION', message: 'Cannot approve your own leave request' };
  }

  // Check 3: Data scope — can only approve for employees in scope
  const inScope = await this.permissionService.isEmployeeInScope(
    ctx, request.employee_id, 'absence:leave_requests', 'approve'
  );
  if (!inScope) {
    return { error: 'SCOPE_VIOLATION', message: 'Employee is not in your approval scope' };
  }

  // Check 4: Delegation check — if acting as delegate, validate delegation
  if (ctx.actingAsDelegate) {
    const valid = await this.delegationService.validateDelegation(
      ctx, ctx.delegationId, 'leave_request', request.id
    );
    if (!valid) {
      return { error: 'DELEGATION_INVALID', message: 'Delegation is not valid for this action' };
    }
  }

  // Check 5: Approval chain — is this user the current step's approver?
  const chainResult = await this.approvalService.validateApprover(
    ctx, 'leave_request', request.id, ctx.userId
  );
  if (!chainResult.allowed) {
    return { error: 'NOT_APPROVER', message: chainResult.reason };
  }

  // Proceed with approval...
}
```

#### Point 3: Repository-Level Scope Filtering

Repository queries are automatically scoped to the user's data visibility:

```typescript
// Repository with automatic scope filtering
class EmployeeRepository {
  async findAll(ctx: TenantContext, filters: EmployeeFilters): Promise<Employee[]> {
    // Get the employee IDs this user can see
    const scopedIds = await this.permissionService.getVisibleEmployeeIds(
      ctx, 'hr:employees', 'read'
    );

    return ctx.tx`
      SELECT e.*
      FROM employees e
      WHERE e.id = ANY(${scopedIds})
        ${filters.department_id ? ctx.tx`AND e.department_id = ${filters.department_id}` : ctx.tx``}
        ${filters.status ? ctx.tx`AND e.status = ${filters.status}` : ctx.tx``}
      ORDER BY e.last_name, e.first_name
      LIMIT ${filters.limit ?? 50}
    `;
  }
}
```

#### Point 4: Database-Level RLS (Tenant Isolation)

The existing RLS policies enforce tenant isolation at the database level. This is the last line of defence — even if application code has a bug, RLS prevents cross-tenant data access:

```sql
-- Already in place for all tenant-owned tables:
CREATE POLICY tenant_isolation ON app.employees
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

### 6.2 Permission Resolution Algorithm

```typescript
/**
 * Resolves effective permissions for a user.
 * Called on cache miss or cache invalidation.
 * Result cached in Redis with 15-min TTL.
 */
async function resolveEffectivePermissions(
  tenantId: string,
  userId: string,
  asOf: Date = new Date()
): Promise<EffectivePermissions> {
  // 1. Get all active role assignments for this user
  const roleAssignments = await db.query`
    SELECT ra.*, r.permissions, r.parent_role_id, r.name as role_name
    FROM app.role_assignments ra
    JOIN app.roles r ON r.id = ra.role_id
    WHERE ra.tenant_id = ${tenantId}
      AND ra.user_id = ${userId}
      AND ra.effective_from <= ${asOf}
      AND (ra.effective_to IS NULL OR ra.effective_to > ${asOf})
  `;

  // 2. For each role, resolve full permission set (including inheritance)
  const permissionSets: PermissionEntry[] = [];
  for (const assignment of roleAssignments) {
    const rolePerms = await resolveRolePermissions(assignment.role_id);
    for (const [key, value] of Object.entries(rolePerms)) {
      permissionSets.push({
        key,
        effect: value as 'grant' | 'deny',
        source_role: assignment.role_name,
        source_role_id: assignment.role_id,
        constraints: assignment.constraints,
      });
    }
  }

  // 3. Merge permissions across roles (union for grants, deny wins over grant)
  const merged = new Map<string, PermissionResolution>();
  for (const entry of permissionSets) {
    const existing = merged.get(entry.key);
    if (!existing) {
      merged.set(entry.key, {
        effect: entry.effect,
        sources: [entry.source_role],
        data_scopes: [entry.constraints?.data_scope_id].filter(Boolean),
      });
    } else {
      existing.sources.push(entry.source_role);
      if (entry.constraints?.data_scope_id) {
        existing.data_scopes.push(entry.constraints.data_scope_id);
      }
      // Deny always wins
      if (entry.effect === 'deny') {
        existing.effect = 'deny';
      }
    }
  }

  // 4. Resolve active delegations (add delegated permissions)
  const delegations = await db.query`
    SELECT ad.*, r.permissions
    FROM app.approval_delegations ad
    JOIN app.role_assignments ra ON ra.user_id = ad.delegator_id
    JOIN app.roles r ON r.id = ra.role_id
    WHERE ad.delegate_id = ${userId}
      AND ad.tenant_id = ${tenantId}
      AND ad.is_active = true
      AND ad.start_date <= ${asOf}
      AND ad.end_date >= ${asOf}
  `;

  for (const delegation of delegations) {
    // Add delegated approval permissions (scoped to delegation.scope)
    const scopePermissions = filterPermissionsByScope(delegation.permissions, delegation.scope);
    for (const [key, value] of Object.entries(scopePermissions)) {
      if (!merged.has(key)) {
        merged.set(key, {
          effect: value as 'grant' | 'deny',
          sources: [`delegation:${delegation.delegator_id}`],
          data_scopes: [],
          via_delegation: delegation.id,
        });
      }
    }
  }

  // 5. Build final effective permissions object
  const effective: EffectivePermissions = {
    tenant_id: tenantId,
    user_id: userId,
    computed_at: asOf,
    permissions: Object.fromEntries(merged),
    roles: roleAssignments.map(ra => ra.role_name),
    delegations: delegations.map(d => d.id),
  };

  return effective;
}

/**
 * Resolve a role's permissions including all inherited permissions from parent chain.
 */
async function resolveRolePermissions(roleId: string): Promise<Record<string, string>> {
  const role = await getRole(roleId);
  if (!role.parent_role_id) {
    return role.permissions;
  }

  // Recursively get parent permissions
  const parentPerms = await resolveRolePermissions(role.parent_role_id);

  // Merge: child overrides parent
  return { ...parentPerms, ...role.permissions };
}
```

### 6.3 Permission Check Function (< 5ms Target)

```typescript
/**
 * Fast permission check — used at route and service layers.
 * Returns in < 5ms when cached, < 50ms when computing.
 */
async function checkPermission(
  ctx: TenantContext,
  resource: string,
  action: string,
  targetEmployeeId?: string
): Promise<PermissionCheckResult> {
  const cacheKey = `perms:${ctx.tenantId}:${ctx.userId}`;

  // 1. Try cache first (Redis, 15-min TTL)
  let effective = await redis.get(cacheKey);
  if (!effective) {
    effective = await resolveEffectivePermissions(ctx.tenantId, ctx.userId);
    await redis.set(cacheKey, JSON.stringify(effective), 'EX', 900);
  }

  // 2. Check permission key (exact match → module wildcard → full wildcard)
  const permKey = `${resource}:${action}`;
  const [module, res, act] = permKey.split(':');

  const granted =
    effective.permissions[permKey]?.effect === 'grant' ||
    effective.permissions[`${module}:${res}:*`]?.effect === 'grant' ||
    effective.permissions[`${module}:*:*`]?.effect === 'grant' ||
    effective.permissions['*:*:*']?.effect === 'grant';

  const denied =
    effective.permissions[permKey]?.effect === 'deny' ||
    effective.permissions[`${module}:${res}:*`]?.effect === 'deny' ||
    effective.permissions[`${module}:*:*`]?.effect === 'deny';

  // Deny always wins
  if (denied) {
    return { allowed: false, reason: 'explicitly_denied' };
  }

  if (!granted) {
    return { allowed: false, reason: 'not_granted' };
  }

  // 3. Check employment status restrictions
  const statusAllowed = await checkEmploymentStatusAccess(ctx.userId, resource, action);
  if (!statusAllowed) {
    return { allowed: false, reason: 'employment_status_restricted' };
  }

  // 4. Check contextual conditions (if any apply to this permission)
  const conditionResult = await evaluateConditions(ctx, resource, action);
  if (!conditionResult.allowed) {
    return { allowed: false, reason: conditionResult.reason };
  }

  // 5. If target employee specified, check data scope
  if (targetEmployeeId) {
    const inScope = await isEmployeeInScope(ctx, targetEmployeeId, resource, action);
    if (!inScope) {
      return { allowed: false, reason: 'out_of_data_scope' };
    }
  }

  return { allowed: true };
}
```

### 6.4 Cache Invalidation Strategy

```typescript
// Events that trigger cache invalidation
const CACHE_INVALIDATION_TRIGGERS = {
  // Invalidate specific user's cache
  'role_assigned': (event) => [`perms:${event.tenantId}:${event.userId}`],
  'role_revoked': (event) => [`perms:${event.tenantId}:${event.userId}`],
  'delegation_created': (event) => [`perms:${event.tenantId}:${event.delegateId}`],
  'delegation_revoked': (event) => [`perms:${event.tenantId}:${event.delegateId}`],
  'delegation_expired': (event) => [`perms:${event.tenantId}:${event.delegateId}`],

  // Invalidate all users with this role (when role permissions change)
  'role_permissions_updated': async (event) => {
    const users = await getUsersWithRole(event.tenantId, event.roleId);
    return users.map(u => `perms:${event.tenantId}:${u.id}`);
  },

  // Invalidate all users in tenant (nuclear option — avoid if possible)
  'field_permissions_changed': (event) => [`perms:${event.tenantId}:*`],
  'tenant_settings_changed': (event) => [`perms:${event.tenantId}:*`],
};

// Bulk permission check for form rendering (50+ fields)
async function checkFieldPermissions(
  ctx: TenantContext,
  entityName: string,
  fieldNames: string[]
): Promise<Map<string, 'edit' | 'view' | 'hidden'>> {
  const cacheKey = `fperms:${ctx.tenantId}:${ctx.userId}:${entityName}`;

  let fieldPerms = await redis.get(cacheKey);
  if (!fieldPerms) {
    // Batch query — single DB round-trip for all fields
    fieldPerms = await db.withSystemContext(async (tx) => {
      return tx`
        SELECT fr.field_name, app.get_effective_field_permission(${ctx.userId}, fr.id) as permission
        FROM app.field_registry fr
        WHERE fr.entity_name = ${entityName}
          AND fr.field_name = ANY(${fieldNames})
          AND (fr.tenant_id = ${ctx.tenantId} OR fr.tenant_id IS NULL)
      `;
    });
    await redis.set(cacheKey, JSON.stringify(fieldPerms), 'EX', 900);
  }

  return new Map(fieldPerms.map(fp => [fp.field_name, fp.permission]));
}
```

### 6.5 API Security Enforcement

```typescript
// Every route must declare permissions — enforced via Elysia plugin
interface RoutePermissionDeclaration {
  permissions: PermissionRequirement[];
  rateLimit?: { max: number; window: string };  // Override default rate limit
  apiKeyScopes?: string[];                       // Which API key scopes can access this
  requireMfa?: boolean;                          // Require active MFA session
  auditLevel?: 'none' | 'standard' | 'detailed'; // Audit logging level
}

// API Key scoping
interface ApiKeyScope {
  name: string;
  permissions: string[];  // Subset of full permission set
  rate_limit: { max: number; window: string };
  allowed_ips?: string[];
  allowed_origins?: string[];
}

// Example API key scopes for external integrations:
const API_KEY_SCOPES = {
  'payroll_export': {
    permissions: ['payroll:payroll_runs:read', 'payroll:payslips:read', 'hr:employees:read'],
    rate_limit: { max: 100, window: '1h' },
  },
  'recruitment_ats': {
    permissions: ['recruitment:candidates:create', 'recruitment:candidates:read', 'recruitment:job_postings:read'],
    rate_limit: { max: 500, window: '1h' },
  },
  'lms_scorm': {
    permissions: ['lms:courses:read', 'lms:certifications:issue'],
    rate_limit: { max: 200, window: '1h' },
  },
  'read_only': {
    permissions: ['hr:employees:read', 'hr:departments:read', 'hr:positions:read'],
    rate_limit: { max: 1000, window: '1h' },
  },
};
```

---

## Layer 7: UI/UX Permission Controls

### 7.1 Frontend Permission Architecture

#### Enhanced usePermissions Hook

```typescript
// packages/web/app/hooks/use-permissions.ts
interface PermissionContext {
  // Core checks
  can(resource: string, action: string): boolean;
  canAny(permissions: string[]): boolean;
  canAll(permissions: string[]): boolean;

  // Data scope checks
  canAccessEmployee(employeeId: string, resource: string, action: string): boolean;
  isInScope(employeeId: string): boolean;

  // Field-level checks
  fieldPermission(entityName: string, fieldName: string): 'edit' | 'view' | 'hidden';
  fieldPermissions(entityName: string, fieldNames: string[]): Map<string, 'edit' | 'view' | 'hidden'>;

  // Role info
  hasRole(roleSlug: string): boolean;
  roles: string[];
  dataScope: DataScopeType;

  // Loading state
  isLoading: boolean;
}

function usePermissions(): PermissionContext {
  const { data: session } = useSession();
  const tenantId = useTenantId();

  // Fetch effective permissions (cached on server, cached in React Query)
  const { data: effective, isLoading } = useQuery({
    queryKey: ['permissions', tenantId, session?.user?.id],
    queryFn: () => api.get('/api/v1/me/permissions'),
    staleTime: 5 * 60 * 1000,  // 5 min client-side cache
    gcTime: 15 * 60 * 1000,
  });

  // Fetch field permissions (batched per entity)
  const fieldPermCache = useRef(new Map<string, Map<string, string>>());

  const can = useCallback((resource: string, action: string): boolean => {
    if (!effective) return false;
    const key = `${resource}:${action}`;
    const perms = effective.permissions;

    // Check deny first
    if (perms[key]?.effect === 'deny') return false;

    // Check exact, then wildcards
    const [mod, res] = resource.split(':');
    return (
      perms[key]?.effect === 'grant' ||
      perms[`${mod}:${res}:*`]?.effect === 'grant' ||
      perms[`${mod}:*:*`]?.effect === 'grant' ||
      perms['*:*:*']?.effect === 'grant'
    );
  }, [effective]);

  // ... other methods ...

  return { can, canAny, canAll, canAccessEmployee, isInScope, fieldPermission, fieldPermissions,
           hasRole, roles: effective?.roles ?? [], dataScope: effective?.data_scope ?? 'self', isLoading };
}
```

#### PermissionGate Component

```tsx
// Hides children if user lacks permission
interface PermissionGateProps {
  resource: string;
  action: string;
  fallback?: React.ReactNode;         // Show this instead if denied
  showDisabled?: boolean;              // Show but disabled instead of hidden
  disabledTooltip?: string;           // Tooltip when disabled
  children: React.ReactNode;
}

function PermissionGate({
  resource, action, fallback, showDisabled, disabledTooltip, children
}: PermissionGateProps) {
  const { can, isLoading } = usePermissions();

  if (isLoading) return null;  // Don't flash content

  if (!can(resource, action)) {
    if (showDisabled) {
      return (
        <Tooltip content={disabledTooltip ?? 'You do not have permission for this action'}>
          <div className="opacity-50 pointer-events-none" aria-disabled="true">
            {children}
          </div>
        </Tooltip>
      );
    }
    return fallback ?? null;
  }

  return <>{children}</>;
}

// Usage:
<PermissionGate resource="absence:leave_requests" action="approve">
  <Button onClick={handleApprove}>Approve</Button>
</PermissionGate>

<PermissionGate
  resource="payroll:payroll_runs" action="create"
  showDisabled
  disabledTooltip="Only Payroll Admins can create payroll runs"
>
  <Button>Create Payroll Run</Button>
</PermissionGate>
```

#### SecureField Component (Enhanced)

```tsx
interface SecureFieldProps {
  entity: string;        // 'employee', 'compensation', etc.
  field: string;         // 'salary', 'ni_number', etc.
  value: any;
  onChange?: (value: any) => void;
  maskFormat?: 'last4' | 'first_initial' | 'full_mask' | 'none';
  children?: (props: { value: any; permission: string; masked: boolean }) => React.ReactNode;
}

function SecureField({ entity, field, value, onChange, maskFormat, children }: SecureFieldProps) {
  const { fieldPermission } = usePermissions();
  const permission = fieldPermission(entity, field);

  if (permission === 'hidden') return null;

  // Mask sensitive values in view mode
  const displayValue = permission === 'view' && maskFormat
    ? maskValue(value, maskFormat)
    : value;

  // Render prop pattern for custom rendering
  if (children) {
    return children({ value: displayValue, permission, masked: permission === 'view' && !!maskFormat });
  }

  if (permission === 'edit' && onChange) {
    return <Input value={value} onChange={onChange} />;
  }

  return <span className="text-gray-700">{displayValue}</span>;
}

function maskValue(value: string, format: string): string {
  if (!value) return '';
  switch (format) {
    case 'last4': return '****' + value.slice(-4);
    case 'first_initial': return value[0] + '****';
    case 'full_mask': return '********';
    default: return value;
  }
}

// Usage:
<SecureField entity="employee" field="national_insurance_number" value={employee.niNumber} maskFormat="last4" />
// Renders: "****4567" for view, hidden for hidden, full input for edit

<SecureField entity="compensation" field="base_salary" value={employee.salary}>
  {({ value, permission, masked }) => (
    <div className="flex items-center gap-2">
      <span>{permission === 'edit' ? formatCurrency(value) : '£' + value}</span>
      {masked && <LockIcon className="w-4 h-4 text-gray-400" />}
    </div>
  )}
</SecureField>
```

### 7.2 Navigation & Menu Filtering

```tsx
// Navigation items are filtered by permission
interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType;
  permission?: { resource: string; action: string };
  children?: NavItem[];
}

const ADMIN_NAV: NavItem[] = [
  {
    label: 'HR', icon: UsersIcon, path: '/admin/hr',
    permission: { resource: 'hr:employees', action: 'read' },
    children: [
      { label: 'Employees', path: '/admin/hr/employees', icon: UserIcon,
        permission: { resource: 'hr:employees', action: 'read' } },
      { label: 'Positions', path: '/admin/hr/positions', icon: BriefcaseIcon,
        permission: { resource: 'hr:positions', action: 'read' } },
      { label: 'Bank Details', path: '/admin/hr/bank-details', icon: BankIcon,
        permission: { resource: 'hr:bank_details', action: 'read' } },
      // ... more items
    ],
  },
  {
    label: 'Payroll', icon: PoundIcon, path: '/admin/payroll',
    permission: { resource: 'payroll:payroll_runs', action: 'read' },
  },
  {
    label: 'Compliance', icon: ShieldIcon, path: '/admin/compliance',
    permission: { resource: 'compliance:dsar', action: 'view' },
  },
  // ...
];

function FilteredNav({ items }: { items: NavItem[] }) {
  const { can } = usePermissions();

  return items
    .filter(item => !item.permission || can(item.permission.resource, item.permission.action))
    .map(item => (
      <NavLink key={item.path} to={item.path}>
        <item.icon />
        <span>{item.label}</span>
        {item.children && (
          <FilteredNav items={item.children} />
        )}
      </NavLink>
    ));
}
```

### 7.3 Export Controls

```typescript
// Export permissions vary by role
interface ExportControl {
  allowed: boolean;
  maxRecords?: number;
  excludeFields?: string[];     // Fields stripped from export
  requiresApproval?: boolean;   // Needs HR approval for large exports
  auditLevel: 'standard' | 'detailed';
}

function getExportControl(ctx: TenantContext, resource: string): ExportControl {
  const { can, hasRole } = usePermissions();

  if (!can(resource, 'export')) {
    return { allowed: false, auditLevel: 'standard' };
  }

  // Tier-based export limits
  if (hasRole('employee')) {
    return {
      allowed: true,
      maxRecords: 1,  // Own data only
      excludeFields: [],
      auditLevel: 'standard',
    };
  }

  if (hasRole('line_manager') || hasRole('team_leader')) {
    return {
      allowed: true,
      maxRecords: 100,
      excludeFields: ['ni_number', 'bank_details', 'medical_records'],
      auditLevel: 'detailed',
    };
  }

  if (hasRole('hr_admin') || hasRole('tenant_admin')) {
    return {
      allowed: true,
      maxRecords: 10000,
      excludeFields: [],
      requiresApproval: false, // > 500 records triggers approval for lower roles
      auditLevel: 'detailed',
    };
  }

  return { allowed: false, auditLevel: 'standard' };
}
```

### 7.4 Permission Management UI

#### Role Management Dashboard

**Route:** `/admin/settings/roles`

Features:
- List all system and custom roles with member counts
- Create custom role (select parent, name, description)
- Clone system role as custom role
- Edit custom role permissions (checkbox matrix)
- Archive/restore custom roles
- View role members and their assignments
- Role comparison tool (side-by-side diff of two roles)

#### Permission Matrix View

**Route:** `/admin/settings/roles/matrix`

Renders a grid: rows = permission keys (grouped by module), columns = roles. Each cell shows grant/deny/inherit with colour coding:
- Green = granted
- Red = denied
- Grey = inherited (from parent)
- Empty = not set

#### User Permission Inspector

**Route:** `/admin/settings/users/:userId/permissions`

Shows for a specific user:
1. **Assigned Roles** — list of roles with effective dates and constraints
2. **Effective Permissions** — flattened list of all granted/denied permissions with source (which role)
3. **Data Scope** — visual map of which employees they can see
4. **Field Permissions** — per-entity field access grid
5. **Active Delegations** — delegations they hold and delegations they've given
6. **Active Conditions** — contextual conditions currently affecting their access
7. **Audit Trail** — recent permission checks (granted and denied)

#### Permission Simulation

**Route:** `/admin/settings/roles/simulate`

"What if" tool: Select a user, optionally add/remove roles, and see the resulting effective permissions without actually making changes. Useful for planning role changes.

```typescript
// API endpoint
POST /api/v1/system/permissions/simulate
{
  "user_id": "uuid",
  "add_roles": ["role-uuid-1"],
  "remove_roles": ["role-uuid-2"],
  "add_delegations": [{ "delegator_id": "uuid", "scope": "leave" }]
}
// Returns: EffectivePermissions (same shape as real resolution)
```

### 7.5 Self-Service Permission Views

#### Employee: My Permissions

**Route:** `/me/permissions`

- Shows a simplified view of what the user can do
- Grouped by category: "HR", "Leave", "Time", "Learning", etc.
- Each item shows the action and whether it's granted
- Link to "Request Additional Access" form

#### Manager: Team Access Overview

**Route:** `/manager/team/access`

- Shows each team member's role and portal access
- Quick link to user permission inspector (if manager has `system:roles:read`)
- Highlights any pending access reviews for the team

#### Request Additional Access

**Route:** `/me/access-request`

```typescript
interface AccessRequest {
  requested_role?: string;      // Role slug
  requested_permissions?: string[];  // Specific permission keys
  justification: string;
  duration?: string;            // 'permanent' | 'temporary:30d' | 'temporary:90d'
}
// Routed to tenant_admin or hr_admin for approval via approval chain
```

---

## Migration Plan

### Phase 1: Schema Extension (Zero Downtime)

**Migration 0171_extended_roles.sql:**
```sql
-- Add new columns to existing roles table
ALTER TABLE app.roles
  ADD COLUMN IF NOT EXISTS parent_role_id uuid REFERENCES app.roles(id),
  ADD COLUMN IF NOT EXISTS max_permission_ceiling jsonb,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES app.users(id),
  ADD COLUMN IF NOT EXISTS cloned_from uuid REFERENCES app.roles(id),
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_roles_parent ON app.roles(parent_role_id) WHERE parent_role_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roles_active_custom ON app.roles(tenant_id, is_system, is_archived)
    WHERE is_system = false AND is_archived = false;

-- Add data_scope_id to role_assignments.constraints
-- (No schema change needed — constraints is already JSONB)

-- New tables (additive, no breaking changes)
-- data_scopes, role_templates, permission_conditions, separation_of_duties_rules,
-- approval_chain_definitions, approval_instances, approval_step_decisions,
-- permission_audit_log, permission_change_log, access_review_campaigns,
-- access_review_items, security_alert_rules, security_alerts,
-- data_access_purposes, audit_log_config
```

### Phase 2: Seed New System Roles

**Migration 0172_seed_expanded_roles.sql:**
```sql
-- Insert new system roles (UUIDs are deterministic for idempotency)
-- Existing 5 roles (a0..01 through a0..05) are UNTOUCHED

-- Set parent_role_id on existing roles
UPDATE app.roles SET parent_role_id = 'a0000000-0000-0000-0000-000000000002'
    WHERE id = 'a0000000-0000-0000-0000-000000000003';  -- hr_admin → tenant_admin
UPDATE app.roles SET parent_role_id = 'a0000000-0000-0000-0000-000000000003'
    WHERE id = 'a0000000-0000-0000-0000-000000000004';  -- manager → hr_admin (via line_manager)
UPDATE app.roles SET parent_role_id = 'a0000000-0000-0000-0000-000000000004'
    WHERE id = 'a0000000-0000-0000-0000-000000000005';  -- employee → manager (via team_leader)

-- Insert new system roles
INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions, parent_role_id)
VALUES
  ('a0000000-0000-0000-0000-000000000006', NULL, 'hr_officer', 'Day-to-day HR operations', true, '{...}'::jsonb, 'a0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000007', NULL, 'payroll_admin', 'Payroll processing and tax', true, '{...}'::jsonb, 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000008', NULL, 'recruitment_admin', 'Recruitment pipeline', true, '{...}'::jsonb, 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000009', NULL, 'lms_admin', 'Learning management', true, '{...}'::jsonb, 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-00000000000a', NULL, 'compliance_officer', 'GDPR and compliance', true, '{...}'::jsonb, 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-00000000000b', NULL, 'health_safety_officer', 'H&S incidents', true, '{...}'::jsonb, 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-00000000000c', NULL, 'department_head', 'Department management', true, '{...}'::jsonb, 'a0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-00000000000d', NULL, 'team_leader', 'Team view, limited approvals', true, '{...}'::jsonb, 'a0000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-00000000000e', NULL, 'contractor', 'Limited self-service', true, '{...}'::jsonb, 'a0000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-00000000000f', NULL, 'temp_worker', 'Time-bounded access', true, '{...}'::jsonb, 'a0000000-0000-0000-0000-00000000000e'),
  ('a0000000-0000-0000-0000-000000000010', NULL, 'intern', 'Read-only + learning', true, '{...}'::jsonb, 'a0000000-0000-0000-0000-000000000005'),
  ('a0000000-0000-0000-0000-000000000011', NULL, 'external_auditor', 'Read-only audit access', true, '{...}'::jsonb, NULL),
  ('a0000000-0000-0000-0000-000000000012', NULL, 'board_member', 'Executive-level reports', true, '{...}'::jsonb, NULL)
ON CONFLICT (id) DO NOTHING;
```

### Phase 3: Permission Key Migration

**Migration 0173_migrate_permission_keys.sql:**
```sql
-- Migrate existing 2-part permission keys to 3-part format
-- Old: "employees:read" → New: "hr:employees:read"
-- Old: "leave_requests:approve" → New: "absence:leave_requests:approve"

-- Create mapping function
CREATE OR REPLACE FUNCTION app.migrate_permission_key(old_key text) RETURNS text AS $$
DECLARE
    parts text[];
    module text;
BEGIN
    parts := string_to_array(old_key, ':');
    IF array_length(parts, 1) = 3 THEN RETURN old_key; END IF;  -- Already 3-part
    IF array_length(parts, 1) != 2 THEN RETURN old_key; END IF; -- Unknown format

    -- Map resource to module
    module := CASE parts[1]
        WHEN 'employees' THEN 'hr'
        WHEN 'positions' THEN 'hr'
        WHEN 'departments' THEN 'hr'
        WHEN 'contracts' THEN 'hr'
        WHEN 'leave_requests' THEN 'absence'
        WHEN 'leave_types' THEN 'absence'
        WHEN 'leave_policies' THEN 'absence'
        WHEN 'time_entries' THEN 'time'
        WHEN 'timesheets' THEN 'time'
        WHEN 'schedules' THEN 'time'
        WHEN 'courses' THEN 'lms'
        WHEN 'cases' THEN 'cases'
        WHEN 'workflows' THEN 'workflows'
        WHEN 'reports' THEN 'analytics'
        WHEN 'users' THEN 'system'
        WHEN 'roles' THEN 'system'
        WHEN 'settings' THEN 'system'
        WHEN 'audit_log' THEN 'system'
        ELSE 'system'
    END;

    RETURN module || ':' || old_key;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update all roles' permission JSONB keys
UPDATE app.roles
SET permissions = (
    SELECT jsonb_object_agg(
        app.migrate_permission_key(key),
        value
    )
    FROM jsonb_each(permissions)
)
WHERE permissions != '{}';
```

### Phase 4: Backwards Compatibility Layer

The RBAC plugin continues to accept both 2-part and 3-part permission keys during transition:

```typescript
// Backwards-compatible permission check
function normalizePermissionKey(key: string): string {
  const parts = key.split(':');
  if (parts.length === 3) return key; // Already new format

  // Legacy 2-part format — prepend module
  const resourceToModule: Record<string, string> = {
    employees: 'hr', positions: 'hr', departments: 'hr', contracts: 'hr',
    leave_requests: 'absence', leave_types: 'absence', leave_policies: 'absence',
    time_entries: 'time', timesheets: 'time', schedules: 'time',
    courses: 'lms', cases: 'cases', workflows: 'workflows',
    reports: 'analytics', users: 'system', roles: 'system',
    settings: 'system', audit_log: 'system',
  };

  const module = resourceToModule[parts[0]] ?? 'system';
  return `${module}:${parts[0]}:${parts[1]}`;
}
```

### Phase 5: Rollout Sequence

1. **Week 1:** Deploy schema migrations (Phase 1). No behaviour change.
2. **Week 2:** Deploy new system roles and permission key migration (Phase 2-3). Existing `requirePermission()` calls still work via backwards-compat layer.
3. **Week 3:** Deploy enhanced RBAC plugin with data scopes, conditions, and SoD checks. Feature-flagged per tenant.
4. **Week 4:** Deploy approval chain system. Initially opt-in per tenant.
5. **Week 5:** Deploy audit/compliance tables and background workers.
6. **Week 6:** Deploy frontend permission management UI.
7. **Week 7:** Remove backwards-compat layer. All permission keys must be 3-part.
8. **Ongoing:** Backfill route declarations with new permission keys module by module.

---

## Edge Cases

### 1. User with No Roles Assigned

**Behaviour:** Denied all permissions. Can authenticate but sees empty dashboard with message: "Your account has no roles assigned. Please contact your HR administrator."

**Implementation:** `resolveEffectivePermissions()` returns empty permissions map. The frontend `usePermissions().can()` returns `false` for all checks.

### 2. User with Conflicting Permissions from Multiple Roles

**Behaviour:** `deny` always wins. If Role A grants `hr:employees:delete` and Role B denies it, the effective permission is `deny`.

**Resolution priority:** `explicit deny > explicit grant > inherited deny > inherited grant > not_set (deny)`

### 3. Manager Who Is Also an Employee Viewing Their Own Review

**Behaviour:** They see their own review as an employee (self-assessment section editable), NOT as a manager. The system checks: if `target_employee_id === current_user_employee_id`, apply `self` scope rules regardless of manager role.

**Implementation:** Route handler checks if target is self before applying manager-level permissions:
```typescript
if (targetEmployeeId === ctx.employeeId) {
  // Self-access: use employee permissions, not manager permissions
  requirePermission('talent:performance_reviews', 'read');  // Not 'approve' or 'calibrate'
}
```

### 4. Super Admin Impersonating a Regular User

**Behaviour:** While impersonating, the super admin sees EXACTLY what the impersonated user sees. Their own permissions are suspended for the impersonation session. All actions during impersonation are logged with both the real and impersonated user IDs.

**Implementation:**
```typescript
// Impersonation context
interface ImpersonationContext extends TenantContext {
  isImpersonating: true;
  realUserId: string;        // Super admin's actual user ID
  impersonatedUserId: string; // The user being impersonated
  // All permission checks use impersonatedUserId
}
```

### 5. Tenant Admin Trying to Grant super_admin

**Behaviour:** Denied. The system validates that `tenant_admin` cannot assign roles that exceed their own permission ceiling. Since `super_admin` has `tenant_id = NULL` and cross-tenant access, no tenant-scoped role can grant it.

**Implementation:** `assignRole()` checks `max_permission_ceiling` of the assigner's highest role. If the target role exceeds it, the assignment is blocked.

### 6. Delegated Approver Whose Delegation Expires Mid-Approval

**Behaviour:** The approval step assigned to the delegate remains assigned. However, when the delegate tries to submit their decision after expiry, the system validates the delegation is still active. If expired:
- The decision is rejected with error "Delegation has expired"
- The approval step is reassigned back to the original approver
- Both parties are notified
- If the original approver is still absent, the step escalates per the chain's escalation rules

### 7. Employee Whose Manager Changes Mid-Leave-Request

**Behaviour:** The pending approval continues with the ORIGINAL manager who was assigned at submission time. The `approval_step_decisions.assigned_to` records the specific user, not the role. If the original manager is no longer available (terminated, transferred), the step auto-escalates.

**Rationale:** Changing the approver mid-flow would reset SLA timers and create confusion. The approval chain records are immutable once created.

### 8. Cross-Legal-Entity Reporting

**Behaviour:** By default, users can only see data within their own legal entity. Cross-entity access requires explicit `cross_entity_access` in their role assignment constraints. Even with cross-entity access, the permission set may be restricted (e.g., read-only across entities).

**Example:** A Group HR Director needs to see headcount across all 3 legal entities:
```sql
INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints)
VALUES (:tenant_id, :user_id, :hr_admin_role_id, jsonb_build_object(
  'cross_entity_access', ARRAY['entity-1-uuid', 'entity-2-uuid', 'entity-3-uuid'],
  'cross_entity_permissions', ARRAY['hr:employees:read', 'analytics:*:*', 'headcount:*:*']
));
```

### 9. Contractor with Time-Limited Access

**Behaviour:** Contractor role assignments always have `effective_to` set. The system:
1. Sends reminder notification 14 days before expiry
2. Sends warning notification 3 days before expiry
3. On expiry: role automatically revoked, cache invalidated, user sees "Access expired" on next login
4. If contract is extended: HR creates new role assignment with new `effective_to`

### 10. TUPE Transfer (Employee Moves Between Tenants)

**Behaviour:** TUPE (Transfer of Undertakings) requires creating a new employee record in the receiving tenant:
1. HR admin in receiving tenant creates new employee record
2. Data from source tenant is exported (with consent) and imported
3. New role assignments are created in the receiving tenant
4. Source tenant terminates the employee and retains data per retention policy
5. No cross-tenant data sharing happens at the database level — it's an export/import process

**The permission system does NOT support moving a user between tenants.** This is by design — tenant isolation is absolute.

### 11. Redundancy Planning Visibility Restrictions

**Behaviour:** Redundancy plans are Tier 4 (Privileged) data. Only accessible to:
- `tenant_admin` with `talent:succession:view_plans`
- Users explicitly added to a "redundancy planning" custom role
- Not visible to line managers, even for their own team

**Implementation:** Redundancy records have an additional `is_redundancy_plan` flag. Repository queries filter these out unless the user has both `talent:succession:view_plans` AND a specific `view_redundancy` permission that is not part of any default system role.

### 12. Board-Level Compensation (Remuneration Committee Only)

**Behaviour:** Executive compensation data (board members, C-suite) is Tier 4. The `board_member` role can see aggregate compensation data but NOT individual executive salaries unless they are also on the Remuneration Committee.

**Implementation:**
```sql
-- Custom role: remuneration_committee
-- Created per-tenant, not a system role
INSERT INTO app.roles (tenant_id, name, parent_role_id, permissions)
VALUES (:tenant_id, 'remuneration_committee', :board_member_id, jsonb_build_object(
  'hr:employees:view_salary', 'grant',
  'payroll:bonus_payments:view_reports', 'grant'
));

-- Data scope restricted to exec band
-- Constraints: {"custom_filter": {"grade_in": ["exec", "c_suite", "board"]}}
```

Even `tenant_admin` does not see board compensation unless they are also assigned the `remuneration_committee` role (separation enforced by an SoD rule).
```
```

---

## Related Documents

- [Permissions V2 Migration Guide](permissions-v2-migration-guide.md) — Adopting the enhanced permission layers
- [Architecture Overview](ARCHITECTURE.md) — System architecture and plugin pipeline
- [Security Patterns](../patterns/SECURITY.md) — RLS, authentication, and authorization enforcement
- [API Reference](../api/API_REFERENCE.md) — Endpoint permission requirements
- [Security Audit](../audit/security-audit.md) — Authorization and access control findings
- [Frontend Guide](../guides/FRONTEND.md) — UI permission guards and role-based rendering
