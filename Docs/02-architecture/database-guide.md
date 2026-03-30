# Database Guide

> Complete reference for the Staffora HRIS platform's PostgreSQL database design, including schema conventions, RLS policies, connection management, migrations, effective dating, and query patterns.
> **Last updated:** 2026-03-17

**Related documentation:**

- [Architecture Overview](./ARCHITECTURE.md) -- System-level architecture
- [Database Index Reference](./database-indexes.md) -- Complete index catalog and performance strategy
- [Worker System](./worker-system.md) -- Outbox table and domain event processing
- [Permissions System](./PERMISSIONS_SYSTEM.md) -- RBAC tables and role hierarchy
- [Security Patterns](../02-architecture/security-patterns.md) -- RLS enforcement and audit
- [Testing Guide](../08-testing/test-matrix.md) -- Database and RLS test coverage

---

## Schema Design

All application tables live in the `app` schema (not `public`). This is established by the initialization script `docker/postgres/init.sql` when the database container first starts.

### Schema Setup

```sql
-- Created by docker/postgres/init.sql
CREATE SCHEMA IF NOT EXISTS app;
ALTER DATABASE hris SET search_path TO app, public;
```

The postgres.js client also sets `search_path` at the connection level:

```typescript
connection: {
  search_path: "app,public",
}
```

This means queries can use bare table names (e.g., `employees` instead of `app.employees`). Migration files should always use the fully qualified `app.table_name` form for clarity.

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Tables | `snake_case`, plural | `employees`, `leave_requests` |
| Columns | `snake_case` | `first_name`, `tenant_id` |
| Primary keys | `id uuid` | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| Foreign keys | `<table_singular>_id` | `employee_id`, `tenant_id` |
| Indexes | `idx_<table>_<columns>` | `idx_employees_tenant_id` |
| Unique constraints | `<table>_<columns>_unique` | `employees_number_unique` |
| Check constraints | `<table>_<description>` | `employees_terminated_has_date` |
| Policies | `tenant_isolation[_insert]` | `tenant_isolation ON app.employees` |
| Triggers | `update_<table>_updated_at` | `update_employees_updated_at` |
| Enums | `<context>_<name>` | `app.employee_status` |
| Functions | `snake_case` | `app.set_tenant_context()` |

### Column Transform (snake_case to camelCase)

The postgres.js client automatically converts between `snake_case` (database) and `camelCase` (TypeScript):

```typescript
transform: {
  column: {
    to: postgres.toCamel,    // DB -> TypeScript: tenant_id -> tenantId
    from: postgres.fromCamel, // TypeScript -> DB: tenantId -> tenant_id
  },
}
```

This means:
- Query results use `camelCase` property names in TypeScript
- When constructing queries, use `snake_case` column names in the SQL template
- Dynamic column references via `${sql(columnName)}` are auto-transformed by `fromCamel`

---

## Entity Relationship Diagram

The diagram below shows the ~45 most important tables across all modules with their foreign key relationships. Tables are grouped by functional area. Every tenant-owned table has a `tenant_id` column enforced by RLS (omitted from column lists for brevity). All tables also have `created_at` and `updated_at` timestamps (omitted below).

