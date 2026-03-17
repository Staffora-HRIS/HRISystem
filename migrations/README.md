# Staffora Platform Database Migrations

This directory contains all database migrations for the Staffora platform. Migrations are used to evolve the database schema over time in a controlled and repeatable manner.

## Migration Conventions

### File Naming

Migrations are numbered sequentially and named descriptively:

```
XXX_description.sql
```

Where:
- `XXX` is a three-digit sequence number (001, 002, 003, etc.)
- `description` is a brief, snake_case description of the migration

Examples:
- `001_create_tenants_table.sql`
- `002_create_users_table.sql`
- `003_create_user_tenants_junction.sql`
- `004_create_rbac_tables.sql`

### Migration Ordering

Migrations must be created and executed in a specific order due to foreign key dependencies:

1. **Extensions** (if not in init.sql)
   - uuid-ossp
   - pgcrypto

2. **Core Tables**
   - `tenants` - Multi-tenant root table

3. **Authentication Tables**
   - `users` - User accounts (global, not tenant-scoped)
   - `sessions` - User sessions
   - `mfa_tokens` - MFA configuration

4. **Junction Tables**
   - `user_tenants` - Maps users to tenants with roles

5. **RBAC Tables** (in order)
   - `permissions` - Individual permissions
   - `roles` - Role definitions
   - `role_permissions` - Maps permissions to roles
   - `role_assignments` - Assigns roles to users within tenants

6. **Audit Tables**
   - `audit_log` - Partitioned by month, append-only

7. **Infrastructure Tables**
   - `domain_outbox` - Event outbox for reliable messaging
   - `idempotency_keys` - Request deduplication

8. **Business Domain Tables**
   - `employees` - Employee records
   - `organizations` - Organizational units
   - `positions` - Job positions
   - And other domain-specific tables

## Migration Structure

Each migration file should follow this structure:

```sql
-- Migration: XXX_description
-- Created: YYYY-MM-DD
-- Description: Brief description of what this migration does

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Your migration SQL here
CREATE TABLE IF NOT EXISTS app.table_name (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    -- other columns
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for tenant-owned tables
ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policy
CREATE POLICY tenant_isolation ON app.table_name
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

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
-- DROP TABLE IF EXISTS app.table_name;
```

## Required Table Patterns

### All Tables

Every table must have:
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`

### Tenant-Owned Tables

Tables that belong to a tenant must have:
- `tenant_id uuid NOT NULL REFERENCES app.tenants(id)`
- Row-Level Security enabled
- Tenant isolation policy
- Index on `tenant_id`

Example:
```sql
CREATE TABLE app.employees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    -- ... other columns
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.employees
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.employees
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_employees_tenant_id ON app.employees(tenant_id);
```

### Soft Delete Tables

Tables with soft delete must have:
- `deleted_at timestamptz` (nullable)
- Index on `deleted_at` for filtering

### Audit Log Table

The audit log table is special:
- Partitioned by month
- No UPDATE or DELETE allowed
- Not tenant-scoped (contains tenant_id but no RLS)

## Running Migrations

### Development

```bash
# Run all pending migrations
bun run migrate:up

# Rollback the last migration
bun run migrate:down

# Create a new migration
bun run migrate:create <description>
```

### Production

In production, migrations should be:
1. Reviewed by at least one other developer
2. Tested in a staging environment first
3. Run during a maintenance window for breaking changes
4. Backed up before execution

## Migration Renumbering History

During development, parallel feature branches caused duplicate migration numbers in the 0076-0079 range. A one-time renumbering event resolved the conflicts by shifting affected migrations to new sequence numbers (e.g., 0076-0079 became 0081-0084, and subsequent files were shifted accordingly).

The script `fix_schema_migrations_filenames.sql` was executed once against the `schema_migrations` tracking table to update the recorded filenames. **Do not run this script again.** It is kept in the migrations directory for historical reference only.

### Known duplicate ranges

Some migration numbers (0076-0079 and 0187) may have duplicate entries from parallel feature branches. If you encounter conflicts when creating a new migration, check the highest existing migration number with:

```bash
ls migrations/*.sql | sort | tail -5
```

Then use the next available number with 4-digit zero-padding (e.g., `0190_description.sql`).

## Best Practices

1. **One concern per migration**: Each migration should do one thing.

2. **Idempotent migrations**: Use `IF NOT EXISTS` and `IF EXISTS` where possible.

3. **No data loss**: Avoid destructive changes without a data migration plan.

4. **Index foreign keys**: Always create indexes on foreign key columns.

5. **Test rollbacks**: Verify DOWN migrations work before deploying.

6. **Document breaking changes**: Note any changes that require code updates.

7. **Preserve data**: Use ALTER TABLE instead of DROP/CREATE when possible.

8. **Consider performance**: Large table modifications may need to be done in batches.

## Security Considerations

1. **RLS is mandatory**: All tenant-owned tables must have Row-Level Security.

2. **Audit is append-only**: Never create UPDATE or DELETE operations on audit_log.

3. **Secrets in migrations**: Never hardcode secrets. Use environment variables.

4. **Permission grants**: Be explicit about which roles can access which tables.

## Troubleshooting

### Migration fails with RLS error

Ensure you've called `set_tenant_context()` before running queries on tenant-owned tables, or enable system context:

```sql
SELECT app.enable_system_context();
-- Run your migration
SELECT app.disable_system_context();
```

### Foreign key constraint violation

Check the migration order. Parent tables must exist before child tables.

### Index creation timeout

For large tables, consider:
- Creating indexes concurrently: `CREATE INDEX CONCURRENTLY`
- Running during low-traffic periods
- Breaking into multiple migrations
