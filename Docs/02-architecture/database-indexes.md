# Database Index Reference

> Complete index catalog and performance strategy for the Staffora HRIS platform.
> *Last updated: 2026-03-28*

**Related documentation:**

- [Database Guide](./database-guide.md) -- Schema design, RLS, query patterns
- [DATABASE.md](./DATABASE.md) -- Table catalog, migration conventions
- [Security Patterns](./security-patterns.md) -- RLS enforcement and audit

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| **Total unique indexes** | ~793 |
| **Tables with indexes** | ~200+ |
| **B-tree indexes** | ~745 |
| **GIN indexes** | ~42 |
| **GiST indexes** | 2 |
| **UNIQUE indexes** | ~37 |
| **Partial indexes (with WHERE)** | ~260 |
| **Full-text search indexes** | 5 |
| **Materialized view indexes** | 4 |

---

## Indexing Strategy

The indexing approach across the Staffora codebase follows these consistent principles:

### 1. Tenant-First Composite Indexes

Every tenant-owned table includes `tenant_id` as the **leading column** in most composite indexes. This is critical because:

- RLS policies filter on `tenant_id = current_setting('app.current_tenant')::uuid` for every query
- PostgreSQL's query planner can use the leading column of a composite index to satisfy the RLS filter
- This avoids full table scans even when RLS is enforced

**Pattern:** `CREATE INDEX idx_<table>_tenant_<purpose> ON app.<table>(tenant_id, <business_columns>);`

### 2. Partial Indexes for Status Filters

Over 260 indexes use `WHERE` clauses to create partial indexes. These drastically reduce index size and improve write performance by only indexing rows that match common query patterns.

**Common patterns:**
- `WHERE effective_to IS NULL` -- Current records in effective-dated tables
- `WHERE status = 'active'` / `WHERE is_active = true` -- Active records only
- `WHERE status = 'pending'` -- Pending approval queues
- `WHERE status NOT IN ('resolved', 'closed', 'cancelled')` -- Open items

### 3. Effective Dating Indexes

Tables using the `effective_from` / `effective_to` temporal pattern always have:
- A "current record" partial index: `WHERE effective_to IS NULL`
- A range index for overlap checks: `(tenant_id, employee_id, effective_from, effective_to)`
- These support the `validateNoOverlap()` utility and temporal queries

### 4. GIN Indexes for JSONB and Arrays

GIN indexes are used for:
- JSONB columns (settings, metadata, form submissions, notes)
- Array columns (tags, mentioned_user_ids, permissions)
- Full-text search via `to_tsvector()`

### 5. Unique Constraint Indexes

UNIQUE indexes enforce business rules beyond primary keys:
- One default per tenant (e.g., `idx_onboarding_templates_default_unique`)
- One active record per entity (e.g., `idx_employee_suspensions_one_active_per_employee`)
- Period uniqueness (e.g., `idx_pension_contributions_unique_period`)
- Composite natural keys (e.g., `idx_employment_records_number_unique`)

### 6. Descending Indexes for Recency Queries

Many indexes use `DESC` ordering on date columns for "most recent first" pagination:
- `(tenant_id, created_at DESC)` -- Recent items
- `(tenant_id, employee_id, completed_at DESC)` -- Recent completions per employee

---

## Index Catalog

### Platform & Authentication

#### tenants

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_tenants_status` | `status` | btree | | Status filtering |
| `idx_tenants_settings` | `settings` | GIN | | JSONB settings queries |

#### users

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_users_email` | `email` | btree | | Email lookup |
| `idx_users_status` | `status` | btree | | Status filtering |
| `idx_users_mfa_enabled` | `mfa_enabled` | btree | `mfa_enabled = true` | MFA users filter |
| `idx_users_active` | `id` | btree | `status != 'deleted'` | Active users only |
| `idx_users_locked_until` | `locked_until` | btree | | Account lockout lookup |
| `idx_ba_user_locked_until` | `lockedUntil` | btree | | Better Auth lockout |

#### sessions

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_sessions_user_id` | `user_id` | btree | | User session lookup |
| `idx_sessions_token` | `token` | btree | | Token authentication |
| `idx_sessions_expires_at` | `expires_at` | btree | | Expired session cleanup |
| `idx_sessions_current_tenant` | `current_tenant_id` | btree | `current_tenant_id IS NOT NULL` | Active tenant context |
| `idx_sessions_user_ip` | `user_id, ip_address` | btree | | Security: IP tracking |

#### user_tenants

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_user_tenants_user_id` | `user_id` | btree | | User's tenants |
| `idx_user_tenants_tenant_id` | `tenant_id` | btree | | Tenant's users |
| `idx_user_tenants_primary` | `user_id, is_primary` | btree | `is_primary = true` | Default tenant lookup |
| `idx_user_tenants_tenant_status` | `tenant_id, status` | btree | | Active members |

#### Better Auth Tables ("user", "session", "account", "verification", "twoFactor")

| Index Name | Table | Columns | Type | Purpose |
|-----------|-------|---------|------|---------|
| `idx_ba_user_email` | `"user"` | `email` | btree | Email lookup |
| `idx_user_two_factor_enabled` | `"user"` | `twoFactorEnabled` | btree | 2FA filter |
| `idx_ba_session_user` | `"session"` | `userId` | btree | User session lookup |
| `idx_ba_session_token` | `"session"` | `token` | btree | Token auth |
| `idx_ba_session_expires` | `"session"` | `expiresAt` | btree | Expiry cleanup |
| `idx_ba_session_current_tenant` | `"session"` | `currentTenantId` | btree | Tenant context |
| `idx_ba_session_active_org` | `"session"` | `activeOrganizationId` | btree | Org context |
| `idx_ba_account_user` | `"account"` | `userId` | btree | Account lookup |
| `idx_ba_verification_identifier` | `"verification"` | `identifier` | btree | Verification lookup |
| `idx_ba_verification_expires` | `"verification"` | `expiresAt` | btree | Expiry cleanup |
| `idx_ba_twofactor_user` | `"twoFactor"` | `userId` | btree | 2FA lookup |

#### Better Auth Organization Tables

| Index Name | Table | Columns | Type | Purpose |
|-----------|-------|---------|------|---------|
| `idx_ba_organization_slug` | `organization` | `slug` | btree | Slug lookup |
| `idx_ba_organization_name` | `organization` | `name` | btree | Name search |
| `idx_ba_member_org_id` | `member` | `organizationId` | btree | Org members |
| `idx_ba_member_user_id` | `member` | `userId` | btree | User memberships |
| `idx_ba_member_role` | `member` | `role` | btree | Role filter |
| `idx_ba_invitation_org_id` | `invitation` | `organizationId` | btree | Org invitations |
| `idx_ba_invitation_email` | `invitation` | `email` | btree | Email lookup |
| `idx_ba_invitation_status` | `invitation` | `status` | btree | Status filter |
| `idx_ba_invitation_expires` | `invitation` | `expiresAt` | btree | Expiry cleanup |

### RBAC & Permissions

