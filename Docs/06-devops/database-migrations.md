# Database Migrations

Last updated: 2026-03-28

This document covers the database migration system for the Staffora HRIS platform, including the migration runner, file conventions, RLS patterns, and operational procedures.

---

## Table of Contents

- [Overview](#overview)
- [Migration Runner](#migration-runner)
- [File Naming Conventions](#file-naming-conventions)
- [Running Migrations](#running-migrations)
- [Creating New Migrations](#creating-new-migrations)
- [Migration File Structure](#migration-file-structure)
- [RLS Patterns in Migrations](#rls-patterns-in-migrations)
- [Database Roles](#database-roles)
- [Schema Organization](#schema-organization)
- [Enum Handling](#enum-handling)
- [Migration Tracking](#migration-tracking)
- [Rollback Strategy](#rollback-strategy)
- [CI Validation](#ci-validation)
- [Known Quirks](#known-quirks)
- [Operational Procedures](#operational-procedures)

---

## Overview

Staffora uses a custom migration runner built on postgres.js (`packages/api/src/db/migrate.ts`). Migrations are plain SQL files stored in the `migrations/` directory at the repository root.

Key facts:
- All tables live in the `app` schema (not `public`)
- The migration tracking table lives in `public.schema_migrations`
- Migrations are forward-only (no automated rollback)
- Each migration file includes commented-out DOWN migration SQL for manual rollback if needed
- The current highest migration number is **0234** (as of 2026-03-28)

---

## Migration Runner

**File**: `packages/api/src/db/migrate.ts`

The runner supports three commands:

| Command | Description |
|---------|-------------|
| `up` (default) | Apply all pending migrations |
| `down` | Not supported (throws an error) |
| `create <name>` | Create a new migration file |

### How `up` Works

1. Connect to the database using `DATABASE_URL` or individual `DB_*` environment variables
2. Create the `public.schema_migrations` table if it does not exist
3. Read all `.sql` files from the `migrations/` directory matching `^\d+_.+\.sql$`
4. Sort files lexicographically
5. For each file not in `schema_migrations`:
   - If the migration contains `ALTER TYPE ... ADD VALUE`, run it outside a transaction (PostgreSQL limitation)
   - Otherwise, run it inside a transaction
   - Record the filename in `schema_migrations` on success
   - If a "duplicate object" error occurs (error code 42710), log a warning and mark as applied

### Database Connection

The runner resolves the database connection in this order:

1. `DATABASE_URL` environment variable (full connection string)
2. Individual variables: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
3. Defaults: `localhost:5432/hris` with user `hris`

The `DB_PASSWORD` has a hardcoded fallback (`hris_dev_password`) only when `NODE_ENV` is `development` or `test`. In production, `DB_PASSWORD` or `DATABASE_URL` must be set explicitly.

---

## File Naming Conventions

Migration files follow this naming pattern:

```
NNNN_description.sql
```

Rules:
- **4-digit zero-padded prefix** (e.g., `0001`, `0042`, `0234`)
- **Lowercase description** using underscores as separators
- **`.sql` extension**
- Files are sorted lexicographically, so the 4-digit prefix determines execution order

Examples of valid names:
```
0001_extensions.sql
0002_tenants.sql
0042_add_leave_balances.sql
0188_add_employee_addresses.sql
0234_fix_ci_test_failures_round2.sql
```

Examples of invalid names:
```
42_add_table.sql         # Not 4-digit padded
0042_AddTable.sql        # Mixed case
0042-add-table.sql       # Hyphens instead of underscores
add_table.sql            # No numeric prefix
```

### Determining the Next Number

Before creating a new migration, check the highest existing number:

```bash
ls migrations/ | tail -5
```

Use the next sequential number. As of 2026-03-28, the next available number is **0235**.

---

## Running Migrations

### Development

```bash
# Apply all pending migrations
bun run migrate:up

# Alternative: run the script directly
bun run packages/api/src/db/migrate.ts up
```

### CI

In GitHub Actions, migrations run after initializing the database schema:

```bash
# Initialize schema (create app schema, hris_app role, RLS functions)
PGPASSWORD=hris_dev_password psql -h localhost -U hris -d hris -f docker/postgres/init.sql

# Apply migrations
bun run migrate:up
```

### Docker (Production)

Migrations run inside the API container during deployment:

```bash
docker compose exec -T api bun run src/db/migrate.ts up
```

### Environment Variables for Migrations

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | -- | Full connection string (takes precedence) |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `hris` | Database name |
| `DB_USER` | `hris` | PostgreSQL user (use admin role for migrations) |
| `DB_PASSWORD` | `hris_dev_password` (dev/test only) | PostgreSQL password |
| `MIGRATIONS_DIR` | `<repo>/migrations` | Override migrations directory |

---

## Creating New Migrations

### Automatic

```bash
bun run migrate:create add_employee_photos
```

This creates a file like `migrations/0235_add_employee_photos.sql` with a template:

```sql
-- Migration: 0235_add_employee_photos
-- Created: 2026-03-28
-- Description:

-- =============================================================================
-- UP Migration
-- =============================================================================


-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

```

### Manual

You can also create the file manually. Ensure the filename follows the `NNNN_description.sql` convention.

---

## Migration File Structure

A well-structured migration includes:

```sql
-- Migration: 0042_add_leave_balances
-- Created: 2026-02-15
-- Description: Create leave balances table for tracking employee leave entitlements

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Table definition
CREATE TABLE IF NOT EXISTS app.leave_balances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    employee_id uuid NOT NULL REFERENCES app.employees(id),
    leave_type_id uuid NOT NULL REFERENCES app.leave_types(id),
    year integer NOT NULL,
    entitled numeric(8,2) NOT NULL DEFAULT 0,
    used numeric(8,2) NOT NULL DEFAULT 0,
    pending numeric(8,2) NOT NULL DEFAULT 0,
    carried_over numeric(8,2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT leave_balances_unique UNIQUE (tenant_id, employee_id, leave_type_id, year)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leave_balances_tenant ON app.leave_balances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_employee ON app.leave_balances(tenant_id, employee_id);

-- RLS
ALTER TABLE app.leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.leave_balances
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.leave_balances
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Triggers
CREATE TRIGGER update_leave_balances_updated_at
    BEFORE UPDATE ON app.leave_balances
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Comments
COMMENT ON TABLE app.leave_balances IS 'Tracks employee leave entitlements and usage per year';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_leave_balances_updated_at ON app.leave_balances;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.leave_balances;
-- DROP POLICY IF EXISTS tenant_isolation ON app.leave_balances;
-- DROP INDEX IF EXISTS app.idx_leave_balances_employee;
-- DROP INDEX IF EXISTS app.idx_leave_balances_tenant;
-- DROP TABLE IF EXISTS app.leave_balances;
```

---

## RLS Patterns in Migrations

Every tenant-owned table **must** include the following RLS configuration. This is enforced by the `migration-check.yml` CI workflow.

### Required Elements

**1. `tenant_id` column**

```sql
tenant_id uuid NOT NULL REFERENCES app.tenants(id),
```

**2. Enable RLS**

```sql
ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;
```

**3. SELECT/UPDATE/DELETE isolation policy**

```sql
CREATE POLICY tenant_isolation ON app.table_name
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

This policy ensures queries only see rows belonging to the current tenant.

**4. INSERT isolation policy**

```sql
CREATE POLICY tenant_isolation_insert ON app.table_name
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);
```

This policy ensures inserts can only create rows for the current tenant.

### System Context Bypass

Some RLS policies include a system context bypass for administrative operations:

```sql
CREATE POLICY tenant_isolation ON app.table_name
    USING (
        app.is_system_context()
        OR tenant_id = current_setting('app.current_tenant')::uuid
    );

CREATE POLICY tenant_isolation_insert ON app.table_name
    FOR INSERT WITH CHECK (
        app.is_system_context()
        OR tenant_id = current_setting('app.current_tenant')::uuid
    );
```

The `app.is_system_context()` function checks a session-level flag set by `app.enable_system_context()`. This is used for:
- Bootstrap scripts
- Background workers processing cross-tenant data
- Test setup/teardown

### Tables Exempt from RLS

Some system tables do not require tenant isolation:

| Table | Reason |
|-------|--------|
| `app.tenants` | Defines tenants themselves |
| `app.users` | Cross-tenant user records |
| `app."user"` | Better Auth user table |
| `app."session"` | Better Auth session table |
| `app."account"` | Better Auth account table |
| `public.schema_migrations` | Migration tracking |

---

## Database Roles

The platform uses two PostgreSQL roles with different privilege levels:

### `hris` (Admin/Superuser)

- **Purpose**: Migrations, schema changes, administrative operations
- **Properties**: Superuser privileges
- **Used by**: Migration runner, bootstrap scripts, Docker init script
- **Connection**: Direct to PostgreSQL (bypasses PgBouncer)
- **URL variable**: `DATABASE_URL`

### `hris_app` (Application Role)

- **Purpose**: Runtime application queries
- **Properties**: `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, **`NOBYPASSRLS`**
- **Used by**: API server, background worker, test runner
- **Connection**: Through PgBouncer (connection pooling)
- **URL variable**: `DATABASE_APP_URL`
- **Key constraint**: `NOBYPASSRLS` means all RLS policies are enforced at the database level

### Role Creation

The `hris_app` role is created by `docker/postgres/init.sql` during initial database setup:

```sql
CREATE ROLE hris_app LOGIN PASSWORD 'hris_dev_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
```

It is also bootstrapped by the test setup (`packages/api/src/test/setup.ts`) if missing.

---

## Schema Organization

All application tables live in the `app` schema:

```sql
CREATE SCHEMA IF NOT EXISTS app;
```

The migration tracker table lives in the `public` schema:

```sql
public.schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
)
```

The database client sets `search_path = 'app,public'` so that bare table names (e.g., `employees` instead of `app.employees`) resolve to the `app` schema.

---

## Enum Handling

PostgreSQL does not allow `ALTER TYPE ... ADD VALUE` inside a transaction. The migration runner detects this pattern and runs such migrations outside a transaction:

```sql
-- This migration will be run outside a transaction automatically
ALTER TYPE app.employee_status ADD VALUE IF NOT EXISTS 'on_leave';
```

The runner uses a regex check: `/ALTER\s+TYPE\s+.*ADD\s+VALUE/i`

If this pattern is found, the migration SQL is executed with `sql.unsafe()` without wrapping in `sql.begin()`.

---

## Migration Tracking

Applied migrations are tracked in `public.schema_migrations`:

```sql
SELECT filename, applied_at
FROM public.schema_migrations
ORDER BY filename;
```

```
filename                          | applied_at
0001_extensions.sql               | 2026-01-07 10:00:00+00
0002_tenants.sql                  | 2026-01-07 10:00:01+00
0003_users.sql                    | 2026-01-07 10:00:02+00
...
0234_fix_ci_test_failures_round2  | 2026-03-28 09:00:00+00
```

### Duplicate Object Handling

If a migration throws a "duplicate object" error (PostgreSQL error code `42710`, or message containing "already exists"), the runner:
1. Logs a warning: `"appears already applied; marking as applied"`
2. Inserts the filename into `schema_migrations` with `ON CONFLICT DO NOTHING`
3. Continues to the next migration

This handles cases where a migration was partially applied (e.g., a trigger was created but the transaction was not committed to `schema_migrations`).

---

## Rollback Strategy

Automated rollback (`migrate:down`) is not supported. The runner throws an error if the `down` command is used.

### Manual Rollback

Each migration file includes a commented-out DOWN section with the SQL needed to reverse the migration:

```sql
-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TRIGGER IF EXISTS update_leave_balances_updated_at ON app.leave_balances;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.leave_balances;
-- DROP POLICY IF EXISTS tenant_isolation ON app.leave_balances;
-- DROP INDEX IF EXISTS app.idx_leave_balances_employee;
-- DROP INDEX IF EXISTS app.idx_leave_balances_tenant;
-- DROP TABLE IF EXISTS app.leave_balances;
```

To rollback:
1. Uncomment the DOWN SQL
2. Execute it manually via `psql` as the `hris` admin user
3. Remove the corresponding row from `public.schema_migrations`

### Production Rollback

For production rollback, always:
1. Take a database backup first (`docker exec staffora-backup /scripts/backup-db.sh`)
2. Test the rollback SQL against a staging database
3. Execute the rollback during a maintenance window
4. Verify application health after rollback

---

## CI Validation

The `migration-check.yml` GitHub Actions workflow validates new migration files on every PR that changes the `migrations/` directory.

### Checks Performed

**1. Naming Convention**
- Verifies 4-digit prefix: `^[0-9]{4}_[a-z0-9_]+\.sql$`
- Rejects mixed case, hyphens, missing prefix

**2. RLS Compliance** (for files containing `CREATE TABLE`)
- Verifies presence of `tenant_id` column
- Verifies `ENABLE ROW LEVEL SECURITY` statement
- Verifies `tenant_isolation` policy

**Exempt tables**: `schema_migrations`, `domain_outbox`, `settings`, `feature_flags`

### Integration Test

The `migration-validation.test.ts` integration test also validates migration file integrity at test time.

---

## Known Quirks

### Duplicate Migration Numbers

Some migration numbers (0076-0079, 0187) have duplicate entries from parallel feature branches. This is a known quirk documented in `CLAUDE.md`. The migration runner handles this gracefully because it tracks by filename (not number). Files with the same prefix but different names are treated as separate migrations.

### Non-numbered Migration File

There is a non-numbered file `fix_schema_migrations_filenames.sql` in the `migrations/` directory. This file is not picked up by the migration runner (which only matches `^\d+_.+\.sql$`).

### Total Migration Files

The `migrations/` directory contains approximately 235 files (0001 through 0234, plus some duplicates and the README). The total file count exceeds the highest number due to duplicate entries.

---

## Operational Procedures

### First-Time Setup

```bash
# 1. Start Docker services
bun run docker:up

# 2. Run all migrations
bun run migrate:up

# 3. Bootstrap root tenant and admin user
bun run --filter @staffora/api bootstrap:root
```

### Adding a New Table

1. Check the highest migration number: `ls migrations/ | tail -5`
2. Create the migration: `bun run migrate:create add_new_table`
3. Write the SQL with table definition, indexes, RLS policies, triggers, and comments
4. Apply locally: `bun run migrate:up`
5. Verify in a test (create/read/update/delete, cross-tenant isolation)

### Checking Migration Status

```bash
# Connect to the database
psql -h localhost -U hris -d hris

# View applied migrations
SELECT filename, applied_at FROM public.schema_migrations ORDER BY filename DESC LIMIT 10;

# Check if a specific migration was applied
SELECT * FROM public.schema_migrations WHERE filename = '0234_fix_ci_test_failures_round2.sql';
```

### Re-running a Failed Migration

If a migration partially failed:

```bash
# Remove the tracking entry
psql -h localhost -U hris -d hris -c "DELETE FROM public.schema_migrations WHERE filename = '0235_my_migration.sql'"

# Fix the migration SQL, then re-apply
bun run migrate:up
```

### Database Reset (Development Only)

```bash
# Stop services
bun run docker:down

# Remove postgres volume
docker volume rm $(docker volume ls -q | grep postgres_data)

# Restart and re-migrate
bun run docker:up
bun run migrate:up
```