```mermaid
erDiagram
    %% =========================================================================
    %% PLATFORM & AUTHENTICATION
    %% =========================================================================

    tenants {
        uuid id PK
        varchar name
        varchar slug UK
        jsonb settings
        varchar status
    }

    users {
        uuid id PK
        varchar email UK
        varchar name
        boolean email_verified
        varchar password_hash
        boolean mfa_enabled
        varchar status
    }

    user_tenants {
        uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        boolean is_primary
        varchar status
    }

    sessions {
        uuid id PK
        uuid user_id FK
        varchar token UK
        timestamptz expires_at
    }

    audit_log {
        uuid id PK
        uuid tenant_id
        uuid user_id
        varchar action
        varchar resource_type
        uuid resource_id
        jsonb old_value
        jsonb new_value
        timestamptz created_at
    }

    domain_outbox {
        uuid id PK
        uuid tenant_id FK
        varchar aggregate_type
        uuid aggregate_id
        varchar event_type
        jsonb payload
        timestamptz processed_at
        integer retry_count
    }

    idempotency_keys {
        uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        varchar route_key
        varchar idempotency_key
        integer response_status
        jsonb response_body
    }

    notifications {
        uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        varchar title
        text message
        varchar type
        timestamptz read_at
    }

    %% =========================================================================
    %% RBAC (Role-Based Access Control)
    %% =========================================================================

    roles {
        uuid id PK
        uuid tenant_id FK
        varchar name
        boolean is_system
        jsonb permissions
    }

    permissions {
        uuid id PK
        varchar resource
        varchar action
        varchar module
        boolean requires_mfa
    }

    role_permissions {
        uuid id PK
        uuid tenant_id FK
        uuid role_id FK
        uuid permission_id FK
    }

    role_assignments {
        uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        uuid role_id FK
        jsonb constraints
        timestamptz effective_from
        timestamptz effective_to
    }

    %% =========================================================================
    %% CORE HR
    %% =========================================================================

    org_units {
        uuid id PK
        uuid tenant_id FK
        uuid parent_id FK
        varchar code UK
        varchar name
        integer level
        ltree path
        uuid cost_center_id FK
        boolean is_active
    }

    cost_centers {
        uuid id PK
        uuid tenant_id FK
        varchar code UK
        varchar name
        uuid parent_id FK
        boolean is_active
    }

    positions {
        uuid id PK
        uuid tenant_id FK
        varchar code UK
        varchar title
        uuid org_unit_id FK
        varchar job_grade
        numeric min_salary
        numeric max_salary
        boolean is_manager
        integer headcount
    }

    employees {
        uuid id PK
        uuid tenant_id FK
        varchar employee_number UK
        uuid user_id FK
        employee_status status
        date hire_date
        date termination_date
    }

    employee_personal {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        varchar first_name
        varchar last_name
        date date_of_birth
        date effective_from
        date effective_to
    }

    employment_contracts {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        contract_type contract_type
        employment_type employment_type
        numeric fte
        date effective_from
        date effective_to
    }

    position_assignments {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid position_id FK
        uuid org_unit_id FK
        boolean is_primary
        date effective_from
        date effective_to
    }

    reporting_lines {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid manager_id FK
        boolean is_primary
        varchar relationship_type
        date effective_from
        date effective_to
    }

    compensation_history {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        numeric base_salary
        varchar currency
        varchar pay_frequency
        varchar change_reason
        date effective_from
        date effective_to
    }

    employee_status_history {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        varchar old_status
        varchar new_status
        varchar reason
    }

    %% =========================================================================
    %% TIME & ATTENDANCE
    %% =========================================================================

    schedules {
        uuid id PK
        uuid tenant_id FK
        varchar name
        uuid org_unit_id FK
        date start_date
        date end_date
        schedule_status status
    }

    shifts {
        uuid id PK
        uuid tenant_id FK
        uuid schedule_id FK
        varchar name
        time start_time
        time end_time
    }

    shift_assignments {
        uuid id PK
        uuid tenant_id FK
        uuid shift_id FK
        uuid employee_id FK
        date assignment_date
    }

    time_events {
        uuid id PK
        uuid tenant_id
        uuid employee_id
        time_event_type event_type
        timestamptz event_time
        numeric latitude
        numeric longitude
    }

    timesheets {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        date period_start
        date period_end
        timesheet_status status
        numeric total_regular_hours
        numeric total_overtime_hours
    }

    %% =========================================================================
    %% ABSENCE MANAGEMENT
    %% =========================================================================

    leave_types {
        uuid id PK
        uuid tenant_id FK
        varchar code UK
        varchar name
        leave_type_category category
        leave_unit unit
        boolean requires_approval
    }

    leave_balances {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid leave_type_id FK
        integer year
        numeric opening_balance
        numeric accrued
        numeric used
    }

    leave_balance_ledger {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid leave_type_id FK
        uuid balance_id FK
        balance_transaction_type transaction_type
        numeric amount
    }

    leave_requests {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid leave_type_id FK
        leave_request_status status
        date start_date
        date end_date
        numeric total_days
    }

    %% =========================================================================
    %% RECRUITMENT & TALENT
    %% =========================================================================

    requisitions {
        uuid id PK
        uuid tenant_id FK
        uuid position_id FK
        varchar title
        varchar status
        integer openings
    }

    candidates {
        uuid id PK
        uuid tenant_id FK
        uuid requisition_id FK
        varchar first_name
        varchar last_name
        varchar email
        varchar stage
    }

    performance_cycles {
        uuid id PK
        uuid tenant_id FK
        varchar name
        performance_cycle_status status
        date start_date
        date end_date
    }

    goals {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid cycle_id FK
        varchar title
        goal_status status
        numeric weight
        uuid parent_goal_id FK
    }

    reviews {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid cycle_id FK
        uuid reviewer_id FK
        reviewer_type reviewer_type
        review_status status
        numeric overall_rating
    }

    %% =========================================================================
    %% LMS (Learning Management)
    %% =========================================================================

    courses {
        uuid id PK
        uuid tenant_id FK
        varchar code UK
        varchar name
        varchar category
        integer estimated_duration_minutes
    }

    learning_paths {
        uuid id PK
        uuid tenant_id FK
        varchar code UK
        varchar name
    }

    assignments {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid course_id FK
        uuid learning_path_id FK
        completion_status status
        integer progress_percent
    }

    certificates {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid completion_id FK
        uuid course_id FK
        varchar certificate_number
        timestamptz issued_at
        timestamptz expires_at
    }

    %% =========================================================================
    %% CASES (HR Service Desk)
    %% =========================================================================

    case_categories {
        uuid id PK
        uuid tenant_id FK
        varchar name
        uuid parent_id FK
    }

    cases {
        uuid id PK
        uuid tenant_id FK
        varchar case_number UK
        uuid requester_id FK
        uuid category_id FK
        case_type case_type
        case_priority priority
        case_status status
        uuid assigned_to FK
    }

    case_comments {
        uuid id PK
        uuid tenant_id FK
        uuid case_id FK
        uuid author_id FK
        text content
        boolean is_internal
    }

    %% =========================================================================
    %% ONBOARDING
    %% =========================================================================

    onboarding_templates {
        uuid id PK
        uuid tenant_id FK
        varchar code UK
        varchar name
        template_status status
        integer estimated_duration_days
    }

    onboarding_instances {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid template_id FK
        onboarding_instance_status status
        date start_date
        integer progress_percent
    }

    %% =========================================================================
    %% BENEFITS
    %% =========================================================================

    benefit_plans {
        uuid id PK
        uuid tenant_id FK
        varchar name
        benefit_category category
        contribution_type contribution_type
    }

    benefit_enrollments {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid plan_id FK
        coverage_level coverage_level
        date effective_date
    }

    %% =========================================================================
    %% DOCUMENTS & SUCCESSION
    %% =========================================================================

    documents {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        document_type document_type
        varchar title
        text file_path
        bigint file_size
    }

    succession_plans {
        uuid id PK
        uuid tenant_id FK
        uuid position_id FK
        boolean is_critical_role
        varchar risk_level
    }

    succession_candidates {
        uuid id PK
        uuid tenant_id FK
        uuid plan_id FK
        uuid employee_id FK
        succession_readiness readiness
    }

    %% =========================================================================
    %% COMPETENCIES
    %% =========================================================================

    competencies {
        uuid id PK
        uuid tenant_id FK
        varchar code UK
        varchar name
        competency_category category
        jsonb levels
    }

    employee_competencies {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid competency_id FK
        integer current_level
        integer target_level
    }

    %% =========================================================================
    %% WORKFLOWS
    %% =========================================================================

    workflow_definitions {
        uuid id PK
        uuid tenant_id FK
        varchar code UK
        varchar name
        workflow_trigger_type trigger_type
        boolean is_active
    }

    workflow_instances {
        uuid id PK
        uuid tenant_id FK
        uuid definition_id FK
        uuid version_id FK
        workflow_instance_status status
        jsonb context
        integer current_step_index
    }

    %% =========================================================================
    %% UK COMPLIANCE
    %% =========================================================================

    employee_warnings {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid case_id FK
        warning_level warning_level
        warning_status status
        date issued_date
        date expiry_date
    }

    rtw_checks {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        varchar document_type
        date check_date
        date expiry_date
        varchar status
    }

    ssp_records {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        date absence_start
        date absence_end
        varchar status
    }

    %% =========================================================================
    %% GDPR & DATA PROTECTION
    %% =========================================================================

    dsar_requests {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        varchar request_type
        varchar status
        timestamptz deadline
    }

    consent_records {
        uuid id PK
        uuid tenant_id FK
        uuid employee_id FK
        uuid purpose_id FK
        varchar status
        timestamptz given_at
        timestamptz withdrawn_at
    }

    data_breaches {
        uuid id PK
        uuid tenant_id FK
        varchar title
        varchar severity
        varchar status
        timestamptz discovered_at
    }

    %% =========================================================================
    %% RELATIONSHIPS -- Platform & Auth
    %% =========================================================================

    tenants ||--o{ user_tenants : "has members"
    users ||--o{ user_tenants : "belongs to"
    users ||--o{ sessions : "has sessions"
    users ||--o{ notifications : "receives"
    tenants ||--o{ domain_outbox : "has events"
    tenants ||--o{ idempotency_keys : "has keys"

    %% =========================================================================
    %% RELATIONSHIPS -- RBAC
    %% =========================================================================

    tenants ||--o{ roles : "has"
    roles ||--o{ role_permissions : "grants"
    permissions ||--o{ role_permissions : "granted via"
    roles ||--o{ role_assignments : "assigned via"
    users ||--o{ role_assignments : "holds"

    %% =========================================================================
    %% RELATIONSHIPS -- Core HR
    %% =========================================================================

    tenants ||--o{ employees : "employs"
    users |o--o| employees : "linked to"
    tenants ||--o{ org_units : "has"
    org_units |o--o{ org_units : "parent"
    tenants ||--o{ cost_centers : "has"
    cost_centers |o--o{ cost_centers : "parent"
    org_units |o--o| cost_centers : "allocated to"
    tenants ||--o{ positions : "has"
    org_units ||--o{ positions : "contains"
    employees ||--o{ employee_personal : "has personal info"
    employees ||--o{ employment_contracts : "has contracts"
    employees ||--o{ position_assignments : "assigned to"
    positions ||--o{ position_assignments : "filled by"
    org_units ||--o{ position_assignments : "hosts"
    employees ||--o{ reporting_lines : "reports to"
    employees ||--o{ compensation_history : "has pay history"
    employees ||--o{ employee_status_history : "has status changes"

    %% =========================================================================
    %% RELATIONSHIPS -- Time & Attendance
    %% =========================================================================

    tenants ||--o{ schedules : "has"
    org_units |o--o{ schedules : "scoped to"
    schedules ||--o{ shifts : "contains"
    shifts ||--o{ shift_assignments : "assigned via"
    employees ||--o{ shift_assignments : "works"
    employees ||--o{ time_events : "clocks"
    employees ||--o{ timesheets : "submits"

    %% =========================================================================
    %% RELATIONSHIPS -- Absence Management
    %% =========================================================================

    tenants ||--o{ leave_types : "defines"
    employees ||--o{ leave_balances : "has balances"
    leave_types ||--o{ leave_balances : "tracked per"
    employees ||--o{ leave_balance_ledger : "has ledger entries"
    leave_types ||--o{ leave_balance_ledger : "applies to"
    leave_balances |o--o{ leave_balance_ledger : "sourced from"
    employees ||--o{ leave_requests : "requests"
    leave_types ||--o{ leave_requests : "categorised by"

    %% =========================================================================
    %% RELATIONSHIPS -- Recruitment & Talent
    %% =========================================================================

    positions ||--o{ requisitions : "requested for"
    requisitions ||--o{ candidates : "attracts"
    tenants ||--o{ performance_cycles : "runs"
    employees ||--o{ goals : "owns"
    performance_cycles ||--o{ goals : "contains"
    goals |o--o{ goals : "cascades from"
    employees ||--o{ reviews : "reviewed in"
    performance_cycles ||--o{ reviews : "part of"

    %% =========================================================================
    %% RELATIONSHIPS -- LMS
    %% =========================================================================

    tenants ||--o{ courses : "offers"
    tenants ||--o{ learning_paths : "defines"
    employees ||--o{ assignments : "assigned"
    courses |o--o{ assignments : "assigned via"
    learning_paths |o--o{ assignments : "assigned via"
    employees ||--o{ certificates : "earns"
    courses |o--o{ certificates : "certifies for"

    %% =========================================================================
    %% RELATIONSHIPS -- Cases
    %% =========================================================================

    tenants ||--o{ case_categories : "defines"
    case_categories |o--o{ case_categories : "parent"
    employees ||--o{ cases : "raises"
    case_categories ||--o{ cases : "classifies"
    cases ||--o{ case_comments : "has comments"

    %% =========================================================================
    %% RELATIONSHIPS -- Onboarding
    %% =========================================================================

    tenants ||--o{ onboarding_templates : "defines"
    employees ||--o{ onboarding_instances : "goes through"
    onboarding_templates ||--o{ onboarding_instances : "based on"

    %% =========================================================================
    %% RELATIONSHIPS -- Benefits
    %% =========================================================================

    tenants ||--o{ benefit_plans : "offers"
    employees ||--o{ benefit_enrollments : "enrolled in"
    benefit_plans ||--o{ benefit_enrollments : "provides"

    %% =========================================================================
    %% RELATIONSHIPS -- Documents & Succession
    %% =========================================================================

    employees |o--o{ documents : "has documents"
    positions ||--o{ succession_plans : "planned for"
    succession_plans ||--o{ succession_candidates : "identifies"
    employees ||--o{ succession_candidates : "considered for"

    %% =========================================================================
    %% RELATIONSHIPS -- Competencies
    %% =========================================================================

    tenants ||--o{ competencies : "defines"
    employees ||--o{ employee_competencies : "assessed for"
    competencies ||--o{ employee_competencies : "measured by"

    %% =========================================================================
    %% RELATIONSHIPS -- Workflows
    %% =========================================================================

    tenants ||--o{ workflow_definitions : "defines"
    workflow_definitions ||--o{ workflow_instances : "instantiated as"

    %% =========================================================================
    %% RELATIONSHIPS -- UK Compliance
    %% =========================================================================

    employees ||--o{ employee_warnings : "receives"
    cases |o--o{ employee_warnings : "linked to"
    employees ||--o{ rtw_checks : "verified by"
    employees ||--o{ ssp_records : "tracked for"

    %% =========================================================================
    %% RELATIONSHIPS -- GDPR
    %% =========================================================================

    employees ||--o{ dsar_requests : "submits"
    employees ||--o{ consent_records : "gives consent"
    tenants ||--o{ data_breaches : "reports"
```

