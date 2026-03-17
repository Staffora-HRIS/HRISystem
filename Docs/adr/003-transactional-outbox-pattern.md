# ADR-003: Transactional Outbox Pattern for Domain Events

**Status:** Accepted
**Date:** 2026-01-07
**Authors:** Platform team

## Context

The Staffora platform uses domain events extensively. When business state changes (e.g., an employee is created, a leave request is approved, a case is escalated), downstream systems need to be notified: notifications must be sent, audit logs enriched, analytics updated, and workflows triggered.

The fundamental challenge is **dual write reliability**: when a service writes to the database and also publishes an event to Redis Streams, the two operations are not atomic. If the application crashes between the database commit and the Redis publish, the event is lost. Conversely, if we publish first and the database write fails, downstream systems act on an event that never actually happened.

Requirements:

- **Atomicity**: Domain events must be committed in the same transaction as the business write. If the transaction rolls back, the event is discarded.
- **At-least-once delivery**: Every committed event must eventually be delivered to consumers.
- **Ordering**: Events for the same aggregate should be delivered in creation order.
- **Auditability**: It must be possible to see what events were produced, when, and whether they were successfully processed.
- **Multi-tenant awareness**: Events must carry tenant context so that downstream consumers can operate within the correct RLS scope.

## Decision

We implement the **Transactional Outbox Pattern**. Domain events are written to a `domain_outbox` table in the `app` schema within the same database transaction as the business write. A separate outbox processor reads unprocessed events and publishes them to Redis Streams.

### Write path

Application code uses the `emitDomainEvent()` helper (from `packages/api/src/lib/outbox.ts`) inside the transaction:

```typescript
await db.withTransaction(ctx, async (tx) => {
  const [employee] = await tx`INSERT INTO employees (...) VALUES (...) RETURNING *`;
  await emitDomainEvent(tx, {
    tenantId: ctx.tenantId,
    aggregateType: "employee",
    aggregateId: employee.id,
    eventType: "hr.employee.created",
    payload: { employee, actor: ctx.userId },
  });
});
```

The `emitDomainEvent` function inserts into `app.domain_outbox` using the same transaction handle (`tx`). If the transaction rolls back, the event row is discarded with it. A batch variant (`emitDomainEvents`) uses `UNNEST` for efficient multi-row inserts when multiple events are produced in a single transaction.

### Outbox table structure

The `domain_outbox` table (migration `0011_domain_outbox.sql`) stores:
- `id` (UUID primary key)
- `tenant_id` (for RLS and consumer routing)
- `aggregate_type` and `aggregate_id` (for aggregate-scoped queries and replay)
- `event_type` (namespaced as `domain.aggregate.verb`, e.g., `hr.employee.created`)
- `payload` (JSONB event data)
- `metadata` (JSONB for correlation IDs, causation chains)
- `processed_at` (NULL until successfully published)
- `retry_count`, `error_message`, `next_retry_at` (for retry management)

### Read path (outbox processor)

The outbox processor (`packages/api/src/jobs/outbox-processor.ts`) runs as a continuous polling loop inside the worker process:

1. **Claim**: `SELECT ... FROM domain_outbox WHERE processed_at IS NULL ORDER BY created_at LIMIT $batchSize FOR UPDATE SKIP LOCKED` -- the `SKIP LOCKED` clause allows multiple workers to process concurrently without contention.
2. **Publish**: Each event is published to the appropriate Redis Stream based on event type prefix (e.g., `hr.employee.*` goes to `staffora:events:domain`).
3. **Mark processed**: On successful publish, `app.mark_outbox_event_processed()` sets `processed_at`.
4. **Mark failed**: On failure, `app.mark_outbox_event_failed()` increments `retry_count` and calculates `next_retry_at` using exponential backoff (1s, 2s, 4s, ... capped at 1 hour). After 10 retries, the event is marked as processed with a `MAX_RETRIES_EXCEEDED` error.
5. **Cleanup**: `app.cleanup_processed_outbox_events()` removes successfully processed events older than 7 days (failed events are retained for debugging).

### Adaptive polling

