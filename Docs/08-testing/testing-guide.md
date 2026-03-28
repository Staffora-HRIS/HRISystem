# Testing Guide

Last updated: 2026-03-28

This guide covers the full testing infrastructure for the Staffora HRIS platform, including how tests are organized, how to run them, and how to write new tests.

---

## Table of Contents

- [Test Runner Overview](#test-runner-overview)
- [Infrastructure Requirements](#infrastructure-requirements)
- [Running Tests](#running-tests)
- [Test Categories](#test-categories)
- [Test Setup and Helpers](#test-setup-and-helpers)
- [Test Data Factories](#test-data-factories)
- [Test API Client](#test-api-client)
- [Custom Assertions](#custom-assertions)
- [Mock Utilities](#mock-utilities)
- [Writing Integration Tests](#writing-integration-tests)
- [Writing Unit Tests](#writing-unit-tests)
- [Writing Frontend Tests](#writing-frontend-tests)
- [Coverage Requirements](#coverage-requirements)

---

## Test Runner Overview

Staffora uses two different test runners depending on the package:

| Package | Runner | Command | Config |
|---------|--------|---------|--------|
| `@staffora/api` | Bun's built-in test runner (`bun test`) | `bun run test:api` | N/A (built-in) |
| `@staffora/shared` | Bun's built-in test runner (`bun test`) | `bun test packages/shared` | N/A (built-in) |
| `@staffora/web` | Vitest | `bun run test:web` | `packages/web/vite.config.ts` (test section) |

This distinction is important: never use `bun test` for the web package, and never use `vitest` for the API package.

### Frontend Test Configuration

The web package configures Vitest inside `packages/web/vite.config.ts`:

```typescript
test: {
  environment: "jsdom",
  exclude: ["node_modules", "build", "e2e/**"],
  alias: [
    { find: /^~\/(.*)/, replacement: `${import.meta.dirname}/app/$1` },
  ],
}
```

Key points:
- Uses `jsdom` as the test environment for DOM simulation
- The `~/` path alias resolves to `packages/web/app/` (matching the app's import convention)
- Playwright E2E tests in `e2e/` are excluded from Vitest runs

---

## Infrastructure Requirements

API integration tests require running Docker containers for PostgreSQL and Redis. The test setup will attempt to auto-start containers if they are not running, but the recommended approach is to start them explicitly before running tests.

### Prerequisites

```bash
# Start infrastructure containers
bun run docker:up

# Run database migrations
bun run migrate:up
```

### Database Roles

Tests use two PostgreSQL roles:

| Role | Purpose | Properties |
|------|---------|------------|
| `hris` | Admin/superuser role | Used for migrations and test bootstrap (creating roles, granting permissions) |
| `hris_app` | Application role | `NOBYPASSRLS` -- used for all test queries so RLS policies are enforced |

The test setup in `packages/api/src/test/setup.ts` automatically:

1. Connects with the `hris` admin role to bootstrap the `hris_app` role if it does not exist
2. Grants `hris_app` the necessary permissions on the `app` schema (SELECT, INSERT, UPDATE, DELETE on tables; USAGE on sequences; EXECUTE on functions)
3. Creates utility functions (`app.prevent_update()`, `app.prevent_delete()`) for immutability triggers
4. Verifies that the `app.tenants` table exists (i.e., migrations have been run)

### Infrastructure Availability

If Docker containers are unavailable, tests that require database or Redis will be gracefully skipped rather than failing. The setup provides helper functions for this:

```typescript
import { ensureTestInfra, isInfraAvailable, skipIfNoInfra } from "../setup";

beforeAll(async () => {
  await ensureTestInfra();
  if (!isInfraAvailable()) return;
  // ... setup test fixtures
});
```

### Configuration

Test infrastructure configuration is resolved from environment variables with sensible defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_DB_HOST` | `localhost` | PostgreSQL host |
| `TEST_DB_PORT` | `5432` | PostgreSQL port |
| `TEST_DB_NAME` | `hris` | Database name |
| `TEST_DB_USER` | `hris_app` | Application role (NOBYPASSRLS) |
| `TEST_DB_PASSWORD` | `hris_dev_password` | Application role password |
| `TEST_DB_ADMIN_USER` | `hris` | Admin role for bootstrap |
| `TEST_DB_ADMIN_PASSWORD` | `hris_dev_password` | Admin role password |
| `TEST_REDIS_HOST` | `localhost` | Redis host |
| `TEST_REDIS_PORT` | `6379` | Redis port |
| `TEST_REDIS_PASSWORD` | (empty) | Redis password |

The test setup also reads `docker/.env` if present, so local overrides work automatically.

---

## Running Tests

### All Tests

```bash
bun test                    # All packages
```

### API Tests

```bash
bun run test:api            # All API tests
bun test packages/api/src/test/integration/rls.test.ts   # Single file
bun test --test-name-pattern "RLS"                       # Filter by name
bun test --watch            # Watch mode
```

### Frontend Tests

```bash
bun run test:web            # All web tests (Vitest)
bun run test:web -- --run   # Run once without watch (CI mode)
```

### Shared Package Tests

```bash
bun test packages/shared    # Shared package tests
```

### Coverage

```bash
bun run --filter @staffora/api test:coverage    # API coverage (bun test --coverage)
bun run --filter @staffora/web test:coverage    # Web coverage (vitest --coverage)
```

---

## Test Categories

Tests are organized into six categories under `packages/api/src/test/`:

### Integration Tests (`integration/`)

The largest category, covering database-level integration tests. These test RLS policies, effective dating, idempotency, the outbox pattern, state machines, and full route-level request/response cycles.

Sub-directories:
- `routes/` -- Route-level integration tests for individual modules (HR, absence, time, talent, LMS, cases, onboarding, benefits, documents, recruitment, compliance, GDPR, payroll, and more)
- `multi-tenant/` -- Cross-tenant isolation attack tests
- `workflows/` -- Multi-step workflow tests (e.g., leave approval flow)

### Unit Tests (`unit/`)

Pure unit tests that use mocks instead of real database connections:

- `services/` -- Service-layer business logic (HR, absence, time, talent, LMS, cases, onboarding, benefits, documents, analytics, recruitment, payroll, notifications, workflows)
- `plugins/` -- Elysia plugin tests (audit, auth, cache, db, errors, idempotency, rate-limit, RBAC, security-headers, tenant)
- `repositories/` -- Repository-layer tests (HR, absence, time)
- `jobs/` -- Background worker tests (analytics, export, notification, outbox-processor, pdf-worker, domain-event-handlers)
- `lib/` -- Library utility tests (distributed-lock, pagination, UK holiday pay, UK final pay, UK leave carryover, virus scan)

### End-to-End Tests (`e2e/`)

Full end-to-end flows that exercise the complete request lifecycle:

- `auth-flow.test.ts` -- Authentication flows (sign-up, sign-in, session management)
- `employee-lifecycle.test.ts` -- Employee creation through termination
- `leave-request-flow.test.ts` -- Leave request submission through approval
- `case-management-flow.test.ts` -- Case creation through resolution
- `onboarding-flow.test.ts` -- Onboarding workflow execution
- `multi-tenant-isolation.test.ts` -- Cross-tenant isolation verification
- `ci-smoke.test.ts` -- Lightweight smoke tests for CI (HTTP against live API server)

### Contract Tests (`contract/`)

API contract tests that verify request/response shapes:

- `auth-contract.test.ts` -- Authentication endpoint contracts
- `hr-contract.test.ts` -- HR module endpoint contracts
- `absence-contract.test.ts` -- Absence module endpoint contracts

### Security Tests (`security/`)

Security-focused tests validating OWASP mitigations:

- `authentication.test.ts` -- Authentication bypass attempts
- `authorization-bypass.test.ts` -- Authorization circumvention attempts
- `csrf-protection.test.ts` -- CSRF token validation
- `injection-attacks.test.ts` -- General injection attacks
- `sql-injection.test.ts` -- SQL injection prevention
- `xss-prevention.test.ts` -- XSS prevention
- `input-validation.test.ts` -- Input validation edge cases
- `rate-limiting.test.ts` -- Rate limiting enforcement

### Performance Tests (`performance/`)

Performance benchmarks and load tests:

- `query-performance.test.ts` -- Database query performance benchmarks
- `query-performance.enhanced.test.ts` -- Enhanced query benchmarks
- `concurrent-access.test.ts` -- Concurrent access patterns
- `cache-performance.test.ts` -- Cache hit/miss performance
- `large-dataset.test.ts` -- Large dataset handling

### Chaos Tests (`chaos/`)

Resilience tests for failure scenarios:

- `database-failures.test.ts` -- Database connection loss and recovery
- `connection-failures.test.ts` -- Network connection failures
- `data-integrity.test.ts` -- Data integrity under adverse conditions

---

## Test Setup and Helpers

File: `packages/api/src/test/setup.ts`

### Core Functions

| Function | Description |
|----------|-------------|
| `ensureTestInfra()` | Initialize test infrastructure (verify DB and Redis connectivity, bootstrap roles) |
| `isInfraAvailable()` | Check if infrastructure is ready |
| `skipIfNoInfra()` | Skip helper for tests that require infrastructure |
| `getTestDb()` | Get a postgres.js database connection configured for tests |
| `getTestRedis()` | Get an ioredis client configured for tests |
| `closeTestConnections(db?, redis?)` | Close database and Redis connections |

### Fixture Functions

| Function | Description |
|----------|-------------|
| `createTestTenant(db, overrides?)` | Create a tenant record via `withSystemContext` |
| `createTestUser(db, tenantId, overrides?)` | Create a user with `super_admin` role assignment |
| `createTestContext()` | Create a complete test context (DB, Redis, tenant, user, cleanup function) |

### Context Functions

| Function | Description |
|----------|-------------|
| `setTenantContext(db, tenantId, userId?)` | Set RLS context at session level for subsequent queries |
| `clearTenantContext(db)` | Reset RLS context to a nil UUID (prevents cast errors) |
| `withSystemContext(db, fn)` | Execute a function with RLS bypassed (for setup/teardown) |
| `withTestTransaction(db, fn)` | Run a function in a transaction that gets rolled back |

### Cleanup Functions

| Function | Description |
|----------|-------------|
| `cleanupTestTenant(db, tenantId)` | Delete tenant and related records |
| `cleanupTestUser(db, userId)` | Delete user and related records |

### Assertion Helpers

| Function | Description |
|----------|-------------|
| `expectRlsError(fn)` | Assert that a query throws an RLS violation error |
| `assertRlsViolation(fn)` | Alias for `expectRlsError` |
| `assertDefined(value, message?)` | Assert a value is not null or undefined |

### Database Connection Details

The test database connection is configured with:
- `max: 1` -- Single connection per test file to keep `set_config()` tenant/user context stable across queries
- `connection.search_path: "app,public"` -- Matches production so bare table names resolve correctly
- `idle_timeout: 20` -- Connections are cleaned up promptly
- `connect_timeout: 10` -- Fast failure on connection issues

---

## Test Data Factories

File: `packages/api/src/test/helpers/factories.ts`

Factories generate realistic test data using `@faker-js/faker`. Each factory returns a typed data object with sensible defaults that can be overridden.

### Available Factories

| Factory | Parameters | Key Fields |
|---------|------------|------------|
| `factories.tenant(overrides?)` | -- | id, name, slug, status |
| `factories.user(tenantId, overrides?)` | tenantId | id, email, tenantId, status, emailVerified |
| `factories.employee(tenantId, overrides?)` | tenantId | id, tenantId, employeeNumber, status, hireDate |
| `factories.employeePersonal(tenantId, employeeId, overrides?)` | tenantId, employeeId | id, firstName, lastName, effectiveFrom, dateOfBirth |
| `factories.orgUnit(tenantId, overrides?)` | tenantId | id, code, name, level, isActive, effectiveFrom |
| `factories.position(tenantId, orgUnitId?, overrides?)` | tenantId | id, code, title, jobGrade, minSalary, maxSalary, currency (GBP) |
| `factories.leaveType(tenantId, overrides?)` | tenantId | id, code, name, defaultDays, carryOverDays |
| `factories.leaveRequest(tenantId, employeeId, leaveTypeId, overrides?)` | tenantId, employeeId, leaveTypeId | id, startDate, endDate, status, requestedDays |
| `factories.leaveBalance(tenantId, employeeId, leaveTypeId, overrides?)` | tenantId, employeeId, leaveTypeId | id, year, entitled, used, pending, carriedOver |
| `factories.timeEvent(tenantId, employeeId, overrides?)` | tenantId, employeeId | id, eventType, timestamp, source, latitude, longitude |
| `factories.timesheet(tenantId, employeeId, overrides?)` | tenantId, employeeId | id, periodStart, periodEnd, status, totalHours |
| `factories.role(tenantId, overrides?)` | tenantId (nullable) | id, name, description, isSystem |
| `factories.permission(overrides?)` | -- | id, resource, action, permissionKey |
| `factories.session(userId, overrides?)` | userId | id, token, expiresAt, ipAddress |

### Bulk Generation

```typescript
import { generateMany, generateSeedData } from "../helpers/factories";

// Generate an array of 50 employees
const employees = generateMany(() => factories.employee(tenantId), 50);

// Generate a complete seed dataset for performance testing
const data = await generateSeedData({
  tenants: 3,
  employeesPerTenant: 100,
  leaveRequestsPerEmployee: 5,
  timeEventsPerEmployee: 20,
});
```

---

## Test API Client

File: `packages/api/src/test/helpers/api-client.ts`

The `TestApiClient` class provides a fully-featured HTTP client for integration testing. It sends requests through Elysia's `app.handle()` method for in-process testing (no actual HTTP server needed).

### Features

- Authenticated sessions via real Better Auth sign-in
- Automatic `X-Tenant-ID` header injection
- Automatic `Idempotency-Key` generation for mutations
- Automatic CSRF token generation for mutations
- Cookie jar that accumulates `Set-Cookie` headers across requests
- Typed JSON response parsing

### Creating a Client

```typescript
// Preferred: Authenticated client with real Better Auth session
const client = await TestApiClient.authenticated(app, {
  db,
  tenantId: tenant.id,
  userId: user.id,
  userEmail: user.email,
});

// Convenience wrapper
const client = await createAuthenticatedClient(app, db, tenant, user);

// Unauthenticated client (for 401 tests)
const anonClient = TestApiClient.unauthenticated(app, {
  tenantId: tenant.id,
});
```

### Making Requests

```typescript
// GET
const res = await client.get("/api/v1/hr/employees");

// POST with body
const createRes = await client.post("/api/v1/hr/org-units", {
  code: "ENG",
  name: "Engineering",
  effective_from: "2025-01-01",
});

// PUT, PATCH, DELETE
await client.put("/api/v1/hr/employees/123", { status: "active" });
await client.patch("/api/v1/hr/employees/123", { preferred_name: "Alex" });
await client.delete("/api/v1/hr/employees/123");
```

### Request Options

```typescript
const res = await client.get("/api/v1/hr/employees", {
  query: { status: "active", limit: 10 },
  headers: { "X-Custom": "value" },
  tenantId: "other-tenant-id",     // Override tenant for this request
  skipIdempotencyKey: true,         // Omit Idempotency-Key header
  skipCsrf: true,                   // Omit X-CSRF-Token header
  skipAuth: true,                   // Omit session cookie
  skipTenantHeader: true,           // Omit X-Tenant-ID header
  idempotencyKey: "my-custom-key",  // Provide specific key
});
```

### Response Assertions

```typescript
import {
  expectSuccess,
  expectError,
  expectPaginated,
  expectStatus,
  assertSuccess,
  assertError,
  assertPaginated,
} from "../helpers/api-client";

// Assert 2xx response
expectSuccess(res);

// Assert error with specific code and status
expectError(res, "EMPLOYEE_NOT_FOUND", 404);

// Assert paginated response
const { items, hasMore, nextCursor } = expectPaginated(res);

// Assert specific status code
expectStatus(res, 201);
```

### Cleanup

Always clean up the client after tests:

```typescript
afterAll(async () => {
  await client.cleanup();
});
```

---

## Custom Assertions

File: `packages/api/src/test/helpers/assertions.ts`

### Response Assertions

| Function | Description |
|----------|-------------|
| `assertStatus(response, expected)` | Assert HTTP status code |
| `assertSuccessResponse(response)` | Assert 2xx status |
| `assertErrorResponse(response, status, code?)` | Assert error with status and optional code |
| `assertErrorMessage(response, message)` | Assert error message contains string or matches regex |

### Data Assertions

| Function | Description |
|----------|-------------|
| `assertHasProperties(obj, properties)` | Assert object has required properties |
| `assertMatchesShape(actual, expected)` | Assert object matches expected subset |
| `assertArrayLength(arr, length)` | Assert array has specific length |
| `assertArrayContains(arr, predicate)` | Assert array contains item matching predicate |
| `assertArraySortedBy(arr, property, direction?)` | Assert array is sorted by property |

### Date/Time Assertions

| Function | Description |
|----------|-------------|
| `assertDateInRange(date, start, end)` | Assert date is within range |
| `assertDateInPast(date)` | Assert date is in the past |
| `assertDateInFuture(date)` | Assert date is in the future |
| `assertSameDay(date1, date2)` | Assert two dates are on the same day |

### State Machine Assertions

| Function | Description |
|----------|-------------|
| `assertValidStatusTransition(from, to, transitions)` | Assert valid state transition |
| `assertInvalidStatusTransitionThrows(fn, code?)` | Assert invalid transition throws |

### RLS/Security Assertions

| Function | Description |
|----------|-------------|
| `assertRlsViolation(fn)` | Assert query throws RLS violation |
| `assertCrossTenantAccessDenied(fn)` | Assert cross-tenant access is denied (returns null/empty or RLS error) |
| `assertHasPermission(permissions, permission)` | Assert user has permission |
| `assertLacksPermission(permissions, permission)` | Assert user lacks permission |

### Domain Event Assertions

| Function | Description |
|----------|-------------|
| `assertEventEmitted(events, type, aggregate?, id?)` | Assert event was emitted |
| `assertEventNotEmitted(events, type)` | Assert event was NOT emitted |
| `assertEventPayload(events, type, expected)` | Assert event payload matches shape |

### Audit Log Assertions

| Function | Description |
|----------|-------------|
| `assertAuditLogExists(logs, action, type?, id?)` | Assert audit log entry exists |
| `assertAuditLogCapturesChange(log, field, oldVal, newVal)` | Assert audit captures before/after values |

### Performance Assertions

| Function | Description |
|----------|-------------|
| `assertCompletesWithin(fn, maxMs)` | Assert operation completes within time limit |
| `assertIdempotent(fn, compareFn?)` | Assert idempotent operation returns same result |

### Utility Assertions

| Function | Description |
|----------|-------------|
| `assertValidUuid(value)` | Assert value is a valid UUID |
| `assertDefined(value, message?)` | Assert value is not null/undefined |
| `assertNullish(value, message?)` | Assert value is null or undefined |

---

## Mock Utilities

File: `packages/api/src/test/helpers/mocks.ts`

Mocks are used by unit tests to avoid real database and Redis connections.

### Infrastructure Mocks

| Factory | Returns | Key Methods |
|---------|---------|-------------|
| `createMockDatabaseClient()` | `MockDatabaseClient` | `query`, `begin`, `end` |
| `createMockTransaction()` | Mock transaction | `query`, `savepoint`, `rollback` |
| `createMockCacheClient()` | `MockCacheClient` (Map-backed) | `get`, `set`, `delete`, `exists`, `expire`, `keys`, `flushPattern` |
| `createMockRedisClient()` | `MockRedisClient` (Map-backed) | `get`, `set`, `del`, `exists`, `xadd`, `xread`, `xack`, `pipeline`, `disconnect` |

### Service Mocks

| Factory | Returns | Key Methods |
|---------|---------|-------------|
| `createMockAuditService()` | `MockAuditService` | `log`, `query` |
| `createMockEmailService()` | `MockEmailService` | `send`, `sendTemplate` |
| `createMockNotificationService()` | `MockNotificationService` | `send`, `sendBatch`, `markAsRead` |

### Repository Mocks

| Factory | Returns | Key Methods |
|---------|---------|-------------|
| `createMockHRRepository()` | Mock HR repo (Map-backed) | `findEmployeeById`, `createEmployee`, `findOrgUnits`, `createPosition`, `_clear` |
| `createMockAbsenceRepository()` | Mock absence repo (Map-backed) | `findLeaveRequests`, `createLeaveRequest`, `updateLeaveRequestStatus`, `getLeaveBalance` |
| `createMockTimeRepository()` | Mock time repo (Map-backed) | `findTimeEvents`, `createTimeEvent`, `findTimesheets`, `createTimesheet` |

### Event/Outbox Mocks

| Factory | Returns | Key Methods |
|---------|---------|-------------|
| `createMockOutbox()` | Mock outbox | `emit`, `getEvents`, `getEventsByType`, `getEventsByAggregate`, `clear` |

### Context Mocks

| Factory | Returns | Key Fields |
|---------|---------|------------|
| `createMockRequestContext(overrides?)` | Request context | `tenantId`, `userId`, `sessionId`, `ipAddress`, `requestId` |
| `createMockTenantContext(tenantId?, userId?)` | Tenant context | `tenantId`, `userId` |

---

## Writing Integration Tests

Integration tests verify database-level behavior with real PostgreSQL and Redis. Here is the standard pattern:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import {
  getTestDb,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../setup";

describe("Feature Name", () => {
  let db: ReturnType<typeof getTestDb>;
  let tenant: TestTenant;
  let user: TestUser;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenant = await createTestTenant(db);
    user = await createTestUser(db, tenant.id);
  });

  afterAll(async () => {
    if (!db) return;
    await cleanupTestUser(db, user.id);
    await cleanupTestTenant(db, tenant.id);
    await closeTestConnections(db);
  });

  beforeEach(async () => {
    if (!db) return;
    await setTenantContext(db, tenant.id, user.id);
  });

  afterEach(async () => {
    if (!db) return;
    await clearTenantContext(db);
  });

  it("should create a record within tenant context", async () => {
    if (!db) return;

    const [record] = await db`
      INSERT INTO app.some_table (tenant_id, name)
      VALUES (${tenant.id}::uuid, 'Test Record')
      RETURNING *
    `;

    expect(record).toBeDefined();
    expect(record.name).toBe("Test Record");
  });
});
```

### What Integration Tests Must Verify

Every integration test should cover the following concerns where applicable:

1. **RLS isolation** -- Create two tenants, verify that tenant A cannot see tenant B's data
2. **Effective-date overlap validation** -- Verify that overlapping date ranges are rejected (including concurrency)
3. **Idempotency** -- Verify that duplicate writes with the same idempotency key return the same result
4. **Outbox atomicity** -- Verify that domain events in `domain_outbox` are written in the same transaction as business writes
5. **State machine transitions** -- Verify that only valid state transitions are allowed

---

## Writing Unit Tests

Unit tests use mocks and do not require database or Redis. Import mocks from `../helpers/mocks`:

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { createMockDatabaseClient, createMockCacheClient } from "../helpers/mocks";

describe("SomeService", () => {
  let mockDb: ReturnType<typeof createMockDatabaseClient>;
  let mockCache: ReturnType<typeof createMockCacheClient>;

  beforeEach(() => {
    mockDb = createMockDatabaseClient();
    mockCache = createMockCacheClient();
  });

  it("should process data correctly", async () => {
    mockDb.query.mockReturnValueOnce([{ id: "1", name: "Test" }]);
    // ... test service logic
  });
});
```

---

## Writing Frontend Tests

Frontend tests use Vitest with jsdom and live in `packages/web/app/`:

- `__tests__/` directories alongside components/hooks/routes
- `lib/__tests__/` for utility tests

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "~/components/ui/Button";

describe("Button", () => {
  it("renders with correct text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeDefined();
  });
});
```

---

## Coverage Requirements

Coverage gates are enforced in CI via the `test.yml` workflow:

| Package | Minimum Line Coverage | Tool |
|---------|-----------------------|------|
| `@staffora/api` | 20% | `bun test --coverage` (lcov) |
| `@staffora/web` | 50% | `vitest --coverage` (lcov) |

Coverage reports are uploaded as GitHub Actions artifacts and retained for 14 days. The coverage threshold will be increased as test coverage improves.
