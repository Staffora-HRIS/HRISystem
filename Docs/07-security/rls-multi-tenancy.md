# Row-Level Security & Multi-Tenancy

> Last updated: 2026-03-28

This document covers the Row-Level Security (RLS) implementation that enforces tenant isolation in the Staffora HRIS platform. Every tenant-owned table uses RLS to ensure that one tenant's data is never accessible to another.

---

## Table of Contents

- [Overview](#overview)
- [Database Roles](#database-roles)
- [RLS Policy Pattern](#rls-policy-pattern)
- [Tenant Context Setting](#tenant-context-setting)
- [System Context Bypass](#system-context-bypass)
- [Migration Pattern](#migration-pattern)
- [Bulk RLS Policy Application](#bulk-rls-policy-application)
- [Testing RLS](#testing-rls)
- [Common Pitfalls](#common-pitfalls)

---

## Overview

Staffora is a multi-tenant platform where all tenants share the same PostgreSQL database and schema (`app`). Tenant isolation is enforced at the database level using PostgreSQL Row-Level Security (RLS), ensuring that even if application code has a bug, one tenant cannot access another tenant's data.

**Key principles:**
- Every tenant-owned table has a `tenant_id` column
- RLS is enabled on every tenant-owned table
- The application role (`hris_app`) has `NOBYPASSRLS` -- it cannot circumvent RLS
- Tenant context is set per-transaction via `SET LOCAL`

## Database Roles

Staffora uses two database roles:

| Role | Privileges | RLS Bypass | Usage |
|------|-----------|------------|-------|
| `hris` | Superuser/admin | Yes (superuser) | Migrations, schema changes, administrative operations |
| `hris_app` | Application role | **No** (`NOBYPASSRLS`) | Runtime queries, API requests, **tests** |

The `hris_app` role is used for all application queries, including tests. This means RLS is always enforced during normal operation and during testing. There is no way for application code to accidentally bypass tenant isolation.

## RLS Policy Pattern

Every tenant-owned table requires two policies:

### 1. General Access Policy (FOR ALL)

Controls SELECT, UPDATE, DELETE operations:

```sql
CREATE POLICY tenant_isolation ON app.employees
  USING (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );
```

### 2. Insert Policy (FOR INSERT)

Controls INSERT operations with a `WITH CHECK` clause:

```sql
CREATE POLICY tenant_isolation_insert ON app.employees
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );
```

### Policy Logic

Both policies check two conditions (OR):

1. **Tenant match**: `tenant_id = current_setting('app.current_tenant')::uuid` -- the row's tenant matches the current session's tenant context.
2. **System context**: `current_setting('app.system_context', true) = 'true'` -- system context is enabled for cross-tenant administrative operations.

The `true` parameter in `current_setting('app.system_context', true)` returns NULL instead of raising an error when the setting is not defined, which is treated as `false` by the OR condition.

## Tenant Context Setting

Before any tenant-scoped query, the application sets the tenant context using a PostgreSQL session variable:

```sql
SELECT app.set_tenant_context(:tenant_id::uuid);
```

This function sets `app.current_tenant` via `SET LOCAL`, scoping it to the current transaction.

### In TypeScript

The `DatabaseClient` handles tenant context automatically:

```typescript
// Tenant-scoped queries -- sets RLS context automatically
const rows = await db.withTransaction(ctx, async (tx) => {
  return await tx`SELECT * FROM employees WHERE id = ${id}`;
});
```

The `withTransaction` method:
1. Begins a transaction
2. Calls `app.set_tenant_context(ctx.tenantId)`
3. Executes the callback
4. Commits or rolls back the transaction

## System Context Bypass

For administrative operations that need cross-tenant access (e.g., resolving which tenants a user belongs to before any tenant is selected), the system context bypass is used:

```sql
SELECT app.enable_system_context();
-- ... privileged operations ...
SELECT app.disable_system_context();
```

### In TypeScript

```typescript
// Cross-tenant queries -- bypasses RLS via system_context flag
const result = await db.withSystemContext(async (tx) => {
  return await tx`
    SELECT tenant_id FROM app.user_tenants
    WHERE user_id = ${userId}::uuid
  `;
});
```

The `withSystemContext` method:
1. Calls `app.enable_system_context()` (sets `app.system_context = 'true'`)
2. Executes the callback
3. Calls `app.disable_system_context()` (resets the setting)
4. Guaranteed cleanup via try/finally

### When System Context Is Needed

| Scenario | Why |
|----------|-----|
| User login / tenant resolution | Must query `user_tenants` before any tenant context is set |
| Permission resolution | `get_user_roles` / `get_user_permissions` need cross-tenant view |
| Role assignment CRUD | INSERT/UPDATE operations on role tables |
| Admin unlock account | Must update user status across tables |
| DSAR data gathering | May need to access data across modules |

## Migration Pattern

When creating a new table that stores tenant data, follow this pattern in the migration file:

```sql
-- 1. Create the table with tenant_id
CREATE TABLE app.my_new_table (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES app.tenants(id),
    name        text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE app.my_new_table ENABLE ROW LEVEL SECURITY;

-- 3. Create the tenant isolation policy (FOR ALL)
CREATE POLICY tenant_isolation ON app.my_new_table
  USING (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

-- 4. Create the insert policy
CREATE POLICY tenant_isolation_insert ON app.my_new_table
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant')::uuid
    OR current_setting('app.system_context', true) = 'true'
  );

-- 5. Create index on tenant_id for query performance
CREATE INDEX idx_my_new_table_tenant_id ON app.my_new_table(tenant_id);

-- 6. Grant permissions to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.my_new_table TO hris_app;
```

### Migration File Naming

Use 4-digit padding: `0235_my_new_table.sql` (check the highest existing migration number first).

## Bulk RLS Policy Application

Migration `0226_add_missing_rls_policies.sql` demonstrates how to apply RLS policies to all tables that are missing them:

```sql
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT c.relname as table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app'
          AND c.relkind = 'r'
          AND c.relrowsecurity = true          -- RLS is enabled
          AND NOT EXISTS (                      -- but no policies exist
            SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
          )
          AND EXISTS (                          -- and table has tenant_id
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'app'
              AND table_name = c.relname
              AND column_name = 'tenant_id'
          )
    LOOP
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON app.%I
             USING (tenant_id = current_setting(''app.current_tenant'')::uuid
                    OR current_setting(''app.system_context'', true) = ''true'')',
            tbl.table_name
        );
        EXECUTE format(
            'CREATE POLICY tenant_isolation_insert ON app.%I
             FOR INSERT
             WITH CHECK (tenant_id = current_setting(''app.current_tenant'')::uuid
                         OR current_setting(''app.system_context'', true) = ''true'')',
            tbl.table_name
        );
    END LOOP;
END
$$;
```

This migration automatically finds all tables with RLS enabled but no policies defined, and adds the standard tenant isolation policies.

## Testing RLS

Tests connect as the `hris_app` role (non-superuser, `NOBYPASSRLS`) so RLS policies are enforced during testing.

### Test Helpers

```typescript
import {
  createTestContext,
  setTenantContext,
  withSystemContext,
  expectRlsError,
  getTestDb,
} from '../setup';

// Set up tenant context for a test
const ctx = await createTestContext(tenantId, userId);
await setTenantContext(db, tenantId);

// Test that cross-tenant access is blocked
await expectRlsError(async () => {
  await setTenantContext(db, tenantA);
  const rows = await db`SELECT * FROM app.employees WHERE id = ${employeeInTenantB}`;
  // Should return empty or throw
});

// Use system context in tests for setup/teardown
await withSystemContext(db, async (tx) => {
  await tx`INSERT INTO app.employees (...) VALUES (...)`;
});
```

### What RLS Tests Must Verify

1. **Tenant isolation**: A query scoped to Tenant A returns zero rows from Tenant B
2. **Cross-tenant INSERT blocked**: Inserting a row with a mismatched `tenant_id` fails
3. **System context bypass works**: Administrative operations succeed with system context
4. **System context is transient**: After system context is disabled, normal RLS rules apply again

### Example Test Pattern

```typescript
test('RLS blocks cross-tenant employee access', async () => {
  const db = getTestDb();

  // Create employees in two tenants
  const empA = await withSystemContext(db, async (tx) => {
    return await tx`
      INSERT INTO app.employees (tenant_id, ...) VALUES (${tenantA}, ...)
      RETURNING id
    `;
  });

  // Query as Tenant B -- should not see Tenant A's employee
  await setTenantContext(db, tenantB);
  const results = await db`SELECT * FROM app.employees WHERE id = ${empA.id}`;
  expect(results.length).toBe(0);
});
```

## Common Pitfalls

### 1. Forgetting to Add RLS Policies

If you enable RLS on a table but don't create policies, `hris_app` (NOBYPASSRLS) is blocked from ALL operations on that table. The migration in `0226_add_missing_rls_policies.sql` was created specifically to fix this issue across all existing tables.

### 2. Missing `system_context` in INSERT Policies

INSERT policies use `WITH CHECK` instead of `USING`. If the system_context bypass is missing from the INSERT policy, `withSystemContext()` calls will fail for inserts. Both policies must include the `OR current_setting('app.system_context', true) = 'true'` clause.

### 3. Querying Before Setting Tenant Context

If code queries a tenant-owned table before calling `set_tenant_context()`, the query will fail because `app.current_tenant` is not set. Always use `db.withTransaction(ctx, ...)` which sets the context automatically.

### 4. Using `hris` Role in Application Code

The `hris` superuser role bypasses RLS. It should only be used for migrations. Application code must always use the `hris_app` role to ensure RLS enforcement.

### 5. Tables Without `tenant_id`

System-wide tables (e.g., `permissions`, `portals`) that are not tenant-scoped do not need RLS. Only tables with a `tenant_id` column should have RLS enabled.

### 6. Search Path

The database client configures `search_path = app,public` so queries can use bare table names (e.g., `employees` instead of `app.employees`). This is consistent across the application, Better Auth's pg Pool, and migrations.

---

## Related Documents

- [Architecture Overview](../02-architecture/ARCHITECTURE.md) — System architecture, plugin chain, and request flow
- [Database Schema and Migrations](../02-architecture/DATABASE.md) — Table catalog, migration conventions, and schema design
- [Database Guide](../05-development/database-guide.md) — Database development patterns, queries, and roles
- [Authorization](./authorization.md) — RBAC permission model that works alongside RLS
- [Security Patterns](../02-architecture/security-patterns.md) — Cross-cutting security patterns (RLS, auth, RBAC, audit)
- [Coding Patterns](../05-development/coding-patterns.md) — Transaction handling, system context, and tenant-scoped queries
- [GDPR Compliance](../12-compliance/gdpr-compliance.md) — Data isolation requirements under GDPR
- [Testing Guide](../08-testing/testing-guide.md) — RLS integration test patterns and cross-tenant isolation verification
