# Changelog

All notable changes to the Staffora HRIS platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project is pre-1.0; versions are tracked by date.

## [Unreleased]

## [2026-03-19]

### Added

- Completed all 263 tracked TODO items across the platform, reaching zero remaining items.

## [2026-03-17]

### Added

- Rehire workflow with full employment history preservation, allowing terminated employees to be re-onboarded while retaining prior records.
- UK address history with effective dating and postcode validation for employee address management.
- ClamAV virus scanning integration for all document uploads, blocking infected files before storage.
- SSO support via SAML 2.0 and OpenID Connect for enterprise identity provider integration.
- Conditional workflows engine allowing branching logic in onboarding and approval flows.
- Custom report builder with drag-and-drop field selection and saved report templates.
- Payroll journal generation for export to external payroll providers.
- Multi-job positions allowing employees to hold concurrent roles within the organisation.
- Electronic signature capture for contracts, policies, and HR documents.
- Push notifications via Firebase Cloud Messaging for mobile and browser alerts.
- Data import framework with CSV validation and a three-phase workflow (upload, validate, commit).
- Email delivery tracking with open/click analytics for HR communications.
- Configurable lookup values (dropdowns) managed by administrators without code changes.
- Automated backup verification with restore testing and integrity checks.
- 360-degree feedback module for multi-rater performance reviews.
- Background check integration framework for pre-employment screening.
- Calendar synchronisation with external calendar providers (Google, Outlook).
- Cost centre management with hierarchical budgeting and allocation tracking.
- Horizontal scaling documentation and Docker Compose configuration for multi-instance API deployment.
- Enterprise CI/CD pipelines with GitHub Actions for build, test, lint, security scanning, and deployment.
- UK compliance modules: right-to-work checks, SSP calculation, statutory leave, pension auto-enrolment, and disciplinary warnings.
- Client portal for external users (candidates, contractors) with BetterAuth-based authentication.
- Time policies management UI wired to the schedule creation API endpoint.
- Statutory notice period calculation utility (UK Employment Rights Act 1996 s.86).
- CONTRIBUTING.md, LICENSE, and README.md files.
- DOWN migration sections for `0106_jobs.sql` and `0096_better_auth_twofactor_columns.sql`.
- Migration renumbering documentation in `migrations/README.md`.

### Changed

- Decomposed the three largest frontend route files into smaller, focused components for maintainability.
- WCAG contrast ratio improvements across the UI to meet AA accessibility standards.
- PgBouncer connection pooler added between the API and PostgreSQL for production connection management.
- Upgraded CI security tooling: pinned Trivy version, enabled CodeQL failure enforcement, added test concurrency limits.
- Removed marketing website from the repository (moved to a separate repo); this repository is now HRIS-only.

### Fixed

- Production rollback procedure corrected in deployment scripts.
- RLS enforcement added to all migration files that were missing tenant isolation policies.
- All environment variables documented in `.env.example` with descriptions.
- Test suite failures reduced from 265 to 46 through systematic debugging of integration tests.
- Optional integration files excluded from TypeScript compilation to prevent build errors when dependencies are absent.
- OpenTelemetry and Sentry dependencies added to `package.json` and dynamic imports fixed.
- Correct database role name (`hris_app`) used consistently across all migration files.
- Removed foreign key reference to non-existent `app.pay_periods` table in payroll migration.
- Enum value ordering corrected in UK compliance and data breach migrations to avoid transaction conflicts.
- `GET DIAGNOSTICS` syntax corrected in UK holiday entitlement calculation migration.
- `update_updated_at` trigger function name standardised across 13 migrations.
- Haversine distance function return type conflict resolved; 9 duplicate migrations removed.
- 5 additional duplicate migration files removed; CodeQL permissions fixed.
- All ESLint errors resolved for CI lint gate.
- All remaining TypeScript type-check errors resolved for CI.
- Missing `ErrorCodes` values added for route error handling and payroll query keys.
- 65 tables with missing INSERT RLS policies corrected (migration 0182).
- Broken trigger function reference in jobs migration corrected (migration 0183).
- Bootstrap helper functions made available via migrations (migration 0184).
- Outbox pattern violations fixed in cases, LMS, and onboarding modules.
- Recruitment repository RLS bypass corrected (`db.query` changed to `db.withTransaction`).
- Talent, LMS, and workflows repository schema mismatches resolved.
- Benefits `/stats` endpoint referencing non-existent table corrected.
- Time service constructor property name mismatch fixed.
- Frontend API path mismatches for benefits, onboarding, and competencies corrected.

### Security

- CSRF tokens now HMAC-SHA256 signed with timing-safe validation.
- SameSite cookie attribute set to Strict in production.
- RBAC guards added to competencies, workflows, and time routes.
- MFA enforcement verification improved.
- Better Auth hardcoded fallback secret replaced with production-safe pattern.
- Security headers hardened across all API responses.
- Field-level permission system for restricting sensitive data visibility by role.
- RBAC permission checks enforced via `beforeHandle` guards on all route modules.

## [2026-03-14]

### Added

