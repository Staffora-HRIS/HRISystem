# AI Agents and Skills

*Last updated: 2026-03-28*

This section documents the AI development agent system used in the Staffora platform, including specialised agents, the skills framework, and the memory system that enables continuity across development sessions.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| **[Agent Catalog](agent-catalog.md)** | Comprehensive documentation of all 10 specialised development agents: purpose, when to use, domain knowledge, and example use cases |
| **[Skill Catalog](skill-catalog.md)** | Documentation of all 14 development skills: what they provide, how to invoke them, and when to use skills vs agents |
| **[Memory System](memory-system.md)** | How the two-tier memory system works: `memories.md` for stable project truths, `learning.md` for debugging discoveries, entry formats, and rules |
| **[Agent System Overview](agent-system.md)** | Architecture overview: context hierarchy, context flow between agents, swarm mode, and operating rules |

---

## Quick Reference

### Agent Overview

The Staffora platform uses 10 specialised AI agents for development tasks. Each agent is a domain expert configured with deep knowledge of a specific subsystem -- its database schema, API patterns, business rules, and testing requirements.

Agents are defined as Markdown files in `.claude/agents/` and designed for use with Claude Code. They operate within the same codebase and share context through a two-tier memory system.

| Agent | Domain | Definition File |
|-------|--------|----------------|
| **Platform Architect** | Infrastructure, Docker, PostgreSQL, RLS, Redis, Auth, RBAC | `hris-platform-architect.md` |
| **Core HR Developer** | Employees, org structure, contracts, positions, compensation | `hris-core-hr-developer.md` |
| **Frontend Architect** | React 18, React Router v7, React Query, Tailwind CSS | `hris-frontend-architect.md` |
| **Absence Module Builder** | Leave types, policies, balances, requests, accruals | `hris-absence-module-builder.md` |
| **Time and Attendance Developer** | Time events, schedules, shifts, timesheets, geo-fence | `time-attendance-module-developer.md` |
| **Cases Module Developer** | Case management, SLA tracking, escalation, PDF bundles | `cases-module-developer.md` |
| **LMS Module Developer** | Courses, enrollments, learning paths, certificates | `lms-module-developer.md` |
| **Talent Module Developer** | Performance cycles, goals/OKRs, 360 feedback, calibration | `talent-module-developer.md` |
| **Onboarding Module Developer** | Templates, checklists, task tracking, buddy assignment | `onboarding-module-developer.md` |
| **Security Module Developer** | Field-level permissions, portal access, manager hierarchy | `security-module-developer.md` |

For detailed documentation including domain knowledge, example use cases, and selection guidance, see the **[Agent Catalog](agent-catalog.md)**.

### Skill Overview

Skills are domain-specific guidance documents invoked with the `/` prefix in Claude Code. They provide focused pattern documentation for common development tasks.

| Skill | Category | Purpose |
|-------|----------|---------|
| `/api-conventions` | Backend | URL structure, pagination, error responses, TypeBox schemas |
| `/backend-module-development` | Backend | 5-file module pattern with complete code templates |
| `/postgres-js-patterns` | Backend | Tagged template queries, transactions, RLS context |
| `/outbox-pattern` | Backend | Transactional outbox for domain events |
| `/state-machine-patterns` | Backend | Status workflows, transition validation, audit |
| `/effective-dating-patterns` | Backend | Time-versioned records, overlap prevention |
| `/testing-patterns` | Backend | Integration tests for RLS, idempotency, outbox |
| `/database-migrations-rls` | Database | Migration naming, table templates, RLS policies |
| `/better-auth-integration` | Auth | BetterAuth endpoints, sessions, tenant context |
| `/frontend-react-components` | Frontend | Routes, React Query hooks, permission guards |
| `/docker-development` | Infrastructure | Local dev commands, environment setup |
| `/docker-build` | Infrastructure | Full container rebuild steps |
| `/hris-patterns` | Reference | Coding patterns and project conventions |
| `/repo-patterns` | Reference | Git history analysis and commit conventions |

For detailed documentation including what each skill provides and when to use it, see the **[Skill Catalog](skill-catalog.md)**.

### Memory System Overview

The memory system provides continuity across development sessions through two complementary files:

