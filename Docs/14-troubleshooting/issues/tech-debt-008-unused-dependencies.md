# [TECH-DEBT] Unused Dependencies Bloating Packages

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** MEDIUM
**Labels:** tech-debt
**Effort:** SMALL

## Description
Several dependencies are installed but unused or redundant:
- `pg` and `@types/pg` in the API package are used only for Better Auth's Pool adapter (1 import)
- `otpauth` in the API may be redundant if Better Auth handles TOTP internally

## Current State
- `packages/api/package.json`: `pg: ^8.16.3` and `@types/pg: ^8.16.0` -- 1 import site
- `packages/api/package.json`: `otpauth: ^9.3.5` -- verify if used in production

Note: The `@better-auth/infra` issue in the Website package is now obsolete -- the Website directory has been moved to a separate repository.

## Expected State
- Unused dependencies removed
- `pg` eliminated (see dual PostgreSQL driver issue)
- Only actively used dependencies in each package

## Acceptance Criteria
- [ ] `otpauth` verified as necessary or removed
- [ ] `bun install` runs cleanly after removals
- [ ] All tests pass after dependency cleanup

## Implementation Notes
Run a search for imports of each dependency to verify usage. Remove from `package.json` and run `bun install --frozen-lockfile` to verify no breakage.

## Affected Files
- `packages/api/package.json`
- `bun.lock`

## Related Issues
- tech-debt-002-dual-postgresql-drivers
