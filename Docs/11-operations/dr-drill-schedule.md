# Disaster Recovery Drill Schedule

*Last updated: 2026-03-21*
*Document owner: Platform Engineering*
*Review cadence: After each drill; quarterly schedule review*

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Quarterly Drill Calendar](#2-quarterly-drill-calendar)
3. [Drill Types](#3-drill-types)
4. [Pre-Drill Checklist](#4-pre-drill-checklist)
5. [Drill Execution Procedures](#5-drill-execution-procedures)
6. [RTO/RPO Measurement Protocol](#6-rtorpo-measurement-protocol)
7. [Drill Report Template](#7-drill-report-template)
8. [Post-Drill Improvement Tracking](#8-post-drill-improvement-tracking)
9. [Drill History Log](#9-drill-history-log)
10. [Escalation During Drills](#10-escalation-during-drills)
11. [Related Documents](#11-related-documents)

---

## 1. Purpose

Disaster recovery drills validate that Staffora's recovery procedures work as documented and that the team can execute them under pressure. Without regular testing, DR plans become stale -- procedures drift from reality, credentials expire, and team members forget their roles.

**Regulatory requirement:** UK GDPR (Article 32(1)(d)) requires "a process for regularly testing, assessing and evaluating the effectiveness of technical and organisational measures for ensuring the security of processing." DR drills directly satisfy this requirement.

**Goals of each drill:**
- Verify RTO (15 minutes) and RPO (5 minutes) are achievable
- Identify procedural gaps in documentation
- Train new team members on recovery procedures
- Validate backup integrity
- Test monitoring and alerting during failures
- Build muscle memory for incident response

---

## 2. Quarterly Drill Calendar

### 2026 Schedule

| Quarter | Month | Drill Type | Target Date | Environment | Lead | Status |
|---------|-------|-----------|-------------|-------------|------|--------|
| Q1 | January | Database restore from backup | Week of 2026-01-12 | Staging | Engineering Lead | **OVERDUE** |
| Q1 | February | Redis failure and recovery | Week of 2026-02-09 | Staging | On-Call Engineer | **OVERDUE** |
| Q1 | March | Tabletop exercise (ransomware scenario) | Week of 2026-03-23 | N/A (discussion) | Engineering Lead | **OVERDUE** |
| Q2 | April | Full stack rebuild from scratch | Week of 2026-04-13 | Isolated DR host | Engineering Lead | |
| Q2 | May | DNS failover (multi-region) | Week of 2026-05-11 | Staging + Standby | On-Call Engineer | |
| Q2 | June | Single service failure cascade | Week of 2026-06-08 | Staging | On-Call Engineer | |
| Q3 | July | Database restore from S3 backup | Week of 2026-07-13 | Isolated DR host | Engineering Lead | |
| Q3 | August | Full stack rebuild + DNS cutover | Week of 2026-08-10 | Isolated DR host | Engineering Lead | |
| Q3 | September | Tabletop exercise (data breach response) | Week of 2026-09-14 | N/A (discussion) | Engineering Lead | |
| Q4 | October | Database PITR to specific timestamp | Week of 2026-10-12 | Staging | On-Call Engineer | |
| Q4 | November | Full multi-region failover drill | Week of 2026-11-09 | Staging + Standby | Engineering Lead | |
| Q4 | December | Annual comprehensive DR exercise | Week of 2026-12-07 | All environments | Engineering Lead | |

### Drill Frequency by Type

| Drill Type | Frequency | Typical Duration | Team Required |
|-----------|-----------|-----------------|---------------|
| Database restore (local backup) | Quarterly | 1-2 hours | 1 engineer |
| Database restore (S3 backup) | Quarterly | 2-3 hours | 1 engineer |
| Database PITR | Semi-annually | 2-3 hours | 1-2 engineers |
| Redis failure and recovery | Quarterly | 30-60 minutes | 1 engineer |
| Full stack rebuild | Semi-annually | 3-4 hours | 2 engineers |
| DNS failover (multi-region) | Semi-annually | 1-2 hours | 2 engineers |
| Service failure cascade | Quarterly | 1-2 hours | 1-2 engineers |
| Tabletop exercise | Semi-annually | 60-90 minutes | Full team |
| Annual comprehensive | Annually | Full day | Full team |

---

## 3. Drill Types

### 3.1 Database Restore from Local Backup

**Objective:** Validate that a `pg_dump` backup can be restored to a functioning state within RTO.

**What is tested:**
- Backup file integrity (gzip decompression, SQL validity)
- Restore procedure accuracy (as documented in [disaster-recovery.md](disaster-recovery.md))
- Schema completeness (all `app` schema tables, RLS policies, functions)
- Data integrity (row counts, referential integrity)
- Application connectivity after restore

**Success criteria:**
- Restore completes without SQL errors
- Row counts match source database (within backup window tolerance)
- API health check passes after restore
- RLS policies function correctly (`hris_app` role cannot access cross-tenant data)
- Better Auth sessions work (can log in, create session)

### 3.2 Database Restore from S3 Backup

**Objective:** Validate that offsite backups stored in S3 can be retrieved and restored on a fresh host.

**What is tested:**
- S3 backup retrieval (`restore-from-s3.sh` script)
- S3 credential validity
- Network transfer speed and reliability
- Restore on a host with no existing data
- End-to-end recovery including migrations and role setup

**Success criteria:**
- S3 backup downloaded within expected time (< 10 minutes for 5 GB)
- SHA256 checksum matches (if verification enabled)
- All criteria from local backup restore apply

### 3.3 Database Point-in-Time Recovery (PITR)

**Objective:** Validate that WAL archiving enables recovery to a specific timestamp.

**What is tested:**
- WAL archive completeness (no gaps)
- `restore_command` configuration
- Recovery to a precise timestamp using `recovery_target_time`
- Data consistency at the target timestamp

**Success criteria:**
- Recovery reaches the target timestamp (verified by querying `app.audit_log` for events around that time)
- No WAL gaps reported during recovery
- Data reflects the state at the target time, not before or after
- Recovery completes within 30 minutes for databases under 50 GB

**Procedure reference:** [Point-in-Time Recovery](point-in-time-recovery.md)

### 3.4 Full Stack Rebuild from Scratch

**Objective:** Validate that the entire Staffora platform can be rebuilt on a new host using only the git repository and backups.

**What is tested:**
- Documentation completeness (can an engineer follow the DR plan without tribal knowledge?)
- All prerequisites are documented (Docker, Bun, AWS CLI, etc.)
- `docker-compose.yml` and configuration files are self-contained
- Backup restore produces a working system
- SSL certificate provisioning
- DNS configuration

**Success criteria:**
- Platform is fully functional on the new host within 4 hours (Catastrophic tier RTO)
- All 105 backend modules respond to health checks
- Users can authenticate via Better Auth
- Worker processes outbox events
- Frontend loads and renders correctly

### 3.5 DNS Failover (Multi-Region)

**Objective:** Validate that traffic automatically shifts to the standby region when the primary fails.

**What is tested:**
- Route 53 health check detection time
- DNS failover propagation time
- PostgreSQL standby promotion procedure
- Worker startup on standby
- Application functionality after failover

**Success criteria:**
- DNS failover completes within 2 minutes of primary health check failure
- PostgreSQL promotion completes within 30 seconds
- API serves requests from the standby region
- Data loss is within RPO (< 5 minutes)
- Full service restored within RTO (< 15 minutes)

**Procedure reference:** [Multi-Region Plan](multi-region-plan.md)

### 3.6 Single Service Failure Cascade

**Objective:** Validate that single-service failures are contained and do not cascade to other services.

**Scenarios:**
1. Kill the API container -- verify worker continues, nginx returns 502, auto-restart recovers
2. Kill Redis -- verify API degrades gracefully (cache misses, elevated latency), no data loss
3. Kill the worker -- verify API is unaffected, outbox table accumulates, worker catches up on restart
4. Kill PgBouncer -- verify API fails over to direct PostgreSQL connection (if configured) or returns clear errors

**Success criteria:**
- Docker `restart: unless-stopped` recovers crashed containers within 60 seconds
- Non-crashed services continue operating (possibly degraded)
- No data corruption or loss from single-service failure
- Monitoring alerts fire within 2 minutes of failure

### 3.7 Tabletop Exercise

**Objective:** Walk through a disaster scenario as a team discussion without touching production systems.

**Format:**
1. Facilitator presents a scenario (e.g., "It is 3 AM on a Saturday. An alert fires: all API instances are returning 500. The on-call engineer's phone rings.")
2. Team discusses each step: Who does what? What tools do they use? What information do they need?
3. Identify gaps: missing runbooks, unclear ownership, insufficient access

**Scenario library:**
- Ransomware attack on the production host
- Data breach: unauthorized access detected in audit logs
- Database corruption from a bad migration deployed to production
- AWS eu-west-2 region outage lasting 6 hours
- On-call engineer is unreachable; backup on-call is unfamiliar with the system
- A tenant reports that they can see another tenant's employee data (RLS failure)

---

## 4. Pre-Drill Checklist

Complete this checklist before every drill:

### Logistics

- [ ] Drill date and time confirmed with all participants
- [ ] Drill lead assigned
- [ ] Drill type and scenario documented
- [ ] Estimated duration communicated to the team
- [ ] All participants have access to the target environment

### Environment

- [ ] Target environment identified (staging / isolated DR host / standby region)
- [ ] Target environment is NOT production (double-check)
- [ ] Target environment has recent backup data available
- [ ] All required credentials are accessible (DB passwords, S3 keys, Redis password)
- [ ] Monitoring is active on the target environment

### Safety

- [ ] Production systems are explicitly excluded from the drill scope
- [ ] DNS changes (if any) target staging/test domains only
- [ ] Stakeholders notified that a drill is in progress
- [ ] Rollback plan documented in case the drill environment needs to be reset

### Documentation

- [ ] Relevant procedure documents printed or accessible offline
- [ ] Stopwatch or timing tool ready for RTO/RPO measurement
- [ ] Drill report template ready (Section 7)
- [ ] Post-drill improvement tracker ready (Section 8)

---

## 5. Drill Execution Procedures

### 5.1 Database Restore Drill

```bash
# === ENVIRONMENT: Staging or isolated DR host ===
# === DO NOT RUN AGAINST PRODUCTION ===

# Step 1: Record start time
DRILL_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "Drill started: $DRILL_START"

# Step 2: Simulate failure -- stop PostgreSQL and destroy its volume
docker compose -f docker/docker-compose.yml stop api worker web backup
docker compose -f docker/docker-compose.yml stop postgres
docker compose -f docker/docker-compose.yml rm -f postgres
docker volume rm docker_postgres_data
echo "PostgreSQL data destroyed. Simulated disaster."

# Step 3: Recreate PostgreSQL container (runs init.sql for roles and schema)
docker compose -f docker/docker-compose.yml up -d postgres
echo "Waiting for PostgreSQL to become healthy..."
until docker exec staffora-postgres pg_isready -U hris -d hris; do sleep 2; done
echo "PostgreSQL is ready."

# Step 4: Run migrations
bun run migrate:up
echo "Migrations complete."

# Step 5: Restore from most recent backup
BACKUP_FILE=$(ls -t docker/backups/staffora_*.sql.gz 2>/dev/null | head -1)
if [ -z "$BACKUP_FILE" ]; then
  echo "ERROR: No local backup found. Attempting S3 restore..."
  ./docker/scripts/restore-from-s3.sh --latest daily
else
  echo "Restoring from: $BACKUP_FILE"
  ./docker/scripts/restore-db.sh "$BACKUP_FILE"
fi

# Step 6: Start all services
docker compose -f docker/docker-compose.yml up -d

# Step 7: Verify
echo "Waiting for API health check..."
sleep 10
curl -sf http://localhost:3000/health | python3 -m json.tool

# Step 8: Record end time
DRILL_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "Drill completed: $DRILL_END"
echo "Recovery time: <calculate from DRILL_START to DRILL_END>"

# Step 9: Validate data integrity
docker exec staffora-postgres psql -U hris -d hris -c "SELECT count(*) AS tenant_count FROM app.tenants;"
docker exec staffora-postgres psql -U hris -d hris -c "SELECT count(*) AS employee_count FROM app.employees;"
docker exec staffora-postgres psql -U hris -d hris -c "SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'app';"

# Step 10: Test RLS
docker exec staffora-postgres psql -U hris_app -d hris -c "SELECT * FROM app.employees LIMIT 1;"
# Expected: ERROR because no tenant context is set

# Step 11: Test authentication
curl -s -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@staffora.co.uk","password":"<test-password>"}' \
  -c /tmp/drill-cookies.txt
curl -s http://localhost:3000/api/v1/auth/me -b /tmp/drill-cookies.txt | python3 -m json.tool
```

### 5.2 Full Stack Rebuild Drill

```bash
# === ENVIRONMENT: Isolated DR host (fresh VM) ===

DRILL_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Step 1: Start from a clean machine (Docker and git pre-installed)
git clone https://github.com/<org>/HRISystem.git /opt/staffora
cd /opt/staffora

# Step 2: Set up environment
cp docker/.env.example docker/.env
# Edit docker/.env with test credentials
# (In a real disaster, these come from the secrets manager or backup)

# Step 3: Install Bun (if not pre-installed)
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

# Step 4: Install dependencies
bun install

# Step 5: Start infrastructure
docker compose -f docker/docker-compose.yml up -d postgres redis
echo "Waiting for infrastructure..."
sleep 15

# Step 6: Run migrations
bun run migrate:up

# Step 7: Restore database from S3
export S3_BACKUP_BUCKET=staffora-production-backups
export AWS_DEFAULT_REGION=eu-west-2
./docker/scripts/restore-from-s3.sh --latest daily

# Step 8: Start all services
docker compose -f docker/docker-compose.yml up -d

# Step 9: Verify all services
docker compose -f docker/docker-compose.yml ps
curl -sf http://localhost:3000/health | python3 -m json.tool
curl -sf http://localhost:5173/healthz

DRILL_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "Full stack rebuild completed. Start: $DRILL_START, End: $DRILL_END"
```

### 5.3 DNS Failover Drill

```bash
# === ENVIRONMENT: Staging primary + Staging standby ===
# This drill uses staging DNS records, NOT production

DRILL_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Step 1: Verify standby is healthy and replication is current
ssh staging-dublin "docker exec staffora-postgres psql -U hris -d hris -c \
  'SELECT pg_is_in_recovery(), now() - pg_last_xact_replay_timestamp() AS lag;'"

# Step 2: Record a marker in the primary database
ssh staging-london "docker exec staffora-postgres psql -U hris -d hris -c \
  \"INSERT INTO app.audit_log (id, tenant_id, user_id, action, resource_type, created_at) \
   VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', \
   '00000000-0000-0000-0000-000000000000', 'dr_drill_marker', 'system', now());\""

# Step 3: Wait for replication (should be < 5 seconds)
sleep 10

# Step 4: Verify marker reached the standby
ssh staging-dublin "docker exec staffora-postgres psql -U hris -d hris -c \
  \"SELECT created_at FROM app.audit_log WHERE action = 'dr_drill_marker' ORDER BY created_at DESC LIMIT 1;\""

# Step 5: Simulate primary failure -- stop the API on London staging
ssh staging-london "docker compose -f docker/docker-compose.yml stop api web"

# Step 6: Wait for Route 53 health check to detect failure (should be ~30 seconds)
echo "Waiting for health check failure detection..."
sleep 45

# Step 7: Promote standby PostgreSQL
ssh staging-dublin "docker exec staffora-postgres pg_ctl promote -D /var/lib/postgresql/data"
ssh staging-dublin "docker compose -f docker/docker-compose.yml up -d worker"
ssh staging-dublin "docker compose -f docker/docker-compose.yml restart api"

# Step 8: Verify standby is serving traffic
sleep 10
curl -sf http://staging-api.staffora.co.uk/health | python3 -m json.tool

# Step 9: Write test data to verify read-write works on promoted standby
curl -s -X POST http://staging-api.staffora.co.uk/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@staffora.co.uk","password":"<test-password>"}' \
  -c /tmp/drill-cookies.txt

DRILL_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "DNS failover drill completed. Start: $DRILL_START, End: $DRILL_END"

# Step 10: Check RPO -- verify the marker record is present on the promoted standby
ssh staging-dublin "docker exec staffora-postgres psql -U hris -d hris -c \
  \"SELECT created_at FROM app.audit_log WHERE action = 'dr_drill_marker' ORDER BY created_at DESC LIMIT 1;\""
```

---

## 6. RTO/RPO Measurement Protocol

### 6.1 RTO Measurement

RTO is measured from the moment the simulated failure occurs to the moment the platform is fully operational.

| Milestone | How to Measure | Timestamp Field |
|-----------|---------------|-----------------|
| **T0: Failure injected** | Record timestamp when failure command is executed | `failure_time` |
| **T1: Failure detected** | Record timestamp when first alert fires or health check fails | `detection_time` |
| **T2: Recovery started** | Record timestamp when first recovery command is executed | `recovery_start_time` |
| **T3: Database available** | `pg_isready` returns success | `db_ready_time` |
| **T4: API healthy** | `/health` returns HTTP 200 | `api_ready_time` |
| **T5: Full service restored** | All services healthy, first successful end-to-end request | `full_recovery_time` |

```
RTO = T5 - T0
Detection time = T1 - T0
Recovery execution time = T5 - T2
```

### 6.2 RPO Measurement

RPO is measured by comparing the most recent data in the restored database against the known last write before failure.

**Protocol:**
1. Before injecting failure, insert a timestamped marker record:
   ```sql
   INSERT INTO app.audit_log (id, tenant_id, user_id, action, resource_type, details, created_at)
   VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           '00000000-0000-0000-0000-000000000000', 'dr_drill_last_write',
           'system', '{"drill": true}'::jsonb, now());
   ```
2. Record the `created_at` timestamp of this marker.
3. After restore, query for the most recent record:
   ```sql
   SELECT max(created_at) AS latest_record FROM app.audit_log;
   ```
4. Calculate RPO:
   ```
   RPO_actual = marker_timestamp - latest_record_timestamp
   ```
   If the marker is present, RPO = 0 (no data loss). If not, RPO equals the time difference between the marker and the most recent record.

### 6.3 Success/Failure Criteria

| Metric | Target | Pass | Fail |
|--------|--------|------|------|
| RTO | < 15 minutes | Recovery complete within 15 minutes | Recovery exceeds 15 minutes |
| RPO | < 5 minutes | Data loss is less than 5 minutes | Data loss exceeds 5 minutes |
| Detection time | < 2 minutes | Alert fires within 2 minutes | Alert delayed beyond 2 minutes |
| Procedure accuracy | All steps work as documented | No undocumented steps needed | Had to improvise or deviate |
| Data integrity | No corruption | All tables present, row counts match, RLS works | Missing tables, broken RLS, constraint violations |

---

## 7. Drill Report Template

Complete this report after every drill and store it in `Docs/operations/drill-reports/`.

```markdown
# DR Drill Report: [Drill Type]

**Date:** YYYY-MM-DD
**Drill lead:** [Name]
**Participants:** [Names]
**Environment:** [Staging / Isolated DR host / Standby region]
**Drill type:** [Database restore / Full rebuild / DNS failover / etc.]

---

## Scenario

[Describe the simulated failure scenario in 2-3 sentences]

## Timeline

| Milestone | Timestamp (UTC) | Duration from T0 |
|-----------|----------------|-------------------|
| T0: Failure injected | HH:MM:SS | 0:00 |
| T1: Failure detected | HH:MM:SS | +MM:SS |
| T2: Recovery started | HH:MM:SS | +MM:SS |
| T3: Database available | HH:MM:SS | +MM:SS |
| T4: API healthy | HH:MM:SS | +MM:SS |
| T5: Full service restored | HH:MM:SS | +MM:SS |

## Results

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| RTO | < 15 min | MM:SS | PASS / FAIL |
| RPO | < 5 min | MM:SS | PASS / FAIL |
| Detection time | < 2 min | MM:SS | PASS / FAIL |
| Procedure accuracy | 100% | __% | PASS / FAIL |
| Data integrity | No corruption | [result] | PASS / FAIL |

## Steps Executed

1. [Step and outcome]
2. [Step and outcome]
3. ...

## Issues Encountered

| # | Issue | Impact | Workaround Used |
|---|-------|--------|-----------------|
| 1 | [description] | [impact on recovery] | [what was done] |

## Procedure Deviations

[List any steps where the documented procedure was incorrect, incomplete,
or required improvisation. These become action items.]

## Lessons Learned

1. [Insight from the drill]
2. [Insight from the drill]

## Action Items

| # | Action | Owner | Priority | Due Date | Status |
|---|--------|-------|----------|----------|--------|
| 1 | [action] | [name] | P0/P1/P2 | YYYY-MM-DD | Open |

## Sign-Off

- [ ] Drill lead reviewed and approved this report
- [ ] Action items assigned and tracked in project management
- [ ] DR documentation updated if procedures changed
- [ ] Results shared with engineering team
```

---

## 8. Post-Drill Improvement Tracking

### 8.1 Improvement Categories

| Category | Description | Example |
|----------|-------------|---------|
| **Documentation** | Procedure was incorrect or missing steps | "Step 5 referenced a script that no longer exists" |
| **Tooling** | Missing or broken automation | "restore-from-s3.sh failed because AWS CLI was not installed" |
| **Access** | Missing credentials or permissions | "Engineer could not access S3 bucket; IAM policy was too restrictive" |
| **Monitoring** | Alerts did not fire or were delayed | "Health check failure was not detected for 5 minutes" |
| **Performance** | Recovery was too slow | "Database restore took 45 minutes, exceeding RTO" |
| **Training** | Team member unfamiliar with procedure | "New engineer had never run pg_basebackup" |

### 8.2 Improvement Tracking Table

Track all improvement items from all drills in a single table. Review progress at each monthly SLO review meeting.

| Drill Date | Item # | Category | Description | Owner | Priority | Status | Resolved Date |
|-----------|--------|----------|-------------|-------|----------|--------|--------------|
| *Example:* | | | | | | | |
| 2026-01-15 | DR-001 | Documentation | restore-db.sh script path changed; DR doc still references old path | Engineering Lead | P1 | Closed | 2026-01-20 |
| 2026-01-15 | DR-002 | Tooling | AWS CLI v2 required but v1 was installed on DR host | Engineering Lead | P1 | Closed | 2026-01-22 |
| 2026-04-14 | DR-003 | Performance | S3 restore took 25 minutes for 8 GB backup; need parallel download | Engineering Lead | P2 | Open | -- |

### 8.3 Improvement SLA

| Priority | Resolution Target | Escalation |
|----------|------------------|------------|
| P0 (blocks recovery) | 1 business day | Engineering lead |
| P1 (degrades recovery) | 5 business days | Engineering lead at next standup |
| P2 (minor improvement) | Next quarter | Reviewed at quarterly assessment |

### 8.4 Trend Analysis

After 4+ drills, analyze trends:

- **RTO trend:** Is recovery getting faster or slower? Plot actual RTO over time.
- **Repeat issues:** Are the same problems recurring? Indicates systemic issues.
- **Documentation drift:** How many procedure deviations per drill? Should decrease over time.
- **Team readiness:** Can any engineer complete the drill, or is it person-dependent?

---

## 9. Drill History Log

Record every completed drill here for quick reference. Detailed reports are in `Docs/operations/drill-reports/`.

| Date | Type | Environment | RTO Actual | RPO Actual | Pass/Fail | Report |
|------|------|-------------|-----------|-----------|-----------|--------|
| *Drills will be logged here as they are completed* | | | | | | |

---

## 10. Escalation During Drills

### 10.1 Drill Safety Rules

1. **Never run drills against production.** All drills use staging, isolated DR hosts, or standby regions.
2. **If a drill accidentally impacts production**, stop immediately and treat it as a real incident.
3. **If a drill reveals a production vulnerability** (e.g., backup files are corrupted), escalate immediately to the engineering lead.
4. **Time-box all drills.** If recovery is not achieved within 2x the target RTO, stop the drill, document findings, and create action items.

### 10.2 Drill Abort Criteria

Abort the drill and create an incident if:

- Production monitoring alerts fire during the drill
- A credential used in the drill is a production credential (misidentified environment)
- The drill environment shares resources with production (unexpected dependency)
- Recovery takes more than 2x the target time with no clear path forward

### 10.3 Notification Template

Before each drill, notify stakeholders:

```
Subject: [DR Drill] [Drill Type] - [Date] [Time] UTC

Team,

A disaster recovery drill will be conducted:

  Type: [Database Restore / Full Rebuild / DNS Failover / etc.]
  Date: [YYYY-MM-DD]
  Time: [HH:MM - HH:MM] UTC (estimated)
  Environment: [Staging / Isolated DR host]
  Lead: [Name]

This drill will NOT affect production systems.

If you observe any unexpected production alerts during this window,
please notify the drill lead immediately at [contact].

Regards,
Platform Engineering
```

---

## 11. Related Documents

- [Disaster Recovery Plan](disaster-recovery.md) -- Recovery procedures for all failure scenarios
- [Point-in-Time Recovery](point-in-time-recovery.md) -- WAL archiving and PITR procedures
- [Multi-Region Plan](multi-region-plan.md) -- Cross-region failover architecture
- [SLA/SLO Definitions](sla-slo-definitions.md) -- Recovery time objectives and service levels
- [Backup Verification](backup-verification.md) -- Automated backup integrity testing
- [Secret Rotation](secret-rotation.md) -- Credential procedures (may need rotation during recovery)
- [Production Checklist](production-checklist.md) -- Pre-launch verification items
