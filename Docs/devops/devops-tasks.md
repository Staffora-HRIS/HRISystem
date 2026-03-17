# Staffora DevOps Task List

> Last updated: 2026-03-16
> Platform: Staffora HRIS (UK-only enterprise multi-tenant HR system)

---

## Summary

| Priority | TODO | IN_PROGRESS | DONE | Total |
|----------|------|-------------|------|-------|
| P0       | 4    | 0           | 0    | 4     |
| P1       | 7    | 0           | 0    | 7     |
| P2       | 7    | 0           | 0    | 7     |
| P3       | 5    | 0           | 0    | 5     |
| --       | 0    | 0           | 16   | 16    |
| **Total**| **18** | **0**     | **16** | **39** |

---

## DONE

### CI/CD Pipelines

- [x] **DONE** | P0 | `ci` | **CI pipeline (test.yml)**
  - Triggers on push to main and PRs targeting main
  - Runs typecheck, lint, build, database init, migrations, API tests with coverage, shared tests, frontend tests with coverage
  - Coverage enforcement gates: API >= 60%, Frontend >= 50%
  - Coverage artifacts uploaded to GitHub (14-day retention)
  - Acceptance: All quality gates run on every push/PR

- [x] **DONE** | P0 | `cd` | **CD pipeline (deploy.yml)**
  - Staging: auto-deploy on push to main
  - Production: manual trigger via workflow_dispatch with environment selector
  - Pipeline: test -> build (matrix: api + web in parallel) -> deploy
  - Docker images pushed to GHCR with sha, branch, latest, and timestamp tags
  - Concurrency control: cancels in-progress runs for same branch
  - Acceptance: Staging deploys automatically; production requires manual trigger

- [x] **DONE** | P1 | `ci` | **PR checks (pr-check.yml)**
  - Lightweight fast-feedback: typecheck + lint (no DB required)
  - Docker build verification for api and web images (no push)
  - Concurrency control per PR number
  - Acceptance: PRs get fast feedback before full test suite

- [x] **DONE** | P1 | `ci` | **Migration validation (migration-check.yml)**
  - Triggers only on PRs that modify `migrations/`
  - Validates 4-digit prefix naming convention (e.g., `0188_description.sql`)
  - RLS compliance check: verifies tenant_id, ENABLE ROW LEVEL SECURITY, tenant_isolation policy
  - Outputs validation summary to GitHub Step Summary
  - Acceptance: New migrations must follow naming and RLS conventions

### Security

- [x] **DONE** | P0 | `security` | **Security scanning (security.yml)**
  - Dependency audit via `bun audit` (fails on high/critical)
  - Container scanning via Trivy (CRITICAL + HIGH severity, SARIF upload)
  - Secret detection via TruffleHog (verified secrets only)
  - Runs on push/PR/weekly schedule (Monday 6am UTC)
  - Acceptance: All three scan types run; results uploaded to GitHub Security tab

- [x] **DONE** | P0 | `security` | **CodeQL static analysis (codeql.yml)**
  - JavaScript/TypeScript semantic analysis
  - Extended query suite: security-extended + security-and-quality
  - Runs on push/PR/weekly schedule (Monday 4am UTC)
  - Results uploaded to GitHub Security tab
  - Acceptance: CodeQL finds vulnerabilities, bugs, and code quality issues

- [x] **DONE** | P1 | `security` | **Dependabot configuration**
  - NPM ecosystem: weekly updates, grouped by production/dev + patch/minor
  - Docker ecosystem: weekly updates for api and web Dockerfiles
  - GitHub Actions ecosystem: weekly updates
  - PR limit: 10 open PRs at a time
  - Acceptance: Dependencies auto-updated weekly with grouped PRs

### Infrastructure

- [x] **DONE** | P0 | `infra` | **Docker multi-stage builds**
  - API: 4-stage build (deps -> builder -> prod-deps -> runner)
  - Web: 3-stage build (deps -> builder -> runner)
  - Non-root user (`staffora`, UID 1001) in production images
  - Production-only dependencies in final image (no devDependencies)
  - Acceptance: Images are minimal, secure, and production-ready

