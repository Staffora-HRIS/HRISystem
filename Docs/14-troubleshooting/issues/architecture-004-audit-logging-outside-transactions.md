# [ARCHITECTURE] Audit Logging Uses Separate Transaction from Business Writes

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** HIGH
**Labels:** bug, architecture
**Effort:** MEDIUM

## Description
The `AuditService.log()` method uses `db.withSystemContext()` which opens a new transaction. Audit writes happen in a separate transaction from the business operation they record. If the business write succeeds but the audit write fails (or vice versa), data integrity is violated. The correct `logInTransaction()` method exists but requires callers to explicitly pass a transaction handle, and many routes call `audit.log()` outside the transaction.

## Current State
- `packages/api/src/plugins/audit.ts` (lines 161-182): `log()` uses `db.withSystemContext()` (new transaction)
- `packages/api/src/plugins/audit.ts` (lines 188-216): `logInTransaction()` exists as the correct alternative
- Many route handlers call `audit.log()` after the business operation completes

## Expected State
- All audit writes for mutations use `logInTransaction()` within the same transaction
- `audit.log()` used only for non-transactional events (reads, authentication events)
- Linting rule or code review checklist for audit atomicity

## Acceptance Criteria
- [ ] All mutating route handlers use `logInTransaction()` within the business transaction
- [ ] `audit.log()` documented as only for non-transactional events
- [ ] Audit failure within a transaction causes the business write to roll back
- [ ] Integration test verifies audit atomicity (audit fails -> business write rolls back)

## Implementation Notes
Audit all route handlers that call `audit.log()` after business writes. Refactor to pass the `tx` handle to `logInTransaction()`. Consider adding a wrapper in the service layer that automatically includes audit logging in the transaction.

## Affected Files
- `packages/api/src/plugins/audit.ts`
- All route files in `packages/api/src/modules/*/routes.ts`

## Related Issues
- None
