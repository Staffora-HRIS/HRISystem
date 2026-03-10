---
name: state-machine-patterns
description: Implement and extend state machines for employee lifecycle, leave requests, cases, workflows, and performance cycles. Use when adding state transitions or enforcing status workflows.
---

# State Machine Patterns

## Definitions

All state machines live in `packages/shared/src/state-machines/` and are importable via `@hris/shared/state-machines`. Each exports: states enum, `canTransition*()`, `validateTransition*()`, `getValidTransitions*()`, transition metadata, and human-readable labels.

## Existing State Machines

| Machine | States | Terminal |
|---|---|---|
| **Employee lifecycle** | `pending -> active -> on_leave <-> active -> terminated` | `terminated` |
| **Leave request** | `pending -> under_review -> approved -> in_progress -> completed` (also `rejected`, `cancelled`) | `rejected`, `cancelled`, `completed` |
| **Case management** | `open -> in_progress -> resolved -> closed` (with `pending_info`, `escalated`, reopen from `resolved`) | `closed`, `cancelled` |
| **Workflow** | `draft -> pending -> in_review -> awaiting_approval -> step_approved -> approved` (with `escalated`, `delegated`, `on_hold`) | `approved`, `rejected`, `cancelled`, `expired` |
| **Performance cycle** | `draft -> active -> review -> calibration -> closed` (review/calibration can step back) | `closed` |

## Service Layer Enforcement

Always validate transitions in the service layer before persisting:

```typescript
import { canTransition } from '@hris/shared/state-machines';

async updateEmployeeStatus(id: string, newStatus: EmployeeStatus, reason: string, ctx: Context) {
  return db.withTransaction(ctx, async (tx) => {
    const employee = await repo.findById(tx, id, ctx.tenantId);
    if (!canTransition(employee.status, newStatus)) {
      throw new ConflictError(`Cannot transition from ${employee.status} to ${newStatus}`);
    }
    // ... persist status change
  });
}
```

Each machine has a prefixed variant: `canTransitionCase()`, `canTransitionLeaveRequest()`, `canTransitionWorkflow()`, `canTransitionCycle()`. The employee lifecycle uses the unprefixed `canTransition()`.

## Immutable Transition Audit

Every state change must be recorded in the corresponding status history table (e.g., `app.employee_status_history`) with actor, timestamp, reason, and previous/new status. Never update history rows -- always insert.

```typescript
await tx`
  INSERT INTO employee_status_history (id, tenant_id, employee_id, from_status, to_status, reason, changed_by, changed_at)
  VALUES (${crypto.randomUUID()}, ${ctx.tenantId}, ${employee.id},
          ${employee.status}, ${newStatus}, ${reason}, ${ctx.userId}, now())
`;
```

## Outbox Event on Transition

Every state change must emit a domain event via the outbox in the same transaction:

```typescript
await tx`
  INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
  VALUES (${crypto.randomUUID()}, ${ctx.tenantId}, 'employee', ${employee.id},
          'hr.employee.status_changed',
          ${JSON.stringify({ from: employee.status, to: newStatus, reason, actor: ctx.userId })}::jsonb,
          now())
`;
```

## Testing Transitions

Test both valid and invalid transitions. Use `validateTransition*()` for error messages:

```typescript
import { canTransition, validateTransition } from '@hris/shared/state-machines';

test('allows active -> on_leave', () => {
  expect(canTransition('active', 'on_leave')).toBe(true);
});

test('blocks terminated -> active', () => {
  expect(canTransition('terminated', 'active')).toBe(false);
  expect(validateTransition('terminated', 'active')).toContain('terminal state');
});

test('rejects invalid transition via API', async () => {
  const res = await api.patch(`/employees/${id}/status`, { status: 'active' }); // employee is terminated
  expect(res.status).toBe(409);
});
```
