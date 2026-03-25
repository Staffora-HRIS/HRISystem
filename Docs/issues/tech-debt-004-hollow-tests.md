# [TECH-DEBT] Hollow/Fake Tests Providing False Confidence

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** CRITICAL
**Labels:** tech-debt, testing
**Effort:** LARGE

## Description
1 fully hollow E2E test file and 14 service unit test files contain tests that assert local variables or test copied logic rather than actual system behavior. The hollow E2E test (`employee-lifecycle.test.ts`) creates JavaScript objects and asserts their properties -- zero database operations, zero API calls. The 14 service tests extract business logic into local functions within the test file rather than importing the actual service class (worked around a Bun segfault). If service logic drifts from the test copy, tests still pass but coverage is illusory.

## Current State
- `test/e2e/employee-lifecycle.test.ts`: 5 test cases asserting local JS objects, no DB/API interaction
- 14 service unit tests: cases, lms, talent, time, benefits, analytics, dashboard, documents, onboarding, recruitment, workflows, absence (2), hr (2)
- Each service test file has `// NOTE: These tests extract and verify the business logic directly` comment
- Test pattern: re-implements validation logic locally, tests the local copy

## Expected State
- All E2E tests make real database operations or HTTP calls
- Service tests import and test real service classes
- Tests provide genuine regression protection

## Acceptance Criteria
- [ ] `employee-lifecycle.test.ts` rewritten to use real database CRUD and state machine triggers
- [ ] Top 5 service test files converted to test real service classes
- [ ] Remaining service tests have runtime assertions verifying extracted logic matches real service
- [ ] No test file creates local copies of business logic without validation

## Implementation Notes
For E2E: create employees via SQL, execute status transitions, verify history and outbox records in database. For service tests: use the same approach as route tests (instantiate service + repository with real DB adapter). If Bun segfault persists on Windows, run these tests only on Linux/CI.

## Affected Files
- `packages/api/src/test/e2e/employee-lifecycle.test.ts`
- `packages/api/src/test/unit/services/*.test.ts` (14 files)

## Related Issues
- testing-001-route-tests-no-http
- testing-002-service-tests-copied-logic
