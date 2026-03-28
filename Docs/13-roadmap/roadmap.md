# Staffora HRIS -- Product Roadmap

**Last Updated:** 2026-03-28
**Status:** Pre-production (near production-ready)
**Overall Readiness:** 94/100 -- Phase 1 and Phase 2 complete, Phase 3 substantially complete

> **Current Phase Status (2026-03-28):**
> - **Phase 1 (Security & Infrastructure):** COMPLETED. All critical security fixes, architecture improvements, and infrastructure essentials resolved during 2026-03-16 to 2026-03-21 sessions.
> - **Phase 2 (Technical Debt & Testing):** COMPLETED. Shared package integrated, code quality improved, UK compliance modules (RTW, SSP, DSAR, holiday) implemented, testing infrastructure established.
> - **Phase 3 (Feature Completion):** IN PROGRESS. Family leave, pension, payroll, GDPR, and compliance workflow modules are implemented (120 backend modules total, up from 72 at planning time). Remaining work is production deployment infrastructure: monitoring stack, WAL archiving, DR plan, and production environment hardening.
> - **Phase 4 (Production & Operations):** NOT STARTED. Pending Phase 3 infrastructure completion.

---

## Roadmap Overview

```
Q2 2026         Q3 2026         Q4 2026         Q1 2027
Apr  May  Jun   Jul  Aug  Sep   Oct  Nov  Dec   Jan  Feb  Mar
|----+----+----|----+----+----|----+----+----|----+----+----|
[==Phase 1===]
   [========Phase 2=========]
              [================Phase 3=================]
                                    [==Phase 4 (Ongoing)===>
                        ^                    ^
                   MVP Staging          Production Launch
```

---

## Q2 2026: Critical Fixes & Security Hardening

**Theme:** Make the platform secure and architecturally sound for staging deployment.

### Milestones

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| M1: Security vulnerabilities resolved | Week 2 (Apr 11) | COMPLETED (2026-03-21) |
| M2: Architecture risks mitigated | Week 4 (Apr 25) | COMPLETED (2026-03-21) |
| M3: CI/CD pipeline operational | Week 6 (May 9) | COMPLETED (2026-03-20) |
| M4: Dependency debt cleared | Week 8 (May 23) | COMPLETED (2026-03-21) |
| M5: Shared package integrated | Week 8 (May 23) | COMPLETED (2026-03-21) |

### Key Deliverables

- CSRF token validation (end-to-end, server + frontend)
- Account lockout mechanism
- Email verification enforced in production
- Graceful shutdown for API server
- `hris_app` role enforcing RLS in production
- Database connection pool consolidation
- Deployment pipeline (Docker images to registry, staging auto-deploy)
- Structured logging (Pino, JSON format)
- Error tracking (Sentry integration)
- Security scanning in CI (CodeQL, Trivy)
- Offsite backup storage (S3)
- Dependency version alignment (TypeBox, better-auth, vitest)
- `@staffora/shared` error codes, state machines, types in production code
- Dashboard module refactored to service/repository pattern

### Dependencies

- Docker registry access (GHCR or ECR)
- S3 bucket for backups
- Sentry account/DSN

### Risk Factors

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| CSRF fix breaks existing frontend flows | Medium | High | Comprehensive manual testing of all mutations |
| Connection pool consolidation causes BetterAuth issues | Low | High | Maintain pg driver as fallback if postgres.js adapter fails |
| Bun segfault on Windows blocks local dev | Medium | Medium | CI-only testing for affected code paths |

---

## Q3 2026: UK Compliance & Testing

**Theme:** Implement critical UK statutory requirements and establish reliable testing infrastructure.

### Milestones

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| M6: Code quality improvements complete | Week 10 (Jun 6) | COMPLETED (2026-03-21) |
| M7: Right to Work verification operational | Week 12 (Jun 20) | COMPLETED -- right-to-work module exists |
| M8: SSP calculation engine functional | Week 14 (Jul 4) | COMPLETED -- ssp module with 0155_ssp.sql |
| M9: Testing infrastructure established | Week 16 (Jul 18) | COMPLETED (2026-03-20) |
| M10: MVP Staging deployment | Week 16 (Jul 18) | NOT STARTED -- deployment pipeline ready, staging env pending |
| M11: Maternity/Paternity leave implemented | Week 18 (Aug 1) | COMPLETED -- family-leave, statutory-leave modules |
| M12: Pension auto-enrolment engine built | Week 22 (Aug 29) | COMPLETED -- pension module |

