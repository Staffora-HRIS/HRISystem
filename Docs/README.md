# Staffora Documentation

> Enterprise multi-tenant HRIS platform documentation — [staffora.co.uk](https://staffora.co.uk)
> 190+ files | 17 directories | 72 backend modules | 160 frontend routes
> **Last updated:** 2026-03-21

## Quick Links

| Category | Link | Description |
|----------|------|-------------|
| Getting Started | [GETTING_STARTED.md](guides/GETTING_STARTED.md) | First-time developer setup |
| Architecture | [ARCHITECTURE.md](architecture/ARCHITECTURE.md) | System design and diagrams |
| Architecture Diagrams | [diagrams.md](architecture/diagrams.md) | Visual Mermaid architecture diagrams |
| API Reference | [API_REFERENCE.md](api/API_REFERENCE.md) | 190+ REST endpoints by module |
| Module Catalog | [modules/](modules/README.md) | All 72 backend modules documented |
| Frontend | [frontend/](frontend/README.md) | Routes, components, data fetching |
| Testing | [testing/](testing/README.md) | Test infrastructure and guides |
| Security | [security/](security/README.md) | Auth, RBAC, RLS, OWASP |
| Deployment | [DEPLOYMENT.md](guides/DEPLOYMENT.md) | Production deployment with Docker |
| Troubleshooting | [troubleshooting/](troubleshooting/README.md) | Common issues and debug procedures |

### Documentation System

| File | Description |
|------|-------------|
| [DOC_MAP.md](DOC_MAP.md) | Visual navigation map of all documentation |
| [DOC_HEALTH_REPORT.md](DOC_HEALTH_REPORT.md) | Documentation health scoring (100/100) |
| [DOC_TODO.md](DOC_TODO.md) | Gap analysis and improvement backlog |

---

## Documentation Map

### Core Documentation

| Section | Directory | Description | Key Files |
|---------|-----------|-------------|-----------|
| Guides | [guides/](guides/) | Developer setup, deployment, frontend patterns | [GETTING_STARTED.md](guides/GETTING_STARTED.md), [DEPLOYMENT.md](guides/DEPLOYMENT.md), [FRONTEND.md](guides/FRONTEND.md) |
| Architecture | [architecture/](architecture/) | System design, database, workers, permissions | [ARCHITECTURE.md](architecture/ARCHITECTURE.md), [diagrams.md](architecture/diagrams.md), [DATABASE.md](architecture/DATABASE.md), [WORKER_SYSTEM.md](architecture/WORKER_SYSTEM.md), [PERMISSIONS_SYSTEM.md](architecture/PERMISSIONS_SYSTEM.md) |
| API | [api/](api/) | Endpoint reference, error codes, request contracts | [API_REFERENCE.md](api/API_REFERENCE.md), [ERROR_CODES.md](api/ERROR_CODES.md) |
| Patterns | [patterns/](patterns/) | State machines, security, RLS, outbox, idempotency | [STATE_MACHINES.md](patterns/STATE_MACHINES.md), [SECURITY.md](patterns/SECURITY.md) |
| Modules | [modules/](modules/) | Complete catalog of all 72 backend modules | [README.md](modules/README.md) |

### Frontend & Testing

| Section | Directory | Description | Key Files |
|---------|-----------|-------------|-----------|
| Frontend | [frontend/](frontend/) | React architecture, routes, components, data fetching | [README.md](frontend/README.md), [routes.md](frontend/routes.md), [components.md](frontend/components.md), [data-fetching.md](frontend/data-fetching.md) |
| Testing | [testing/](testing/) | Test infrastructure, guides, coverage matrix | [README.md](testing/README.md), [test-matrix.md](testing/test-matrix.md) |

### Security & Compliance

| Section | Directory | Description | Key Files |
|---------|-----------|-------------|-----------|
| Security | [security/](security/) | Authentication, authorization, RLS, OWASP mitigations | [README.md](security/README.md) |
| Compliance | [compliance/](compliance/) | UK employment law, GDPR, statutory requirements | [uk-hr-compliance-report.md](compliance/uk-hr-compliance-report.md) |

### Operations & DevOps

| Section | Directory | Description | Key Files |
|---------|-----------|-------------|-----------|
| Operations | [operations/](operations/) | Production checklists and readiness reports | [production-checklist.md](operations/production-checklist.md), [production-readiness-report.md](operations/production-readiness-report.md) |
| DevOps | [devops/](devops/) | Infrastructure, Docker, CI/CD pipeline | [docker-guide.md](devops/docker-guide.md), [ci-cd.md](devops/ci-cd.md), [devops-status-report.md](devops/devops-status-report.md) |
| Checklists | [checklists/](checklists/) | Engineering quality and DevOps checklists | [enterprise-engineering-checklist.md](checklists/enterprise-engineering-checklist.md), [devops-master-checklist.md](checklists/devops-master-checklist.md) |

### Integrations & AI

| Section | Directory | Description | Key Files |
|---------|-----------|-------------|-----------|
| Integrations | [integrations/](integrations/) | External services (S3, email, Redis, Firebase) | [README.md](integrations/README.md) |
| AI Agents | [ai-agents/](ai-agents/) | Development agent system, skills, memory | [README.md](ai-agents/README.md) |
| Troubleshooting | [troubleshooting/](troubleshooting/) | Common issues, debug procedures, error reference | [README.md](troubleshooting/README.md) |

### Project Management

| Section | Directory | Description | Key Files |
|---------|-----------|-------------|-----------|
| Project Management | [project-management/](project-management/) | Roadmaps, sprints, risk register, kanban | [roadmap.md](project-management/roadmap.md), [risk-register.md](project-management/risk-register.md), [kanban-board.md](project-management/kanban-board.md) |
| Project Analysis | [project-analysis/](project-analysis/) | Requirements tracking, implementation status | [master_requirements.md](project-analysis/master_requirements.md), [implementation_status.md](project-analysis/implementation_status.md) |
| Issues | [issues/](issues/) | Known issues by category (38 architecture, compliance, security, tech-debt) | [README.md](issues/README.md) |

### Audit, Reference & Archive

| Section | Directory | Description | Key Files |
|---------|-----------|-------------|-----------|
| Audit | [audit/](audit/) | System audit reports, security reviews, tech debt | [FINAL_SYSTEM_REPORT.md](audit/FINAL_SYSTEM_REPORT.md), [security-audit.md](audit/security-audit.md), [PERFORMANCE_AUDIT.md](audit/PERFORMANCE_AUDIT.md) |
| System Documentation | — | Complete system reference (single file) | [system-documentation.md](system-documentation.md) |
| Archive | [archive/](archive/) | Superseded documentation kept for reference | [README.md](archive/README.md) |

---

## Documentation by Audience

### For New Developers

Start here to get up and running:

1. [Getting Started](guides/GETTING_STARTED.md) — Prerequisites, install, Docker, migrations, seed data, dev servers
2. [Architecture Overview](architecture/ARCHITECTURE.md) — System diagrams, plugin system, request flow, module pattern
3. [Architecture Diagrams](architecture/diagrams.md) — Visual Mermaid diagrams for all subsystems
4. [Module Catalog](modules/README.md) — Browse all 72 backend modules
5. [State Machines](patterns/STATE_MACHINES.md) — Employee lifecycle, leave requests, case management, workflows
6. [Troubleshooting](troubleshooting/README.md) — Common issues and debug procedures

### For Backend Developers

API modules, database, and service patterns:

1. [Module Catalog](modules/README.md) — All 72 modules with endpoints and architecture
2. [API Reference](api/API_REFERENCE.md) — 190+ endpoints organized by module
3. [Database Guide](architecture/database-guide.md) — Schema, RLS, queries, migrations deep-dive
4. [Security Architecture](security/README.md) — Auth, RBAC, RLS, OWASP mitigations
5. [Worker System](architecture/worker-system.md) — Redis Streams, outbox, job processors
6. [Testing Guide](testing/README.md) — Writing and running tests, test helpers
7. [Error Codes](api/ERROR_CODES.md) — Error codes and messages by module
8. [Integrations](integrations/README.md) — S3, email, Firebase, Redis integrations

### For Frontend Developers

React components, hooks, and data fetching:

1. [Frontend Architecture](frontend/README.md) — React 18, React Router v7, project structure
2. [Route Map](frontend/routes.md) — All 160 frontend routes documented
3. [Component Library](frontend/components.md) — UI components, layouts, feature components
4. [Data Fetching Patterns](frontend/data-fetching.md) — React Query, API client, auth flow
5. [Frontend Guide](guides/FRONTEND.md) — Quick reference for frontend patterns

### For DevOps & Operations

Deployment, infrastructure, and production readiness:

1. [Docker Guide](devops/docker-guide.md) — Container architecture, development workflow
2. [CI/CD Pipeline](devops/ci-cd.md) — GitHub Actions workflows, deployment
3. [Deployment Guide](guides/DEPLOYMENT.md) — Production deployment with Docker
4. [Production Checklist](operations/production-checklist.md) — Pre-launch verification
5. [Production Readiness Report](operations/production-readiness-report.md) — Readiness assessment
6. [DevOps Master Checklist](checklists/devops-master-checklist.md) — Full DevOps requirements

### For Compliance & Legal

UK employment law and data protection:

1. [UK HR Compliance Report](compliance/uk-hr-compliance-report.md) — Statutory requirements, GDPR, employment law
2. [UK Compliance Audit](audit/uk-compliance-audit.md) — Compliance audit findings
3. [Module Catalog](modules/README.md) — See UK Compliance and GDPR module sections
4. [Compliance Issues](issues/) — Open compliance issues (files prefixed `compliance-*`)

### For Project Managers

Roadmaps, sprints, and risk tracking:

1. [Roadmap](project-management/roadmap.md) — Feature delivery roadmap
2. [Sprint Plans](project-management/) — Phase 1, 2, and 3 sprint plans
3. [Risk Register](project-management/risk-register.md) — Risk identification and mitigation
4. [Implementation Status](project-analysis/implementation_status.md) — Current progress by module

### For AI-Assisted Development

Using Claude Code agents and skills:

1. [AI Agents Guide](ai-agents/README.md) — Agent system, available agents, skills
2. [CLAUDE.md](../CLAUDE.md) — Project instructions for Claude Code
3. [Troubleshooting](troubleshooting/README.md) — Debugging discoveries from AI sessions

---

## Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 18, React Router v7, React Query, Tailwind CSS | Framework mode, file-based routing |
| **Backend** | Bun, Elysia.js, TypeBox | Plugin architecture, 72 modules |
| **Auth** | BetterAuth | Sessions, MFA, CSRF protection |
| **Database** | PostgreSQL 16 | Row-Level Security, `app` schema, 180+ migrations |
| **Cache/Queue** | Redis 7 | Sessions, caching, Streams for background jobs |
| **Infrastructure** | Docker, Docker Compose | Multi-container development and deployment |
| **Testing** | Bun test (API), Vitest (Web) | Integration, unit, e2e, security, chaos tests |

## Core Modules (16 of 72)

| Module | API Prefix | Key Entities |
|--------|-----------|-------------|
| Core HR | `/api/v1/hr` | employees, org_units, positions, compensation |
| Time & Attendance | `/api/v1/time` | time_events, schedules, shifts, timesheets |
| Absence | `/api/v1/absence` | leave_types, policies, requests, balances |
| Talent | `/api/v1/talent` | goals, review_cycles, reviews |
| LMS | `/api/v1/lms` | courses, enrollments |
| Cases | `/api/v1/cases` | cases, case_comments |
| Onboarding | `/api/v1/onboarding` | checklists, instances, tasks |
| Benefits | `/api/v1/benefits` | carriers, plans, enrollments, dependents |
| Documents | `/api/v1/documents` | documents, document_versions |
| Succession | `/api/v1/succession` | succession_plans, candidates |
| Analytics | `/api/v1/analytics` | dashboards, headcount, turnover |
| Competencies | `/api/v1/competencies` | competencies, assessments, gaps |
| Recruitment | `/api/v1/recruitment` | requisitions, candidates |
| Workflows | `/api/v1/workflows` | definitions, instances, steps |
| Security | `/api/v1/security` | roles, permissions, audit_log |
| Portal | `/api/v1/portal` | self-service aggregations |

## Critical Patterns

These patterns are non-negotiable across the codebase:

1. **Multi-tenant RLS** — Every tenant-owned table has `tenant_id` + RLS policies. See [patterns/SECURITY.md](patterns/SECURITY.md).
2. **Effective dating** — `effective_from`/`effective_to` with overlap validation. See [architecture/DATABASE.md](architecture/DATABASE.md).
3. **Outbox pattern** — Domain events in same transaction as business writes. See [architecture/WORKER_SYSTEM.md](architecture/WORKER_SYSTEM.md).
4. **Idempotency** — `Idempotency-Key` header on all mutations. See [patterns/SECURITY.md](patterns/SECURITY.md).
5. **State machines** — Enforced lifecycle transitions with immutable audit. See [patterns/STATE_MACHINES.md](patterns/STATE_MACHINES.md).

## Known Issues

Open issues are tracked individually in [issues/](issues/) with a consistent naming scheme:

| Category | Count | Examples |
|----------|:-----:|---------|
| Architecture | 8 | Graceful shutdown, connection pool exhaustion, Redis KEYS usage |
| Compliance | 12 | Right-to-work, SSP calculations, pension auto-enrolment, HMRC |
| Security | 8 | CSRF validation, email verification, account lockout, GDPR |
| Tech Debt | 10 | Shared package usage, dual PostgreSQL drivers, hollow tests |

See individual issue files for detailed descriptions, impact analysis, and resolution plans.

> For the full list of all 72 modules including UK Compliance, GDPR, Payroll, and HR Operations modules, see [modules/README.md](modules/README.md).

## Quick Dev Commands

```bash
bun install                    # Install dependencies
bun run docker:up              # Start postgres + redis
bun run migrate:up             # Run migrations
bun run db:seed                # Seed data
bun run dev                    # Start all dev servers (API + web + worker)
bun test                       # Run all tests
bun run typecheck              # Type checking
bun run lint                   # Linting
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines, commit conventions, and pull request process.
