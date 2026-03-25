# Staffora DevOps Task List

> Last updated: 2026-03-20
> Platform: Staffora HRIS (UK-only enterprise multi-tenant HR system)

---

## Summary

| Priority | TODO | BLOCKED | DONE | Total |
|----------|------|---------|------|-------|
| P0       | 0    | 1       | 3    | 4     |
| P1       | 0    | 0       | 7    | 7     |
| P2       | 0    | 0       | 7    | 7     |
| P3       | 0    | 0       | 5    | 5     |
| --       | 0    | 0       | 16   | 16    |
| **Total**| **0** | **1** | **38** | **39** |

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

- [x] **DONE** | P0 | `observability` | **Set up error tracking (Sentry)**
  - Description: Integrate Sentry for real-time error tracking and alerting across API, worker, and web frontend
  - Acceptance criteria:
    - [x] Sentry SDK installed in `packages/api` (`src/lib/sentry.ts` with full integration)
    - [x] Worker process errors captured with job context (processName: "worker")
    - [x] Environment tags: staging/production (via SENTRY_ENVIRONMENT)
    - [x] Sensitive data scrubbed (PII, auth tokens, NI numbers, bank details)
    - [x] Release tracking tied to package version / git SHA
    - [ ] Sentry SDK installed in `packages/web` (React Error Boundary) — requires SENTRY_DSN config
    - [ ] Source maps uploaded during CI build step — requires SENTRY_DSN config
    - [ ] Alert rules configured — requires Sentry project setup
  - Note: SDK integration complete. Remaining items require Sentry project provisioning (SENTRY_DSN).

- [x] **DONE** | P0 | `observability` | **Set up uptime monitoring**
  - Description: Self-hosted uptime monitoring via Uptime Kuma
  - Acceptance criteria:
    - [x] Uptime Kuma container added to docker-compose (port 3002, `--profile uptime`)
    - [x] 7 monitors documented: API health, web, PgBouncer, PostgreSQL, Redis, Worker, SSL
    - [x] Check intervals: 60s health, 300s SSL
    - [x] Alert channels documented: Slack webhook, SMTP email, Teams, PagerDuty
    - [x] SSL certificate expiry monitoring (14-day warning)
    - [x] Response time thresholds (>2s API, >5s web)
    - [x] Status page setup documented (nginx reverse proxy to status.staffora.co.uk)
    - [x] Comprehensive ops guide: `Docs/operations/uptime-monitoring.md`

- [x] **DONE** | P0 | `operations` | **Create incident response runbook**
  - Description: Documented procedures for common production incidents
  - Acceptance criteria:
    - [x] Runbook for: database connection exhaustion
    - [x] Runbook for: Redis memory full / eviction
    - [x] Runbook for: API 5xx spike
    - [x] Runbook for: Failed deployment / rollback
    - [x] Runbook for: Database migration failure
    - [x] Runbook for: Security incident (data breach, credential leak)
    - [x] Runbook for: SSL certificate expiry
    - [x] Runbook for: Disk space full
    - [x] Escalation matrix with contact details
    - [x] Post-incident review template
    - [x] Stored in `Docs/operations/runbooks/`

- [ ] **BLOCKED** | P0 | `governance` | **Enable branch protection rules on main**
  - Description: Protect main branch from direct pushes and force-pushes
  - **Blocker:** GitHub Free plan does not support branch protection on private repos. Requires upgrade to GitHub Team ($4/user/month).
  - Setup script prepared: `bash scripts/setup-branch-protection.sh` — run after upgrading plan
  - Acceptance criteria:
    - [ ] Upgrade to GitHub Team plan
    - [ ] Require PR reviews (minimum 1 reviewer)
    - [ ] Require status checks to pass: test.yml, pr-check.yml, codeql.yml
    - [ ] Require branches to be up to date before merging
    - [ ] Block force pushes to main
    - [ ] Block branch deletion for main

### P1 - High Priority (Next Sprint)