#### roles

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_roles_tenant_id` | `tenant_id` | btree | | RLS performance |
| `idx_roles_is_system` | `is_system` | btree | `is_system = true` | System roles filter |
| `idx_roles_tenant_name` | `tenant_id, name` | btree | | Name lookup |
| `idx_roles_permissions` | `permissions` | GIN | | JSONB permissions search |
| `idx_roles_parent_role_id` | `parent_role_id` | btree | `parent_role_id IS NOT NULL` | Role hierarchy |
| `idx_roles_is_template` | `is_template` | btree | `is_template = true` | Template roles |
| `idx_roles_category` | `role_category` | btree | | Category filter |
| `idx_roles_portal_type` | `portal_type` | btree | | Portal type filter |

#### role_permissions

| Index Name | Columns | Type | Purpose |
|-----------|---------|------|---------|
| `idx_role_permissions_role_id` | `role_id` | btree | Role's permissions |
| `idx_role_permissions_permission_id` | `permission_id` | btree | Permission usage |
| `idx_role_permissions_tenant_id` | `tenant_id` | btree | RLS performance |

#### role_assignments

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_role_assignments_tenant_user` | `tenant_id, user_id` | btree | | User's roles |
| `idx_role_assignments_role_id` | `role_id` | btree | | Role membership |
| `idx_role_assignments_tenant_id` | `tenant_id` | btree | | RLS performance |
| `idx_role_assignments_effective` | `effective_from, effective_to` | btree | | Temporal role queries |
| `idx_role_assignments_constraints` | `constraints` | GIN | | JSONB constraints |

#### permissions

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_permissions_resource` | `resource` | btree | | Resource lookup |
| `idx_permissions_module` | `module` | btree | | Module filter |
| `idx_permissions_requires_mfa` | `requires_mfa` | btree | `requires_mfa = true` | MFA-required permissions |

#### Security & Access Control Tables

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_role_field_permissions_role` | `role_field_permissions` | `role_id, entity_name` | btree | | Field-level access |
| `idx_role_field_permissions_field` | `role_field_permissions` | `entity_name, field_name` | btree | | Field lookup |
| `idx_field_registry_entity` | `field_registry` | `tenant_id, entity_name` | btree | | Entity fields |
| `idx_field_registry_sensitive` | `field_registry` | `tenant_id, is_sensitive` | btree | `is_sensitive = true` | Sensitive fields |
| `idx_data_scopes_tenant` | `data_scopes` | `tenant_id` | btree | | Data scope lookup |
| `idx_permission_conditions_resource` | `permission_conditions` | `resource, action` | btree | | Conditional permissions |
| `idx_sod_rules_type` | `sod_rules` | `rule_type` | btree | | SoD rule lookup |
| `idx_security_alerts_tenant` | `security_alerts` | `tenant_id` | btree | | Tenant alerts |
| `idx_security_alerts_type` | `security_alerts` | `alert_type` | btree | | Alert type filter |

### Infrastructure

#### audit_log

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_audit_log_tenant_id` | `tenant_id, created_at DESC` | btree | | Tenant audit trail |
| `idx_audit_log_user_id` | `user_id, created_at DESC` | btree | | User activity |
| `idx_audit_log_resource` | `resource_type, resource_id, created_at DESC` | btree | | Resource history |
| `idx_audit_log_action` | `action, created_at DESC` | btree | | Action filter |
| `idx_audit_log_request_id` | `request_id` | btree | `request_id IS NOT NULL` | Request correlation |
| `idx_audit_log_session_id` | `session_id, created_at DESC` | btree | `session_id IS NOT NULL` | Session activity |
| `idx_audit_log_old_value` | `old_value` | GIN | `old_value IS NOT NULL` | Change search |
| `idx_audit_log_new_value` | `new_value` | GIN | `new_value IS NOT NULL` | Change search |

#### domain_outbox

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_domain_outbox_unprocessed` | `created_at` | btree | `processed_at IS NULL` | Outbox processor poll |
| `idx_domain_outbox_aggregate` | `aggregate_type, aggregate_id, created_at` | btree | | Aggregate event history |
| `idx_domain_outbox_tenant_id` | `tenant_id, created_at` | btree | | Tenant events |
| `idx_domain_outbox_event_type` | `event_type, created_at` | btree | | Event type filter |
| `idx_domain_outbox_retry` | `next_retry_at` | btree | `processed_at IS NULL AND next_retry_at IS NOT NULL` | Failed event retry |

#### idempotency_keys

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_idempotency_keys_lookup` | `tenant_id, user_id, route_key, idempotency_key` | btree | | Key deduplication |
| `idx_idempotency_keys_expires_at` | `expires_at` | btree | `expires_at IS NOT NULL` | Expired key cleanup |
| `idx_idempotency_keys_processing` | `processing, processing_started_at` | btree | `processing = true` | Stuck processing detection |

#### notifications / notification_deliveries

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_notifications_tenant_user` | `notifications` | `tenant_id, user_id, created_at DESC` | btree | | User notifications |
| `idx_notifications_user_unread` | `notifications` | `user_id, created_at DESC` | btree | `read_at IS NULL` | Unread badge count |
| `idx_notifications_expires` | `notifications` | `expires_at` | btree | `expires_at IS NOT NULL AND dismissed_at IS NULL` | Expiry cleanup |
| `idx_notification_deliveries_tenant` | `notification_deliveries` | `tenant_id, delivered_at DESC` | btree | | Delivery log |

#### feature_flags

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_feature_flags_tenant_id` | `tenant_id` | btree | | Tenant flags |
| `idx_feature_flags_tenant_enabled` | `tenant_id, enabled` | btree | `enabled = true` | Enabled flags |
| `idx_feature_flags_name` | `name` | btree | | Flag name lookup |

### Core HR

#### employees

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_employees_tenant_number` | `tenant_id, employee_number` | btree | | Employee number lookup |
| `idx_employees_tenant_user` | `tenant_id, user_id` | btree | `user_id IS NOT NULL` | User-employee mapping |
| `idx_employees_tenant_status` | `tenant_id, status` | btree | | Status filter |
| `idx_employees_tenant_active` | `tenant_id` | btree | `status = 'active'` | Active employees |
| `idx_employees_tenant_hire_date` | `tenant_id, hire_date` | btree | | Hire date queries |
| `idx_employees_tenant_termination` | `tenant_id, termination_date` | btree | `termination_date IS NOT NULL` | Terminated lookup |
| `idx_employees_hire_date_status` | `tenant_id, hire_date` | btree | `status != 'terminated'` | Active by hire date |
| `idx_employees_termination_date_status` | `tenant_id, termination_date` | btree | `status = 'terminated' AND termination_date IS NOT NULL` | Turnover analytics |
| `idx_employees_termination_reason` | `tenant_id, termination_reason` | btree | `status = 'terminated'` | Exit reason analytics |
| `idx_employees_ni_category` | `tenant_id, ni_category` | btree | | NI category filter |

#### employee_personal (Effective-Dated)

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_employee_personal_tenant_employee` | `tenant_id, employee_id` | btree | | Employee lookup |
| `idx_employee_personal_current` | `tenant_id, employee_id, effective_from` | btree | `effective_to IS NULL` | Current record |
| `idx_employee_personal_effective_range` | `tenant_id, employee_id, effective_from, effective_to` | btree | | Overlap validation |
| `idx_employee_personal_name` | `tenant_id, last_name, first_name` | btree | | Name search |
| `idx_employee_personal_dob` | `tenant_id, date_of_birth` | btree | `date_of_birth IS NOT NULL AND effective_to IS NULL` | DOB queries |
| `idx_employee_personal_dob_active` | `tenant_id, employee_id, date_of_birth` | btree | `effective_to IS NULL AND date_of_birth IS NOT NULL` | Workforce age analytics |

#### employee_contacts (Effective-Dated)

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_employee_contacts_tenant_employee` | `tenant_id, employee_id` | btree | | Employee contacts |
| `idx_employee_contacts_current` | `tenant_id, employee_id, contact_type` | btree | `effective_to IS NULL` | Current contact |
| `idx_employee_contacts_effective_range` | `tenant_id, employee_id, effective_from, effective_to` | btree | | Overlap validation |
| `idx_employee_contacts_primary` | `tenant_id, employee_id, contact_type` | btree | `is_primary = true AND effective_to IS NULL` | Primary contact |
| `idx_employee_contacts_value` | `tenant_id, contact_type, value` | btree | `effective_to IS NULL` | Value lookup |

