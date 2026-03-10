# Agent Operating Instructions

## Context Files

Agents should consult these files when they contain relevant entries:

- `.claude/memories.md` — Long-term project knowledge (architecture, decisions, paths)
- `.claude/learning.md` — Debugging discoveries, failed attempts, lessons learned
- `CLAUDE.md` — Primary project instructions (always loaded automatically)

Do NOT waste time reading empty template files. Only consult memories.md and learning.md when they contain actual entries beyond their template headers.

## Memory System Rules

### Logging Discoveries

- Agents must log **debugging discoveries** in `.claude/learning.md`
- Agents must log **long-term knowledge** in `.claude/memories.md`
- Agents must NEVER silently fix complex issues without documenting the learning

### When to Update `.claude/memories.md`

Update core memory when discovering:
- Architecture insights
- Important workflows
- Project conventions
- Infrastructure details
- Permanent design decisions
- Repository structure explanations

Use the **Core Memory Entry** format defined in that file.

### When to Update `.claude/learning.md`

Append a learning entry when encountering:
- Bugs or unexpected behaviour
- Failed fix attempts
- Build errors or dependency conflicts
- Performance bottlenecks
- Hidden dependencies
- Complex debugging sessions
- Environment or tooling issues

Use the **Learning Entry** format defined in that file.

### Failed Attempt Tracking

If an attempted fix fails, it MUST be recorded in the **Failed Attempts** section of `.claude/learning.md`. This prevents future agents from repeating the same mistake.

## Entry Quality Standards

All entries must be:
- **Clear** — Understandable without additional context
- **Concise** — No unnecessary detail
- **Root-cause focused** — Explain WHY the issue happened
- **Actionable** — Useful for future agents encountering similar situations

Avoid vague entries like "fixed bug". Always explain the root cause.

## Zero Manual Maintenance

This memory system requires no manual maintenance. Agents automatically maintain both files as part of their normal workflow.