- [x] **DONE** | P0 | `infra` | **docker-compose for local dev**
  - 5 services: postgres, redis, api, worker, web (+ nginx in production profile)
  - Resource limits and reservations for all services
  - Health checks on all services with start periods
  - JSON log driver with rotation (50m/5 files for main services)
  - Custom bridge network (172.28.0.0/16) with named volumes
  - Acceptance: `docker compose up -d` starts full local environment

- [x] **DONE** | P1 | `infra` | **Health checks on all services**
  - Postgres: `pg_isready` (10s interval, 5 retries)
  - Redis: `redis-cli ping` with auth (10s interval, 5 retries)
  - API: HTTP fetch to `/health` (30s interval, 3 retries, 30s start)
  - Worker: HTTP fetch to `:3001/health` (30s interval, 3 retries, 30s start)
  - Web: `wget --spider` to `:5173/` (30s interval, 3 retries, 10s start)
  - Acceptance: All containers report healthy/unhealthy status

- [x] **DONE** | P1 | `infra` | **.dockerignore files**
  - Root `.dockerignore` + package-specific ignores for api and web
  - Excludes test files, docs, IDE configs, git history from build context
  - Acceptance: Docker build context is minimal

### Deployment

- [x] **DONE** | P1 | `deploy` | **Production rollback automation**
  - Health check loop: 10 attempts with 15s intervals after production deploy
  - Automatic rollback on health check failure (restarts previous images)
  - Slack notification on deploy success/failure
  - Acceptance: Failed production deploys auto-rollback within ~3 minutes

- [x] **DONE** | P1 | `deploy` | **Database backup before production deploy**
  - `pg_dump` with gzip compression before deploying to production
  - Timestamped backup files stored on production host
  - Acceptance: Every production deploy creates a recoverable backup

- [x] **DONE** | P1 | `release` | **Release automation (release.yml)**
  - Triggered on version tags (`v*`)
  - Full test suite -> build release images -> create GitHub Release
  - Semantic version tags: `X.Y.Z`, `X.Y`, `X` + sha
  - Pre-release detection (e.g., `v1.0.0-beta.1`)
  - Auto-generated release notes with Docker image references
  - Acceptance: `git push origin v1.0.0` creates a full release

### Governance

- [x] **DONE** | P2 | `governance` | **CODEOWNERS**
  - Default: @staffora/engineering
  - Infrastructure: @staffora/devops
  - Migrations: @staffora/backend + @staffora/database
  - Security-sensitive: @staffora/security (auth, RBAC, better-auth)
  - Frontend: @staffora/frontend
  - Acceptance: PRs auto-request appropriate reviewers

- [x] **DONE** | P2 | `governance` | **Stale issue cleanup (stale.yml)**
  - Weekly run (Monday 8am UTC)
  - Issues: stale after 30 days, closed after 14 more days
  - PRs: stale after 30 days, closed after 7 more days
  - Exempt labels: pinned, security, bug, critical, dependencies
  - Acceptance: Inactive issues/PRs automatically cleaned up

- [x] **DONE** | P2 | `ci` | **Coverage reporting with enforcement gates**
  - API: minimum 60% line coverage (lcov format)
  - Frontend: minimum 50% line coverage (lcov format)
  - Summary tables in GitHub Step Summary
  - Coverage artifacts uploaded (14-day retention)
  - Acceptance: Builds fail if coverage drops below threshold

---

## TODO

### P0 - Critical (Must-Have for Production Readiness)

- [ ] **TODO** | P0 | `observability` | **Set up error tracking (Sentry)**
  - Description: Integrate Sentry for real-time error tracking and alerting across API, worker, and web frontend
  - Acceptance criteria:
    - [ ] Sentry SDK installed in `packages/api` (Elysia error handler integration)
    - [ ] Sentry SDK installed in `packages/web` (React Error Boundary integration)
    - [ ] Worker process errors captured with job context (type, queue, tenant)
    - [ ] Source maps uploaded during CI build step
    - [ ] Environment tags: staging/production
    - [ ] Alert rules configured: P0 errors notify Slack immediately
    - [ ] Sensitive data scrubbed (PII, auth tokens, tenant IDs)
    - [ ] Release tracking tied to git SHA / version tags