#### employee_addresses (Effective-Dated)

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_employee_addresses_tenant_employee` | `tenant_id, employee_id` | btree | | Employee addresses |
| `idx_employee_addresses_current` | `tenant_id, employee_id, address_type` | btree | `effective_to IS NULL` | Current address |
| `idx_employee_addresses_effective_range` | `tenant_id, employee_id, effective_from, effective_to` | btree | | Overlap validation |
| `idx_employee_addresses_primary` | `tenant_id, employee_id, address_type` | btree | `is_primary = true AND effective_to IS NULL` | Primary address |
| `idx_employee_addresses_location` | `tenant_id, country, city` | btree | `effective_to IS NULL` | Location queries |
| `idx_employee_addresses_postal` | `tenant_id, postal_code` | btree | `effective_to IS NULL AND postal_code IS NOT NULL` | Postal code lookup |

#### employee_identifiers (Effective-Dated)

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_employee_identifiers_tenant_employee` | `tenant_id, employee_id` | btree | | Employee IDs |
| `idx_employee_identifiers_current` | `tenant_id, employee_id, identifier_type` | btree | `effective_to IS NULL` | Current ID |
| `idx_employee_identifiers_expiry` | `tenant_id, expiry_date` | btree | `effective_to IS NULL AND expiry_date IS NOT NULL` | Expiring documents |

#### employment_contracts (Effective-Dated)

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_employment_contracts_tenant_employee` | `tenant_id, employee_id` | btree | | Employee contracts |
| `idx_employment_contracts_current` | `tenant_id, employee_id, effective_from` | btree | `effective_to IS NULL` | Current contract |
| `idx_employment_contracts_effective_range` | `tenant_id, employee_id, effective_from, effective_to` | btree | | Overlap validation |
| `idx_employment_contracts_type` | `tenant_id, contract_type` | btree | `effective_to IS NULL` | Contract type filter |
| `idx_employment_contracts_employment_type` | `tenant_id, employment_type` | btree | `effective_to IS NULL` | Employment type |
| `idx_employment_contracts_probation` | `tenant_id, probation_end_date` | btree | `effective_to IS NULL AND probation_end_date IS NOT NULL` | Probation tracking |
| `idx_employment_contracts_ending` | `tenant_id, effective_to` | btree | `effective_to IS NOT NULL AND contract_type = 'fixed_term'` | Fixed-term expiry |

### Organizational Structure

#### org_units

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_org_units_tenant_code` | `tenant_id, code` | btree | | Code lookup |
| `idx_org_units_tenant_parent` | `tenant_id, parent_id` | btree | | Hierarchy traversal |
| `idx_org_units_path` | `path` | GiST | | Ltree hierarchy queries |
| `idx_org_units_tenant_path` | `tenant_id, path` | btree | | Tenant hierarchy |
| `idx_org_units_tenant_active` | `tenant_id, is_active` | btree | `is_active = true` | Active units |
| `idx_org_units_effective` | `tenant_id, effective_from, effective_to` | btree | | Temporal queries |
| `idx_org_units_tenant_level` | `tenant_id, level` | btree | | Hierarchy level filter |
| `idx_org_units_manager_position` | `manager_position_id` | btree | `manager_position_id IS NOT NULL` | Manager lookup |
| `idx_org_units_cost_center` | `cost_center_id` | btree | `cost_center_id IS NOT NULL` | Cost center link |
| `idx_org_units_parent_active` | `parent_id, is_active` | btree | | Parent active filter |

#### positions

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_positions_tenant_code` | `tenant_id, code` | btree | | Code lookup |
| `idx_positions_tenant_org_unit` | `tenant_id, org_unit_id` | btree | | Positions per org unit |
| `idx_positions_reports_to` | `reports_to_position_id` | btree | `reports_to_position_id IS NOT NULL` | Reporting chain |
| `idx_positions_tenant_active` | `tenant_id, is_active` | btree | `is_active = true` | Active positions |
| `idx_positions_tenant_manager` | `tenant_id, is_manager` | btree | `is_manager = true` | Manager positions |
| `idx_positions_tenant_grade` | `tenant_id, job_grade` | btree | `job_grade IS NOT NULL` | Grade filter |
| `idx_positions_org_unit_headcount` | `tenant_id, org_unit_id, headcount` | btree | `is_active = true` | Headcount planning |

#### position_assignments (Effective-Dated)

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_position_assignments_primary_unique` | `tenant_id, employee_id, effective_from` | UNIQUE | `is_primary = true AND effective_to IS NULL` | One primary assignment |
| `idx_position_assignments_tenant_employee` | `tenant_id, employee_id` | btree | | Employee assignments |
| `idx_position_assignments_current` | `tenant_id, employee_id` | btree | `effective_to IS NULL` | Current assignment |
| `idx_position_assignments_effective_range` | `tenant_id, employee_id, effective_from, effective_to` | btree | | Overlap validation |
| `idx_position_assignments_position` | `tenant_id, position_id` | btree | `effective_to IS NULL` | Position occupancy |
| `idx_position_assignments_org_unit` | `tenant_id, org_unit_id` | btree | `effective_to IS NULL` | Org unit headcount |
| `idx_position_assignments_org_unit_effective` | `org_unit_id, effective_to` | btree | | Org unit assignments |
| `idx_position_assignments_active_primary` | `employee_id, position_id` | btree | `effective_to IS NULL AND is_primary = true` | Analytics |
| `idx_position_assignments_primary_active` | `tenant_id, position_id, employee_id` | btree | `effective_to IS NULL AND is_primary = true` | Headcount queries |
| `idx_position_assignments_employee_fte` | `tenant_id, employee_id, fte_percentage` | btree | `effective_to IS NULL` | FTE calculations |

#### compensation_history (Effective-Dated)

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_compensation_history_tenant_employee` | `tenant_id, employee_id` | btree | | Employee compensation |
| `idx_compensation_history_current` | `tenant_id, employee_id, effective_from` | btree | `effective_to IS NULL` | Current salary |
| `idx_compensation_history_effective_range` | `tenant_id, employee_id, effective_from, effective_to` | btree | | Overlap validation |
| `idx_compensation_history_pending_approval` | `tenant_id, created_at` | btree | `approved_at IS NULL AND effective_to IS NULL` | Pending approvals |
| `idx_compensation_history_salary` | `tenant_id, base_salary` | btree | `effective_to IS NULL` | Salary analytics |
| `idx_compensation_history_currency` | `tenant_id, currency` | btree | `effective_to IS NULL` | Currency grouping |

#### reporting_lines (Effective-Dated)

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_reporting_lines_primary_unique` | `tenant_id, employee_id, effective_from` | UNIQUE | `is_primary = true AND effective_to IS NULL` | One primary manager |
| `idx_reporting_lines_tenant_employee` | `tenant_id, employee_id` | btree | | Employee's managers |
| `idx_reporting_lines_current` | `tenant_id, employee_id` | btree | `effective_to IS NULL` | Current reporting |
| `idx_reporting_lines_effective_range` | `tenant_id, employee_id, effective_from, effective_to` | btree | | Overlap validation |
| `idx_reporting_lines_manager` | `tenant_id, manager_id` | btree | `effective_to IS NULL` | Manager's reports |

### Time & Attendance

