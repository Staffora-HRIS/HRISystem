# [TECH-DEBT] N+1 Query Patterns in Loop-Based Inserts

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** MEDIUM
**Labels:** tech-debt, performance
**Effort:** MEDIUM

## Description
Multiple repositories execute INSERT queries inside loops within transactions, generating N separate SQL statements where a single batch insert would be more efficient. While these run within transactions, each generates a separate roundtrip to the database.

## Current State
- `packages/api/src/modules/onboarding/repository.ts` (lines 149-163): template tasks inserted one at a time in for loop
- `packages/api/src/modules/time/repository.ts` (lines 543-545): timesheet lines inserted one at a time
- `packages/api/src/modules/lms/repository.ts` (lines 526-527): learning path courses inserted one at a time

## Expected State
- Batch INSERT with VALUES lists or `unnest()` for multi-row inserts
- Single SQL statement per batch operation

## Acceptance Criteria
- [ ] Loop-based inserts refactored to batch INSERT statements
- [ ] Performance test verifying improvement for 50+ row inserts
- [ ] All existing tests pass after refactoring

## Implementation Notes
Use postgres.js tagged template batch insert pattern: `tx\`INSERT INTO table ${sql(rows)}\`` or construct VALUES lists. For the onboarding repository, all template tasks can be inserted in a single statement.

## Affected Files
- `packages/api/src/modules/onboarding/repository.ts`
- `packages/api/src/modules/time/repository.ts`
- `packages/api/src/modules/lms/repository.ts`

## Related Issues
- tech-debt-005-select-star-usage
