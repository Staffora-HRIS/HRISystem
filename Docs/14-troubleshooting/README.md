# Troubleshooting Guide

> Common issues, debug procedures, and lessons learned from real debugging sessions for the Staffora HRIS platform.

## Directory Contents

| File | Description |
|------|-------------|
| [README.md](README.md) | This file -- troubleshooting guide covering build, Docker, database, auth, test, API, frontend, and worker issues |
| [issues/](issues/) | 38 tracked issue specifications across architecture (8), compliance (12), security (8), and tech-debt (10) -- all resolved |

---

## Table of Contents

- [1. Common Build Issues](#1-common-build-issues)
- [2. Docker Issues](#2-docker-issues)
- [3. Database Issues](#3-database-issues)
- [4. Authentication Issues](#4-authentication-issues)
- [5. Test Failures](#5-test-failures)
- [6. API Issues](#6-api-issues)
- [7. Frontend Issues](#7-frontend-issues)
- [8. Worker Issues](#8-worker-issues)
- [9. Environment Setup](#9-environment-setup)
- [10. Debug Procedures](#10-debug-procedures)
- [Error Reference](#error-reference)
- [Related Documents](#related-documents)

---

## 1. Common Build Issues

### `bun install` failures

**Lock file conflicts**

**Symptom**: `bun install` fails with hash mismatches or "lockfile out of date" errors after switching branches.

**Fix**:
```bash
# Delete the lock file and regenerate
rm bun.lock
bun install
```

**Platform-specific native dependencies**

**Symptom**: Install succeeds on one OS but fails on another (e.g., Linux vs Windows vs macOS).

**Fix**: Native packages (e.g., `better-sqlite3`, `sharp`) may need platform-specific binaries. Run `bun install` on the target platform. If using Docker, builds happen inside the container so host platform does not matter.

---

### TypeScript compilation errors

#### TypeBox version split between packages

**Symptom**: TypeBox schemas from `@staffora/shared` cause type errors when used in `packages/api`.

**Cause**: `packages/api` uses `@sinclair/typebox@^0.34` while `packages/shared` uses `@sinclair/typebox@^0.32`. The two versions have breaking API changes.

**Fix**: Align both packages to `@sinclair/typebox@^0.34`. When writing schemas that cross package boundaries, be aware of API differences.

| Package | `packages/api` | `packages/shared` | Notes |
|---------|----------------|-------------------|-------|
| `@sinclair/typebox` | `^0.34` | `^0.32` | Breaking changes between versions |

> **Source**: `.claude/learning.md` entry 2026-03-10 (Environment)

---

#### TypeScript strict mode is disabled

**Symptom**: Null reference errors at runtime that TypeScript did not catch at compile time.

**Cause**: `tsconfig.base.json` has `strict: false` with all strict sub-flags disabled, including `strictNullChecks: false`. This directly caused a tenant null bug (commit `84c9460`) where null tenant IDs were not caught by the compiler.

**Fix**: Enable `strictNullChecks` incrementally. Full strict mode is the long-term goal but requires significant refactoring.

**Prevention**: When writing new code, treat null checks as mandatory even though the compiler does not enforce them.

> **Source**: `.claude/learning.md` entry 2026-03-10 (Environment)

---

#### Elysia route chain broken by semicolon

**Symptom**: Routes after a certain point in a file return 404 or the server fails to start.

**Cause**: A stray semicolon at the end of a route method call breaks the Elysia method chain:

```typescript
// BROKEN -- semicolon terminates the chain
app.get('/route1', handler1);

  .get('/route2', handler2)  // This is now a syntax error
```

**Fix**: Remove the semicolon and ensure the chain continues with `.`:

```typescript
// CORRECT -- chain continues
app.get('/route1', handler1)

  .get('/route2', handler2)
```

**Prevention**: Run `bun run typecheck` after every route file change to catch chain breaks early.

> **Source**: `.claude/learning.md` entry 2026-03-10 (fourth review pass)

---

#### ESLint type-aware rules not running

**Symptom**: Floating promises and misused promises are not flagged by the linter.

**Cause**: ESLint does not have `projectService` configured, so `no-floating-promises` and `no-misused-promises` rules are silently skipped.

**Fix**: Configure `projectService` in ESLint config to enable type-aware linting.

---

### Vite build issues

#### CSS processing failures

**Symptom**: Vite build fails with PostCSS or Tailwind CSS errors.

**Fix**: Ensure `postcss.config.js` and `tailwind.config.js` exist in `packages/web/` and reference valid paths. Run:

```bash
bun run build:web
```

If Tailwind classes are missing, check that `content` paths in `tailwind.config.js` include all component directories.

#### Module resolution errors

**Symptom**: Build fails with "Cannot find module" for paths starting with `~/`.

**Cause**: React Router v7 uses `~` as an alias for the `app/` directory. This must be configured in both `tsconfig.json` and `vite.config.ts`.

**Fix**: Verify these configurations align:
```json
// tsconfig.json
{ "compilerOptions": { "paths": { "~/*": ["./app/*"] } } }
```

---

## 2. Docker Issues

### Container startup failures

#### Missing environment variables

**Symptom**: API container exits immediately with "secret validation failed" or connection errors.

**Cause**: Required environment variables are not set in `docker/.env`.

**Fix**: Copy the example and fill in required values:

```bash
cp docker/.env.example docker/.env
# Edit docker/.env -- set at minimum:
#   POSTGRES_PASSWORD
#   BETTER_AUTH_SECRET (32+ chars)
#   SESSION_SECRET (32+ chars)
#   CSRF_SECRET (32+ chars)
```

Generate secrets:
```bash
openssl rand -base64 32  # Run 3 times, one for each secret
```

---

#### Port conflicts

**Symptom**: "Address already in use" errors when starting services.

**Default ports**:

| Service | Default Port | Env Override |
|---------|:----------:|--------------|
| API | 3000 | `API_PORT` |
| Web (dev) | 5173 | `WEB_PORT` |
| PostgreSQL | 5432 | `POSTGRES_PORT` |
| Redis | 6379 | `REDIS_PORT` |

**Fix**: Check for conflicting processes:

```bash
# Linux/macOS
lsof -i :3000
lsof -i :5432

# Windows
netstat -ano | findstr :3000
netstat -ano | findstr :5432
```

Override ports in `docker/.env`:
```bash
API_PORT=3001
POSTGRES_PORT=5433
```

---

### Database connection refused

**Symptom**: API logs show `ECONNREFUSED 127.0.0.1:5432` or similar connection errors.

**Cause**: Either the PostgreSQL container is not running, not yet healthy, or the connection URL uses `localhost` instead of the Docker service name.

**Fix**:
1. Check container status:
   ```bash
   bun run docker:ps
   ```
2. Wait for the health check to pass (PostgreSQL takes 10-30 seconds on first start).
3. Inside Docker Compose, services connect via service name (`postgres`), not `localhost`. The `DATABASE_URL` in docker-compose.yml already uses `postgres:5432`. If running the API outside Docker, use `localhost:5432`.

---

### Redis connection failures

**Symptom**: API or worker fails to start with Redis connection errors.

**Cause**: Redis container is not running, or the password does not match.

**Fix**:
1. Verify Redis is running and healthy:
   ```bash
   bun run docker:ps
   ```
2. Ensure `REDIS_PASSWORD` in `docker/.env` matches the password used in `REDIS_URL`. The default development password is `staffora_redis_dev`.
3. Test connectivity:
   ```bash
   redis-cli -a staffora_redis_dev ping
   # Should return: PONG
   ```

**Redis memory limits**: If Redis runs out of memory, it will reject writes. The Docker Compose configuration limits Redis to 1GB. Monitor with:
```bash
redis-cli -a staffora_redis_dev INFO memory
```

---

### Volume permission errors

**Symptom**: Container fails to start with permission denied errors on mounted volumes.

**Cause**: File ownership mismatch between the host user and the container user, especially on Linux.

**Fix**:
```bash
# Linux: fix ownership of Docker volumes
sudo chown -R 1000:1000 ./docker/postgres/
sudo chown -R 1000:1000 ./docker/redis/

# Or use Docker named volumes (already the default in docker-compose.yml)
```

On macOS and Windows with Docker Desktop, volume permissions are handled automatically.

---

### Docker Compose profiles

**Development mode** (default): Starts all services including the web frontend.

```bash
# Start everything
docker compose -f docker/docker-compose.yml up -d

# Start only infrastructure (postgres + redis)
bun run docker:up
```

**Production mode**: Includes the nginx reverse proxy with SSL.

```bash
docker compose -f docker/docker-compose.yml --profile production up -d
```

### Useful Docker commands

```bash
bun run docker:up       # Start postgres + redis only
bun run docker:down     # Stop all containers
bun run docker:ps       # Show container status
bun run docker:logs     # Tail all container logs
```

---

## 3. Database Issues

### Migration failures

#### Duplicate migration numbers

**Symptom**: Migration runner fails with "duplicate migration" or applies migrations in wrong order.

**Cause**: Known duplicate migration numbers from parallel feature branches:
- **0076-0079**: Duplicated across branches
- **0187**: Duplicated
- A non-numbered `fix_schema_migrations_filenames.sql` also exists

**Fix**: New migrations must use the next available number after the highest existing one. Check before creating:

```bash
ls migrations/ | sort -n | tail -5
```

Use 4-digit padding: `0190_description.sql`, not `190_description.sql`.

---

#### Schema ownership errors

**Symptom**: Migration fails with "permission denied for schema app" or "must be owner of schema app".

**Cause**: Migrations must run as the `hris` superuser role, not the `hris_app` application role.

**Fix**: Ensure `DATABASE_URL` points to the `hris` user when running migrations:

```bash
DATABASE_URL=postgres://hris:password@localhost:5432/hris bun run migrate:up
```

---

#### "relation does not exist" errors

**Symptom**: Queries fail with `relation "tablename" does not exist`.

**Cause**: All tables live in the `app` schema, not `public`. The database client sets `search_path = app, public` automatically, but raw SQL connections (e.g., psql) default to `public`.

**Fix**: When using psql or other tools directly, set the search path:

```sql
SET search_path = app, public;
-- Or qualify table names explicitly
SELECT * FROM app.employees;
```

---

### RLS errors

#### "permission denied" or empty results

**Symptom**: Queries return empty results or throw "permission denied for table" errors even though data exists.

**Cause**: The application connects as `hris_app` (which has `NOBYPASSRLS`), and the RLS tenant context was not set before the query. This happens when repository methods use `db.query` instead of `db.withTransaction(ctx, ...)`.

**Fix**: Always use `db.withTransaction(ctx, async (tx) => { ... })` for tenant-scoped queries:

```typescript
// WRONG -- bypasses RLS context
const result = await db.query`SELECT * FROM employees WHERE id = ${id}`;

// CORRECT -- sets RLS context first
const result = await db.withTransaction(ctx, async (tx) => {
  return await tx`SELECT * FROM employees WHERE id = ${id}`;
});
```

**Affected modules**: This was found and fixed across 8+ modules: recruitment (10 methods), succession (6 methods), competencies (8 methods), analytics (10 methods), documents (4 methods), security portal (3 methods), HR org chart (3 methods).

> **Source**: `.claude/learning.md` entry 2026-03-10 (comprehensive fix session)

---

#### Missing INSERT RLS policies

**Symptom**: INSERT operations fail with "new row violates row-level security policy".

**Cause**: 32 tables (primarily in migrations 0098-0106) have RLS for SELECT/UPDATE/DELETE but no explicit `FOR INSERT WITH CHECK` policy.

**Fix**: Add `tenant_isolation_insert` policies:

```sql
CREATE POLICY tenant_isolation_insert ON app.table_name
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);
```

**Prevention**: Every new migration with a tenant-owned table must include:
1. `tenant_id uuid NOT NULL` column
2. `ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;`
3. `CREATE POLICY tenant_isolation ON app.table_name USING (...);`
4. `CREATE POLICY tenant_isolation_insert ON app.table_name FOR INSERT WITH CHECK (...);`

> **Source**: `.claude/learning.md` entry 2026-03-10 (Database)

---

### Connection pool exhaustion

**Symptom**: Queries hang or fail with "too many connections" errors under load.

**Cause**: Each `db.withTransaction` opens a connection. Leaked transactions (unclosed connections) or high concurrency can exhaust the pool.

**Fix**:
1. Check active connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE datname = 'hris';
   ```
2. Kill idle connections:
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE datname = 'hris' AND state = 'idle' AND state_change < now() - interval '10 minutes';
   ```
3. Increase pool size in database configuration if needed.
4. Ensure all transactions are properly closed (no `await` without try/catch in transaction callbacks).

---

### Column name case mismatch

**Symptom**: Column names in query results do not match what you expect.

**Cause**: postgres.js auto-converts `snake_case` (database) to `camelCase` (TypeScript) via `postgres.toCamel`/`postgres.fromCamel`. Database columns are always `snake_case`; TypeScript properties are always `camelCase`.

**Fix**: In SQL queries, use `snake_case` column names. In TypeScript, access properties with `camelCase`:

```typescript
// SQL uses snake_case
const rows = await tx`SELECT first_name, last_name FROM employees`;
// TypeScript uses camelCase
console.log(rows[0].firstName, rows[0].lastName);
```

---

### Migration references wrong table or column name

**Symptom**: 500 errors on specific endpoints with "relation does not exist" or "column does not exist".

**Cause**: Repository/service code was written with assumed table or column names that do not match the actual migration schemas. This was the single most common bug category, found in multiple modules across 4 separate fix sessions:

| Module | Wrong Name | Correct Name |
|--------|-----------|--------------|
| Talent | `app.review_cycles` | `app.performance_cycles` |
| Talent | `review_cycle_id` | `cycle_id` |
| Talent | `period_start` / `period_end` | `start_date` / `end_date` |
| LMS | `app.course_enrollments` | `app.assignments` |
| LMS | `enrolled_at` | `assigned_at` |
| LMS | `progress` | `progress_percent` |
| LMS | status `enrolled` | status `not_started` |
| Workflows | `app.workflow_step_instances` | `app.workflow_tasks` |
| Benefits | `app.benefit_life_events` | `app.life_events` |
| Succession | `sc.readiness_level` | `sc.readiness` |

**Prevention**: When creating a repository, ALWAYS read the migration SQL first to verify exact table names, column names, and enum values. The codebase has had 4 separate fix sessions for this class of bug.

> **Source**: `.claude/learning.md` entries 2026-03-10 (third review pass, backend bug fix session)

---

### Trigger references wrong function name

**Symptom**: UPDATE operations on `app.jobs` table fail at runtime.

**Cause**: Migration `0101b_jobs.sql` creates a trigger referencing `app.update_updated_at()` but the actual function is named `app.update_updated_at_column()`.

**Fix**: Correct the trigger function name in the migration.

> **Source**: `.claude/learning.md` entry 2026-03-10 (Database)

---

### Bootstrap functions only defined in Docker init script

**Symptom**: Non-Docker deployments fail because `app.update_updated_at_column()`, `app.is_system_context()`, and other helper functions do not exist.

**Cause**: These functions are defined in `docker/postgres/init.sql` instead of in numbered migrations. Deployments that do not use the Docker init script (e.g., managed database services) never create these functions.

**Fix**: Ensure all required functions are also defined in migrations so they are created regardless of deployment method.

> **Source**: `.claude/learning.md` entry 2026-03-10 (Database)

---

## 4. Authentication Issues

### Session not persisting

**Symptom**: User appears logged in momentarily, then redirected back to login on the next navigation.

**Cause**: Session cookie is not being sent with subsequent requests. Common reasons:
1. **CORS credentials not set**: Frontend fetch calls must include `credentials: 'include'`.
2. **Domain mismatch**: Cookie domain does not match the request origin.
3. **SameSite policy**: Cookie `SameSite` is set to `Strict` in production, which blocks cross-origin cookie sending.

**Fix**:
1. Ensure all API calls use `credentials: 'include'`:
   ```typescript
   fetch('/api/v1/hr/employees', { credentials: 'include' });
   ```
2. Verify `CORS_ORIGIN` matches the frontend URL exactly (including protocol and port).
3. For local development, use `http://localhost:5173` (not `127.0.0.1`).

---

### CSRF token errors

**Symptom**: Mutating requests (POST, PUT, DELETE) fail with 403 "CSRF validation failed".

**Cause**: Missing or invalid `X-CSRF-Token` header on mutating requests.

**Fix**:
1. Fetch a CSRF token from the auth endpoint before making mutations.
2. Include the token in the request header:
   ```typescript
   headers: { 'X-CSRF-Token': csrfToken }
   ```

**Note**: CSRF tokens use HMAC-SHA256 with the `CSRF_SECRET`. Tokens from different secrets will fail validation.

> **Source**: `.claude/learning.md` entry 2026-03-10 (Security) -- CSRF was originally non-functional (plain base64, no HMAC), fixed 2026-03-16 to use HMAC-SHA256 with `timingSafeEqual`.

---

### MFA not working

**Symptom**: TOTP codes are rejected even though the user has MFA configured.

**Cause**: TOTP is time-based. Common issues:
1. **Clock skew**: Server and authenticator app clocks are out of sync by more than 30 seconds.
2. **Secret mismatch**: The TOTP secret stored in the database does not match what the authenticator app uses.

**Fix**:
1. Verify server time is synchronized (use NTP).
2. Have the user re-enroll MFA by generating a new TOTP secret.
3. Most TOTP implementations allow a 1-step window (30s before/after). Verify this is configured.

---

### "Unauthorized" on all requests

**Symptom**: Every API request returns 401 regardless of authentication state.

**Cause**: Plugin registration order in `src/app.ts` is critical. The auth plugin depends on the database and cache plugins being registered first. If plugins are reordered or one fails silently, downstream plugins cannot function.

**Required plugin order**:
1. `errorsPlugin` -- Error handling, request ID generation
2. `dbPlugin` -- Database connectivity
3. `cachePlugin` -- Redis caching
4. `rateLimitPlugin` -- Rate limiting (depends on cache)
5. `betterAuthPlugin` -- BetterAuth route handler for `/api/auth/*`
6. `authPlugin` -- Session/user resolution (depends on db, cache)
7. `tenantPlugin` -- Tenant resolution (depends on db, cache, auth)
8. `rbacPlugin` -- Authorization (depends on db, cache, auth, tenant)
9. `idempotencyPlugin` -- Request deduplication
10. `auditPlugin` -- Audit logging

**Fix**: Verify plugin order in `packages/api/src/app.ts`. If a plugin fails to initialize (e.g., Redis connection fails for `cachePlugin`), all downstream plugins will malfunction.

---

### Bootstrapped users cannot sign in

**Symptom**: Users created by `bootstrap:root` script cannot log in through the BetterAuth sign-in flow.

**Cause**: The bootstrap script originally only inserted into `app.users` but not into BetterAuth's `app."user"` or `app."account"` tables. BetterAuth does not know about users that only exist in `app.users`.

**Fix**: The bootstrap script was updated to atomically create records in `app.users`, `app."user"`, and `app."account"`. If you have an existing deployment, re-run the bootstrap or manually create the BetterAuth records.

> **Source**: `.claude/learning.md` entry 2026-03-17 (auth review)

---

### Account unlock only partially works

**Symptom**: After unlocking a locked user, they still cannot sign in.

**Cause**: `adminUnlockAccount()` originally only updated `app.users` but not `app."user"`. BetterAuth reads from `app."user"`, so the account remained locked from its perspective.

**Fix**: `adminUnlockAccount()` now updates both tables atomically.

> **Source**: `.claude/learning.md` entry 2026-03-17 (auth review)

---

### CORS mismatch between Elysia and BetterAuth

**Symptom**: Authentication requests fail with CORS errors even though the CORS middleware is configured.

**Cause**: BetterAuth has its own `trustedOrigins` list that must match the Elysia CORS configuration. If they diverge, BetterAuth rejects requests that Elysia's CORS headers would allow.

**Fix**: Both Elysia CORS and BetterAuth `trustedOrigins` now read from the same `CORS_ORIGIN` environment variable (comma-separated).

---

### Secret validation crashes on startup

**Symptom**: API process exits with "secret validation failed in production".

**Cause**: In production mode (`NODE_ENV=production`), the startup secret validator requires:
- `BETTER_AUTH_SECRET` to be set (at least 32 characters)
- Secrets must not match known insecure defaults (checked against an `INSECURE_DEFAULTS` blocklist)

**Fix**: Generate proper secrets:

```bash
openssl rand -base64 32  # Run 3 times for BETTER_AUTH_SECRET, SESSION_SECRET, CSRF_SECRET
```

> **Source**: `.claude/learning.md` entry 2026-03-10 (Security) -- Previously had a hardcoded fallback `"development-secret-change-in-production"` which was added to the INSECURE_DEFAULTS blocklist.

---

## 5. Test Failures

### Tests hanging -- Docker containers not running

**Symptom**: Integration tests hang indefinitely or fail with "connection refused".

**Cause**: Docker containers for PostgreSQL and Redis are not running. The test setup in `src/test/setup.ts` will attempt to auto-start them, but this may fail silently.

**Fix**:

```bash
bun run docker:up
bun run migrate:up
bun test
```

---

### RLS test failures -- wrong database role

**Symptom**: RLS integration tests pass when they should fail, or fail unexpectedly.

**Cause**: Tests must connect as the `hris_app` role (which has `NOBYPASSRLS`), not the `hris` superuser role. The `hris` role bypasses all RLS policies, so tests against it prove nothing.

**Fix**: Verify the test database URL uses `hris_app`:

```
DATABASE_URL=postgres://hris_app:password@localhost:5432/hris
```

The test setup in `src/test/setup.ts` handles this automatically. Do not override `DATABASE_URL` in test configurations.

---

### Frontend tests (vitest) vs API tests (bun test)

**Symptom**: `bun test` does not find or run frontend tests, or `vitest` cannot find API tests.

**Cause**: The two packages use different test runners:
- `packages/api` uses **Bun's built-in test runner** (`bun test`)
- `packages/web` uses **vitest** (`bun run test:web`)

**Fix**: Use the correct commands:

```bash
bun run test:api    # Runs bun test for packages/api
bun run test:web    # Runs vitest for packages/web
bun test            # Runs all packages (auto-detects runner per package)
```

---

### Tests appear to pass but do not actually test anything

**Symptom**: Tests pass but do not catch real bugs.

**Cause**: A known issue -- many test files contain hollow assertions that test local variables instead of making real API calls. This affects:
- All 5 route test files in `packages/api/src/test/integration/routes/`
- All security tests, performance tests, chaos tests, E2E tests
- All 10 frontend tests in `packages/web/app/__tests__/`

**Real tests** (that actually work): `rls.test.ts`, `rls-coverage.test.ts`, `idempotency.test.ts`, `outbox.test.ts`, `effective-dating.test.ts`, `state-machine.test.ts`, and 3 service unit tests (hr, absence, time).

**Fix**: When adding test coverage, use the existing test helpers (`TestApiClient`, factories, assertions) and make real HTTP calls via `app.handle()`. Do not follow the hollow test pattern.

> **Source**: `.claude/learning.md` entry 2026-03-10 (Testing)

---

### Test isolation -- shared tenant context

**Symptom**: Tests pass individually but fail when run together, or produce intermittent failures.

**Cause**: Tests share database state. If one test creates data with a specific tenant context and does not clean up, subsequent tests may see unexpected data or fail RLS checks.

**Fix**:
1. Use `createTestContext()` from `src/test/setup.ts` to create an isolated tenant per test.
2. Use `withSystemContext(db, async (tx) => { ... })` for setup/teardown operations that bypass RLS.
3. Never hardcode tenant IDs in tests -- generate unique ones.

---

## 6. API Issues

### 404 on valid routes -- plugin registration order

**Symptom**: A route that exists in the module's `routes.ts` returns 404.

**Cause**: If any plugin in the registration chain fails to initialize, routes registered after it may not be mounted. The most common cause is a Redis or database connection failure that prevents `cachePlugin` or `dbPlugin` from initializing.

**Fix**:
1. Check API startup logs for plugin initialization errors.
2. Verify all infrastructure services are running: `bun run docker:ps`.
3. Verify the route is registered in `packages/api/src/app.ts`.

---

### 500 Internal Server Error

**Symptom**: Endpoint returns `{ error: { code: "INTERNAL_ERROR", requestId: "req-xxx" } }`.

**Fix**: Use the request ID to trace the error:

```bash
bun run docker:logs | grep "req-xxx"
```

The most common causes:
1. **Wrong table/column names** in SQL (see [Database Issues](#migration-references-wrong-table-or-column-name))
2. **Missing RLS context** -- repository uses `db.query` instead of `db.withTransaction` (see [RLS errors](#rls-errors))
3. **Unhandled null** -- `strictNullChecks` is disabled, so nulls propagate silently

---

### Idempotency conflicts

**Symptom**: Mutating request returns 409 Conflict with an idempotency error.

**Cause**: The same `Idempotency-Key` header value was used for a different request within the TTL window (24-72 hours). The key is scoped to `(tenant_id, user_id, route_key)`.

**Fix**:
1. Generate a new UUID for each unique mutation:
   ```typescript
   headers: { 'Idempotency-Key': crypto.randomUUID() }
   ```
2. If retrying the same operation intentionally (e.g., after a network failure), reuse the original key -- idempotency will return the cached result.

---

### Rate limiting -- 429 Too Many Requests

**Symptom**: Requests return 429 status code.

**Cause**: Too many requests from the same IP or user within the rate limit window.

**Default configuration**:
- `RATE_LIMIT_MAX`: 100 requests per window
- `RATE_LIMIT_WINDOW`: 60000ms (1 minute)

**Fix**: For development, increase limits in `docker/.env`:

```bash
RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW=60000
```

For production, implement request queuing or throttling on the client side.

---

### Missing RBAC permission guards

**Symptom**: Endpoints return data without checking user permissions, or users can access resources they should not.

**Cause**: Several modules were found with `requireTenantContext` but no `requirePermission()` guards. This was fixed for LMS, cases, onboarding, competencies, workflows, and time modules.

**Prevention**: Every route handler that modifies or reads tenant-scoped data must use `requirePermission()`, not just `requireAuthContext` or `requireTenantContext`.

> **Source**: `.claude/learning.md` entries 2026-03-10 (second and third review passes)

---

## 7. Frontend Issues

### Blank page after login

**Symptom**: Login succeeds (network tab shows 200) but the page is blank or redirects to login again.

**Cause**: Session cookie is not being sent with subsequent requests because `credentials: 'include'` is missing from fetch calls, or CORS is not configured to allow credentials.

**Fix**:
1. Verify the API client uses `credentials: 'include'` on all requests.
2. Check `CORS_ORIGIN` matches the frontend URL exactly.
3. Check browser DevTools > Application > Cookies to verify the session cookie exists.
4. On Chrome, ensure third-party cookies are not blocked for `localhost`.

---

### React Query cache stale -- data not updating after mutations

**Symptom**: After creating, updating, or deleting a record, the list view still shows old data.

**Cause**: React Query cache was not invalidated after the mutation.

**Fix**: Add `onSuccess` to mutation hooks to invalidate relevant queries:

```typescript
const mutation = useMutation({
  mutationFn: (data) => api.post('/api/v1/hr/employees', data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
  },
});
```

---

### Route not found -- React Router v7 conventions

**Symptom**: Navigating to a page shows a 404 or blank component.

**Cause**: React Router v7 in framework mode uses file-based routing with specific conventions:
- Route groups use parentheses: `(auth)/`, `(app)/`, `(admin)/`
- Index routes must be named `index.tsx` or registered in `routes.ts`
- Layout routes use `layout.tsx`

**Fix**: Check that the route file exists in the correct directory and follows naming conventions. Verify the route is registered in `packages/web/app/routes.ts`.

> **Source**: `.claude/learning.md` entry 2026-03-10 (second review) -- Leave module had no index route, causing 404 on `/admin/leave`.

---

### Permission-denied UI

**Symptom**: UI shows "Access Denied" or hides features the user should have access to.

**Cause**: The `useHasPermission()` hook returns `false` because:
1. The user's role does not have the required permission.
2. The permission string does not match the backend's expected format.
3. Permissions were not loaded yet (React Query still fetching).

**Fix**:
1. Check the user's role and permissions in the database.
2. Verify the permission string matches what the backend expects (e.g., `hr.employees.read`, not `employees.read`).
3. Add a loading state check before rendering permission-gated content.

---

### Frontend calls non-existent API endpoints

**Symptom**: Frontend pages show loading spinners forever or display network errors.

**Known mismatches that have been fixed**:

| Frontend Path | Backend Path | Fix Applied |
|--------------|-------------|-------------|
| `/benefits/available-plans` | `/benefits/plans` | Updated frontend |
| `/onboarding/templates` | `/onboarding/checklists` | Updated frontend |
| `/onboarding/my-progress` | `/onboarding/my-onboarding` | Updated frontend |
| `/absence/requests/{id}/reject` | `/absence/requests/{id}/approve` with `{action: "reject"}` | Updated frontend |
| `/time/stats` | (did not exist) | Added backend endpoint |
| `/time/schedule-assignments` | (did not exist) | Added backend endpoint |
| `/hr/stats` | (did not exist) | Added backend endpoint |
| `/competencies/employees/me` | (did not exist) | Added backend endpoint |

**Prevention**: When adding frontend pages, always verify the exact API path exists on the backend. Run `bun run typecheck` on both packages.

> **Source**: `.claude/learning.md` entries 2026-03-10 (second and fourth review passes)

---

## 8. Worker Issues

### Outbox events not processing

**Symptom**: Domain events are written to `domain_outbox` but never processed. Downstream side effects (notifications, analytics) do not fire.

**Cause**:
1. Worker container is not running.
2. Redis connection failed, preventing stream publishing.
3. Outbox processor used wrong column names (`locked_until`, `last_error` instead of `next_retry_at`, `error_message`).

**Fix**:
1. Check worker is running:
   ```bash
   bun run docker:ps
   ```
2. Check outbox table for unprocessed events:
   ```sql
   SELECT count(*), min(created_at) FROM app.domain_outbox WHERE processed_at IS NULL;
   ```
3. Check for events stuck in retry backoff:
   ```sql
   SELECT id, event_type, retry_count, next_retry_at, error_message
   FROM app.domain_outbox
   WHERE retry_count > 0 AND next_retry_at > now()
   ORDER BY created_at DESC
   LIMIT 10;
   ```

> **Source**: `.claude/learning.md` entry 2026-03-14 (Outbox processor fix) -- Column names and backoff logic were corrected.

---

### Outbox events lost on failure -- separate transaction bug

**Symptom**: Business writes succeed but domain events are not delivered.

**Cause**: In some modules (cases, LMS, onboarding -- now fixed), the `emitDomainEvent()` helper opened a SEPARATE transaction from the business write and silently swallowed errors in a catch block. If the outbox write failed, the event was lost silently.

**Fix**: Always pass the transaction handle (`tx`) from the business operation into the outbox write:

```typescript
// CORRECT -- outbox write in same transaction
await db.withTransaction(ctx, async (tx) => {
  const [employee] = await tx`INSERT INTO employees ...`;
  await tx`INSERT INTO domain_outbox ...`;  // Same tx!
  return employee;
});
```

The HR module and benefits module have the correct implementation. Use them as reference.

> **Source**: `.claude/learning.md` entry 2026-03-10 (Outbox pattern audit)

---

### Outbox processor retries in tight loop

**Symptom**: Failed outbox events are immediately re-fetched and retried without backoff, causing CPU spikes during outages.

**Cause**: The outbox processor incremented `retry_count` but never set `next_retry_at`, so failed events immediately re-entered the processing queue.

**Fix**: Added exponential backoff: `min(1000 * 2^retryCount, 300000)` ms stored in `next_retry_at`. Added `WHERE (next_retry_at IS NULL OR next_retry_at <= now())` to the fetch query. Added adaptive polling that increases interval during idle periods (5s to 30s cap).

> **Source**: `.claude/learning.md` entry 2026-03-14 (Performance)

---

### Notification emails not sending

**Symptom**: Notification events are processed but emails are never delivered.

**Cause**: SMTP configuration is missing or incorrect. Check:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` in worker environment
- `SMTP_FROM` must be a valid sender address

**Fix**: Configure SMTP in `docker/.env`:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=noreply@staffora.co.uk
```

For local development, use a service like Mailhog or Mailtrap to capture emails without sending them.

---

### Export timeouts

**Symptom**: Export jobs time out or the worker runs out of memory when exporting large datasets.

**Cause**: The export worker loads the entire dataset into memory instead of using streaming/pagination.

**Fix**: For large exports, implement cursor-based pagination in the export query. This is a known performance issue from the codebase audit.

> **Source**: `.claude/learning.md` entry 2026-03-10 (Performance) -- Export worker loads entire dataset into memory.

---

## 9. Environment Setup

### Required environment variables

Copy `docker/.env.example` to `docker/.env`. The following variables must be set:

| Variable | Required | Default (dev) | How to Generate |
|----------|:--------:|---------------|----------------|
| `POSTGRES_PASSWORD` | Yes | `hris_dev_password` | Choose a secure password |
| `BETTER_AUTH_SECRET` | Yes (prod) | dev fallback | `openssl rand -base64 32` |
| `SESSION_SECRET` | Recommended | dev fallback | `openssl rand -base64 32` |
| `CSRF_SECRET` | Recommended | dev fallback | `openssl rand -base64 32` |
| `CORS_ORIGIN` | Yes | `http://localhost:5173` | Frontend URL |

All secrets must be at least 32 characters. In production, secrets must not match known insecure defaults.

### Default ports

| Service | Port | Env Override |
|---------|:----:|--------------|
| API | 3000 | `API_PORT` |
| Web (dev) | 5173 | `WEB_PORT` |
| PostgreSQL | 5432 | `POSTGRES_PORT` |
| Redis | 6379 | `REDIS_PORT` |
| Worker health | 3001 | `WORKER_HEALTH_PORT` |

### Checking for port conflicts

```bash
# Linux/macOS
lsof -i :3000
lsof -i :5173
lsof -i :5432
lsof -i :6379

# Windows
netstat -ano | findstr :3000
netstat -ano | findstr :5173
netstat -ano | findstr :5432
netstat -ano | findstr :6379
```

### First-time setup checklist

```bash
# 1. Clone and install
git clone <repo>
cd HRISystem
bun install

# 2. Create environment file
cp docker/.env.example docker/.env
# Edit docker/.env -- set POSTGRES_PASSWORD and auth secrets

# 3. Start infrastructure
bun run docker:up

# 4. Run migrations
bun run migrate:up

# 5. Create root tenant and admin user
bun run --filter @staffora/api bootstrap:root

# 6. Start development servers
bun run dev

# 7. Open the application
# API:  http://localhost:3000
# Web:  http://localhost:5173
```

### Dependency version alignment

Known version skew issues that can cause problems:

| Package | `packages/api` | `packages/shared` | Impact |
|---------|----------------|-------------------|--------|
| `@sinclair/typebox` | `^0.34` | `^0.32` | Breaking API changes; cross-package schema usage fails |
| `better-auth` | `^1.1.10` | -- | Should align with web package version |

> **Source**: `.claude/learning.md` entry 2026-03-10 (Environment)

### CI/CD pipeline issues

#### test.yml missing database init

**Symptom**: CI tests fail with "relation does not exist" errors.

**Cause**: The `test.yml` workflow was missing the `init.sql` database initialization step that creates the `app` schema, `hris_app` role, and RLS helper functions. The `deploy.yml` had this step but `test.yml` did not.

**Fix**: Added `init.sql` step to `test.yml` matching `deploy.yml`.

> **Source**: `.claude/learning.md` entry 2026-03-16 (DevOps)

---

#### test.yml missing auth environment variables

**Symptom**: CI tests fail with authentication-related errors.

**Cause**: `BETTER_AUTH_SECRET`, `SESSION_SECRET`, and `CSRF_SECRET` were not set in the `test.yml` workflow environment.

**Fix**: Added all three auth secret environment variables to `test.yml`.

> **Source**: `.claude/learning.md` entry 2026-03-16 (DevOps)

---

## 10. Debug Procedures

### Request lifecycle debugging

Trace a request through the full plugin chain:

1. **Request arrives** at Elysia.
2. `errorsPlugin` assigns a `requestId` and sets up error handling.
3. `dbPlugin` makes the database connection available.
4. `cachePlugin` makes Redis available.
5. `rateLimitPlugin` checks rate limits (rejects with 429 if exceeded).
6. `betterAuthPlugin` handles `/api/auth/*` routes (authentication flows).
7. `authPlugin` resolves the session cookie to a user. If no valid session, the request proceeds without a user context (unless the route requires auth).
8. `tenantPlugin` resolves the tenant from the user's tenant association.
9. `rbacPlugin` loads the user's permissions for the resolved tenant.
10. `idempotencyPlugin` checks for duplicate `Idempotency-Key` values.
11. `auditPlugin` logs the request for audit purposes.
12. **Route handler** executes the business logic.

**To trace a specific request**:
```bash
# Set LOG_LEVEL=debug for verbose output
LOG_LEVEL=debug bun run dev:api

# Then look for the requestId in logs
bun run docker:logs | grep "req-xxx"
```

---

### RLS debugging

Step-by-step procedure when queries return empty results or permission errors:

1. **Verify the tenant context is set**:
   ```sql
   -- In a psql session connected as hris_app
   SELECT current_setting('app.current_tenant', true);
   ```

2. **Check the RLS policies on the table**:
   ```sql
   SELECT schemaname, tablename, policyname, cmd, qual, with_check
   FROM pg_policies
   WHERE schemaname = 'app' AND tablename = 'your_table';
   ```

3. **Verify data exists for the tenant**:
   ```sql
   -- Bypass RLS to check
   SELECT app.enable_system_context();
   SELECT count(*) FROM app.your_table WHERE tenant_id = 'your-tenant-uuid';
   SELECT app.disable_system_context();
   ```

4. **Check the database role**:
   ```sql
   SELECT current_user, current_setting('is_superuser') as is_super;
   ```
   If `is_superuser` is `on`, RLS is bypassed. Tests and application code must use `hris_app`.

5. **Test with explicit context**:
   ```sql
   SET app.current_tenant = 'your-tenant-uuid';
   SELECT * FROM app.your_table;  -- Should now return rows
   ```

---

### Worker debugging

When background jobs are not executing:

1. **Check the worker is running**:
   ```bash
   bun run docker:ps
   # Look for staffora-worker container with healthy status
   ```

2. **Check the outbox table** for unprocessed events:
   ```sql
   -- Pending events (not yet processed)
   SELECT id, event_type, created_at, retry_count
   FROM app.domain_outbox
   WHERE processed_at IS NULL
   ORDER BY created_at DESC
   LIMIT 20;
   ```

3. **Check for failed events** stuck in backoff:
   ```sql
   SELECT id, event_type, retry_count, next_retry_at, error_message
   FROM app.domain_outbox
   WHERE retry_count > 0
   ORDER BY retry_count DESC
   LIMIT 10;
   ```

4. **Check Redis Streams** for pending messages:
   ```bash
   redis-cli -a staffora_redis_dev XLEN staffora:notifications
   redis-cli -a staffora_redis_dev XPENDING staffora:notifications staffora-workers - + 10
   ```

5. **Check worker logs**:
   ```bash
   docker logs staffora-worker --tail 100
   ```

6. **Reset a stuck event** (use with caution):
   ```sql
   -- Reset retry count and clear error for a specific event
   SELECT app.enable_system_context();
   UPDATE app.domain_outbox
   SET retry_count = 0, next_retry_at = NULL, error_message = NULL
   WHERE id = 'event-uuid';
   SELECT app.disable_system_context();
   ```

---

### Frontend state debugging

1. **React DevTools**: Install the React Developer Tools browser extension. Use the Components tab to inspect component state and props.

2. **React Query DevTools**: The React Query DevTools panel is included in development mode. It shows:
   - All active queries and their status (fresh, stale, fetching, error)
   - Cache contents and timing
   - Query keys for debugging invalidation issues

3. **Network tab**: Use the browser DevTools Network tab to verify:
   - API requests are being sent to the correct endpoints
   - Session cookies are included in requests (`credentials: 'include'`)
   - Response payloads match expected shapes

4. **Console errors**: Check for:
   - CORS errors (configuration mismatch)
   - Unhandled promise rejections (missing error boundaries)
   - React hydration mismatches (server/client rendering differences)

5. **Common debugging pattern**:
   ```typescript
   // Temporarily add to a component to inspect query state
   const query = useQuery({ queryKey: ['employees'], queryFn: fetchEmployees });
   console.log('Query state:', {
     status: query.status,
     data: query.data,
     error: query.error,
     isFetching: query.isFetching,
   });
   ```

---

## Error Reference

### Common HTTP Error Codes

| Error Code | HTTP Status | Cause | Solution |
|-----------|:----------:|-------|----------|
| `VALIDATION_ERROR` | 400 | Request body fails TypeBox validation | Check request payload against the endpoint's schema |
| `UNAUTHORIZED` | 401 | Missing or invalid session cookie | Re-authenticate via BetterAuth |
| `FORBIDDEN` | 403 | User lacks required permission | Check role assignments and permission grants |
| `NOT_FOUND` | 404 | Resource does not exist or RLS blocks access | Verify the resource ID and tenant context |
| `CONFLICT` | 409 | Duplicate idempotency key or state conflict | Use a new idempotency key or resolve state conflict |
| `STATE_MACHINE_VIOLATION` | 422 | Invalid state transition attempted | Check valid transitions for the current state |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait and retry; check `RATE_LIMIT_MAX` config |
| `INTERNAL_ERROR` | 500 | Unhandled server error | Check API logs with the `requestId` from the error response |

### Database-Level Errors

| Error Message | Cause | Solution |
|--------------|-------|----------|
| `permission denied for table X` | RLS policy blocking access | Ensure `app.set_tenant_context()` is called before query |
| `new row violates row-level security policy` | INSERT without matching tenant_id | Verify `tenant_id` in INSERT matches `app.current_tenant` setting |
| `relation "app.X" does not exist` | Wrong table name in SQL | Check the actual table name in migration files |
| `column "X" does not exist` | Wrong column name in SQL | Check the actual column name in the migration |
| `duplicate key value violates unique constraint` | Attempting to insert a duplicate | Check for existing records; use `ON CONFLICT` where appropriate |
| `current transaction is aborted` | Previous SQL error in the same transaction | The transaction must be rolled back; check preceding queries |

---

## Related Documents

| Document | Description |
|----------|-------------|
| [Getting Started Guide](../guides/GETTING_STARTED.md) | Initial setup instructions |
| [Architecture Overview](../architecture/ARCHITECTURE.md) | System design and data flow |
| [Database Reference](../architecture/DATABASE.md) | Schema, migrations, RLS policies |
| [API Reference](../api/API_REFERENCE.md) | All 190+ endpoints by module |
| [Error Codes Reference](../api/ERROR_CODES.md) | Complete error code catalog by module |
| [Security Architecture](../security/README.md) | Auth, RBAC, RLS, OWASP mitigations |
| [Worker System](../architecture/WORKER_SYSTEM.md) | Redis Streams, outbox, job processors |
| [Testing Guide](../testing/README.md) | Test infrastructure and guides |
| [Docker Guide](../devops/docker-guide.md) | Container architecture, development workflow |
| [CI/CD Pipeline](../devops/ci-cd.md) | GitHub Actions workflows |
| [Integrations](../integrations/README.md) | External service configuration (S3, SMTP, Firebase) |
| [State Machines](../patterns/STATE_MACHINES.md) | Employee lifecycle, leave, cases, workflows |
| [`.claude/learning.md`](../../.claude/learning.md) | Raw debugging discoveries (source for this guide) |