- [ ] **TODO** | P0 | `observability` | **Set up uptime monitoring**
  - Description: External uptime monitoring for all production endpoints with alerting
  - Acceptance criteria:
    - [ ] Monitor API health endpoint: `https://api.staffora.co.uk/health`
    - [ ] Monitor web frontend: `https://staffora.co.uk/`
    - [ ] Monitor marketing site: (hosted in separate repository)
    - [ ] Check interval: 1 minute
    - [ ] Alert channels: Slack + email + PagerDuty/OpsGenie
    - [ ] SSL certificate expiry monitoring (14-day warning)
    - [ ] Response time threshold alerts (>2s API, >5s web)
    - [ ] Status page at `https://status.staffora.co.uk`

- [ ] **TODO** | P0 | `operations` | **Create incident response runbook**
  - Description: Documented procedures for common production incidents
  - Acceptance criteria:
    - [ ] Runbook for: database connection exhaustion
    - [ ] Runbook for: Redis memory full / eviction
    - [ ] Runbook for: API 5xx spike
    - [ ] Runbook for: Failed deployment / rollback
    - [ ] Runbook for: Database migration failure
    - [ ] Runbook for: Security incident (data breach, credential leak)
    - [ ] Runbook for: SSL certificate expiry
    - [ ] Runbook for: Disk space full
    - [ ] Escalation matrix with contact details
    - [ ] Post-incident review template
    - [ ] Stored in `Docs/operations/runbooks/`

- [ ] **TODO** | P0 | `governance` | **Enable branch protection rules on main**
  - Description: Protect main branch from direct pushes and force-pushes
  - Acceptance criteria:
    - [ ] Require PR reviews (minimum 1 reviewer)
    - [ ] Require status checks to pass: test.yml, pr-check.yml, codeql.yml
    - [ ] Require branches to be up to date before merging
    - [ ] Require conversation resolution before merging
    - [ ] Block force pushes to main
    - [ ] Block branch deletion for main
    - [ ] Require signed commits (optional, evaluate team readiness)
    - [ ] CODEOWNERS approval required

### P1 - High Priority (Next Sprint)

- [ ] **TODO** | P1 | `observability` | **Add APM/distributed tracing**
  - Description: Application Performance Monitoring with request tracing across API, worker, and database
  - Acceptance criteria:
    - [ ] OpenTelemetry SDK integrated into API server (Elysia plugin)
    - [ ] Trace propagation: HTTP request -> database queries -> Redis ops -> worker jobs
    - [ ] Trace context in outbox events for async job correlation
    - [ ] P95/P99 latency dashboards per endpoint
    - [ ] Database query performance dashboard (slow query detection)
    - [ ] Export to Grafana Tempo, Jaeger, or Datadog
    - [ ] Sampling rate configurable (100% staging, 10% production)

- [ ] **TODO** | P1 | `observability` | **Add centralized logging (ELK/Loki)**
  - Description: Aggregate container logs into a searchable, queryable logging platform
  - Acceptance criteria:
    - [ ] All containers ship structured JSON logs
    - [ ] Log aggregation via Loki + Promtail (or ELK stack)
    - [ ] Grafana dashboards for log exploration
    - [ ] Log correlation with trace IDs from APM
    - [ ] Tenant-scoped log filtering (by tenant_id)
    - [ ] Log retention: 30 days hot, 90 days cold
    - [ ] Alert rules: error rate spikes, auth failures, RLS violations