### Diagram Notes

- **Effective-dated tables**: `employee_personal`, `employment_contracts`, `position_assignments`, `reporting_lines`, and `compensation_history` use `effective_from`/`effective_to` columns for temporal tracking. Only the record where `effective_to IS NULL` represents the current state.
- **Partitioned tables**: `audit_log` (by month on `created_at`) and `time_events` (by month on `event_time`) are partitioned for performance at scale.
- **Append-only tables**: `audit_log` and `leave_balance_ledger` are immutable -- no UPDATE or DELETE allowed.
- **Additional tables not shown**: The full schema contains ~190 tables. Omitted tables include `timesheet_lines`, `timesheet_approvals`, `shifts`, `shift_swap_requests`, `leave_policies`, `leave_accrual_rules`, `leave_request_approvals`, `public_holidays`, `blackout_periods`, `course_versions`, `learning_path_courses`, `completions`, `case_attachments`, `onboarding_template_tasks`, `onboarding_task_completions`, `benefit_carriers`, `benefit_dependents`, `development_plans`, `feedback_items`, `interview_feedback`, `offers`, `workflow_versions`, `workflow_tasks`, `workflow_transitions`, `workflow_slas`, `exports`, `analytics_*`, `report_*`, various UK compliance tables (`statutory_leave_records`, `pension_schemes`, `pension_enrolments`, `disciplinary_cases`, `probation_reviews`, `flexible_working_requests`, `family_leave_notices`, etc.), and the client portal tables (`portal_users`, `portal_tickets`, `portal_invoices`, etc.).