The outbox poller uses adaptive intervals: when no events are found for several consecutive polls, the interval increases up to 5x the base rate. When events are found, the interval resets immediately. This balances responsiveness with database load during idle periods.

### Backpressure

Events are processed in chunks of 5 concurrent Redis publishes (`MAX_CONCURRENT`) to avoid overwhelming the Redis connection.

## Consequences

### Positive

- **Guaranteed consistency**: Events are either committed with the business write or not at all. No lost events, no phantom events.
- **Survives crashes**: If the application or worker crashes, unprocessed events remain in the outbox table and will be picked up on restart.
- **Full audit trail**: The outbox table serves as a durable log of all domain events, with processing status, retry history, and error messages.
- **Concurrency-safe**: `FOR UPDATE SKIP LOCKED` allows multiple worker instances to process the outbox without duplicate delivery or lock contention.
- **Replay capability**: Events can be reprocessed by resetting `processed_at` to NULL, enabling event replay for debugging or backfilling.
- **Simple to reason about**: The pattern is well-understood in the industry and straightforward to implement with PostgreSQL.

### Negative

- **Polling latency**: There is an inherent delay between the business write and event delivery (the polling interval, default 1 second). This is acceptable for HRIS workloads but would not suit sub-100ms latency requirements.
- **Database load**: Polling queries hit the database continuously, even when idle. Mitigation: adaptive polling backs off during idle periods, and the partial index `idx_domain_outbox_unprocessed` ensures the poll query is efficient.
- **Table growth**: The outbox table grows with every domain event. Mitigation: the cleanup function removes processed events after 7 days, and failed events are capped at 10 retries.
- **Two-phase delivery**: Events are at-least-once delivered to Redis, meaning downstream consumers must be idempotent. This is enforced by including the `eventId` (outbox row UUID) in every published message.

### Neutral

- The outbox helper (`emitDomainEvent`) requires the caller to pass the transaction handle explicitly. This is intentional -- it makes the atomicity requirement visible in the code and impossible to accidentally bypass.
- RLS is enabled on the outbox table. The outbox processor uses `withSystemContext` to bypass RLS for cross-tenant batch processing.
- Database functions (`write_outbox_event`, `claim_outbox_events`, `mark_outbox_event_processed`, etc.) use `SECURITY DEFINER` to operate across tenants.

## Alternatives Considered

### Direct Redis publish in application code

Rejected because:
- Publishing to Redis outside the database transaction creates a dual-write problem: the event may be published but the database write may fail (or vice versa)
- This is the exact problem the outbox pattern solves

### PostgreSQL LISTEN/NOTIFY for outbox wake-up

Considered as an optimisation to reduce polling latency:
- A trigger on `domain_outbox` INSERT could `NOTIFY` to wake the poller immediately
- Rejected for now because the 1-second polling interval is sufficient for HRIS workloads, and NOTIFY adds complexity (missed notifications if no listener is connected, payload size limits)
- Can be added later as an optimisation without changing the core pattern

### Change Data Capture (Debezium / WAL-based)

Rejected because:
- Debezium requires Kafka or a similar system as a downstream transport, adding significant infrastructure complexity
- WAL-level access requires superuser privileges and is not available in all managed PostgreSQL environments
- The polling-based approach is simpler, portable, and sufficient for our throughput requirements

### Event sourcing (event store as source of truth)

Rejected because:
- Event sourcing is a fundamentally different architectural paradigm that requires rebuilding state from events
- The HRIS domain has complex query patterns that are better served by traditional CRUD with events as a side-channel
- The team has more experience with transactional outbox than event sourcing
- Can be adopted for specific bounded contexts later if needed

## References

- Pattern description: https://microservices.io/patterns/data/transactional-outbox.html
- Outbox helper: `packages/api/src/lib/outbox.ts`
- Outbox processor: `packages/api/src/jobs/outbox-processor.ts`
- Outbox migration: `migrations/0011_domain_outbox.sql`
- Worker entry point: `packages/api/src/worker.ts`
- See also: ADR-002 (Redis Streams for async processing)
