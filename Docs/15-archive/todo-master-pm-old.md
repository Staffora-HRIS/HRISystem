# Staffora HRIS — Master TODO (Phase 16+)

*Last updated: 2026-03-28*

**Updated:** 2026-03-14
**Previous completion:** ~105/263 items (Phases 1-15)
**Remaining:** ~158 items across 4 priorities
**Overall system completion:** 57% (344/603 features)

---

## PHASE 16 — Quick Wins (Immediate, Small Effort)

These items can be completed in < 1 day each and have high impact.

### Security
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-006 | Remove hardcoded `hris_dev_password` fallback in `db.ts`/`database.ts` — crash on missing DB_PASSWORD | Security | SMALL | OPEN |
| TODO-047 | Replace `KEYS` with `SCAN` in `invalidateTenantCache()` in cache plugin | Security | SMALL | OPEN |
| TODO-075 | Replace `unsafe()` in `db.ts` for `SET TRANSACTION ISOLATION LEVEL` with switch/case | Security | SMALL | OPEN |
| TODO-076 | Make DB debug query logging opt-in via `DB_DEBUG=true` env var | Security | SMALL | OPEN |

### Architecture
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-041 | Fix better-auth version mismatch: API `^1.5.4` vs web `^1.4.10` | Tech Debt | SMALL | OPEN |
| TODO-042 | Fix vitest `^2.1.8` vs `@vitest/coverage-v8 ^4.1.0` major version mismatch | Tech Debt | SMALL | OPEN |
| TODO-163 | Remove dead `packages/web/src/App.tsx` (legacy under-construction file) | Tech Debt | SMALL | OPEN |

### Infrastructure / Docker
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-083 | Pin Bun version in CI (use `bun-version` matching `packageManager` field) | Infrastructure | SMALL | OPEN |
| TODO-084 | Add Redis password in CI (currently no auth, differs from dev/prod) | Infrastructure | SMALL | OPEN |
| TODO-085 | Fix Redis health check: `redis-cli -a $REDIS_PASSWORD ping` | Infrastructure | SMALL | OPEN |
| TODO-086 | Web container: use `condition: service_healthy` instead of `depends_on: [api]` | Infrastructure | SMALL | OPEN |
| TODO-089 | Rename Docker user from `nodejs`/`nextjs` to `staffora` | Infrastructure | SMALL | OPEN |
| TODO-090 | Create nginx SSL placeholder + README for cert provisioning | Infrastructure | SMALL | OPEN |
| TODO-091 | Fix Web Dockerfile `NODE_ENV=development` in build stage → `production` | Infrastructure | SMALL | OPEN |

### Feature Fixes
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-012 | Fix `leave_approvals` → `leave_request_approvals` + column names in `manager.service.ts` | Data Integrity | SMALL | OPEN |
| TODO-107 | Remove `MOCK_DATA` fallback in reports page `transformReportData()` | Feature | SMALL | OPEN |
| TODO-118 | Add statutory notice period calculation (1 week/year, max 12) | Compliance | SMALL | OPEN |
| TODO-127 | Implement NI category tracking (A, B, C, D, E, F, H, J, L, M, N, S, V, X, Z) | Feature | SMALL | OPEN |
| TODO-145 | Auto-end benefits on employee termination (cessation date = termination date) | Feature | SMALL | OPEN |
| TODO-157 | Add bulk approval endpoint for managers with many pending items | Feature | SMALL | OPEN |

### Frontend Wiring
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-051 | Wire tenant settings `queryFn` to real `/api/v1/tenant/settings` endpoint | Feature | SMALL | OPEN |
| TODO-052 | Wire tenant settings save to real backend (remove `setTimeout` mock) | Feature | SMALL | OPEN |
| TODO-053 | Wire notification settings save to real backend | Feature | SMALL | OPEN |

---

## HIGH PRIORITY — Next 1-2 Sprints