---

## Required Table Patterns

### Every Table

All tables must include these columns:

```sql
CREATE TABLE app.table_name (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- ... business columns ...
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update timestamp trigger
CREATE TRIGGER update_table_name_updated_at
    BEFORE UPDATE ON app.table_name
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();
```

### Tenant-Owned Tables (with RLS)

Tables that belong to a tenant must additionally include:

```sql
CREATE TABLE app.table_name (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    -- ... business columns ...
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1. Enable Row-Level Security
ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;

-- 2. SELECT/UPDATE/DELETE policy
CREATE POLICY tenant_isolation ON app.table_name
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- 3. INSERT policy
CREATE POLICY tenant_isolation_insert ON app.table_name
    FOR INSERT WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- 4. Tenant ID index (critical for RLS performance)
CREATE INDEX idx_table_name_tenant_id ON app.table_name(tenant_id);

-- 5. Updated_at trigger
CREATE TRIGGER update_table_name_updated_at
    BEFORE UPDATE ON app.table_name
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();
```

**Important notes:**
- Use `current_setting('app.current_tenant', true)` (with `true`) to return NULL instead of error when the setting is not set
- Include `OR app.is_system_context()` to allow system context bypass
- Always add `ON DELETE CASCADE` to the `tenants(id)` foreign key

### Soft Delete Tables

Tables with soft delete must have:
- `deleted_at timestamptz` (nullable)
- Index on `deleted_at` for filtering active records

### Audit Log Table

The audit log table is special:
- Partitioned by month on `created_at` for query performance
- Append-only -- triggers prevent UPDATE and DELETE
- Contains `tenant_id` but does NOT use RLS (enables system-wide audit queries)
- Primary key includes the partition key: `PRIMARY KEY (id, created_at)`

---

## Key Tables

The database contains 229 migration files defining the complete schema across ~190 tables. Here are the primary table groups:

### Core Platform

| Table | Tenant-Scoped | RLS | Description |
|-------|:---:|:---:|-------------|
| `tenants` | No | No | Tenant organizations (root table) |
| `users` | No | No | User accounts (global) |
| `user_tenants` | Yes | Yes | User-to-tenant membership |
| `sessions` | No | No | BetterAuth authentication sessions |
| `"user"` | No | No | BetterAuth internal user table |
| `account` | No | No | BetterAuth OAuth accounts |
| `verification` | No | No | BetterAuth email verification |
| `audit_log` | No | No | Partitioned audit log (append-only) |
| `domain_outbox` | Yes | Yes | Event outbox for reliable messaging |
| `idempotency_keys` | Yes | Yes | Request deduplication |

### RBAC

| Table | Description |
|-------|-------------|
| `permissions` | Individual permission definitions |
| `roles` | Role definitions per tenant |
| `role_permissions` | Permission-to-role mapping |
| `role_assignments` | Role-to-user assignments within tenants |

### Core HR

