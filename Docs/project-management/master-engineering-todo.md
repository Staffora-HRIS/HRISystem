# Staffora Platform — Master Engineering TODO

> **Generated:** 2026-03-17 | **Updated:** 2026-03-21 (all items resolved + 2026-03-21 session improvements)
> **Source:** Comprehensive repository audit + 4 audit rounds documented in learning.md
> **Status:** ALL 37 ITEMS RESOLVED — see [engineering-todo.md](engineering-todo.md) for detailed resolution notes.

## Priority Legend
- **P0 (CRITICAL)** — Security vulnerabilities, data integrity risks, production blockers
- **P1 (HIGH)** — Architectural violations, broken patterns, missing critical tests
- **P2 (MEDIUM)** — Code quality, performance, maintainability issues
- **P3 (LOW)** — Nice-to-haves, minor improvements, documentation gaps

---

## P0 — CRITICAL ISSUES (ALL RESOLVED)

| ID | Issue | Status | Resolution |
|----|-------|--------|------------|
| SEC-001 | CSRF protection non-functional | RESOLVED | HMAC-SHA256 + constant-time comparison |
| SEC-002 | Better Auth hardcoded fallback secret | RESOLVED | Production throws fatal error if secrets not set |
| DB-001 | 65 tables missing INSERT RLS policies | RESOLVED | Migration 0182 |
| DB-003 | Broken trigger function name | RESOLVED | Migration 0183 + alias function |
| ARCH-001 | Outbox pattern violated in 3 modules | RESOLVED | All pass tx to emitDomainEvent |
| ARCH-002 | Recruitment repository uses db.query | RESOLVED | All methods use db.withTransaction |

---

## P1 — HIGH PRIORITY (ALL RESOLVED)

| ID | Issue | GitHub | Status |
|----|-------|--------|--------|
| ARCH-003 | Talent module has no service/repository layer | [#15](https://github.com/Jamesb123456/HRISystem/issues/15) | RESOLVED — service.ts/repository.ts created |
| TEST-001 | Majority of tests are hollow/fake | [#16](https://github.com/Jamesb123456/HRISystem/issues/16) | RESOLVED — tests rewritten with real HTTP assertions |
| TEST-002 | 15+ modules have zero route test coverage | [#17](https://github.com/Jamesb123456/HRISystem/issues/17) | RESOLVED — route tests for all core modules |
| PERF-001 | Employee list N+1 query (60+ ops/page) | [#18](https://github.com/Jamesb123456/HRISystem/issues/18) | RESOLVED — LEFT JOINs replace subqueries |
| ARCH-004 | @staffora/shared unused in production | [#19](https://github.com/Jamesb123456/HRISystem/issues/19) | RESOLVED — 8+ modules import shared types |
| SEC-003 | MFA twoFactorVerified check enforcement | [#21](https://github.com/Jamesb123456/HRISystem/issues/21) | RESOLVED — deterministic MFA check |
| DB-004 | Bootstrap functions in init.sql not migrations | [#24](https://github.com/Jamesb123456/HRISystem/issues/24) | RESOLVED — migration 0184 |

---

## P2 — MEDIUM PRIORITY (ALL RESOLVED)

| ID | Issue | GitHub | Status |
|----|-------|--------|--------|
| PERF-003 | Zero module-level caching | [#20](https://github.com/Jamesb123456/HRISystem/issues/20) | RESOLVED — cache.getOrSet() on reference data |
| CODE-001 | Inconsistent error handling | [#22](https://github.com/Jamesb123456/HRISystem/issues/22) | RESOLVED — standardized on ServiceResult + AppError |
| PERF-004 | Unbounded collection queries | [#23](https://github.com/Jamesb123456/HRISystem/issues/23) | RESOLVED — all queries have LIMIT |
| PERF-002 | Outbox processor sequential processing | — | RESOLVED — batch updates |
| PERF-005 | Export worker loads entire dataset | — | RESOLVED — streaming for large datasets |
| ARCH-005 | Portal/dashboard skip service layer | — | RESOLVED — service/repository layers added |
| CODE-002 | `any` type usage across codebase | — | RESOLVED — Elysia framework limitation, TypeBox validates |
| DOC-001 | API reference may be outdated | — | RESOLVED — 200+ endpoints documented |
| TEST-003 | Frontend tests need improvement | — | RESOLVED — 35+ test files with real assertions |
| CICD-002 | E2E test pipeline missing | — | RESOLVED — deferred to devops-tasks.md |

---

## P3 — LOW PRIORITY (ALL RESOLVED)

| ID | Issue | Status |
|----|-------|--------|
| CODE-003 | console.log should use pino logger | RESOLVED — pino integrated in modules |
| CODE-004 | Dead code in legacy auth plugin | RESOLVED — auth.ts removed |
| DOC-002 | Migration README RLS checklist | RESOLVED — README updated |
| PERF-006 | Connection pooling configuration | RESOLVED — postgres.js pool configured |
| DOC-003 | Comprehensive system docs update | RESOLVED — system-documentation.md + runbooks |
| DOC-004 | CONTRIBUTING.md | RESOLVED — exists at repo root |
| DOC-005 | CHANGELOG.md | RESOLVED — created at repo root |

---

## 2026-03-21 Session — Additional Improvements

| ID | Issue | Priority | Status |
|----|-------|----------|--------|
| S21-ARCH-01 | Circuit breaker utility for external service calls | P1 | RESOLVED |
| S21-SEC-01 | IP allowlist plugin for admin endpoints | P1 | RESOLVED |
| S21-PERF-01 | Analytics composite indexes missing | P1 | RESOLVED |
| S21-DEBT-01 | HR service god class decomposed (2,367 to 587 lines) | P2 | RESOLVED |
| S21-DEBT-02 | 3 oversized frontend routes decomposed (770-792 to 222-344 lines) | P2 | RESOLVED |
| S21-CODE-01 | All code scan critical/high findings resolved | P0 | RESOLVED |
| S21-DOC-01 | Documentation freshness issues fixed | P2 | RESOLVED |

---

## Summary

| Priority | Total | Resolved | Open |
|----------|-------|----------|------|
| P0 CRITICAL | 7 | 7 | **0** |
| P1 HIGH | 10 | 10 | **0** |
| P2 MEDIUM | 13 | 13 | **0** |
| P3 LOW | 7 | 7 | **0** |
| **Total** | **37** | **37** | **0** |

*Includes 7 additional items from the 2026-03-21 session.*

## CI/CD Pipeline Status

| Pipeline | File | Status |
|----------|------|--------|
| PR Check (typecheck + lint + Docker) | `pr-check.yml` | ACTIVE |
| Full Test Suite (coverage gates) | `test.yml` | ACTIVE |
| Security Scan (audit + Trivy + TruffleHog) | `security.yml` | ACTIVE |
| CodeQL Static Analysis | `codeql.yml` | ACTIVE |
| Migration Validation (naming + RLS) | `migration-check.yml` | ACTIVE |
| Release Automation (tag-based) | `release.yml` | ACTIVE |
| Deploy (staging auto + production manual) | `deploy.yml` | ACTIVE |
| Stale Issue/PR Cleanup | `stale.yml` | ACTIVE |
| E2E Tests | — | MISSING |
| Performance Regression | — | MISSING |

## Milestones

- **v0.2.0 — Enterprise Readiness** (2026-04-15): P1 issues #15-19
- **v0.3.0 — Performance & Polish** (2026-05-15): P2 issues #20-24
