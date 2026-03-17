# Changelog

All notable changes to the Staffora platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Enterprise CI/CD pipeline suite (8 GitHub Actions workflows)
  - PR checks (typecheck + lint + Docker build verification)
  - Full test suite with coverage gates (60% API, 50% frontend)
  - Security scanning (dependency audit, Trivy, TruffleHog, CodeQL)
  - Migration validation (naming conventions + RLS compliance)
  - Deployment pipeline (staging auto, production manual with approval)
  - Release automation (tag-based with Docker image publishing)
  - Stale issue/PR cleanup
- UK compliance enforcement (migration 0186)
  - Replaced SSN validation with NINO validation
  - Renamed FLSA/EEO fields to WTR/SOC UK equivalents
  - Changed all USD defaults to GBP, en-US to en-GB
- Client portal module (`packages/api/src/modules/client-portal/`)
- Permissions system with role-based access control
- CONTRIBUTING.md, LICENSE, README.md
- Enterprise engineering audit documentation

### Fixed
- CSRF protection now uses HMAC-SHA256 with constant-time comparison
- Better Auth hardcoded fallback secret replaced with production-safe pattern
- 65 tables with missing INSERT RLS policies (migration 0182)
- Broken trigger function reference in jobs migration (migration 0183)
- Bootstrap helper functions now available via migrations (migration 0184)
- Outbox pattern violations in cases, LMS, onboarding modules
- Recruitment repository RLS bypass (db.query -> db.withTransaction)
- Talent, LMS, workflows repository schema mismatches
- Benefits /stats endpoint referencing non-existent table
- Time service constructor property name mismatch
- Frontend API path mismatches for benefits, onboarding, competencies

### Security
- CSRF tokens now HMAC-SHA256 signed with timing-safe validation
- SameSite cookie attribute set to Strict in production
- RBAC guards added to competencies, workflows, time routes
- MFA enforcement verification improved

## [0.1.0] - 2024-12-01

### Added
- Initial platform with Core HR, Time & Attendance, Absence, Talent, LMS, Cases, Onboarding, Benefits, Documents, Succession, Analytics, Competencies, Recruitment modules
- Multi-tenant architecture with PostgreSQL RLS
- BetterAuth authentication with MFA support
- Redis-based background job processing
- Docker Compose infrastructure
- 180+ database migrations