| Table | Effective-Dated | Description |
|-------|:---:|-------------|
| `employees` | No | Employee records with lifecycle status |
| `employee_personal` | No | Personal details (name, DOB) |
| `employee_contacts` | No | Contact information |
| `employee_addresses` | No | Address history |
| `employee_employment` | Yes | Employment details (job title, department) |
| `org_units` | No | Organizational units (hierarchical) |
| `positions` | No | Job positions |
| `cost_centers` | No | Financial cost centers |
| `contracts` | Yes | Employment contracts |
| `compensation` | Yes | Salary/compensation records |

### Time and Attendance

| Table | Description |
|-------|-------------|
| `time_events` | Clock in/out events |
| `timesheets` | Weekly/period timesheets |
| `schedules` | Work schedules |
| `wtr_alerts` | Working Time Regulation compliance alerts |
| `wtr_opt_outs` | WTR 48-hour limit opt-outs |

### Absence Management

| Table | Description |
|-------|-------------|
| `leave_types` | Leave type definitions per tenant |
| `leave_policies` | Accrual rules per leave type |
| `leave_balances` | Employee leave balances per year |
| `leave_requests` | Leave request submissions |

### Talent Management

| Table | Description |
|-------|-------------|
| `performance_cycles` | Review cycle definitions |
| `reviews` | Individual performance reviews |
| `goals` | Employee goals |
| `competency_frameworks` | Competency model definitions |

### Other Modules

| Module | Key Tables |
|--------|------------|
| LMS | `courses`, `enrollments`, `learning_paths`, `certificates` |
| Cases | `cases`, `case_comments`, `case_attachments` |
| Onboarding | `onboarding_templates`, `onboarding_checklists` |
| Documents | `documents`, `document_categories` |
| Benefits | `benefit_plans`, `benefit_enrollments` |
| Workflows | `workflow_definitions`, `workflow_instances`, `workflow_steps` |
| Reports | `report_definitions`, `report_executions`, `report_schedules` |
| Notifications | `notifications`, `notification_preferences` |

---

## Row-Level Security (RLS)

### How RLS Works

RLS policies filter rows automatically at the database level. Every query against a tenant-owned table only returns rows where `tenant_id` matches the current session context.

```mermaid
sequenceDiagram
    participant API as API Request
    participant DB as DatabaseClient
    participant PG as PostgreSQL

    API->>DB: withTransaction(ctx, callback)
    DB->>PG: BEGIN
    DB->>PG: SELECT app.set_tenant_context('tenant-uuid', 'user-uuid')
    Note over PG: All subsequent queries filtered<br/>by tenant_id = 'tenant-uuid'
    DB->>PG: SELECT * FROM employees
    PG->>DB: Only rows for tenant-uuid
    DB->>PG: COMMIT
```

### Tenant Context Functions

Defined in `docker/postgres/init.sql`:

```sql
-- Set context for a request (transaction-scoped via SET LOCAL)
SELECT app.set_tenant_context(p_tenant_id uuid, p_user_id uuid);

-- Get current tenant (raises exception if not set)
SELECT app.current_tenant_id();

-- Get current user (returns NULL if not set)
SELECT app.current_user_id();

-- Clear context
SELECT app.clear_tenant_context();
```

These use PostgreSQL's `current_setting()` mechanism with transaction-local scope, meaning the context is automatically cleared when the transaction ends.

### System Context (RLS Bypass)

For administrative operations that need to read across tenants (migrations, scheduled jobs, system reports):

```sql
-- Enable bypass
SELECT app.enable_system_context();

-- ... privileged operations ...

-- Disable bypass (ALWAYS in a finally block)
SELECT app.disable_system_context();
```

The `is_system_context()` function checks `current_setting('app.system_context', true) = 'true'`.

**TypeScript usage:**

```typescript
// In application code (preferred -- handles cleanup automatically)
await db.withSystemContext(async (tx) => {
  // RLS is bypassed here
  // A nil UUID is set as current_tenant to prevent cast errors
  const allTenants = await tx`SELECT * FROM tenants WHERE status = 'active'`;
  return allTenants;
});

// In scheduler/worker jobs (direct SQL -- must handle cleanup)
await sql`SELECT app.enable_system_context()`;
try {
  // Cross-tenant queries
} finally {
  await sql`SELECT app.disable_system_context()`;
}
```

### RLS Policy Template

Every tenant-owned table uses this standard policy pair:

```sql
-- SELECT, UPDATE, DELETE policy
CREATE POLICY tenant_isolation ON app.table_name
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- INSERT policy (uses WITH CHECK instead of USING)
CREATE POLICY tenant_isolation_insert ON app.table_name
    FOR INSERT WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );
```

**How the policy works step by step:**

1. On every query, PostgreSQL evaluates the `USING` clause for each row
2. `current_setting('app.current_tenant', true)` reads the transaction-local setting (returns NULL if not set)
3. If the setting is not set, `::uuid` cast on NULL yields NULL, and `tenant_id = NULL` is false -- **all rows are excluded**
4. If `app.is_system_context()` returns true, the row is included regardless of tenant_id
5. This means: without calling `set_tenant_context()` or `enable_system_context()`, you see zero rows

Some older tables may have simpler policies without the `is_system_context()` check. These require `enable_system_context()` or connection as the `hris` superuser role for cross-tenant access.

---

## Connection Management

### DatabaseClient

**Source:** `packages/api/src/plugins/db.ts`

The `DatabaseClient` class wraps postgres.js and provides tenant-aware query methods:

```typescript
class DatabaseClient {
  // The PostgreSQL role name used for this connection pool
  readonly connectionUser: string;

  // Direct query (no tenant context, for system operations)
  async query<T>(sql: TemplateStringsArray, ...values): Promise<T[]>

  // Single query with tenant context (wraps in transaction)
  async queryWithTenant<T>(context: TenantContext, sql, ...values): Promise<T[]>

  // Transaction with tenant context (PRIMARY method for all tenant operations)
  async withTransaction<T>(
    context: TenantContext,
    callback: (tx: TransactionSql) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T>

  // System context bypass (for cross-tenant operations)
  async withSystemContext<T>(
    callback: (tx: TransactionSql) => Promise<T>
  ): Promise<T>

  // Health check (SELECT 1)
  async healthCheck(): Promise<{ status: "up" | "down"; latency: number }>

  // Cleanup (close all pool connections)
  async close(): Promise<void>
}
```

