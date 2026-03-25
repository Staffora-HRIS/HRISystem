# Production Deployment & Commercial Readiness Checklist

> Status key: `[x]` Done | `[-]` Partial | `[ ]` Not started
>
> Priority: P0 = Blocker (must fix before launch) | P1 = Critical (launch week) | P2 = Important (month 1) | P3 = Nice-to-have
> **Last updated:** 2026-03-21

---

## 1. Infrastructure & Deployment

### Docker / Container Setup
- [x] Multi-stage Dockerfile with non-root user (uid:1001)
- [x] Docker Compose with dev/production profiles
- [x] Resource limits (CPU/memory) on all containers
- [x] Health checks on postgres, redis, api, worker
- [x] Log rotation configured (json-file driver)
- [x] Network isolation (custom bridge network)
- [x] Volume persistence for postgres data
- [x] **P0** — Container registry push workflow (GHCR via release.yml)
- [ ] **P1** — Kubernetes manifests (Deployment, Service, Ingress, HPA)
- [ ] **P2** — Helm chart for parameterized deploys
- [ ] **P2** — Terraform/Pulumi IaC for cloud resources (RDS, ElastiCache, ECS/EKS)

### SSL / Domain / Reverse Proxy
- [x] Nginx reverse proxy with TLS 1.2+ and modern ciphers
- [x] HSTS header (2-year max-age)
- [x] Gzip compression enabled
- [x] Static asset caching headers
- [x] Client body size limit (50MB)
- [x] **P0** — Let's Encrypt / certbot auto-renewal (docker/certbot/ configured)
- [x] **P1** — CDN (nginx caching proxy + external CDN strategy documented — see [cdn-static-assets.md](cdn-static-assets.md))
- [ ] **P2** — OCSP stapling enabled

### Database Operations
- [x] 121 numbered SQL migrations with RLS policies
- [x] Two database roles (hris superuser, hris_app NOBYPASSRLS)
- [x] 1,067+ indexes across all tables
- [x] Connection pooling (max 20)
- [x] Automated daily backups (pg_dump via backup sidecar)
- [x] Backup restore procedure documented and tested — see [point-in-time-recovery.md](point-in-time-recovery.md)
- [x] Backup verification with automated restore test and SHA256 checksums — see [backup-verification.md](backup-verification.md)
- [x] Point-in-time recovery (PITR) via WAL archiving — see [point-in-time-recovery.md](point-in-time-recovery.md)
- [ ] **P1** — Read replica for reporting queries
- [x] PgBouncer connection pooling (transaction mode, max_client_conn=200, pool_size=25) — see [pgbouncer-guide.md](pgbouncer-guide.md)
- [ ] **P2** — Automated VACUUM/ANALYZE scheduling
- [ ] **P3** — Data archival strategy for old audit logs / events

---

## 2. CI/CD Pipeline

### Build & Test
- [x] Security scanning workflow (Trivy, TruffleHog, bun audit)
- [x] **P0** — GitHub Actions: build + typecheck on every PR (pr-check.yml)
- [x] **P0** — GitHub Actions: run API tests (`bun test`) on every PR (test.yml)
- [x] **P0** — GitHub Actions: run frontend tests (`vitest`) on every PR (test.yml)
- [x] **P0** — GitHub Actions: lint check on every PR (pr-check.yml)
- [x] **P1** — Code coverage reporting (coverage gates in test.yml)
- [x] **P1** — Coverage thresholds (API >=60%, Web >=50%, progressively increasing)
- [-] **P2** — Playwright E2E tests in CI (e2e.yml exists, browser tests written, requires staging environment)

### Deployment
- [x] **P0** — Staging environment with same infra as production (deploy.yml staging target)
- [x] **P0** — Production deployment workflow (push to main -> staging auto, production manual gate)
- [x] **P0** — Database migration runner in deploy pipeline (deploy.yml runs migrations via SSH)
- [x] **P1** — Blue/green or rolling deployment strategy (rolling restart in deploy.yml)
- [x] **P1** — Automated rollback on health check failure (deploy.yml rollback step)
- [x] **P1** — Deployment notifications (Slack notifications in deploy.yml)
- [x] **P2** — Feature flags system (custom Redis-backed, tenant-scoped, percentage rollout)
- [ ] **P2** — Canary deployments

