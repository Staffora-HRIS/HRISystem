# Staffora

**Enterprise Multi-Tenant HRIS Platform for the UK**

Staffora is a comprehensive Human Resource Information System built for UK employment law and HR practices. It provides modules for Core HR, Time & Attendance, Absence Management, Talent Management, Learning, Recruitment, Benefits, Documents, Onboarding, Cases, Succession Planning, Analytics, and full UK compliance (GDPR, SSP, Pension Auto-Enrolment, Right to Work, Statutory Leave).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Backend | [Elysia.js](https://elysiajs.com) + TypeBox validation |
| Frontend | React 18 + [React Router v7](https://reactrouter.com) (framework mode) + React Query + Tailwind CSS |
| Auth | [BetterAuth](https://www.better-auth.com/) (sessions, MFA, CSRF) |
| Database | PostgreSQL 16 with Row-Level Security (RLS) |
| Cache/Queue | Redis 7 (sessions, caching, Streams for jobs) |
| Infrastructure | Docker Compose |
| CI/CD | GitHub Actions (8 pipelines) |

## Quick Start

```bash
# Prerequisites: Bun >= 1.1.38, Docker

# Clone and install
git clone https://github.com/your-org/staffora.git
cd staffora
bun install

# Configure environment
cp docker/.env.example docker/.env
# Edit docker/.env — set POSTGRES_PASSWORD, SESSION_SECRET, CSRF_SECRET, BETTER_AUTH_SECRET

# Start infrastructure + services
docker compose -f docker/docker-compose.yml up -d

# Run migrations
bun run migrate:up

# Bootstrap root tenant and admin user (first time only)
bun run --filter @staffora/api bootstrap:root

# Start development servers
bun run dev
```

**Default ports:** API: 3000 | Web: 5173 | PostgreSQL: 5432 | Redis: 6379

## Monorepo Structure

```
staffora/
├── packages/api/       # @staffora/api — Elysia.js backend (71+ modules)
├── packages/web/       # @staffora/web — React frontend (HRIS app)
├── packages/shared/    # @staffora/shared — Shared types, schemas, utilities
├── Website/            # @staffora/website — Marketing site (staffora.co.uk)
├── migrations/         # PostgreSQL migrations (180+ files)
├── docker/             # Docker Compose, nginx, postgres, redis configs
├── Docs/               # Architecture, API reference, guides, patterns
└── .github/            # CI/CD workflows, issue templates, Dependabot
```

## Key Commands

```bash
# Development
bun run dev              # All packages
bun run dev:api          # API only (with watch)
bun run dev:web          # Frontend only
bun run dev:worker       # Background worker only

# Testing
bun run test:api         # API tests (bun test)
bun run test:web         # Frontend tests (vitest)
bun test                 # All packages

# Database
bun run migrate:up       # Run pending migrations
bun run migrate:down     # Rollback last migration
bun run db:seed          # Seed database

# Quality
bun run typecheck        # All packages
bun run lint             # All packages
bun run build            # All packages

# Docker
bun run docker:up        # Start postgres + redis
bun run docker:down      # Stop all
bun run docker:logs      # View logs
```

## Architecture Highlights

- **Multi-tenant isolation** via PostgreSQL Row-Level Security (RLS) on every table
- **Effective dating** for time-versioned HR data (positions, salaries, contracts)
- **Transactional outbox** for reliable domain event publishing
- **State machines** for employee lifecycle, leave requests, cases, workflows, performance
- **Cursor-based pagination** across all collection endpoints
- **Idempotency keys** on all mutating endpoints
- **Plugin-based middleware chain** with strict registration order

## CI/CD Pipelines

| Pipeline | Trigger | Purpose |
|----------|---------|---------|
| PR Check | Pull request | Typecheck + lint + Docker build verification |
| Tests | Push/PR to main | Full test suite with coverage gates |
| Security | Push/PR + weekly | Dependency audit, Trivy scan, TruffleHog, CodeQL |
| Migration Check | PR (migrations/) | Naming conventions + RLS compliance |
| Deploy | Push to main / manual | Staging (auto) + Production (manual with approval) |
| Release | Tag push (v*) | Build release images + GitHub Release |
| Stale Cleanup | Weekly | Close stale issues and PRs |

## Documentation

See the `Docs/` directory for comprehensive documentation:

- [Getting Started](Docs/guides/GETTING_STARTED.md)
- [Architecture](Docs/architecture/ARCHITECTURE.md)
- [API Reference](Docs/api/API_REFERENCE.md)
- [Database & Migrations](Docs/architecture/DATABASE.md)
- [Deployment](Docs/guides/DEPLOYMENT.md)
- [Security Patterns](Docs/patterns/SECURITY.md)
- [State Machines](Docs/patterns/STATE_MACHINES.md)
- [Production Checklist](Docs/PRODUCTION_CHECKLIST.md)

## UK Compliance

This is a UK-only platform. All HR logic aligns with UK employment law:

- HMRC integration (RTI, PAYE)
- National Insurance (NI) numbers
- Statutory Sick Pay (SSP)
- Statutory Maternity/Paternity/Adoption/Shared Parental Leave
- Auto-enrolment pension
- Right to Work checks
- GDPR compliance (DSAR, data erasure, breach notification, consent management)
- Working Time Regulations (WTR)
- UK Standard Occupational Classification (SOC) codes
- GBP currency, en-GB locale throughout

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and PR guidelines.

## License

Proprietary. All rights reserved.