### Connection Pool Configuration

| Parameter | Env Variable | Default | Description |
|-----------|-------------|---------|-------------|
| Max connections | `DB_MAX_CONNECTIONS` | 20 | Maximum pool size |
| Idle timeout | `DB_IDLE_TIMEOUT` | 30s | Close idle connections after |
| Connect timeout | `DB_CONNECT_TIMEOUT` | 10s | Connection establishment timeout |
| SSL | `DB_SSL` | false | Enable SSL connections |
| Debug logging | `DB_DEBUG` | false | Log queries (opt-in, truncated to 200 chars) |

### Connection URL Priority

The database client resolves connection details in this order:

1. `DATABASE_APP_URL` -- Preferred (uses `hris_app` role with `NOBYPASSRLS`)
2. `DATABASE_URL` -- Fallback
3. Component env vars (`DB_HOST`, `DB_PORT`, `DB_PASSWORD`, etc.) -- Only if `DB_PASSWORD` is set

If none of these are available, the client throws an error on startup: `"DATABASE_APP_URL environment variable is required"`.

### Transaction Options

```typescript
await db.withTransaction(ctx, callback, {
  isolationLevel: "serializable",  // 'read committed' | 'repeatable read' | 'serializable'
  accessMode: "read only",         // 'read write' | 'read only'
});
```

Isolation levels and access modes are set using a whitelist-based switch statement (no `sql.unsafe`), preventing SQL injection through options.

### Singleton Pattern

The `DatabaseClient` is instantiated as a singleton via `getDbClient()`. The same pool is shared across the API server and reused by the Elysia `dbPlugin()`:

```typescript
// In plugins or services
import { getDbClient } from "../plugins/db";
const db = getDbClient(); // Returns existing instance or creates one
```

Cleanup is handled by `closeDbClient()`, called during graceful shutdown via Elysia's `onStop` hook.

---

## Database Roles

### Two-Role Architecture

| Role | Purpose | RLS Behavior |
|------|---------|-------------|
| `hris` | Admin/superuser | Bypasses RLS (owns tables) |
| `hris_app` | Application runtime | Subject to RLS (`NOBYPASSRLS`) |

**When to use each:**

| Operation | Role |
|-----------|------|
| Running migrations | `hris` |
| Database seeds | `hris` |
| API request handling | `hris_app` |
| Integration tests | `hris_app` |
| Background workers | `hris_app` (with `enable_system_context()` for cross-tenant) |

The `hris_app` role is created by `docker/postgres/init.sql` and is granted:
- `USAGE` on the `app` schema
- `SELECT, INSERT, UPDATE, DELETE` on all tables
- `USAGE, SELECT` on sequences
- `EXECUTE` on functions

### Test Environment

Tests connect as `hris_app` to ensure RLS policies are actually exercised:

```bash
# Test database connection uses the app role (non-superuser)
DATABASE_APP_URL=postgres://hris_app:hris_app_dev_password@localhost:5432/hris
```

This is critical: if tests ran as the `hris` superuser, RLS bugs would go undetected.

---

## Migration System

### File Naming

Migrations live in the `migrations/` directory at the repository root (229 files total):

```
NNNN_description.sql
```

- `NNNN` -- 4-digit zero-padded sequence number (0001 through 0190)
- `description` -- Lowercase, underscore-separated description

**Examples:**
```
0001_extensions.sql
0002_tenants.sql
0017_employees.sql
0189_portal_betterauth_cleanup.sql
0190_account_lockout.sql
```

### Migration Ordering

Migrations must respect foreign key dependencies:

1. **Extensions** -- `uuid-ossp`, `pgcrypto` (0001)
2. **Tenants** -- Root table for multi-tenancy (0002)
3. **Auth tables** -- `users`, `sessions`, `mfa_tokens` (0003-0004)
4. **Junction tables** -- `user_tenants` (0005)
5. **RBAC** -- `roles`, `permissions`, `role_permissions`, `role_assignments` (0006-0009)
6. **Audit** -- `audit_log` partitioned table (0010)
7. **Infrastructure** -- `domain_outbox`, `idempotency_keys` (0011-0012)
8. **HR enums** -- Status types (0013)
9. **Business tables** -- `org_units`, `positions`, `employees`, etc. (0014+)

### Running Migrations

```bash
# Run all pending migrations
bun run migrate:up

# Rollback the last migration
bun run migrate:down

# Create a new migration file (auto-numbered)
bun run migrate:create <description>

# Migration runner uses the hris admin role
DATABASE_URL=postgres://hris:password@localhost:5432/hris
```

### Migration Structure Template

```sql
-- Migration: 0191_add_new_feature
-- Created: 2026-03-17
-- Description: Adds tables for the new feature module

-- =============================================================================
-- UP Migration
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.new_feature (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    name       text NOT NULL,
    status     text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE app.new_feature ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.new_feature
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.new_feature
    FOR INSERT WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_new_feature_tenant_id ON app.new_feature(tenant_id);

-- Updated_at trigger
CREATE TRIGGER update_new_feature_updated_at
    BEFORE UPDATE ON app.new_feature
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Comments
COMMENT ON TABLE app.new_feature IS 'Description of the table purpose';

-- =============================================================================
-- DOWN Migration (commented, run manually if needed)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_new_feature_updated_at ON app.new_feature;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.new_feature;
-- DROP POLICY IF EXISTS tenant_isolation ON app.new_feature;
-- DROP INDEX IF EXISTS app.idx_new_feature_tenant_id;
-- DROP TABLE IF EXISTS app.new_feature;
```