| File | Purpose | Type |
|------|---------|------|
| `.claude/memories.md` | Stable truths about the project (architecture, decisions, paths) | Long-term, rarely changes |
| `.claude/learning.md` | Debugging discoveries, failed attempts, performance findings | Temporal, grows over time |

Both files are checked into the repository and shared across all agents. An insight discovered by one agent is immediately available to every other agent.

For detailed documentation including entry formats, rules, and current knowledge base summary, see the **[Memory System](memory-system.md)**.

---

## Key Concepts

### Why Specialised Agents?

A monolithic AI assistant lacks the depth needed for an enterprise HRIS platform with 120+ modules. Specialised agents solve this by:

- **Carrying domain expertise** -- Each agent knows the exact database tables, column names, state machines, and business rules for its module.
- **Enforcing patterns** -- Agents follow the platform's mandatory patterns (RLS, outbox, effective dating) because these patterns are embedded in their instructions.
- **Preventing regressions** -- The memory system records past debugging discoveries and failed attempts, so agents avoid repeating mistakes.
- **Enabling parallel work** -- Multiple agents can work on different modules simultaneously (swarm mode).

### Agent Properties

All 10 agents share these configuration properties:

- **Model**: `opus` -- Uses the most capable model for complex reasoning
- **Swarm**: `true` -- Can be invoked as sub-agents for cross-domain tasks
- **Context**: Inherits from `CLAUDE.md` + `.claude/CLAUDE.md` + agent-specific definition
- **Memory**: Reads and writes to both `.claude/memories.md` and `.claude/learning.md`

### Skills vs Agents

| Use a Skill when... | Use an Agent when... |
|---------------------|---------------------|
| You need pattern guidance for a specific task | You need end-to-end module implementation |
| The task is narrow (one migration, one hook) | The task crosses multiple layers (DB + API + tests) |
| You know the pattern but need the exact syntax | You need deep domain knowledge (state machines, business rules) |
| Quick reference is sufficient | Complex reasoning is required |

### Context Hierarchy

```
CLAUDE.md (always loaded)
    |
.claude/CLAUDE.md (always loaded)
    |
.claude/agents/{agent-name}.md (agent-specific)
    |
.claude/memories.md (consulted when relevant)
    |
.claude/learning.md (consulted when relevant)
```

---

## Source Files

All agent and skill definitions are stored in the `.claude/` directory:

```
.claude/
├── CLAUDE.md                              # Agent operating rules and memory system
├── memories.md                            # Long-term project knowledge
├── learning.md                            # Debugging discoveries and lessons
├── agents/                                # Agent definitions (10 files)
│   ├── hris-platform-architect.md
│   ├── hris-core-hr-developer.md
│   ├── hris-frontend-architect.md
│   ├── hris-absence-module-builder.md
│   ├── time-attendance-module-developer.md
│   ├── cases-module-developer.md
│   ├── lms-module-developer.md
│   ├── talent-module-developer.md
│   ├── onboarding-module-developer.md
│   └── security-module-developer.md
└── Skills/                                # Skill definitions (14 directories)
    ├── api-conventions/SKILL.md
    ├── backend-module-development/SKILL.md
    ├── better-auth-integration/SKILL.md
    ├── database-migrations-rls/SKILL.md
    ├── docker-build/SKILL.md
    ├── docker-development/SKILL.md
    ├── effective-dating-patterns/SKILL.md
    ├── frontend-react-components/SKILL.md
    ├── hris-patterns/SKILL.md
    ├── outbox-pattern/SKILL.md
    ├── postgres-js-patterns/SKILL.md
    ├── repo-patterns/SKILL.md
    ├── state-machine-patterns/SKILL.md
    └── testing-patterns/SKILL.md
```

---

## Related Documents

- [Architecture Overview](../02-architecture/ARCHITECTURE.md) -- System design reference
- [Repository Map](../02-architecture/repository-map.md) -- Codebase layout
- [Design Patterns](../08-patterns/README.md) -- Reusable design patterns
- [CLAUDE.md](../../CLAUDE.md) -- Primary project instructions
- [.claude/CLAUDE.md](../../.claude/CLAUDE.md) -- Agent operating rules