---

## 3. Security

### Authentication & Authorization
- [x] BetterAuth with session management
- [x] MFA support (TOTP, OTP)
- [x] CSRF protection
- [x] HttpOnly session cookies
- [x] RBAC with granular permissions
- [x] Row-Level Security on all tenant tables
- [x] Rate limiting on auth endpoints (10 req/s)
- [-] MFA enforcement (feature-flagged, not mandatory)
- [ ] **P0** — Enforce MFA for admin roles in production
- [x] **P1** — Password policy enforcement (min 12 chars, max 128, bcrypt+scrypt hashing)
- [x] **P1** — Account lockout after N failed attempts (check_account_lockout function in Better Auth hooks)
- [x] **P1** — Session timeout configuration (7-day absolute, 24-hour rolling update, 5-min cookie cache)
- [x] **P2** — OAuth2/OIDC SSO (SSO module: packages/api/src/modules/sso/ with provider configuration)
- [ ] **P2** — IP allowlist/blocklist per tenant
- [ ] **P3** — Device fingerprinting / anomaly detection

### Headers & Transport
- [x] Security headers plugin (X-Frame-Options, CSP, HSTS, etc.)
- [x] CORS strict in production
- [x] Referrer-Policy: strict-origin-when-cross-origin
- [x] Permissions-Policy blocking camera, mic, geolocation
- [ ] **P1** — Remove `unsafe-inline` from CSP (currently needed for Swagger)
- [ ] **P2** — Subresource Integrity (SRI) for frontend assets

### Secrets Management
- [x] Secrets via environment variables
- [x] .env.example documents all required secrets
- [x] **P0** — Pre-flight validation: fail startup if required secrets are empty (fatal error in production)
- [x] **P0** — Remove hardcoded fallback passwords from code (dev-only labeled default with warning)
- [ ] **P1** — Secrets manager integration (AWS Secrets Manager / Vault)
- [x] **P1** — Secret rotation procedure documented (see [secret-rotation.md](secret-rotation.md))
- [ ] **P2** — Automated secret rotation

### Vulnerability Management
- [x] Trivy container scanning in CI
- [x] TruffleHog secret detection
- [x] Dependency audit (bun audit)
- [x] **P1** — Dependabot / Renovate for dependency updates (.github/dependabot.yml)
- [x] **P2** — SAST scanning (CodeQL via codeql.yml workflow)
- [ ] **P2** — Penetration test by third party before launch

---

## 4. Monitoring & Observability

### Logging
- [x] Request logging with response times
- [x] Request ID tracking across responses
- [x] Container-level JSON logging
- [x] **P0** — Centralized log aggregation (Loki + Promtail + Grafana) — see [log-aggregation.md](log-aggregation.md)
- [x] **P0** — Structured logging with log levels (Pino logger integrated across services)
- [ ] **P1** — Sensitive data masking in logs (passwords, tokens, PII)
- [x] **P1** — Log retention policy (30 days default, configurable via LOKI_RETENTION_PERIOD)

### Error Tracking
- [ ] **P0** — Error tracking service (Sentry) — backend
- [ ] **P0** — Error tracking service (Sentry) — frontend
- [x] **P1** — Alert rules for error rate spikes (Grafana alerting provisioned via loki-alerts.yml)
- [ ] **P1** — On-call rotation / PagerDuty integration

### Metrics & Monitoring
- [x] Health check endpoint (`/health`) with db/redis status
- [x] Worker health check endpoint (port 3001)
- [x] **P1** — Uptime monitoring (Uptime Kuma self-hosted — see [uptime-monitoring.md](uptime-monitoring.md))
- [x] **P1** — APM integration (OpenTelemetry + Grafana Tempo — see [apm-tracing.md](apm-tracing.md))
- [ ] **P1** — Database monitoring (slow queries, connections, locks)
- [ ] **P2** — Prometheus metrics export (`/metrics`)
- [x] **P2** — Grafana dashboards (staffora-overview.json + staffora-logs.json)
- [ ] **P2** — Redis monitoring (memory, evictions, queue length)
- [-] **P3** — SLA dashboard (SLO/SLI definitions documented — see [sla-slo-definitions.md](sla-slo-definitions.md); dashboard widget pending)

