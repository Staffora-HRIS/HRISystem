# [TECH-DEBT] Dependency Version Mismatches Across Packages

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** HIGH
**Labels:** tech-debt, bug
**Effort:** SMALL

## Description
Multiple critical dependencies have version mismatches across packages that can cause subtle bugs and compatibility issues:
- `@sinclair/typebox`: API uses `^0.34.11` vs shared uses `^0.32.0` (breaking API changes between versions)
- `better-auth`: API uses `^1.5.4` vs web uses `^1.4.10` (client/server version drift)
- `vitest` vs `@vitest/coverage-v8`: vitest at `^2.1.8` vs coverage at `^4.1.0` (major version mismatch, incompatible)

## Current State
- `packages/api/package.json`: `@sinclair/typebox: ^0.34.11`, `better-auth: ^1.5.4`
- `packages/shared/package.json`: `@sinclair/typebox: ^0.32.0`
- `packages/web/package.json`: `better-auth: ^1.4.10`, `vitest: ^2.1.8`, `@vitest/coverage-v8: ^4.1.0`

## Expected State
- All packages use the same versions of shared dependencies
- vitest and coverage plugin at matching major versions
- better-auth client and server at the same version

## Acceptance Criteria
- [ ] `@sinclair/typebox` aligned to `^0.34.x` in all packages
- [ ] `better-auth` aligned to `^1.5.4` in all packages
- [ ] `vitest` and `@vitest/coverage-v8` at matching major versions
- [ ] `bun install` runs without warnings
- [ ] All tests pass after version alignment

## Implementation Notes
Update `packages/shared/package.json` to use `@sinclair/typebox: ^0.34.11`. Update `packages/web/package.json` to use `better-auth: ^1.5.4` and align vitest versions. Run `bun install` and verify all tests pass. Check for breaking API changes in TypeBox 0.32 -> 0.34.

## Affected Files
- `packages/shared/package.json`
- `packages/web/package.json`
- `bun.lock`

## Related Issues
- None
