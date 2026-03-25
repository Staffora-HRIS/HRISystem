# [TECH-DEBT] 11 of 17 Services Lack Error Handling

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** HIGH
**Labels:** tech-debt, bug
**Effort:** MEDIUM

## Description
Only 6 of 17 service files use try/catch for error handling. The remaining 11 services have zero catch blocks: analytics, benefits, competencies, documents, hr, portal, recruitment, security, succession, tenant, and workflows. These services rely entirely on the global error handler in `errorsPlugin`, meaning they cannot return structured `ServiceResult` error objects for business-logic failures -- they just throw unstructured errors.

## Current State
Services with error handling:
- `time/service.ts`: 18 catch blocks
- `absence/service.ts`: 15 catch blocks
- `talent/service.ts`: 8 catch blocks
- `cases/service.ts`: 7 catch blocks
- `onboarding/service.ts`: 6 catch blocks
- `lms/service.ts`: 4 catch blocks

Services with NO error handling (0 catch blocks):
- `analytics/service.ts`, `benefits/service.ts`, `competencies/service.ts`, `documents/service.ts`, `hr/service.ts`, `portal/service.ts`, `recruitment/service.ts`, `security/service.ts`, `succession/service.ts`, `tenant/service.ts`, `workflows/service.ts`

## Expected State
- All services use try/catch with structured `ServiceResult` error objects
- Database errors caught and mapped to appropriate error codes
- Business logic validation errors returned as structured responses
- Consistent error handling pattern across all modules

## Acceptance Criteria
- [ ] All 11 services without error handling have try/catch blocks
- [ ] Database errors mapped to appropriate error codes from `@staffora/shared/errors`
- [ ] Business logic validation returns `ServiceResult` error objects
- [ ] No uncaught promise rejections from service methods
- [ ] Error handling pattern documented and consistent

## Implementation Notes
Priority order: `hr/service.ts` (gold standard module, most impactful), `benefits/service.ts`, `workflows/service.ts`. Wrap database operations in try/catch blocks. Return `{ success: false, error: { code, message } }` for business logic failures.

## Affected Files
- `packages/api/src/modules/analytics/service.ts`
- `packages/api/src/modules/benefits/service.ts`
- `packages/api/src/modules/competencies/service.ts`
- `packages/api/src/modules/documents/service.ts`
- `packages/api/src/modules/hr/service.ts`
- `packages/api/src/modules/portal/service.ts`
- `packages/api/src/modules/recruitment/service.ts`
- `packages/api/src/modules/security/service.ts`
- `packages/api/src/modules/succession/service.ts`
- `packages/api/src/modules/tenant/service.ts`
- `packages/api/src/modules/workflows/service.ts`

## Related Issues
- tech-debt-001-shared-package-unused