### Security & Auth
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-024 | Add rate limiting integration tests with `options.enabled: true` | Testing | SMALL | OPEN |
| TODO-025 | IP-based rate limiting for unauthenticated endpoints (anti-enumeration) | Security | MEDIUM | OPEN |
| TODO-026 | Redis fallback for rate limiting (in-memory LRU when Redis is down) | Security | MEDIUM | OPEN |
| TODO-027 | Reduce tenant cache TTL from 5 minutes to 30-60 seconds | Security | SMALL | OPEN |
| TODO-028 | Implement MFA recovery code flow (validate backup codes on login) | Security | MEDIUM | OPEN |

### Testing
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-031 | Fix 14 partial service unit tests (import actual services, not local copies) | Testing | LARGE | OPEN |
| TODO-032 | Convert route tests to real HTTP using `app.handle()` | Testing | LARGE | OPEN |
| TODO-037 | Add admin frontend route tests (employees, absence, time, cases priority) | Testing | LARGE | OPEN |
| TODO-038 | Add manager frontend route tests (approvals, team management) | Testing | MEDIUM | OPEN |

### Architecture
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-013 | Consolidate dual user tables (Better Auth `user` + `app.users` sync) | Architecture | LARGE | OPEN |
| TODO-014 | Consolidate 3 database connection pools | Architecture | MEDIUM | OPEN |
| TODO-039 | Integrate `@staffora/shared` into production code (types, errors, state machines) | Tech Debt | LARGE | OPEN |

### Feature Completeness
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-054 | Implement time policies backend endpoint `/api/v1/time/policies` | Feature | MEDIUM | OPEN |
| TODO-056 | Create missing manager route pages (`/manager/dashboard`, `/manager/org-chart`, etc.) | Feature | LARGE | OPEN |
| TODO-103 | Wire integrations page to real backend (connect/disconnect handlers) | Feature | LARGE | OPEN |
| TODO-104 | Implement leave type editing (currently disabled) | Feature | MEDIUM | OPEN |
| TODO-105 | Implement leave policy editing (currently disabled) | Feature | MEDIUM | OPEN |
| TODO-106 | Implement report scheduling (schedule button currently disabled) | Feature | MEDIUM | OPEN |
| TODO-109 | Add frontend retry logic with exponential backoff (respect Retry-After header) | Architecture | MEDIUM | OPEN |
| TODO-110 | Optimise session resolution (cache session instead of calling auth.handler() per request) | Architecture | MEDIUM | OPEN |

### UK Compliance
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-064 | Build PAYE/RTI submission capability (FPS/EPS to HMRC) | Compliance | LARGE | OPEN |
| TODO-113 | Implement holiday pay 52-week reference period calculation | Compliance | MEDIUM | OPEN |
| TODO-115 | Implement carryover rules (EU 4-week vs 1.6-week distinction) | Compliance | MEDIUM | OPEN |

---

## MEDIUM PRIORITY — Next Quarter

### Architecture & Code Quality
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-065 | Split HR `service.ts` (2,159 lines) into employee/org/position services | Tech Debt | LARGE | OPEN |
| TODO-066 | Split `benefits/routes.ts` (1,641 lines) into carrier/plan/enrollment groups | Tech Debt | MEDIUM | OPEN |
| TODO-071 | Split security module into RBAC, field-permissions, portal, manager-hierarchy | Tech Debt | MEDIUM | OPEN |
| TODO-073 | Decompose 14 large frontend route files (>500 lines) | Tech Debt | XL | OPEN |

### Infrastructure & Monitoring
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-009 | Offsite backup storage (S3 upload from backup sidecar) | Infrastructure | MEDIUM | OPEN |
| TODO-081 | Deploy Prometheus + Grafana monitoring stack | Infrastructure | LARGE | OPEN |
| TODO-082 | Add log aggregation (ELK/Loki) | Infrastructure | LARGE | OPEN |
| TODO-087 | Add WAL archiving for point-in-time recovery | Infrastructure | MEDIUM | OPEN |
| TODO-088 | Add backup verification (automated restore test) | Infrastructure | MEDIUM | OPEN |
| TODO-092 | Implement secret rotation documentation/tooling | Infrastructure | MEDIUM | OPEN |

