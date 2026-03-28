# Memory System

> Last updated: 2026-03-28

This document describes the two-tier memory system used by AI development agents in the Staffora platform. The memory system provides continuity across development sessions, prevents agents from repeating past mistakes, and accumulates institutional knowledge about the codebase.

---

## Table of Contents

- [Overview](#overview)
- [Two-Tier Architecture](#two-tier-architecture)
- [memories.md -- Long-Term Project Knowledge](#memoriesmd----long-term-project-knowledge)
- [learning.md -- Debugging Discoveries](#learningmd----debugging-discoveries)
- [User Memory](#user-memory)
- [Entry Formats](#entry-formats)
- [Memory System Rules](#memory-system-rules)
- [How Agents Use Memory](#how-agents-use-memory)
- [Memory File Locations](#memory-file-locations)
- [Current Knowledge Base Summary](#current-knowledge-base-summary)
- [Related Documents](#related-documents)

---

## Overview

The memory system solves a fundamental problem with AI-assisted development: without persistent memory, every new development session starts from zero. Agents would re-discover the same bugs, repeat the same failed approaches, and miss the same architectural nuances every time.

Staffora's memory system has three layers:

1. **Project memory** (`.claude/memories.md`) -- Stable truths about the project that rarely change
2. **Learning memory** (`.claude/learning.md`) -- Temporal debugging knowledge, failed attempts, and performance findings
3. **User memory** (`.claude/projects/.../memory/`) -- User-level preferences and feedback that persist across all conversations

The first two are checked into the repository and shared across all agents. The third is local to the user's Claude Code installation.

---

## Two-Tier Architecture

```
.claude/memories.md                    .claude/learning.md
(Stable project truths)                (Temporal debugging knowledge)
                |                                    |
                |   Shared across all agents         |
                +------------------------------------+
                |
        Consulted when relevant
                |
        +-------+-------+
        |               |
   Architecture    Debugging
   decisions       discoveries
   Module quality  Failed attempts
   Key constraints Performance issues
   Important paths Environment problems
```

The two files serve complementary purposes. `memories.md` answers "how does the project work?" while `learning.md` answers "what went wrong before and how was it fixed?"

---

## memories.md -- Long-Term Project Knowledge

**File:** `.claude/memories.md`
**Purpose:** Stores stable truths about the project that rarely change.

### What It Contains

| Section | Content |
|---------|---------|
| **Project Purpose** | Staffora platform description and module list |
| **System Architecture** | Monorepo structure, backend layers, frontend layers, background processing |
| **Core Technologies** | Technology stack table (Bun, Elysia.js, React 18, BetterAuth, PostgreSQL 16, Redis 7) |
| **Critical Workflows** | Build pipeline, database migrations, local development, background processing |
| **Key Constraints** | RLS, effective dating, outbox pattern, idempotency, state machines, cursor pagination, URL versioning |
| **Important Project Decisions** | Multi-tenant via RLS, outbox over direct events, Elysia plugin architecture, React Router v7 framework mode, Bun runtime |
| **Important Paths** | Directory map for packages, migrations, docker, agent config |
| **Agent Operating Rules** | Seven rules all agents must follow |
| **Core Memory Entries** | Dated entries recording major architectural discoveries |

### When Agents Update It

Agents append a new Core Memory Entry when discovering:

- Architecture insights or structural patterns
- Important workflows or operational procedures
- Project conventions or naming rules
- Infrastructure details or deployment configuration
- Permanent design decisions and their rationale
- Repository structure explanations

### Current Key Insights

The following insights have been recorded and are available to all agents:

1. **Knowledge system initialization** (2026-03-10): The two-tier memory system was established.
2. **Module quality tiers** (2026-03-10): The HR module is the gold-standard implementation. Talent, cases, LMS, and onboarding have known quality issues. The `@staffora/shared` package is unused in production code.
3. **Test suite assessment** (2026-03-10): Most test files are hollow (assert local variables, not API behavior). Only RLS, idempotency, outbox, effective-dating, and state-machine integration tests are genuine. Test factories and helpers are well-built but unused.
4. **Horizontal scaling** (2026-03-17): API service is stateless and supports horizontal scaling via Docker Compose `--scale`. Nginx load balancer uses `least_conn` strategy.
5. **SSO module** (2026-03-17): Enterprise SAML/OIDC SSO module added at `packages/api/src/modules/sso/`. OIDC authorization code flow is implemented. SAML configuration can be stored but the actual SAML protocol flow is not yet implemented.

---

## learning.md -- Debugging Discoveries

**File:** `.claude/learning.md`
**Purpose:** Records temporal debugging knowledge, failed attempts, and performance findings to prevent agents from repeating mistakes.

### Categories

| Category | Purpose | Example Entries |
|----------|---------|-----------------|
| **Architecture Learnings** | Structural issues and their solutions | `@staffora/shared` unused in production, broken outbox patterns in cases/LMS/onboarding |
| **Debugging Learnings** | Runtime bugs and their fixes | CSRF protection non-functional, broken database triggers, wrong table/column names in repositories, frontend-backend API path mismatches |
| **Failed Attempts** | Solutions that were tried but failed | Prevents future agents from repeating the same mistakes |
| **Performance Learnings** | N+1 queries, missing caching, unbounded queries | Employee list with 3 correlated subqueries per row, outbox processor without batching, zero module-level caching |
| **Agent Workflow Improvements** | Better ways agents should operate | Process improvements discovered during development |
| **Environment / Tooling Issues** | TypeScript config, dependency skew, CI/CD gaps | `strict: false` in tsconfig, Redis without authentication, version skew in better-auth and typebox |

### When Agents Update It

Agents append a new Learning Entry when encountering:

- Bugs or unexpected behaviour
- Failed fix attempts (recorded in the Failed Attempts section)
- Build errors or dependency conflicts
- Performance bottlenecks
- Hidden dependencies between modules
- Complex debugging sessions requiring investigation
- Environment or tooling issues

### Current Key Learnings

The following significant learnings have been recorded:

1. **Broken outbox pattern** (2026-03-10): Cases, LMS, and onboarding services wrote domain events in a separate transaction. The correct pattern (from the HR module) passes the `tx` handle from the business transaction.
2. **Schema mismatches** (2026-03-10): Multiple repositories referenced tables/columns that do not exist in migrations. Talent uses `review_cycles` (actual: `performance_cycles`), LMS uses `course_enrollments` (actual: `assignments`), workflows module had deep mismatches across all four tables.
3. **CSRF was non-functional** (2026-03-10, resolved 2026-03-16): CSRF tokens were trivially forgeable (plain base64, no HMAC). Fixed with HMAC-SHA256 via `generateCsrfToken()`/`validateCsrfToken()`.
4. **32 tables missing INSERT RLS policies** (2026-03-10): Migrations 0098-0106 consistently omitted the `FOR INSERT WITH CHECK` policy.
5. **Most tests are hollow** (2026-03-10): Route tests, security tests, performance tests, chaos tests, E2E tests, and frontend tests assert local variables, not actual API behavior.
6. **UK compliance** (2026-03-16): Multiple US-specific defaults (SSN validation, FLSA status, USD currency, en-US locale) were embedded throughout the codebase. All replaced with UK equivalents.
7. **Outbox processor column name mismatch** (2026-03-14): Code referenced `locked_until` and `last_error` columns that do not exist; actual columns are `next_retry_at` and `error_message`.
8. **Better Auth table sync** (2026-03-17): When creating users outside Better Auth's API, you must create records in all three tables atomically: `app.users`, `app."user"`, and `app."account"`.
9. **Distributed lock safety** (2026-03-17): Simple `SET NX EX` locking replaced with Redlock-style implementation with fencing tokens, auto-renewal, and clock drift compensation.

---

## User Memory

**Directory:** `.claude/projects/.../memory/`
**Purpose:** Stores user-level preferences and feedback that persist across all conversations for a specific user.

User memory is not checked into the repository. It is stored in the user's local Claude Code configuration directory. It contains:

| Memory Type | Purpose | Examples |
|-------------|---------|----------|
| **Feedback** | User preferences and corrections | "ALL authentication must use Better Auth", "Always achieve 100/100 scores", "One agent per TODO item" |
| **Project** | Project-specific knowledge the user has provided | "UK-only HRIS, US defaults removed", "GDPR-compliant deployment required", "Sales site moved to separate repo" |

User memory entries are indexed in a `MEMORY.md` file with links to individual memory files. They are automatically maintained by the Claude Code system based on user interactions.

### Current User Memory Entries

- Better Auth is the mandatory auth system -- no custom auth anywhere
- Client portal authentication must use BetterAuth
- When a score is not 100/100, fix everything until it is
- Launch one dedicated agent per TODO item, never batch multiple items
- UK-only HRIS; US defaults were removed on 2026-03-16
- Deployment must be GDPR compliant with UK data residency
- Sales/marketing site was removed from this repo on 2026-03-17

---

## Entry Formats

### Core Memory Entry (memories.md)

```markdown
### Core Memory Entry

Date: YYYY-MM-DD
Agent: Agent name

Topic: Short topic description

Context: What was being worked on

Core Knowledge: The stable truth discovered

Reason: Why this knowledge matters
```

### Learning Entry (learning.md)

```markdown
### Learning Entry

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

### Entry Quality Standards

All entries must be:

| Standard | Description |
|----------|-------------|
| **Clear** | Understandable without additional context |
| **Concise** | No unnecessary detail |
| **Root-cause focused** | Explain WHY the issue happened, not just WHAT happened |
| **Actionable** | Useful for future agents encountering similar situations |

Avoid vague entries like "fixed bug". Always explain the root cause and how to prevent recurrence.

---

## Memory System Rules

These rules are defined in `.claude/CLAUDE.md` and are mandatory for all agents:

1. **Log debugging discoveries**: Agents must append Learning Entries to `.claude/learning.md` when encountering bugs, unexpected behaviour, or complex debugging sessions.
2. **Log long-term knowledge**: Agents must append Core Memory Entries to `.claude/memories.md` when discovering architecture insights, project conventions, or permanent design decisions.
3. **Never silently fix**: Agents must NEVER silently fix complex issues without documenting the learning. A fix without a learning entry means the knowledge is lost.
4. **Record failed attempts**: If an attempted fix fails, it MUST be recorded in the Failed Attempts section of `learning.md`. This prevents future agents from repeating the same mistake.
5. **Quality over quantity**: Entries must meet the quality standards (clear, concise, root-cause focused, actionable). No placeholder entries.
6. **Zero manual maintenance**: The memory system requires no manual maintenance. Agents automatically maintain both files as part of their normal workflow.

---

## How Agents Use Memory

### Before Starting Work

1. Check `.claude/memories.md` for module quality tiers and established patterns
2. Check `.claude/learning.md` for known bugs, failed attempts, and schema mismatches in the relevant module
3. Use the HR module (`packages/api/src/modules/hr/`) as the gold-standard reference implementation

### During Work

- Follow the patterns described in `memories.md` (layer pattern, RLS, outbox, etc.)
- Avoid approaches documented as failed in `learning.md`
- Verify table/column names against migration files (a recurring source of bugs)

### After Completing Work

1. If a bug or unexpected behaviour was discovered, append a Learning Entry to `learning.md`
2. If an architecture insight or convention was discovered, append a Core Memory Entry to `memories.md`
3. If a fix attempt failed, record it in the Failed Attempts section of `learning.md`

### Context Loading Order

Agents receive context from multiple sources in this order:

```
1. CLAUDE.md (always loaded)
   -- Project instructions, build commands, architecture overview

2. .claude/CLAUDE.md (always loaded)
   -- Agent operating rules, memory system rules, entry quality standards

3. .claude/agents/{agent-name}.md (loaded for specific agent)
   -- Domain expertise, module scope, mandatory patterns, quality checklist

4. .claude/memories.md (consulted when relevant)
   -- Long-term project knowledge, architecture decisions, module quality tiers

5. .claude/learning.md (consulted when relevant)
   -- Debugging discoveries, failed attempts, performance findings
```

---

## Memory File Locations

| File | Path | Checked Into Git | Shared Across Agents |
|------|------|:----------------:|:--------------------:|
| Project memory | `.claude/memories.md` | Yes | Yes |
| Learning memory | `.claude/learning.md` | Yes | Yes |
| Agent operating rules | `.claude/CLAUDE.md` | Yes | Yes |
| User memory index | `.claude/projects/.../memory/MEMORY.md` | No | No (user-local) |
| User memory entries | `.claude/projects/.../memory/*.md` | No | No (user-local) |

---

## Current Knowledge Base Summary

As of 2026-03-28, the memory system contains:

| Metric | Count |
|--------|-------|
| Core Memory Entries in `memories.md` | 5 |
| Learning Entries in `learning.md` | 12 |
| Failed Attempt Entries | 0 (section exists but empty) |
| User Memory Entries | 7 |
| Categories covered in `learning.md` | Architecture, Security, Database, Testing, Performance, Environment, DevOps, Auth |

The knowledge spans the full stack: database schema mismatches, broken security patterns, hollow test suites, US-specific defaults, outbox pattern violations, CI/CD gaps, auth table synchronisation issues, and distributed locking safety.

---

## Related Documents

- [Agent Catalog](agent-catalog.md) -- All 10 specialised development agents
- [Skill Catalog](skill-catalog.md) -- Available development skills and how to invoke them
- [Agent System Overview](agent-system.md) -- Architecture and context hierarchy
- [CLAUDE.md](../../CLAUDE.md) -- Primary project instructions
- [.claude/CLAUDE.md](../../.claude/CLAUDE.md) -- Agent operating rules and memory system rules
- [.claude/memories.md](../../.claude/memories.md) -- The actual long-term memory file
- [.claude/learning.md](../../.claude/learning.md) -- The actual debugging discoveries file