#### time_events

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_time_events_tenant_employee_time` | `tenant_id, employee_id, event_time` | btree | | Employee time events |
| `idx_time_events_tenant_type_time` | `tenant_id, event_type, event_time` | btree | | Event type queries |
| `idx_time_events_device` | `device_id` | btree | | Device tracking |
| `idx_time_events_pending_approval` | `tenant_id, event_time` | btree | `status = 'pending'` | Pending approvals |
| `idx_time_events_session` | `session_id` | btree | `session_id IS NOT NULL` | Session grouping |
| `idx_time_events_recent` | `tenant_id, event_time DESC` | btree | | Recent events |
| `idx_time_events_location` | `latitude, longitude` | btree | | Geofence validation |

#### timesheets

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_timesheets_tenant_employee_period` | `tenant_id, employee_id, period_start, period_end` | btree | | Employee timesheets |
| `idx_timesheets_tenant_status` | `tenant_id, status` | btree | | Status filter |
| `idx_timesheets_pending_approval` | `tenant_id, status` | btree | `status = 'submitted'` | Approval queue |
| `idx_timesheets_period` | `tenant_id, period_start, period_end` | btree | | Period queries |

#### schedules / shifts / shift_assignments

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_schedules_tenant_dates` | `schedules` | `tenant_id, start_date, end_date` | btree | | Date range queries |
| `idx_schedules_tenant_published` | `schedules` | `tenant_id, status` | btree | `status = 'published'` | Published schedules |
| `idx_schedules_overlap` | `schedules` | `tenant_id, org_unit_id, start_date, end_date` | btree | | Overlap detection |
| `idx_shifts_tenant_schedule` | `shifts` | `tenant_id, schedule_id` | btree | | Schedule's shifts |
| `idx_shift_assignments_tenant_employee_date` | `shift_assignments` | `tenant_id, employee_id, date` | btree | | Employee shifts |
| `idx_shift_assignments_published` | `shift_assignments` | `tenant_id, date` | btree | `status = 'published'` | Published shifts |

### Absence Management

#### leave_types

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_leave_types_tenant_code` | `tenant_id, code` | btree | | Code lookup |
| `idx_leave_types_tenant_category` | `tenant_id, category` | btree | | Category filter |
| `idx_leave_types_tenant_active` | `tenant_id` | btree | `is_active = true` | Active types |
| `idx_leave_types_tenant_paid` | `tenant_id` | btree | `is_paid = true AND is_active = true` | Paid leave types |
| `idx_leave_types_tenant_accrues` | `tenant_id` | btree | `accrues = true AND is_active = true` | Accruing types |
| `idx_leave_types_category_sick` | `tenant_id, id` | btree | `category = 'sick' AND is_active = true` | Sickness analytics |

#### leave_requests

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_leave_requests_employee` | `tenant_id, employee_id, status` | btree | | Employee requests |
| `idx_leave_requests_dates` | `tenant_id, start_date, end_date` | btree | | Date range filter |
| `idx_leave_requests_pending` | `tenant_id, status, created_at` | btree | `status = 'pending'` | Pending approval queue |
| `idx_leave_requests_approved_dates` | `tenant_id, start_date, end_date` | btree | `status = 'approved'` | Approved absences |
| `idx_leave_requests_leave_type` | `tenant_id, leave_type_id, status` | btree | | Leave type filter |
| `idx_leave_requests_sickness_trends` | `tenant_id, leave_type_id, status, start_date` | btree | `status = 'approved'` | Sickness trend analytics |
| `idx_leave_requests_employee_created` | `employee_id, created_at DESC` | btree | | Recent requests |

#### leave_balances

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_leave_balances_employee_year` | `tenant_id, employee_id, year` | btree | | Employee annual balance |
| `idx_leave_balances_leave_type` | `tenant_id, leave_type_id, year` | btree | | Type-year balance |
| `idx_leave_balances_pending` | `tenant_id, employee_id` | btree | `pending > 0` | Pending balance |
| `idx_leave_balances_available` | `tenant_id, leave_type_id, year` | btree | | Available balance |

#### leave_balance_ledger

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_leave_ledger_employee_type_date` | `tenant_id, employee_id, leave_type_id, effective_date` | btree | | Ledger lookup |
| `idx_leave_ledger_balance` | `balance_id` | btree | `balance_id IS NOT NULL` | Balance link |
| `idx_leave_ledger_reference` | `tenant_id, reference_type, reference_id` | btree | `reference_id IS NOT NULL` | Source reference |

### Recruitment

#### requisitions

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_requisitions_tenant_code` | `tenant_id, code` | btree | | Code lookup |
| `idx_requisitions_tenant_status` | `tenant_id, status` | btree | | Status filter |
| `idx_requisitions_tenant_open` | `tenant_id, status` | btree | `status NOT IN ('closed', 'cancelled')` | Open requisitions |
| `idx_requisitions_tenant_hiring_manager` | `tenant_id, hiring_manager_id` | btree | | Manager's requisitions |
| `idx_requisitions_tenant_priority_deadline` | `tenant_id, priority, target_fill_date` | btree | | Priority queue |
| `idx_requisitions_requirements` | `requirements` | GIN | | JSONB requirements search |
| `idx_requisitions_analytics_filled` | (analytics composite) | btree | | Recruitment analytics |
| `idx_requisitions_open_org_unit` | (workforce planning) | btree | | Org unit vacancies |

#### candidates

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_candidates_tenant_requisition` | `tenant_id, requisition_id` | btree | | Requisition candidates |
| `idx_candidates_tenant_email` | `tenant_id, email` | btree | | Email lookup |
| `idx_candidates_tenant_stage` | `tenant_id, current_stage` | btree | | Pipeline stage filter |
| `idx_candidates_tenant_active` | `tenant_id, requisition_id` | btree | `current_stage NOT IN ('rejected', 'withdrawn', 'hired')` | Active candidates |
| `idx_candidates_tenant_name` | `tenant_id, last_name, first_name` | btree | | Name search |
| `idx_candidates_notes` | `notes` | GIN | | JSONB notes search |
| `idx_candidates_source_analytics` | `tenant_id, source, current_stage, created_at DESC` | btree | | Source effectiveness |
| `idx_candidates_hired_updated` | `tenant_id, updated_at DESC` | btree | `current_stage = 'hired'` | Recent hires |

#### interviews

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_interviews_tenant_candidate` | `tenant_id, candidate_id` | btree | | Candidate interviews |
| `idx_interviews_tenant_interviewer_scheduled` | `tenant_id, interviewer_id, scheduled_at` | btree | `status = 'scheduled'` | Interviewer schedule |
| `idx_interviews_tenant_upcoming` | `tenant_id, scheduled_at` | btree | `status = 'scheduled'` | Upcoming interviews |

### Talent Management

#### performance_cycles

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_performance_cycles_tenant_status` | `tenant_id, status` | btree | | Status filter |
| `idx_performance_cycles_tenant_active` | `tenant_id` | btree | `status IN ('active', 'review', 'calibration')` | Active cycles |
| `idx_performance_cycles_tenant_dates` | `tenant_id, start_date, end_date` | btree | | Date range |
| `idx_performance_cycles_tenant_end_date` | `tenant_id, end_date DESC` | btree | | Recent cycles |

#### goals

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_goals_tenant_employee_cycle` | `tenant_id, employee_id, cycle_id` | btree | | Employee-cycle goals |
| `idx_goals_tenant_active` | `tenant_id, employee_id` | btree | `status IN ('active', 'completed')` | Active goals |
| `idx_goals_tenant_due_date` | `tenant_id, due_date` | btree | `status = 'active' AND due_date IS NOT NULL` | Upcoming deadlines |
| `idx_goals_parent` | `parent_goal_id` | btree | `parent_goal_id IS NOT NULL` | Cascading goals |
| `idx_goals_alignment_type` | `tenant_id, alignment_type` | btree | `parent_goal_id IS NOT NULL` | Goal alignment |

