# Staffora Module Catalog

Complete reference for all **120 backend modules** in the Staffora HRIS platform. Each module lives in `packages/api/src/modules/{name}/` and follows the standard 5-file architecture (schemas, repository, service, routes, index). All routes are mounted under `/api/v1` in `packages/api/src/app.ts`.

*Last updated: 2026-03-28*

---

## Summary

| Section | Modules | Total Endpoints |
|---------|---------|-----------------|
| [Core HR Modules](#core-hr-modules) | 16 | 316 |
| [UK Compliance Modules](#uk-compliance-modules) | 26 | 192 |
| [GDPR & Data Privacy](#gdpr--data-privacy) | 9 | 83 |
| [Payroll & Finance](#payroll--finance) | 11 | 125 |
| [Talent & Learning](#talent--learning) | 11 | 108 |
| [Recruitment & Onboarding](#recruitment--onboarding) | 8 | 78 |
| [Employee Self-Service](#employee-self-service) | 7 | 45 |
| [Document Management](#document-management) | 6 | 42 |
| [Time & Scheduling](#time--scheduling) | 9 | 86 |
| [Operations & Admin](#operations--admin) | 26 | 177 |
| **Total** | **120** (8 shared across sections) | **~900+** |

> Note: Some modules appear in multiple sections where they span functional areas (e.g., talent appears in both Core HR and Talent & Learning). Endpoint counts include all sub-route files within a module. Modules marked "Partial" lack one or more of the standard 5 files (typically routes.ts or index.ts) and expose functionality through parent modules or are works-in-progress.

---

## Core HR Modules

The primary HR feature modules that form the backbone of the platform.

| Module | Prefix | Endpoints | Description | Key Entities | Pattern |
|--------|--------|-----------|-------------|--------------|---------|
| hr | `/hr` | 39 | Employee management, org structure, positions, compensation, NI categories | Employees, org units, positions, org chart | Full 5-file + sub-services |
| time | `/time` | 34 | Time tracking, schedules, timesheets, clock events with geofence validation | Clock events, schedules, shifts, timesheets | Full 5-file + overtime-request-routes |
| absence | `/absence` | 17 | Leave management, policies, balances, Bradford Factor calculation | Leave types, policies, requests, balances | Full 5-file |
| talent | `/talent` | 16 | Performance management, goals, review cycles, calibration | Goals, review cycles, reviews, competencies | Full 5-file |
| lms | `/lms` | 23 | Learning management with mandatory training rules and compliance reporting | Courses, enrollments, learning paths, certificates | Full 5-file + mandatory-training sub-routes |
| cases | `/cases` | 24 | Case/ticket management with SLA tracking, disciplinary procedures, hearings | Cases, comments, appeals, escalations, disciplinaries | Full 5-file + disciplinary sub-routes |
| onboarding | `/onboarding` | 15 | Employee onboarding workflows with templates, checklists, document collection | Templates, checklists, tasks, document requirements | Full 5-file |
| benefits | `/benefits` | 36 | Benefits administration: plans, carriers, enrollments, life events, flex funds | Plans, categories, enrollments, carriers, flex funds | Full 5-file + 5 sub-route files |
| documents | `/documents` | 14 | Document management with S3 storage, versioning, expiry monitoring | Documents, categories, templates, versions | Full 5-file |
| succession | `/succession` | 13 | Succession planning for critical roles with readiness assessments | Plans, candidates, readiness levels, dev actions | Full 5-file |
| analytics | `/analytics` | 19 | HR analytics, dashboards, KPIs, recruitment analytics | Metrics, reports, KPIs, trend data | Full 5-file + recruitment-analytics sub-routes |
| competencies | `/competencies` | 17 | Competency framework management, assessments, gap analysis | Frameworks, competencies, levels, assessments | Full 5-file |
| recruitment | `/recruitment` | 20 | Applicant tracking, hiring pipelines, vacancy management | Vacancies, applications, interviews, offers | Full 5-file |
| workflows | `/workflows` | 15 | Configurable approval workflow engine with condition evaluation | Workflow definitions, instances, steps, conditions | Full 5-file + condition-evaluator |
| portal | `/portal` | 9 | Employee self-service aggregation layer | Dashboard, quick actions, profile | Full 5-file |
| dashboard | `/dashboard` | 3 | Admin dashboard data and statistics | Admin stats, widget data | Full 5-file |

---

## UK Compliance Modules

Modules implementing UK-specific employment legislation and regulatory requirements.

| Module | Prefix | Endpoints | Description | Key Entities | Pattern |
|--------|--------|-----------|-------------|--------------|---------|
| right-to-work | `/right-to-work` | 12 | UK right-to-work verification and document tracking | RTW checks, documents, share codes | Full 5-file |
| ssp | `/ssp` | 7 | Statutory Sick Pay calculation and management | SSP records, qualifying days, PIW | Full 5-file |
| statutory-leave | `/statutory-leave` | 13 | Statutory leave entitlements (annual leave calculations) | Leave entitlements, calculations | Full 5-file |
| family-leave | `/family-leave` | 10 | Maternity, paternity, adoption, shared parental leave | Leave requests, eligibility, pay calculations | Full 5-file |
| parental-leave | `/parental-leave` | 8 | Extended parental leave entitlements | Leave requests, entitlement tracking | Full 5-file |
| bereavement | `/bereavement` | 7 | Bereavement leave management (Jack's Law compliance) | Leave requests, relationship types | Full 5-file |
| carers-leave | `/carers-leave` | 8 | Carers leave (Carer's Leave Act 2023) | Leave requests, entitlement balance | Full 5-file |
| flexible-working | `/flexible-working` | 14 | Flexible working requests (Employment Relations Act) | Requests, decisions, appeal workflow | Full 5-file |
| pension | `/pension` | 10 | Auto-enrolment pension management (Pensions Act 2008) | Schemes, enrolments, contributions, opt-outs | Full 5-file |
| warnings | `/warnings` | 8 | Disciplinary warnings and procedures (ACAS code) | Warnings, expiry tracking, escalation | Full 5-file |
| wtr | `/wtr` | 7 | Working Time Regulations 1998 compliance | Working time records, opt-outs, rest breaks | Full 5-file |
| health-safety | `/health-safety` | 16 | H&S incident reporting, risk assessments, RIDDOR | Incidents, risk assessments, hazards | Full 5-file |
| gender-pay-gap | `/gender-pay-gap` | 6 | Gender pay gap reporting (Equality Act 2010) | Reports, calculations, quartile data | Full 5-file |
| bank-holidays | `/bank-holidays` | 6 | UK bank holiday calendar management | Holiday calendars, regional variations | Full 5-file |
| nmw | `/nmw` | 5 | National Minimum/Living Wage tracking and compliance | Rate checks, compliance records | Full 5-file |
| probation | `/probation` | 7 | Probation period management and reviews | Probation records, reviews, extensions | Full 5-file |
| return-to-work | `/return-to-work` | 7 | Return-to-work interviews after absence | RTW interviews, outcomes, adjustments | Full 5-file |
| contract-amendments | `/contract-amendments` | 5 | Employment contract change tracking | Amendments, version history | Full 5-file |
| contract-statements | `/contract-statements` | 6 | Written statements of employment (s.1 ERA 1996) | Statements, employment particulars | Full 5-file |
| dbs-checks | `/dbs-checks` | 6 | Disclosure and Barring Service checks | DBS applications, results, renewals | Full 5-file |
| ir35 | N/A | 0 | IR35 off-payroll compliance assessments (April 2021 rules) | Assessments, SDS, disputes | Partial (no routes.ts) |
| tupe | `/tupe/transfers` | 10 | TUPE transfer management (Transfer of Undertakings) | Transfers, affected employees, consultations | Full 5-file |
| tribunal | `/tribunal` | 8 | Employment Tribunal case preparation and document bundling | Tribunal cases, document bundles | Full 5-file |
| suspensions | N/A | 0 | Employee suspension management (with/without pay) | Suspensions, reviews, outcomes | Partial (no routes.ts) |
| secondments | `/secondments` | 5 | Employee secondment tracking | Secondments, host organisations | Full 5-file |
| reasonable-adjustments | `/reasonable-adjustments` | 8 | Disability reasonable adjustments (Equality Act 2010) | Adjustments, review dates, costs | Full 5-file |

---

## GDPR & Data Privacy

Modules implementing UK GDPR and Data Protection Act 2018 requirements.

| Module | Prefix | Endpoints | Description | Key Entities | Pattern |
|--------|--------|-----------|-------------|--------------|---------|
| dsar | `/dsar` | 12 | Data Subject Access Requests (Article 15, 30-day deadline) | DSAR requests, data packages, redactions | Full 5-file |
| data-erasure | `/data-erasure` | 11 | Right to be forgotten (Article 17) | Erasure requests, execution logs | Full 5-file |
| data-breach | `/data-breach` | 10 | Breach notification (72hr ICO deadline, Article 33) | Breach reports, notifications, risk assessments | Full 5-file |
| consent | `/consent` | 11 | Consent management (Article 7) | Consent types, records, withdrawal logs | Full 5-file |
| privacy-notices | `/privacy-notices` | 7 | Privacy notice management (Articles 13-14) | Notices, versions, acknowledgements | Full 5-file |
| data-retention | `/data-retention` | 11 | Retention schedules and automated purge | Retention policies, schedules, purge logs | Full 5-file |
| ropa | N/A | 0 | Records of Processing Activities (Article 30) | Processing activities, lawful bases, transfers | Partial (no routes.ts) |
| dpia | `/dpia` | 8 | Data Protection Impact Assessments (Article 35) | DPIAs, risks, DPO reviews | Full 5-file |
| data-archival | `/data-archival` | 16 | Data archiving and restoration for completed records | Archive policies, archived records, restore logs | Full 5-file |

---

## Payroll & Finance

Modules for payroll processing, tax, compensation, and financial administration.

| Module | Prefix | Endpoints | Description | Key Entities | Pattern |
|--------|--------|-----------|-------------|--------------|---------|
| payroll | `/payroll` | 46 | Payroll run processing, P45/P60, period locks, submissions | Pay runs, pay items, P45s, P60s, submissions | Full 5-file + 4 sub-route files |
| payroll-config | `/payroll-config` | 16 | Payroll settings, pay elements, and configuration | Pay elements, tax config, NI categories | Full 5-file |
| payslips | `/payslips` | 8 | Payslip generation and distribution | Payslips, pay components, distribution records | Full 5-file |
| deductions | `/deductions` | 8 | Payroll deduction rules and management | Deduction types, employee deductions | Full 5-file |
| tax-codes | `/tax-codes` | 5 | HMRC tax code management | Tax codes, effective dates | Full 5-file |
| salary-sacrifice | `/salary-sacrifices` | 6 | Salary sacrifice arrangements with NMW compliance | Sacrifice arrangements, NMW checks | Full 5-file |
| income-protection | `/income-protection` | 8 | Income protection policy and enrolment management | Policies, enrolments, coverage levels | Full 5-file |
| beneficiary-nominations | `/employees/:eid/beneficiary-nominations` | 6 | Beneficiary nomination management for benefits | Nominations, percentage allocations | Full 5-file |
| total-reward | `/total-reward` | 3 | Total reward statement generation (complete compensation view) | Statements, compensation components, PDFs | Full 5-file |
| benefits-exchange | `/benefits-exchange` | 4 | Benefits provider data exchange (inbound/outbound files) | Exchange files, exchange history | Full 5-file |
| cost-centre-assignments | `/cost-centre-assignments` | 5 | Cost centre assignment tracking with effective dating | Assignments, cost centres, entity history | Full 5-file |

---

## Talent & Learning

Modules for performance management, professional development, and learning.

| Module | Prefix | Endpoints | Description | Key Entities | Pattern |
|--------|--------|-----------|-------------|--------------|---------|
| talent | `/talent` | 16 | Performance management, goals, review cycles, calibration | Goals, review cycles, reviews | Full 5-file |
| talent-pools | `/talent-pools` | 9 | Talent pool management for high-potential employees | Pools, pool members, criteria | Full 5-file |
| feedback-360 | `/feedback-360` | 9 | 360-degree feedback cycles and multi-rater responses | Cycles, nominations, responses, reports | Full 5-file |
| one-on-ones | N/A | 0 | One-on-one meeting management between managers and reports | Meetings, agendas, action items | Partial (no routes.ts) |
| recognition | `/recognition` | 3 | Peer-to-peer recognition and kudos | Recognition awards, categories | Partial (no index.ts) |
| competencies | `/competencies` | 17 | Competency framework management and gap analysis | Frameworks, competencies, levels, assessments | Full 5-file |
| assessments | `/assessments` | 9 | Skill and knowledge assessments | Assessments, questions, results | Full 5-file |
| cpd | `/cpd` | 6 | Continuing professional development records | CPD records, evidence, hours tracking | Full 5-file |
| course-ratings | `/course-ratings` | 3 | LMS course feedback and ratings | Ratings, reviews, averages | Full 5-file |
| training-budgets | `/training-budgets` | 8 | Training budget allocation and tracking | Budgets, allocations, spend records | Full 5-file |
| lms | `/lms` | 23 | Learning management with mandatory training and compliance | Courses, enrollments, learning paths, certificates | Full 5-file + mandatory-training sub-routes |

---

## Recruitment & Onboarding

Modules for the complete hiring pipeline from job boards to day-one onboarding.

| Module | Prefix | Endpoints | Description | Key Entities | Pattern |
|--------|--------|-----------|-------------|--------------|---------|
| recruitment | `/recruitment` | 20 | Applicant tracking, vacancy management, interview scheduling | Vacancies, applications, interviews, pipelines | Full 5-file |
| job-boards | `/job-boards` | 11 | Job board integration management and vacancy publishing | Integrations, postings, sync status | Full 5-file |
| offer-letters | `/recruitment/offers` | 7 | Offer letter creation, sending, and acceptance tracking | Offer letters, templates, candidate responses | Full 5-file |
| reference-checks | `/reference-checks` | 6 | Employment reference request and collection | Reference requests, responses, verification | Full 5-file |
| background-checks | `/background-checks` | 5 | Background check provider integration with webhook callbacks | Check requests, provider results, webhooks | Full 5-file |
| onboarding | `/onboarding` | 15 | Employee onboarding workflows with templates and checklists | Templates, checklists, tasks, instances | Full 5-file |
| agencies | `/agencies` | 8 | Recruitment agency management and fee tracking | Agencies, contacts, terms, fee agreements | Full 5-file |
| agency-workers | N/A | 0 | Agency Worker Regulations (AWR) 2010 compliance tracking | Assignments, qualifying periods, parity checks | Partial (no routes.ts) |

---

## Employee Self-Service

Modules enabling employees to manage their own data and submit requests.

| Module | Prefix | Endpoints | Description | Key Entities | Pattern |
|--------|--------|-----------|-------------|--------------|---------|
| portal | `/portal` | 9 | Employee self-service aggregation layer | Dashboard, quick actions, profile | Full 5-file |
| employee-change-requests | `/portal/change-requests`, `/hr/change-requests` | 9 | Employee-initiated data change requests with HR approval | Change requests, approval workflow | Full 5-file |
| personal-detail-changes | `/portal/personal-detail-changes`, `/hr/personal-detail-changes` | 8 | Personal detail update requests (address, name, etc.) | Change requests, HR review queue | Full 5-file |
| emergency-contacts | `/employees/:eid/emergency-contacts` | 4 | Emergency contact information (sub-resource) | Emergency contacts | Full 5-file |
| employee-photos | `/employees/:eid/photos` | 4 | Employee photo management (sub-resource) | Photos, thumbnails | Full 5-file |
| bank-details | `/employees/:eid/bank-details` | 5 | Employee bank account details (sub-resource) | Bank accounts, sort codes | Full 5-file |
| equipment | `/equipment` | 9 | IT equipment and asset tracking | Equipment items, assignments, returns | Full 5-file |

---

## Document Management

Modules for document creation, distribution, signing, and compliance tracking.

| Module | Prefix | Endpoints | Description | Key Entities | Pattern |
|--------|--------|-----------|-------------|--------------|---------|
| documents | `/documents` | 14 | Document management with S3 storage, categorisation, expiry | Documents, categories, templates, versions | Full 5-file |
| letter-templates | `/letter-templates` | 7 | HR letter and document template generation | Templates, merge fields, generated letters | Full 5-file |
| bulk-document-generation | `/documents` | 2 | Bulk document generation from templates (batch jobs) | Batch jobs, generated documents | Full 5-file |
| e-signatures | `/e-signatures` | 11 | Electronic signature request management and tracking | Signature requests, events, audit trail | Full 5-file |
| policy-distribution | `/policy-distributions` | 4 | Policy document distribution and read receipt tracking | Distributions, acknowledgements | Full 5-file |
| contract-statements | `/contract-statements` | 6 | Written statements of employment (s.1 ERA 1996) | Statements, employment particulars | Full 5-file |

---

## Time & Scheduling

Modules for time tracking, shift management, overtime, and location-based controls.

| Module | Prefix | Endpoints | Description | Key Entities | Pattern |
|--------|--------|-----------|-------------|--------------|---------|
| time | `/time` | 34 | Time tracking, schedules, timesheets, clock events | Clock events, schedules, shifts, timesheets | Full 5-file + overtime-request-routes |
| shift-swaps | `/shift-swaps` | 8 | Two-phase shift swap approval workflow (employee + manager) | Swap requests, approvals | Full 5-file |
| overtime | N/A | 0 | Overtime data schemas (consumed by overtime-rules/requests) | Overtime records | Partial (schemas + repository only) |
| overtime-requests | `/overtime-requests` | 7 | Overtime authorisation workflow with manager approval | Overtime requests, approvals | Full 5-file |
| overtime-rules | `/overtime-rules` | 10 | Overtime rule configuration and calculation engine | Rules, rate tiers, calculations | Full 5-file |
| toil | `/toil` | 8 | Time Off In Lieu balance management and accrual/usage | Balances, accruals, usage transactions | Full 5-file |
| geofence | `/geofences` | 10 | Location-based clock-in restrictions and zone management | Geofence zones, boundary checks | Full 5-file |
| calendar-sync | `/calendar` | 5 | Calendar connection management and iCal feed serving | Connections, iCal tokens, feeds | Full 5-file |
| sickness-analytics | `/analytics/sickness` | 5 | Sickness absence trend analysis and Bradford Factor metrics | Trend data, department rates, seasonal averages | Full 5-file |

---

## Operations & Admin

Modules for system administration, configuration, integrations, and platform management.

| Module | Prefix | Endpoints | Description | Key Entities | Pattern |
|--------|--------|-----------|-------------|--------------|---------|
| system | `/system` | 2 | System configuration and health checks | Config, health status | Partial (no repository.ts) |
| tenant | `/tenant` | 3 | Tenant configuration and settings | Tenant settings, branding | Partial (no schemas.ts) |
| tenant-provisioning | `/admin/tenants` | 3 | Automated tenant provisioning for new organisations | Tenant records, provisioning status | Full 5-file |
| feature-flags | `/admin/feature-flags`, `/feature-flags` | 6 | Feature flag management and evaluation | Flags, rules, user evaluations | Partial (no repository.ts) |
| notifications | `/notifications` | 15 | Notification preferences, delivery, push tokens, Web Push | Notifications, push tokens, subscriptions | Full 5-file |
| email-tracking | `/email-tracking` | 4 | Email delivery monitoring and bounce tracking | Delivery logs, bounce events, statistics | Full 5-file |
| data-import | `/data-import` | 6 | Structured CSV data import with validation and execution | Import jobs, validation results, row errors | Full 5-file |
| bulk-operations | `/bulk` | 4 | Bulk employee creates, updates, and leave approvals | Batch results, per-item status | Full 5-file |
| lookup-values | `/lookup-values` | 12 | Tenant-configurable lookup categories and values | Categories, values, display orders | Full 5-file |
| announcements | `/announcements` | 7 | Company announcements with publish/draft workflow | Announcements, publish status | Partial (no index.ts) |
| webhooks | `/webhooks` | 7 | Outbound webhook subscription management and delivery logs | Subscriptions, deliveries, retry logs | Full 5-file |
| api-keys | `/api-keys` | 6 | API key management for machine-to-machine authentication | API keys, scopes, rotation | Full 5-file |
| sso | `/sso/configs`, `/auth/sso` | 9 | Enterprise SSO (SAML/OIDC) configuration and login | SSO configs, login attempts, providers | Full 5-file |
| usage-stats | `/system` | 1 | Per-tenant usage analytics and statistics | Usage metrics, feature adoption | Full 5-file |
| reports | `/reports` | 31 | Custom report builder, execution, and contract end dates | Report definitions, executions, exports | Full 5-file + contract-end-dates sub-routes |
| delegations | `/delegations` | 5 | Authority delegation management (holiday cover, etc.) | Delegations, delegate assignments | Full 5-file |
| headcount-planning | `/headcount-planning` | 10 | Workforce planning and forecasting | Plans, scenarios, headcount projections | Full 5-file |
| global-mobility | `/global-mobility/assignments` | 6 | International assignment tracking with expiry alerts | Assignments, host countries, transitions | Full 5-file |
| diversity | `/diversity` | 5 | Diversity and equality monitoring (anonymised) | Diversity records, reporting categories | Full 5-file |
| whistleblowing | `/whistleblowing` | 5 | Whistleblowing case management (PIDA 1998 protections) | Reports, investigations, audit trail | Partial (no index.ts) |
| client-portal | `/client-portal` | 26 | Customer-facing portal for tenant management | Tenant config, user management, billing | Full 5-file |
| admin-jobs | N/A | 0 | Background admin job definitions (placeholder module) | N/A | Empty directory |
| security | `/security`, `/fields`, `/manager`, `/portal`, `/rbac` | 64 | Field permissions, portal access, manager hierarchy, RBAC | Permissions, roles, field rules, manager tree | Full 5-file + 5 sub-route files |
| auth | `/auth` | 5 | Authentication via BetterAuth (sessions, MFA, tenant switching) | Sessions, MFA config, backup codes | Partial (no repository.ts) |
| integrations | `/integrations` | 7 | Third-party integration management and connection testing | Integration configs, connection status | Full 5-file |
| jobs | `/jobs` | 5 | Job catalogue and classification management | Job profiles, families, levels | Full 5-file |

---

## Module File Pattern Reference

Every module follows a consistent architecture inside `packages/api/src/modules/{name}/`:

```
modules/{name}/
  schemas.ts      # TypeBox request/response validation schemas
  repository.ts   # Database access layer (postgres.js tagged templates)
  service.ts      # Business logic, validation, state machines
  routes.ts       # Elysia route definitions with auth/RBAC guards
  index.ts        # Module re-exports
```

### Pattern Classification

| Status | Count | Description |
|--------|-------|-------------|
| **Full 5-file** | 101 | All 5 standard files present |
| **Full + sub-routes** | 8 | Standard files plus additional route/service files for sub-domains |
| **Partial (no routes.ts)** | 6 | Service/schema layer only; functionality exposed via parent modules or WIP |
| **Partial (other)** | 4 | Missing index.ts, repository.ts, or schemas.ts |
| **Empty** | 1 | Placeholder directory (admin-jobs) |

### Modules Without routes.ts (Partial)

These modules provide schemas, repositories, and/or services consumed by parent modules:

| Module | Files Present | Consumed By |
|--------|---------------|-------------|
| admin-jobs | (empty) | Worker subsystem |
| agency-workers | repository, schemas, service | agencies module |
| ir35 | repository, schemas, service | recruitment / compliance features |
| one-on-ones | repository, schemas, service | talent module |
| overtime | repository, schemas | overtime-rules, overtime-requests |
| ropa | repository, schemas | GDPR compliance features |
| suspensions | repository, schemas, service | cases / warnings modules |

---

## Cross-Cutting Concerns

All modules automatically receive these capabilities via Elysia plugins registered in `src/app.ts`:

- **Row-Level Security (RLS)**: Every tenant-owned table enforces `tenant_id` isolation via PostgreSQL RLS policies
- **Authentication**: Session validation via BetterAuth, populating `ctx.user`
- **RBAC**: Permission guards via `requirePermission(resource, action)` on each route
- **Idempotency**: `Idempotency-Key` header enforcement on all mutating endpoints
- **Audit Logging**: Automatic mutation recording with actor, action, and before/after snapshots
- **Rate Limiting**: Per-endpoint rate limits via Redis

---

## Related Documentation

- [API Reference](../api/API_REFERENCE.md) -- Full endpoint listing with request/response schemas
- [Error Codes](../api/ERROR_CODES.md) -- Error code reference organised by module
- [Architecture](../architecture/ARCHITECTURE.md) -- System design with Mermaid diagrams
- [Database](../architecture/DATABASE.md) -- Schema, migrations, RLS policy catalog
- [State Machines](../patterns/STATE_MACHINES.md) -- Workflow state diagrams for all 5 state machines
- [Security Patterns](../patterns/SECURITY.md) -- RLS, auth, RBAC, audit, and idempotency details
- [Worker System](../architecture/WORKER_SYSTEM.md) -- Background job processing (outbox, notifications, exports)
- [Permissions System](../architecture/PERMISSIONS_SYSTEM.md) -- Permission model and RBAC details
