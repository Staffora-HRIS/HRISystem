# Staffora Platform — Master Engineering TODO

> **Generated:** 2026-03-17 | **Updated:** 2026-03-17 (AI CTO enterprise audit)
> **Source:** Comprehensive repository audit + 4 audit rounds documented in learning.md

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

## P1 — HIGH PRIORITY (Open Issues #15-19)

| ID | Issue | GitHub | Effort | Status |
|----|-------|--------|--------|--------|
| ARCH-003 | Talent module has no service/repository layer | [#15](https://github.com/Jamesb123456/HRISystem/issues/15) | 20h | OPEN |
| TEST-001 | Majority of tests are hollow/fake | [#16](https://github.com/Jamesb123456/HRISystem/issues/16) | 40h | OPEN |
| TEST-002 | 15+ modules have zero route test coverage | [#17](https://github.com/Jamesb123456/HRISystem/issues/17) | 40h | OPEN |
| PERF-001 | Employee list N+1 query (60+ ops/page) | [#18](https://github.com/Jamesb123456/HRISystem/issues/18) | 6h | OPEN |
| ARCH-004 | @staffora/shared unused in production | [#19](https://github.com/Jamesb123456/HRISystem/issues/19) | 16h | OPEN |
| SEC-003 | MFA twoFactorVerified check enforcement | [#21](https://github.com/Jamesb123456/HRISystem/issues/21) | 4h | OPEN |
| DB-004 | Bootstrap functions in init.sql not migrations | [#24](https://github.com/Jamesb123456/HRISystem/issues/24) | 4h | OPEN |

---

## P2 — MEDIUM PRIORITY (Open Issues #20-24)

| ID | Issue | GitHub | Effort | Status |
|----|-------|--------|--------|--------|
| PERF-003 | Zero module-level caching | [#20](https://github.com/Jamesb123456/HRISystem/issues/20) | 8h | OPEN |
| CODE-001 | Inconsistent error handling | [#22](https://github.com/Jamesb123456/HRISystem/issues/22) | 8h | OPEN |
| PERF-004 | Unbounded collection queries | [#23](https://github.com/Jamesb123456/HRISystem/issues/23) | 4h | OPEN |
| PERF-002 | Outbox processor sequential processing | — | 4h | OPEN |
| PERF-005 | Export worker loads entire dataset | — | 8h | OPEN |
| ARCH-005 | Portal/dashboard skip service layer | — | 8h | OPEN |
| CODE-002 | `any` type usage across codebase | — | 8h | OPEN |
| DOC-001 | API reference may be outdated | — | 4h | OPEN |
| TEST-003 | Frontend tests need improvement | — | 16h | OPEN |
| CICD-002 | E2E test pipeline missing | — | 16h | OPEN |

---

## P3 — LOW PRIORITY

| ID | Issue | Effort | Status |
|----|-------|--------|--------|
| CODE-003 | console.log should use pino logger | 4h | OPEN |
| CODE-004 | Dead code in legacy auth plugin | 2h | OPEN |
| DOC-002 | Migration README RLS checklist | 2h | OPEN |
| PERF-006 | Connection pooling configuration | 4h | OPEN |
| DOC-003 | Comprehensive system docs update | 8h | DONE (this session) |
| DOC-004 | CONTRIBUTING.md | 2h | DONE (this session) |
| DOC-005 | CHANGELOG.md | 2h | DONE (this session) |

---

## Summary

| Priority | Total | Resolved | Open |
|----------|-------|----------|------|
| P0 CRITICAL | 6 | 6 | **0** |
| P1 HIGH | 7 | 0 | **7** |
| P2 MEDIUM | 10 | 0 | **10** |
| P3 LOW | 7 | 3 | **4** |
| **Total** | **30** | **9** | **21** |

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