### Known Quirks

- Migration numbers 0076-0079 and 0187 have duplicates from parallel feature branches
- There is a non-numbered `fix_schema_migrations_filenames.sql` file
- Always check the highest existing migration number before creating a new one
- Use `IF NOT EXISTS` and `IF EXISTS` for idempotent migrations

### CI Validation

The `migration-check.yml` workflow runs on PRs that modify `migrations/` and checks:

1. **Naming convention** -- 4-digit prefix, lowercase, underscores
2. **RLS compliance** -- Warnings if new `CREATE TABLE` statements are missing:
   - `tenant_id` column
   - `ENABLE ROW LEVEL SECURITY`
   - `tenant_isolation` policy

---

## Effective Dating Pattern

HR data that changes over time uses the effective dating pattern with `effective_from` and `effective_to` columns. This allows querying "what was the employee's job title on date X?" without losing history.

### Schema Pattern

```sql
CREATE TABLE app.employee_employment (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    employee_id     uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    job_title       text NOT NULL,
    department_id   uuid REFERENCES app.org_units(id),
    effective_from  date NOT NULL,
    effective_to    date,              -- NULL means "current/active"
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Prevent more than one "current" (NULL effective_to) record per employee
CREATE UNIQUE INDEX idx_employee_employment_no_overlap
    ON app.employee_employment (employee_id)
    WHERE effective_to IS NULL;

-- Index for date range queries
CREATE INDEX idx_employee_employment_dates
    ON app.employee_employment (employee_id, effective_from, effective_to);
```

### Rules

1. **No overlaps** -- For the same employee and dimension (e.g., job title, compensation), date ranges must not overlap
2. **NULL effective_to** -- Represents the current/active record
3. **Validation under transaction** -- Always validate overlaps within a transaction to prevent race conditions
4. **Use `validateNoOverlap` utility** -- Available in the shared package for consistent enforcement

### Querying Current Records

```sql
-- Get current employment details for an employee
SELECT * FROM app.employee_employment
WHERE employee_id = $1
  AND effective_from <= CURRENT_DATE
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE);

-- Get employment as of a specific date (point-in-time query)
SELECT * FROM app.employee_employment
WHERE employee_id = $1
  AND effective_from <= $2
  AND (effective_to IS NULL OR effective_to >= $2);

-- Get full employment history for an employee
SELECT * FROM app.employee_employment
WHERE employee_id = $1
ORDER BY effective_from DESC;
```

### Creating a New Period (Closing the Old)

When a new record takes effect, close the previous one in the same transaction:

```typescript
await db.withTransaction(ctx, async (tx) => {
  // 1. Close the current record (set effective_to to day before new period)
  await tx`
    UPDATE employee_employment
    SET effective_to = ${newEffectiveFrom}::date - INTERVAL '1 day'
    WHERE employee_id = ${employeeId}
      AND effective_to IS NULL
  `;

  // 2. Insert the new record (effective_to = NULL means "current")
  const [newRecord] = await tx`
    INSERT INTO employee_employment (
      tenant_id, employee_id, job_title, department_id, effective_from
    )
    VALUES (
      ${ctx.tenantId}, ${employeeId}, ${newTitle}, ${newDeptId}, ${newEffectiveFrom}
    )
    RETURNING *
  `;

  // 3. Write outbox event
  await tx`
    SELECT app.write_outbox_event(
      ${ctx.tenantId}::uuid, 'employee', ${employeeId}::uuid,
      'hr.employee.employment_changed',
      ${JSON.stringify({ newRecord })}::jsonb, '{}'::jsonb
    )
  `;

  return newRecord;
});
```

### Overlap Prevention

The `validateNoOverlap` utility prevents concurrent requests from creating overlapping records:

```typescript
import { validateNoOverlap } from "@staffora/shared/utils";

await db.withTransaction(ctx, async (tx) => {
  // Check for overlapping records (under transaction isolation)
  await validateNoOverlap(tx, {
    table: "employee_employment",
    employeeId,
    effectiveFrom: newEffectiveFrom,
    effectiveTo: newEffectiveTo,
    excludeId: existingRecordId, // Exclude self when updating
  });

  // Safe to insert/update
});
```

---

## Query Patterns

### Tagged Template SQL

All queries use postgres.js tagged template syntax. Never use string concatenation or `sql.unsafe` for user input:

```typescript
// Parameterized query (safe -- values are automatically escaped)
const employees = await tx`
  SELECT * FROM employees
  WHERE tenant_id = ${tenantId}
    AND status = ${status}
  ORDER BY created_at DESC
  LIMIT ${limit}
`;

// Dynamic column names (use sql() helper)
const column = "first_name";
const results = await tx`
  SELECT ${tx(column)} FROM employee_personal
  WHERE employee_id = ${id}
`;

// NEVER do this (SQL injection vulnerability)
const employees = await tx.unsafe(`SELECT * FROM employees WHERE id = '${id}'`);
```

### Reads with Tenant Context

```typescript
const employees = await db.withTransaction(ctx, async (tx) => {
  return await tx`
    SELECT e.*, ep.first_name, ep.last_name
    FROM employees e
    LEFT JOIN employee_personal ep ON ep.employee_id = e.id
    WHERE e.status = 'active'
    ORDER BY ep.last_name
  `;
});
// Result: [{ id, tenantId, employeeNumber, status, firstName, lastName, ... }]
// Note: column names are camelCase due to the transform
```

### Writes with Outbox

```typescript
await db.withTransaction(ctx, async (tx) => {
  // Business write
  const [employee] = await tx`
    INSERT INTO employees (tenant_id, employee_number, status, hire_date)
    VALUES (${ctx.tenantId}, ${data.employeeNumber}, 'pending', ${data.hireDate})
    RETURNING *
  `;

  // Outbox write (same transaction -- guaranteed atomic)
  await tx`
    SELECT app.write_outbox_event(
      ${ctx.tenantId}::uuid, 'employee', ${employee.id}::uuid,
      'hr.employee.created',
      ${JSON.stringify({ employee, actor: ctx.userId })}::jsonb,
      '{}'::jsonb
    )
  `;

  return employee;
});
```