- [ ] **TODO** | P1 | `infra` | **Set up PgBouncer connection pooling**
  - Description: Connection pooler between API/worker and PostgreSQL to handle connection limits efficiently
  - Acceptance criteria:
    - [ ] PgBouncer container added to docker-compose.yml
    - [ ] Transaction-mode pooling (compatible with RLS SET commands)
    - [ ] Pool size: 20 server connections, 200 client connections
    - [ ] API and worker connect through PgBouncer (not directly to Postgres)
    - [ ] Health check on PgBouncer
    - [ ] Monitoring: active connections, waiting queue, avg query time
    - [ ] Verify RLS context propagation works through PgBouncer (critical)

- [ ] **TODO** | P1 | `testing` | **Add browser-based E2E tests to CI (Playwright)**
  - Description: End-to-end tests covering critical user journeys in a real browser
  - Acceptance criteria:
    - [ ] Playwright installed in `packages/web` with test configuration
    - [ ] Critical user journeys covered:
      - Login/logout flow with MFA
      - Employee creation and profile viewing
      - Leave request submission and approval
      - Benefits enrollment wizard
      - Report generation
    - [ ] Tests run in CI against staging environment (post-deploy)
    - [ ] Visual regression snapshots for key pages
    - [ ] Test artifacts (screenshots, traces) uploaded on failure
    - [ ] Separate workflow or added to deploy.yml post-staging-deploy

- [ ] **TODO** | P1 | `infra` | **Set up CDN for static assets**
  - Description: Serve static frontend assets (JS, CSS, images, fonts) via CDN for global performance
  - Acceptance criteria:
    - [ ] CDN configured (Cloudflare, AWS CloudFront, or Bunny CDN)
    - [ ] React Router client assets served from CDN with immutable cache headers
    - [ ] Cache-Control: `public, max-age=31536000, immutable` for hashed assets
    - [ ] Cache purge automation on deploy
    - [ ] Fallback to origin on CDN miss
    - [ ] UK-focused PoP coverage (London, Manchester, Dublin)

- [ ] **TODO** | P1 | `governance` | **Add PR templates and issue templates**
  - Description: Standardized templates for pull requests, bug reports, and feature requests
  - Acceptance criteria:
    - [ ] PR template (`.github/pull_request_template.md`):
      - Summary section
      - Test plan checklist
      - Migration changes flag
      - Security considerations flag
      - Screenshots section for UI changes
    - [ ] Bug report issue template (`.github/ISSUE_TEMPLATE/bug_report.yml`)
    - [ ] Feature request issue template (`.github/ISSUE_TEMPLATE/feature_request.yml`)
    - [ ] Migration change issue template
    - [ ] Templates use YAML form syntax for structured input

