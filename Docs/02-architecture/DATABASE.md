# Database Guide

*Last updated: 2026-03-17*

## Overview

- **Engine**: PostgreSQL 16
- **Schema**: All tables in `app` schema (not `public`)
- **Migrations**: Sequential SQL files in `migrations/` directory (120+ migrations)
- **Query Layer**: postgres.js tagged templates (NOT Drizzle ORM, NOT raw pg)
- **RLS**: Row-Level Security enforced on all tenant-owned tables
- **Indexes**: ~793 indexes across ~200 tables (see [Database Index Reference](./database-indexes.md))

## Database Roles

| Role | Type | RLS | Purpose |
|------|------|-----|---------|
| `hris` | Superuser | Bypasses | Migrations, admin operations |
| `hris_app` | Application | `NOBYPASSRLS` | Runtime queries, tests |

The application always connects as `hris_app` so RLS policies are enforced. Tests also use `hris_app` to ensure RLS is tested.

## Migration Conventions

### File Naming

```
NNNN_description.sql
```

- `NNNN`: 4-digit sequence number (0001, 0002, ...)
- `description`: snake_case description

### Migration Template

```sql
-- Migration: NNNN_description
-- Created: YYYY-MM-DD
-- Description: What this migration does

-- =============================================================================
-- UP Migration
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.table_name (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    -- business columns...
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY tenant_isolation ON app.table_name
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.table_name
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_table_name_tenant_id ON app.table_name(tenant_id);

-- Updated-at trigger
CREATE TRIGGER update_table_name_updated_at
    BEFORE UPDATE ON app.table_name
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- DOWN Migration (commented out, run manually if needed)
-- =============================================================================
-- DROP TRIGGER IF EXISTS update_table_name_updated_at ON app.table_name;
-- DROP TABLE IF EXISTS app.table_name;
```

### Running Migrations

```bash
bun run migrate:up              # Run pending migrations
bun run migrate:down            # Rollback last migration
bun run migrate:create <name>   # Create new migration file
```

## Table Categories

### Core Tables

| Table | Description | RLS |
|-------|-------------|:---:|
| `app.tenants` | Tenant organizations | No (root-level) |
| `app.users` | User accounts | No (global) |
| `app.sessions` | User sessions | No |
| `app.user_tenants` | User-tenant mapping | No |

### RBAC Tables

| Table | Description | RLS |
|-------|-------------|:---:|
| `app.permissions` | Permission definitions | No (global catalog) |
| `app.roles` | Role definitions | Yes |
| `app.role_permissions` | Role-permission mapping | Yes |
| `app.role_assignments` | User-role assignments | Yes |

### Infrastructure Tables

| Table | Description | RLS |
|-------|-------------|:---:|
| `app.domain_outbox` | Event outbox for messaging | Yes |
| `app.idempotency_keys` | Request deduplication | Yes |
| `app.audit_log` | Audit trail (partitioned) | No (contains tenant_id) |

### Core HR Tables

| Table | Description |
|-------|-------------|
| `app.employees` | Employee records |
| `app.employee_personal` | Personal information |
| `app.employee_contacts` | Contact details |
| `app.employee_addresses` | Addresses (effective-dated) |
| `app.employee_identifiers` | ID documents (encrypted) |
| `app.org_units` | Organizational structure |
| `app.positions` | Job positions |
| `app.cost_centers` | Cost centers |
| `app.locations` | Work locations |
| `app.employment_contracts` | Contracts |
| `app.position_assignments` | Position assignments (effective-dated) |
| `app.reporting_lines` | Reporting relationships (effective-dated) |
| `app.compensation_history` | Compensation records (effective-dated) |

### Module Tables

Each module has its own set of tables. All are tenant-scoped with RLS:

- **Time**: `time_events`, `schedules`, `shifts`, `timesheets`, `timesheet_lines`
- **Absence**: `leave_types`, `leave_policies`, `leave_requests`, `leave_balances`
- **Talent**: `goals`, `review_cycles`, `reviews`, `competencies`
- **LMS**: `courses`, `enrollments`
- **Cases**: `cases`, `case_comments`
- **Onboarding**: `onboarding_checklists`, `onboarding_instances`, `onboarding_tasks`
- **Benefits**: `benefit_carriers`, `benefit_plans`, `benefit_enrollments`, `dependents`, `life_events`
- **Documents**: `documents`, `document_versions`
- **Succession**: `succession_plans`, `succession_candidates`
- **Analytics**: `analytics_snapshots`
- **Competencies**: `competencies`, `job_competencies`, `employee_competency_assessments`
- **Recruitment**: `job_requisitions`, `candidates`
- **Workflows**: `workflow_definitions`, `workflow_instances`, `workflow_steps`

## Required Table Patterns

### All Tables

Every table must have:
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
created_at timestamptz NOT NULL DEFAULT now()
updated_at timestamptz NOT NULL DEFAULT now()
```

### Tenant-Owned Tables

Must additionally have:
```sql
tenant_id uuid NOT NULL REFERENCES app.tenants(id)
```
Plus RLS enabled with isolation policies and a `tenant_id` index.

### Effective-Dated Tables

Tables tracking time-versioned data:
```sql
effective_from date NOT NULL
effective_to date  -- NULL = currently effective
```

Rules:
- No overlapping records per employee per dimension
- Validate overlaps under transaction to prevent race conditions
- Use `validateNoOverlap()` utility

### Soft-Delete Tables

```sql
deleted_at timestamptz  -- NULL = active
```

### Audit Log

Special rules:
- Partitioned by month for performance
- Append-only: no UPDATE or DELETE operations
- Contains `tenant_id` but no RLS (for admin queries)

## System Context

For operations requiring cross-tenant access:

```sql
-- Enable system context (bypasses RLS)
SELECT app.enable_system_context();

-- Your queries here...

-- Always disable when done
SELECT app.disable_system_context();
```

In TypeScript tests:
```typescript
await withSystemContext(db, async (tx) => {
  // RLS bypassed within this callback
  const allEmployees = await tx`SELECT * FROM employees`;
});
```

## Best Practices

1. **One concern per migration** - Each migration does one thing
2. **Idempotent** - Use `IF NOT EXISTS` and `IF EXISTS`
3. **No data loss** - Use ALTER TABLE, not DROP/CREATE
4. **Index foreign keys** - Always index FK columns
5. **Test rollbacks** - Verify DOWN migrations work
6. **RLS is mandatory** - Every tenant table must have RLS
7. **Secrets never in migrations** - Use environment variables
8. **Concurrent indexes** - Use `CREATE INDEX CONCURRENTLY` for large tables

## Related Documentation

- [Migration Conventions](../../migrations/README.md) — Migration file format and ordering
- [Worker System](WORKER_SYSTEM.md) — Background processing with Redis Streams
- [Security Patterns](../02-architecture/security-patterns.md) — RLS and authentication details
- [Effective Dating](../02-architecture/state-machines.md) — Time-versioned record patterns

---

## Related Documents

- [Architecture Overview](ARCHITECTURE.md) — System architecture and data flow diagrams
- [Worker System](WORKER_SYSTEM.md) — Outbox table processing and domain events
- [Security Patterns](../02-architecture/security-patterns.md) — Row-Level Security enforcement details
- [State Machines](../02-architecture/state-machines.md) — Entity lifecycle states stored in the database
- [Getting Started](../05-development/GETTING_STARTED.md) — Running migrations and seeding data
- [Infrastructure Audit](../15-archive/audit/infrastructure-audit.md) — Database infrastructure findings
- [Performance Audit](../15-archive/audit/PERFORMANCE_AUDIT.md) — Query performance findings and recommendations