### System Context Queries

```typescript
// For cross-tenant operations (admin, migrations, workers)
const allTenants = await db.withSystemContext(async (tx) => {
  return await tx`
    SELECT id, name, status FROM tenants WHERE status = 'active'
  `;
});
```

### TransactionManager (with event emitter)

For more complex operations, use the `TransactionManager` from `src/lib/transaction.ts`:

```typescript
import { createTransactionManager, createdEvent } from "../lib/transaction";

const txManager = createTransactionManager(db, ctx.tenantId, ctx.userId);

// Simple transaction with automatic outbox writes
const { result, events } = await txManager.execute(async (tx, emitEvent) => {
  const [emp] = await tx`INSERT INTO employees (...) VALUES (...) RETURNING *`;
  emitEvent(createdEvent("employee", emp.id, { employee: emp }));
  return emp;
});

// Idempotent transaction
const { result, fromCache } = await txManager.executeIdempotent(
  ctx.userId,
  "POST:/api/v1/employees",
  idempotencyKey,
  requestBody,
  async (tx, emitEvent) => {
    // ... same as above
  }
);
```

---

## Audit Log

The audit log table is special:

- **Partitioned by month** on `created_at` for query performance
- **Append-only** -- trigger functions `prevent_update` and `prevent_delete` block modifications
- **Contains `tenant_id`** but does NOT use RLS (enables system-wide audit queries)
- **Primary key includes partition key** -- `PRIMARY KEY (id, created_at)` for proper partitioning

```sql
CREATE TABLE app.audit_log (
    id            uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL,
    user_id       uuid,
    action        varchar(255) NOT NULL,      -- e.g., 'hr.employee.created'
    resource_type varchar(100) NOT NULL,       -- e.g., 'employee'
    resource_id   uuid,
    old_value     jsonb,                       -- State before change (NULL for create)
    new_value     jsonb,                       -- State after change (NULL for delete)
    ip_address    varchar(45),
    user_agent    text,
    request_id    varchar(100),
    session_id    uuid,
    metadata      jsonb DEFAULT '{}',
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
```

---

## Initialization Script

The `docker/postgres/init.sql` script runs once when the PostgreSQL container is first created. It sets up:

1. **Extensions:** `uuid-ossp`, `pgcrypto`
2. **Schema:** `app` schema with default search path
3. **Tenant context functions:** `set_tenant_context`, `current_tenant_id`, `current_user_id`, `clear_tenant_context`
4. **RLS helper functions:** `is_system_context`, `enable_system_context`, `disable_system_context`
5. **Audit helpers:** `update_updated_at_column`, `prevent_update`, `prevent_delete`
6. **Utility functions:** `generate_short_id`, `is_valid_email`
7. **Domain types:** `app.email` domain with validation
8. **Database roles:** Creates `hris_app` with `NOBYPASSRLS`
9. **Grants:** Schema usage and default privileges for the `hris_app` role

---

## Performance Considerations

### Indexing Strategy

Required indexes for every tenant-owned table:

```sql
-- 1. Tenant ID (REQUIRED for RLS performance)
CREATE INDEX idx_table_tenant_id ON app.table(tenant_id);

-- 2. Foreign keys (always index FK columns)
CREATE INDEX idx_table_employee_id ON app.table(employee_id);

-- 3. Status filtering (partial index for common queries)
CREATE INDEX idx_table_active ON app.table(tenant_id) WHERE status = 'active';

-- 4. Date range queries (for effective dating)
CREATE INDEX idx_table_dates ON app.table(employee_id, effective_from, effective_to);

-- 5. Sorting columns (for paginated queries)
CREATE INDEX idx_table_created_at ON app.table(created_at DESC);
```

### Query Optimization Tips

1. **Always include tenant_id in WHERE clauses** -- Even though RLS filters automatically, explicit conditions help the query planner use the tenant index
2. **Use `FOR UPDATE SKIP LOCKED`** -- For concurrent processing patterns (outbox, queue)
3. **Use `CREATE INDEX CONCURRENTLY`** -- For large tables in production to avoid table locks
4. **Batch operations** -- Use `INSERT ... SELECT` and `UPDATE ... FROM` instead of N+1 loops
5. **Limit result sets** -- Always use `LIMIT` for queries that could return unbounded results
6. **Cursor-based pagination** -- Never use `OFFSET`; use cursor-based pagination with `WHERE id > ${cursor}` or `WHERE created_at < ${cursor}`
7. **Effective dating indexes** -- Tables with `effective_from/effective_to` should have composite indexes on `(employee_id, effective_from, effective_to)`

### Connection Pool Sizing

The default pool size is 20 connections. Guidelines:

| Environment | Pool Size | Rationale |
|-------------|-----------|-----------|
| Development | 5-10 | Lower to catch connection leaks early |
| Production API | 20-30 per instance | Handle concurrent HTTP requests |
| Worker | 5-10 | Lower concurrency needs |
| Test | 5-10 | Sufficient for parallel test suites |

**Formula:** `max_connections = (num_api_instances * pool_size) + (num_workers * worker_pool) + admin_overhead`

Ensure PostgreSQL's `max_connections` is set high enough to accommodate all pools plus overhead for migrations, monitoring, and ad-hoc queries.

### State Machine Validation

The `employees` table uses a database-level trigger to enforce valid status transitions:

```
pending -> active           (onboarding complete)
active -> on_leave          (leave started)
on_leave -> active          (leave ended)
active -> terminated        (employment ended)
on_leave -> terminated      (terminated while on leave)
terminated -> (nothing)     (terminal state; rehires create new records)
```

This is enforced by the `app.validate_employee_status_transition()` trigger function, which raises an exception on invalid transitions. This provides a safety net beyond application-level state machine checks.