#### reviews

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_reviews_tenant_employee_cycle` | `tenant_id, employee_id, cycle_id` | btree | | Employee-cycle reviews |
| `idx_reviews_tenant_reviewer` | `tenant_id, reviewer_id` | btree | | Reviewer's reviews |
| `idx_reviews_tenant_pending` | `tenant_id, status` | btree | `status = 'pending'` | Pending reviews |
| `idx_reviews_tenant_rating` | `tenant_id, overall_rating DESC` | btree | `overall_rating IS NOT NULL` | Rating distribution |
| `idx_reviews_ratings` | `ratings` | GIN | | JSONB ratings search |
| `idx_reviews_cycle_employee` | `cycle_id, employee_id` | btree | | Cycle reviews |

### LMS (Learning Management)

#### courses

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_courses_tenant_code` | `tenant_id, code` | btree | | Code lookup |
| `idx_courses_tenant_published` | `tenant_id` | btree | `status = 'published'` | Published courses |
| `idx_courses_tenant_category` | `tenant_id, category` | btree | `category IS NOT NULL` | Category filter |
| `idx_courses_tags` | `tags` | GIN | | Tag search |
| `idx_courses_search` | `to_tsvector('english', ...)` | GIN | | Full-text search |
| `idx_courses_tenant_mandatory` | `tenant_id` | btree | `is_mandatory = true` | Mandatory courses |

#### assignments

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_assignments_tenant_employee_status` | `tenant_id, employee_id, status` | btree | | Employee assignments |
| `idx_assignments_tenant_status_due_date` | `tenant_id, status, due_date` | btree | `due_date IS NOT NULL` | Overdue tracking |
| `idx_assignments_tenant_in_progress` | `tenant_id, employee_id, last_activity_at DESC` | btree | `status = 'in_progress'` | Active learning |
| `idx_assignments_tenant_required_pending` | `tenant_id, employee_id, due_date` | btree | `assignment_type = 'required' AND status NOT IN ('completed', 'expired')` | Required pending |
| `idx_assignments_mandatory_compliance` | `tenant_id, course_id, status, due_date` | btree | `assignment_type = 'required'` | Compliance reporting |

### Case Management

#### cases

| Index Name | Columns | Type | WHERE | Purpose |
|-----------|---------|------|-------|---------|
| `idx_cases_tenant_number` | `tenant_id, case_number` | btree | | Case number lookup |
| `idx_cases_tenant_requester_status` | `tenant_id, requester_id, status` | btree | | Requester's cases |
| `idx_cases_tenant_assigned_status` | `tenant_id, assigned_to, status` | btree | `assigned_to IS NOT NULL` | Agent's cases |
| `idx_cases_tenant_team_status` | `tenant_id, assigned_team_id, status` | btree | `assigned_team_id IS NOT NULL` | Team queue |
| `idx_cases_tenant_unassigned` | `tenant_id, category_id, priority, created_at` | btree | `assigned_to IS NULL AND status NOT IN (...)` | Unassigned queue |
| `idx_cases_tenant_sla_breached` | `tenant_id, sla_status, sla_resolution_due_at` | btree | `sla_status IN ('warning', 'breached') AND ...` | SLA monitoring |
| `idx_cases_tenant_escalated` | `tenant_id, escalation_level, escalated_at` | btree | `escalation_level != 'none'` | Escalated cases |
| `idx_cases_custom_data` | `custom_data` | GIN | | JSONB custom data |
| `idx_cases_tags` | `tags` | GIN | | Tag search |
| `idx_cases_search` | `to_tsvector('english', ...)` | GIN | | Full-text search |

### Workflows

#### workflow_definitions / workflow_versions / workflow_instances / workflow_tasks

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_workflow_definitions_tenant_code` | `workflow_definitions` | `tenant_id, code` | btree | | Code lookup |
| `idx_workflow_definitions_tenant_active` | `workflow_definitions` | `tenant_id, is_active` | btree | `is_active = true` | Active workflows |
| `idx_workflow_instances_tenant_status` | `workflow_instances` | `tenant_id, status` | btree | | Instance status |
| `idx_workflow_instances_context` | `workflow_instances` | `context` | GIN | | JSONB context search |
| `idx_workflow_tasks_tenant_assigned_to_status` | `workflow_tasks` | `tenant_id, assigned_to, status` | btree | | Task assignment |
| `idx_workflow_tasks_tenant_status_due_date` | `workflow_tasks` | `tenant_id, status, due_date` | btree | | Overdue tracking |
| `idx_workflow_tasks_tenant_status_sla` | `workflow_tasks` | `tenant_id, status, sla_due_at` | btree | | SLA tracking |
| `idx_workflow_tasks_context` | `workflow_tasks` | `context` | GIN | | JSONB context search |
| `idx_workflow_tasks_condition_rules` | `workflow_tasks` | `condition_rules` | GIN | | Condition rules search |

### Documents

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_documents_tenant_type` | `documents` | `tenant_id, document_type, created_at DESC` | btree | `deleted_at IS NULL` | Document listing |
| `idx_documents_employee` | `documents` | `employee_id, created_at DESC` | btree | `deleted_at IS NULL AND employee_id IS NOT NULL` | Employee documents |
| `idx_documents_category` | `documents` | `tenant_id, category, created_at DESC` | btree | `deleted_at IS NULL` | Category filter |
| `idx_documents_validity` | `documents` | `valid_until` | btree | `valid_until IS NOT NULL AND deleted_at IS NULL` | Expiring documents |
| `idx_documents_expiry_alert` | `documents` | `valid_until, expiry_notification_sent` | btree | `valid_until IS NOT NULL AND deleted_at IS NULL` | Expiry notifications |
| `idx_documents_tags` | `documents` | `tags` | GIN | `deleted_at IS NULL` | Tag search |
| `idx_document_versions_document` | `document_versions` | `document_id, version_number DESC` | btree | | Version history |
| `idx_document_shares_token` | `document_shares` | `access_token` | btree | `is_active = true` | Share token lookup |

### Onboarding

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_onboarding_templates_default_unique` | `onboarding_templates` | `tenant_id` | UNIQUE | `is_default = true` | One default template |
| `idx_onboarding_templates_tenant_code` | `onboarding_templates` | `tenant_id, code` | btree | | Code lookup |
| `idx_onboarding_templates_applicability` | `onboarding_templates` | `applicability_rules` | GIN | | Applicability matching |
| `idx_onboarding_instances_employee` | `onboarding_instances` | `tenant_id, employee_id` | btree | | Employee onboarding |
| `idx_onboarding_instances_in_progress` | `onboarding_instances` | `tenant_id, start_date` | btree | `status = 'in_progress'` | Active onboardings |
| `idx_onboarding_instances_target_date` | `onboarding_instances` | `tenant_id, target_completion_date` | btree | `status IN ('not_started', 'in_progress')` | Deadline tracking |
| `idx_onboarding_task_completions_overdue` | `onboarding_task_completions` | `tenant_id, due_date, status` | btree | `due_date IS NOT NULL AND status NOT IN (...)` | Overdue tasks |
| `idx_onboarding_task_completions_form` | `onboarding_task_completions` | `form_submission` | GIN | `form_submission IS NOT NULL` | Form data search |