- Permissions system v2 with granular module-level and field-level access control.
- Reports UI with filterable data tables and export to CSV/Excel.
- Case appeals workflow allowing employees to challenge case outcomes.
- Comprehensive test suite: integration, unit, e2e, security, and performance tests.
- New database migrations for UI components, workflows, and analytics aggregation.
- Cache invalidation hooks for employee, security, and tenant domain events.
- Composite database indexes for common query patterns (employee lookups, tenant-scoped searches).

### Changed

- Analytics aggregation pushed into SQL with incremental computation, replacing application-layer processing.
- Metrics Maps reset hourly to prevent unbounded memory growth in long-running processes.
- API Dockerfile optimised with trimmed workspace and production-only dependencies.
- Web Dockerfile optimised with Alpine base image and production-only dependencies.
- 20 React components wrapped with `React.memo` to reduce unnecessary re-renders.
- `useMemo` applied to column definitions and statistics in route components.
- Loop-based INSERT operations converted to batch multi-row statements.
- PostgreSQL tuning configuration added for production workloads (shared_buffers, work_mem, effective_cache_size).
- Redis Stream trimming enabled and consumer group start position fixed to prevent unbounded stream growth.
- Redis `maxmemory` increased from 256 MB to 750 MB to accommodate production cache volumes.
- React Query defaults updated: disabled `refetchOnWindowFocus` and `refetchOnReconnect` for better UX.
- Auth and tenant plugin processing bypassed for health check routes to reduce latency.

### Security

- Security hardening pass across authentication, session management, and input validation.

## [2026-03-11]

### Fixed

- CORS configuration corrected to allow cross-origin requests from the frontend.
- Auth error handling improved to return proper error shapes instead of raw exceptions.

## [2026-03-10]

### Changed

- API module implementations improved across LMS, onboarding, and portal routes to use consistent service/repository pattern.
- Service and repository layers extracted from route handlers for separation of concerns.
- Missing frontend routes added for modules that had backend endpoints but no UI.
- `beforeHandle` auth guards applied consistently to recruitment, onboarding, and all remaining route modules, replacing inline auth checks.

### Fixed

- `.claude` skills and agent configurations corrected to match actual codebase patterns and file paths.

## [2026-01-17]

### Fixed

- Tenant null checking added to prevent 500 errors in LMS routes and auth service when tenant context is missing.

## [2026-01-15 -- 2026-01-16]

### Changed

- Docker configuration expanded with additional service profiles and resource limits.
- Security headers plugin documented with configuration options.
- Module exports improved for shared package consumers.
- Payroll references removed from documentation to clarify system scope (payroll is handled by external providers).
- `CLAUDE.md` updated with latest plugin list, migration count, state machines, and test structure.

## [2026-01-07 -- 2026-01-09]

### Added

- Initial platform commit with full monorepo structure (Bun workspaces).
- Core HR module: employee records, organisation hierarchy, job positions, contracts with effective dating.
- Time and Attendance module: clock events, schedules, timesheets, geo-fencing.
- Absence Management module: leave types, balances, accrual rules, request workflows.
- Talent module: performance reviews, goals, competency frameworks, calibration cycles.
- LMS module: courses, enrolments, learning paths, certificate generation.
- Cases module: case management, SLA tracking, escalation workflows.
- Onboarding module: templates, checklists, document collection, task assignment.
- Benefits module: benefit plans, enrolment periods, eligibility rules.
- Documents module: file storage, versioning, access control, retention policies.
- Succession module: succession plans, talent pools, readiness assessments.
- Analytics module: workforce dashboards, headcount reporting, turnover analysis.
- Competencies module: competency libraries, assessments, gap analysis.
- Recruitment module: job postings, applicant tracking, interview scheduling.
- Multi-tenant architecture with PostgreSQL 16 Row-Level Security on all tenant-owned tables.
- BetterAuth integration for authentication, sessions, MFA, and CSRF protection.
- Elysia.js plugin chain: security headers, error handling, database, cache, rate limiting, auth, tenant, RBAC, idempotency, audit logging.
- Background worker system with Redis Streams for outbox processing, notifications, exports, PDF generation, and analytics aggregation.
- 189 database migrations covering all modules and UK compliance requirements.
- React 18 frontend with React Router v7 (framework mode), React Query, and Tailwind CSS.
- Comprehensive documentation portal in `Docs/` with architecture, API reference, and module guides.
- Docker Compose development environment with PostgreSQL 16, Redis 7, and full service orchestration.
- Shared package (`@staffora/shared`) with types, schemas, error codes, state machines, and utility functions.

[Unreleased]: https://github.com/staffora/hris/compare/main...HEAD
[2026-03-19]: https://github.com/staffora/hris/compare/a7dd303...2f06721
[2026-03-17]: https://github.com/staffora/hris/compare/f2435fa...a7dd303
[2026-03-14]: https://github.com/staffora/hris/compare/fb1efa8...f2435fa
[2026-03-11]: https://github.com/staffora/hris/compare/fee705b...fb1efa8
[2026-03-10]: https://github.com/staffora/hris/compare/20161a1...fee705b
[2026-01-17]: https://github.com/staffora/hris/compare/2c90e3e...20161a1
[2026-01-15 -- 2026-01-16]: https://github.com/staffora/hris/compare/93777f5...2c90e3e
[2026-01-07 -- 2026-01-09]: https://github.com/staffora/hris/compare/8fb23e2...93777f5
