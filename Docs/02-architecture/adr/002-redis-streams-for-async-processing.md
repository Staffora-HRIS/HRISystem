# ADR-002: Use Redis Streams for Async Event Processing

*Last updated: 2026-03-28*

**Status:** Accepted
**Date:** 2026-01-07
**Authors:** Platform team

## Context

The Staffora platform needs reliable asynchronous processing for:

- Domain event delivery (from the transactional outbox to event handlers)
- Email and push notification dispatch
- Report/export generation (CSV, Excel)
- PDF document generation (certificates, employment letters, case bundles)
- Analytics aggregation
- Scheduled maintenance tasks (session cleanup, outbox cleanup, permission sync)

Requirements for the message transport:

- **At-least-once delivery**: Domain events must not be silently lost.
- **Consumer groups**: Multiple worker instances must be able to scale horizontally without duplicating work.
- **Persistence**: Messages should survive Redis restarts (with AOF/RDB persistence).
- **Backpressure**: Workers must be able to limit concurrent processing.
- **Dead letter queue**: Failed messages must be captured for debugging and replay.
- **Operational simplicity**: The team already runs Redis for session caching; adding a separate message broker would increase infrastructure complexity.

## Decision

We use **Redis Streams** as the message transport for all asynchronous processing in the Staffora platform. The worker subsystem is implemented in `packages/api/src/jobs/` with the following architecture:

**Stream topology**: Six named streams partition work by type:
- `staffora:events:domain` -- Domain events from the outbox
- `staffora:jobs:notifications` -- Email, in-app, and push notifications
- `staffora:jobs:exports` -- CSV and Excel export generation
- `staffora:jobs:pdf` -- PDF document generation
- `staffora:jobs:analytics` -- Analytics aggregation jobs
- `staffora:jobs:background` -- General background tasks

**Consumer groups**: Workers join a shared consumer group (`staffora-workers` by default) using `XREADGROUP`. Each worker has a unique consumer ID (based on PID). Redis guarantees that each message is delivered to exactly one consumer within the group.

**Job processing model**:
- The `BaseWorker` class manages the processing loop, polling all streams in sequence.
- Each job type has a registered `ProcessorRegistration` with a handler function, optional timeout, and retry configuration.
- Concurrency is bounded by configuration (`WORKER_CONCURRENCY`, default 5).
- `XREADGROUP` uses `BLOCK` timeout (default 5s) for efficient long-polling.
- On startup, workers claim pending (abandoned) messages from crashed consumers using `XCLAIM`.

**Retry and dead letter queue (DLQ)**:
- Failed jobs are re-added to the stream with an incremented attempt counter.
- After `maxRetries` (default 10) failures, jobs are moved to a `{stream}:dlq` stream.
- DLQ streams are trimmed to approximately 10,000 entries to prevent unbounded growth.

**Outbox polling**: A separate async loop (`startOutboxPolling`) runs inside the worker process, polling the `domain_outbox` table and publishing events to Redis Streams. It uses adaptive polling intervals -- backing off when idle (up to 5x base interval) and resetting immediately when events are found. Backpressure is managed by processing events in chunks of 5 concurrent publishes.

**Health and observability**:
- A lightweight Elysia health server runs on port 3001 with `/health`, `/ready`, `/live`, and `/metrics` endpoints.
- Prometheus-style metrics expose active jobs, processed/failed totals, uptime, and connection status.
- Graceful shutdown drains active jobs (30-second timeout) before closing connections.

## Consequences

### Positive

- **No additional infrastructure**: Redis is already required for session caching and rate limiting. Streams avoid adding RabbitMQ, Kafka, or SQS to the stack.
- **Consumer group semantics**: Built-in consumer groups provide exactly-once delivery within a group, horizontal scaling, and pending message recovery.
- **Persistence**: With Redis AOF or RDB enabled, messages survive restarts. This is sufficient for at-least-once delivery when combined with the outbox pattern.
- **Operational familiarity**: The team already monitors and manages Redis. No new operational skills required.
- **Low latency**: Redis Streams have sub-millisecond publish latency, suitable for near-real-time notifications.
- **Backpressure built in**: `XREADGROUP COUNT` and concurrency limits naturally prevent workers from being overwhelmed.

### Negative

- **Redis memory constraints**: All unprocessed messages live in Redis memory. A prolonged worker outage with high event volume could exhaust Redis memory. Mitigation: `XTRIM MAXLEN ~100000` caps stream size, and outbox events remain in PostgreSQL as the source of truth.
- **No native delayed/scheduled messages**: Redis Streams do not support delayed delivery. Scheduled tasks use a separate cron-based scheduler that publishes jobs at the appropriate time.
- **Single Redis dependency**: If Redis goes down, both caching and async processing stop. Mitigation: health checks detect this, and the outbox table in PostgreSQL ensures no events are lost -- they will be reprocessed when Redis recovers.
- **Limited routing complexity**: Redis Streams lack the sophisticated routing (topic exchange, header-based routing) of dedicated message brokers. Our event-type-to-stream mapping is a simple prefix-based lookup, which is sufficient for current needs but may need revisiting if routing becomes complex.

### Neutral

- Stream trimming (`XTRIM MAXLEN ~`) uses approximate trimming for efficiency, meaning stream length may slightly exceed the configured maximum.
- The `ioredis` client is used for the worker's Redis connection, separate from the `CacheClient` used for application-level caching. This provides isolation between the two concerns.

## Alternatives Considered

### RabbitMQ

Rejected because:
- Adds a new infrastructure component to deploy, monitor, and maintain
- The team would need to learn AMQP concepts, exchanges, and bindings
- For our scale (hundreds of events/minute, not millions), Redis Streams are more than adequate
- RabbitMQ requires additional Docker containers and memory allocation

### AWS SQS / Google Pub/Sub

Rejected because:
- Introduces cloud vendor lock-in
- The platform must be self-hostable on-premises without cloud dependencies
- Adds network latency and cost for message delivery

### PostgreSQL LISTEN/NOTIFY + pg_cron

Considered but rejected because:
- `LISTEN/NOTIFY` payloads are limited to 8KB and have no persistence (missed if no listener is connected)
- `pg_cron` is a PostgreSQL extension not available in all managed Postgres offerings
- Would increase load on the primary database with polling queries
- Redis Streams provide more robust consumer group semantics

### BullMQ (Redis-based job queue)

Considered but rejected because:
- BullMQ is built for Node.js; Bun compatibility was uncertain at the time of the decision
- Redis Streams are a lower-level primitive that gives us more control over consumer group behaviour and stream topology
- BullMQ adds a dependency for functionality we can implement with ~300 lines of code in `base.ts`

## References

- Redis Streams documentation: https://redis.io/docs/data-types/streams/
- Worker entry point: `packages/api/src/worker.ts`
- Base worker infrastructure: `packages/api/src/jobs/base.ts`
- Outbox processor: `packages/api/src/jobs/outbox-processor.ts`
- Domain event handlers: `packages/api/src/jobs/domain-event-handlers.ts`
- Notification worker: `packages/api/src/jobs/notification-worker.ts`
- Export worker: `packages/api/src/jobs/export-worker.ts`
- PDF worker: `packages/api/src/jobs/pdf-worker.ts`
- Analytics worker: `packages/api/src/jobs/analytics-worker.ts`
