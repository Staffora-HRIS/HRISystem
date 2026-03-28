# [TECH-DEBT] SELECT * Queries Across Multiple Repositories

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** HIGH
**Labels:** tech-debt, performance
**Effort:** MEDIUM

## Description
28 instances of `SELECT *` found across 9 repository files. This violates the project's own conventions (CLAUDE.md calls out "explicit column SELECTs" as gold standard). SELECT * creates performance risk (fetching unnecessary columns, especially JSONB), fragility risk (schema changes break results silently), and security risk (sensitive columns inadvertently exposed).

## Current State
- `packages/api/src/modules/time/repository.ts`: 9 instances
- `packages/api/src/modules/absence/repository.ts`: 5 instances
- `packages/api/src/modules/talent/repository.ts`: 4 instances
- `packages/api/src/modules/competencies/repository.ts`: 3 instances
- Other repositories: remaining instances
- Total: 28 SELECT * instances across 9 files

## Expected State
- All queries use explicit column lists
- Linting rule prevents future SELECT * usage
- Column lists aligned with actual schema definitions

## Acceptance Criteria
- [ ] All `SELECT *` replaced with explicit column lists in all repository files
- [ ] Column lists verified against actual migration schemas
- [ ] ESLint or grep-based CI rule prevents new `SELECT *` usage
- [ ] No performance regression (explicit columns should improve performance)

## Implementation Notes
Replace SELECT * file by file, starting with the time and absence repositories (highest count). Verify column names against migration SQL. Use the postgres.js column transform (snake_case -> camelCase) to ensure TypeScript properties match.

## Affected Files
- `packages/api/src/modules/time/repository.ts`
- `packages/api/src/modules/absence/repository.ts`
- `packages/api/src/modules/talent/repository.ts`
- `packages/api/src/modules/competencies/repository.ts`
- Other repository files with SELECT *

## Related Issues
- architecture-006-dashboard-inline-sql
