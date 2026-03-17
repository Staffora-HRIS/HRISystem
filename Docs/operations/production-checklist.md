# Production Deployment & Commercial Readiness Checklist

> Status key: `[x]` Done | `[-]` Partial | `[ ]` Not started
>
> Priority: P0 = Blocker (must fix before launch) | P1 = Critical (launch week) | P2 = Important (month 1) | P3 = Nice-to-have
> **Last updated:** 2026-03-17

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
- [ ] **P0** — Container registry push workflow (ECR/GCR/GHCR)
- [ ] **P1** — Kubernetes manifests (Deployment, Service, Ingress, HPA)
- [ ] **P2** — Helm chart for parameterized deploys
- [ ] **P2** — Terraform/Pulumi IaC for cloud resources (RDS, ElastiCache, ECS/EKS)

### SSL / Domain / Reverse Proxy
- [x] Nginx reverse proxy with TLS 1.2+ and modern ciphers
- [x] HSTS header (2-year max-age)
- [x] Gzip compression enabled
- [x] Static asset caching headers
- [x] Client body size limit (50MB)
- [ ] **P0** — Let's Encrypt / certbot auto-renewal
- [ ] **P1** — CDN (CloudFront / Cloudflare) for static assets
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
- [ ] **P0** — GitHub Actions: build + typecheck on every PR
- [ ] **P0** — GitHub Actions: run API tests (`bun test`) on every PR
- [ ] **P0** — GitHub Actions: run frontend tests (`vitest`) on every PR
- [ ] **P0** — GitHub Actions: lint check on every PR
- [ ] **P1** — Code coverage reporting (Codecov / Coveralls)
- [ ] **P1** — Coverage thresholds (API >=80%, Web >=60%)
- [ ] **P2** — Playwright E2E tests in CI

### Deployment
- [ ] **P0** — Staging environment with same infra as production
- [ ] **P0** — Production deployment workflow (push to main -> deploy)
- [ ] **P0** — Database migration runner in deploy pipeline
- [ ] **P1** — Blue/green or rolling deployment strategy
- [ ] **P1** — Automated rollback on health check failure
- [ ] **P1** — Deployment notifications (Slack / Discord)
- [ ] **P2** — Feature flags system (LaunchDarkly / Unleash / custom)
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
- [ ] **P1** — Password policy enforcement (min length, complexity, history)
- [ ] **P1** — Account lockout after N failed attempts
- [ ] **P1** — Session timeout configuration (idle + absolute)
- [ ] **P2** — OAuth2/OIDC SSO (Google, Microsoft, Okta)
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
- [ ] **P0** — Pre-flight validation: fail startup if required secrets are empty
- [ ] **P0** — Remove hardcoded fallback passwords from code (`hris_dev_password`)
- [ ] **P1** — Secrets manager integration (AWS Secrets Manager / Vault)
- [x] **P1** — Secret rotation procedure documented (see [secret-rotation.md](secret-rotation.md))
- [ ] **P2** — Automated secret rotation

### Vulnerability Management
- [x] Trivy container scanning in CI
- [x] TruffleHog secret detection
- [x] Dependency audit (bun audit)
- [ ] **P1** — Dependabot / Renovate for dependency updates
- [ ] **P2** — SAST scanning (CodeQL / Semgrep)
- [ ] **P2** — Penetration test by third party before launch

---

## 4. Monitoring & Observability

### Logging
- [x] Request logging with response times
- [x] Request ID tracking across responses
- [x] Container-level JSON logging
- [x] **P0** — Centralized log aggregation (Loki + Promtail + Grafana) — see [log-aggregation.md](log-aggregation.md)
- [ ] **P0** — Structured logging with log levels (info/warn/error)
- [ ] **P1** — Sensitive data masking in logs (passwords, tokens, PII)
- [x] **P1** — Log retention policy (30 days default, configurable via LOKI_RETENTION_PERIOD)

### Error Tracking
- [ ] **P0** — Error tracking service (Sentry) — backend
- [ ] **P0** — Error tracking service (Sentry) — frontend
- [ ] **P1** — Alert rules for error rate spikes
- [ ] **P1** — On-call rotation / PagerDuty integration

