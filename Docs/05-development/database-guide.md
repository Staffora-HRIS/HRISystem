# Database Guide

Last updated: 2026-03-28

This guide covers PostgreSQL database patterns, migrations, and query conventions used in the Staffora HRIS platform.

---

## Overview

| Component | Details |
|-----------|---------|
| **Database** | PostgreSQL 16 |
| **Schema** | All tables in `app` schema (not `public`) |
| **Query library** | postgres.js (tagged templates) |
| **Connection pooler** | PgBouncer (transaction mode) |
| **ORM** | None -- raw SQL via tagged templates |
| **Migrations** | Sequential numbered SQL files |

---

## Two Database Roles

The platform uses two PostgreSQL roles with distinct privileges:

### `hris` -- Superuser / Admin

- Used for: migrations, seeds, bootstrap scripts, admin operations
- Has `BYPASSRLS` -- can see all rows regardless of RLS policies
- Connection URL: `DATABASE_URL`

### `hris_app` -- Application Role

- Used for: runtime queries, API requests, background workers, tests
- Has `NOBYPASSRLS` -- RLS policies are enforced
- Connection URL: `DATABASE_APP_URL`

This separation ensures that RLS is always enforced during normal operation and in tests. The `hris_app` role cannot bypass tenant isolation even if code accidentally omits the tenant context.

---

## Database Client (`DatabaseClient`)

Defined in `packages/api/src/plugins/db.ts`, the `DatabaseClient` wraps postgres.js with tenant-aware transaction support.

### Configuration

```typescript
this.sql = postgres({
  host: config.host,
  port: config.port,
  database: config.database,
  username: config.username,
  password: config.password,
  max: config.maxConnections,    // 20 direct, 10 via PgBouncer
  idle_timeout: config.idleTimeout,
  connect_timeout: config.connectTimeout,

  // Use the app schema by default
  connection: {
    search_path: "app,public",
  },

  // Auto-convert snake_case <-> camelCase
  transform: {
    column: {
      to: postgres.toCamel,      // DB -> JS: employee_id -> employeeId
      from: postgres.fromCamel,  // JS -> DB: employeeId -> employee_id
    },
  },

  // Disable prepared statements when behind PgBouncer
  prepare: config.prepare,  // false when PgBouncer detected
});
```

### Search Path

The `search_path` is set to `app,public`, so queries can use bare table names:

```sql
-- These are equivalent:
SELECT * FROM employees;        -- uses search_path
SELECT * FROM app.employees;    -- explicit schema
```

### camelCase Transform

Column names are automatically transformed:

| Database (snake_case) | TypeScript (camelCase) |
|-----------------------|-----------------------|
| `employee_id` | `employeeId` |
| `created_at` | `createdAt` |
| `is_active` | `isActive` |
| `leave_type_id` | `leaveTypeId` |

You write SQL with `snake_case` column names but receive `camelCase` properties in TypeScript results.

---

## postgres.js Tagged Templates

All queries use tagged template literals -- never string concatenation. This provides automatic parameterisation and SQL injection protection.

### Basic Queries

```typescript
// Simple select with parameter
const rows = await tx`
  SELECT * FROM employees WHERE id = ${id}::uuid
`;

// Insert with RETURNING
const [row] = await tx`
  INSERT INTO leave_types (id, tenant_id, code, name, is_active)
  VALUES (${id}::uuid, ${tenantId}::uuid, ${code}, ${name}, true)
  RETURNING *
`;

// Update
const [updated] = await tx`
  UPDATE leave_types SET
    name = ${newName},
    updated_at = now()
  WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
  RETURNING *
`;

// Delete (soft delete pattern)
await tx`
  UPDATE employees SET
    status = 'terminated',
    terminated_at = now()
  WHERE id = ${id}::uuid
`;
```

### Conditional Fragments

Use `tx\`...\`` for optional WHERE clauses:

```typescript
const rows = await tx`
  SELECT * FROM leave_requests
  WHERE tenant_id = ${ctx.tenantId}::uuid
  ${filters.status ? tx`AND status = ${filters.status}` : tx``}
  ${filters.employeeId ? tx`AND employee_id = ${filters.employeeId}::uuid` : tx``}
  ${filters.from ? tx`AND start_date >= ${filters.from}` : tx``}
  ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
  ORDER BY created_at DESC, id DESC
  LIMIT ${limit + 1}
`;
```

### COALESCE for Partial Updates

```typescript
const [row] = await tx`
  UPDATE leave_types SET
    code = COALESCE(${data.code ?? null}, code),
    name = COALESCE(${data.name ?? null}, name),
    description = COALESCE(${data.description ?? null}, description),
    updated_at = now()
  WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
  RETURNING *
`;
```

---

