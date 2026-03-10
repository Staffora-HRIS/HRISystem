---
name: outbox-pattern
description: Implement transactional outbox for reliable domain event publishing. Use when emitting domain events, handling async workflows, or working with the domain_outbox table.
---

# Outbox Pattern

## Why Outbox?
1. **Atomicity**: Event written in same transaction as business data
2. **Reliability**: No lost events even if message broker is down
3. **Consistency**: Event only published if business write succeeds

## Database Table
```sql
-- app.domain_outbox (already exists in migrations)
-- Columns: id, tenant_id, aggregate_type, aggregate_id, event_type, payload (jsonb),
--          created_at, processed_at, published_at, error, retry_count
```

## Writing Events (Service Layer — postgres.js)
```typescript
async createEmployee(ctx: TenantContext, data: Input) {
  return await this.db.begin(async (tx) => {
    // 1. Business write
    const rows = await tx`
      INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
      VALUES (${ctx.tenantId}, ${data.employeeNumber}, 'pending', ${data.hireDate})
      RETURNING *
    `;
    const employee = rows[0];

    // 2. Write event to outbox (SAME TRANSACTION)
    await tx`
      INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
      VALUES (${crypto.randomUUID()}, ${ctx.tenantId}, 'employee', ${employee.id},
              'hr.employee.created',
              ${JSON.stringify({ employee, actor: ctx.userId, timestamp: new Date().toISOString() })}::jsonb,
              now())
    `;

    return employee;
  });
}
```

## Event Type Naming
```
<module>.<aggregate>.<action>

hr.employee.created
hr.employee.terminated
time.timesheet.submitted
time.timesheet.approved
absence.leave_request.approved
talent.performance_review.completed
lms.course.completed
cases.case.escalated
```

## Outbox Processor (Worker)
```typescript
// packages/api/src/jobs/outbox-processor.ts
// Polls unprocessed events, publishes to Redis Streams
async function processOutbox() {
  const events = await db`
    SELECT * FROM app.domain_outbox
    WHERE processed_at IS NULL
    ORDER BY created_at ASC
    LIMIT 100
  `;

  for (const event of events) {
    try {
      await redis.xadd(`events:${event.event_type}`, '*', 'payload', JSON.stringify(event.payload));
      await db`UPDATE app.domain_outbox SET processed_at = now(), published_at = now() WHERE id = ${event.id}`;
    } catch (error) {
      await db`UPDATE app.domain_outbox SET retry_count = retry_count + 1, error = ${String(error)} WHERE id = ${event.id}`;
    }
  }
}
```

## Best Practices
1. Always write event in same transaction as business data
2. Make event handlers idempotent
3. Include enough context in payload for consumers
4. Process events in order by created_at
