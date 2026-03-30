# Backup Verification

*Last updated: 2026-03-28*

Automated restore testing and integrity validation for Staffora database backups.

## Overview

The backup verification system ensures that database backups are not just created, but are actually restorable and contain valid data. It addresses a critical gap: without automated restore testing, corrupted backups may go undetected until a disaster recovery scenario when it is too late.

The verification script (`docker/scripts/verify-backup.sh`) performs a full restore test by spinning up an isolated temporary PostgreSQL container, restoring the backup into it, and running a comprehensive set of integrity checks against the restored database.

## How It Works

The verification process has five steps:

1. **Checksum validation** -- Computes SHA256 of the backup file and verifies it against a stored `.sha256` sidecar file (if present) or an explicitly provided checksum. Also validates gzip archive integrity.
2. **Temporary container startup** -- Spins up a disposable `postgres:16` Docker container with performance-optimized settings (fsync=off, full_page_writes=off) since data durability is not needed for a verification-only restore.
3. **Backup restore** -- Initialises the `app` schema with required functions and types (matching `docker/postgres/init.sql`), then restores the full backup SQL into the temporary database.
4. **Integrity checks** -- Validates the restored database against 12 criteria (see Integrity Checks below).
5. **Cleanup and report** -- Removes the temporary container and outputs a structured pass/fail report.

## Integrity Checks

The script runs the following checks against the restored database:

| Check | What It Verifies | Failure Severity |
|-------|-----------------|-----------------|
| SHA256 checksum | File has not been corrupted or tampered with | FAIL |
| Gzip integrity | Archive is a valid gzip file | FAIL (aborts) |
| Container startup | Temporary PostgreSQL starts and accepts connections | FAIL (aborts) |
| Schema initialisation | Base schema and functions can be created | FAIL (aborts) |
| Backup restore | SQL restore completes without critical errors | FAIL / WARN |
| App schema has tables | The `app` schema contains tables | FAIL |
| Critical tables present | 12 core tables exist (tenants, users, employees, roles, etc.) | FAIL |
| RLS enabled on tenant tables | Tables with `tenant_id` have row-level security enabled | WARN |
| RLS policies present | Row-level security policies exist | FAIL |
| Database indexes | Indexes are present in the `app` schema | FAIL |
| Database triggers | Triggers exist (updated_at, audit, etc.) | WARN |
| Database functions | Functions exist in the `app` schema | WARN |
| Enum types | PostgreSQL enum types are present | WARN |
| Foreign key constraints | Foreign key relationships are intact | WARN |
| RLS context functions | `enable_system_context()` and tenant queries work | FAIL |

## Usage

### Manual verification

```bash
# Verify a specific backup file
./docker/scripts/verify-backup.sh docker/backups/staffora_hris_20260317_020000.sql.gz

# Verify and save a SHA256 checksum alongside the backup
./docker/scripts/verify-backup.sh docker/backups/staffora_hris_20260317_020000.sql.gz --save-checksum

# Verify against a known checksum
./docker/scripts/verify-backup.sh docker/backups/staffora_hris_20260317_020000.sql.gz \
  --checksum a1b2c3d4e5f6...

# Verify the most recent local backup
./docker/scripts/verify-backup.sh --latest

# Inside the backup sidecar container
docker exec staffora-backup /scripts/verify-backup.sh --latest
```

### Automated verification (integrated with backup schedule)

Verification is controlled by two environment variables:

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `VERIFY_BACKUP` | `false`, `true`/`always`, `weekly` | `weekly` | When to run verification |
| `VERIFY_BACKUP_DAY` | `1`-`7` (1=Mon, 7=Sun) | `7` (Sunday) | Day for weekly verification |

Set these in `docker/.env`:

```bash
# Verify every backup (use for production, adds ~30-60s per backup)
VERIFY_BACKUP=always

# Verify once per week on Sundays (default, good for most environments)
VERIFY_BACKUP=weekly
VERIFY_BACKUP_DAY=7

# Disable verification (not recommended for production)
VERIFY_BACKUP=false
```

Or pass them in docker-compose:

```yaml
backup:
  environment:
    VERIFY_BACKUP: always
```

### Debugging a failed verification

If verification fails, you can keep the temporary container running for investigation:

```bash
VERIFY_KEEP_CONTAINER=true ./docker/scripts/verify-backup.sh --latest
# Then connect:
docker exec -it staffora-backup-verify-<PID> psql -U hris -d hris
# When done:
docker rm -f staffora-backup-verify-<PID>
```

## SHA256 Checksums

Every backup now automatically generates a `.sha256` sidecar file. For example:

```
docker/backups/
  staffora_hris_20260317_020000.sql.gz
  staffora_hris_20260317_020000.sql.gz.sha256
```

The `.sha256` file contains the SHA256 hash and filename in the standard format used by `sha256sum`:

