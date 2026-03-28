# Architecture Decision Records (ADRs)

*Last updated: 2026-03-28*

This directory contains Architecture Decision Records for the Staffora HRIS platform. ADRs capture the context, reasoning, and consequences of significant architectural decisions so that future contributors understand **why** the system is built the way it is.

## Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| [ADR-001](001-better-auth-for-authentication.md) | Use Better Auth for authentication | Accepted | 2026-01-07 |
| [ADR-002](002-redis-streams-for-async-processing.md) | Use Redis Streams for async event processing | Accepted | 2026-01-07 |
| [ADR-003](003-transactional-outbox-pattern.md) | Transactional outbox pattern for domain events | Accepted | 2026-01-07 |
| [ADR-004](004-row-level-security-multi-tenant.md) | Row-Level Security for multi-tenant isolation | Accepted | 2026-01-07 |
| [ADR-005](005-dual-user-table-architecture.md) | Dual user table architecture (app.users + app."user") | Accepted | 2026-01-07 |
| [ADR-006](006-effective-dating-for-hr-data.md) | Effective dating for HR data versioning | Accepted | 2026-01-07 |
| [ADR-007](007-bun-elysia-backend-runtime.md) | Bun + Elysia.js as backend runtime | Accepted | 2026-01-07 |
| [ADR-008](008-react-router-v7-framework-mode.md) | React Router v7 framework mode for frontend | Accepted | 2026-01-07 |

## ADR Template

When creating a new ADR, use the following template:

```markdown
# ADR-NNN: [Short Title]

**Status:** Proposed | Accepted | Deprecated | Superseded by [ADR-NNN]
**Date:** YYYY-MM-DD
**Authors:** [Names or roles]

## Context

[Describe the situation, forces at play, and the problem that needs to be solved.
Include technical constraints, business requirements, and any relevant background.]

## Decision

[State the decision clearly and concisely. Explain what you are going to do.]

## Consequences

### Positive
- [Benefit 1]
- [Benefit 2]

### Negative
- [Tradeoff 1]
- [Tradeoff 2]

### Neutral
- [Observation 1]

## Alternatives Considered

### [Alternative 1]
[Why it was rejected]

### [Alternative 2]
[Why it was rejected]

## References

- [Link to relevant code, documentation, or external resources]
```

## Conventions

- **Numbering**: ADRs are numbered sequentially (001, 002, ...). Never reuse a number.
- **Immutability**: ADRs should not be modified after acceptance. If a decision changes, create a new ADR that supersedes the old one and update the old ADR's status.
- **File naming**: `NNN-short-kebab-case-title.md`
- **Status lifecycle**: Proposed -> Accepted -> (optionally) Deprecated or Superseded
- **Scope**: Record decisions that are hard to reverse, affect multiple modules, or would surprise a new team member.