### Testing (Extended)
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-093 | Add worker integration tests (Redis Streams E2E) | Testing | MEDIUM | OPEN |
| TODO-094 | Add concurrent overlap tests | Testing | MEDIUM | OPEN |
| TODO-095 | Add RBAC route-level tests | Testing | MEDIUM | OPEN |
| TODO-096 | Add E2E tests to CI (Playwright) | Testing | LARGE | OPEN |
| TODO-097 | Add session lifecycle tests | Testing | MEDIUM | OPEN |
| TODO-098 | Add file upload/download tests | Testing | MEDIUM | OPEN |

### Feature Completeness
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-124 | Implement pay schedule assignment to employees | Feature | SMALL | OPEN |
| TODO-126 | Implement tax code management | Feature | MEDIUM | OPEN |
| TODO-128 | Implement payslip generation | Feature | LARGE | OPEN |
| TODO-129 | Implement P45 generation on termination | Feature | MEDIUM | OPEN |
| TODO-130 | Implement P60 annual generation | Feature | MEDIUM | OPEN |
| TODO-131 | Implement holiday pay calculation (Harpur Trust ruling) | Feature | MEDIUM | OPEN |
| TODO-132 | Implement final pay calculation on termination | Feature | MEDIUM | OPEN |
| TODO-134 | Implement Bradford Factor absence monitoring | Feature | MEDIUM | OPEN |
| TODO-146 | Build compensation analytics (compa-ratio, pay equity) | Feature | MEDIUM | OPEN |
| TODO-147 | Build diversity analytics dashboard | Feature | MEDIUM | OPEN |
| TODO-149 | Implement employee directory/search for self-service | Feature | MEDIUM | OPEN |
| TODO-150 | Implement personal details update with approval workflow | Feature | MEDIUM | OPEN |
| TODO-152 | Implement case appeal process (different decision maker) | Feature | MEDIUM | OPEN |
| TODO-154 | Implement e-signature integration (DocuSign/Adobe/Scrive) | Feature | LARGE | OPEN |
| TODO-156 | Implement auto-escalation on workflow SLA timeout | Feature | MEDIUM | OPEN |
| TODO-158 | Implement mandatory training compliance reporting | Feature | MEDIUM | OPEN |
| TODO-159 | Implement recruitment analytics (time-to-fill, cost-per-hire) | Feature | MEDIUM | OPEN |
| TODO-160 | Implement org chart for employee self-service view | Feature | MEDIUM | OPEN |

---

## LOW PRIORITY — Nice to Have

### Dead Code & Cleanup
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-163 | Remove legacy `packages/web/src/App.tsx` | Tech Debt | SMALL | OPEN |
| TODO-164 | Archive old hollow test files | Tech Debt | SMALL | OPEN |
| TODO-165 | Clean up debug `_test_conn.ts` files | Tech Debt | SMALL | OPEN |

### Enterprise Features
| ID | Task | Area | Effort | Status |
|----|------|------|--------|--------|
| TODO-140 | Implement SSO (SAML/OIDC — Google, Microsoft, Okta) | Feature | XL | OPEN |
| TODO-141 | Implement data import framework (CSV/Excel bulk loading) | Feature | LARGE | OPEN |
| TODO-142 | Implement bulk API operations (batch updates) | Feature | MEDIUM | OPEN |
| TODO-148 | Build custom report builder (drag-and-drop) | Feature | XL | OPEN |

---

## Completion Tracking

- **Phase 16 items:** 23 OPEN / 0 DONE
- **High priority items:** 20 OPEN / 0 DONE
- **Medium priority items:** 34 OPEN / 0 DONE
- **Low priority items:** 8 OPEN / 0 DONE
- **Total remaining:** ~158 items

---

*Updated by orchestrator on 2026-03-14 after 15 phases of remediation.*