### Benefits

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_benefit_plans_tenant_category` | `benefit_plans` | `tenant_id, category, is_active` | btree | | Category listing |
| `idx_benefit_plans_effective` | `benefit_plans` | `tenant_id, effective_from, effective_to` | btree | `is_active = true` | Active plans |
| `idx_benefit_plans_flex_eligible` | `benefit_plans` | `tenant_id` | btree | `credit_cost IS NOT NULL AND is_active = true` | Flex-eligible plans |
| `idx_benefit_enrollments_employee` | `benefit_enrollments` | `employee_id, status` | btree | | Employee enrollments |
| `idx_benefit_enrollments_effective` | `benefit_enrollments` | `tenant_id, effective_from, effective_to` | btree | `status = 'active'` | Active enrollments |
| `idx_life_events_pending` | `life_events` | `tenant_id, status, created_at` | btree | `status = 'pending'` | Pending life events |

### UK Compliance

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_rtw_checks_tenant_employee` | `rtw_checks` | `tenant_id, employee_id` | btree | | Right to work |
| `idx_rtw_checks_follow_up_date` | `rtw_checks` | `tenant_id, follow_up_date` | btree | `follow_up_date IS NOT NULL` | Follow-up reminders |
| `idx_ssp_records_employee_dates` | `ssp_records` | `tenant_id, employee_id, first_day_of_sickness, last_day_of_sickness` | btree | | SSP period lookup |
| `idx_ssp_records_linked_piw` | `ssp_records` | `linked_piw_record_id` | btree | | PIW linking |
| `idx_statutory_leave_type_status` | `statutory_leave_records` | `tenant_id, leave_type, status` | btree | | Statutory leave filter |
| `idx_statutory_leave_partner` | `statutory_leave_records` | `partner_employee_id` | btree | | Shared parental leave |
| `idx_pbl_tenant_employee` | `parental_bereavement_leave` | `tenant_id, employee_id` | btree | | PBL records |
| `idx_fwr_tenant_deadline` | `flexible_working_requests` | `tenant_id, response_deadline` | btree | `status IN ('pending', 'consultation')` | Response deadlines |
| `idx_gpg_reports_tenant_year` | `gender_pay_gap_reports` | `tenant_id, reporting_year` | UNIQUE | | Annual GPG reports |
| `idx_dbs_checks_renewal_due` | `dbs_checks` | `tenant_id, renewal_due_date` | btree | `renewal_due_date IS NOT NULL AND status IN (...)` | DBS renewal tracking |
| `idx_nmw_compliance_checks_non_compliant` | `nmw_compliance_checks` | `tenant_id, check_date` | btree | `compliant = false` | NMW violations |
| `idx_pension_enrolments_re_enrolment` | `pension_enrolments` | `tenant_id, re_enrolment_date` | btree | `status = 'opted_out' AND re_enrolment_date IS NOT NULL` | Auto re-enrolment |
| `idx_ir35_assessments_tenant_dispute` | `ir35_assessments` | `tenant_id, dispute_status` | btree | `dispute_status != 'none'` | IR35 disputes |
| `idx_employee_warnings_tenant_expiry_active` | `employee_warnings` | `tenant_id, expiry_date` | btree | `status = 'active'` | Active warnings |
| `idx_disciplinary_cases_pending_appeal` | `disciplinary_cases` | `tenant_id, right_to_appeal_expires` | btree | Complex WHERE | Appeal deadlines |
| `idx_whistleblowing_cases_pida` | `whistleblowing_cases` | `tenant_id, pida_protected` | btree | `pida_protected = true` | PIDA-protected cases |

### GDPR & Data Protection

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_dsar_requests_deadline` | `dsar_requests` | `tenant_id, deadline_date` | btree | `status NOT IN ('completed', 'rejected')` | DSAR deadlines |
| `idx_dsar_requests_overdue` | `dsar_requests` | `tenant_id, deadline_date` | btree | Complex WHERE | Overdue DSARs |
| `idx_erasure_requests_overdue` | `erasure_requests` | `tenant_id, deadline_date` | btree | `status IN ('received', ...)` | Overdue erasures |
| `idx_consent_records_expires_at` | `consent_records` | `tenant_id, expires_at` | btree | `expires_at IS NOT NULL AND status = 'granted'` | Expiring consent |
| `idx_consent_purposes_tenant_active` | `consent_purposes` | `tenant_id, is_active` | btree | `is_active = true` | Active purposes |
| `idx_data_breaches_ico_overdue` | `data_breaches` | `ico_deadline` | btree | `ico_notified = false AND status NOT IN ('closed')` | ICO reporting deadline |
| `idx_data_breaches_ico_pending` | `data_breaches` | `ico_deadline` | btree | Complex WHERE | Pending ICO notification |
| `idx_retention_policies_auto_purge` | `retention_policies` | (auto purge) | btree | | Auto-purge scheduling |
| `idx_dpias_review_date` | `dpias` | `tenant_id, review_date` | btree | `review_date IS NOT NULL` | DPIA reviews due |
| `idx_processing_activities_dpia` | `processing_activities` | `tenant_id, dpia_required` | btree | `dpia_required = true` | DPIA-required activities |

### Analytics & Reporting

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_analytics_aggregates_tenant_metric` | `analytics_aggregates` | `tenant_id, metric_type, granularity, period_start DESC` | btree | | Metric queries |
| `idx_analytics_aggregates_staleness_check` | `analytics_aggregates` | `tenant_id, metric_type, granularity, period_start` | btree | | Staleness detection |
| `idx_analytics_aggregates_cleanup` | `analytics_aggregates` | `created_at` | btree | `granularity != 'year'` | Old data cleanup |
| `idx_analytics_aggregates_dimensions` | `analytics_aggregates` | `dimensions` | GIN | | Dimension filtering |
| `idx_analytics_headcount_tenant_date_org` | `analytics_headcount` | `tenant_id, snapshot_date DESC, org_unit_id` | btree | | Headcount snapshots |
| `idx_analytics_turnover_tenant_type_period` | `analytics_turnover` | `tenant_id, period_type, period_start, period_end` | btree | | Turnover analytics |
| `idx_report_definitions_owner_public` | `report_definitions` | `tenant_id` (owner/public) | btree | | Report listing |
| `idx_rd_scheduled` | `report_definitions` | `is_scheduled, next_scheduled_run` | btree | `is_scheduled = true` | Scheduler lookup |
| `idx_analytics_dashboards_default` | `analytics_dashboards` | `tenant_id` | btree | `is_default = true` | Default dashboard |
| `idx_analytics_widgets_tenant_dashboard` | `analytics_widgets` | `tenant_id, dashboard_id` | btree | | Dashboard widgets |

#### Materialized View Indexes

| Index Name | View | Columns | Type | Purpose |
|-----------|------|---------|------|---------|
| `idx_mv_dashboard_employee_stats_tenant` | `mv_dashboard_employee_stats` | `tenant_id` | UNIQUE | Fast dashboard refresh |
| `idx_mv_dashboard_leave_stats_tenant` | `mv_dashboard_leave_stats` | `tenant_id` | UNIQUE | Fast dashboard refresh |
| `idx_mv_dashboard_case_stats_tenant` | `mv_dashboard_case_stats` | `tenant_id` | UNIQUE | Fast dashboard refresh |
| `idx_mv_dashboard_onboarding_stats_tenant` | `mv_dashboard_onboarding_stats` | `tenant_id` | UNIQUE | Fast dashboard refresh |

