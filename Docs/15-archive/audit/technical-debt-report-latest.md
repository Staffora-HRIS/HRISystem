# Staffora Platform — Technical Debt Report

> **Generated:** 2026-03-17 | **Reviewer:** AI CTO
> **Source:** 4 rounds of comprehensive codebase audit + learning.md history

*Last updated: 2026-03-28*

---

## 1. Executive Summary

| Metric | Score |
|--------|-------|
| **Overall Debt Score** | **6/10** (moderate-high) |
| **Production Risk** | Medium — P0 critical issues resolved, P1 items remain |
| **Estimated Remediation** | ~80-120 developer-hours for P1+P2 items |

### Top 5 Highest-Risk Areas
1. **Test Coverage** — Majority of tests are hollow/fake assertions (P1)
2. **Talent Module Architecture** — 1150-line routes.ts with no service layer (P1)
3. **@staffora/shared Unused** — Duplicate types across all modules (P1)
4. **TypeBox Version Skew** — Breaking changes between API (0.34) and shared (0.32) (P1)
5. **N+1 Query Patterns** — Employee list generates 60+ DB ops per page (P1)

---

## 2. Technical Debt Heatmap

```
Module/Area              │ Debt Level │ Impact │ Effort │ Priority
─────────────────────────┼────────────┼────────┼────────┼──────────
packages/api/modules/    │            │        │        │
  hr/                    │ LOW        │ High   │ Low    │ P3
  talent/                │ CRITICAL   │ High   │ High   │ P1
  cases/                 │ MEDIUM     │ Med    │ Med    │ P2
  lms/                   │ MEDIUM     │ Med    │ Med    │ P2
  onboarding/            │ MEDIUM     │ Med    │ Med    │ P2
  benefits/              │ LOW        │ Med    │ Low    │ P3
  time/                  │ LOW        │ Med    │ Low    │ P3
  absence/               │ LOW        │ Med    │ Low    │ P3
  workflows/             │ MEDIUM     │ Med    │ High   │ P2
  recruitment/           │ LOW        │ Low    │ Low    │ P3
  succession/            │ LOW        │ Low    │ Low    │ P3
  documents/             │ LOW        │ Low    │ Low    │ P3
  analytics/             │ MEDIUM     │ Med    │ Med    │ P2
  competencies/          │ LOW        │ Low    │ Low    │ P3
  portal/                │ MEDIUM     │ Low    │ Med    │ P2
  dashboard/             │ MEDIUM     │ Low    │ Med    │ P2
  security/              │ LOW        │ High   │ Low    │ P3
  UK compliance (17)     │ LOW        │ High   │ Low    │ P3
  GDPR (6)               │ LOW        │ High   │ Low    │ P3
─────────────────────────┼────────────┼────────┼────────┼──────────
packages/shared/         │ HIGH       │ High   │ Med    │ P1
packages/web/            │ MEDIUM     │ Med    │ Med    │ P2
Infrastructure           │ LOW        │ High   │ Low    │ P3
CI/CD                    │ LOW        │ High   │ Low    │ P3
Testing                  │ CRITICAL   │ High   │ High   │ P1
Security                 │ LOW        │ High   │ Low    │ P3
Documentation            │ LOW        │ Med    │ Low    │ P3
```

---

## 3. High-Risk Module Analysis

### 3.1 Talent Module (CRITICAL)
- **What:** All SQL inline in routes.ts (~1150 lines), no service/repository
- **Why it matters:** Cannot unit test, no domain events, violates all architecture patterns
- **Effort:** 16-20 hours
- **Risk if unfixed:** Any change risks breaking multiple features; no audit trail for talent operations

### 3.2 Test Infrastructure (CRITICAL)
- **What:** ~70% of test files contain hollow assertions (local variable checks, not API calls)
- **Why it matters:** CI passes with false confidence; real bugs slip through
- **Effort:** 40-60 hours to rewrite all hollow tests
- **Risk if unfixed:** Production incidents from untested code paths; false sense of quality

### 3.3 @staffora/shared Package (HIGH)
- **What:** Zero production imports; all modules duplicate types locally
- **Why it matters:** Type divergence causes subtle bugs; state machine rules not enforced consistently
- **Effort:** 12-16 hours for phased integration
- **Risk if unfixed:** Growing divergence as modules evolve independently

### 3.4 TypeBox Version Skew (HIGH)
- **What:** API uses ^0.34.11, shared uses ^0.32.0 (breaking changes between versions)
- **Why it matters:** Schemas crossing package boundaries may have runtime incompatibilities
- **Effort:** 4-8 hours
- **Risk if unfixed:** Runtime validation failures when using shared schemas in API

### 3.5 N+1 Query Patterns (HIGH)
- **What:** Employee list runs 3 correlated subqueries per row
- **Why it matters:** 60+ DB operations per page of 20; will timeout at scale
- **Effort:** 4-6 hours
- **Risk if unfixed:** Performance degradation as employee count grows; slow page loads

---

## 4. Dependency Health

### Version Skew Issues
| Package | Location | Version | Issue |
|---------|----------|---------|-------|
| @sinclair/typebox | API | ^0.34.11 | OK |
| @sinclair/typebox | shared | ^0.32.0 | **Breaking changes** |
| better-auth | API | ^1.5.4 | OK |
| better-auth | web | ^1.5.4 | OK (aligned) |

### Outdated Package Risk
- No automated dependency updates configured beyond Dependabot
- Dependabot config exists at `.github/dependabot.yml`
- **Recommendation:** Review and merge Dependabot PRs regularly

