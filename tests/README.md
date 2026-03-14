# Staffora Test Suite

Comprehensive automated testing suite for the Staffora HRIS platform.

## Quick Start

```bash
# Prerequisites: Docker containers must be running
bun run docker:up && bun run migrate:up

# Run all tests
bun run test

# Run by package
bun run test:api         # Backend tests (bun test)
bun run test:web         # Frontend tests (vitest)
bun test packages/shared # Shared package tests (bun test)
```

## Test Architecture

### Overview

| Package | Framework | Test Files | Lines of Code |
|---------|-----------|------------|---------------|
| @staffora/api | bun test | 92 | ~47,000 |
| @staffora/web | vitest | 30 | ~7,100 |
| @staffora/shared | bun test | 12 | ~6,100 |
| **Total** | | **134** | **~60,200** |

### Test Categories

#### Unit Tests (`packages/api/src/test/unit/`)
Tests individual functions, classes, and modules in isolation.

- **Services** (14 files): HR, Absence, Time, Cases, Talent, LMS, Onboarding, Benefits, Documents, Recruitment, Workflows, Analytics, Dashboard
- **Plugins** (10 files): Auth, Tenant, RBAC, Cache, Rate-Limit, Idempotency, Audit, Errors, Security-Headers, DB
- **Jobs** (7 files): Base worker, Outbox processor, Notification, Export, PDF, Analytics, Domain event handlers
- **Repositories** (3 files): HR, Absence, Time

#### Integration Tests (`packages/api/src/test/integration/`)
Tests interactions between components against real PostgreSQL + Redis.

- **RLS isolation**: `rls.test.ts`, `rls-comprehensive.test.ts`, `rls-coverage.test.ts`
- **Multi-tenant**: `multi-tenant/cross-tenant-attacks.test.ts`
- **Idempotency**: `idempotency.test.ts`, `idempotency-replay.test.ts`
- **Outbox**: `outbox.test.ts`
- **Effective dating**: `effective-dating.test.ts`, `effective-dating-enhanced.test.ts`
- **State machines**: `state-machine.test.ts`
- **Transactions**: `transaction-rollback.test.ts`
- **Constraints**: `constraint-validation.test.ts`
- **Migrations**: `migration-validation.test.ts`
- **Routes** (14 files): HR, Absence, Time, Cases, Benefits, Documents, Analytics, Competencies, Recruitment, Security, Succession, Portal, LMS, Onboarding

#### E2E Tests (`packages/api/src/test/e2e/`)
End-to-end business flows through the full stack.

- `employee-lifecycle.test.ts` - Hire to termination
- `leave-request-flow.test.ts` - Request, approve, balance tracking
- `case-management-flow.test.ts` - Case creation through resolution
- `onboarding-flow.test.ts` - Template to completion
- `multi-tenant-isolation.test.ts` - Full tenant isolation verification

#### Security Tests (`packages/api/src/test/security/`)
Vulnerability detection and prevention.

- `sql-injection.test.ts` - SQL injection via parameterized queries
- `xss-prevention.test.ts` - XSS prevention and security headers
- `authorization-bypass.test.ts` - IDOR, privilege escalation, tenant isolation
- `input-validation.test.ts` - Unicode, null bytes, path traversal, overflow
- `csrf-protection.test.ts` - CORS, SameSite, custom headers
- `rate-limiting.test.ts` - Rate limit enforcement
- `authentication.test.ts` - Auth bypass, session handling
- `injection-attacks.test.ts` - Redis, command, header injection

#### Performance Tests (`packages/api/src/test/performance/`)
Benchmarks and load testing.

- `query-performance.enhanced.test.ts` - Query benchmarks with timing thresholds
- `concurrent-access.test.ts` - Parallel reads/writes, connection pools
- `large-dataset.test.ts` - Bulk operations, pagination at scale
- `cache-performance.test.ts` - Redis latency, hit ratios, pipelines

#### Chaos Tests (`packages/api/src/test/chaos/`)
Failure scenario testing.

- `connection-failures.test.ts` - DB/Redis connection failures, recovery
- `data-integrity.test.ts` - Partial failure rollback, constraint enforcement

#### Frontend Tests (`packages/web/app/__tests__/`)
React component and hook tests with React Testing Library.

- **Components** (14 files): Button, Input, Modal, Badge, Card, Alert, Avatar, Tabs, SearchInput, Spinner, Skeleton, Table, Toast + layouts
- **Hooks** (3 files): use-permissions, use-tenant, use-manager
- **Routes** (2 files): Dashboard, Login
- **Utilities** (6 files): api-client, auth-client, theme, hydration, utils, query-client

