---
name: outbox-pattern
description: Implement transactional outbox for reliable domain event publishing. Use when emitting domain events, handling async workflows, or working with the domain_outbox table.
---

# Outbox Pattern

## Why Outbox?
1. **Atomicity**: Event written in same transaction as business data
2. **Reliability**: No lost events even if message broker is down
3. **Consistency**: Event only published if business write succeeds

## Database Schema
```sql
CREATE TABLE app.domain_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0
);
```

## Writing Events (Service Layer)
```typescript
async createEmployee(data: Input, ctx: Context) {
  return db.transaction(async (tx) => {
    // 1. Business write
    const [employee] = await tx.insert(employees).values({
      ...data,
      tenantId: ctx.tenantId,
    }).returning();

    // 2. Write event to outbox (SAME TRANSACTION)
    await tx.insert(domainOutbox).values({
      id: crypto.randomUUID(),
      tenantId: ctx.tenantId,
      aggregateType: 'employee',
      aggregateId: employee.id,
      eventType: 'hr.employee.created',
      payload: { employee, actor: ctx.userId, timestamp: new Date().toISOString() },
      createdAt: new Date(),
    });

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
```

## Outbox Processor (Worker)
```typescript
// packages/api/src/jobs/outbox-processor.ts
async function processOutbox() {
  const events = await db.query.domainOutbox.findMany({
    where: isNull(domainOutbox.processedAt),
    orderBy: [asc(domainOutbox.createdAt)],
    limit: 100,
  });

  for (const event of events) {
    try {
      await redis.xadd(`events:${event.eventType}`, '*', 'payload', JSON.stringify(event.payload));
      await db.update(domainOutbox).set({ processedAt: new Date(), publishedAt: new Date() }).where(eq(domainOutbox.id, event.id));
    } catch (error) {
      await db.update(domainOutbox).set({ retryCount: event.retryCount + 1, error: error.message }).where(eq(domainOutbox.id, event.id));
    }
  }
}
```

## Best Practices
1. Always use transactions
2. Make handlers idempotent
3. Include enough context in payload
4. Process events in order by createdAt