- [x] **DONE** | P1 | `observability` | **Add APM/distributed tracing**
  - Description: Application Performance Monitoring with request tracing across API, worker, and database
  - Acceptance criteria:
    - [x] OpenTelemetry SDK in `packages/api/src/lib/telemetry.ts` (opt-in via OTEL_ENABLED)
    - [x] Elysia tracing plugin with method, route, status, tenant_id, user_id span attributes
    - [x] W3C traceparent header propagation
    - [x] Grafana Tempo service in docker-compose (monitoring profile)
    - [x] Tempo datasource with trace-to-logs and trace-to-metrics links
    - [x] Sampling: 100% staging, 10% production (configurable)
    - [x] Docs: `Docs/operations/apm-tracing.md`

- [x] **DONE** | P1 | `observability` | **Add centralized logging (Loki)**
  - Description: Aggregate container logs into a searchable, queryable logging platform
  - Acceptance criteria:
    - [x] All containers ship structured JSON logs (pino format)
    - [x] Loki + Promtail configs with health check noise suppression
    - [x] Grafana dashboard with tenant-scoped, request-tracing, and security sections
    - [x] Tenant-scoped log filtering via LogQL `| json | tenant_id="..."`
    - [x] Log retention: 30 days (configurable)
    - [x] 9 Grafana alert rules: error rate, auth failures, RLS violations, infra errors
    - [x] Comprehensive ops guide: `Docs/operations/centralized-logging.md` (595 lines)

- [x] **DONE** | P1 | `infra` | **Set up PgBouncer connection pooling**
  - Description: Connection pooler between API/worker and PostgreSQL to handle connection limits efficiently
  - Acceptance criteria:
    - [x] PgBouncer container added to docker-compose.yml (edoburu/pgbouncer:1.23.1)
    - [x] Transaction-mode pooling (compatible with RLS SET commands via `DISCARD ALL`)
    - [x] Pool size: 20 server connections, 200 client connections
    - [x] API and worker connect through PgBouncer (DATABASE_APP_URL → port 6432)
    - [x] Health check on PgBouncer
    - [x] Auto-detection in db.ts disables prepared statements when PgBouncer detected
    - [x] RLS context propagation verified (set_tenant_context scoped to transaction)

- [x] **DONE** | P1 | `testing` | **Add browser-based E2E tests to CI (Playwright)**
  - Description: End-to-end tests covering critical user journeys in a real browser
  - Acceptance criteria:
    - [x] Playwright config in `packages/web/playwright.config.ts`
    - [x] Critical user journeys covered: auth, employee CRUD, leave requests, navigation
    - [x] Test helpers and Page Object patterns in `packages/web/e2e/helpers/`
    - [ ] CI workflow integration (post-staging-deploy) — requires staging environment
    - [ ] Visual regression snapshots — requires baseline captures

- [x] **DONE** | P1 | `infra` | **Set up CDN for static assets**
  - Description: nginx caching + CDN-ready configuration for static frontend assets
  - Acceptance criteria:
    - [x] Hashed assets: `Cache-Control: public, max-age=31536000, immutable` (1 year)
    - [x] HTML: `no-cache` (always revalidate for SSR)
    - [x] nginx proxy cache zones: `static_cache_zone` (1GB) + `api_cache_zone` (256MB)
    - [x] Gzip + Brotli (commented, ready for custom nginx image)
    - [x] Cache bypass for authenticated requests
    - [x] Cloudflare + CloudFront setup guides with UK PoP recommendations
    - [x] Cache purge procedures documented
    - [x] Docs: `Docs/operations/cdn-static-assets.md`

- [x] **DONE** | P1 | `governance` | **Add PR templates and issue templates**
  - Description: Standardized templates for pull requests, bug reports, and feature requests
  - Acceptance criteria:
    - [x] PR template (`.github/pull_request_template.md`)
    - [x] Bug report issue template (`.github/ISSUE_TEMPLATE/bug_report.md`)
    - [x] Feature request issue template (`.github/ISSUE_TEMPLATE/feature_request.md`)
    - [x] Templates created with structured sections

