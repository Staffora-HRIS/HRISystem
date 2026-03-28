# Agent Catalog

> Last updated: 2026-03-28

This document provides comprehensive documentation for every AI development agent in the Staffora platform. Each agent is defined as a Markdown file in `.claude/agents/` and is designed for use with Claude Code.

---

## Table of Contents

- [Agent Summary Table](#agent-summary-table)
- [Platform Architect](#platform-architect)
- [Core HR Developer](#core-hr-developer)
- [Frontend Architect](#frontend-architect)
- [Absence Module Builder](#absence-module-builder)
- [Time and Attendance Developer](#time-and-attendance-developer)
- [Cases Module Developer](#cases-module-developer)
- [LMS Module Developer](#lms-module-developer)
- [Talent Module Developer](#talent-module-developer)
- [Onboarding Module Developer](#onboarding-module-developer)
- [Security Module Developer](#security-module-developer)
- [Agent Selection Guide](#agent-selection-guide)
- [Shared Properties](#shared-properties)

---

## Agent Summary Table

| Agent | Definition File | Domain | Model | Swarm |
|-------|----------------|--------|-------|-------|
| Platform Architect | `hris-platform-architect.md` | Infrastructure, Docker, PostgreSQL, RLS, Redis, Auth, RBAC, Audit | opus | Yes |
| Core HR Developer | `hris-core-hr-developer.md` | Employees, org structure, contracts, positions, compensation, effective dating | opus | Yes |
| Frontend Architect | `hris-frontend-architect.md` | React 18, React Router v7, React Query, Tailwind CSS, UI components | opus | Yes |
| Absence Module Builder | `hris-absence-module-builder.md` | Leave types, policies, balances, requests, accruals, ledger patterns | opus | Yes |
| Time and Attendance Developer | `time-attendance-module-developer.md` | Time events, schedules, shifts, timesheets, geo-fence validation | opus | Yes |
| Cases Module Developer | `cases-module-developer.md` | Case management, SLA tracking, escalation, PDF bundles | opus | Yes |
| LMS Module Developer | `lms-module-developer.md` | Courses, enrollments, learning paths, certificates, compliance training | opus | Yes |
| Talent Module Developer | `talent-module-developer.md` | Performance cycles, goals/OKRs, competencies, 360 feedback, calibration | opus | Yes |
| Onboarding Module Developer | `onboarding-module-developer.md` | Templates, checklists, task tracking, document collection, buddy assignment | opus | Yes |
| Security Module Developer | `security-module-developer.md` | Field-level permissions, portal access, manager hierarchy, audit logging | opus | Yes |

---

## Platform Architect

**File:** `.claude/agents/hris-platform-architect.md`
**Internal name:** `staffora-platform-architect`

### Purpose

The Platform Architect agent builds and maintains the foundational infrastructure of the Staffora platform. It is the agent to use for anything that sits below the module layer: Docker containers, database migrations, RLS policies, Elysia.js plugins, Redis configuration, BetterAuth integration, RBAC systems, audit logging, and background worker processes.

### When to Use

- Creating or modifying Docker Compose services
- Writing PostgreSQL migrations with RLS policies
- Building or extending Elysia.js plugins (db, cache, auth, tenant, rbac, audit, errors, idempotency, rate-limit, security-headers)
- Setting up BetterAuth configuration
- Implementing RBAC permission systems
- Configuring audit logging infrastructure
- Setting up the background worker subsystem
- Creating any new tenant-owned database table

### Key Domain Knowledge

- **Multi-tenant data isolation**: Every tenant-owned table must have `tenant_id`, RLS enabled, and isolation policies
- **Database conventions**: UUID primary keys, `created_at`/`updated_at` timestamps, JSONB with proper indexing, partitioning for high-volume tables
- **Migration ordering**: Extensions, then core tables (tenants), auth tables (users), junction tables, RBAC tables, audit tables, infrastructure tables
- **Plugin architecture**: Plugins must be composable, properly typed, handle cleanup/disconnection, and follow the strict registration order defined in `app.ts`
- **Security requirements**: All secrets from environment variables, HttpOnly/Secure/SameSite=Strict cookies, CSRF protection, idempotency key expiry, append-only audit log, MFA support
- **Redis patterns**: Sessions (`session:{sessionId}`), permission cache (`perms:{userId}:{tenantId}` with 15-minute TTL), job queues via Redis Streams
- **Outbox pattern**: Domain events written to `domain_outbox` table, processed by worker, at-least-once delivery

### Example Use Cases

1. "Create the database migration for a new equipment tracking table with RLS"
2. "Add a new Elysia plugin for file upload handling"
3. "Set up Redis Streams consumer group for notification processing"
4. "Implement IP allowlisting middleware"
5. "Add a new scheduled background job for stale session cleanup"

---

## Core HR Developer

**File:** `.claude/agents/hris-core-hr-developer.md`
**Internal name:** `staffora-core-hr-developer`

### Purpose

The Core HR Developer agent implements the system of record for all employee data. This is the anchor module that other modules depend on: employee lifecycle, organizational structure, positions, contracts, compensation history, and reporting lines.

### When to Use

- Creating or modifying employee-related database tables
- Implementing employee lifecycle state machine transitions (pending, active, on_leave, terminated)
- Building effective-dated record management (positions, compensation, contracts, reporting lines)
- Implementing org structure hierarchy queries
- Building position assignment and transfer workflows
- Writing TypeBox validation schemas for HR data

### Key Domain Knowledge

- **Employee state machine**: `pending -> active -> on_leave <-> active -> terminated` (terminated is terminal; rehires create new records)
- **Effective dating**: All temporal HR data uses `effective_from`/`effective_to` with overlap prevention under transactions
- **12 core tables**: employees, employee_personal, employee_contacts, employee_addresses, employee_identifiers, org_units, positions, cost_centers, employment_contracts, position_assignments, reporting_lines, compensation_history
- **Outbox events**: `hr.employee.created`, `hr.employee.updated`, `hr.employee.transferred`, `hr.employee.promoted`, `hr.employee.terminated`
- **Business rules**: Only one primary position active at a time, termination date must be >= hire date, future-dated changes invalid after termination

### Example Use Cases

1. "Create the migration for employee addresses with effective dating"
2. "Implement the employee hire flow with state machine enforcement and outbox events"
3. "Build the org unit hierarchy query with depth tracking"
4. "Add a compensation history endpoint with effective-date overlap validation"
5. "Implement the employee transfer workflow between departments"

---

## Frontend Architect

**File:** `.claude/agents/hris-frontend-architect.md`
**Internal name:** `staffora-frontend-architect`

### Purpose

The Frontend Architect agent builds the React user interface for the Staffora platform. It creates production-ready components, pages, hooks, and utilities that integrate with the backend API. The agent covers all three portal experiences: employee self-service, manager portal, and admin console.

### When to Use

- Creating React Router v7 route pages
- Building reusable UI components (DataTable, ApprovalCard, EffectiveDatePicker)
- Implementing React Query hooks for API integration
- Adding permission-based access control to routes and UI elements
- Building form workflows with validation
- Creating dashboard layouts and data visualisation pages

### Key Domain Knowledge

- **Tech stack**: React 18, React Router v7 (framework mode with loaders/actions), React Query, Tailwind CSS, Lucide icons
- **Route groups**: `(auth)/` for login/registration, `(app)/` for employee/manager portals, `(admin)/` for HR admin console
- **API client pattern**: All mutations include `Idempotency-Key` header via `api.mutate()`
- **State management hierarchy**: Server state (React Query) > Form state (React Hook Form) > UI state (local state/URL params) > Global state (Context for auth/permissions only)
- **Permission checking**: `usePermissions()` hook with `can()` and `canAny()` helpers; route loaders validate permissions before rendering
- **Portal-specific UX**: Employee portal uses change requests (not direct updates), manager portal has unified approvals inbox, admin console has full lifecycle management

### Example Use Cases

1. "Create the employee list page with filtering and cursor-based pagination"
2. "Build the leave request form with team calendar visibility"
3. "Implement the manager approvals inbox aggregating all pending items"
4. "Add permission-based conditional rendering to the admin navigation"
5. "Create a React Query hook for fetching leave balances"

---

## Absence Module Builder

**File:** `.claude/agents/hris-absence-module-builder.md`
**Internal name:** `staffora-absence-module-builder`

### Purpose

The Absence Module Builder agent implements leave management: leave types, policies, balance tracking, leave requests, public holidays, accrual processing, and year-end carryover. The agent specialises in the ledger-based balance tracking pattern, which is central to the absence module's architecture.

### When to Use

- Creating absence-related database migrations
- Implementing leave balance calculations using the ledger pattern
- Building leave request submission, approval, and cancellation workflows
- Implementing accrual processing for leave entitlements
- Building year-end carryover logic
- Adding public holiday management

### Key Domain Knowledge

- **Ledger-based balance pattern (non-negotiable)**: All balance changes flow through `leave_balance_ledger` table; `leave_balances` is a derived view; ledger is append-only
- **Database tables**: leave_types, leave_policies, leave_balances, leave_balance_ledger, leave_requests, leave_request_approvals, public_holidays
- **Leave request state machine**: `draft -> pending -> approved/rejected`, or `cancelled`
- **Domain invariants**: Requests cannot exceed available balance, approved/rejected requests are immutable, no overlapping leave requests, policy compliance (max consecutive days, eligibility, blackout periods)
- **Outbox events**: `absence.request.created`, `absence.request.approved`, `absence.request.cancelled`
- **Key service methods**: `calculateBalance()`, `submitLeaveRequest()`, `approveLeaveRequest()`, `cancelLeaveRequest()`, `runAccruals()`, `processCarryover()`

### Example Use Cases

1. "Implement the leave balance calculation that reads from the ledger"
2. "Build the leave request approval workflow with manager permissions"
3. "Create the accrual processing job for monthly leave entitlements"
4. "Implement year-end carryover with forfeiture rules"
5. "Add working day calculation that excludes weekends and public holidays"

---

## Time and Attendance Developer

**File:** `.claude/agents/time-attendance-module-developer.md`
**Internal name:** `time-attendance-module-developer`

### Purpose

The Time and Attendance Developer agent implements workforce time tracking: clock in/out events, break tracking, schedule management, shift definitions, timesheet generation, approval workflows, and geo-fence validation for location-based clocking.

### When to Use

- Creating time and attendance database migrations
- Implementing time event recording with monotonic sequence enforcement
- Building schedule and shift management
- Implementing timesheet generation and approval workflows
- Adding geo-fence validation using Haversine distance calculations
- Building clock in/out functionality with device integration

### Key Domain Knowledge

- **Time event monotonicity**: Events must follow logical sequence per employee session (`clock_in -> break_start -> break_end -> clock_out`)
- **Enum types**: `time_event_type` (clock_in, clock_out, break_start, break_end), `time_event_source` (device, web, mobile, manual), `timesheet_status` (draft, submitted, approved, rejected)
- **Immutable approvals**: Timesheet approvals are append-only; never UPDATE approval records
- **Approved timesheet lock**: Once approved, timesheet lines cannot be modified
- **Geo-fence enforcement**: Haversine formula for distance calculation; reject events outside configured radius
- **Outbox events**: `time.event.recorded`, `time.schedule.published`, `time.timesheet.submitted`, `time.timesheet.approved`, `time.timesheet.rejected`
- **Integration points**: Absence module (availability overlay on schedules), workflows module (timesheet approvals)

### Example Use Cases

1. "Implement the clock in/out flow with last-event validation"
2. "Build the geo-fence validation for time clock devices"
3. "Create the timesheet auto-generation from time events"
4. "Implement the timesheet approval workflow with manager permissions"
5. "Build the schedule assignment system with conflict detection"

---

## Cases Module Developer

**File:** `.claude/agents/cases-module-developer.md`
**Internal name:** `cases-module-developer`

### Purpose

The Cases Module Developer agent implements the HR case management system: employee inquiries, complaints, service requests, SLA tracking, escalation workflows, case comments, and PDF bundle generation. It manages the most complex state machine in the system, with escalation and reopening paths.

### When to Use

- Implementing case status transitions with the full state machine
- Building SLA configuration and breach detection
- Implementing case assignment and escalation workflows
- Adding case comments with internal/external visibility controls
- Generating case bundle PDFs via the pdf-worker
- Building case analytics and reporting

### Key Domain Knowledge

- **Case state machine**: `open -> in_progress -> resolved -> closed` with escalation (`in_progress -> escalated`), de-escalation (`escalated -> in_progress`), reopening (`resolved -> reopened -> in_progress`), and cancellation paths
- **Terminal states**: `closed` and `cancelled` (no transitions out)
- **Database tables**: cases, case_comments, case_attachments, case_categories, case_sla_configs
- **SLA tracking**: First response SLA (time to first agent comment), resolution SLA (time to resolved status), both configurable per priority level, with business hours option
- **Domain invariants**: Assignment required before `in_progress`, resolution text required before `resolved`, reopen window enforcement, internal comments visible only to HR agents, case_number unique per tenant
- **Priority levels**: low, medium, high, urgent (determines SLA thresholds)
- **Outbox events**: `cases.case.created`, `cases.case.assigned`, `cases.case.escalated`, `cases.case.resolved`, `cases.case.closed`, `cases.case.reopened`, `cases.case.sla_breached`, `cases.case.comment_added`

### Example Use Cases

1. "Implement the case escalation workflow with automatic reassignment"
2. "Build SLA breach detection as a scheduled background job"
3. "Add internal comment visibility filtering for the employee portal"
4. "Implement case reopen logic with configurable reopen window"
5. "Create the case bundle PDF generation via the pdf-worker"

---

## LMS Module Developer

**File:** `.claude/agents/lms-module-developer.md`
**Internal name:** `lms-module-developer`

### Purpose

The LMS Module Developer agent implements the corporate learning management system: course definitions, employee enrollments, learning paths, course completions, certificate generation, compliance training tracking, and skill assessments.

### When to Use

- Creating LMS database migrations
- Implementing course enrollment with prerequisite checks
- Building learning path management with ordered course sequences
- Implementing course completion with pass/fail scoring
- Generating certificates via the pdf-worker
- Building compliance training tracking with expiration and renewal
- Implementing bulk enrollment operations

### Key Domain Knowledge

- **Enrollment status flow**: `enrolled -> in_progress -> completed` (if score >= passing_score), with `failed` (below passing score), `expired` (past due date), and `cancelled` paths; failed/expired/cancelled can re-enroll
- **Course status flow**: `draft -> published -> archived` (only published courses accept enrollments)
- **Database tables**: courses, course_versions, learning_paths, learning_path_courses, course_enrollments (assignments), course_completions, certificates
- **Domain invariants**: No duplicate active enrollments per employee per course, published-only enrollment, passing score enforcement, certificate uniqueness per tenant, progress percentage is monotonic (0-100, never decreases), compliance course certificates have `expires_at`
- **Certificate generation**: Completion triggers certificate record creation in the same transaction; pdf-worker generates the PDF asynchronously via outbox event
- **Scheduled jobs**: Enrollment expiry checker, certificate expiry warning, compliance report generation
- **Outbox events**: `lms.course.created`, `lms.course.published`, `lms.course.enrolled`, `lms.course.completed`, `lms.course.failed`, `lms.certificate.issued`, `lms.certificate.expiring`, `lms.learning_path.completed`

### Example Use Cases

1. "Build the course enrollment flow with prerequisite validation"
2. "Implement certificate generation when an employee completes a required course"
3. "Create the learning path system with sequential course ordering"
4. "Build compliance training tracking with expiration and renewal reminders"
5. "Implement bulk enrollment for mandatory training rollouts"

---

## Talent Module Developer

**File:** `.claude/agents/talent-module-developer.md`
**Internal name:** `talent-module-developer`

### Purpose

The Talent Module Developer agent implements performance management: review cycles, goals/OKRs, competency assessments, 360 feedback, calibration sessions, and development plans. It manages the performance cycle state machine and ensures the integrity of the review process.

### When to Use

- Implementing performance review cycle lifecycle
- Building goal management with cascading hierarchies
- Implementing 360 feedback collection with anonymity controls
- Building calibration sessions with rating adjustment audit trails
- Creating competency framework management
- Building development plan tracking

### Key Domain Knowledge

- **Performance cycle state machine**: `draft -> active -> review -> calibration -> completed` (each transition has prerequisite conditions)
- **Review status flow**: `draft -> self_review -> manager_review -> calibration -> completed`
- **Goal status flow**: `draft -> active -> completed` (or `cancelled`)
- **Database tables**: review_cycles, goals, reviews, feedback_items, development_plans, competencies
- **Domain invariants**: Only one active review cycle per tenant, self-review must precede manager review (or deadline must pass), ratings range 1-5, goal weights should sum to 100 (soft warning), calibration locks are permanent once review reaches `completed`, 360 feedback anonymity (source_employee_id never exposed to target), deadline enforcement (configurable: warn vs. block)
- **Calibration pattern**: Original manager rating preserved, calibrated rating stored separately, every adjustment requires justification, final rating = calibrated or manager (if no adjustment), locking after calibration completion
- **Outbox events**: `talent.cycle.activated`, `talent.review.self_submitted`, `talent.review.manager_submitted`, `talent.review.calibrated`, `talent.review.finalized`, `talent.goal.created`, `talent.goal.completed`, `talent.feedback.requested`, `talent.feedback.submitted`

### Example Use Cases

1. "Implement the performance cycle state machine with all phase transitions"
2. "Build the calibration session with rating adjustment and justification tracking"
3. "Create the goal cascading system with parent-child relationships"
4. "Implement multi-rater 360 feedback with anonymity controls"
5. "Build the development plan tracking system linked to competency gaps"

---

## Onboarding Module Developer

**File:** `.claude/agents/onboarding-module-developer.md`
**Internal name:** `onboarding-module-developer`

### Purpose

The Onboarding Module Developer agent implements the new hire onboarding experience: reusable templates with task checklists, employee-specific onboarding instances, task dependency management, progress tracking, buddy assignment, and cross-module integration with Core HR events.

### When to Use

- Creating onboarding database migrations
- Implementing onboarding template management with department/position targeting
- Building the task completion workflow with dependency checking
- Implementing automatic onboarding creation from `hr.employee.created` events
- Building the buddy assignment system
- Creating progress calculation and overdue task detection

### Key Domain Knowledge

- **Onboarding instance status flow**: `not_started -> in_progress -> completed` (or `cancelled`)
- **Task status flow**: `pending -> in_progress -> completed` (or `skipped` with reason, or `blocked` by dependency)
- **Task assignee types**: employee, manager, hr, it, buddy, system
- **Task categories**: paperwork, training, equipment, access, introduction, compliance, other
- **Database tables**: onboarding_checklists (templates), onboarding_template_tasks, onboarding_instances, onboarding_task_completions
- **Domain invariants**: Template matching uses most-specific rule (department+position > department only > default), task dependencies must be satisfied before completion, required tasks must all be completed before instance completion, skip requires reason, single active instance per employee, buddy cannot be self, progress = (completed + skipped) / total * 100
- **Cross-module integration**: Consumes `hr.employee.created` to auto-create instances, consumes `hr.employee.terminated` to cancel active instances; emits `onboarding.instance.created`, `onboarding.task.completed`, `onboarding.instance.completed`
- **Scheduled jobs**: Overdue task detection, auto-start on start_date, stale instance flagging

### Example Use Cases

1. "Create the onboarding template system with department-specific task lists"
2. "Implement automatic onboarding when a new employee is hired"
3. "Build the task completion flow with dependency checking and progress calculation"
4. "Implement the buddy assignment and buddy dashboard"
5. "Build overdue task detection as a scheduled background job"

---

## Security Module Developer

**File:** `.claude/agents/security-module-developer.md`
**Internal name:** `security-module-developer`

### Purpose

The Security Module Developer agent implements fine-grained access control, field-level permissions, multi-portal navigation, manager hierarchy queries, and comprehensive audit logging. This is the most security-sensitive module in the system, and correctness and auditability take priority over all other concerns.

### When to Use

- Implementing field-level permission enforcement (edit/view/hidden per role per field)
- Building the multi-portal system (admin, manager, employee portals)
- Implementing manager hierarchy queries with recursive CTEs
- Building audit log querying and filtering
- Managing roles, permissions, and role assignments
- Implementing permission caching and invalidation
- Adding MFA enforcement for sensitive permissions

### Key Domain Knowledge

- **Four sub-route groups**: Core security (roles, permissions, audit log), field permissions, portal management, manager features
- **Database tables**: roles, role_assignments, role_permissions, permissions, audit_log, role_field_permissions, field_registry, portals, user_portal_access, user_tenants
- **Database functions**: `get_user_roles()`, `get_role_permissions()`, `grant_permission_to_role()`, `revoke_permission_from_role()`, `assign_role_to_user()`, `revoke_role_from_user()`, `get_effective_permissions()`
- **Field permission model**: Three levels (edit > view > hidden); resolution across multiple roles takes the most permissive level; no override defaults to `field_registry.default_permission`
- **Domain invariants**: System roles are immutable, tenant-scoped roles are tenant-only, effective permissions are the union of all role permissions (most permissive wins), audit log is append-only (never update/delete), MFA required for `requires_mfa` permissions, role assignments are temporal (effective_from/effective_to), manager hierarchy depth limit (default: 10 levels)
- **Permission caching**: Redis key `perms:{tenantId}:{userId}` with 5-minute TTL; invalidated on role assignment/revocation and permission grant/revoke
- **Manager hierarchy**: Recursive CTE on `reporting_lines` table with depth tracking and configurable maximum depth

### Example Use Cases

1. "Build the field-level security system controlling which roles can view or edit sensitive employee fields"
2. "Implement portal switching between admin, manager, and employee portals"
3. "Create the manager team view with direct and indirect reports and depth tracking"
4. "Build the audit log search with filtering by action, resource, actor, and date range"
5. "Implement permission cache invalidation when roles or assignments change"

---

## Agent Selection Guide

Use this guide to determine which agent to invoke for a given task.

| Task Category | Agent | Reasoning |
|--------------|-------|-----------|
| Docker, infrastructure, environment | Platform Architect | Owns all infrastructure concerns |
| Database migration with RLS | Platform Architect | RLS is a platform concern |
| Employee data, org structure, contracts | Core HR Developer | Owns the employee system of record |
| Effective-dated position/compensation changes | Core HR Developer | Expert in effective dating patterns |
| React components, pages, hooks | Frontend Architect | Owns all frontend code |
| React Query integration, API client hooks | Frontend Architect | Understands the API client pattern |
| Leave types, policies, balance calculations | Absence Module Builder | Expert in ledger-based balance tracking |
| Leave requests, accruals, carryover | Absence Module Builder | Owns absence management domain |
| Clock in/out, schedules, timesheets | Time and Attendance Developer | Owns time tracking domain |
| Geo-fence validation | Time and Attendance Developer | Implements Haversine calculations |
| HR cases, complaints, SLA tracking | Cases Module Developer | Owns case management state machine |
| Case escalation, PDF bundle generation | Cases Module Developer | Expert in escalation workflows |
| Courses, enrollments, certificates | LMS Module Developer | Owns learning management domain |
| Learning paths, compliance training | LMS Module Developer | Expert in course sequencing |
| Performance reviews, goals, OKRs | Talent Module Developer | Owns performance management domain |
| 360 feedback, calibration sessions | Talent Module Developer | Expert in review workflows |
| New hire checklists, task tracking | Onboarding Module Developer | Owns onboarding domain |
| Buddy assignment, onboarding templates | Onboarding Module Developer | Expert in onboarding patterns |
| Roles, permissions, field-level security | Security Module Developer | Owns access control |
| Manager hierarchy, portal access, audit log | Security Module Developer | Expert in security patterns |

When a task crosses domain boundaries, agents can delegate to each other via swarm mode. For example, the Onboarding Module Developer might delegate a database migration concern to the Platform Architect, or the Frontend Architect might consult the Core HR Developer about the correct API contract for an employee form.

---

## Shared Properties

All agents share these configuration properties:

| Property | Value | Description |
|----------|-------|-------------|
| **Model** | `opus` | Uses the most capable model for complex reasoning |
| **Swarm** | `true` | Can be invoked as sub-agents by other agents for cross-domain tasks |
| **Context** | `CLAUDE.md` + `.claude/CLAUDE.md` + agent definition | All agents inherit project instructions and operating rules |
| **Memory** | `.claude/memories.md` + `.claude/learning.md` | Shared two-tier memory system across all agents |
| **Layer pattern** | `migrations -> schemas -> repositories -> services -> routes -> tests` | All agents follow this build order |

All agents are required to follow the seven operating rules defined in `.claude/CLAUDE.md`:

1. Read before writing
2. Follow the layer pattern (routes -> service -> repository)
3. RLS on every migration
4. Test what matters (RLS isolation, idempotency, outbox atomicity, effective-date overlap, state machine transitions)
5. Document discoveries in the memory system
6. Never silently fix complex issues
7. Make minimal changes

---

## Related Documents

- [Skill Catalog](skill-catalog.md) -- Available development skills and how to invoke them
- [Memory System](memory-system.md) -- How the two-tier memory system works
- [Agent System Overview](agent-system.md) -- Architecture and context hierarchy
- [CLAUDE.md](../../CLAUDE.md) -- Primary project instructions (loaded by all agents)
- [.claude/CLAUDE.md](../../.claude/CLAUDE.md) -- Agent operating rules and memory system rules
