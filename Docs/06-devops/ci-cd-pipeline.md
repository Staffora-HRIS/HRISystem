# CI/CD Pipeline

Last updated: 2026-03-28

This document describes the continuous integration and continuous deployment pipelines for the Staffora HRIS platform, implemented as GitHub Actions workflows.

---

## Table of Contents

- [Pipeline Overview](#pipeline-overview)
- [Workflow Files](#workflow-files)
- [PR Check (`pr-check.yml`)](#pr-check)
- [Tests (`test.yml`)](#tests)
- [E2E Tests (`e2e.yml`)](#e2e-tests)
- [Deploy (`deploy.yml`)](#deploy)
- [Release (`release.yml`)](#release)
- [Security Scan (`security.yml`)](#security-scan)
- [Migration Check (`migration-check.yml`)](#migration-check)
- [Chaos Tests (`chaos-tests.yml`)](#chaos-tests)
- [CodeQL (`codeql.yml`)](#codeql)
- [Stale Issues (`stale.yml`)](#stale-issues)
- [Environment Management](#environment-management)
- [Secrets and Variables](#secrets-and-variables)
- [Pipeline Scripts](#pipeline-scripts)

---

## Pipeline Overview

```
  Pull Request                 Push to main               Manual / Tag
      |                             |                         |
      v                             v                         v
  +----------+              +-----------+              +-----------+
  | PR Check |              |   Tests   |              |  Release  |
  | (fast)   |              | (full)    |              | (tag: v*) |
  +----------+              +-----------+              +-----------+
      |                          |                         |
      v                          v                         v
  +----------+              +-----------+              +-----------+
  | Tests    |              |  Deploy   |              |   Build   |
  | (full)   |              |           |              |   + Tag   |
  +----------+              +-----+-----+              +-----------+
      |                          |
      v                          v
  +----------+           +------+------+
  | E2E Tests|           | test | build|
  +----------+           +------+------+
                                |
                    +-----------+-----------+
                    |                       |
             +------+------+        +------+------+
             |   staging   |        | production  |
             | (auto)      |        | (manual)    |
             +-------------+        +------+------+
                                           |
                                    +------+------+
                                    |  rollback   |
                                    | (auto on    |
                                    |  failure)   |
                                    +-------------+
```

---

## Workflow Files

All workflow files are in `.github/workflows/`:

| File | Name | Trigger | Purpose |
|------|------|---------|---------|
| `pr-check.yml` | PR Check | PR to main | Fast feedback: typecheck, lint, bundle size, Docker build verify |
| `test.yml` | Tests | Push to main, PR to main | Full test suite with coverage gates |
| `e2e.yml` | E2E Tests | Push to main, PR to main | End-to-end tests against live API server |
| `deploy.yml` | Deploy | Push to main, manual dispatch | Build images, deploy to staging/production |
| `release.yml` | Release | Tag push (`v*`) | Create GitHub Release, build tagged images |
| `security.yml` | Security Scan | Push to main, PR to main, weekly (Mon 6am) | Dependency audit, Docker image scan, secret detection |
| `migration-check.yml` | Migration Check | PR to main (migrations/ path) | Validate migration naming and RLS compliance |
| `chaos-tests.yml` | Chaos Tests | Weekly (Sun 2am), manual dispatch | Resilience testing under failure conditions |
| `codeql.yml` | CodeQL | (varies) | GitHub CodeQL analysis |
| `stale.yml` | Stale | (varies) | Close stale issues/PRs |

---

## PR Check

**File**: `.github/workflows/pr-check.yml`

Lightweight, fast-feedback workflow that runs on every pull request. Does not require database or Redis services.

### Jobs

**1. Typecheck & Lint** (`check`)
- Install dependencies with `bun install --frozen-lockfile`
- Run `bun run typecheck` (all packages)
- Run `bun run lint` (all packages)

**2. Bundle Size Budget** (`bundle-size`)
- Build the web package and check bundle sizes against budgets
- Command: `bun run --filter @staffora/web build:budget`

**3. Docker Build Verification** (`docker-build`)
- Build API and Web Docker images (no push) to verify Dockerfiles are valid
- Uses Docker Buildx with GitHub Actions cache (`type=gha`)

### Concurrency

Cancels in-progress runs for the same PR (`pr-check-<PR number>`).

---

## Tests

**File**: `.github/workflows/test.yml`

Full test suite with real PostgreSQL and Redis services. Runs on push to main and PRs.

### Services

- PostgreSQL 16 (health-checked, port 5432)
- Redis 7 Alpine (health-checked, port 6379, no password in CI)

### Jobs

**1. Unit & Integration Tests** (`unit-tests`)

Steps:
1. Install dependencies (`bun install --frozen-lockfile`)
2. Type checking (`bun run typecheck`)
3. Linting (`bun run lint`)
4. Build all packages (`bun run build`)
5. Initialize database schema (`psql -f docker/postgres/init.sql`)
6. Run migrations (`bun run migrate:up`)
7. Run API tests with coverage (`bun test packages/api/src/test --coverage`)
8. Run shared package tests (`bun test packages/shared`)
9. API coverage enforcement (minimum 20% line coverage)
10. Upload coverage artifact (retained 14 days)

**2. Frontend Tests** (`frontend-tests`)

Steps:
1. Install dependencies
2. Run web tests with coverage (`bun run test:web -- --run --coverage`)
3. Frontend coverage enforcement (minimum 50% line coverage)
4. Upload coverage artifact (retained 14 days)

### Coverage Gates

| Package | Minimum | Metric | Enforcement |
|---------|---------|--------|-------------|
| API | 20% | Line coverage | CI step fails if below threshold |
| Frontend | 50% | Line coverage | CI step fails if below threshold |

Coverage is extracted from LCOV reports and summarized in the GitHub Step Summary.

### Concurrency

Cancels in-progress runs for the same ref (`tests-<ref>`).

---

## E2E Tests

**File**: `.github/workflows/e2e.yml`

Runs end-to-end tests against a live API server with real PostgreSQL and Redis.

### How it Differs from `test.yml`

- Starts the actual API server as a background process (`bun run packages/api/src/app.ts &`)
- Waits for the `/health` endpoint to confirm readiness (60-second timeout)
- Runs CI smoke tests (live HTTP requests against the running server)
- Runs the full E2E test suite (auth flows, multi-tenant isolation, leave requests, cases, onboarding)

### Services

- PostgreSQL 16 (port 5432)
- Redis 7 Alpine (port 6379, password: `staffora_redis_dev`)

### Test Environment

Tests connect as the `hris_app` role (NOBYPASSRLS) so RLS policies are actually enforced during E2E testing.

### Concurrency

Cancels in-progress runs for the same ref (`e2e-<ref>`).

---

## Deploy

**File**: `.github/workflows/deploy.yml`

Three-stage pipeline: test, build, deploy.

### Triggers

- **Automatic**: Push to main deploys to staging
- **Manual**: `workflow_dispatch` with environment choice (staging or production)

### Pipeline Stages

**Stage 1: Test Suite** (`test`)

Runs the full test suite (same as `test.yml`) as a gate for deployment. Includes type checking, linting, build, migrations, API tests, shared tests, and frontend tests.

**Stage 2: Build Docker Images** (`build`)

- Builds API and Web images in parallel (matrix strategy)
- Pushes to GitHub Container Registry (GHCR): `ghcr.io/<repo>/api` and `ghcr.io/<repo>/web`
- Tags: SHA, branch ref, `latest` (for default branch), timestamp
- Uses Docker Buildx with GitHub Actions cache

**Stage 3a: Deploy to Staging** (`deploy-staging`)

Automatic for pushes to main:
1. Determine image tag from commit SHA
2. SSH into staging server
3. Pull new images, restart API/worker/web
4. Run migrations inside the API container
5. Verify health endpoints (5 attempts, 15s apart)

**Stage 3b: Deploy to Production** (`deploy-production`)

Manual trigger only (`environment: production`):
1. Pre-deployment checks (log commit, actor, ref)
2. Database backup before deployment (`pg_dump | gzip`)
3. Capture current running image tags for rollback
4. Pull new images and rolling restart:
   - Restart API, wait 10s
   - Run migrations
   - Restart worker
   - Restart web
5. Verify health (10 attempts, 15s apart)
6. **Automatic rollback** if health check fails (rolls back to previous image tags)
7. Slack notification (if webhook configured)

### Rollback Mechanism

If the production health check fails:
- The workflow captures the previous API and Web image tags before deploying
- On failure, it automatically rolls back to those previous tags
- The workflow exits with an error after rollback

### Concurrency

Cancels in-progress runs for the same ref (`deploy-<ref>`).

---

## Release

**File**: `.github/workflows/release.yml`

Triggered when a version tag (`v*`) is pushed:

```bash
git tag v1.2.3
git push origin v1.2.3
```

Creates a GitHub Release with auto-generated release notes and builds production Docker images.

---

## Security Scan

**File**: `.github/workflows/security.yml`

### Triggers

- Push to main
- Pull requests to main
- Weekly schedule: Monday 6am UTC

### Jobs

**1. Dependency Audit** (`dependency-audit`)
- Runs `npx audit-ci` to check for known vulnerabilities in dependencies

**2. Docker Image Scan** (`docker-scan`)
- Builds API and Web images locally
- Scans with Trivy (`aquasecurity/trivy-action`) for CRITICAL and HIGH vulnerabilities
- Uploads SARIF results to GitHub Code Scanning

**3. Secret Detection** (`secret-scan`)
- Runs TruffleHog (`trufflesecurity/trufflehog`) for verified secrets
- Requires full git history (`fetch-depth: 0`)

---

## Migration Check

**File**: `.github/workflows/migration-check.yml`

Runs only when migration files are changed in a PR (path filter: `migrations/**`).

### Validations

**1. Naming Convention**
- Files must match `NNNN_description.sql` (4-digit prefix, lowercase, underscores)
- Example valid: `0188_add_employee_addresses.sql`
- Example invalid: `188_AddTable.sql`

**2. RLS Compliance**

For any migration that creates a new table (`CREATE TABLE`):
- Must include a `tenant_id` column
- Must enable Row-Level Security (`ENABLE ROW LEVEL SECURITY`)
- Must create a `tenant_isolation` policy

Exceptions: `schema_migrations`, `domain_outbox`, `settings`, `feature_flags`

---

## Chaos Tests

**File**: `.github/workflows/chaos-tests.yml`

### Schedule

- Weekly: Sunday 2am UTC
- Manual trigger via Actions tab

### Test Suites

| Suite | File | What it Tests |
|-------|------|---------------|
| Database Failures | `chaos/database-failures.test.ts` | Database connection loss, recovery |
| Connection Failures | `chaos/connection-failures.test.ts` | Network connection failures |
| Data Integrity | `chaos/data-integrity.test.ts` | Data integrity under adverse conditions |

Each suite runs individually with `continue-on-error: true` for granular reporting. Results are published to the GitHub Step Summary. Test logs are uploaded as artifacts (30-day retention).

---

## CodeQL

**File**: `.github/workflows/codeql.yml`

GitHub's CodeQL semantic analysis for security vulnerabilities and code quality issues.

---

## Stale Issues

**File**: `.github/workflows/stale.yml`

Automatically marks and closes stale issues and pull requests.

---

## Environment Management

### GitHub Environments

| Environment | URL | Deployment Gate |
|-------------|-----|-----------------|
| staging | `https://staging.staffora.co.uk` | Automatic on push to main |
| production | `https://staffora.co.uk` | Manual trigger, required reviewers |

### Deployment Targets

| Target | API URL | SSH User | Deploy Path |
|--------|---------|----------|-------------|
| Staging | `https://staging-api.staffora.co.uk` | `deploy` | `/opt/staffora` |
| Production | `https://api.staffora.co.uk` | `deploy` | `/opt/staffora` |

---

## Secrets and Variables

### Required Secrets

| Secret | Used In | Description |
|--------|---------|-------------|
| `STAGING_SSH_KEY` | deploy.yml | SSH key for staging server |
| `PRODUCTION_SSH_KEY` | deploy.yml | SSH key for production server |
| `SLACK_WEBHOOK_URL` | deploy.yml | Slack notifications (optional) |

### Optional Secrets

| Secret | Default | Description |
|--------|---------|-------------|
| `STAGING_HOST` | `staging.staffora.co.uk` | Staging server hostname |
| `STAGING_USER` | `deploy` | Staging SSH user |
| `STAGING_PATH` | `/opt/staffora` | Staging deploy path |
| `STAGING_API_URL` | `https://staging-api.staffora.co.uk` | Staging API URL for health checks |
| `STAGING_WEB_URL` | `https://staging.staffora.co.uk` | Staging web URL for health checks |
| `PRODUCTION_HOST` | `staffora.co.uk` | Production server hostname |
| `PRODUCTION_USER` | `deploy` | Production SSH user |
| `PRODUCTION_PATH` | `/opt/staffora` | Production deploy path |
| `PRODUCTION_API_URL` | `https://api.staffora.co.uk` | Production API URL for health checks |
| `PRODUCTION_WEB_URL` | `https://staffora.co.uk` | Production web URL for health checks |

### CI Test Secrets

These are hardcoded in workflow files for CI test environments (not actual secrets):

| Variable | Value | Purpose |
|----------|-------|---------|
| `BETTER_AUTH_SECRET` | `test-secret-that-is-at-least-32-characters-long` | Better Auth in CI |
| `SESSION_SECRET` | `test-session-secret-32-characters-long` | Session signing in CI |
| `CSRF_SECRET` | `test-csrf-secret-that-is-32-chars` | CSRF tokens in CI |

---

## Pipeline Scripts

### Package.json Scripts

These scripts are used by CI workflows:

| Script | Command | Used In |
|--------|---------|---------|
| `bun run typecheck` | Type-check all packages | PR Check, Tests, Deploy |
| `bun run lint` | Lint all packages | PR Check, Tests, Deploy |
| `bun run build` | Build all packages | Tests, Deploy |
| `bun run test:api` | Run API tests | Deploy |
| `bun run test:web` | Run web tests (Vitest) | Tests, Deploy |
| `bun run migrate:up` | Run pending migrations | Tests, Deploy, E2E |
| `bun test packages/shared` | Run shared tests | Tests, Deploy |
| `bun test packages/api/src/test --coverage` | API tests with coverage | Tests |
| `bun run test:web -- --run --coverage` | Web tests with coverage | Tests |

### Docker Build Args

| Arg | Value in CI | Purpose |
|-----|-------------|---------|
| `NODE_ENV` | `production` | Build optimized images |