### Security Vulnerabilities
- Trivy Docker image scanning in CI
- TruffleHog secret detection in CI
- CodeQL static analysis in CI
- bun audit configured to fail on HIGH+ severity
- **Status:** Security pipeline is comprehensive

---

## 5. Code Quality Debt

### TypeScript Strict Mode
- `strict: false` in tsconfig.base.json with ALL sub-flags disabled
- `strictNullChecks: false` — directly caused tenant null bug (commit 84c9460)
- **Recommendation:** Enable `strictNullChecks` first (highest impact), then gradually enable other flags

### `any` Type Usage
- Multiple uses across plugins and service methods
- Plugin derive functions are the worst offenders
- **Recommendation:** Replace with proper generics; use unknown + type guards

### Dead Code
- Legacy `auth.ts` may still exist alongside `auth-better.ts`
- console.log statements in production code paths (should use pino)
- Unused imports and variables (ESLint would catch with stricter config)

### Module Architecture Violations
| Violation | Count | Modules |
|-----------|-------|---------|
| No service layer | 1 | talent |
| Inline SQL in routes | 3 | talent, portal, dashboard |
| Missing RBAC guards | 0 | All fixed in recent audit |
| Outbox pattern violation | 0 | All fixed in recent audit |
| db.query bypassing RLS | 0 | All fixed in recent audit |

---

## 6. Test Debt

### Test Quality Assessment
| Category | Files | Quality | Notes |
|----------|-------|---------|-------|
| RLS integration | 1 | **GOOD** | Real DB assertions |
| Idempotency integration | 1 | **GOOD** | Real DB assertions |
| Outbox integration | 1 | **GOOD** | Real DB assertions |
| Effective dating | 1 | **GOOD** | Real DB assertions |
| State machine | 1 | **GOOD** | Real DB assertions |
| Route integration | 5 | **HOLLOW** | Assert local variables |
| Security tests | 3 | **HOLLOW** | typeof assertions |
| Performance tests | 1 | **HOLLOW** | No real benchmarks |
| Chaos tests | 1 | **HOLLOW** | Mock failures only |
| E2E tests | 1 | **HOLLOW** | Mutate plain objects |
| Service unit tests | 3 | **GOOD** | Proper mocking |
| Plugin unit tests | 1 | **GOOD** | Proper assertions |
| Frontend tests | ~35 | **MIXED** | Quality varies |

**Summary:** 8 genuine test files, 12+ hollow test files, ~35 mixed frontend tests.

### Coverage Gaps
- 15+ modules have zero route test coverage
- UK compliance modules (17) — zero tests
- GDPR modules (6) — zero tests
- Recruitment, succession, competencies — zero tests

---

## 7. Infrastructure Debt

### Missing Production Configs
| Item | Status |
|------|--------|
| Connection pooling (PgBouncer) | MISSING |
| Graceful shutdown handler | MISSING |
| Health check tuning | PARTIAL |
| Log aggregation | MISSING |
| Error tracking (Sentry/etc) | MISSING |
| APM/tracing | MISSING |
| CDN for static assets | MISSING |
| Database read replicas | MISSING |

### Scaling Limitations
- Single API process (no clustering)
- Single worker process for all job types
- No auto-scaling configuration
- No load testing results

---

## 8. Remediation Roadmap

### Sprint 1: Critical Fixes (2 weeks)
| Task | Effort | Impact |
|------|--------|--------|
| Align TypeBox versions | 4h | Prevent schema incompatibilities |
| Add graceful shutdown | 4h | Prevent data loss on deploy |
| Tune connection pool | 2h | Prevent pool exhaustion |
| Enable strictNullChecks | 8h | Prevent null-related bugs |
| **Total** | **18h** | |

### Sprint 2: Architecture (2 weeks)
| Task | Effort | Impact |
|------|--------|--------|
| Talent module refactoring | 20h | Architecture compliance |
| @staffora/shared integration (types) | 8h | Type consistency |
| N+1 query fix (employee list) | 4h | 60x query reduction |
| Outbox batch processing | 4h | Worker efficiency |
| **Total** | **36h** | |

### Sprint 3: Testing (2 weeks)
| Task | Effort | Impact |
|------|--------|--------|
| Rewrite hollow route tests | 24h | Real test coverage |
| Add tests for core modules | 16h | Fill coverage gaps |
| Raise coverage threshold to 80% | 2h | Enforce quality gate |
| **Total** | **42h** | |

### Sprint 4+: Polish (ongoing)
| Task | Effort | Impact |
|------|--------|--------|
| Module-level caching | 8h | Performance |
| Error handling standardization | 8h | Code quality |
| OpenTelemetry integration | 12h | Observability |
| E2E test pipeline | 16h | End-to-end confidence |
| Shared package (error codes, state machines) | 12h | Architecture debt |
| **Total** | **56h** | |

---

## 9. Debt Score Breakdown

| Area | Score (1-10) | Weight | Weighted |
|------|-------------|--------|----------|
| Code Quality | 5 | 15% | 0.75 |
| Test Coverage | 3 | 20% | 0.60 |
| Architecture | 5 | 20% | 1.00 |
| Security | 8 | 15% | 1.20 |
| Infrastructure | 6 | 10% | 0.60 |
| Documentation | 8 | 5% | 0.40 |
| CI/CD | 9 | 5% | 0.45 |
| Performance | 5 | 5% | 0.25 |
| Compliance | 8 | 5% | 0.40 |
| **Overall** | | **100%** | **5.65/10** |

**Interpretation:** Score of 5.65/10 indicates moderate technical debt. Security, CI/CD, documentation, and compliance are strong. Testing and architecture are the primary debt areas requiring immediate attention.