---

## 5. Email & Notifications

### Email Delivery
- [x] Notification worker with nodemailer abstraction
- [x] Multi-channel: email, in-app, push (Firebase)
- [x] Delivery tracking
- [x] SMTP configuration via env vars
- [ ] **P0** — Transactional email service (SendGrid / Postmark / SES)
- [ ] **P0** — Email templates for key flows (welcome, password reset, MFA, leave approval)
- [ ] **P1** — SPF, DKIM, DMARC DNS records for email deliverability
- [ ] **P1** — Bounce/complaint handling with webhooks
- [ ] **P1** — Unsubscribe / notification preference management
- [ ] **P2** — Email send rate limiting per tenant
- [ ] **P3** — SMS notifications (Twilio / SNS)

---

## 6. Billing & Subscription (SaaS)

### Payment Processing
- [-] Tenant model has subscription fields (start/end dates, billing info)
- [ ] **P0** — Stripe integration (or equivalent)
  - [ ] Customer creation on tenant signup
  - [ ] Subscription checkout flow
  - [ ] Payment method management (card, ACH)
  - [ ] Webhook handler for payment events
  - [ ] Invoice generation and PDF download
- [ ] **P0** — Pricing plans definition (tiers, per-seat, flat rate)
- [ ] **P0** — Subscription management UI (upgrade, downgrade, cancel)
- [ ] **P0** — Trial period logic (14/30-day free trial)

### Billing Operations
- [ ] **P1** — Dunning: retry failed payments (3 attempts over 7 days)
- [ ] **P1** — Grace period before service suspension
- [ ] **P1** — Usage metering (employee count per tenant)
- [ ] **P1** — Proration for mid-cycle plan changes
- [ ] **P2** — Annual billing discount
- [ ] **P2** — Coupon/discount code system
- [ ] **P2** — Revenue analytics dashboard
- [ ] **P3** — Multi-currency support

---

## 7. Legal & Compliance

### Required Pages
- [ ] **P0** — Terms of Service page (`/legal/terms`)
- [ ] **P0** — Privacy Policy page (`/legal/privacy`)
- [ ] **P0** — Cookie consent banner (GDPR/ePrivacy)
- [ ] **P1** — Acceptable Use Policy
- [ ] **P1** — Data Processing Agreement (DPA) for enterprise clients
- [ ] **P2** — Service Level Agreement (SLA) template

### Data Protection (GDPR / CCPA)
- [x] Audit logging for data access and mutations
- [x] RLS for tenant data isolation
- [x] **P0** — Right to data export (DSAR module: packages/api/src/modules/dsar/)
- [x] **P0** — Right to deletion (data-erasure module: packages/api/src/modules/data-erasure/)
- [x] **P0** — Data retention policy (data-retention module: packages/api/src/modules/data-retention/)
- [x] **P1** — Data breach notification procedure (data-breach module: packages/api/src/modules/data-breach/)
- [ ] **P1** — Data processing records (Article 30 GDPR)
- [x] **P2** — Consent management for optional data processing (consent module: packages/api/src/modules/consent/)
- [ ] **P2** — Data residency options (EU/US/APAC)

### Industry Compliance
- [ ] **P2** — SOC 2 Type II audit preparation
- [ ] **P2** — HIPAA compliance review (if handling health data in benefits)
- [ ] **P3** — ISO 27001 certification roadmap

---

## 8. Frontend Polish