### Key Deliverables

**UK Compliance:**
- Right to Work verification workflow with expiry alerting
- UK holiday minimum enforcement (28 days, pro-rata)
- Bank holiday treatment configuration
- SSP calculation engine (waiting days, PIW linking, LEL, 28-week max)
- DSAR handling workflow
- Maternity leave & SMP
- Paternity leave & SPP
- Parental bereavement leave
- Shared Parental Leave & ShPP
- Adoption leave & SAP
- Pension auto-enrolment (eligibility, opt-out, re-enrolment)

**Code Quality:**
- Error handling added to 5+ services
- All `SELECT *` replaced with explicit columns
- HR service/repository split into sub-modules
- Route-level error boundaries in frontend
- Shared pagination helper

**Testing:**
- Hollow E2E test rewritten
- TestApiClient utility for HTTP-level testing
- 3+ route tests converted to real HTTP
- Auth flow E2E test

### Dependencies

- UK statutory rate tables (SSP, SMP, SPP, pension thresholds) -- must be updated annually
- Employee data populated in staging environment for testing

### Risk Factors

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| UK statutory calculations are complex and error-prone | High | Critical | Extensive test coverage with known-good examples from HMRC guidance |
| Family leave interactions are combinatorial | Medium | High | Phased implementation, maternity first as base case |
| Pension auto-enrolment requires real pension provider integration | Low | Medium | Initial implementation is calculation-only; provider API deferred |

---

## Q4 2026: Feature Completion & Integrations

**Theme:** Complete remaining compliance features, build integrations, and prepare production infrastructure.

### Milestones

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| M13: Payroll integration interface complete | Week 24 (Sep 26) | COMPLETED -- payroll module with RTI/FPS, PAYE, payslip generation |
| M14: GDPR compliance features complete | Week 26 (Oct 10) | COMPLETED -- dsar, data-erasure, data-breach, consent, privacy-notices, data-retention modules |
| M15: Disciplinary & flexible working workflows | Week 28 (Oct 24) | COMPLETED -- warnings, flexible-working modules |
| M16: Enhanced reporting operational | Week 30 (Nov 7) | PARTIAL -- analytics module exists, sickness-analytics, gender-pay-gap reporting; full compliance dashboard pending |
| M17: Monitoring stack deployed | Week 32 (Nov 21) | NOT STARTED -- metrics endpoint exists but Prometheus+Grafana not deployed |
| M18: Production launch readiness | Week 32 (Nov 21) | NOT STARTED -- pending M17, WAL archiving, DR plan |

### Key Deliverables

**Integrations:**
- Payroll data export interface (CSV/JSON, delta exports)
- Tax code storage and management
- P45/P60/P11D document storage
- Holiday pay 52-week reference period calculation

**GDPR:**
- Data retention and anonymisation engine
- Data breach notification workflow (72-hour ICO countdown)
- Privacy notice management
- Automatic read audit logging for sensitive data

**Compliance Workflows:**
- ACAS-compliant disciplinary/grievance workflow
- Flexible working request system (day-one right)
- Gender pay gap reporting

**Reporting:**
- Compliance dashboard
- Absence analytics (Bradford Factor, trends, cost)
- Headcount and turnover reports

**Infrastructure:**
- Prometheus + Grafana monitoring
- Database replication and point-in-time recovery
- Disaster recovery plan and runbooks
- Production environment configuration
- SSL/TLS provisioning

### Dependencies

- Payroll software API documentation (Sage, Xero, or similar)
- SSL certificates for production domain
- Production hosting environment (cloud provider or dedicated)

### Risk Factors

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Payroll integration requires provider-specific adapters | High | Medium | Build generic export first; provider adapters are Phase 4 |
| GDPR anonymisation may break referential integrity | Medium | High | Careful FK analysis; anonymise rather than delete |
| Production infrastructure decisions delayed | Medium | Critical | Make hosting decision by end of Q3 |

---

## Q1 2027: Production Deployment & Ongoing Operations

**Theme:** Launch to production, onboard initial tenants, and establish operational processes.