- [ ] **TODO** | P1 | `security` | **Certificate auto-renewal (Let's Encrypt)**
  - Description: Automated TLS certificate provisioning and renewal for all Staffora domains
  - Acceptance criteria:
    - [ ] Certbot or acme.sh integrated with nginx container
    - [ ] Domains covered: staffora.co.uk, api.staffora.co.uk, staging.staffora.co.uk
    - [ ] Auto-renewal cron (every 12 hours check, renew at 30 days before expiry)
    - [ ] Nginx graceful reload after certificate renewal
    - [ ] Monitoring alert if renewal fails (14-day warning)
    - [ ] Fallback: manual renewal runbook in Docs/operations

### P2 - Medium Priority (Planned)

- [ ] **TODO** | P2 | `testing` | **Add load testing to CI**
  - Description: Automated load testing against staging to detect performance regressions
  - Acceptance criteria:
    - [ ] k6 or Artillery load test scripts in `packages/api/src/test/load/`
    - [ ] Key scenarios: login burst, employee list pagination, concurrent leave submissions
    - [ ] Baseline thresholds: P95 < 500ms, error rate < 1%
    - [ ] Runs post-staging-deploy (not on every PR)
    - [ ] Results published to GitHub Step Summary
    - [ ] Performance regression alerts

- [ ] **TODO** | P2 | `infra` | **Set up feature flags**
  - Description: Feature flag system for gradual rollouts and A/B testing
  - Acceptance criteria:
    - [ ] Feature flag service (LaunchDarkly, Unleash, or custom Redis-based)
    - [ ] Tenant-scoped flags (enable feature for specific tenants)
    - [ ] User-role-scoped flags (enable for admins first)
    - [ ] Percentage rollout capability
    - [ ] React hook: `useFeatureFlag('flag-name')`
    - [ ] API middleware: `requireFeatureFlag('flag-name')`
    - [ ] Audit trail for flag changes

- [ ] **TODO** | P2 | `infra` | **Infrastructure as Code (Terraform)**
  - Description: Define all cloud infrastructure as code for reproducible deployments
  - Acceptance criteria:
    - [ ] Terraform modules for: VPS provisioning, DNS records, firewall rules
    - [ ] State stored remotely (Terraform Cloud or S3 backend)
    - [ ] Environments: staging and production
    - [ ] `terraform plan` runs on PRs that modify `infra/`
    - [ ] `terraform apply` on merge to main (staging) or manual trigger (production)
    - [ ] Documentation in `Docs/infrastructure/`

- [ ] **TODO** | P2 | `testing` | **Add API contract testing**
  - Description: Contract tests to verify API responses match documented schemas
  - Acceptance criteria:
    - [ ] TypeBox schemas used as contract source of truth
    - [ ] Tests verify response shapes match TypeBox definitions
    - [ ] Breaking change detection in CI (new required fields, removed fields)
    - [ ] Contract tests run as part of test.yml
    - [ ] Consumer-driven contract tests for web <-> API

- [ ] **TODO** | P2 | `security` | **Set up secret rotation**
  - Description: Automated rotation of secrets and credentials
  - Acceptance criteria:
    - [ ] DATABASE_URL credentials rotated every 90 days
    - [ ] SESSION_SECRET rotated with dual-key support (old + new valid during transition)
    - [ ] BETTER_AUTH_SECRET rotation procedure documented
    - [ ] Redis password rotation with zero-downtime
    - [ ] Rotation triggered via GitHub Actions workflow_dispatch
    - [ ] Audit log of all rotations

- [ ] **TODO** | P2 | `infra` | **Multi-region deployment plan**
  - Description: Architecture plan for deploying Staffora to multiple UK/EU regions
  - Acceptance criteria:
    - [ ] Architecture document: primary (London) + standby (Dublin/Frankfurt)
    - [ ] Database replication strategy (streaming replication or logical)
    - [ ] Redis replication strategy (Sentinel or Cluster)
    - [ ] DNS failover configuration (health-check-based)
    - [ ] Data residency compliance (UK GDPR, data sovereignty)
    - [ ] RTO: 15 minutes, RPO: 5 minutes
    - [ ] Cost estimate for multi-region vs. single-region + backup

- [ ] **TODO** | P2 | `testing` | **Add chaos engineering tests to CI**
  - Description: Expand existing chaos tests to run automatically in CI
  - Acceptance criteria:
    - [ ] Existing `packages/api/src/test/chaos/` tests run in CI
    - [ ] Database connection failure scenarios
    - [ ] Redis connection failure scenarios
    - [ ] Network partition simulation
    - [ ] High-latency injection
    - [ ] Results published to GitHub Step Summary
    - [ ] Runs weekly (not on every PR)

### P3 - Low Priority (Backlog)

- [ ] **TODO** | P3 | `deploy` | **Blue/green deployment strategy**
  - Description: Zero-downtime deployments using blue/green environments
  - Acceptance criteria:
    - [ ] Two identical environments (blue + green) on production
    - [ ] Traffic routing via nginx upstream switching
    - [ ] Health check validation on green before switching
    - [ ] Instant rollback by switching back to blue
    - [ ] Database migration compatibility (both versions must work)
    - [ ] Documented cutover procedure

- [ ] **TODO** | P3 | `infra` | **Auto-scaling configuration**
  - Description: Automatic scaling of API and worker containers based on load
  - Acceptance criteria:
    - [ ] Docker Swarm or Kubernetes deployment manifests
    - [ ] API: scale 2-8 replicas based on CPU/memory/request rate
    - [ ] Worker: scale 1-4 replicas based on queue depth
    - [ ] Scale-up trigger: CPU > 70% for 2 minutes
    - [ ] Scale-down trigger: CPU < 30% for 5 minutes
    - [ ] Load balancer health checks with graceful draining

- [ ] **TODO** | P3 | `operations` | **Disaster recovery drill schedule**
  - Description: Regular testing of disaster recovery procedures
  - Acceptance criteria:
    - [ ] Quarterly DR drill schedule
    - [ ] Test database restore from backup (verify data integrity)
    - [ ] Test full environment rebuild from scratch
    - [ ] Test DNS failover (if multi-region deployed)
    - [ ] Measure actual RTO and RPO vs. targets
    - [ ] DR drill report template
    - [ ] Post-drill improvement action items tracked

- [ ] **TODO** | P3 | `operations` | **SLA/SLO definitions**
  - Description: Define and monitor Service Level Objectives for the platform
  - Acceptance criteria:
    - [ ] SLOs defined:
      - Availability: 99.9% (8.76 hours downtime/year)
      - API P95 latency: < 500ms
      - API P99 latency: < 2s
      - Error rate: < 0.1%
      - Login success rate: > 99.5%
    - [ ] Error budgets calculated and tracked
    - [ ] SLO dashboard (Grafana or similar)
    - [ ] Alert when error budget consumed > 50%
    - [ ] Monthly SLO review meetings

- [ ] **TODO** | P3 | `security` | **WAF protection**
  - Description: Web Application Firewall for production traffic
  - Acceptance criteria:
    - [ ] WAF deployed (Cloudflare WAF, AWS WAF, or ModSecurity with nginx)
    - [ ] OWASP Core Rule Set enabled
    - [ ] Custom rules for API-specific patterns
    - [ ] Rate limiting at WAF layer (complement to application rate limiting)
    - [ ] Geo-blocking (UK/EU only, configurable per tenant)
    - [ ] Bot detection and challenge pages
    - [ ] WAF logs integrated with centralized logging
    - [ ] False positive tuning for known API patterns

---

## Task Dependencies

```
P0: Branch Protection ──> enables enforcement of all CI checks
P0: Error Tracking ─────> required before production launch
P0: Uptime Monitoring ──> required before production launch
P0: Incident Runbook ───> required before production launch

P1: APM/Tracing ────────> depends on centralized logging
P1: Centralized Logging > foundation for observability
P1: PgBouncer ──────────> requires testing with RLS context
P1: E2E Tests ──────────> depends on staging deploy working
P1: CDN ────────────────> can be done independently
P1: PR Templates ───────> can be done independently
P1: Cert Renewal ───────> depends on nginx production profile

P2: Load Testing ───────> depends on staging environment
P2: Feature Flags ──────> depends on Redis infrastructure
P2: IaC (Terraform) ───> can be done independently
P2: Contract Testing ──> can be done independently
P2: Secret Rotation ───> depends on deployment pipeline
P2: Multi-Region ──────> depends on IaC
P2: Chaos Tests CI ────> depends on existing chaos test suite

P3: Blue/Green ────────> depends on IaC and auto-scaling
P3: Auto-Scaling ──────> depends on IaC
P3: DR Drills ─────────> depends on backup/restore procedures
P3: SLA/SLO ───────────> depends on APM + uptime monitoring
P3: WAF ───────────────> can be done independently
```

---

## Related Documents

- [DevOps Status Report](devops-status-report.md) — CI/CD architecture and pipeline health
- [DevOps Dashboard](devops-dashboard.md) — Pipeline architecture and status overview
- [DevOps Master Checklist](../checklists/devops-master-checklist.md) — Comprehensive DevOps readiness checklist
- [Infrastructure Audit](../audit/infrastructure-audit.md) — Infrastructure findings and recommendations
- [Deployment Guide](../guides/DEPLOYMENT.md) — Docker Compose deployment instructions
- [Kanban Board](../project-management/kanban-board.md) — Work item tracking across all domains