### UX Essentials
- [x] Dark/light theme with persistence
- [x] 160+ route pages covering all modules
- [x] Permission-based route guards
- [x] Toast notification system
- [x] Loading states and suspense boundaries
- [x] 404 page
- [x] Error boundary (React Router)
- [ ] **P0** — Custom error boundary UI with "report issue" action
- [ ] **P0** — Empty states for all list pages (not just "No data")
- [ ] **P1** — Onboarding wizard for new tenants (guided setup)
- [ ] **P1** — Global search / command palette (Cmd+K)
- [ ] **P1** — Responsive mobile layout audit
- [ ] **P2** — Keyboard navigation / accessibility audit (WCAG 2.1 AA)
- [ ] **P2** — i18n / localization framework
- [ ] **P3** — PWA / service worker for offline support

### Testing
- [x] Frontend tests exist (35+ files, vitest, coverage gate at 50%)
- [-] **P1** — Increase frontend test coverage to 60%+ (currently at 50% gate, progressively increasing)
- [x] **P1** — Playwright E2E tests for critical user flows (auth, employee CRUD, leave request, navigation)
- [ ] **P2** — Visual regression tests (Chromatic / Percy)
- [ ] **P2** — Accessibility automated tests (axe-core)

---

## 9. API & Integration

### API Quality
- [x] Swagger/OpenAPI auto-generated docs at `/docs`
- [x] TypeBox schemas on all endpoints
- [x] Cursor-based pagination
- [x] Idempotency key support on mutations
- [x] Consistent error response shape
- [ ] **P1** — API rate limiting per tenant (not just auth endpoints)
- [ ] **P1** — API versioning strategy documented (v1 -> v2 migration plan)
- [ ] **P1** — OpenAPI spec export for SDK generation
- [x] **P2** — Webhook system for integrations (webhooks module: packages/api/src/modules/webhooks/)
- [ ] **P2** — API key authentication for third-party integrations
- [ ] **P3** — GraphQL alternative endpoint

### Integrations
- [ ] **P2** — Payroll system integration (ADP, Gusto) — UK payroll module exists with HMRC RTI
- [ ] **P2** — Calendar sync (Google Calendar, Outlook)
- [ ] **P2** — Slack / Teams notifications
- [x] **P3** — HRIS data import (CSV/Excel bulk upload) (data-import module: packages/api/src/modules/data-import/)
- [ ] **P3** — SSO marketplace (Okta, OneLogin catalog)

---

## 10. Performance & Scalability

### Load Testing
- [x] Performance test suite in codebase (packages/api/src/test/load/ — login, employee list, leave, mixed workload)
- [ ] **P1** — Load test with realistic data volume (10K+ employees)
- [x] **P1** — Identify and fix slow queries (N+1 employee list fixed with LEFT JOINs)
- [ ] **P1** — Connection pool sizing for production load
- [ ] **P2** — Horizontal scaling validation (multiple API instances)
- [ ] **P2** — Worker scaling validation (consumer groups)

### Optimization
- [x] Database indexes (1,067+)
- [x] Redis caching layer
- [ ] **P1** — Slow query logging enabled in production postgres
- [ ] **P1** — Frontend bundle size audit (code splitting)
- [x] **P2** — Query result caching strategy (module-level caching with tenant-scoped keys and TTLs on reference data)
- [ ] **P2** — Image/asset optimization pipeline
- [ ] **P3** — Read replica routing for heavy reports

---

## 11. Documentation

### Technical Docs
- [x] CLAUDE.md with architecture and conventions
- [x] Docs/ folder with guides, architecture, API reference
- [x] Swagger API docs at /docs
- [x] SECURITY.md with vulnerability reporting
- [x] **P1** — Runbook: incident response procedures (Docs/operations/runbooks/ — 8 runbooks + escalation matrix)
- [x] **P1** — Runbook: database restore procedure (Docs/operations/runbooks/database-migration-failure.md + point-in-time-recovery.md)
- [ ] **P1** — Runbook: scaling guide (when and how to add capacity)
- [ ] **P2** — Architecture Decision Records (ADRs) for major decisions

