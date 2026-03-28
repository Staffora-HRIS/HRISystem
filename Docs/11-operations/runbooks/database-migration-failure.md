# Database Migration Failure

*Last updated: 2026-03-28*

**Severity: P2 - High**
**Affected Components:** PostgreSQL 16, Database Migrations, Elysia.js API

## Symptoms / Detection

- `bun run migrate:up` exits with a non-zero status code.
- CI/CD pipeline fails at the migration step.
- PostgreSQL logs show syntax errors, constraint violations, or permission errors during migration.
- The `app.schema_migrations` table shows the failed migration was partially applied or not recorded.
- API starts but returns errors for queries that depend on the new schema.

### Quick Check

```bash
# Check which migrations have been applied
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT filename, applied_at FROM app.schema_migrations ORDER BY applied_at DESC LIMIT 10;"

# Check for the latest migration file
ls -la migrations/ | tail -5

# Try running the migration and capture the error
bun run migrate:up 2>&1
```

## Impact Assessment

- **User Impact:** If the migration is required for new features, those features will not work. Existing features should continue to work if the migration only adds new objects.
- **Data Impact:** Depends on the migration type:
  - **Additive (CREATE TABLE, ADD COLUMN):** Safe; failure leaves the database in its previous state.
  - **Destructive (DROP, ALTER TYPE, RENAME):** May leave the database in an inconsistent state if partially applied.
- **Deployment:** The deployment pipeline is blocked until the migration issue is resolved.

## Immediate Actions

### Step 1: Identify the Failing Migration

```bash
# Run migration with verbose output
DATABASE_URL="postgres://hris:${POSTGRES_PASSWORD}@localhost:5432/hris" bun run migrate:up 2>&1

# Check the migration file for syntax
cat migrations/<failing-migration>.sql
```

### Step 2: Check for Partial Application

PostgreSQL DDL is transactional. If the migration runner wraps each file in a transaction (Staffora's migrate.ts does this), a failure should roll back cleanly. However, some statements cannot be rolled back (e.g., `CREATE INDEX CONCURRENTLY`, `ALTER TYPE ... ADD VALUE`).

```bash
# Check if objects from the failed migration exist
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'app'
   ORDER BY table_name;" | grep <expected-table>

# Check if the migration was recorded
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT * FROM app.schema_migrations WHERE filename LIKE '%<migration-number>%';"
```

### Step 3: Fix the Migration

#### If the migration was NOT partially applied (clean rollback):

```bash
# Edit the migration file to fix the error
# Then re-run
bun run migrate:up
```

#### If the migration WAS partially applied:

```bash
# Connect and manually assess the state
docker exec -it staffora-postgres psql -U hris -d hris

# Check what objects exist from the migration
\dt app.*
\di app.*

# Manually drop partially created objects
DROP TABLE IF EXISTS app.<partial_table> CASCADE;
DROP INDEX IF EXISTS app.<partial_index>;

# Remove the migration record if it was inserted
DELETE FROM app.schema_migrations WHERE filename = '<failing-migration>.sql';

# Exit psql, fix the migration file, and re-run
bun run migrate:up
```

### Step 4: If the Migration Corrupted Data

```bash
# Restore from the most recent backup
# See Docs/operations/disaster-recovery.md for full procedure

# Check available backups
ls -la /backups/  # or check S3/backup storage

# Restore to a point before the migration
docker exec -it staffora-postgres pg_restore \
  -U hris -d hris --clean --if-exists \
  /backups/<latest-backup>.dump
```

## Root Cause Investigation

### Common Causes

1. **SQL Syntax Error**
   - Typo in the migration file. The error message from PostgreSQL will indicate the line and position.

2. **Object Already Exists**
   - The migration was previously partially applied, and now re-running it hits `relation already exists`.
   - Fix: Use `IF NOT EXISTS` in CREATE statements.

3. **Missing Dependency**
   - The migration references a table, column, or enum value that does not exist yet.
   - Fix: Check migration ordering. Staffora migrations use 4-digit numeric prefixes (`NNNN_`).

4. **Permission Error**
   - The `hris` (superuser) role should run migrations, not `hris_app`. Check which role the migration runner uses.
   - Verify: `SELECT current_user;` in the migration context.

5. **Enum Value in Transaction**
   - `ALTER TYPE ... ADD VALUE` cannot run inside a transaction in PostgreSQL.
   - Fix: Add enum values in a separate migration file or use the pattern from existing migrations that handle this.

6. **Concurrent Migration**
   - Two deployment processes tried to run migrations simultaneously.
   - Fix: Use advisory locks or ensure only one migration process runs.

### Investigation

```bash
# Check PostgreSQL error log for the exact failure
docker compose -f docker/docker-compose.yml logs --tail=100 postgres | grep -iE 'error|fatal'

# Check the migration runner configuration
cat packages/api/src/db/migrate.ts
```

## Resolution Steps

### For Additive Migrations (ADD COLUMN, CREATE TABLE)

1. Fix the SQL syntax or dependency.
2. Re-run `bun run migrate:up`.
3. Deploy the API.

### For Destructive Migrations (ALTER TYPE, DROP, RENAME)

1. Take a backup before retrying: `docker exec -it staffora-postgres pg_dump -U hris -d hris --schema=app -Fc > /tmp/pre-migration-backup.dump`
2. Manually clean up any partially applied changes.
3. Fix the migration file.
4. Re-run `bun run migrate:up`.
5. Verify schema integrity.

### Writing Safe Migrations

Follow these conventions (documented in `migrations/README.md`):

```sql
-- Use IF NOT EXISTS for creates
CREATE TABLE IF NOT EXISTS app.new_table (...);

-- Use IF EXISTS for drops
DROP TABLE IF EXISTS app.old_table;

-- Add columns as nullable first, backfill, then add constraint
ALTER TABLE app.employees ADD COLUMN IF NOT EXISTS new_field varchar(255);
UPDATE app.employees SET new_field = 'default' WHERE new_field IS NULL;
ALTER TABLE app.employees ALTER COLUMN new_field SET NOT NULL;

-- Always include RLS for tenant-owned tables
ALTER TABLE app.new_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.new_table
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_insert ON app.new_table
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);
```

## Post-Incident

- [ ] Migration runs successfully end-to-end.
- [ ] `app.schema_migrations` reflects the correct state.
- [ ] API starts and passes health checks.
- [ ] Queries that depend on the new schema work correctly.
- [ ] No data was lost or corrupted (spot-check key tables).

## Prevention

- Test all migrations against a copy of the production database before deploying.
- Use `IF NOT EXISTS` / `IF EXISTS` in all DDL statements.
- Never run destructive migrations without a verified backup.
- CI validates migration syntax and RLS compliance (existing GitHub Actions workflow).
- Write DOWN sections for every migration so rollback is possible.
- Use the 4-digit naming convention and check the highest existing number before creating new files.
- Run migrations with advisory locks to prevent concurrent execution.
