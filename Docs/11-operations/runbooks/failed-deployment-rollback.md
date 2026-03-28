# Failed Deployment Rollback

*Last updated: 2026-03-28*

**Severity: P1 - Critical**
**Affected Components:** Elysia.js API, React Frontend, Background Worker, Database Migrations

## Symptoms / Detection

- Deployment completed but the application is exhibiting errors (5xx spike, broken UI, worker failures).
- Health checks fail after a deployment.
- Users report new bugs or broken functionality immediately after a release.
- Monitoring shows a sharp change in error rate, latency, or success rate coinciding with the deployment timestamp.

### Quick Check

```bash
# Check when the current containers were started
docker compose -f docker/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Image}}"

# Check API health
curl -s http://localhost:3000/health | jq .

# Check recent deployments in git
git log --oneline -5

# Check if the latest migration was applied
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT filename, applied_at FROM app.schema_migrations ORDER BY applied_at DESC LIMIT 5;"
```

## Impact Assessment

- **User Impact:** Application may be partially or fully broken. Users may lose access to specific features or the entire platform.
- **Data Impact:** If a bad migration ran, data may have been altered. If the migration is forward-only (added columns/tables), rollback is straightforward. If it dropped or modified data, recovery may require a backup.
- **Downstream:** Worker may be processing events with new code that depends on schema changes. Rolling back the API without rolling back the worker could cause inconsistencies.

## Immediate Actions

### Step 1: Assess the Severity

Determine whether a rollback is necessary or if a hotfix is faster:

- **Rollback if:** The application is completely broken, data integrity is at risk, or the fix is not obvious.
- **Hotfix if:** The issue is isolated to a single endpoint/page and a fix is clear and quick.

### Step 2: Rollback Application Containers

```bash
# If using tagged Docker images, revert to the previous tag
# Example: roll back to a known good image
docker compose -f docker/docker-compose.yml stop api worker web

# Update the image tags in docker-compose.yml or use an override:
cat > /tmp/rollback-override.yml << 'OVERRIDE'
services:
  api:
    image: staffora/api:${ROLLBACK_TAG}
  worker:
    image: staffora/api:${ROLLBACK_TAG}
  web:
    image: staffora/web:${ROLLBACK_TAG}
OVERRIDE

ROLLBACK_TAG=<previous-tag> docker compose \
  -f docker/docker-compose.yml \
  -f /tmp/rollback-override.yml \
  up -d api worker web
```

### Step 3: Rollback from Git (if building locally)

```bash
# Find the last known good commit
git log --oneline -10

# Check out the previous commit
git checkout <good-commit-hash>

# Rebuild and restart
docker compose -f docker/docker-compose.yml build api web
docker compose -f docker/docker-compose.yml up -d api worker web
```

### Step 4: Rollback Database Migration (if applicable)

Only do this if the new deployment included a migration AND the migration has a DOWN section.

```bash
# Check which migration was last applied
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT filename, applied_at FROM app.schema_migrations ORDER BY applied_at DESC LIMIT 3;"

# Run the down migration
bun run migrate:down

# Verify the rollback
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT filename, applied_at FROM app.schema_migrations ORDER BY applied_at DESC LIMIT 3;"
```

**WARNING:** If the migration dropped columns, renamed tables, or deleted data, rolling it back will NOT restore lost data. You will need to restore from a backup. See the [Database Migration Failure](database-migration-failure.md) runbook.

### Step 5: Verify the Rollback

```bash
# Check all services are running
docker compose -f docker/docker-compose.yml ps

# Check API health
curl -s http://localhost:3000/health | jq .

# Check a few critical endpoints
curl -s http://localhost:3000/api/v1/hr/employees?limit=1 \
  -H "Cookie: <valid-session-cookie>" | jq .status

# Check worker is processing
docker compose -f docker/docker-compose.yml logs --tail=20 worker
```

## Root Cause Investigation

### Common Causes

1. **Untested Code Path**
   - A feature worked in development but fails in production due to different data, configuration, or scale.

2. **Migration Incompatibility**
   - A migration altered a column type or constraint that existing code depends on.
   - The migration ran successfully but broke queries that use the modified table.

3. **Environment Configuration**
   - A new environment variable was required but not set in production.
   - Check `docker/.env` against `docker/.env.example`.

4. **Dependency Version Mismatch**
   - A dependency was updated in `bun.lockb` but not tested against the production data set.

5. **Stale Cache**
   - Old cached data incompatible with the new code schema.

### Investigation Steps

```bash
# Compare the deployed commit with the previous one
git diff <old-commit>..<new-commit> --stat

# Check for migration files in the diff
git diff <old-commit>..<new-commit> --name-only | grep migrations/

# Check for new environment variables
git diff <old-commit>..<new-commit> -- docker/.env.example

# Review API error logs around the deployment time
docker compose -f docker/docker-compose.yml logs --since="1h" api | grep -iE 'error|fatal'
```

## Resolution Steps

1. **Stabilise:** Complete the rollback so the application is functional.
2. **Diagnose:** Identify the exact cause using the investigation steps above.
3. **Fix Forward:** Apply the fix to the codebase, run the full test suite, and deploy again.
4. **Validate:** Monitor the new deployment closely for 30 minutes.

### If the Migration Cannot Be Rolled Back

```bash
# Take a manual backup before any manual intervention
docker exec -it staffora-postgres pg_dump -U hris -d hris --schema=app -Fc > /tmp/pre-fix-backup.dump

# Apply manual SQL fixes
docker exec -it staffora-postgres psql -U hris -d hris -c "
  -- Example: revert a column type change
  ALTER TABLE app.some_table ALTER COLUMN some_column TYPE varchar(255);
"
```

## Post-Incident

- [ ] Application is running on the known-good version.
- [ ] Health checks pass consistently.
- [ ] Error rate has returned to baseline.
- [ ] Worker is processing the outbox.
- [ ] Confirm no data corruption occurred during the bad deployment.
- [ ] Schedule a fix-forward deployment with proper testing.
- [ ] Complete the [Post-Incident Template](post-incident-template.md).

## Prevention

- Run the full integration test suite (`bun test`) against a production-like database before deploying.
- Require manual approval for production deployments in CI/CD (already configured in the GitHub Actions workflow).
- Take an automated database backup before running migrations.
- Use feature flags to decouple deployment from feature activation.
- Ensure every migration has a tested DOWN section.
- Maintain a deployment checklist that includes environment variable verification.
- Practice rollbacks in staging to validate the procedure.