### Customer-Facing Docs
- [ ] **P0** — Product marketing website / landing page (managed in separate repository)
- [ ] **P0** — Feature overview with screenshots
- [ ] **P1** — Admin user guide (PDF or help center)
- [ ] **P1** — Employee self-service guide
- [ ] **P1** — API documentation for integrators
- [ ] **P2** — Video tutorials / walkthroughs
- [ ] **P2** — Knowledge base / help center (Intercom / Zendesk)
- [ ] **P3** — Developer documentation for custom integrations

---

## 12. Go-to-Market

### Product
- [ ] **P0** — Pricing page with tier comparison
- [ ] **P0** — Self-service signup flow (tenant creation + admin user)
- [ ] **P0** — Demo environment with sample data
- [ ] **P1** — In-app upgrade prompts for higher tiers
- [ ] **P1** — Usage dashboard for tenant admins
- [ ] **P2** — White-label / custom branding per tenant
- [ ] **P2** — Multi-language support

### Sales & Support
- [ ] **P1** — Customer support channel (Intercom / Zendesk / email)
- [ ] **P1** — CRM integration for lead tracking
- [ ] **P1** — Feedback collection mechanism
- [ ] **P2** — In-app changelog / what's new announcements
- [ ] **P2** — Customer success health scoring
- [ ] **P3** — Referral / affiliate program

---

## Launch Readiness Summary

### Completed (as of 2026-03-21)
The following areas previously tracked as P0/P1 are now resolved:
- CI/CD pipeline (build, test, deploy) — 10 GitHub Actions workflows
- Database backups — daily pg_dump + WAL archiving PITR with verification
- Startup secret validation — fatal error in production if secrets missing
- Staging environment — deploy.yml with staging auto-deploy
- Centralized logging — Loki + Promtail + Grafana + Pino structured logging
- Runbooks — 8 incident response runbooks covering all critical scenarios
- GDPR endpoints — DSAR, data-erasure, data-retention, data-breach, consent modules
- Feature flags — Redis-backed with tenant-scoped rollout

### Phase 1: MVP Launch (Remaining)
Complete remaining **P0** items:
1. Stripe billing integration
2. Legal pages (Terms, Privacy)
3. Error tracking (Sentry) — backend + frontend
4. Transactional email service + templates
5. Custom error boundary UI
6. Empty states for list pages

### Phase 2: Production Hardening
Complete remaining **P1** items:
1. Database monitoring (slow queries, connections, locks)
2. Security audit (third-party penetration test)
3. On-call rotation / PagerDuty integration
4. Onboarding wizard for new tenants
5. Global search / command palette
6. Progressive coverage threshold increase (API 80%, Frontend 70%)

### Phase 3: Scale (Months 3-6)
Complete **P2** items:
1. Kubernetes deployment / Helm charts
2. SOC 2 preparation
3. Integration marketplace
4. i18n / localization
5. Infrastructure as Code (Terraform/Pulumi)
6. White-label support

---

## Current Architecture Strengths

These are already production-grade and should not be rebuilt:

- **Multi-tenant RLS** — Database-level isolation, not application-level
- **Outbox pattern** — Reliable event publishing, exactly-once semantics
- **Worker system** — Redis Streams with consumer groups, graceful shutdown, dead letter queue
- **State machines** — Defined in shared package, enforced in service layer
- **Audit logging** — Every mutation tracked with actor, timestamp, old/new values
- **Idempotency** — Request deduplication prevents double-writes
- **RBAC** — Granular permissions with role inheritance
- **Module architecture** — Clean separation: schemas -> repository -> service -> routes

---

## Related Documents

- [Production Readiness Report](production-readiness-report.md) — Platform maturity scores and gap analysis
- [Deployment Guide](../guides/DEPLOYMENT.md) — Docker Compose deployment instructions
- [DevOps Dashboard](../devops/devops-dashboard.md) — CI/CD pipeline architecture
- [DevOps Master Checklist](../checklists/devops-master-checklist.md) — Comprehensive DevOps readiness checklist
- [Infrastructure Audit](../audit/infrastructure-audit.md) — Docker, CI/CD, and infrastructure findings
- [Security Audit](../audit/security-audit.md) — Security posture assessment
- [Risk Register](../project-management/risk-register.md) — Production deployment risks
