# Documentation TODO & Gap Analysis

> Comprehensive gap detection for Staffora documentation system
> Last updated: 2026-03-28

## Summary

| Priority | Count | Status |
|----------|:-----:|--------|
| Critical | 0 | All critical gaps resolved |
| High | 5 | Consolidation and updates needed (2 resolved) |
| Medium | 8 | Enhancement opportunities (2 resolved) |
| Low | 5 | Nice-to-haves (all 5 resolved) |

---

## Completed (2026-03-28)

- [x] Module catalog updated from 72 to 120 modules
- [x] 12 feature guides generated from source code
- [x] 10 Mermaid architecture diagrams generated
- [x] API reference updated for all 120 modules
- [x] Security documentation (auth, RBAC, data protection, RLS)
- [x] Development guides (getting started, backend, frontend, database, patterns)
- [x] Testing guide and coverage matrix
- [x] Integration documentation (external services, webhooks)
- [x] Operations documentation (monitoring, worker system, production checklist, DR)
- [x] UK compliance documentation (26 employment law + 9 GDPR modules)
- [x] Documentation restructured into 15 numbered directories
- [x] DOC_MAP with visual hierarchy and cross-reference matrix
- [x] DOC_HEALTH_REPORT with per-section scoring

---

## High Priority

### 1. ~~Consolidate duplicate files~~ (DONE 2026-03-28)
**Section:** 04-api/, 05-development/
**Issue:** Legacy files coexist with new generated versions
**Action:**
- [x] Replace `04-api/API_REFERENCE.md` content with redirect to `api-reference.md`
- [x] Replace `05-development/GETTING_STARTED.md` with redirect to `getting-started.md`
- [x] Replace `05-development/FRONTEND.md` with redirect to `frontend-development.md`
- [x] Consolidate `05-development/frontend-overview.md` into `frontend-development.md` (replaced with redirect)

### 2. ~~Update legacy files to reference 120 modules~~ DONE
**Section:** 01-overview/, 02-architecture/, 05-development/, 10-ai-agents/
**Issue:** Several migrated files still referenced "72 modules"
**Action:**
- [x] Update `01-overview/system-documentation.md` module count (72 -> 120)
- [x] Update `02-architecture/diagrams.md` module count and pie chart categories
- [x] Update `02-architecture/adr/004-row-level-security-multi-tenant.md` module count
- [x] Update `05-development/backend-development.md` module count
- [x] Update `10-ai-agents/README.md` module count
- [x] Update non-numbered directory duplicates (adr/, ai-agents/, architecture/)
- [ ] Update `02-architecture/DATABASE.md` table catalog (no "72 modules" reference found; table catalog review deferred)

### 3. ~~Add "Last updated" headers to migrated files~~ (DONE 2026-03-28)
**Section:** All
**Issue:** ~117 migrated files missing date stamps
**Action:**
- [x] Scan all migrated files and add `Last updated: 2026-03-28` where missing (117 files updated across all 15 numbered directories)

### 4. Add Related Documents sections to new files
**Section:** 03-features/, 07-security/, 05-development/
**Issue:** New generated files lack explicit cross-links
**Action:**
- [x] Add "Related Documents" footer to each new file linking to relevant sections (21 files: 12 in 03-features/, 4 in 07-security/, 5 in 05-development/)

### 5. Generate per-section README.md files for new directories
**Section:** 03-features/, 06-devops/, 12-compliance/, 13-roadmap/
**Issue:** Some numbered directories lack a README index
**Action:**
- [ ] Create README.md for 03-features/ listing all 12 feature guides
- [ ] Update README.md for sections where migrated README is stale

### 6. Clean up old Docs/ structure
**Section:** Root
**Issue:** Old unnumbered directories (Docs/architecture, Docs/api, etc.) still exist alongside numbered ones
**Action:**
- [ ] After verifying all content is in numbered directories, remove old unnumbered copies
- [ ] Update CLAUDE.md Documentation section to reference new `docs/` structure

---

## Medium Priority

### 7. ~~Expand AI agents documentation~~ (DONE 2026-03-28)
**Section:** 10-ai-agents/
**Issue:** Only a single README — no per-agent docs
**Action:**
- [x] Document each agent's capabilities, tools, and use cases (`agent-catalog.md`)
- [x] Document the skill system and available skills (`skill-catalog.md`)
- [x] Document the memory system (`memory-system.md`)
- [x] Update README.md as index linking to all three new files

### 8. ~~Refresh roadmap and sprint plans~~ (DONE 2026-03-28)
**Section:** 13-roadmap/
**Issue:** Sprint plans may be outdated
**Action:**
- [x] Review and update roadmap.md with current priorities
- [x] Archive completed sprint plans
- [x] Update kanban-board.md

