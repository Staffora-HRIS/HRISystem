# Staffora Platform Database Migrations

This directory contains all database migrations for the Staffora platform. Migrations are used to evolve the database schema over time in a controlled and repeatable manner.

All tables live in the `app` schema (not `public`). The database has two roles:

- **`hris`** -- Superuser/admin role used for running migrations.
- **`hris_app`** -- Application role with `NOBYPASSRLS`, used at runtime and in tests so RLS is always enforced.

---

## Table of Contents

1. [Migration Naming Conventions](#migration-naming-conventions)
2. [Finding the Next Migration Number](#finding-the-next-migration-number)
3. [Migration Structure](#migration-structure)
4. [Required Table Patterns](#required-table-patterns)
5. [RLS Migration Checklist](#rls-migration-checklist)
6. [System Context Bypass Pattern](#system-context-bypass-pattern)
7. [Effective Dating Pattern](#effective-dating-pattern)
8. [Migration Ordering](#migration-ordering)
9. [Running Migrations](#running-migrations)
10. [Best Practices](#best-practices)
11. [Security Considerations](#security-considerations)
12. [Migration Renumbering History](#migration-renumbering-history)
13. [Troubleshooting](#troubleshooting)

---

## Migration Naming Conventions

Migrations use a **4-digit zero-padded** prefix followed by a snake_case description:

```
NNNN_description.sql
```

Where:
- `NNNN` is a four-digit sequence number (0001, 0002, ..., 0216, etc.)
- `description` is a brief, snake_case description of the migration

Examples:
- `0001_extensions.sql`
- `0017_employees.sql`
- `0088_better_auth_tables.sql`
- `0213_company_cars.sql`

**Important:** Always use 4-digit padding. Do NOT use `182_` -- use `0182_`.

---

## Finding the Next Migration Number

Before creating a new migration, check the highest existing number:

```bash
ls migrations/*.sql | sort | tail -5
```

Then use the next number after the highest one. As of now, the highest is `0216`, so the next migration would be `0217_description.sql`.

**Note:** Some migration numbers (0076-0079, 0081-0088, 0187, 0212-0213) have duplicate entries from parallel feature branches. This is a known quirk. If you encounter conflicts, simply skip to the next unused number.

You can also create a migration using the built-in command:

```bash
bun run migrate:create <description>
```

---

## Migration Structure

Each migration file should follow this structure:

```sql
-- Migration: NNNN_description
-- Created: YYYY-MM-DD
-- Description: Brief description of what this migration does

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Your migration SQL here
CREATE TABLE IF NOT EXISTS app.table_name (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    -- other columns
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for tenant-owned tables
ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policies
CREATE POLICY tenant_isolation ON app.table_name
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.table_name
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_table_name_tenant_id ON app.table_name(tenant_id);

-- Create updated_at trigger
CREATE TRIGGER update_table_name_updated_at
    BEFORE UPDATE ON app.table_name
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================
-- Note: DOWN migrations are commented out and executed manually if needed

-- DROP TRIGGER IF EXISTS update_table_name_updated_at ON app.table_name;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.table_name;
-- DROP POLICY IF EXISTS tenant_isolation ON app.table_name;
-- DROP TABLE IF EXISTS app.table_name;
```

---

## Required Table Patterns

### All Tables

Every table must have:
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`
- An `update_updated_at` trigger (uses `app.update_updated_at_column()`)

### Tenant-Owned Tables

Tables that belong to a tenant must follow the [RLS Migration Checklist](#rls-migration-checklist) below.

### Soft Delete Tables

Tables with soft delete must have:
- `deleted_at timestamptz` (nullable)
- Index on `deleted_at` for filtering

### Audit Log Table

The audit log table is special:
- Partitioned by month
- No UPDATE or DELETE allowed (append-only)
- Not tenant-scoped (contains `tenant_id` but no RLS)

---

## RLS Migration Checklist

**Every tenant-owned table MUST complete ALL of the following steps.** This is non-negotiable for multi-tenant data isolation.

### Step 1: Add `tenant_id` Column

```sql
tenant_id uuid NOT NULL
```

The column must be `NOT NULL`. Every row must belong to a tenant.

### Step 2: Add Foreign Key to `app.tenants`

```sql
REFERENCES app.tenants(id) ON DELETE CASCADE
```

Use `ON DELETE CASCADE` so that when a tenant is deleted, all their data is cleaned up.

### Step 3: Enable Row-Level Security

```sql
ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;
```

This activates the RLS engine on the table. Without this, policies have no effect.

### Step 4: Create FOR ALL Isolation Policy

```sql
CREATE POLICY tenant_isolation ON app.table_name
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );
```

This policy covers SELECT, UPDATE, and DELETE operations. It ensures:
- Normal queries only see rows belonging to the current tenant (set via `app.current_tenant` session variable).
- System context operations (migrations, seeds, admin tasks) can bypass the filter via `app.is_system_context()`.
- The `true` parameter in `current_setting('app.current_tenant', true)` prevents an error when the setting is not set (returns NULL instead, which will not match any rows).

### Step 5: Create FOR INSERT Isolation Policy

```sql
CREATE POLICY tenant_isolation_insert ON app.table_name
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );
```

This prevents inserting rows with a `tenant_id` that does not match the current session's tenant. Without this, a user could insert data into another tenant's namespace.

### Step 6: Create Index on `tenant_id`

```sql
CREATE INDEX IF NOT EXISTS idx_table_name_tenant_id ON app.table_name(tenant_id);
```

Every tenant-owned table needs this index for efficient RLS filtering. For tables that are always queried with additional filter columns, consider a composite index instead:

```sql
-- Composite index when you always query by tenant + another column
CREATE INDEX IF NOT EXISTS idx_table_name_tenant_status
    ON app.table_name(tenant_id, status);
```

### Complete Example

Here is a full tenant-owned table migration with all required elements:

```sql
-- Migration: 0217_example_records
-- Created: 2026-03-20
-- Description: Create example_records table with full RLS

-- =============================================================================
-- UP Migration
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.example_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Step 1 + 2: tenant_id with FK
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Business columns
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Step 3: Enable RLS
ALTER TABLE app.example_records ENABLE ROW LEVEL SECURITY;

-- Step 4: FOR ALL policy (SELECT, UPDATE, DELETE)
CREATE POLICY tenant_isolation ON app.example_records
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Step 5: FOR INSERT policy
CREATE POLICY tenant_isolation_insert ON app.example_records
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Step 6: Tenant index
CREATE INDEX IF NOT EXISTS idx_example_records_tenant_id
    ON app.example_records(tenant_id);

-- Additional indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_example_records_tenant_employee
    ON app.example_records(tenant_id, employee_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER update_example_records_updated_at
    BEFORE UPDATE ON app.example_records
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_example_records_updated_at ON app.example_records;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.example_records;
-- DROP POLICY IF EXISTS tenant_isolation ON app.example_records;
-- DROP INDEX IF EXISTS app.idx_example_records_tenant_employee;
-- DROP INDEX IF EXISTS app.idx_example_records_tenant_id;
-- DROP TABLE IF EXISTS app.example_records;
```

### Quick Reference Checklist

Copy this into your migration and check off each item:

```
-- RLS Checklist:
-- [x] tenant_id uuid NOT NULL column added
-- [x] FK to app.tenants(id) ON DELETE CASCADE
-- [x] ALTER TABLE ... ENABLE ROW LEVEL SECURITY
-- [x] FOR ALL policy with current_setting + is_system_context
-- [x] FOR INSERT policy with current_setting + is_system_context
-- [x] Index on tenant_id (or composite index including tenant_id)
```

---

## System Context Bypass Pattern

The `app.is_system_context()` function allows administrative operations (migrations, seeds, cross-tenant admin queries) to bypass RLS. This is used in two ways:

### In SQL Migrations and Seeds

```sql
-- Enable system context to bypass RLS
SELECT app.enable_system_context();

-- Perform privileged operations (e.g., seed data across tenants)
INSERT INTO app.some_table (tenant_id, ...) VALUES (...);

-- ALWAYS disable when done
SELECT app.disable_system_context();
```

**Warning:** Always pair `enable_system_context()` with `disable_system_context()`. Leaving system context enabled is a security risk.

### In TypeScript Application Code

```typescript
// For admin/cross-tenant operations in application code
await db.withSystemContext(async (tx) => {
  // RLS is bypassed within this callback
  const allTenantData = await tx`SELECT * FROM some_table`;
});
// RLS is automatically re-enabled after the callback
```

### In Tests

```typescript
import { withSystemContext } from '../setup';

// Insert test data bypassing RLS
await withSystemContext(db, async (tx) => {
  await tx`INSERT INTO app.employees (...) VALUES (...)`;
});
```

### When to Use System Context

- **Migrations**: Seeding reference data across tenants
- **Admin scripts**: Tenant provisioning, data repair
- **Background jobs**: Cross-tenant aggregation (analytics worker)
- **Tests**: Setting up test fixtures

### When NOT to Use System Context

- **Normal API endpoints**: Always use tenant-scoped queries via `db.withTransaction(ctx, ...)`
- **User-facing operations**: RLS must be enforced for all user requests
- **Business logic**: If you think you need system context in a service, reconsider the design

---

## Effective Dating Pattern

For HR data that changes over time (compensation, position assignments, contracts), use the effective dating pattern:

```sql
CREATE TABLE IF NOT EXISTS app.compensation_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Effective dating columns
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    effective_to date,  -- NULL means "currently effective"

    -- Business columns
    base_salary numeric(15, 2) NOT NULL,
    currency varchar(3) NOT NULL DEFAULT 'GBP',

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Prevent two records starting on the same date for the same employee
    CONSTRAINT compensation_effective_unique
        UNIQUE (tenant_id, employee_id, effective_from),

    -- End date must be after start date
    CONSTRAINT compensation_effective_dates
        CHECK (effective_to IS NULL OR effective_to > effective_from)
);
```

Key rules for effective-dated tables:
- `effective_from` is the start date (inclusive). Required, defaults to `CURRENT_DATE`.
- `effective_to` is the end date (inclusive or exclusive per business rule). `NULL` means the record is currently effective.
- No overlapping records per employee per dimension. Enforce this with a unique constraint on `(tenant_id, employee_id, effective_from)` and service-level overlap validation.
- Always validate overlaps inside a transaction to prevent race conditions.

---

## Migration Ordering

Migrations must be created and executed in a specific order due to foreign key dependencies:

1. **Extensions** (if not in init.sql)
   - uuid-ossp
   - pgcrypto

2. **Core Tables**
   - `tenants` -- Multi-tenant root table

3. **Authentication Tables**
   - `users` -- User accounts (global, not tenant-scoped)
   - `sessions` -- User sessions
   - `mfa_tokens` -- MFA configuration

4. **Junction Tables**
   - `user_tenants` -- Maps users to tenants with roles

5. **RBAC Tables** (in order)
   - `permissions` -- Individual permissions
   - `roles` -- Role definitions
   - `role_permissions` -- Maps permissions to roles
   - `role_assignments` -- Assigns roles to users within tenants

6. **Audit Tables**
   - `audit_log` -- Partitioned by month, append-only

7. **Infrastructure Tables**
   - `domain_outbox` -- Event outbox for reliable messaging
   - `idempotency_keys` -- Request deduplication

8. **Business Domain Tables**
   - `employees` -- Employee records
   - `organizations` -- Organizational units
   - `positions` -- Job positions
   - And other domain-specific tables

---

## Running Migrations

### Development

```bash
# Run all pending migrations
bun run migrate:up

# Rollback the last migration
bun run migrate:down

# Create a new migration file
bun run migrate:create <description>
```

### Production

In production, migrations should be:
1. Reviewed by at least one other developer
2. Tested in a staging environment first
3. Run during a maintenance window for breaking changes
4. Backed up before execution

---

## Best Practices

### Idempotent Operations

Use `IF NOT EXISTS` and `IF EXISTS` where possible so migrations can be safely re-run:

```sql
-- Good: idempotent
CREATE TABLE IF NOT EXISTS app.my_table (...);
CREATE INDEX IF NOT EXISTS idx_my_table_col ON app.my_table(col);

-- Bad: will fail if run twice
CREATE TABLE app.my_table (...);
```

### Transactions

PostgreSQL runs each migration file in an implicit transaction. However, some DDL operations (like `CREATE INDEX CONCURRENTLY`) cannot run inside a transaction. If you need a non-transactional migration, document this clearly at the top of the file.

### One Concern Per Migration

Each migration should do one thing. If you are creating a table and adding seed data, split them into two migrations:
- `0217_create_my_table.sql`
- `0218_seed_my_table_data.sql`

### Index Foreign Keys

Always create indexes on foreign key columns. PostgreSQL does not automatically index FK columns:

```sql
CREATE INDEX IF NOT EXISTS idx_table_name_employee_id ON app.table_name(employee_id);
```

### No Data Loss

Avoid destructive changes without a data migration plan. Use `ALTER TABLE` instead of `DROP/CREATE` when possible.

### Reversible Migrations

Include commented-out DOWN migration SQL at the bottom of every migration. Drop objects in reverse creation order:

```sql
-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_my_table_updated_at ON app.my_table;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.my_table;
-- DROP POLICY IF EXISTS tenant_isolation ON app.my_table;
-- DROP INDEX IF EXISTS app.idx_my_table_tenant_id;
-- DROP TABLE IF EXISTS app.my_table;
```

### Test Your Migrations

After writing a migration:
1. Run `bun run migrate:up` and verify it applies cleanly.
2. Check that RLS is working by running a query as `hris_app` without setting a tenant context -- it should return zero rows.
3. Run the existing test suite: `bun run test:api` to catch any regressions.
4. If your migration adds a tenant-owned table, write an integration test in `packages/api/src/test/integration/` that verifies:
   - Queries within the correct tenant return data.
   - Queries from a different tenant return zero rows (RLS isolation).
   - System context can bypass RLS when needed.

### Consider Performance

- Large table modifications may need to be done in batches.
- For large tables, create indexes concurrently: `CREATE INDEX CONCURRENTLY` (requires a non-transactional migration).
- Run heavy migrations during low-traffic periods.

### Document Breaking Changes

Note any changes at the top of the migration that require corresponding code updates (new columns that services must populate, renamed columns, removed columns, etc.).

---

## Security Considerations

1. **RLS is mandatory**: All tenant-owned tables must have Row-Level Security. See the [RLS Migration Checklist](#rls-migration-checklist).

2. **Audit is append-only**: Never create UPDATE or DELETE operations on `audit_log`.

3. **Secrets in migrations**: Never hardcode secrets, passwords, or API keys. Use environment variables or the `app.enable_system_context()` pattern for seed data.

4. **Permission grants**: Be explicit about which roles can access which tables. The `hris_app` role should only have the permissions it needs.

5. **Policy naming**: Use consistent policy names (`tenant_isolation` for FOR ALL, `tenant_isolation_insert` for FOR INSERT) so they are easy to audit.

6. **Always use `current_setting(..., true)`**: The second parameter `true` means "return NULL if the setting does not exist" instead of raising an error. This prevents crashes when no tenant context is set (the query simply returns no rows).

---

## Migration Renumbering History

During development, parallel feature branches caused duplicate migration numbers in the 0076-0079 range. A one-time renumbering event resolved the conflicts by shifting affected migrations to new sequence numbers (e.g., 0076-0079 became 0081-0084, and subsequent files were shifted accordingly).

The script `fix_schema_migrations_filenames.sql` was executed once against the `schema_migrations` tracking table to update the recorded filenames. **Do not run this script again.** It is kept in the migrations directory for historical reference only.

### Known duplicate ranges

Some migration numbers (0076-0079 and 0187) may have duplicate entries from parallel feature branches. If you encounter conflicts when creating a new migration, check the highest existing migration number with:

```bash
ls migrations/*.sql | sort | tail -5
```

Then use the next available number with 4-digit zero-padding (e.g., `0217_description.sql`).

---

## Troubleshooting

### Migration fails with RLS error

Ensure you have set the tenant context before running queries on tenant-owned tables, or use system context:

```sql
SELECT app.enable_system_context();
-- Run your privileged operations
SELECT app.disable_system_context();
```

In TypeScript, use `db.withSystemContext(callback)` or `db.withTransaction(ctx, callback)`.

### Foreign key constraint violation

Check the migration order. Parent tables must exist before child tables. The migration ordering section above documents the correct dependency chain.

### Index creation timeout

For large tables, consider:
- Creating indexes concurrently: `CREATE INDEX CONCURRENTLY` (cannot run inside a transaction)
- Running during low-traffic periods
- Breaking into multiple migrations

### RLS policy not working

Verify all of the following:
1. `ENABLE ROW LEVEL SECURITY` was called on the table.
2. Both FOR ALL and FOR INSERT policies exist.
3. Policies reference `current_setting('app.current_tenant', true)::uuid` (with `true` for the missing_ok parameter).
4. Policies include `OR app.is_system_context()` for administrative operations.
5. The application is connecting as `hris_app` (not `hris`), since the `hris` superuser role bypasses RLS entirely.
