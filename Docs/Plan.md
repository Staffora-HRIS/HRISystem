1. System Overview
High-level description:
This system is a multi-tenant, enterprise-grade HR & Payroll platform covering Core HR, Payroll, Time & Attendance, Absence, Talent, LMS, Self-Service, Workflows, Reporting, Salary Modelling, Security (advanced controls + anomaly detection), People Analytics, Case Management, and Onboarding—built as a modular, domain-oriented platform with a unified identity, authorization, audit layer, and shared data model.
Goals:
Single source of truth: Core HR is the authoritative system of record for employees, org structure, and contracts; other modules reference it via stable IDs and effective-dated links.
Operational excellence: High integrity payroll processing, deterministic pay runs, traceable adjustments, and robust approvals.
Employee experience: Fast, reliable employee/manager self-service for payslips, leave, time, onboarding, learning, and performance.
Extensible enterprise platform: Configurable workflows, feature flags, auditing, multi-tenant controls, and upgrade-safe data modeling.
Assumptions (explicit, no questions):
Tenancy model: Each tenant represents a customer organization; users may belong to multiple tenants.
Storage for generated documents: Payslip PDFs and case attachments are stored in external object storage (S3-compatible); PostgreSQL stores metadata and access controls.
Country packs: Payroll supports country-specific tax rules via versioned “country packs” (tax tables + calculation rules) and can run multiple packs per tenant if needed.
Identity & auth: BetterAuth supports session-based authentication with database-backed user storage; Redis is available for session caching and revocation. If BetterAuth lacks a needed adapter feature, a custom adapter will be implemented.
Non-functional requirements (security, scalability, performance):
Security:
Authentication: BetterAuth session-based auth, strong password policies, MFA (TOTP + WebAuthn), step-up auth for privileged operations.
Authorization: Fine-grained RBAC with scope constraints (tenant/org-unit/employee-relation), and enforced row-level access in PostgreSQL (RLS).
Auditability: Immutable audit logs for all sensitive reads/writes, payroll calculations, approvals, and admin actions with correlation IDs.
Compliance: GDPR principles, configurable retention, privacy controls, encryption at rest and in transit, DSAR support, separation of duties.
Scalability:
Stateless APIs: Horizontal scaling of Bun/Elysia API pods; Redis-backed sessions/queues; background worker scale-out.
Database scaling: Read replicas for analytics/reporting, partitioning for high-volume tables (audit/time events), strict indexing strategy.
Performance:
Caching: Redis cache for permissions, reference data, and computed dashboards; aggressive query/index design.
Asynchronous work: Payroll document generation, exports, analytics ETL, notifications, and anomaly detection run via background jobs.
2. Module-by-Module System Plan
2.1 Payroll
Purpose:
Owns payroll configuration, gross-to-net calculations, tax/deductions, pay runs, payslips, and payroll exports/journals.
Core features:
Pay calculation engine: Configurable pay components, earnings/deductions, taxable benefits, retro-pay, proration, overtime integration.
Tax & deductions: Versioned tax tables, employee tax profiles, statutory and voluntary deductions, garnishments.
Pay runs: Draft → calculate → validate → approve → export → close; re-run logic with immutable calculation snapshots.
Payslips: PDF/HTML generation, secure access, re-issue, historical archive.
Reporting: Payroll costs, liabilities, cost-center allocations, exceptions, audit-friendly reconciliation.
Key user flows:
Payroll admin: Configure pay calendar and rules → import hours/absences → run calculation → resolve exceptions → approval workflow → export payments/journals → close period.
Employee: View payslip → download → raise payroll query (case) if needed.
HR/Finance: Review payroll variance and headcount costs by org/cost center.
Dependencies on other modules:
Core HR: Employee identity, contract terms, compensation, cost centers, employment status.
Time & Attendance: Approved payable hours, overtime, premiums.
Absence: Paid/unpaid leave impacts, statutory leave rules.
Workflows: Approvals for pay runs, off-cycle payments, adjustments.
Security: Permission enforcement, step-up authentication, audit coverage.
Reporting & Analytics / People Analytics: Aggregation and trending.
Case Management: Payroll queries, dispute workflows.
Salary Modelling: Publishing approved scenario changes to planned compensation adjustments.
APIs required:
Configuration: GET/POST /api/v1/payroll/calendars, /pay-components, /deduction-types, /tax-table-versions
Employee payroll profile: GET/PUT /api/v1/payroll/employees/:employeeId/tax-profile, /deductions
Pay runs: POST /api/v1/payroll/pay-runs, POST /pay-runs/:id/calculate, POST /pay-runs/:id/approve, POST /pay-runs/:id/close
Results: GET /api/v1/payroll/pay-runs/:id/summary, /employees/:employeeId/items
Payslips: GET /api/v1/payroll/payslips, GET /payslips/:id/download
Exports: POST /api/v1/payroll/exports/bank, POST /exports/journal
Data ownership:
System of record for: Pay runs, pay run calculation snapshots, payslips, payroll exports/journals, payroll configuration (pay components/deductions/tax versions per tenant).
2.2 HR Record Management / Core HR
Purpose:
Central system of record for employee master data, contracts, job roles, and organisational structure (effective-dated).
Core features:
Employee master record: Personal details, contacts, addresses, emergency contacts, identifiers, document metadata.
Roles & contracts: Job role definitions, contract terms, compensation history, allowances, employment status lifecycle.
Org structure: Org units (departments/teams), cost centers, reporting lines,
1. System Overview
High-level description: A multi-tenant, enterprise HR & Payroll platform with modular domains (Core HR, Payroll, Time, Absence, Talent, LMS, Self-Service, Workflows, Reporting, Salary Modelling, Security/Threat controls, People Analytics, Case Management, Onboarding) built on:
Frontend: React, React Router v7 (framework mode), React Query
Backend: Bun + Elysia.js
Auth: BetterAuth
Datastores: PostgreSQL (primary SoR), Redis (cache/sessions/queues)
Infra: Dockerized services
Goals:
Single source of truth: Core HR owns employee/org/contract identity and effective-dated history; all modules reference stable IDs.
Deterministic payroll: Reproducible gross-to-net with immutable calculation snapshots and full traceability.
Enterprise controls: Strong RBAC + constrained scopes (tenant/org/manager relationship), MFA, anomaly detection, and immutable audit.
Configurable operations: Workflow engine for approvals and automation, tenant-configurable policies and calendars.
Analytics-ready: Operational reporting + people analytics with real-time signals where needed and batch aggregation for scale.
Assumptions (explicit):
Multi-tenancy: Single logical platform database with tenant isolation via tenant_id + PostgreSQL RLS; optional “tenant-per-db” later.
Documents/attachments: Payslip PDFs and case attachments stored in S3-compatible object storage; PostgreSQL stores metadata + access controls.
Integrations: Bank payment files, finance journals, email/SMS, and identity provisioning via adapters (outbound + inbound webhooks).
Global payroll: Multi-country readiness via versioned “Country Packs” (tax tables + rules + validations) per tenant and pay group.
Non-functional requirements:
Security: MFA (TOTP + WebAuthn), step-up auth for privileged actions, session hardening, encryption in transit/at rest, least privilege, SoD.
Scalability: Stateless Elysia API horizontally scaled; dedicated background workers; Redis Streams consumer groups; Postgres partitioning where high volume.
Performance: Redis caching for reference data/permissions/dashboard slices; query/index discipline; async generation for exports/PDFs/ETL.
Reliability: Idempotent commands, outbox pattern for event delivery, retries with DLQ semantics, operational runbooks.
Auditability: End-to-end correlation IDs; immutable audit events; payroll snapshots are write-once; approval decisions are immutable.
2. Module-by-Module System Plan
2.1 Payroll
Purpose: Gross-to-net pay calculation, tax/deductions, pay runs, payslips, exports/journals, payroll reporting.
Core features:
Pay rules: Earnings/deductions, taxable benefits, proration, retro, arrears, off-cycle runs, cost allocations.
Tax & statutory: Versioned tax tables, employee tax profiles, statutory deductions, garnishments.
Pay runs: Draft → calculate → validate → approve → export → close; immutable calculation snapshot per run.
Payslips: Secure generation (HTML/PDF), re-issue, history, access controls.
Key user flows:
Payroll admin: Configure calendars/rules → ingest approved hours/leave → calculate → resolve exceptions → approve → export → close.
Employee: View/download payslip → raise payroll query (case).
Dependencies on other modules: Core HR (contracts/comp), Time & Attendance (hours), Absence (paid leave), Workflows (approvals), Security (SoD/step-up), Reporting/Analytics, Case Mgmt (queries), Salary Modelling (planned changes).
APIs required:
Pay runs: POST/GET /api/v1/payroll/pay-runs, POST /pay-runs/:id/calculate|approve|close
Config: /api/v1/payroll/calendars, /pay-components, /deductions, /tax-versions
Outputs: /api/v1/payroll/payslips, /exports/bank, /exports/journal, /reports/*
Data ownership: SoR for pay runs, calculation snapshots, payslips, payroll exports, payroll config per tenant/pay group.
2.2 HR Record Management / Core HR
Purpose: System of record for employees, contracts, jobs/positions, org structure, and effective-dated employment history.
Core features:
Employee master: Identity, contacts, addresses, emergency contacts, identifiers, document metadata, lifecycle states.
Contracts & comp: Contract terms, pay basis, allowances, compensation history, FTE, working pattern.
Org structure: Org units, positions, reporting lines, cost centers, matrix relationships.
Key user flows:
HR admin: Create employee → assign contract/job/org → manage changes effective-dated → terminate → archive/retain.
Manager: View team structure → initiate changes via workflows.
Dependencies on other modules: Security (RBAC scopes), Workflows (change approvals), Onboarding (hire→employee), Talent (job/position), Payroll (contract/comp), Reporting/Analytics.
APIs required:
Employees: GET/POST/PUT /api/v1/hr/employees, /employees/:id/effective-changes
Org: /api/v1/hr/org-units, /positions, /reporting-lines
Contracts: /api/v1/hr/contracts, /compensations
Data ownership: SoR for employee/org/contract/job/position identity and effective-dated history.
2.3 Time & Attendance / Workforce Management
Purpose: Capture time events, schedules, timesheets, approvals, and payable hours outputs for payroll.
Core features:
Clocking: Clock-in/out, breaks, geofence/device policies, anomaly flags.
Scheduling: Shifts/rotas, demand templates, swap requests.
Timesheets: Aggregation, overtime rules, approvals, payable vs non-payable classifications.
Key user flows:
Employee: Clock in/out → review timesheet → submit corrections.
Manager: Approve timesheets → manage schedules → resolve exceptions.
Dependencies on other modules: Core HR (assignment/org), Workflows (approvals), Absence (non-working time), Payroll (payable hours), Security (device policy), Reporting.
APIs required:
Clock events: POST /api/v1/time/events, GET /time/events?employeeId=
Schedules: GET/POST /api/v1/time/schedules, /shifts, /swap-requests
Timesheets: POST /api/v1/time/timesheets/:id/submit|approve, /payable-hours
Data ownership: SoR for time events, schedules, timesheets, approvals, payable-hour outputs.
2.4 Absence Management
Purpose: Leave types, accrual/balances, requests, approvals, and payroll/time impacts.
Core features:
Policies: Leave types, eligibility, accrual rules, carryover, calendars, public holidays.
Requests: Holiday, sickness, statutory leaves; partial days; attachments.
Balances: Real-time balance projection; negative balance rules.
Key user flows:
Employee: Request leave → track approval → view balance.
Manager: Approve/deny → manage team coverage.
Dependencies on other modules: Core HR (eligibility/contract), Time (availability), Payroll (paid/unpaid), Workflows (approvals), Case Mgmt (sickness cases), Reporting.
APIs required:
Leave: POST/GET /api/v1/absence/requests, POST /requests/:id/approve|deny|cancel
Policy/balances: /api/v1/absence/policies, /balances?employeeId=, /calendars
Data ownership: SoR for leave policies, requests, balance ledger, and approval history.
2.5 Talent Management
Purpose: Recruitment pipeline, performance cycles, goals, reviews, and development planning (ties into LMS).
Core features:
Recruitment: Requisitions, candidates, stages, interviews, offers, hire conversion.
Performance: Cycles, goals/OKRs, check-ins, 360 feedback, ratings, calibration support.
Development: Career plans, competencies, development actions linked to LMS.
Key user flows:
Recruiter/HR: Create requisition → manage candidates → offer → hire → trigger onboarding.
Manager/Employee: Set goals → check-ins → review → development plan.
Dependencies on other modules: Core HR (positions/employee), Onboarding (hire), Workflows (approvals/offers), LMS (training), Reporting/People Analytics.
APIs required:
Recruiting: /api/v1/talent/requisitions, /candidates, /offers, POST /offers/:id/accept
Performance: /api/v1/talent/cycles, /goals, /reviews, /feedback
Development: /api/v1/talent/development-plans
Data ownership: SoR for recruiting pipeline artifacts, performance records, development plans.
2.6 Learning Management System (LMS)
Purpose: Training content delivery, learning paths, completions, certifications, and skills tracking.
Core features:
Content: Courses/modules, SCORM/xAPI metadata (as supported), assessments, certificates.
Learning paths: Role-based assignments, prerequisites, due dates, reminders.
Skills: Skill taxonomy, proficiency levels, evidence from completions.
Key user flows:
Employee: Enroll/assigned → complete → earn certificate → update skills.
Admin: Publish content → create paths → assign by role/org.
Dependencies on other modules: Core HR (role/org targeting), Talent (development plans), Workflows (approvals for mandatory training exceptions), Reporting/People Analytics.
APIs required:
Catalog: /api/v1/lms/courses, /modules, /assessments
Assignments: /api/v1/lms/assignments, /learning-paths
Progress: /api/v1/lms/completions, /certificates, /skills
Data ownership: SoR for LMS content metadata, assignments, completions, certifications, skill evidence.
2.7 Employee & Manager Self-Service
Purpose: Unified portals for employees/managers to perform HR actions (profile updates, leave, time, payslips, onboarding tasks).
Core features:
Employee portal: Profile, documents, payslips, leave, time, learning, cases.
Manager portal: Team dashboard, approvals (time/leave/workflows), performance, onboarding oversight.
Data updates: Controlled self-service updates with workflow + verification.
Key user flows:
Employee: Update address → submit → approval/verification → Core HR updates.
Manager: Approve leave/time → view team metrics → initiate actions.
Dependencies on other modules: All modules (acts as UX layer), Security (routing/authorization), Workflows (approvals).
APIs required:
Portal aggregates: /api/v1/portal/me, /portal/my-team, /portal/tasks, /portal/approvals
Self-service requests: /api/v1/self-service/changes
Data ownership: Does not own core data; owns self-service request artifacts, UI preferences, notification settings.
2.8 Reporting & Analytics
Purpose: Operational dashboards and reports across HR, payroll, time, absence, talent, LMS; near-real-time insights with cached aggregates.
Core features:
Dashboards: Headcount, attrition, absence rates, overtime, payroll variance, hiring funnel.
Exports: CSV/XLSX exports, scheduled delivery.
Semantic layer: Governed metrics definitions per tenant (and country pack).
Key user flows:
Exec/HR: View KPI dashboards → drilldown by org/site.
Finance: Payroll cost and variance reporting.
Dependencies on other modules: Reads from all SoR modules; uses Security for data entitlements; uses People Analytics for advanced models.
APIs required:
Dashboards: /api/v1/reports/dashboards/:id, /reports/query (governed query)
Exports: /api/v1/reports/exports, /exports/:id/status|download
Data ownership: Owns report definitions, metric catalog, cached aggregates/materializations, export jobs.
2.9 Configurable Workflows
Purpose: Approval flows and business process automation across modules with tenant-configurable policies.
Core features:
Workflow definitions: Steps, conditions, assignees (role/org/manager), SLAs, escalations.
Task orchestration: Human tasks + system actions (webhooks, updates).
Audit: Immutable decision history and state transitions.
Key user flows:
Admin: Define workflow → publish → attach to event (leave request, pay run approval, profile change).
Approver: Receive task → approve/deny → downstream actions.
Dependencies on other modules: Invoked by HR/Payroll/Time/Absence/Talent/LMS/Onboarding; depends on Security for assignment.
APIs required:
Definitions: /api/v1/workflows/definitions, /policies
Runtime: /api/v1/workflows/instances, /tasks, POST /tasks/:id/complete
Data ownership: SoR for workflow definitions, instances, tasks, transition history.
2.10 Salary Modelling
Purpose: Budgeting, forecasting, and people-cost modelling (what-if scenarios) integrated with Core HR and Payroll.
Core features:
Scenarios: Versioned models, assumptions, effective dates, currency, inflation/merit matrices.
Planning: Headcount planning, comp changes, bonus pools, cost center budgets.
Publish: Controlled promotion of approved scenario changes into Core HR future-dated comp events.
Key user flows:
Finance/HR: Create scenario → adjust assumptions → review variance → approval → publish to HR.
Dependencies on other modules: Core HR (baseline headcount/comp), Payroll (costing rules), Workflows (approvals), Reporting/People Analytics.
APIs required:
Scenarios: /api/v1/salary-model/scenarios, /assumptions, /lines
Publish: POST /api/v1/salary-model/scenarios/:id/submit|approve|publish
Data ownership: SoR for scenario models and planning lines; publishes (does not directly mutate) Core HR via workflowed change requests.
2.11 Security (iTrent Shield equivalent)
Purpose: Platform security controls: MFA, RBAC, anomaly detection, session/device policies, and audit guarantees.
Core features:
MFA/step-up: TOTP + WebAuthn; step-up for exports, pay run approval, role changes, bank details.
RBAC + scopes: Roles, permissions, and constraints (tenant/org-unit/employee relationship); SoD policies (e.g., payroll maker/checker).
Anomaly detection: Risk scoring (impossible travel, unusual export volume, privilege escalation, mass updates).
Key user flows:
Admin: Configure roles/policies → enforce MFA → review security events.
User: MFA enrollment → step-up when required.
Dependencies on other modules: Cross-cutting; integrates with all route guards, audit logging, workflow assignments, reporting entitlements.
APIs required:
Access: /api/v1/security/roles, /permissions, /assignments
MFA: /api/v1/security/mfa/enroll|verify|disable
Events: /api/v1/security/events, /risk-scores
Data ownership: SoR for security policies, RBAC assignments, security events, risk decisions (not user identity itself if BetterAuth owns it).
2.12 People Analytics Platform
Purpose: Advanced analytics (trend analysis, segmentation, cohorting, predictive indicators) with governed models and reproducible datasets.
Core features:
Modelled datasets: Curated workforce fact tables (headcount, movement, absence, learning, performance).
Trend/cohort analysis: Retention, promotion velocity, pay equity indicators, engagement proxies.
Explainability/audit: Model versioning, feature definitions, reproducible queries.
Key user flows:
Analyst: Build model definition → schedule refresh → publish dashboard.
Exec: Explore cohort trends with security filters.
Dependencies on other modules: Reads from all SoR modules; depends on Reporting for dashboards; Security for entitlements.
APIs required:
Models: /api/v1/people-analytics/models, /datasets, /refresh-jobs
Insights: /api/v1/people-analytics/insights, /cohorts/query
Data ownership: Owns analytics model metadata, curated dataset materializations, refresh job history.
2.13 Case Management
Purpose: HR case tracking with workflows, SLA, secure communications, and audit trails.
Core features:
Cases: Types (payroll query, grievance, sickness, onboarding issue), priorities, statuses, assignment rules.
Workflows: Intake → triage → investigation → resolution; tasks and approvals.
Audit + evidence: Notes, attachments metadata, access restrictions, legal hold support.
Key user flows:
Employee/Manager: Create case → add updates → receive outcome.
HR agent: Triage → assign → track SLA → close with resolution code.
Dependencies on other modules: Workflows (case lifecycle), Security (need-to-know), Payroll/Absence/Onboarding (linked records), Reporting.
APIs required:
Cases: /api/v1/cases, /cases/:id, POST /cases/:id/assign|close
Comments/attachments: /api/v1/cases/:id/comments, /attachments (pre-signed upload/download)
Data ownership: SoR for cases, communications, resolution codes, SLA tracking, audit trail.
2.14 Employee Onboarding
Purpose: Recruitment → hire → onboarding: tasks, checklists, policy acknowledgements, and access provisioning workflow.
Core features:
Hire conversion: Offer accepted → create employee skeleton record → collect data securely.
Task tracking: Role-based checklists, dependencies, deadlines, notifications.
Provisioning: Integrations/adapters for account creation (directory/SSO), equipment requests, policy acknowledgements.
Key user flows:
New hire: Complete onboarding forms → sign policies → complete required learning.
HR/IT/Manager: Assign tasks → verify docs → provision access → mark complete.
Dependencies on other modules: Talent (hire), Core HR (employee record), Workflows (approvals), Security (identity policies), LMS (mandatory training), Case Mgmt (issues).
APIs required:
Onboarding: /api/v1/onboarding/plans, /onboarding/instances, /tasks, POST /tasks/:id/complete
Provisioning: /api/v1/onboarding/provisioning/connectors, /requests
Data ownership: SoR for onboarding plans/instances/tasks, provisioning requests, onboarding status history.
3. Architecture Plan
Overall system architecture:
Architecture style: Modular monolith (single Bun/Elysia API) + background worker(s), with strict domain boundaries and an internal event bus (outbox pattern). Designed to split into services later without rewriting domains.
Core building blocks:
API: Elysia.js (HTTP + optional SSE), stateless, horizontally scalable.
Workers: Separate process for queues/ETL/PDF/export/anomaly scoring.
PostgreSQL: System of record with RLS, partitioning, materialized views.
Redis: Sessions, caches, rate limits, queues (Redis Streams + consumer groups).
Frontend ↔ Backend communication:
Transport: HTTPS JSON APIs; SSE for real-time updates (approvals queue, job status, security alerts) where needed.
Patterns: React Query for server state; idempotency keys on write operations; ETags for large reads when appropriate.
API design approach:
Resource-first: RESTful resources per domain; async jobs for heavy operations (/exports, /reports/exports, /payslips/generate).
Consistency: POST commands return operation/job IDs; GET reads are filterable and paginated (cursor-based).
Governance: Versioned API prefix (/api/v1), deprecation headers, OpenAPI generation from Elysia schemas.
Auth & authorization flow:
Authentication: BetterAuth session cookie (HttpOnly, Secure, SameSite), CSRF protection, session rotation, device binding optional.
Authorization: RBAC + constraint evaluation (tenant/org/manager relationship) enforced:
At API: Route guards compute “effective permissions” and enforce constraints.
At DB: PostgreSQL RLS ensures row-level isolation and prevents bypass.
Inter-module communication:
In-process domain events: Publish events on committed transactions (outbox).
Outbox: domain_outbox table + worker publishes to Redis Streams; consumers update projections/materializations.
Idempotency: Event handlers and commands use idempotency keys and unique constraints.
Scalability strategy:
Horizontal scale: Multiple API replicas; separate worker pool; Redis Streams for distributed consumption.
Data scale: Partition high-volume tables (audit, time events, analytics events), read replicas for reporting, materialized views for dashboards.
Isolation: Tenant-aware caching and throttling; noisy-neighbor controls via per-tenant rate limits and job quotas.
4. Database Plan
Multi-tenancy approach:
Tenant key: Every tenant-owned row contains tenant_id (UUID).
Isolation: PostgreSQL RLS policies enforce tenant_id = current_setting('app.tenant_id')::uuid plus scope constraints.
Cross-tenant identities: Global users table; user_tenants join table for membership and default tenant selection.
Schema design (tables per module):
Platform/Auth/Security:
tenants, users, user_tenants, sessions (if stored), roles, permissions, role_permissions, role_assignments, security_policies, security_events, audit_log
Core HR:
employees, employee_personal, employee_contacts, employee_addresses, employee_identifiers, employment_contracts, compensation_history, org_units, positions, reporting_lines, cost_centers
Payroll:
pay_calendars, pay_groups, pay_components, deduction_types, tax_versions, employee_tax_profiles, pay_runs, pay_run_employees, pay_run_items, pay_run_snapshots, payslips, payroll_exports
Time & Attendance:
time_devices, time_events, shift_templates, schedules, shifts, timesheets, timesheet_lines, timesheet_approvals, payable_hours_exports
Absence:
leave_types, leave_policies, leave_accrual_rules, leave_balances, leave_balance_ledger, leave_requests, leave_approvals, public_holidays
Talent:
requisitions, candidates, candidate_stage_events, interviews, offers, performance_cycles, goals, reviews, feedback_items, development_plans
LMS:
courses, course_modules, assessments, learning_paths, path_assignments, course_assignments, completions, certificates, skills, employee_skills
Self-Service:
self_service_changes, self_service_change_items, user_preferences, notifications
Workflows:
workflow_definitions, workflow_versions, workflow_instances, workflow_tasks, workflow_transitions, workflow_slas
Reporting & Analytics:
report_definitions, metric_definitions, report_exports, dashboard_cache, analytics_events, materialization_jobs
Salary Modelling:
salary_scenarios, salary_assumptions, salary_lines, salary_scenario_versions, salary_publish_events
People Analytics Platform:
pa_models, pa_datasets, pa_dataset_versions, pa_refresh_jobs, pa_insights, pa_feature_definitions
Case Management:
cases, case_participants, case_comments, case_attachments, case_status_history, case_sla_events
Onboarding:
onboarding_plans, onboarding_instances, onboarding_tasks, onboarding_task_events, provisioning_connectors, provisioning_requests
Cross-cutting (events/immutability):
domain_outbox, idempotency_keys
Key entities and relationships:
Tenant boundary: tenants 1..* employees, tenants 1..* org_units, all domain rows keyed by tenant_id.
Employment graph: employees 1..* employment_contracts 1..* compensation_history (effective-dated).
Org: org_units 1..* positions, positions 0..1 employees (assignment effective-dated), reporting_lines for manager relationships.
Payroll: pay_runs 1..* pay_run_employees 1..* pay_run_items, payslips link to pay_run_employees.
Time/Absence→Payroll: approved timesheet_lines and approved leave_requests produce payable_hours_exports / payroll inputs.
Workflows: workflow_instances attach to “business object” (object_type, object_id) with immutable transitions.
Indexing strategy:
Tenant-first indexes: Composite indexes starting with tenant_id for most access paths (e.g., (tenant_id, employee_id)).
Effective-dated access: (tenant_id, employee_id, effective_from, effective_to) with exclusion constraints where needed.
High-volume partitioning: Range partition by time for audit_log, time_events, analytics_events; retention by partition drop.
Search: GIN indexes for full-text fields where necessary (cases, notes) with tenant-scoped filters.
Redis usage (cache/sessions/queues):
Sessions: BetterAuth session cache + revocation list; TTL aligned to session expiration.
Permissions cache: perm:{tenant}:{user}; TTL 5–15 min; invalidated on role assignment changes.
Reference data cache: org tree, leave policy snapshots, tax tables; TTL 1–24h; version-keyed.
Dashboard cache: dash:{tenant}:{dashboard}:{filtersHash}; TTL 1–10 min.
Queues: Redis Streams:
jobs:payroll, jobs:exports, jobs:pdf, jobs:analytics, jobs:security; consumer groups per worker pool; DLQ stream per queue.
5. Security Plan
Authentication flow using BetterAuth:
Session-based auth: Login creates session; session cookie is HttpOnly/Secure/SameSite; rotate on privilege changes; revoke on logout.
CSRF: Double-submit or CSRF token endpoint; enforce on state-changing routes.
Device/context: Store device fingerprint metadata (non-PII hashed) to support risk scoring and user session review.
MFA implementation:
Methods: TOTP (RFC 6238), WebAuthn (passkeys) preferred; recovery codes (one-time).
Enrollment: Step-up required for enrollment changes; store MFA factors with strong encryption.
Step-up policies: Required for:
Payroll approvals/exports, bank detail changes, RBAC changes, mass updates, data exports, case access with restricted type.
Role-based access control (RBAC):
Model: Roles → permissions; assignments to users/groups; constraints:
Tenant scope: which tenant(s).
Org scope: org units/cost centers.
Relationship scope: self, direct reports, dotted-line team, HRBP assigned orgs.
Separation of duties: Enforce “maker-checker” for payroll and sensitive data changes via workflows + policy rules.
Audit logging:
Coverage: Auth events, access to sensitive records, payroll calculations, exports, approvals, policy changes.
Immutability: Append-only audit_log; tamper-evident chaining (hash of previous event) per tenant/day.
Correlation: request_id, actor_user_id, session_id, ip, user_agent, object_type/object_id.
Data protection & compliance:
PII minimization: Field-level classification; strict “need-to-know” policies; masked logging.
Encryption: TLS everywhere; encrypted volumes; optional column encryption for high-sensitivity fields (e.g., national IDs).
Retention: Configurable per tenant; legal hold for cases; automated deletion/anonymization workflows.
DSAR: Export employee data package; track fulfillment as a case with audit.
6. Frontend Plan
App structure using React Router v7 (framework mode):
Routing: Route modules with loaders/actions; nested layouts; server-driven data via loaders that call backend.
Segments: /(auth), /(app), /(admin) with protected layouts and permission gates.
Page/layout structure:
Global: App shell (top nav, org/tenant selector, notifications, user menu), left module nav, breadcrumb.
Core areas:
Employee: Profile, payslips, time, leave, learning, cases, onboarding.
Manager: Team, approvals, scheduling, performance.
Admin: Org, roles/security, workflows, payroll config, reporting config.
State management using React Query:
Server state: All remote data via queries; mutations for commands; optimistic updates where safe (e.g., notes).
Caching: Query keys are tenant-scoped; invalidate on workflow completion and relevant writes.
Prefetch: Prefetch common dashboard and “my tasks” on app entry; pagination via infinite queries.
Permission-based routing:
Route guards: Loader checks effective permissions; redirect to “Not Authorized” route if missing.
UI gating: Hide/disable actions based on permission + workflow state; never rely on UI-only enforcement.
Error handling and loading states:
Error boundaries: Per-route error boundaries with correlation ID display and retry actions.
Loading UX: Skeletons for dashboards; background refresh indicators; offline banners when API unreachable.
7. Backend API Plan
Elysia.js project structure:
Folders:
src/app.ts (bootstrap), src/plugins/* (auth, tenant, rbac, audit, validation, error)
src/modules/{hr,payroll,time,absence,talent,lms,workflows,reports,salary,security,peopleAnalytics,cases,onboarding}/
src/db/* (migrations, query helpers), src/jobs/* (workers/consumers)
Domain boundaries: Each module exposes routes, service layer, repository layer, and emits domain events.
API versioning:
Prefix: /api/v1/*; breaking changes via /api/v2.
Contracts: OpenAPI generated; contract tests for critical endpoints.
Module-based route separation:
Mounting: app.use(hrRoutes).use(payrollRoutes)... with per-module auth scopes.
Cross-module composition: “Portal” endpoints aggregate read models; heavy aggregation via cached materializations.
Validation strategy:
Boundary validation: Elysia schemas (t.*) for params/body; strict typing; reject unknown fields.
Business validation: Services enforce invariants (effective-dated overlaps, payroll run state machine).
Error handling:
Standard shape: { error: { code, message, details?, requestId } }
Mapping: Domain errors → 4xx; unexpected → 500 with request ID; never leak secrets.
Background jobs (if any):
Queues: Redis Streams for:
payroll calculation batches, payslip PDF generation, exports, scheduled reports, analytics refresh, anomaly scoring, notifications.
Idempotency: Job dedupe keys; retry with exponential backoff; DLQ stream.
8. DevOps & Infrastructure Plan
Docker setup (services, containers):
Services:
api (Bun + Elysia)
worker (Bun worker process consuming Redis Streams)
postgres (primary DB)
redis (cache/sessions/queues)
Optional (recommended): reverse proxy (TLS termination), object storage emulator (dev), observability stack.
Local vs production environments:
Local: Docker Compose; seed tenant + sample data; dev CORS; mail catcher; object storage emulator.
Prod: Separate API and worker deployments; Postgres managed or HA; Redis managed; strict network policies.
CI/CD pipeline outline:
Stages: lint → typecheck → unit tests → integration tests (DB/Redis) → build images → scan → deploy → smoke tests.
Artifacts: Versioned Docker images; migration bundle; OpenAPI spec.
Secrets management:
Principles: No secrets in repo; inject via environment/secret manager; rotation policies.
Keys: BetterAuth secrets, DB creds, Redis creds, object storage creds, webhook signing keys.
Monitoring & logging:
Structured logs: JSON with requestId, tenantId, userId, module, latency_ms.
Metrics: API latency/error rates, queue lag, job failure rates, payroll run durations, DB slow queries.
Tracing: Distributed trace IDs across API/worker; propagate correlation IDs into audit events.
9. Data Analytics & Reporting Plan
How analytics data is collected:
Operational events: Outbox emits normalized analytics_events (entity changes, approvals, run completions) with tenant-safe payloads.
Curated datasets: Worker builds tenant-scoped fact tables/materialized views (e.g., headcount daily snapshot).
Real-time vs batch processing:
Real-time (seconds-minutes): Approvals queues, “my tasks,” security alerts, job statuses via Redis + SSE.
Batch (minutes-hours): Workforce snapshots, payroll cost allocations, cohort metrics, trend aggregations.
Reporting dashboards:
Dashboard layer: Parameterized dashboards with governed metrics; cached query results in Redis + Postgres dashboard_cache.
Exports: Async export jobs; row-limited previews; full exports gated by permissions + step-up auth.
People analytics modelling:
Model registry: Versioned definitions in pa_models and pa_feature_definitions (no “mystery metrics”).
Reproducibility: Store model version, refresh job inputs, and SQL hash; allow auditors to re-run for a point-in-time dataset.
Security: Entitlement-aware queries; deny cross-org inference; minimum group size thresholds for sensitive analytics.
10. Future Scalability & Extensibility
How new modules can be added:
Contract-first: New module has its own routes/services/repositories and publishes domain events via outbox.
Platform services reuse: Auth/RBAC/audit/workflows/jobs/caching are shared plugins; new modules plug into them.
Multi-country payroll readiness:
Country packs: Versioned tax tables + rules + validations; per-tenant activation; effective dates.
Localization: Multi-currency, localized payslips, regional calendars/public holidays, statutory leave variants.
Feature flags:
Strategy: Tenant-scoped flags stored in Postgres + cached in Redis; flags evaluated at API boundary and UI route loaders.
Use cases: Progressive rollout, A/B policy testing, migration toggles, high-risk admin features.
Plugin or extension strategy:
Extension points: Webhooks (event subscriptions), workflow actions, export adapters, provisioning connectors, payroll rule extensions.
Safety: Signed webhook delivery, replay protection, per-tenant rate limits, schema versioning for event payloads.
Migration path: If needed, split domains into services by moving module boundary + outbox topics unchanged (API gateway maintains /api/v1).