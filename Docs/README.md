# Staffora Documentation

> **Enterprise multi-tenant HRIS platform** — [staffora.co.uk](https://staffora.co.uk)
> 196 files | 15 sections | 120+ modules | 200+ API endpoints | 160 frontend routes
> **Last updated:** 2026-03-28

---

## Quick Links

| Document | Path | Description |
|----------|------|-------------|
| Getting Started | [05-development/getting-started.md](05-development/getting-started.md) | First-time developer setup, prerequisites, Docker |
| Architecture Overview | [02-architecture/ARCHITECTURE.md](02-architecture/ARCHITECTURE.md) | System design, plugin chain, request flow |
| Architecture Diagrams | [02-architecture/diagrams.md](02-architecture/diagrams.md) | 20+ Mermaid diagrams for all subsystems |
| API Reference | [04-api/API_REFERENCE.md](04-api/API_REFERENCE.md) | All 200+ REST endpoints by module |
| Module Catalog | [01-overview/module-catalog.md](01-overview/module-catalog.md) | Complete catalog of all backend modules |
| Frontend Guide | [05-development/frontend-overview.md](05-development/frontend-overview.md) | React architecture, routes, components |
| Database Guide | [02-architecture/DATABASE.md](02-architecture/DATABASE.md) | Schema, RLS, migrations, table catalog |
| Security | [07-security/README.md](07-security/README.md) | Auth, RBAC, RLS, OWASP mitigations |
| Testing Guide | [08-testing/testing-guide.md](08-testing/testing-guide.md) | Test infrastructure and patterns |
| Deployment | [05-development/DEPLOYMENT.md](05-development/DEPLOYMENT.md) | Production deployment with Docker |
| UK Compliance | [12-compliance/uk-employment-law.md](12-compliance/uk-employment-law.md) | Employment law, statutory requirements |
| Troubleshooting | [14-troubleshooting/README.md](14-troubleshooting/README.md) | Common issues and debug procedures |
| Documentation Changelog | [CHANGELOG.md](CHANGELOG.md) | History of major documentation updates |

---

## Complete Section Map

### 01 - Overview

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [01-overview/](01-overview/) | 2 | Top-level system documentation and module catalog |

| File | Description |
|------|-------------|
| [module-catalog.md](01-overview/module-catalog.md) | Complete catalog of all backend modules with endpoints and architecture |
| [system-documentation.md](01-overview/system-documentation.md) | Consolidated system reference document |

### 02 - Architecture

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [02-architecture/](02-architecture/) | 17 + 5 ADRs | System design, database, workers, permissions, diagrams |

| File | Description |
|------|-------------|
| [ARCHITECTURE.md](02-architecture/ARCHITECTURE.md) | System overview, plugin chain, request flow, module pattern |
| [DATABASE.md](02-architecture/DATABASE.md) | Schema design, migrations, RLS, table catalog |
| [PERMISSIONS_SYSTEM.md](02-architecture/PERMISSIONS_SYSTEM.md) | Permission model, RBAC hierarchy, enforcement |
| [WORKER_SYSTEM.md](02-architecture/WORKER_SYSTEM.md) | Background jobs, Redis Streams, outbox processing |
| [architecture-map.md](02-architecture/architecture-map.md) | High-level architecture component map |
| [architecture-redesign.md](02-architecture/architecture-redesign.md) | Architecture evolution and redesign proposals |
| [database-guide.md](02-architecture/database-guide.md) | Database deep-dive: queries, roles, performance |
| [diagrams.md](02-architecture/diagrams.md) | 20+ Mermaid diagrams for all subsystems |
| [permissions-v2-migration-guide.md](02-architecture/permissions-v2-migration-guide.md) | Migration guide for permissions v2 |
| [repository-map.md](02-architecture/repository-map.md) | Repository structure and file organization |
| [security-patterns.md](02-architecture/security-patterns.md) | RLS, auth, RBAC, audit, idempotency patterns |
| [state-machines.md](02-architecture/state-machines.md) | 5 state machines with Mermaid diagrams |
| [system-diagrams.md](02-architecture/system-diagrams.md) | Additional system-level diagrams |
| [worker-system.md](02-architecture/worker-system.md) | Worker system deep-dive |
| [README.md](02-architecture/README.md) | Architecture section index |

**Architecture Decision Records (ADRs):**

| ADR | Title |
|-----|-------|
| [ADR-001](02-architecture/adr/001-better-auth-for-authentication.md) | Better Auth for Authentication |
| [ADR-002](02-architecture/adr/002-redis-streams-for-async-processing.md) | Redis Streams for Async Processing |
| [ADR-003](02-architecture/adr/003-transactional-outbox-pattern.md) | Transactional Outbox Pattern |
| [ADR-004](02-architecture/adr/004-row-level-security-multi-tenant.md) | Row-Level Security for Multi-Tenancy |

### 03 - Features

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [03-features/](03-features/) | 12 | Detailed documentation for each functional module |

| File | Description |
|------|-------------|
| [core-hr.md](03-features/core-hr.md) | Employees, org units, positions, compensation |
| [time-attendance.md](03-features/time-attendance.md) | Time events, schedules, shifts, timesheets |
| [absence-management.md](03-features/absence-management.md) | Leave types, policies, requests, balances, accruals |
| [talent-management.md](03-features/talent-management.md) | Goals, review cycles, reviews, calibration |
| [recruitment.md](03-features/recruitment.md) | Requisitions, candidates, hiring pipeline |
| [payroll-finance.md](03-features/payroll-finance.md) | Payroll runs, tax, NI, deductions |
| [benefits-administration.md](03-features/benefits-administration.md) | Plans, carriers, enrollments, dependents |
| [document-management.md](03-features/document-management.md) | Documents, versioning, templates |
| [case-management.md](03-features/case-management.md) | Cases, SLA tracking, escalation workflows |
| [onboarding.md](03-features/onboarding.md) | Checklists, templates, task tracking |
| [employee-self-service.md](03-features/employee-self-service.md) | Portal, self-service aggregations |
| [uk-compliance.md](03-features/uk-compliance.md) | Right-to-work, SSP, pension, HMRC, statutory leave |

### 04 - API

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [04-api/](04-api/) | 4 | API surface, endpoint reference, error codes |

| File | Description |
|------|-------------|
| [api-reference.md](04-api/api-reference.md) | API reference (alternate format) |
| [API_REFERENCE.md](04-api/API_REFERENCE.md) | All 200+ endpoints organized by module |
| [ERROR_CODES.md](04-api/ERROR_CODES.md) | Error codes and messages by module |
| [README.md](04-api/README.md) | API section index |

### 05 - Development

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [05-development/](05-development/) | 15 | Developer guides, setup, coding patterns |

| File | Description |
|------|-------------|
| [getting-started.md](05-development/getting-started.md) | First-time setup: prerequisites, Docker, migrations, seed data |
| [backend-development.md](05-development/backend-development.md) | Backend development patterns and conventions |
| [frontend-development.md](05-development/frontend-development.md) | Frontend development workflow |
| [database-guide.md](05-development/database-guide.md) | Database development guide |
| [coding-patterns.md](05-development/coding-patterns.md) | Common coding patterns across the codebase |
| [patterns-index.md](05-development/patterns-index.md) | Index of all reusable design patterns |
| [DEPLOYMENT.md](05-development/DEPLOYMENT.md) | Production deployment with Docker |
| [FRONTEND.md](05-development/FRONTEND.md) | Quick reference for frontend patterns |
| [GETTING_STARTED.md](05-development/GETTING_STARTED.md) | Getting started (legacy format) |
| [frontend-overview.md](05-development/frontend-overview.md) | Frontend architecture overview |
| [frontend-routes.md](05-development/frontend-routes.md) | Complete route map (160 routes) |
| [frontend-components.md](05-development/frontend-components.md) | Component library documentation |
| [frontend-data-fetching.md](05-development/frontend-data-fetching.md) | React Query and API patterns |
| [frontend-accessibility-audit.md](05-development/frontend-accessibility-audit.md) | Accessibility audit findings |
| [README.md](05-development/README.md) | Development section index |

### 06 - DevOps

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [06-devops/](06-devops/) | 8 | Docker, CI/CD, infrastructure management |

| File | Description |
|------|-------------|
| [docker-guide.md](06-devops/docker-guide.md) | Container architecture and development workflow |
| [ci-cd-pipeline.md](06-devops/ci-cd-pipeline.md) | CI/CD pipeline documentation |
| [ci-cd.md](06-devops/ci-cd.md) | CI/CD configuration and workflows |
| [devops-dashboard.md](06-devops/devops-dashboard.md) | DevOps metrics and status dashboard |
| [devops-master-checklist.md](06-devops/devops-master-checklist.md) | Full DevOps requirements checklist |
| [devops-status-report.md](06-devops/devops-status-report.md) | Current DevOps status assessment |
| [devops-tasks.md](06-devops/devops-tasks.md) | Outstanding DevOps tasks |
| [README.md](06-devops/README.md) | DevOps section index |

### 07 - Security

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [07-security/](07-security/) | 7 | Authentication, authorization, data protection |

| File | Description |
|------|-------------|
| [authentication.md](07-security/authentication.md) | Better Auth integration, sessions, MFA |
| [authorization.md](07-security/authorization.md) | RBAC, permission hierarchy, enforcement |
| [data-protection.md](07-security/data-protection.md) | GDPR, data encryption, privacy |
| [rls-multi-tenancy.md](07-security/rls-multi-tenancy.md) | Row-Level Security for tenant isolation |
| [security-audit.md](07-security/security-audit.md) | Security audit findings |
| [security-review-checklist.md](07-security/security-review-checklist.md) | Security review checklist for PRs |
| [README.md](07-security/README.md) | Security section index |

### 08 - Testing

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [08-testing/](08-testing/) | 4 | Test infrastructure, guides, coverage |

| File | Description |
|------|-------------|
| [testing-guide.md](08-testing/testing-guide.md) | Writing and running tests, helpers, patterns |
| [test-coverage-matrix.md](08-testing/test-coverage-matrix.md) | Test coverage by module |
| [test-matrix.md](08-testing/test-matrix.md) | Test type matrix (unit, integration, e2e) |
| [README.md](08-testing/README.md) | Testing section index |

### 09 - Integrations

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [09-integrations/](09-integrations/) | 3 | External services and webhook system |

| File | Description |
|------|-------------|
| [external-services.md](09-integrations/external-services.md) | S3, email (SMTP), Firebase, Redis integrations |
| [webhook-system.md](09-integrations/webhook-system.md) | Webhook configuration and event delivery |
| [README.md](09-integrations/README.md) | Integrations section index |

### 10 - AI Agents

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [10-ai-agents/](10-ai-agents/) | 2 | AI development agent system and skills |

| File | Description |
|------|-------------|
| [agent-system.md](10-ai-agents/agent-system.md) | Agent architecture and available agents |
| [README.md](10-ai-agents/README.md) | AI agents section index |

### 11 - Operations

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [11-operations/](11-operations/) | 24 + 10 runbooks | Production readiness, monitoring, disaster recovery |

**Key operational documents:**

| File | Description |
|------|-------------|
| [monitoring-observability.md](11-operations/monitoring-observability.md) | Metrics, alerting, dashboards |
| [worker-system.md](11-operations/worker-system.md) | Worker operations and monitoring |
| [production-checklist.md](11-operations/production-checklist.md) | Pre-launch verification checklist |
| [production-readiness-report.md](11-operations/production-readiness-report.md) | Production readiness assessment |
| [disaster-recovery.md](11-operations/disaster-recovery.md) | DR strategy and procedures |
| [enterprise-engineering-checklist.md](11-operations/enterprise-engineering-checklist.md) | Enterprise engineering quality checklist |
| [sla-slo-definitions.md](11-operations/sla-slo-definitions.md) | SLA/SLO definitions |
| [centralized-logging.md](11-operations/centralized-logging.md) | Log aggregation and search |
| [pgbouncer-guide.md](11-operations/pgbouncer-guide.md) | Connection pooling with PgBouncer |
| [secret-rotation.md](11-operations/secret-rotation.md) | Secret management and rotation |
| [README.md](11-operations/README.md) | Operations section index |

**Runbooks** ([11-operations/runbooks/](11-operations/runbooks/)):

| Runbook | Scenario |
|---------|----------|
| [api-5xx-spike.md](11-operations/runbooks/api-5xx-spike.md) | API 5xx error rate spike |
| [database-connection-exhaustion.md](11-operations/runbooks/database-connection-exhaustion.md) | Database connection pool exhaustion |
| [database-migration-failure.md](11-operations/runbooks/database-migration-failure.md) | Failed database migration |
| [disk-space-full.md](11-operations/runbooks/disk-space-full.md) | Disk space full |
| [escalation-matrix.md](11-operations/runbooks/escalation-matrix.md) | Incident escalation matrix |
| [failed-deployment-rollback.md](11-operations/runbooks/failed-deployment-rollback.md) | Deployment rollback procedure |
| [post-incident-template.md](11-operations/runbooks/post-incident-template.md) | Post-incident review template |
| [redis-memory-full.md](11-operations/runbooks/redis-memory-full.md) | Redis memory full |
| [security-incident.md](11-operations/runbooks/security-incident.md) | Security incident response |
| [ssl-certificate-expiry.md](11-operations/runbooks/ssl-certificate-expiry.md) | SSL certificate expiry |

### 12 - Compliance

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [12-compliance/](12-compliance/) | 5 + 12 issues | UK employment law, GDPR, compliance audits |

| File | Description |
|------|-------------|
| [uk-employment-law.md](12-compliance/uk-employment-law.md) | UK employment law requirements |
| [gdpr-compliance.md](12-compliance/gdpr-compliance.md) | GDPR data protection compliance |
| [uk-compliance-audit.md](12-compliance/uk-compliance-audit.md) | Compliance audit findings |
| [uk-hr-compliance-report.md](12-compliance/uk-hr-compliance-report.md) | Full UK HR compliance report |
| [README.md](12-compliance/README.md) | Compliance section index |

**Compliance Issues** ([12-compliance/issues/](12-compliance/issues/)):

| Issue | Topic |
|-------|-------|
| [compliance-001](12-compliance/issues/compliance-001-right-to-work.md) | Right to work verification |
| [compliance-002](12-compliance/issues/compliance-002-ssp-calculations.md) | SSP calculations |
| [compliance-003](12-compliance/issues/compliance-003-family-leave.md) | Family leave entitlements |
| [compliance-004](12-compliance/issues/compliance-004-pension-auto-enrolment.md) | Pension auto-enrolment |
| [compliance-005](12-compliance/issues/compliance-005-holiday-entitlement.md) | Holiday entitlement |
| [compliance-006](12-compliance/issues/compliance-006-hmrc-integration.md) | HMRC integration |
| [compliance-007](12-compliance/issues/compliance-007-data-protection-breach-notification.md) | Data protection breach notification |
| [compliance-008](12-compliance/issues/compliance-008-flexible-working-requests.md) | Flexible working requests |
| [compliance-009](12-compliance/issues/compliance-009-employment-contracts.md) | Employment contracts |
| [compliance-010](12-compliance/issues/compliance-010-gender-pay-gap-reporting.md) | Gender pay gap reporting |
| [compliance-011](12-compliance/issues/compliance-011-equality-diversity.md) | Equality and diversity |
| [compliance-012](12-compliance/issues/compliance-012-disciplinary-grievance-acas.md) | Disciplinary/grievance (ACAS) |

### 13 - Roadmap

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [13-roadmap/](13-roadmap/) | 9 + 6 analysis files | Roadmap, sprints, risk register, requirements |

| File | Description |
|------|-------------|
| [roadmap.md](13-roadmap/roadmap.md) | Feature delivery roadmap |
| [sprint-plan-phase1.md](13-roadmap/sprint-plan-phase1.md) | Sprint plan: Phase 1 |
| [sprint-plan-phase2.md](13-roadmap/sprint-plan-phase2.md) | Sprint plan: Phase 2 |
| [sprint-plan-phase3.md](13-roadmap/sprint-plan-phase3.md) | Sprint plan: Phase 3 |
| [kanban-board.md](13-roadmap/kanban-board.md) | Kanban board status |
| [risk-register.md](13-roadmap/risk-register.md) | Risk identification and mitigation |
| [engineering-todo.md](13-roadmap/engineering-todo.md) | Engineering task backlog |
| [master-engineering-todo.md](13-roadmap/master-engineering-todo.md) | Master engineering TODO list |

**Analysis** ([13-roadmap/analysis/](13-roadmap/analysis/)):

| File | Description |
|------|-------------|
| [master_requirements.md](13-roadmap/analysis/master_requirements.md) | Master requirements document |
| [master_requirements.json](13-roadmap/analysis/master_requirements.json) | Requirements (machine-readable) |
| [implementation_status.md](13-roadmap/analysis/implementation_status.md) | Implementation progress by module |
| [implementation_status.json](13-roadmap/analysis/implementation_status.json) | Implementation status (machine-readable) |
| [tickets.md](13-roadmap/analysis/tickets.md) | Development tickets |
| [README.md](13-roadmap/analysis/README.md) | Analysis section index |

### 14 - Troubleshooting

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [14-troubleshooting/](14-troubleshooting/) | 2 + 28 issues | Known issues by category with resolution plans |

| File | Description |
|------|-------------|
| [README.md](14-troubleshooting/README.md) | Troubleshooting index and debug procedures |

**Architecture Issues** ([14-troubleshooting/issues/](14-troubleshooting/issues/)):

| Issue | Description |
|-------|-------------|
| [architecture-001](14-troubleshooting/issues/architecture-001-no-graceful-shutdown.md) | No graceful shutdown |
| [architecture-002](14-troubleshooting/issues/architecture-002-single-points-of-failure.md) | Single points of failure |
| [architecture-003](14-troubleshooting/issues/architecture-003-connection-pool-exhaustion.md) | Connection pool exhaustion |
| [architecture-004](14-troubleshooting/issues/architecture-004-audit-logging-outside-transactions.md) | Audit logging outside transactions |
| [architecture-005](14-troubleshooting/issues/architecture-005-tenant-cache-race-window.md) | Tenant cache race window |
| [architecture-006](14-troubleshooting/issues/architecture-006-dashboard-inline-sql.md) | Dashboard inline SQL |
| [architecture-007](14-troubleshooting/issues/architecture-007-redis-keys-command.md) | Redis KEYS command usage |
| [architecture-008](14-troubleshooting/issues/architecture-008-dual-user-tables.md) | Dual user tables |

**Security Issues:**

| Issue | Description |
|-------|-------------|
| [security-001](14-troubleshooting/issues/security-001-csrf-token-validation.md) | CSRF token validation |
| [security-002](14-troubleshooting/issues/security-002-frontend-csrf-tokens-not-sent.md) | Frontend CSRF tokens not sent |
| [security-003](14-troubleshooting/issues/security-003-email-verification-disabled.md) | Email verification disabled |
| [security-004](14-troubleshooting/issues/security-004-account-lockout-missing.md) | Account lockout missing |
| [security-005](14-troubleshooting/issues/security-005-password-policy-weak.md) | Password policy weak |
| [security-006](14-troubleshooting/issues/security-006-gdpr-dsar-endpoint.md) | GDPR DSAR endpoint |
| [security-007](14-troubleshooting/issues/security-007-data-erasure-missing.md) | Data erasure missing |
| [security-008](14-troubleshooting/issues/security-008-request-body-size-limit.md) | Request body size limit |

**Tech Debt Issues:**

| Issue | Description |
|-------|-------------|
| [tech-debt-001](14-troubleshooting/issues/tech-debt-001-shared-package-unused.md) | Shared package unused |
| [tech-debt-002](14-troubleshooting/issues/tech-debt-002-dual-postgresql-drivers.md) | Dual PostgreSQL drivers |
| [tech-debt-003](14-troubleshooting/issues/tech-debt-003-dependency-version-mismatches.md) | Dependency version mismatches |
| [tech-debt-004](14-troubleshooting/issues/tech-debt-004-hollow-tests.md) | Hollow tests |
| [tech-debt-005](14-troubleshooting/issues/tech-debt-005-select-star-usage.md) | SELECT * usage |
| [tech-debt-006](14-troubleshooting/issues/tech-debt-006-services-missing-error-handling.md) | Services missing error handling |
| [tech-debt-007](14-troubleshooting/issues/tech-debt-007-large-god-classes.md) | Large god classes |
| [tech-debt-008](14-troubleshooting/issues/tech-debt-008-unused-dependencies.md) | Unused dependencies |
| [tech-debt-009](14-troubleshooting/issues/tech-debt-009-frontend-error-boundaries.md) | Frontend error boundaries |
| [tech-debt-010](14-troubleshooting/issues/tech-debt-010-n-plus-one-query-patterns.md) | N+1 query patterns |

### 15 - Archive

| Directory | Files | Description |
|-----------|:-----:|-------------|
| [15-archive/](15-archive/) | 27 | Superseded documentation and historical audit reports |

| File | Description |
|------|-------------|
| [README.md](15-archive/README.md) | Archive index and context for superseded docs |

Key archived files include historical audit reports (FINAL_SYSTEM_REPORT, PERFORMANCE_AUDIT, UI_VERIFICATION_REPORT), technical debt reports, architecture risk reports, and earlier versions of implementation plans.

---

## Documentation by Audience

### New Developers

Get up and running quickly:

1. [Getting Started](05-development/getting-started.md) -- Prerequisites, Docker, migrations, seed data, dev servers
2. [Architecture Overview](02-architecture/ARCHITECTURE.md) -- System diagrams, plugin system, request flow
3. [Architecture Diagrams](02-architecture/diagrams.md) -- Visual Mermaid diagrams for all subsystems
4. [Module Catalog](01-overview/module-catalog.md) -- Browse all backend modules
5. [State Machines](02-architecture/state-machines.md) -- Employee lifecycle, leave requests, cases, workflows
6. [Coding Patterns](05-development/coding-patterns.md) -- Common patterns across the codebase
7. [Troubleshooting](14-troubleshooting/README.md) -- Common issues and debug procedures

### Backend Developers

API modules, database, and service patterns:

1. [Module Catalog](01-overview/module-catalog.md) -- All modules with endpoints and architecture
2. [API Reference](04-api/API_REFERENCE.md) -- 200+ endpoints organized by module
3. [Backend Development](05-development/backend-development.md) -- Backend development patterns and conventions
4. [Database Guide](02-architecture/database-guide.md) -- Schema, RLS, queries, performance deep-dive
5. [Security Architecture](07-security/README.md) -- Auth, RBAC, RLS, OWASP mitigations
6. [Worker System](02-architecture/worker-system.md) -- Redis Streams, outbox, job processors
7. [Testing Guide](08-testing/testing-guide.md) -- Writing and running tests, helpers
8. [Error Codes](04-api/ERROR_CODES.md) -- Error codes and messages by module
9. [Integrations](09-integrations/README.md) -- S3, email, Firebase, Redis

### Frontend Developers

React components, hooks, and data fetching:

1. [Frontend Overview](05-development/frontend-overview.md) -- React 18, React Router v7, project structure
2. [Route Map](05-development/frontend-routes.md) -- All 160 frontend routes documented
3. [Component Library](05-development/frontend-components.md) -- UI components, layouts, feature components
4. [Data Fetching Patterns](05-development/frontend-data-fetching.md) -- React Query, API client, auth flow
5. [Frontend Quick Reference](05-development/FRONTEND.md) -- Quick reference for frontend patterns
6. [Accessibility Audit](05-development/frontend-accessibility-audit.md) -- Accessibility findings and improvements

### DevOps and Operations

Deployment, infrastructure, and production readiness:

1. [Docker Guide](06-devops/docker-guide.md) -- Container architecture, development workflow
2. [CI/CD Pipeline](06-devops/ci-cd-pipeline.md) -- GitHub Actions workflows, deployment
3. [Deployment Guide](05-development/DEPLOYMENT.md) -- Production deployment with Docker
4. [Production Checklist](11-operations/production-checklist.md) -- Pre-launch verification
5. [Production Readiness Report](11-operations/production-readiness-report.md) -- Readiness assessment
6. [Monitoring and Observability](11-operations/monitoring-observability.md) -- Metrics, alerting, dashboards
7. [Disaster Recovery](11-operations/disaster-recovery.md) -- DR strategy and procedures
8. [Runbooks](11-operations/runbooks/README.md) -- Incident response procedures (10 runbooks)
9. [DevOps Master Checklist](06-devops/devops-master-checklist.md) -- Full DevOps requirements

### Compliance and Legal

UK employment law and data protection:

1. [UK Employment Law](12-compliance/uk-employment-law.md) -- Statutory requirements and regulations
2. [GDPR Compliance](12-compliance/gdpr-compliance.md) -- Data protection compliance
3. [UK HR Compliance Report](12-compliance/uk-hr-compliance-report.md) -- Full compliance report
4. [UK Compliance Audit](12-compliance/uk-compliance-audit.md) -- Compliance audit findings
5. [UK Compliance Features](03-features/uk-compliance.md) -- Right-to-work, SSP, pension, statutory leave
6. [Compliance Issues](12-compliance/issues/) -- 12 open compliance issues with resolution plans

### Project Managers

Roadmaps, sprints, and risk tracking:

1. [Roadmap](13-roadmap/roadmap.md) -- Feature delivery roadmap
2. [Sprint Plans](13-roadmap/) -- Phase 1, 2, and 3 sprint plans
3. [Risk Register](13-roadmap/risk-register.md) -- Risk identification and mitigation
4. [Implementation Status](13-roadmap/analysis/implementation_status.md) -- Current progress by module
5. [Master Requirements](13-roadmap/analysis/master_requirements.md) -- Requirements traceability
6. [Kanban Board](13-roadmap/kanban-board.md) -- Current work in progress

### AI-Assisted Development

Using Claude Code agents and skills:

1. [AI Agents Guide](10-ai-agents/README.md) -- Agent system, available agents, skills
2. [Agent System](10-ai-agents/agent-system.md) -- Agent architecture and configuration
3. [CLAUDE.md](../CLAUDE.md) -- Project instructions for Claude Code
4. [Patterns Index](05-development/patterns-index.md) -- Index of all reusable design patterns

---

## Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 18, React Router v7, React Query, Tailwind CSS | Framework mode, file-based routing |
| **Backend** | Bun, Elysia.js, TypeBox | Plugin architecture, 120+ modules |
| **Auth** | Better Auth | Sessions, MFA, CSRF protection |
| **Database** | PostgreSQL 16 | Row-Level Security, `app` schema, 180+ migrations |
| **Cache/Queue** | Redis 7 | Sessions, caching, Streams for background jobs |
| **Infrastructure** | Docker, Docker Compose | Multi-container development and deployment |
| **Testing** | Bun test (API), Vitest (Web) | Integration, unit, e2e, security, chaos tests |
| **Shared** | @staffora/shared | Types, schemas, error codes, state machines, utilities |

---

## Core Modules

16 of 120+ modules (see [full catalog](01-overview/module-catalog.md)):

| Module | API Prefix | Key Entities | Feature Docs |
|--------|-----------|-------------|--------------|
| Core HR | `/api/v1/hr` | employees, org_units, positions, compensation | [core-hr.md](03-features/core-hr.md) |
| Time & Attendance | `/api/v1/time` | time_events, schedules, shifts, timesheets | [time-attendance.md](03-features/time-attendance.md) |
| Absence | `/api/v1/absence` | leave_types, policies, requests, balances | [absence-management.md](03-features/absence-management.md) |
| Talent | `/api/v1/talent` | goals, review_cycles, reviews | [talent-management.md](03-features/talent-management.md) |
| LMS | `/api/v1/lms` | courses, enrollments, learning_paths | |
| Cases | `/api/v1/cases` | cases, case_comments, sla_configs | [case-management.md](03-features/case-management.md) |
| Onboarding | `/api/v1/onboarding` | checklists, instances, tasks | [onboarding.md](03-features/onboarding.md) |
| Benefits | `/api/v1/benefits` | carriers, plans, enrollments, dependents | [benefits-administration.md](03-features/benefits-administration.md) |
| Documents | `/api/v1/documents` | documents, document_versions | [document-management.md](03-features/document-management.md) |
| Succession | `/api/v1/succession` | succession_plans, candidates | |
| Analytics | `/api/v1/analytics` | dashboards, headcount, turnover | |
| Competencies | `/api/v1/competencies` | competencies, assessments, gaps | |
| Recruitment | `/api/v1/recruitment` | requisitions, candidates | [recruitment.md](03-features/recruitment.md) |
| Workflows | `/api/v1/workflows` | definitions, instances, steps | |
| Security | `/api/v1/security` | roles, permissions, audit_log | |
| Portal | `/api/v1/portal` | self-service aggregations | [employee-self-service.md](03-features/employee-self-service.md) |

---

## Critical Patterns

These patterns are non-negotiable across the codebase:

| Pattern | Description | Documentation |
|---------|-------------|---------------|
| **Multi-tenant RLS** | Every tenant-owned table has `tenant_id` + RLS policies | [rls-multi-tenancy.md](07-security/rls-multi-tenancy.md), [security-patterns.md](02-architecture/security-patterns.md) |
| **Effective dating** | `effective_from`/`effective_to` with overlap validation | [DATABASE.md](02-architecture/DATABASE.md), [coding-patterns.md](05-development/coding-patterns.md) |
| **Outbox pattern** | Domain events written in same transaction as business writes | [WORKER_SYSTEM.md](02-architecture/WORKER_SYSTEM.md), [ADR-003](02-architecture/adr/003-transactional-outbox-pattern.md) |
| **Idempotency** | `Idempotency-Key` header required on all mutations | [security-patterns.md](02-architecture/security-patterns.md) |
| **State machines** | Enforced lifecycle transitions with immutable audit trail | [state-machines.md](02-architecture/state-machines.md) |

---

## Known Issues

Open issues are tracked in [14-troubleshooting/issues/](14-troubleshooting/issues/) and [12-compliance/issues/](12-compliance/issues/):

| Category | Count | Examples |
|----------|:-----:|---------|
| Architecture | 8 | Graceful shutdown, connection pool exhaustion, Redis KEYS usage |
| Security | 8 | CSRF validation, email verification, account lockout, GDPR |
| Tech Debt | 10 | Shared package usage, dual PostgreSQL drivers, hollow tests |
| Compliance | 12 | Right-to-work, SSP calculations, pension auto-enrolment, HMRC |

See individual issue files for detailed descriptions, impact analysis, and resolution plans.

---

## Quick Dev Commands

```bash
# Setup
bun install                    # Install dependencies
bun run docker:up              # Start postgres + redis
bun run migrate:up             # Run pending migrations
bun run db:seed                # Seed database

# Development
bun run dev                    # Start all dev servers (API + web + worker)
bun run dev:api                # API only (with watch)
bun run dev:web                # Frontend only
bun run dev:worker             # Background worker only

# Testing
bun test                       # Run all tests
bun run test:api               # API tests only (bun test)
bun run test:web               # Frontend tests only (vitest)
bun test path/to/file.test.ts  # Single test file

# Quality
bun run typecheck              # Type checking (all packages)
bun run lint                   # Linting (all packages)
bun run build                  # Build all packages

# Database
bun run migrate:up             # Run pending migrations
bun run migrate:down           # Rollback last migration
bun run migrate:create <name>  # Create new migration file
```

---

## Documentation System

| File | Description |
|------|-------------|
| [DOC_MAP.md](DOC_MAP.md) | Visual navigation map of all documentation |
| [DOC_HEALTH_REPORT.md](DOC_HEALTH_REPORT.md) | Documentation health scoring and quality metrics |
| [DOC_TODO.md](DOC_TODO.md) | Gap analysis and improvement backlog |
| [DOCUMENTATION_AUDIT_REPORT.md](DOCUMENTATION_AUDIT_REPORT.md) | Full documentation audit report |
| [DOCUMENTATION_TODO.md](DOCUMENTATION_TODO.md) | Documentation improvement tasks |

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines, commit conventions, and pull request process.
