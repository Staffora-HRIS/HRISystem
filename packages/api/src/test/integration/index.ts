/**
 * Integration Tests Index
 *
 * This file serves as documentation for the integration test suite.
 * Run tests with: bun test
 *
 * Test categories:
 *
 * 1. RLS (Row-Level Security) Tests - rls.test.ts
 *    - Verifies tenant isolation across all tenant-owned tables
 *    - Tests SELECT, INSERT, UPDATE, DELETE operations
 *    - Ensures cross-tenant access is blocked
 *
 * 2. Effective Dating Tests - effective-dating.test.ts
 *    - Validates no-overlap rule for effective-dated records
 *    - Tests rangesOverlap utility function
 *    - Tests validateNoOverlap utility function
 *    - Verifies concurrent insert handling
 *
 * 3. Idempotency Tests - idempotency.test.ts
 *    - Verifies idempotency key storage and retrieval
 *    - Tests duplicate request detection
 *    - Tests request hash mismatch detection
 *    - Verifies tenant/user/route scoping
 *    - Tests key expiration
 *
 * 4. Outbox Pattern Tests - outbox.test.ts
 *    - Verifies atomic writes (business + outbox in same transaction)
 *    - Tests rollback behavior on failures
 *    - Verifies event structure and metadata
 *    - Tests tenant isolation of outbox events
 *
 * 5. State Machine Tests - state-machine.test.ts
 *    - Validates employee lifecycle transitions
 *    - Tests valid and invalid state changes
 *    - Verifies transition history is recorded
 *    - Tests terminal state enforcement
 *    - Verifies outbox events on transitions
 *
 * Environment Setup:
 * - Requires PostgreSQL with test database
 * - Requires Redis for caching tests
 *
 * Environment Variables:
 * - TEST_DB_HOST (default: localhost)
 * - TEST_DB_PORT (default: 5432)
 * - TEST_DB_NAME (default: hris_test)
 * - TEST_DB_USER (default: postgres)
 * - TEST_DB_PASSWORD (default: postgres)
 * - TEST_REDIS_HOST (default: localhost)
 * - TEST_REDIS_PORT (default: 6379)
 */

export {};