```
a1b2c3d4e5f6...  staffora_hris_20260317_020000.sql.gz
```

This enables:
- **Tamper detection** -- Verify a backup has not been modified since creation
- **Transfer validation** -- Confirm a backup was not corrupted during S3 upload/download
- **Audit trail** -- Checksums provide evidence of backup integrity at creation time

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VERIFY_BACKUP` | `weekly` | When to verify: `false`, `true`/`always`, `weekly` |
| `VERIFY_BACKUP_DAY` | `7` | Day for weekly verification (1=Mon, 7=Sun) |
| `VERIFY_PG_IMAGE` | `postgres:16` | Docker image for temporary container |
| `VERIFY_PG_PASSWORD` | (random) | Password for temporary container |
| `VERIFY_TIMEOUT` | `30` | Seconds to wait for container startup |
| `VERIFY_KEEP_CONTAINER` | `false` | Keep temp container after verification |
| `BACKUP_DIR` | (auto-detected) | Override backup directory for `--latest` |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Verification passed (all checks passed, or passed with warnings) |
| 1 | Verification failed (one or more critical checks failed) |
| 2 | Invalid arguments, missing prerequisites, or file not found |

## Example Output

```
=================================================================
  Staffora Backup Verification
=================================================================
  File:    staffora_hris_20260317_020000.sql.gz
  Size:    4.2M
  Image:   postgres:16
  Timeout: 30s
=================================================================

[2026-03-17T03:00:15+00:00] INFO: Step 1/5: Checksum validation...
[2026-03-17T03:00:15+00:00] INFO:   SHA256: a1b2c3d4...
[2026-03-17T03:00:15+00:00] INFO:   Verifying gzip integrity...
[2026-03-17T03:00:16+00:00] INFO: Step 2/5: Starting temporary PostgreSQL container...
[2026-03-17T03:00:22+00:00] INFO: Step 3/5: Restoring backup into temporary container...
[2026-03-17T03:00:35+00:00] INFO: Step 4/5: Running integrity checks...
[2026-03-17T03:00:36+00:00] INFO: Step 5/5: Generating report...

=================================================================
  Backup Verification Report
=================================================================
  File:     staffora_hris_20260317_020000.sql.gz
  Size:     4.2M
  SHA256:   a1b2c3d4...
  Restored: 13s

  Schema:   142 tables, 1067 indexes, 89 triggers
            47 functions, 15 enums, 203 foreign keys
            98 RLS-enabled tables, 196 RLS policies

  Checks:
  [PASS] SHA256 checksum matches stored .sha256 file
  [PASS] Gzip archive integrity
  [PASS] Temporary container startup -- Ready in 6s
  [PASS] Schema initialization in temp container
  [PASS] Backup restore -- Completed in 13s
  [PASS] App schema has tables -- 142 tables found
  [PASS] Critical tables present (12/12)
  [PASS] RLS enabled on tenant tables -- 98 RLS-enabled tables, 98 tables with tenant_id
  [PASS] RLS policies present -- 196 policies found
  [PASS] Database indexes present -- 1067 indexes found
  [PASS] Database triggers present -- 89 triggers found
  [PASS] Database functions present -- 47 functions found
  [PASS] Enum types present -- 15 enums found
  [PASS] Foreign key constraints -- 203 foreign keys found
  [PASS] RLS context functions operational -- 2 tenants in backup

  RESULT: PASSED (15/15 checks passed)
=================================================================
```

## Architecture Notes

### Why a separate container?

The verification script restores the backup into a completely isolated, disposable PostgreSQL container rather than the production database or a shared test instance. This ensures:

- **No risk to production data** -- The restore runs in a throwaway container
- **No dependency on running services** -- Only Docker is required
- **Accurate simulation** -- Uses the same PostgreSQL version (16) as production
- **Clean environment** -- Each verification starts from a blank database

### Performance tuning

The temporary container disables durability features (`fsync=off`, `full_page_writes=off`, `synchronous_commit=off`) since we only need to verify the restore succeeds, not persist the data. This significantly speeds up the restore step.

### Integration with backup pipeline

The verification integrates with the existing backup pipeline at two levels:

1. **Checksum generation** -- `backup-db.sh` now computes and stores SHA256 after every backup
2. **Optional restore test** -- `backup-db.sh` invokes `verify-backup.sh` based on the `VERIFY_BACKUP` schedule

Verification failures are logged as warnings but do not delete the backup file or prevent S3 upload. The rationale: a backup that fails verification may still be partially restorable, which is better than no backup at all.

## Related Documentation

- [Production Checklist](production-checklist.md) -- Database operations requirements
- [Docker Development Guide](../06-devops/docker-guide.md) -- Container management
- [Deployment Guide](../05-development/DEPLOYMENT.md) -- Production deployment procedures