## Transaction Handling

### Tenant-Scoped Transactions

The primary method for data access. Sets RLS context automatically via `app.set_tenant_context()`:

```typescript
const result = await db.withTransaction(ctx, async (tx) => {
  // ctx = { tenantId: string, userId?: string }
  // RLS context is set before your callback runs

  const [emp] = await tx`
    INSERT INTO employees (id, tenant_id, ...) VALUES (...)
    RETURNING *
  `;

  // Outbox event in same transaction
  await tx`
    INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
    VALUES (${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid,
            'employee', ${emp.id}, 'hr.employee.created',
            ${JSON.stringify({ employee: emp })}::jsonb)
  `;

  return emp;
});
```

### Transaction Options

```typescript
await db.withTransaction(ctx, callback, {
  isolationLevel: "serializable",  // "read committed" | "repeatable read" | "serializable"
  accessMode: "read only",         // "read write" | "read only"
});
```

### System Context (Bypass RLS)

For migrations, seeds, and administrative operations that need to see all tenants:

```typescript
const tenants = await db.withSystemContext(async (tx) => {
  // Enables app.is_system_context() => true
  // Bypasses RLS tenant_isolation policies
  return tx`SELECT * FROM tenants`;
});
```

The system context:
1. Sets `app.current_tenant` and `app.current_user` to nil UUIDs
2. Calls `app.enable_system_context()`
3. Runs your callback
4. Calls `app.disable_system_context()` (even on error)

---

## Row-Level Security (RLS)

Every tenant-owned table has RLS enabled with two policies:

### Standard RLS Pattern

```sql
-- Enable RLS on the table
ALTER TABLE app.leave_types ENABLE ROW LEVEL SECURITY;

-- SELECT/UPDATE/DELETE policy
CREATE POLICY tenant_isolation ON app.leave_types
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- INSERT policy
CREATE POLICY tenant_isolation_insert ON app.leave_types
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );
```

### How It Works

1. When `db.withTransaction(ctx, ...)` is called, it executes:
   ```sql
   SELECT app.set_tenant_context('<tenantId>'::uuid, '<userId>'::uuid);
   ```
2. This sets `app.current_tenant` as a session-level configuration parameter
3. RLS policies check `current_setting('app.current_tenant', true)::uuid`
4. Rows from other tenants are invisible to all queries
5. The `hris_app` role has `NOBYPASSRLS`, so there is no escape hatch

### System Context Bypass

The `app.is_system_context()` function returns `true` only when `app.enable_system_context()` has been called. This allows administrative operations to see all data.

---

## Migration Conventions

Migrations live in the `migrations/` directory and are numbered with 4-digit zero-padded prefixes.

### File Naming

```
migrations/
  0001_initial_schema.sql
  0002_tenants.sql
  0003_users.sql
  ...
  0228_p45_p60_documents.sql
  0229_timesheet_approval_hierarchies.sql
  0230_fix_tenant_usage_stats_rls.sql
  ...
  README.md
```

**Rules:**
- Use 4-digit padding: `0182_`, not `182_`
- Check the highest existing number before creating a new one
- Use descriptive names: `0229_timesheet_approval_hierarchies.sql`
- All tables go in the `app` schema

### Migration Structure

Every migration follows this template:

```sql
-- Migration: 0229_timesheet_approval_hierarchies
-- Created: 2026-03-25
-- Description: Create timesheet_approval_hierarchies table for
--              configurable multi-level approval chains.
-- Depends on: 0002_tenants, 0014_org_units

-- =============================================================================
-- UP Migration
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.timesheet_approval_hierarchies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    name varchar(255) NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tah_tenant
    ON app.timesheet_approval_hierarchies(tenant_id);

-- RLS
ALTER TABLE app.timesheet_approval_hierarchies ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.timesheet_approval_hierarchies
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.timesheet_approval_hierarchies
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Updated at trigger
CREATE TRIGGER update_tah_updated_at
    BEFORE UPDATE ON app.timesheet_approval_hierarchies
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- DROP TABLE IF EXISTS app.timesheet_approval_hierarchies;
```

### Migration Checklist

For every new table:

1. Use `app.` schema prefix
2. Include `tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE`
3. Include `created_at timestamptz NOT NULL DEFAULT now()`
4. Include `updated_at timestamptz NOT NULL DEFAULT now()`
5. Enable RLS: `ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY`
6. Create `tenant_isolation` policy (FOR ALL, USING)
7. Create `tenant_isolation_insert` policy (FOR INSERT, WITH CHECK)
8. Add `update_updated_at_column()` trigger
9. Add appropriate indexes (at minimum, `tenant_id`)
10. Use `IF NOT EXISTS` for idempotent migrations
11. Include a DOWN section (commented out or as actual rollback)

### Running Migrations

```bash
bun run migrate:up           # Run all pending migrations
bun run migrate:down         # Rollback last migration
bun run migrate:create name  # Create new migration file
```

---

## Effective Dating

HR data that changes over time uses `effective_from` / `effective_to` date ranges:

```sql
CREATE TABLE app.employee_positions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    position_id uuid NOT NULL,
    effective_from date NOT NULL,
    effective_to date,              -- NULL = currently effective
    created_at timestamptz NOT NULL DEFAULT now()
);
```

### Rules

- `effective_to = NULL` means the record is currently active
- No overlapping records per employee per dimension
- Overlaps must be validated under a transaction to prevent race conditions
- Use `validateNoOverlap(employeeId, dimension, newRange, excludeId?)` utility
- Query current records with: `WHERE effective_from <= CURRENT_DATE AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)`

---

## PgBouncer Compatibility

In Docker (and production), connections go through PgBouncer in **transaction mode**:

```
API/Worker --> PgBouncer (port 6432) --> PostgreSQL (port 5432)
```

PgBouncer transaction mode reassigns PostgreSQL connections between transactions. This is compatible with RLS because `set_tenant_context()` is called within each transaction.

**Key implications:**
- Prepared statements are automatically disabled when PgBouncer is detected
- Connection pools are smaller (10 per process vs 20 direct)
- The `hris_app` role connects through PgBouncer; `hris` connects directly for migrations

Detection is automatic: the `DatabaseClient` checks the port number (6432) or `PGBOUNCER_ENABLED=true`.

---

## Connection Budget

### With PgBouncer (Docker/Production)

| Pool | Max | Driver | Notes |
|------|-----|--------|-------|
| postgres.js (API + workers) | 10 | postgres.js | Per-process pool |
| Better Auth + lockout handler | 5 | pg (Pool) | Required by better-auth |
| **Total per process** | **15** | | PgBouncer multiplexes |

### Without PgBouncer (Local Dev)

| Pool | Max | Driver | Notes |
|------|-----|--------|-------|
| postgres.js (API + workers) | 20 | postgres.js | Shared singleton |
| Better Auth + lockout handler | 5 | pg (Pool) | Required by better-auth |
| **Total** | **25** | | Leaves 75 for superuser/migrations |

---

## Query Debugging

Enable query logging with:

```bash
DB_DEBUG=true bun run dev:api
```

This logs every query (truncated to 200 chars) and parameter counts to the console:

```
[DB Query] SELECT * FROM employees WHERE tenant_id = $1::uuid AND ...
[DB Params] count=2
```

> **Warning**: Do not enable `DB_DEBUG` in production as it may log PII.

---

## Common Patterns

### Cursor-Based Pagination

```typescript
// Fetch one extra row to determine hasMore
const rows = await tx`
  SELECT * FROM employees
  WHERE tenant_id = ${ctx.tenantId}::uuid
  ${cursor ? tx`AND id < ${cursor}::uuid` : tx``}
  ORDER BY created_at DESC, id DESC
  LIMIT ${limit + 1}
`;

const hasMore = rows.length > limit;
const data = hasMore ? rows.slice(0, limit) : rows;
const nextCursor = hasMore ? data[data.length - 1]?.id : null;

return { data, cursor: nextCursor, hasMore };
```

### Soft Deletes

Most tables use `is_active` boolean instead of hard deletes:

```typescript
const [row] = await tx`
  UPDATE app.leave_types SET
    is_active = false,
    updated_at = now()
  WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid AND is_active = true
  RETURNING *
`;
```

### Unique Constraints per Tenant

```sql
-- One P45 per employee per tax year, per tenant
CONSTRAINT p45_documents_unique UNIQUE (tenant_id, employee_id, tax_year)

-- One approval hierarchy per department per tenant
CONSTRAINT timesheet_approval_hierarchies_unique
    UNIQUE NULLS NOT DISTINCT (tenant_id, department_id)
```

---

## Related Documents

- [Architecture Overview](../02-architecture/ARCHITECTURE.md) — System architecture, plugin chain, and request flow
- [Database Schema and Migrations](../02-architecture/DATABASE.md) — Table catalog, schema design, and migration conventions
- [RLS and Multi-Tenancy](../07-security/rls-multi-tenancy.md) — Row-Level Security policies and tenant isolation
- [Coding Patterns](./coding-patterns.md) — Transaction handling, outbox pattern, and effective dating
- [Backend Development](./backend-development.md) — Module structure including repository layer conventions
- [API Reference](../04-api/api-reference.md) — Endpoint specifications that map to database queries
- [Testing Guide](../08-testing/testing-guide.md) — RLS integration tests and database test helpers