### 9. ~~Add database migration changelog~~ (DONE)
**Section:** 06-devops/
**Issue:** No consolidated changelog of what each migration does
**Action:**
- [x] Generate a migration changelog from migration file headers/comments
  - Created `06-devops/migration-changelog.md` covering all 320 migration files (0001--0234)

### 10. Document environment variables comprehensively
**Section:** 05-development/
**Issue:** No single reference for all environment variables
**Action:**
- [x] Create `environment-variables.md` documenting all env vars from docker-compose.yml and config files

### 11. ~~Add error code documentation for new modules~~ (DONE)
**Section:** 04-api/
**Issue:** ERROR_CODES.md may not cover all 120 modules
**Action:**
- [x] Scan `packages/shared/src/errors/` and update error codes doc

### 12. ~~Document shared package exports~~ (DONE 2026-03-28)
**Section:** 02-architecture/
**Issue:** @staffora/shared package exports not comprehensively documented
**Action:**
- [x] Document all export paths and what they provide
- [x] Created `02-architecture/shared-package.md` with comprehensive reference for all 6 export paths, 13 type modules, 46 error codes, 30+ schemas, 10 state machines, and 80+ utility functions

### 13. ~~Add sequence diagrams for key user flows~~ (DONE)
**Section:** 03-features/
**Issue:** Some feature docs have only flowcharts, not sequence diagrams
**Action:**
- [x] Add sequence diagrams for: employee hire flow, leave request flow, payroll run flow
- Added to: `core-hr.md` (Employee Hire Flow), `absence-management.md` (Leave Request Submission and Approval Flow), `payroll-finance.md` (Payroll Run Flow)

### 14. Document database indexes and performance
**Section:** 02-architecture/
**Issue:** No documentation of index strategy
**Action:**
- [x] Document key indexes, explain the indexing strategy, note missing indexes
- Created: `02-architecture/database-indexes.md` -- Complete index reference with ~793 indexes catalogued across ~200 tables, covering indexing strategy, composite indexes, partial indexes, GIN/GiST indexes, full-text search, performance indexes, and missing index recommendations

---

## Low Priority

### 15. ~~Add glossary~~ (DONE 2026-03-28)
**Section:** 01-overview/
**Action:**
- [x] Create `glossary.md` defining HRIS terms, UK employment law terms, and Staffora-specific terminology

### 16. ~~Add changelog~~ (DONE 2026-03-28)
**Section:** Root
**Action:**
- [x] Create CHANGELOG.md tracking major documentation updates

### ~~17. Generate search index~~ -- DONE
**Section:** Root
**Action:**
- [x] Create keyword-to-file mapping for fast documentation search → [SEARCH_INDEX.md](SEARCH_INDEX.md)

### 18. ~~Add contributing guide for docs~~ (DONE 2026-03-28)
**Section:** Root
**Action:**
- [x] Document how to maintain and extend the documentation system → `Docs/CONTRIBUTING.md`

### 19. Add diagram legends
**Section:** 02-architecture/
**Action:**
- [x] Add legends explaining colors and shapes used in Mermaid diagrams

---

## Gap Detection Matrix

| Area | Documented? | Generated from Source? | Diagrams? | Cross-Linked? |
|------|:-----------:|:---------------------:|:---------:|:-------------:|
| Core HR | Yes | Yes | Yes | Partial |
| Time & Attendance | Yes | Yes | Yes | Partial |
| Absence | Yes | Yes | Yes | Partial |
| Talent | Yes | Yes | Yes | Partial |
| Recruitment | Yes | Yes | Yes | Partial |
| Payroll | Yes | Yes | Yes | Partial |
| Benefits | Yes | Yes | Yes | Partial |
| Documents | Yes | Yes | Yes | Partial |
| Cases | Yes | Yes | Yes | Partial |
| Onboarding | Yes | Yes | Yes | Partial |
| Self-Service | Yes | Yes | Yes | Partial |
| UK Compliance (26 modules) | Yes | Yes | Partial | Partial |
| GDPR (9 modules) | Yes | Yes | Yes | Yes |
| Authentication | Yes | Yes | Yes | Yes |
| Authorization | Yes | Yes | Yes | Yes |
| RLS / Multi-tenant | Yes | Yes | Yes | Yes |
| Worker System | Yes | Yes | Yes | Yes |
| Docker / Infrastructure | Yes | Yes | Yes | Yes |
| CI/CD | Yes | Yes | No | Partial |
| Testing | Yes | Yes | No | Partial |
| Integrations | Yes | Yes | Partial | Partial |
| AI Agents | Partial | No | No | No |
| Runbooks | Yes | No | No | Partial |
| Roadmap | Yes | No | No | Partial |

---

*Generated by Staffora Documentation OS | Last updated: 2026-03-28*