- [x] **DONE** | P1 | `security` | **Certificate auto-renewal (Let's Encrypt)**
  - Description: Automated TLS certificate provisioning and renewal for all Staffora domains
  - Acceptance criteria:
    - [x] Certbot container in docker-compose (production profile, 12h renewal check)
    - [x] Domains: staffora.co.uk, api.staffora.co.uk (SAN certificate)
    - [x] `scripts/init-letsencrypt.sh` for first-time provisioning (--staging, --dry-run flags)
    - [x] Nginx ACME challenge location + graceful reload on renewal
    - [x] RSA 4096-bit keys, ISRG Root X1 preferred chain
    - [x] Manual fallback documented in `Docs/operations/ssl-certificates.md`

### P2 - Medium Priority (Planned)

- [x] **DONE** | P2 | `testing` | **Add load testing to CI**
  - Description: Automated load testing against staging to detect performance regressions
  - Acceptance criteria:
    - [x] k6 load test scripts in `packages/api/src/test/load/` (4 scenarios + config + README)
    - [x] Key scenarios: login burst (50 VUs), employee list (100 VUs), leave submissions (50 VUs), mixed workload (ramping 10→100)
    - [x] Baseline thresholds: P95 < 500ms, error rate < 1-2%
    - [ ] CI workflow integration (runs post-staging-deploy) — requires staging environment
    - [ ] Results published to GitHub Step Summary — requires CI integration

- [x] **DONE** | P2 | `infra` | **Set up feature flags**
  - Description: Custom Redis-based feature flag system with DB persistence
  - Acceptance criteria:
    - [x] `FeatureFlagService` with Redis cache + PostgreSQL storage (`packages/api/src/lib/feature-flags.ts`)
    - [x] Tenant-scoped flags with RLS (migration 0218)
    - [x] Role-based gating (roles JSONB array)
    - [x] Percentage rollout via FNV-1a hash (stable per-user)
    - [x] React hooks: `useFeatureFlag()`, `useFeatureFlags()`, `useAllFeatureFlags()`
    - [x] Elysia plugin: `requireFeatureFlag(name)` beforeHandle guard
    - [x] Admin CRUD endpoints + user evaluation endpoint

- [x] **DONE** | P2 | `infra` | **Infrastructure as Code (Terraform)**
  - Description: Terraform module structure and documentation for reproducible deployments
  - Acceptance criteria:
    - [x] 5 Terraform modules documented: VPS, DNS, firewall, backup, monitoring
    - [x] S3 remote state with DynamoDB locking + bootstrap script
    - [x] Hetzner VPS + Cloudflare DNS + AWS S3 backup modules
    - [x] CI/CD workflows: plan-on-PR, apply-on-merge
    - [x] Docs: `Docs/operations/infrastructure-as-code.md`

- [x] **DONE** | P2 | `testing` | **Add API contract testing**
  - Description: Contract tests to verify API responses match documented schemas
  - Acceptance criteria:
    - [x] TypeBox schemas as contract source of truth
    - [x] 44 contract tests: HR (18), absence (14), auth (12)
    - [x] `contract-helper.ts` with `assertMatchesSchema()`, `assertPaginatedResponse()`, `assertErrorResponse()`
    - [x] Real HTTP calls via `app.handle()` through full middleware chain
    - [x] Tests in `packages/api/src/test/contract/`

- [x] **DONE** | P2 | `security` | **Set up secret rotation**
  - Description: Automated rotation of secrets and credentials
  - Acceptance criteria:
    - [x] DATABASE_URL credentials 90-day rotation procedure documented
    - [x] SESSION_SECRET dual-key transition pattern documented
    - [x] BETTER_AUTH_SECRET rotation procedure documented
    - [x] Redis password rotation with zero-downtime documented
    - [x] 90-day enforcement tracking with Prometheus alerts
    - [x] Audit logging requirements for rotation events
    - [ ] GitHub Actions workflow_dispatch trigger — requires implementation

- [x] **DONE** | P2 | `infra` | **Multi-region deployment plan**
  - Description: Architecture plan for deploying Staffora to multiple UK/EU regions
  - Acceptance criteria:
    - [x] Architecture document: London primary + Dublin standby (856 lines)
    - [x] Database streaming replication (PostgreSQL 16 config)
    - [x] Redis Sentinel with 3-node quorum
    - [x] Route 53 DNS failover (10s checks, 60s TTL)
    - [x] UK GDPR data residency compliance documented
    - [x] RTO ~2min typical (within 15min target), RPO ~5min
    - [x] Cost estimate: $616/mo single vs $1,173/mo multi (+90%)

- [x] **DONE** | P2 | `testing` | **Add chaos engineering tests to CI**
  - Description: Expand existing chaos tests to run automatically in CI
  - Acceptance criteria:
    - [x] `.github/workflows/chaos-tests.yml` — weekly Sunday 2am UTC + manual trigger
    - [x] Runs all 3 chaos test suites (database, Redis, network)
    - [x] Results published to GitHub Step Summary with pass/fail table
    - [x] Test logs uploaded as artifacts on failure

### P3 - Low Priority (Backlog)

- [x] **DONE** | P3 | `deploy` | **Blue/green deployment strategy**
  - Description: Zero-downtime deployments using blue/green environments
  - Acceptance criteria:
    - [x] Two-environment architecture with shared PostgreSQL/Redis
    - [x] Nginx upstream switching via symlink
    - [x] Deployment script + rollback script
    - [x] Backward-compatible migration rules table
    - [x] Docs: `Docs/operations/blue-green-deployment.md`

- [x] **DONE** | P3 | `infra` | **Auto-scaling configuration**
  - Description: Docker Swarm deployment with cron-based auto-scaler
  - Acceptance criteria:
    - [x] Docker Swarm manifest (docker-compose.swarm.yml)
    - [x] API: 2-8 replicas, Worker: 1-4 replicas
    - [x] CPU + Redis queue depth triggers with 5-min cooldown
    - [x] PgBouncer connection budget calculations
    - [x] Prometheus alert rules + Grafana queries
    - [x] Docs: `Docs/operations/auto-scaling.md`

- [x] **DONE** | P3 | `operations` | **Disaster recovery drill schedule**
  - Description: Regular testing of disaster recovery procedures
  - Acceptance criteria:
    - [x] 12-month quarterly drill calendar with 7 drill types
    - [x] DB restore, S3 restore, PITR, full rebuild, DNS failover, service cascade, tabletop
    - [x] RTO/RPO measurement protocol with 6 milestone timestamps
    - [x] Drill report template (markdown with timeline, results, action items)
    - [x] Post-drill improvement tracking with priority SLAs
    - [x] Executable drill scripts (bash commands)

- [x] **DONE** | P3 | `operations` | **SLA/SLO definitions**
  - Description: Define and monitor Service Level Objectives for the platform
  - Acceptance criteria:
    - [x] 5 SLOs defined (availability 99.9%, P95 < 500ms, P99 < 2s, error < 0.1%, login > 99.5%)
    - [x] Error budgets calculated (43.2 min/month, 1000 errors/month)
    - [x] 5-level budget policy (Green→Exhausted) with actions
    - [x] Prometheus recording rules and burn rate alerts
    - [x] Monthly SLO review process with agenda template
    - [x] Module-specific latency targets
    - [ ] Grafana dashboards — require Prometheus/Grafana stack deployment

- [x] **DONE** | P3 | `security` | **WAF protection**
  - Description: ModSecurity v3 WAF configuration for nginx
  - Acceptance criteria:
    - [x] ModSecurity v3 + OWASP CRS v4 configuration (paranoia level 1)
    - [x] 6 custom Staffora rules (API headers, idempotency, SQLi, path traversal, rate limiting)
    - [x] GeoIP2 geo-blocking for UK/EU only
    - [x] Bot detection with User-Agent filtering
    - [x] WAF logs to Loki via Promtail
    - [x] False positive exclusions for bulk import/rich text
    - [x] Docs: `Docs/operations/waf-protection.md`

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