### Milestones

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| M19: Production deployment (first tenant) | Week 34 (Dec 5) | NOT STARTED |
| M20: Production stabilisation complete | Week 38 (Jan 2) | NOT STARTED |
| M21: Second tenant onboarded | Week 42 (Jan 30) | NOT STARTED |

### Key Deliverables

- Production deployment with all Phase 1-3 features
- Tenant onboarding runbook and automation
- SLA targets defined and monitored
- On-call rotation established
- Quarterly DR drill completed
- Performance baseline established
- Annual statutory rate update process documented

### Planned Feature Work (Phase 4 Backlog)

| Feature | Priority | Estimate | Notes |
|---------|----------|----------|-------|
| Health & Safety module | P2 | 4 weeks | Risk assessments, RIDDOR, DSE |
| Diversity monitoring | P2 | 2 weeks | Protected characteristics, voluntary collection |
| Reasonable adjustments tracking | P2 | 2 weeks | Equality Act compliance |
| Payroll provider adapters (Sage, Xero) | P2 | 3 weeks per provider | API integration |
| Employee self-service portal enhancements | P2 | 4 weeks | Leave requests, payslip viewing, profile updates |
| Mobile-responsive redesign | P3 | 6 weeks | Currently desktop-focused |
| API rate limiting per tenant plan | P3 | 1 week | Tiered tenancy |
| Webhook system for integrations | P3 | 2 weeks | Event-driven integrations |
| SSO/SAML integration | P3 | 3 weeks | Enterprise SSO |
| Advanced analytics and BI export | P3 | 4 weeks | Custom reports, Power BI integration |

---

## Dependency Map

```
Phase 1 (Security + Infra)
    |
    +-- CSRF fix --> Frontend API client --> All mutations work
    |
    +-- hris_app role --> RLS in production --> Multi-tenant safety
    |
    +-- CI/CD pipeline --> Staging deploy --> M10: MVP Staging
    |
    v
Phase 2 (Debt + Testing + Compliance Start)
    |
    +-- Shared package --> Error codes --> State machines --> Consistent codebase
    |
    +-- TestApiClient --> HTTP tests --> Auth E2E --> Confidence in auth
    |
    +-- RTW verification --> Employee activation gate
    |
    +-- SSP engine --> Payroll export data
    |
    v
Phase 3 (Features + Production Prep)
    |
    +-- Family leave --> SPL (depends on maternity) --> Payroll export
    |
    +-- Pension engine --> Payroll export
    |
    +-- GDPR compliance --> Data retention --> Production readiness
    |
    +-- Monitoring --> Alerting --> Production confidence
    |
    +-- DR plan --> Production launch approval
    |
    v
Phase 4 (Production + Ongoing)
```

---

## Success Metrics

| Metric | Phase 1 Target | Phase 3 Target | Production Target |
|--------|---------------|---------------|-------------------|
| Security audit score | 85/100 | 90/100 | 95/100 |
| Infrastructure audit score | 70/100 | 80/100 | 85/100 |
| Technical debt score | 55/100 | 70/100 | 80/100 |
| Testing audit score | 50/100 | 65/100 | 75/100 |
| UK compliance score | 18/100 | 50/100 | 75/100 |
| Architecture risk score | 65/100 | 75/100 | 85/100 |
| Test coverage (API) | 40% | 60% | 75% |
| Test coverage (Frontend) | 25% | 40% | 50% |
| Uptime SLA | N/A | N/A | 99.5% |

---

## Review Cadence

- **Weekly:** Sprint standup, blocker review
- **Bi-weekly:** Sprint review, demo, retrospective
- **Monthly:** Roadmap review, priority adjustment
- **Quarterly:** Audit re-run, score assessment, roadmap revision

---

## Related Documents

- [Kanban Board](kanban-board.md) — Work item tracking across all domains
- [Risk Register](risk-register.md) — Project risks and mitigation plans
- [Engineering TODO](engineering-todo.md) — Master engineering task list
- [Sprint Plan Phase 1](sprint-plan-phase1.md) — Critical fixes sprint plan
- [Sprint Plan Phase 2](sprint-plan-phase2.md) — High priority sprint plan
- [Sprint Plan Phase 3](sprint-plan-phase3.md) — Feature completion sprint plan
- [Implementation Status](../project-analysis/implementation_status.md) — Current feature completion assessment
- [Production Readiness Report](../operations/production-readiness-report.md) — Platform maturity scores