### Payroll

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_payroll_runs_tenant_period_type` | `payroll_runs` | `tenant_id, pay_period_start, pay_period_end, run_type` | UNIQUE | `status != 'draft'` | Prevent duplicate runs |
| `idx_payroll_runs_tenant_status` | `payroll_runs` | `tenant_id, status` | btree | | Status filter |
| `idx_payroll_lines_run` | `payroll_lines` | `payroll_run_id` | btree | | Run's lines |
| `idx_payslips_employee_period` | `payslips` | `tenant_id, employee_id, pay_period_id` | UNIQUE | `pay_period_id IS NOT NULL` | One payslip per period |
| `idx_payroll_rti_submissions_tenant_type_year` | `payroll_rti_submissions` | `tenant_id, submission_type, tax_year` | btree | | RTI lookup |
| `idx_period_locks_tenant_active` | `payroll_period_locks` | `tenant_id` | btree | `unlocked_at IS NULL` | Active period locks |

### Client Portal

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_portal_users_email` | `portal_users` | `email` | btree | | Email login |
| `idx_portal_users_tenant_active` | `portal_users` | `tenant_id, is_active` | btree | `is_active = true` | Active users |
| `idx_portal_sessions_token_hash` | `portal_sessions` | `token_hash` | btree | | Session auth |
| `idx_portal_tickets_tenant_status` | `portal_tickets` | `tenant_id, status` | btree | | Ticket listing |
| `idx_portal_tickets_sla_due_at` | `portal_tickets` | `sla_due_at` | btree | `sla_due_at IS NOT NULL` | SLA tracking |
| `idx_portal_documents_tenant_published` | `portal_documents` | `tenant_id, is_published` | btree | `is_published = true` | Published docs |
| `idx_portal_news_published` | `portal_news` | `is_published, published_at DESC` | btree | `is_published = true` | Published news |
| `idx_portal_news_tags` | `portal_news` | `tags` | GIN | | Tag search |
| `idx_portal_invoices_tenant_status` | `portal_invoices` | `tenant_id, status` | btree | | Invoice listing |
| `idx_portal_licenses_tenant_status` | `portal_licenses` | `tenant_id, status` | btree | | License status |

### Webhooks & Integrations

| Index Name | Table | Columns | Type | WHERE | Purpose |
|-----------|-------|---------|------|-------|---------|
| `idx_webhook_subscriptions_tenant_enabled` | `webhook_subscriptions` | `tenant_id, is_active` | btree | `is_active = true` | Active subscriptions |
| `idx_webhook_subscriptions_event_types` | `webhook_subscriptions` | `event_types` | GIN | | Event type matching |
| `idx_webhook_deliveries_pending_retry` | `webhook_deliveries` | `next_retry_at` | btree | `status = 'failed' AND next_retry_at IS NOT NULL` | Retry processing |
| `idx_email_delivery_log_pending_retry` | `email_delivery_log` | `next_retry_at` | btree | `status = 'failed' AND next_retry_at IS NOT NULL` | Email retry |
| `idx_email_delivery_log_bounced` | `email_delivery_log` | `tenant_id, bounced_at DESC` | btree | `status = 'bounced'` | Bounce tracking |
| `idx_api_keys_key_hash` | `api_keys` | `key_hash` | UNIQUE | | API key auth |
| `idx_api_keys_tenant_revoked` | `api_keys` | `tenant_id` | btree | `revoked_at IS NULL` | Active API keys |

---

## Composite Indexes

Composite indexes (multi-column) are used extensively. Key patterns:

### Tenant + Business Key (Lookup Pattern)
```
idx_employees_tenant_number       ON employees(tenant_id, employee_number)
idx_cases_tenant_number           ON cases(tenant_id, case_number)
idx_requisitions_tenant_code      ON requisitions(tenant_id, code)
idx_courses_tenant_code           ON courses(tenant_id, code)
```
These support fast lookups by business identifiers within a tenant scope.

### Tenant + FK + Status (Filtered Listing Pattern)
```
idx_cases_tenant_assigned_status  ON cases(tenant_id, assigned_to, status)
idx_leave_requests_employee       ON leave_requests(tenant_id, employee_id, status)
idx_assignments_tenant_employee_status ON assignments(tenant_id, employee_id, status)
```
These support paginated listings filtered by ownership and status.

### Tenant + Date Range (Temporal Pattern)
```
idx_leave_requests_dates          ON leave_requests(tenant_id, start_date, end_date)
idx_schedules_tenant_dates        ON schedules(tenant_id, start_date, end_date)
idx_benefit_plans_effective       ON benefit_plans(tenant_id, effective_from, effective_to)
```
These support date-range overlap queries for scheduling and effective dating.

### Effective Dating (Overlap Validation Pattern)
```
idx_position_assignments_effective_range  ON position_assignments(tenant_id, employee_id, effective_from, effective_to)
idx_compensation_history_effective_range  ON compensation_history(tenant_id, employee_id, effective_from, effective_to)
idx_employment_contracts_effective_range  ON employment_contracts(tenant_id, employee_id, effective_from, effective_to)
```
These support the `validateNoOverlap()` utility used across all effective-dated tables.

### Idempotency (4-Column Lookup)
```
idx_idempotency_keys_lookup ON idempotency_keys(tenant_id, user_id, route_key, idempotency_key)
```
This supports the deduplication check on every mutating API request.

### Analytics (Multi-Dimension)
```
idx_analytics_aggregates_tenant_metric  ON analytics_aggregates(tenant_id, metric_type, granularity, period_start DESC)
idx_analytics_headcount_tenant_date_org ON analytics_headcount(tenant_id, snapshot_date DESC, org_unit_id)
idx_analytics_turnover_tenant_type_period ON analytics_turnover(tenant_id, period_type, period_start, period_end)
```
These support the dashboard aggregate queries with multiple filter dimensions.

---

## Partial Indexes

Partial indexes use `WHERE` clauses to index only a subset of rows, reducing index size and improving both read and write performance. The codebase makes heavy use of this pattern (~260 partial indexes).

### Active Records Only
```sql
-- Only index active employees (skip terminated)
CREATE INDEX idx_employees_tenant_active ON app.employees(tenant_id) WHERE status = 'active';

-- Only index active positions
CREATE INDEX idx_positions_tenant_active ON app.positions(tenant_id, is_active) WHERE is_active = true;

-- Only index active org units
CREATE INDEX idx_org_units_tenant_active ON app.org_units(tenant_id, is_active) WHERE is_active = true;
```

### Current Records (Effective Dating)
```sql
-- Current record (no end date) for each employee
CREATE INDEX idx_position_assignments_current ON app.position_assignments(tenant_id, employee_id) WHERE effective_to IS NULL;

-- Current salary
CREATE INDEX idx_compensation_history_current ON app.compensation_history(tenant_id, employee_id, effective_from) WHERE effective_to IS NULL;

-- Current contract
CREATE INDEX idx_employment_contracts_current ON app.employment_contracts(tenant_id, employee_id, effective_from) WHERE effective_to IS NULL;
```

### Pending Approval Queues
```sql
-- Pending leave requests
CREATE INDEX idx_leave_requests_pending ON app.leave_requests(tenant_id, status, created_at) WHERE status = 'pending';

-- Pending time events
CREATE INDEX idx_time_events_pending_approval ON app.time_events(tenant_id, event_time) WHERE status = 'pending';

-- Pending case appeals
CREATE INDEX idx_case_appeals_status ON app.case_appeals(status) WHERE status = 'pending';
```

### Compliance Deadline Tracking
```sql
-- Overdue DSARs
CREATE INDEX idx_dsar_requests_overdue ON app.dsar_requests(tenant_id, deadline_date)
    WHERE status NOT IN ('completed', 'rejected') AND extended_deadline_date IS NULL;

-- ICO notification deadline
CREATE INDEX idx_data_breaches_ico_overdue ON app.data_breaches(ico_deadline)
    WHERE ico_notified = false AND status NOT IN ('closed');

-- NMW non-compliant checks
CREATE INDEX idx_nmw_compliance_checks_non_compliant ON app.nmw_compliance_checks(tenant_id, check_date)
    WHERE compliant = false;
```

