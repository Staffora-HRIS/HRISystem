# Security Incident Response

*Last updated: 2026-03-28*

**Severity: P1 - Critical**
**Affected Components:** All -- PostgreSQL, Redis, Elysia.js API, React Frontend, nginx, BetterAuth

## Symptoms / Detection

- Intrusion detection or WAF alerts fire.
- Unusual login patterns: bulk failed logins, successful logins from unexpected geolocations, or logins outside normal hours.
- Unexpected data access patterns: large data exports, queries against tables a user should not access, or RLS bypass attempts.
- User reports unauthorised changes to their profile, permissions, or data.
- Suspicious entries in the `app.audit_logs` table.
- Elevated privilege escalation: a non-admin user accessing admin endpoints.
- External notification: a security researcher, customer, or regulator reports a vulnerability or breach.

### Quick Detection Commands

```bash
# Check for recent failed login attempts (Better Auth)
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT email, \"createdAt\", \"ipAddress\"
   FROM app.\"session\"
   WHERE \"createdAt\" > now() - interval '1 hour'
   ORDER BY \"createdAt\" DESC LIMIT 20;"

# Check audit logs for suspicious activity
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT actor_id, action, resource_type, ip_address, created_at
   FROM app.audit_logs
   WHERE created_at > now() - interval '1 hour'
   ORDER BY created_at DESC LIMIT 50;"

# Check for RLS bypass attempts in PostgreSQL logs
docker compose -f docker/docker-compose.yml logs --tail=200 postgres | grep -iE 'permission denied|rls|policy'

# Check nginx access logs for suspicious patterns
docker compose -f docker/docker-compose.yml logs --tail=200 nginx | grep -E '(\.\.\/|<script|UNION.*SELECT|;.*DROP)'
```

## Impact Assessment

Categorise the incident before proceeding:

| Category | Description | GDPR Implication |
|----------|-------------|------------------|
| **Confidentiality Breach** | Unauthorised access to personal data | Potential ICO notification required within 72 hours |
| **Integrity Breach** | Unauthorised modification of data | May require data restoration and user notification |
| **Availability Breach** | Service disruption (DDoS, ransomware) | Business continuity plan activation |
| **Credential Compromise** | User or system credentials leaked | Immediate credential rotation required |

**GDPR Note:** Under UK GDPR, personal data breaches must be reported to the ICO within 72 hours if they pose a risk to data subjects. Document everything from the moment of detection.

## Immediate Actions

### Step 1: Contain the Incident

**Do NOT shut down systems unless data destruction is actively occurring.** Shutting down destroys volatile evidence.

```bash
# If a specific user account is compromised, revoke their sessions immediately
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "DELETE FROM app.\"session\" WHERE \"userId\" = '<compromised-user-id>';"

# If an API key or service account is compromised, rotate it
# Update the relevant environment variable in docker/.env and restart:
docker compose -f docker/docker-compose.yml restart api worker

# If an attacker is using a known IP, block at nginx level
# Add to docker/nginx/nginx.conf:
#   deny <attacker-ip>;
docker compose -f docker/docker-compose.yml restart nginx
```

### Step 2: Preserve Evidence

```bash
# Capture current state of all logs
docker compose -f docker/docker-compose.yml logs > /tmp/incident-logs-$(date +%Y%m%d-%H%M%S).log 2>&1

# Capture database audit trail
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "COPY (SELECT * FROM app.audit_logs WHERE created_at > now() - interval '24 hours' ORDER BY created_at)
   TO STDOUT WITH CSV HEADER" > /tmp/audit-logs-$(date +%Y%m%d-%H%M%S).csv

# Capture active sessions
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "COPY (SELECT * FROM app.\"session\" ORDER BY \"createdAt\" DESC)
   TO STDOUT WITH CSV HEADER" > /tmp/sessions-$(date +%Y%m%d-%H%M%S).csv

# Snapshot the PostgreSQL WAL position for point-in-time recovery reference
docker exec -it staffora-postgres psql -U hris -d hris -c "SELECT pg_current_wal_lsn();"
```

### Step 3: Assess the Blast Radius