#### Shared Package Tests (`packages/shared/src/__tests__/`)
Pure logic tests (no infrastructure needed).

- **State Machines** (5 files): Employee lifecycle, Leave request, Case, Performance cycle, Workflow
- **Utilities** (4 files): Dates, Crypto, Validation, Effective dating
- **Errors** (1 file): Error codes and messages
- **Constants** (1 file): All exported constants
- **Schemas** (1 file): TypeBox schema validation

## Running Tests

### Individual test categories

```bash
# Unit tests
bun test packages/api/src/test/unit/

# Integration tests
bun test packages/api/src/test/integration/

# E2E tests
bun test packages/api/src/test/e2e/

# Security tests
bun test packages/api/src/test/security/

# Performance tests
bun test packages/api/src/test/performance/

# Chaos tests
bun test packages/api/src/test/chaos/

# Single file
bun test packages/api/src/test/integration/rls.test.ts

# Pattern matching
bun test --test-name-pattern "leave request"

# Watch mode
bun test --watch packages/api/src/test/unit/

# Frontend with coverage
bun run test:web -- --run --coverage
```

### Coverage

```bash
# API coverage
bun test packages/api/src/test --coverage

# Frontend coverage (generates HTML report)
bun run test:web -- --run --coverage
# Report at: packages/web/coverage/index.html
```

## Adding New Tests

### Backend test pattern

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ensureTestInfra,
  skipIfNoInfra,
  getTestDb,
  createTestTenant,
  createTestUser,
  setTenantContext,
  withSystemContext,
  closeTestConnections,
  cleanupTestTenant,
  cleanupTestUser,
} from "../setup";

describe("Feature", () => {
  let db: ReturnType<typeof import("postgres")["default"]>;
  let tenant: { id: string };
  let user: { id: string };

  beforeAll(async () => {
    await ensureTestInfra();
    if (skipIfNoInfra()) return;
    db = getTestDb();
    tenant = await createTestTenant(db);
    user = await createTestUser(db, tenant.id);
    await setTenantContext(db, tenant.id, user.id);
  });

  afterAll(async () => {
    if (db) {
      await cleanupTestUser(db, user.id);
      await cleanupTestTenant(db, tenant.id);
      await closeTestConnections(db);
    }
  });

  test("should do something", async () => {
    if (!db) return;
    // Test with real database
  });
});
```

### Frontend test pattern

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MyComponent } from "~/components/MyComponent";

describe("MyComponent", () => {
  it("renders correctly", () => {
    render(<MyComponent label="Test" />);
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("handles click", async () => {
    const onClick = vi.fn();
    render(<MyComponent onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

## Test Infrastructure

### Prerequisites
- Docker (PostgreSQL 16 + Redis 7)
- Bun runtime
- Migrations applied (`bun run migrate:up`)

### Database Roles
- `hris` - Superuser for migrations and test setup
- `hris_app` - Application role with `NOBYPASSRLS` (used in tests to enforce RLS)

### Key Test Utilities (`packages/api/src/test/setup.ts`)
- `ensureTestInfra()` - Initialize test infrastructure (auto-starts Docker if needed)
- `skipIfNoInfra()` - Skip gracefully when infrastructure unavailable
- `getTestDb()` / `getTestRedis()` - Get test connections
- `createTestTenant()` / `createTestUser()` - Create test fixtures
- `setTenantContext()` - Set RLS context for queries
- `withSystemContext()` - Bypass RLS for admin operations
- `withTestTransaction()` - Run in a transaction that rolls back

### Data Factories (`packages/api/src/test/helpers/factories.ts`)
Pre-built factories for: Tenant, User, Employee, EmployeePersonal, OrgUnit, Position, LeaveType, LeaveRequest, LeaveBalance, TimeEvent, Timesheet, Role, Permission, Session.

## CI Integration

Tests run automatically on push/PR to main via GitHub Actions (`.github/workflows/test.yml`):
- PostgreSQL 16 and Redis 7 service containers
- Migrations applied before tests
- API tests, shared package tests, and frontend tests with coverage
- Coverage artifacts uploaded for review

## Conventions

1. **Real assertions** - Tests verify actual database state, not mock expectations
2. **RLS enforcement** - Tests connect as `hris_app` (non-superuser) so RLS is enforced
3. **Cleanup** - All test data cleaned up in `afterAll` using `withSystemContext`
4. **Infrastructure skip** - Tests gracefully skip when Docker is unavailable
5. **No hollow tests** - Every test must assert meaningful behavior
6. **Outbox verification** - Mutation tests verify domain events in `domain_outbox`
7. **Cross-tenant isolation** - Integration tests verify RLS blocks cross-tenant access
