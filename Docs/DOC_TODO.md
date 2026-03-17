# Documentation TODO & Gap Analysis

> Comprehensive gap detection for Staffora documentation system
> **Last updated:** 2026-03-17

---

## Summary

| Category | Total Items | Done | In Progress | Remaining |
|----------|:-----------:|:----:|:-----------:|:---------:|
| Missing Sections | 8 | 8 | 0 | 0 |
| Module Documentation | 72 | 20 | 52 | 0 |
| Frontend Documentation | 4 | 1 | 3 | 0 |
| API Completeness | 6 | 1 | 0 | 5 |
| Cross-Linking | 3 | 1 | 0 | 2 |
| Quality Polish | 5 | 0 | 0 | 5 |

---

## 1. New Sections Created (Phase 1 - Complete)

- [x] `Docs/modules/README.md` — Complete module catalog (72 modules)
- [x] `Docs/architecture/diagrams.md` — Comprehensive Mermaid architecture diagrams
- [x] `Docs/frontend/README.md` — Frontend architecture overview
- [x] `Docs/frontend/routes.md` — Complete route map (160 routes)
- [x] `Docs/frontend/components.md` — Component library documentation
- [x] `Docs/frontend/data-fetching.md` — React Query and API patterns
- [x] `Docs/testing/README.md` — Testing guide and infrastructure
- [x] `Docs/testing/test-matrix.md` — Test coverage matrix
- [x] `Docs/security/README.md` — Security architecture documentation
- [x] `Docs/integrations/README.md` — External service integrations
- [x] `Docs/ai-agents/README.md` — AI development agent system
- [x] `Docs/troubleshooting/README.md` — Common issues and debug procedures
- [x] `Docs/devops/docker-guide.md` — Docker development deep-dive
- [x] `Docs/devops/ci-cd.md` — CI/CD pipeline documentation
- [x] `Docs/architecture/worker-system.md` — Worker system deep-dive
- [x] `Docs/architecture/database-guide.md` — Database deep-dive
- [x] `Docs/DOC_HEALTH_REPORT.md` — Documentation health scoring
- [x] `Docs/DOC_MAP.md` — Interactive documentation map
- [x] `Docs/DOC_TODO.md` — This gap analysis file

---

## 2. API Reference Gaps

The `Docs/api/API_REFERENCE.md` currently documents 20/72 modules. The following improvements are needed:

### Missing Module Endpoints

- [ ] Add endpoint documentation for 52 undocumented modules (see [DOCUMENTATION_TODO.md](DOCUMENTATION_TODO.md) for full list)
- [ ] Group: UK Compliance (22 modules)
- [ ] Group: GDPR/Privacy (6 modules)
- [ ] Group: Payroll (5 modules)
- [ ] Group: HR Operations (13 modules)
- [ ] Group: Other (6 modules)

### Request/Response Examples

- [ ] Add request body examples for POST/PATCH endpoints
- [ ] Add response body examples for all endpoints
- [ ] Document query parameters for list endpoints (filters, sorting, cursor)
- [ ] Add rate limit information per endpoint group
- [ ] Add authentication requirement indicators

---

## 3. Cross-Linking Improvements

### Documents Needing "Related Documents" Section

- [ ] All files in `architecture/` should link to related `patterns/` and `api/` docs
- [ ] All files in `testing/` should link to related `patterns/` and `modules/` docs
- [ ] All files in `frontend/` should link to related `api/` and `modules/` docs
- [ ] All files in `compliance/` should link to related `modules/` (UK compliance modules)
- [ ] All files in `security/` should link to `patterns/SECURITY.md` and `audit/security-audit.md`

### Navigation Improvements

- [ ] Add breadcrumb navigation to all deep pages
- [ ] Standardize "Related Documents" format across all files
- [ ] Add "Next/Previous" links for sequential reading paths

---

## 4. Quality Polish

### Formatting

- [ ] Add "Last Updated" dates to all major documents
- [ ] Add table of contents to files > 5KB
- [ ] Standardize heading levels (H1 for title, H2 for sections, H3 for subsections)
- [ ] Ensure consistent Mermaid diagram styling

### Content Freshness

- [ ] Review `audit/` reports for staleness (quarterly cadence)
- [ ] Update `project-management/` files to reflect current sprint
- [ ] Verify all code examples compile against current codebase
- [ ] Update module counts in README.md (currently says 16, should be 72)

### Process

- [ ] Add documentation review step to PR template
- [ ] Establish documentation update cadence (quarterly for audits, per-release for API)
- [ ] Create documentation contribution guidelines

---

## 5. Future Enhancements

### Advanced Documentation

- [ ] Full Entity-Relationship diagram for database schema
- [ ] OpenAPI/Swagger specification auto-generation from TypeBox schemas
- [ ] Component library with live examples (Storybook or equivalent)
- [ ] Searchable documentation site (Docusaurus, VitePress, or Nextra)
- [ ] API changelog tracking (per-version endpoint changes)

### Automation

- [ ] Auto-generate API_REFERENCE.md from route files
- [ ] Auto-generate test-matrix.md from test file structure
- [ ] CI check for documentation coverage (new module = must have docs)
- [ ] Broken link checker in CI pipeline
- [ ] Documentation health score in CI output

---

## Priority Matrix

| Task | Impact | Effort | Priority |
|------|:------:|:------:|:--------:|
| Document 52 missing module endpoints | High | High | P1 |
| Add request/response examples to API docs | High | Medium | P1 |
| Cross-link all documentation sections | Medium | Low | P2 |
| Add "Last Updated" dates | Low | Low | P2 |
| Full ER diagram | Medium | Medium | P2 |
| OpenAPI auto-generation | High | High | P3 |
| Searchable documentation site | Medium | High | P3 |
| CI documentation checks | Medium | Medium | P3 |

---

*See [DOC_HEALTH_REPORT.md](DOC_HEALTH_REPORT.md) for per-file quality scores.*
*See [DOC_MAP.md](DOC_MAP.md) for navigation structure.*
*See [DOCUMENTATION_TODO.md](DOCUMENTATION_TODO.md) for the original pre-audit TODO.*