```bash
# Determine which tenants are affected
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT DISTINCT tenant_id, action, resource_type, count(*)
   FROM app.audit_logs
   WHERE actor_id = '<suspected-actor-id>'
     AND created_at > now() - interval '7 days'
   GROUP BY tenant_id, action, resource_type
   ORDER BY count DESC;"

# Check if RLS was bypassed (should return 0 for properly isolated queries)
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT count(*) FROM app.audit_logs
   WHERE actor_id = '<suspected-actor-id>'
     AND tenant_id != '<actor-tenant-id>';"

# Check for privilege escalation
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT u.id, u.email, u.role, al.action, al.resource_type
   FROM app.users u
   JOIN app.audit_logs al ON al.actor_id = u.id::text
   WHERE al.created_at > now() - interval '24 hours'
     AND al.action IN ('role.updated', 'permission.granted', 'user.created')
   ORDER BY al.created_at DESC;"
```

### Step 4: Rotate Compromised Credentials

```bash
# Rotate all application secrets in docker/.env:
# - SESSION_SECRET
# - CSRF_SECRET
# - BETTER_AUTH_SECRET
# - REDIS_PASSWORD
# - POSTGRES_PASSWORD / POSTGRES_APP_PASSWORD

# After updating docker/.env, restart everything
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up -d

# Force all users to re-authenticate (invalidate all sessions)
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "DELETE FROM app.\"session\";"
```

### Step 5: Notify Stakeholders

1. **Internal:** Notify the engineering lead, CTO, and DPO (Data Protection Officer).
2. **Regulatory:** If personal data was exposed, the DPO must assess whether ICO notification is required (72-hour deadline under UK GDPR).
3. **Affected Users:** If data subjects are at risk, notify them without undue delay.

## Root Cause Investigation

### Common Attack Vectors

1. **SQL Injection**
   - Check for unusual query patterns in PostgreSQL slow query log.
   - Staffora uses postgres.js tagged templates which parameterise all values. Injection would indicate a code path using raw string concatenation.

2. **Authentication Bypass**
   - Check Better Auth logs for unusual session creation.
   - Verify CSRF protection is operational (`CSRF_SECRET` set, `SameSite=Strict`).

3. **Privilege Escalation**
   - Check if an attacker modified their own role or permissions.
   - Review the RBAC plugin (`src/plugins/rbac.ts`) for bypass conditions.

4. **Exposed Secrets**
   - Check if `.env` files, API keys, or tokens were committed to git.
   - Run: `git log --all --diff-filter=A -- '*.env' 'docker/.env'`

5. **Dependency Vulnerability**
   - Check for known vulnerabilities: `bun audit` or review Trivy scan results.

### Forensic Queries

```bash
# Check for data exfiltration (large result sets)
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT usename, query_start, rows, left(query, 150) AS query
   FROM pg_stat_activity
   WHERE rows > 1000
   ORDER BY rows DESC;"

# Check for schema modifications by non-admin users
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT * FROM app.audit_logs
   WHERE action LIKE 'schema.%'
     AND created_at > now() - interval '7 days'
   ORDER BY created_at DESC;"
```

## Resolution Steps

1. **Contain:** Block the attack vector (revoke access, block IP, disable compromised account).
2. **Eradicate:** Remove any backdoors, malicious data, or compromised tokens.
3. **Recover:** Restore data from backup if integrity was compromised. Re-deploy from a known-good commit.
4. **Verify:** Confirm the attack vector is closed. Run security tests.

```bash
# Run the security test suite to verify defences
cd packages/api && bun test src/test/security/
```

## Post-Incident

- [ ] All compromised credentials rotated.
- [ ] All affected user sessions invalidated.
- [ ] Attack vector identified and closed.
- [ ] Evidence preserved and stored securely.
- [ ] ICO notification assessed by DPO (if personal data breach).
- [ ] Affected data subjects notified (if required by UK GDPR).
- [ ] Complete the [Post-Incident Template](post-incident-template.md) within 48 hours.
- [ ] Security test added to prevent regression.

## Prevention

- Enable and monitor PostgreSQL audit logging (`pgaudit` extension).
- Review and rotate all secrets on a quarterly schedule. See `Docs/operations/secret-rotation.md`.
- Run dependency vulnerability scans in CI (Trivy, `bun audit`).
- Enforce MFA for all administrator accounts.
- Conduct periodic penetration testing.
- Maintain the principle of least privilege: `hris_app` role has NOBYPASSRLS and minimal permissions.
- Train the team on OWASP Top 10 and secure coding practices.
- Maintain an up-to-date asset inventory and threat model.