### Unprocessed Queue Pattern
```sql
-- Outbox: unprocessed events for the poller
CREATE INDEX idx_domain_outbox_unprocessed ON app.domain_outbox(created_at) WHERE processed_at IS NULL;

-- Outbox: failed events for retry
CREATE INDEX idx_domain_outbox_retry ON app.domain_outbox(next_retry_at) WHERE processed_at IS NULL AND next_retry_at IS NOT NULL;

-- Export jobs pending
CREATE INDEX idx_exports_status ON app.exports(status, created_at) WHERE status IN ('pending', 'processing');
```

---

## GIN Indexes

GIN (Generalized Inverted Index) is used for JSONB, array, and full-text search columns:

### JSONB Data
```sql
idx_tenants_settings              ON app.tenants USING gin(settings)
idx_roles_permissions             ON app.roles USING gin(permissions)
idx_role_assignments_constraints  ON app.role_assignments USING gin(constraints)
idx_cases_custom_data             ON app.cases USING gin(custom_data)
idx_cases_tags                    ON app.cases USING gin(tags)
idx_candidates_notes              ON app.candidates USING gin(notes)
idx_workflow_instances_context    ON app.workflow_instances USING gin(context)
idx_workflow_tasks_context        ON app.workflow_tasks USING gin(context)
idx_reviews_ratings               ON app.reviews USING gin(ratings)
idx_onboarding_templates_applicability ON app.onboarding_templates USING gin(applicability_rules)
idx_certificates_data             ON app.certificates USING gin(certificate_data)
idx_analytics_aggregates_dimensions ON app.analytics_aggregates USING gin(dimensions)
```

### Full-Text Search
```sql
idx_courses_search        ON app.courses USING gin(to_tsvector('english', COALESCE(name, '') || ' ' || ...))
idx_learning_paths_search ON app.learning_paths USING gin(to_tsvector('english', COALESCE(name, '') || ' ' || ...))
idx_cases_search          ON app.cases USING gin(to_tsvector('english', subject || ' ' || COALESCE(description, '')))
idx_processing_activities_search ON app.processing_activities USING gin(to_tsvector('english', coalesce(name, '') || ' ' || ...))
```

### Array Columns
```sql
idx_case_comments_mentioned   ON app.case_comments USING gin(mentioned_user_ids)
idx_learning_path_courses_prerequisites ON app.learning_path_courses USING gin(prerequisite_course_ids)
idx_portal_news_tags          ON app.portal_news USING gin(tags)
idx_documents_tags            ON app.documents USING gin(tags)
idx_webhook_subscriptions_event_types ON app.webhook_subscriptions USING gin(event_types)
```

---

## GiST Indexes

GiST (Generalized Search Tree) indexes are used for hierarchy path queries:

```sql
-- Org unit ltree hierarchy
idx_org_units_path            ON app.org_units USING gist(path)

-- Case category ltree hierarchy
idx_case_categories_path      ON app.case_categories USING gist(path)
```

These support operators like `@>` (ancestor of), `<@` (descendant of), and `~` (regex match) on `ltree` columns for hierarchical queries.

---

## Performance-Specific Indexes

Migration `0174_performance_indexes.sql` and subsequent migrations added targeted indexes for identified performance bottlenecks:

| Index Name | Table | Columns | WHERE | Purpose |
|-----------|-------|---------|-------|---------|
| `idx_org_units_parent_active` | `org_units` | `parent_id, is_active` | | Org tree traversal |
| `idx_position_assignments_org_unit_effective` | `position_assignments` | `org_unit_id, effective_to` | | Org unit staffing |
| `idx_leave_requests_employee_created` | `leave_requests` | `employee_id, created_at DESC` | | Recent requests |
| `idx_performance_cycles_tenant_end_date` | `performance_cycles` | `tenant_id, end_date DESC` | | Recent cycles |
| `idx_reviews_cycle_employee` | `reviews` | `cycle_id, employee_id` | | Cycle review lookup |
| `idx_candidates_requisition_created` | `candidates` | `requisition_id, created_at DESC` | | Pipeline order |
| `idx_position_assignments_active_primary` | `position_assignments` | `employee_id, position_id` | `effective_to IS NULL AND is_primary = true` | Sickness analytics |
| `idx_leave_requests_sickness_trends` | `leave_requests` | `tenant_id, leave_type_id, status, start_date` | `status = 'approved'` | Sickness trends |

---

## Missing Index Recommendations

Based on analysis of the migration files, the following potential gaps have been identified:

### 1. Foreign Key Columns Without Indexes

Several foreign key columns that may benefit from an index for JOIN performance:

| Table | Column | Reason |
|-------|--------|--------|
| `case_comments` | `case_id` (as standalone) | The composite `(case_id, created_at)` exists but a standalone FK index may help JOIN-heavy queries |
| `timesheet_lines` | `timesheet_id` (as standalone) | Only composite `(timesheet_id, date)` exists |
| `workflow_sla_events` | `instance_id` | No standalone instance_id index found |

### 2. Missing Tenant-Scoped Indexes

Some tables have indexes without `tenant_id` as the leading column, which may reduce RLS filtering efficiency:

| Table | Index | Suggestion |
|-------|-------|------------|
| `employee_competencies` | `idx_employee_competencies_employee ON (employee_id)` | Add `tenant_id` prefix |
| `job_competencies` | `idx_job_competencies_job ON (job_id)` | Add `tenant_id` prefix |
| `position_competencies` | `idx_position_competencies_position ON (position_id)` | Add `tenant_id` prefix |

### 3. Potential Covering Index Opportunities

For high-frequency read queries, covering indexes (INCLUDE clause) could eliminate table lookups:

- **Employee directory**: A covering index on `employees` including `employee_number, status` would benefit the frequently-accessed employee listing endpoint.
- **Leave balance check**: A covering index on `leave_balances` including `entitled, taken, pending` would benefit the balance check that runs on every leave request.

### 4. Text Search Coverage

The following tables with user-searchable text content lack full-text search indexes:

| Table | Candidate Columns |
|-------|------------------|
| `announcements` | `title, content` |
| `job_board_postings` | `title, description` |
| `portal_tickets` | `subject, description` |

---

## Index Maintenance Considerations

### Write Amplification

With ~793 indexes across the schema, write-heavy operations (bulk imports, payroll runs) will incur write amplification. Mitigations:

- **Partial indexes** reduce the number of rows indexed (260+ use WHERE clauses)
- **Batch operations** should be wrapped in transactions to amortize index maintenance
- **The outbox poller** uses the highly selective `idx_domain_outbox_unprocessed` partial index

### VACUUM and Bloat

High-update tables (e.g., `domain_outbox`, `time_events`, `notifications`) will generate dead tuples. Ensure:

- `autovacuum` is properly tuned for these tables
- Monitor index bloat with `pg_stat_user_indexes`
- Consider `REINDEX` during maintenance windows for heavily-updated indexes

### Monitoring Queries

```sql
-- Find unused indexes (potential candidates for removal)
SELECT schemaname, relname, indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE schemaname = 'app' AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Find index bloat
SELECT schemaname, tablename, indexname,
       pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'app'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;

-- Verify RLS filter pushdown (should show Index Scan, not Seq Scan)
EXPLAIN ANALYZE SELECT * FROM app.employees WHERE tenant_id = '...' AND status = 'active';
```
