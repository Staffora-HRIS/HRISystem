# [TECH-DEBT] @staffora/shared Package Unused in Production Code

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** CRITICAL
**Labels:** tech-debt, architecture
**Effort:** LARGE

## Description
`@staffora/shared` is declared as a peer dependency of both `@staffora/api` and `@staffora/web`, yet has zero imports in the frontend (`packages/web/app/`) and zero imports in the API production code (`packages/api/src/modules/`). Only 2 test files import from the shared package. The shared package contains type definitions, error codes, state machines, validation utilities, and schemas -- all duplicated locally in API modules. This represents a massive duplication of effort and makes cross-package consistency impossible to enforce.

## Current State
- 0 imports in `packages/web/app/` (entire frontend)
- 0 imports in `packages/api/src/modules/` (all production API code)
- 2 imports total in test files only
- Types duplicated: `TenantContext` used 681 times across 50 files, defined locally each time
- `ServiceResult<T>` redefined in 7 test files
- Error codes duplicated between shared and API modules
- State machines duplicated between shared and API modules

## Expected State
- All modules import types, error codes, and state machines from `@staffora/shared`
- Single source of truth for cross-package types
- Frontend uses shared error codes for user-facing messages

## Acceptance Criteria
- [ ] `TenantContext` imported from `@staffora/shared` in all API modules
- [ ] `ServiceResult<T>` imported from shared or API types (not redefined in tests)
- [ ] Error codes imported from `@staffora/shared/errors` in API modules
- [ ] State machines imported from `@staffora/shared/state-machines` in API services
- [ ] Frontend uses shared error codes for error message display
- [ ] No duplicate type definitions between shared and API packages

## Implementation Notes
Phase this in module by module. Start with error codes (low risk, high impact), then state machines, then types. Update import paths progressively. Run tests after each module migration.

## Affected Files
- All files in `packages/api/src/modules/`
- All files in `packages/web/app/`
- `packages/shared/src/` (may need exports adjustments)

## Related Issues
- tech-debt-006-services-missing-error-handling