### Metrics & Monitoring
- [x] Health check endpoint (`/health`) with db/redis status
- [x] Worker health check endpoint (port 3001)
- [ ] **P1** — Uptime monitoring (UptimeRobot / Pingdom / Better Uptime)
- [ ] **P1** — APM integration (Datadog / New Relic / OpenTelemetry)
- [ ] **P1** — Database monitoring (slow queries, connections, locks)
- [ ] **P2** — Prometheus metrics export (`/metrics`)
- [ ] **P2** — Grafana dashboards (API latency, error rates, queue depth)
- [ ] **P2** — Redis monitoring (memory, evictions, queue length)
- [ ] **P3** — SLA dashboard (99.9% uptime target)

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
- [ ] **P0** — Right to data export (personal data download as JSON/CSV)
- [ ] **P0** — Right to deletion (anonymize/purge user data)
- [ ] **P0** — Data retention policy (auto-delete after N years)
- [ ] **P1** — Data breach notification procedure
- [ ] **P1** — Data processing records (Article 30 GDPR)
- [ ] **P2** — Consent management for optional data processing
- [ ] **P2** — Data residency options (EU/US/APAC)

### Industry Compliance
- [ ] **P2** — SOC 2 Type II audit preparation
- [ ] **P2** — HIPAA compliance review (if handling health data in benefits)
- [ ] **P3** — ISO 27001 certification roadmap

---

## 8. Frontend Polish

### UX Essentials
- [x] Dark/light theme with persistence
- [x] 80+ route pages covering all modules
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
- [-] Frontend tests exist (10 files, vitest)
- [ ] **P1** — Increase frontend test coverage to 60%+
- [ ] **P1** — Playwright E2E tests for critical user flows
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
- [ ] **P2** — Webhook system for integrations (employee.created, leave.approved)
- [ ] **P2** — API key authentication for third-party integrations
- [ ] **P3** — GraphQL alternative endpoint

### Integrations
- [ ] **P2** — Payroll system integration (ADP, Gusto)
- [ ] **P2** — Calendar sync (Google Calendar, Outlook)
- [ ] **P2** — Slack / Teams notifications
- [ ] **P3** — HRIS data import (CSV/Excel bulk upload)
- [ ] **P3** — SSO marketplace (Okta, OneLogin catalog)

---

## 10. Performance & Scalability

### Load Testing
- [x] Performance test suite in codebase
- [ ] **P1** — Load test with realistic data volume (10K+ employees)
- [ ] **P1** — Identify and fix slow queries (>100ms)
- [ ] **P1** — Connection pool sizing for production load
- [ ] **P2** — Horizontal scaling validation (multiple API instances)
- [ ] **P2** — Worker scaling validation (consumer groups)

### Optimization
- [x] Database indexes (1,067+)
- [x] Redis caching layer
- [ ] **P1** — Slow query logging enabled in production postgres
- [ ] **P1** — Frontend bundle size audit (code splitting)
- [ ] **P2** — Query result caching strategy documented
- [ ] **P2** — Image/asset optimization pipeline
- [ ] **P3** — Read replica routing for heavy reports

---

## 11. Documentation

### Technical Docs
- [x] CLAUDE.md with architecture and conventions
- [x] Docs/ folder with guides, architecture, API reference
- [x] Swagger API docs at /docs
- [x] SECURITY.md with vulnerability reporting
- [ ] **P1** — Runbook: incident response procedures
- [ ] **P1** — Runbook: database restore procedure
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

### Phase 1: MVP Launch (Weeks 1-4)
Complete all **P0** items. Focus on:
1. CI/CD pipeline (build, test, deploy)
2. Stripe billing integration
3. Legal pages (Terms, Privacy)
4. Error tracking (Sentry)
5. Database backups
6. Startup secret validation
7. Staging environment
8. Email templates
9. Landing page

### Phase 2: Production Hardening (Weeks 5-8)
Complete all **P1** items. Focus on:
1. Centralized logging
2. Monitoring & alerting
3. Load testing
4. Security audit
5. SSO / OAuth2
6. Onboarding wizard
7. Runbooks
8. GDPR endpoints

### Phase 3: Scale (Months 3-6)
Complete **P2** items. Focus on:
1. Kubernetes deployment
2. SOC 2 preparation
3. Integration marketplace
4. i18n / localization
5. Advanced analytics
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
