# ADR-004: Row-Level Security for Multi-Tenant Isolation

**Status:** Accepted
**Date:** 2026-01-07
**Authors:** Platform team

## Context

Staffora is a multi-tenant HRIS platform where each tenant (employer organisation) stores sensitive employee data including personal information, compensation, performance reviews, disciplinary records, and medical absence details. A data leak between tenants would be a catastrophic security and legal failure under UK GDPR.

We need a tenant isolation strategy that:

- **Prevents cross-tenant data access at the database level**, not just the application level. A single missed `WHERE tenant_id = ?` clause in any of the 72+ backend modules must not result in data leakage.
- **Is enforceable in tests**: Integration tests must be able to verify that tenant isolation actually works, not just that the application code includes the correct filters.
- **Supports administrative bypass**: System operations (migrations, outbox processing, cross-tenant reports) need a controlled mechanism to operate across tenant boundaries.
- **Works with PostgreSQL**: The database is PostgreSQL 16 and we need a solution native to the database engine.

The platform has approximately 228 migration files creating tables across all modules (HR, time, absence, talent, LMS, cases, etc.), nearly all of which are tenant-scoped.

## Decision

We implement **PostgreSQL Row-Level Security (RLS)** as the primary mechanism for multi-tenant data isolation. Every tenant-owned table follows a mandatory pattern:

### RLS policy pattern (applied to every tenant-scoped table)

```sql
-- 1. Every table has a tenant_id column
tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE

-- 2. RLS is enabled
ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;

-- 3. SELECT/UPDATE/DELETE policy: rows visible only for current tenant (or system context)
CREATE POLICY tenant_isolation ON app.table_name
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- 4. INSERT policy: can only insert rows for current tenant (or system context)
CREATE POLICY tenant_isolation_insert ON app.table_name
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );
```

### Tenant context setting

Before any tenant-scoped query, the application sets a session-level PostgreSQL configuration variable:

```sql
SELECT app.set_tenant_context('tenant-uuid'::uuid, 'user-uuid'::uuid);
```

This is handled automatically by `db.withTransaction(ctx, callback)` in the `DatabaseClient` class (`packages/api/src/plugins/db.ts`). The tenant context is extracted from the authenticated session by the `tenantPlugin`.

### Two database roles

- **`hris`**: Superuser role used for migrations. Bypasses RLS by default (PostgreSQL superusers are exempt from RLS).
- **`hris_app`**: Application runtime role with `NOBYPASSRLS`. This role is used for all application queries and in tests, ensuring RLS policies are enforced.

The `hris_app` role is created during Docker initialisation via `docker/postgres/01-create-app-role.sh` and is configured as `DATABASE_APP_URL` in the application.

### System context bypass

For administrative operations that must cross tenant boundaries (outbox processing, scheduled jobs, system reports), the application uses:

```sql
SELECT app.enable_system_context();
-- ... cross-tenant operations ...
SELECT app.disable_system_context();
```

In TypeScript, this is wrapped as `db.withSystemContext(callback)`, which sets a nil UUID tenant (`00000000-0000-0000-0000-000000000000`) and enables the system context flag. The `try/finally` pattern in the implementation ensures system context is always disabled, even on error.

### Test enforcement

Tests connect as the `hris_app` role so RLS is enforced during testing. Integration tests in `packages/api/src/test/integration/` include dedicated RLS tests that:

1. Create data for Tenant A
2. Switch context to Tenant B
3. Verify that queries return zero rows (not an error, just empty results)
4. Verify that `INSERT` with a mismatched `tenant_id` is rejected

The test helper `expectRlsError()` validates that cross-tenant operations fail as expected.

## Consequences

### Positive

- **Defence in depth**: Even if application code has a bug (missing tenant filter, SQL injection), the database itself prevents cross-tenant data access. This is the strongest isolation guarantee short of separate databases per tenant.
- **Transparent to application code**: Once `set_tenant_context` is called (which happens automatically in `withTransaction`), all queries are automatically scoped. Developers do not need to remember to add `WHERE tenant_id = ?` to every query.
- **Testable**: Because tests run as `hris_app` (NOBYPASSRLS), RLS is enforced in the test suite. Cross-tenant access failures are caught before deployment.
- **Standard PostgreSQL feature**: RLS is built into PostgreSQL 9.5+ with no extensions required. It works with any managed PostgreSQL provider.
- **Consistent enforcement across 72 modules**: Every module's queries pass through the same `withTransaction` context-setting mechanism.

### Negative

- **Performance overhead**: RLS adds a filter predicate to every query plan. For simple queries this is negligible (the `current_setting` call is very cheap), but for complex queries with many joins, the planner must propagate the RLS predicate across all tables. Mitigation: the `tenant_id` column is indexed on every table, and the `current_setting` function is immutable within a transaction.
- **Migration discipline**: Every new table must include the RLS boilerplate (ENABLE, two policies). Forgetting this creates a security gap. Mitigation: migration templates, code review checklists, and CI checks enforce the pattern.
- **Debugging complexity**: When a query returns unexpected empty results, the cause could be RLS filtering rather than a data issue. Developers need to be aware that system context or a `hris` role connection is needed for debugging.
- **Two connection pools**: The application needs the `hris_app` role (for RLS) and the `hris` role (for migrations). This is managed by having separate `DATABASE_URL` and `DATABASE_APP_URL` environment variables.

### Neutral

- The `app.is_system_context()` function provides an escape hatch. This is necessary for legitimate cross-tenant operations but must be used carefully and audited.
- PostgreSQL superusers bypass RLS entirely, which is why the migration role (`hris`) must never be used for application queries.
- The `current_setting('app.current_tenant', true)` call uses the second parameter (`true`) to return NULL instead of throwing an error when the setting is not defined. This is important for cases where tenant context has not been set.

## Alternatives Considered

### Application-level tenant filtering only (WHERE tenant_id = ?)

Rejected because:
- Relies on every query in every module correctly including the tenant filter
- A single omission results in a data leak
- Cannot be enforced at the database level
- Bugs are silent (no error, just wrong data returned)

### Separate schemas per tenant

Considered but rejected because:
- PostgreSQL struggles with thousands of schemas (one per tenant at scale)
- Application code would need dynamic schema switching on every request
- Migrations would need to run against every schema independently
- Connection pooling becomes complex with schema-per-tenant

### Separate databases per tenant

Rejected because:
- Extreme operational overhead: each tenant requires its own database, connection pool, and migration tracking
- Cross-tenant reporting becomes impossible without a separate aggregation layer
- Not practical for a platform targeting hundreds or thousands of tenants

### Citus / PostgreSQL sharding

Considered but rejected because:
- Citus adds infrastructure complexity and is a PostgreSQL extension that may not be available in all environments
- The current scale does not require horizontal sharding
- RLS provides the isolation guarantee; sharding is a scaling solution that can be added later if needed

## References

- PostgreSQL RLS documentation: https://www.postgresql.org/docs/16/ddl-rowsecurity.html
- Database plugin (context setting): `packages/api/src/plugins/db.ts`
- Tenant plugin (context extraction): `packages/api/src/plugins/tenant.ts`
- Example RLS migration: `migrations/0017_employees.sql`, `migrations/0011_domain_outbox.sql`
- App role creation: `docker/postgres/01-create-app-role.sh`
- RLS integration tests: `packages/api/src/test/integration/`
