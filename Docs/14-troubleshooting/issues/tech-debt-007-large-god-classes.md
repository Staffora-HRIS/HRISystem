# [TECH-DEBT] HR Service and Repository Are God Classes (2,159 and 1,766 Lines)

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** MEDIUM
**Labels:** tech-debt
**Effort:** LARGE

## Description
The HR module's service and repository files are excessively large, making them difficult to maintain, test, and reason about. `hr/service.ts` is 2,159 lines and `hr/repository.ts` is 1,766 lines. Several other files exceed 500 lines including `benefits/routes.ts` (1,641 lines) and `pdf-worker.ts` (1,382 lines). 14 frontend route files also exceed 500 lines.

## Current State
Backend files over 1,000 lines:
- `packages/api/src/modules/hr/service.ts`: 2,159 lines
- `packages/api/src/modules/hr/repository.ts`: 1,766 lines
- `packages/api/src/modules/benefits/routes.ts`: 1,641 lines
- `packages/api/src/modules/hr/routes.ts`: 1,410 lines
- `packages/api/src/jobs/pdf-worker.ts`: 1,382 lines
- `packages/api/src/modules/benefits/service.ts`: 1,311 lines
- `packages/api/src/modules/benefits/repository.ts`: 1,110 lines

## Expected State
- No file exceeds 800 lines
- HR service split into sub-services: employee, org-unit, position
- HR repository split into matching sub-repositories
- Benefits routes split into carrier, plan, enrollment, life-event groups

## Acceptance Criteria
- [ ] `hr/service.ts` split into `employee.service.ts`, `org-unit.service.ts`, `position.service.ts`
- [ ] `hr/repository.ts` split into matching repository files
- [ ] `benefits/routes.ts` split into route group files
- [ ] No production file exceeds 1,000 lines
- [ ] All existing tests pass after refactoring

## Implementation Notes
Start with the HR module as it is the gold standard. Extract methods by domain (employee operations, org unit operations, position operations). Maintain the same public API to avoid breaking route handlers. Use barrel exports from an `index.ts` file.

## Affected Files
- `packages/api/src/modules/hr/service.ts`
- `packages/api/src/modules/hr/repository.ts`
- `packages/api/src/modules/benefits/routes.ts`

## Related Issues
- None
