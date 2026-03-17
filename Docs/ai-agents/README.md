# AI Agents and Skills

*Last updated: 2026-03-17*

This document describes the AI agent system used in Staffora development, including specialized agents, the skills framework, and the memory system that enables continuity across development sessions.

---

## Table of Contents

- [Agent Overview](#agent-overview)
- [Available Agents](#available-agents)
- [Agent Architecture](#agent-architecture)
- [Skills System](#skills-system)
- [Memory System](#memory-system)
- [Usage Guide](#usage-guide)
- [Related Documents](#related-documents)

---

## Agent Overview

The Staffora platform uses specialized AI agents for development tasks. Each agent is a domain expert configured with deep knowledge of a specific subsystem -- its database schema, API patterns, business rules, and testing requirements.

Agents are defined as Markdown files in `.claude/agents/` and are designed for use with Claude Code (claude.ai/code). They operate within the same codebase and share context through a two-tier memory system.

### Why Specialized Agents?

A monolithic AI assistant lacks the depth needed for an enterprise HRIS platform with 72+ modules. Specialized agents solve this by:

- **Carrying domain expertise** -- Each agent knows the exact database tables, column names, state machines, and business rules for its module.
- **Enforcing patterns** -- Agents follow the platform's mandatory patterns (RLS, outbox, effective dating) because these patterns are embedded in their instructions.
- **Preventing regressions** -- The memory system records past debugging discoveries and failed attempts, so agents avoid repeating mistakes.
- **Enabling parallel work** -- Multiple agents can work on different modules simultaneously (swarm mode).

---

## Available Agents

| Agent | File | Domain | Key Responsibilities |
|-------|------|--------|---------------------|
| **Platform Architect** | `hris-platform-architect.md` | Infrastructure | Docker, PostgreSQL migrations, RLS policies, Redis caching, Elysia plugins, BetterAuth, RBAC, audit logging, worker processes |
| **Core HR Developer** | `hris-core-hr-developer.md` | Core HR | Employee lifecycle, org structure, contracts, positions, compensation, effective dating, reporting lines |
| **Frontend Architect** | `hris-frontend-architect.md` | Frontend | React components, React Router v7, React Query hooks, permission routing, Tailwind CSS, UI patterns |
| **Absence Module Builder** | `hris-absence-module-builder.md` | Absence | Leave types, leave requests, balance calculations, accruals, ledger patterns, statutory leave (UK) |
| **Time & Attendance Developer** | `time-attendance-module-developer.md` | Time | Time events, schedules, shifts, timesheets, clock in/out, geofence, schedule assignments |
| **Cases Module Developer** | `cases-module-developer.md` | Cases | Case management, SLA tracking, escalation workflows, case comments, PDF bundle generation |
| **LMS Module Developer** | `lms-module-developer.md` | Learning | Courses, assignments, learning paths, completions, certificates, CPD records, training budgets |
| **Talent Module Developer** | `talent-module-developer.md` | Talent | Performance reviews, goals, competency assessments, calibration, performance cycles |
| **Onboarding Module Developer** | `onboarding-module-developer.md` | Onboarding | Onboarding templates/checklists, task tracking, document collection, new starter workflows |
| **Security Module Developer** | `security-module-developer.md` | Security | Field-level permissions, portal access controls, manager hierarchy, data visibility rules |

### Agent Properties

All agents share these configuration properties:

- **Model**: `opus` -- Uses the most capable model for complex reasoning
- **Swarm**: `true` -- Can be invoked as sub-agents by other agents for cross-domain tasks
- **Color**: Varies by agent (visual identification in tooling)

---

## Agent Architecture

### Context Hierarchy

Agents receive context from multiple sources, loaded in this order:

```
CLAUDE.md (always loaded)
    |
    +-- Project instructions, build commands, architecture overview
    |
.claude/CLAUDE.md (always loaded)
    |
    +-- Agent operating rules, memory system rules, entry quality standards
    |
.claude/agents/{agent-name}.md (loaded for specific agent)
    |
    +-- Domain expertise, module scope, mandatory patterns, quality checklist
    |
.claude/memories.md (consulted when relevant)
    |
    +-- Long-term project knowledge, architecture decisions, module quality tiers
    |
.claude/learning.md (consulted when relevant)
    |
    +-- Debugging discoveries, failed attempts, performance findings
```

### Context Flow Between Agents

When agents work together (swarm mode), they share context through:

1. **CLAUDE.md** -- The primary project instructions that all agents read. Contains the tech stack, mandatory patterns, build commands, and architecture overview.
2. **Memory files** -- Both `.claude/memories.md` and `.claude/learning.md` are shared across all agents. An insight discovered by the Platform Architect is immediately available to the Frontend Architect.
3. **Code itself** -- Agents read the actual codebase. The HR module serves as the gold-standard reference implementation.

### Agent Operating Rules

From `.claude/CLAUDE.md`, all agents must follow these rules:

1. **Read before writing** -- Always read existing code before modifying. Understand the module's pattern first.
2. **Follow the layer pattern** -- `routes.ts` -> `service.ts` -> `repository.ts`. Do not bypass layers.
3. **RLS on every migration** -- Any new tenant-owned table must include RLS setup in the same migration.
4. **Test what matters** -- Integration tests must verify RLS isolation, idempotency, outbox atomicity, effective-date overlap, and state machine transitions.
5. **Document discoveries** -- Log debugging findings in `.claude/learning.md`. Log architecture insights in `.claude/memories.md`.
6. **Never silently fix** -- Complex issues must be documented before or after fixing.
7. **Minimal changes** -- Do not refactor surrounding code. Do not add features beyond what is requested.

---

## Skills System

Skills are domain-specific guidance documents that provide focused instructions for common development tasks. They are invoked with the `/` prefix in Claude Code (e.g., `/database-migrations-rls`).

### Available Skills

| Skill | Directory | Purpose |
|-------|-----------|---------|
| `/api-conventions` | `.claude/Skills/api-conventions/` | API design patterns: URL versioning, cursor pagination, error responses, TypeBox schema conventions |
| `/backend-module-development` | `.claude/Skills/backend-module-development/` | Creating new Elysia.js modules: the 5-file pattern (schemas, repository, service, routes, index) |
| `/database-migrations-rls` | `.claude/Skills/database-migrations-rls/` | Writing PostgreSQL migrations with Row-Level Security, naming conventions, RLS policy templates |
| `/postgres-js-patterns` | `.claude/Skills/postgres-js-patterns/` | Database query patterns using postgres.js tagged templates, transactions, tenant context |
| `/effective-dating-patterns` | `.claude/Skills/effective-dating-patterns/` | Time-versioned records with `effective_from`/`effective_to`, overlap prevention under transactions |
| `/outbox-pattern` | `.claude/Skills/outbox-pattern/` | Domain event publishing via transactional outbox, outbox table schema, worker consumption |
| `/state-machine-patterns` | `.claude/Skills/state-machine-patterns/` | Status workflow enforcement, transition validation, immutable transition audit |
| `/testing-patterns` | `.claude/Skills/testing-patterns/` | Integration tests for RLS, idempotency, outbox atomicity, test helpers and factories |
| `/frontend-react-components` | `.claude/Skills/frontend-react-components/` | React component patterns, React Query hooks, permission guards, Tailwind styling |
| `/better-auth-integration` | `.claude/Skills/better-auth-integration/` | BetterAuth configuration, session management, MFA flows, cookie setup |
| `/docker-development` | `.claude/Skills/docker-development/` | Docker Compose management, container configuration, local development environment |
| `/docker-build` | `.claude/Skills/docker-build/` | Docker image building, multi-stage builds, production container optimization |
| `/hris-patterns` | `.claude/Skills/hris-patterns/` | HR-specific patterns: employee lifecycle, org hierarchy, compensation, UK compliance |

### When to Use Skills vs Agents

| Scenario | Use | Why |
|----------|-----|-----|
| Creating a new backend module end-to-end | Agent | Agents have full module context (tables, state machines, business rules) |
| Writing a single migration with RLS | Skill (`/database-migrations-rls`) | Focused guidance for a specific task pattern |
| Adding a React Query hook | Skill (`/frontend-react-components`) | Pattern guidance without full frontend context |
| Implementing case escalation workflows | Agent (`cases-module-developer`) | Requires deep understanding of case state machine |
| Learning how postgres.js tagged templates work | Skill (`/postgres-js-patterns`) | Reference material for query patterns |

---

## Memory System

The memory system provides continuity across development sessions through two complementary files.

### .claude/memories.md -- Long-Term Project Knowledge

**Purpose**: Stores stable truths about the project that rarely change.

**Contents include**:
- Project architecture overview
- Core technology stack
- Critical workflows (build, migrations, local dev, background processing)
- Key constraints (RLS, effective dating, outbox, idempotency, state machines)
- Important project decisions and their rationale
- Module quality tiers (which modules to trust as reference implementations)
- Test suite assessment (which tests are real vs hollow)
- Important file paths

**When agents update it**: Upon discovering architecture insights, permanent design decisions, project conventions, or infrastructure details.

**Current key insights stored**:
- The HR module is the gold-standard implementation; follow its patterns
- Modules like talent, cases, LMS, and onboarding have known quality issues
- Most test files are hollow (assert local variables, not API behavior)
- Test factories and helpers are well-built but underused

### .claude/learning.md -- Debugging Discoveries

**Purpose**: Records temporal debugging knowledge, failed attempts, and performance findings to prevent agents from repeating mistakes.

**Categories**:
- **Architecture Learnings** -- Structural issues and their solutions (e.g., `@staffora/shared` being unused, broken outbox patterns)
- **Debugging Learnings** -- Runtime bugs and fixes (e.g., wrong table/column names, missing RLS context, CSRF bypass)
- **Failed Attempts** -- Solutions that were tried and failed (prevents repetition)
- **Performance Learnings** -- N+1 queries, missing caching, unbounded queries
- **Agent Workflow Improvements** -- Better ways agents should operate
- **Environment / Tooling Issues** -- TypeScript config, dependency skew, CI/CD gaps

**When agents update it**: Upon encountering bugs, unexpected behaviour, build errors, performance issues, complex debugging sessions, or failed fix attempts.

### Entry Format

Both files use structured entry formats to ensure consistency:

```markdown
### Core Memory Entry (memories.md)
Date: YYYY-MM-DD
Agent: Agent name
Topic: Short topic description
Context: What was being worked on
Core Knowledge: The stable truth discovered
Reason: Why this knowledge matters

### Learning Entry (learning.md)
Date: YYYY-MM-DD
Agent: Agent name
Category: Architecture | Debugging | Performance | Environment
Context: What triggered the discovery
Problem: What went wrong
Root Cause: Why it went wrong
Solution: How it was fixed
Prevention: How to prevent recurrence
Affected Files: List of files involved
Notes: Additional context
```

### Memory System Rules

1. Agents must log debugging discoveries in `.claude/learning.md`
2. Agents must log long-term knowledge in `.claude/memories.md`
3. Agents must NEVER silently fix complex issues without documenting the learning
4. Failed attempts MUST be recorded to prevent future agents from repeating them
5. Entries must be clear, concise, root-cause focused, and actionable
6. The system requires zero manual maintenance -- agents maintain both files automatically

---

## Usage Guide

### Invoking an Agent

In Claude Code, agents can be invoked for domain-specific tasks. The agent selection is based on the task domain:

| Task | Agent to Use |
|------|-------------|
| "Create a new database migration for employee warnings" | Platform Architect |
| "Add the overtime calculation endpoint" | Time & Attendance Developer |
| "Build the leave request approval form" | Frontend Architect |
| "Fix the case escalation state machine" | Cases Module Developer |
| "Add learning path tracking to the LMS" | LMS Module Developer |
| "Implement performance review calibration" | Talent Module Developer |

### Invoking a Skill

Skills are invoked with the `/` prefix for focused guidance:

```
/database-migrations-rls     -- When writing a migration
/outbox-pattern              -- When emitting domain events
/testing-patterns            -- When writing integration tests
/effective-dating-patterns   -- When implementing temporal data
/api-conventions             -- When designing API endpoints
```

### Checking Memory Before Work

Before starting a task in an unfamiliar area, check the memory files:

1. Read `.claude/memories.md` for module quality tiers and known patterns
2. Read `.claude/learning.md` for known bugs, failed attempts, and schema mismatches
3. Use the HR module (`packages/api/src/modules/hr/`) as the reference implementation

### After Completing Work

After completing a non-trivial task:

1. If you discovered a bug or unexpected behaviour, append a Learning Entry to `.claude/learning.md`
2. If you discovered an architecture insight or convention, append a Core Memory Entry to `.claude/memories.md`
3. If a fix attempt failed, record it in the Failed Attempts section of `.claude/learning.md`

---

## Related Documents

- [CLAUDE.md](../../CLAUDE.md) -- Primary project instructions (loaded by all agents)
- [.claude/CLAUDE.md](../../.claude/CLAUDE.md) -- Agent operating rules and memory system
- [.claude/memories.md](../../.claude/memories.md) -- Long-term project knowledge
- [.claude/learning.md](../../.claude/learning.md) -- Debugging discoveries and lessons
- [Architecture Overview](../architecture/ARCHITECTURE.md) -- System design reference
- [Repository Map](../architecture/repository-map.md) -- Codebase layout
- [Testing Patterns](../patterns/README.md) -- Reusable design patterns
