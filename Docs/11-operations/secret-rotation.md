# Secret Rotation Guide

*Last updated: 2026-03-20*

This document covers how to safely rotate every secret used by the Staffora platform. Each section explains where the secret is consumed, the zero-downtime rotation procedure, and verification steps.

> **Prerequisites:**
> - SSH/exec access to the deployment environment
> - Access to `docker/.env` (or your secrets manager)
> - A maintenance window is recommended for database password rotation
> - The helper script `docker/scripts/rotate-secrets.sh` can generate new values for all secrets

---

## Table of Contents

1. [BETTER_AUTH_SECRET](#1-better_auth_secret)
2. [SESSION_SECRET](#2-session_secret)
3. [CSRF_SECRET](#3-csrf_secret)
4. [DATABASE_URL / PostgreSQL Passwords](#4-database_url--postgresql-passwords)
5. [Redis Password](#5-redis-password)
6. [S3 Credentials](#6-s3-credentials)
7. [SMTP Credentials](#7-smtp-credentials)
8. [Rotation Schedule](#rotation-schedule) (90-day enforcement, tracking table, alerts)
9. [SESSION_SECRET Dual-Key Transition](#session_secret-dual-key-transition)
10. [Audit Logging for Secret Rotation](#audit-logging-for-secret-rotation)
11. [Emergency Rotation](#emergency-rotation)
12. [Automated Rotation with Secrets Manager](#automated-rotation-with-secrets-manager)

---

## 1. BETTER_AUTH_SECRET

### Where It Is Used

| Component | File | Purpose |
|-----------|------|---------|
| Better Auth server | `packages/api/src/lib/better-auth.ts` | Session token encryption and signing |
| Auth config fallback | `packages/api/src/plugins/auth-better.ts` | CSRF secret fallback chain |
| Docker Compose | `docker/docker-compose.yml` | Passed to `api` container |
| Secret validation | `packages/api/src/config/secrets.ts` | Startup validation (required, 32+ chars) |

Better Auth uses this secret to encrypt and sign session tokens stored in cookies. Changing it **invalidates all existing sessions**, forcing every user to re-authenticate.

### How to Rotate (Brief Outage: All Sessions Invalidated)

There is no dual-secret support in Better Auth, so rotation causes a forced re-login for all users.

**Steps:**

1. **Generate new secret:**
   ```bash
   NEW_SECRET=$(openssl rand -base64 32)
   echo "BETTER_AUTH_SECRET=$NEW_SECRET"
   ```

2. **Update the environment:**
   ```bash
   # In docker/.env or your secrets manager
   BETTER_AUTH_SECRET=<new-value>
   ```

3. **Rolling restart the API and worker containers:**
   ```bash
   docker compose -f docker/docker-compose.yml restart api worker
   ```

4. **Verify** (see verification steps below).

### Verification

```bash
# 1. Check API starts without secret validation errors
docker logs staffora-api 2>&1 | grep -i "secret\|FATAL\|validation"

# 2. Verify health endpoint responds
curl -s http://localhost:3000/health | jq .

# 3. Attempt a fresh login through the UI or API
curl -s -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@staffora.co.uk","password":"<password>"}' \
  -c /tmp/cookies.txt

# 4. Verify the session cookie works
curl -s http://localhost:3000/api/v1/auth/me -b /tmp/cookies.txt | jq .status
# Expected: user data (not 401)
```

### Impact

- All active sessions are invalidated immediately.
- Users must re-authenticate (login again).
- MFA tokens (TOTP secrets) are unaffected -- they are stored separately.
- Schedule rotation during low-traffic hours or a maintenance window.

---

## 2. SESSION_SECRET

### Where It Is Used

| Component | File | Purpose |
|-----------|------|---------|
| Better Auth fallback | `packages/api/src/lib/better-auth.ts` | Fallback if `BETTER_AUTH_SECRET` is unset |
| CSRF signing fallback | `packages/api/src/plugins/auth-better.ts` | Second in CSRF secret fallback chain |
| Docker Compose | `docker/docker-compose.yml` | Passed to `api` container |

In the current architecture, `BETTER_AUTH_SECRET` takes precedence. `SESSION_SECRET` acts as a fallback and is also used in the CSRF token HMAC chain (`CSRF_SECRET -> SESSION_SECRET -> BETTER_AUTH_SECRET`).

### How to Rotate (Zero Downtime if BETTER_AUTH_SECRET Is Set)

If `BETTER_AUTH_SECRET` is set (which it should be in production), rotating `SESSION_SECRET` has **no user-facing impact** unless `CSRF_SECRET` is also unset.

**Steps:**

1. **Generate new secret:**
   ```bash
   NEW_SECRET=$(openssl rand -base64 32)
   echo "SESSION_SECRET=$NEW_SECRET"
   ```

2. **Update the environment:**
   ```bash
   SESSION_SECRET=<new-value>
   ```

3. **Rolling restart:**
   ```bash
   docker compose -f docker/docker-compose.yml restart api
   ```

4. **Verify** using the same steps as BETTER_AUTH_SECRET above.

### Impact

- If `BETTER_AUTH_SECRET` is set: no session impact.
- If `SESSION_SECRET` is used as CSRF fallback: outstanding CSRF tokens become invalid; forms in flight may fail once and succeed on retry.

---

## 3. CSRF_SECRET

### Where It Is Used

| Component | File | Purpose |
|-----------|------|---------|
| CSRF token generation | `packages/api/src/plugins/auth-better.ts` (`generateCsrfToken`) | HMAC-SHA256 signing of CSRF tokens |
| CSRF token validation | `packages/api/src/plugins/auth-better.ts` (`validateCsrfToken`) | Verifying CSRF tokens on mutating requests |
| Docker Compose | `docker/docker-compose.yml` | Passed to `api` container |

CSRF tokens have a format of `{sessionId}.{timestamp_base36}.{hmac_hex}` with a default max age of 8 hours.

### How to Rotate (Near-Zero Downtime)

Rotating invalidates all outstanding CSRF tokens. Since tokens are short-lived (8 hours) and the frontend fetches new tokens on page load, impact is minimal.

**Steps:**

1. **Generate new secret:**
   ```bash
   NEW_SECRET=$(openssl rand -base64 32)
   echo "CSRF_SECRET=$NEW_SECRET"
   ```

2. **Update the environment:**
   ```bash
   CSRF_SECRET=<new-value>
   ```

3. **Rolling restart:**
   ```bash
   docker compose -f docker/docker-compose.yml restart api
   ```

4. **Verify:**
   ```bash
   # Any in-flight form submission using the old CSRF token will fail with 403.
   # The frontend should retry by fetching a new CSRF token.
   # Verify new tokens work:
   curl -s http://localhost:3000/api/v1/auth/me -b /tmp/cookies.txt | jq .
   ```

### Impact

- In-flight mutating requests (POST/PUT/PATCH/DELETE) with old CSRF tokens will receive a 403 error.
- Users who reload the page get a new valid CSRF token automatically.
- No sessions are invalidated.

---

## 4. DATABASE_URL / PostgreSQL Passwords

### Where It Is Used

| Component | Env Var | Role | Purpose |
|-----------|---------|------|---------|
| API server | `DATABASE_APP_URL` | `hris_app` (NOBYPASSRLS) | All runtime queries with RLS enforced |
| API server fallback | `DATABASE_URL` | `hris` (superuser) | Migrations, Better Auth fallback |
| Worker | `DATABASE_APP_URL` | `hris_app` | Background job queries |
| Backup sidecar | `PGPASSWORD` | `hris` (superuser) | pg_dump backups |
| Better Auth pg Pool | `DATABASE_APP_URL` or `DATABASE_URL` | Depends on config | Session/user management |
| DB plugin | `packages/api/src/plugins/db.ts` | `hris_app` | postgres.js connection pool |
| Better Auth | `packages/api/src/lib/better-auth.ts` | `hris_app` | pg Pool (5 connections) |

There are two database roles to rotate:
- **`hris`** -- Superuser used for migrations and backups
- **`hris_app`** -- Application role with NOBYPASSRLS used at runtime

### How to Rotate (Requires Brief Connection Interruption)

PostgreSQL password changes take effect immediately for new connections. Existing pooled connections continue to work until they are recycled.

#### Rotating the `hris_app` (Application) Password

1. **Generate new password:**
   ```bash
   NEW_APP_PASSWORD=$(openssl rand -base64 24)
   echo "New hris_app password: $NEW_APP_PASSWORD"
   ```

2. **Change the password in PostgreSQL:**
   ```bash
   docker exec -i staffora-postgres psql -U hris -d hris -c \
     "ALTER USER hris_app WITH PASSWORD '$NEW_APP_PASSWORD';"
   ```

3. **Update the environment variables:**
   ```bash
   # In docker/.env:
   POSTGRES_APP_PASSWORD=<new-password>
   # DATABASE_APP_URL is constructed from this in docker-compose.yml
   ```

4. **Rolling restart API and worker (they will create new connections):**
   ```bash
   docker compose -f docker/docker-compose.yml restart api worker
   ```

5. **Verify:**
   ```bash
   # Check health endpoint
   curl -s http://localhost:3000/health | jq .

   # Check API logs for connection errors
   docker logs staffora-api --tail 20 2>&1 | grep -i "error\|failed\|connect"

   # Check worker logs
   docker logs staffora-worker --tail 20 2>&1 | grep -i "error\|failed\|connect"
   ```

#### Rotating the `hris` (Superuser) Password

1. **Generate new password:**
   ```bash
   NEW_SUPER_PASSWORD=$(openssl rand -base64 24)
   echo "New hris password: $NEW_SUPER_PASSWORD"
   ```

2. **Change the password in PostgreSQL:**
   ```bash
   # Connect as postgres superuser (initial bootstrap user)
   docker exec -i staffora-postgres psql -U postgres -c \
     "ALTER USER hris WITH PASSWORD '$NEW_SUPER_PASSWORD';"
   ```

3. **Update the environment variables:**
   ```bash
   # In docker/.env:
   POSTGRES_PASSWORD=<new-password>
   DATABASE_URL=postgres://hris:<new-password>@localhost:5432/hris
   ```

4. **Restart the backup sidecar (uses PGPASSWORD):**
   ```bash
   docker compose -f docker/docker-compose.yml restart backup
   ```

5. **Restart API and worker if they use DATABASE_URL as a fallback:**
   ```bash
   docker compose -f docker/docker-compose.yml restart api worker
   ```

6. **Verify:**
   ```bash
   # Run a manual backup to verify backup sidecar connectivity
   docker exec staffora-backup /scripts/backup-db.sh /backups

   # Run a migration to verify superuser connectivity
   bun run migrate:up
   ```

### Impact

- Existing connection pool connections will be recycled; brief query failures are possible during the restart window.
- The backup sidecar will fail until restarted with the new `PGPASSWORD`.
- Schedule during a low-traffic maintenance window.

---

## 5. Redis Password

### Where It Is Used

| Component | Env Var | Purpose |
|-----------|---------|---------|
| API server | `REDIS_URL` | Session caching, rate limiting, distributed locks, tenant cache |
| Worker | `REDIS_URL` | Redis Streams consumer (outbox, notifications, exports) |
| Redis container | `REDIS_PASSWORD` | `--requirepass` flag in docker-compose.yml |
| Cache plugin | `packages/api/src/plugins/cache.ts` | ioredis connection |
| Docker Compose healthcheck | `REDIS_PASSWORD` | `redis-cli -a` ping command |

### How to Rotate (Brief Reconnection Interruption)

Redis AUTH password changes require reconfiguring the running Redis server and then restarting all clients.

**Steps:**

1. **Generate new password:**
   ```bash
   NEW_REDIS_PASSWORD=$(openssl rand -base64 24)
   echo "New Redis password: $NEW_REDIS_PASSWORD"
   ```

2. **Set the new password on the running Redis server (keeps old password working too, temporarily):**
   ```bash
   # First, set the new password while keeping the old one active
   docker exec staffora-redis redis-cli \
     -a "${OLD_REDIS_PASSWORD}" --no-auth-warning \
     CONFIG SET requirepass "${NEW_REDIS_PASSWORD}"
   ```

3. **Update the environment variables:**
   ```bash
   # In docker/.env:
   REDIS_PASSWORD=<new-password>
   REDIS_URL=redis://:<new-password>@localhost:6379
   ```

4. **Restart API and worker to pick up the new password:**
   ```bash
   docker compose -f docker/docker-compose.yml restart api worker
   ```

5. **Restart Redis container to persist the config (the CONFIG SET is ephemeral):**
   ```bash
   docker compose -f docker/docker-compose.yml restart redis
   ```

6. **Verify:**
   ```bash
   # Verify Redis connectivity
   docker exec staffora-redis redis-cli \
     -a "${NEW_REDIS_PASSWORD}" --no-auth-warning PING
   # Expected: PONG

   # Verify API health
   curl -s http://localhost:3000/health | jq .

   # Check API logs
   docker logs staffora-api --tail 20 2>&1 | grep -i "redis\|cache"
   ```

### Impact

- After step 2, only the new password works on the running Redis instance.
- API/worker containers using the old password will experience reconnection errors until restarted.
- Redis Streams consumer groups are not lost; workers will resume from their last acknowledged position.
- Cached data (sessions, permissions, rate limits) is preserved across Redis restarts.

---

## 6. S3 Credentials

### Where It Is Used

| Component | Env Vars | Purpose |
|-----------|----------|---------|
| Export worker | `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION` | Upload exported files (CSV, Excel) |
| Storage service | `packages/api/src/lib/storage.ts` | Presigned upload/download URLs |
| Backup sidecar | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | S3 offsite backup uploads |

There are two independent sets of S3 credentials:
- **Application S3** (`S3_ACCESS_KEY` / `S3_SECRET_KEY`): Used by the API and worker for document/export storage
- **Backup S3** (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`): Used by the backup sidecar for offsite backups

### How to Rotate (Zero Downtime with IAM)

If using AWS IAM, the recommended approach is to create a new access key before revoking the old one.

**Steps:**

1. **Create new IAM access key in AWS Console or CLI:**
   ```bash
   aws iam create-access-key --user-name staffora-app
   # Note the new AccessKeyId and SecretAccessKey
   ```

2. **Update the environment variables:**
   ```bash
   # For application storage:
   S3_ACCESS_KEY=<new-access-key-id>
   S3_SECRET_KEY=<new-secret-access-key>

   # For backup sidecar (if separate credentials):
   AWS_ACCESS_KEY_ID=<new-access-key-id>
   AWS_SECRET_ACCESS_KEY=<new-secret-access-key>
   ```

3. **Restart affected containers:**
   ```bash
   docker compose -f docker/docker-compose.yml restart worker backup
   ```

4. **Verify:**
   ```bash
   # Trigger a test export or manually test S3 upload
   docker logs staffora-worker --tail 20 2>&1 | grep -i "s3\|storage\|upload"

   # Verify backup sidecar can reach S3
   docker exec staffora-backup aws s3 ls s3://${S3_BACKUP_BUCKET}/ --max-items 1

   # If tests pass, revoke the old access key in AWS
   aws iam delete-access-key --user-name staffora-app --access-key-id <old-access-key-id>
   ```

5. **Revoke old credentials in AWS (only after verifying new ones work):**
   ```bash
   aws iam delete-access-key --user-name staffora-app \
     --access-key-id <old-access-key-id>
   ```

### Impact

- No user-facing impact during rotation if done correctly.
- If old credentials are revoked before new ones are deployed, exports and backups will fail until restart.
- Presigned URLs generated with old credentials remain valid until their expiration time.

---

## 7. SMTP Credentials

### Where It Is Used

| Component | Env Vars | Purpose |
|-----------|----------|---------|
| Notification worker | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (or `SMTP_PASS`) | Sending transactional email via nodemailer |
| Docker Compose worker | `docker/docker-compose.yml` | Passed to `worker` container |

### How to Rotate (Zero Downtime)

SMTP credentials are used by the notification worker. Rotation is straightforward since each email creates a new connection.

**Steps:**

1. **Generate new SMTP credentials** in your email provider (SES, SendGrid, Postmark, etc.).

2. **Update the environment variables:**
   ```bash
   SMTP_USER=<new-smtp-username>
   SMTP_PASSWORD=<new-smtp-password>
   ```

3. **Restart the worker container:**
   ```bash
   docker compose -f docker/docker-compose.yml restart worker
   ```

4. **Verify:**
   ```bash
   # Check worker logs for SMTP connection errors
   docker logs staffora-worker --tail 30 2>&1 | grep -i "smtp\|email\|notification\|error"

   # Trigger a test notification (e.g., password reset email)
   # or wait for the next scheduled notification and check delivery
   ```

5. **Revoke old SMTP credentials** in your email provider.

### Impact

- No user-facing impact. Emails in the Redis Stream queue will be retried with new credentials.
- If the worker is restarted while emails are queued, they will be processed after restart.
- Failed email deliveries are tracked in the `domain_outbox` table and can be retried.

---

## Rotation Schedule

| Secret | Recommended Frequency | Urgency After Compromise |
|--------|----------------------|--------------------------|
| BETTER_AUTH_SECRET | Every 90 days | **Immediate** -- attacker can forge sessions |
| SESSION_SECRET | Every 90 days | High -- potential session forgery if used as primary |
| CSRF_SECRET | Every 90 days | Medium -- can forge CSRF tokens (requires session too) |
| PostgreSQL passwords | Every 90 days | **Immediate** -- direct data access |
| Redis password | Every 90 days | High -- session cache access, rate limit bypass |
| S3 credentials | Every 90 days | High -- access to documents and backups |
| SMTP credentials | Every 180 days | Low -- can send email as the platform |

### 90-Day Rotation Enforcement

To ensure the 90-day rotation schedule is followed, maintain a rotation ledger. This can be a database table, a secrets manager metadata field, or the tracking table below.

**Rotation Tracking Table:**

| Secret | Last Rotated | Next Due | Rotated By | Verification |
|--------|-------------|----------|------------|-------------|
| BETTER_AUTH_SECRET | *[date]* | *[date + 90d]* | *[engineer]* | *[ticket/PR]* |
| SESSION_SECRET | *[date]* | *[date + 90d]* | *[engineer]* | *[ticket/PR]* |
| CSRF_SECRET | *[date]* | *[date + 90d]* | *[engineer]* | *[ticket/PR]* |
| PostgreSQL hris | *[date]* | *[date + 90d]* | *[engineer]* | *[ticket/PR]* |
| PostgreSQL hris_app | *[date]* | *[date + 90d]* | *[engineer]* | *[ticket/PR]* |
| Redis password | *[date]* | *[date + 90d]* | *[engineer]* | *[ticket/PR]* |
| S3 app credentials | *[date]* | *[date + 90d]* | *[engineer]* | *[ticket/PR]* |
| S3 backup credentials | *[date]* | *[date + 90d]* | *[engineer]* | *[ticket/PR]* |
| SMTP credentials | *[date]* | *[date + 180d]* | *[engineer]* | *[ticket/PR]* |

**Automated reminders:**

Set a recurring calendar event or monitoring alert 14 days before each rotation due date. If using AWS Secrets Manager, enable the rotation schedule with `AutomaticallyAfterDays: 90` (see Automated Rotation section below). If using manual rotation, configure a cron-based alerting rule:

```yaml
# prometheus-rules.yml
groups:
  - name: secret_rotation_reminders
    rules:
      - alert: SecretRotationDue
        # This alert is triggered by a custom metric pushed by a rotation-tracking script
        expr: staffora_secret_rotation_days_until_due < 14
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Secret {{ $labels.secret_name }} rotation due in {{ $value }} days"
          description: "Rotate this secret before it exceeds the 90-day policy."

      - alert: SecretRotationOverdue
        expr: staffora_secret_rotation_days_until_due < 0
        for: 1h
        labels:
          severity: critical
        annotations:
          summary: "Secret {{ $labels.secret_name }} rotation is OVERDUE"
          description: "This secret has exceeded its 90-day rotation window. Rotate immediately."
```

---

## SESSION_SECRET Dual-Key Transition

The `SESSION_SECRET` serves as a fallback in the CSRF signing chain (`CSRF_SECRET -> SESSION_SECRET -> BETTER_AUTH_SECRET`). When `BETTER_AUTH_SECRET` is set (which it must be in production), `SESSION_SECRET` is not used for session token signing. However, it is used in the CSRF HMAC chain.

### Why Dual-Key Matters

During rotation, there is a window where some API instances have the old secret and some have the new secret. In a horizontally scaled deployment (e.g., `--scale api=3`), a rolling restart means:

1. Instance 1 restarts with the new `SESSION_SECRET`
2. Instance 2 still has the old `SESSION_SECRET`
3. A CSRF token generated by Instance 2 (old key) arrives at Instance 1 (new key) and fails validation

### Dual-Key Transition Procedure

To avoid CSRF validation failures during rotation, use a dual-key approach where both the old and new secrets are temporarily accepted:

**Step 1: Add dual-key support in the environment**

```bash
# In docker/.env, set both the current and the new secret:
SESSION_SECRET=<new-secret>
SESSION_SECRET_PREVIOUS=<old-secret>
```

**Step 2: Update the CSRF validation to check both keys**

The application code in `packages/api/src/plugins/auth-better.ts` should check the CSRF token against both `SESSION_SECRET` and `SESSION_SECRET_PREVIOUS` during the transition window. This is a code change that should be implemented once and left in place permanently:

```typescript
// In validateCsrfToken():
// 1. Try validating with the current CSRF_SECRET / SESSION_SECRET
// 2. If that fails and SESSION_SECRET_PREVIOUS is set, retry with the previous key
// 3. If both fail, reject the token
```

**Step 3: Rolling restart**

```bash
docker compose -f docker/docker-compose.yml restart api
```

During the restart, all instances pick up both secrets. CSRF tokens signed with either key are accepted.

**Step 4: Remove the previous key (after 24 hours)**

After the CSRF token max age (8 hours) has elapsed and all tokens signed with the old key have expired:

```bash
# Remove SESSION_SECRET_PREVIOUS from docker/.env
# (or set it to empty)
SESSION_SECRET_PREVIOUS=

# Restart to apply
docker compose -f docker/docker-compose.yml restart api
```

### Dual-Key Timeline

```
T+0h:   Set SESSION_SECRET=<new> and SESSION_SECRET_PREVIOUS=<old>
T+0h:   Rolling restart begins
T+0-5m: Rolling restart completes; all instances accept both keys
T+8h:   All CSRF tokens signed with old key have expired
T+24h:  Safe to remove SESSION_SECRET_PREVIOUS (conservative buffer)
T+24h:  Final restart to drop previous key from memory
```

---

## Audit Logging for Secret Rotation

Every secret rotation event must be logged for compliance (UK GDPR Article 32, demonstrating security measures) and forensic purposes.

### What to Log

| Field | Description | Example |
|-------|-------------|---------|
| `timestamp` | UTC time of the rotation | `2026-03-20T14:30:00Z` |
| `secret_name` | Which secret was rotated | `BETTER_AUTH_SECRET` |
| `rotated_by` | Engineer who performed the rotation | `jane.smith` |
| `method` | How the rotation was performed | `manual`, `secrets-manager-auto`, `emergency` |
| `reason` | Why the rotation was performed | `scheduled-90-day`, `suspected-compromise`, `employee-departure` |
| `services_restarted` | Which containers were restarted | `api, worker` |
| `verification_result` | Whether post-rotation verification passed | `pass`, `fail` |
| `impact` | User-facing impact | `all-sessions-invalidated`, `zero-downtime`, `csrf-tokens-reset` |
| `ticket_id` | Link to the change management ticket | `OPS-1234` |

### Where to Log

**Option A: Audit log table (recommended)**

Insert a record into `app.audit_log` using the system context (bypassing RLS):

```bash
docker exec -i staffora-postgres psql -U hris -d hris -c "
  SELECT app.enable_system_context();
  INSERT INTO app.audit_log (id, tenant_id, user_id, action, resource_type, details, created_at)
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000',
    'secret_rotated',
    'system',
    '{
      \"secret_name\": \"BETTER_AUTH_SECRET\",
      \"rotated_by\": \"jane.smith\",
      \"method\": \"manual\",
      \"reason\": \"scheduled-90-day\",
      \"services_restarted\": [\"api\", \"worker\"],
      \"verification_result\": \"pass\",
      \"ticket_id\": \"OPS-1234\"
    }'::jsonb,
    now()
  );
  SELECT app.disable_system_context();
"
```

**Option B: Structured log entry**

If inserting into the database is not practical (e.g., during a database password rotation where the database is briefly unavailable), log to a file:

```bash
echo "{
  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"event\": \"secret_rotated\",
  \"secret_name\": \"POSTGRES_APP_PASSWORD\",
  \"rotated_by\": \"jane.smith\",
  \"method\": \"manual\",
  \"reason\": \"scheduled-90-day\",
  \"verification_result\": \"pass\"
}" >> /var/log/staffora/secret-rotation.log
```

This log file should be collected by Promtail and indexed in Loki for centralized querying.

**Option C: AWS CloudTrail (if using Secrets Manager)**

When secrets are managed by AWS Secrets Manager, rotation events are automatically logged in CloudTrail. Ensure CloudTrail is enabled for the `eu-west-2` region and that `secretsmanager:RotateSecret` events are not filtered.

### Rotation Audit Query

To review all secret rotations in the last 90 days:

```sql
-- In PostgreSQL
SELECT
  details->>'secret_name' AS secret,
  details->>'rotated_by' AS rotated_by,
  details->>'reason' AS reason,
  details->>'verification_result' AS result,
  created_at
FROM app.audit_log
WHERE action = 'secret_rotated'
  AND created_at > now() - interval '90 days'
ORDER BY created_at DESC;
```

```logql
# In Loki
{job="staffora-api"} |= "secret_rotated" | json | line_format "{{.secret_name}} rotated by {{.rotated_by}} at {{.timestamp}}"
```

---

## Emergency Rotation

If a secret is suspected to be compromised, follow these steps immediately:

1. **Rotate the compromised secret** using the procedure above.
2. **Invalidate all sessions** (if auth secrets were compromised):
   ```bash
   # Flush all session data from Redis
   docker exec staffora-redis redis-cli \
     -a "${REDIS_PASSWORD}" --no-auth-warning \
     EVAL "local keys = redis.call('keys', 'staffora:session:*'); for i,k in ipairs(keys) do redis.call('del', k) end; return #keys" 0

   # Truncate Better Auth sessions table
   docker exec -i staffora-postgres psql -U hris -d hris -c \
     "DELETE FROM app.\"session\";"
   ```
3. **Restart all containers:**
   ```bash
   docker compose -f docker/docker-compose.yml restart
   ```
4. **Audit access logs** for unauthorized activity:
   ```bash
   # Check API access logs
   docker logs staffora-api --since 24h 2>&1 | grep -E "401|403|error"

   # Check audit log table
   docker exec -i staffora-postgres psql -U hris -d hris -c \
     "SELECT * FROM app.audit_logs ORDER BY created_at DESC LIMIT 50;"
   ```
5. **Notify affected users** if data exposure is suspected (GDPR Article 33/34).
6. **File an incident report** and update the risk register.

---

## Automated Rotation with Secrets Manager

For production deployments, consider integrating with a secrets manager for automated rotation:

### AWS Secrets Manager

```bash
# Store secrets
aws secretsmanager create-secret \
  --name staffora/production/auth \
  --secret-string '{"BETTER_AUTH_SECRET":"...","SESSION_SECRET":"...","CSRF_SECRET":"..."}'

# Enable automatic rotation (90-day schedule)
aws secretsmanager rotate-secret \
  --secret-id staffora/production/auth \
  --rotation-lambda-arn arn:aws:lambda:eu-west-2:ACCOUNT:function:staffora-secret-rotator \
  --rotation-rules '{"AutomaticallyAfterDays":90}'
```

### HashiCorp Vault

```bash
# Store secrets
vault kv put secret/staffora/production \
  BETTER_AUTH_SECRET="..." \
  SESSION_SECRET="..." \
  CSRF_SECRET="..."

# Configure database secret engine for dynamic PostgreSQL credentials
vault write database/config/staffora \
  plugin_name=postgresql-database-plugin \
  connection_url="postgresql://{{username}}:{{password}}@postgres:5432/hris" \
  allowed_roles="staffora-app"
```

---

## Helper Script

The helper script at `docker/scripts/rotate-secrets.sh` generates new random values for all secrets and outputs the required environment variable updates. It does **not** apply the changes automatically -- you must review and apply them manually.

```bash
# Generate new secrets (dry run, prints to stdout)
./docker/scripts/rotate-secrets.sh

# Generate and write directly to docker/.env (with backup)
./docker/scripts/rotate-secrets.sh --apply
```

---

## Related Documents

- [Production Checklist](production-checklist.md) -- Secrets management section
- [Security Patterns](../02-architecture/security-patterns.md) -- RLS, auth, RBAC patterns
- [Deployment Guide](../05-development/DEPLOYMENT.md) -- Container deployment instructions
- [Docker Guide](../06-devops/docker-guide.md) -- Docker Compose configuration
- [SLA/SLO Definitions](sla-slo-definitions.md) -- Service level objectives (rotation should not breach SLOs)
- [DR Drill Schedule](dr-drill-schedule.md) -- Recovery drills that may require credential access
- [Multi-Region Plan](multi-region-plan.md) -- Secrets must be rotated in both regions
- [Log Aggregation](log-aggregation.md) -- Loki queries for rotation audit trail
