/**
 * Domain Event Outbox Processor
 *
 * Reads domain events from the domain_outbox table and publishes them
 * to Redis Streams for consumption by other services/workers.
 *
 * Features:
 * - Polls database for unprocessed events
 * - Publishes events to Redis Streams by event type
 * - Marks events as processed on success
 * - Handles retries with exponential backoff
 * - Supports batch processing for efficiency
 */

import {
  type JobPayload,
  type JobContext,
  type ProcessorRegistration,
  JobTypes,
  StreamKeys,
  sleep,
} from "./base";

// =============================================================================
// Types
// =============================================================================

/**
 * Outbox event from database
 */
export interface OutboxEvent {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
  retryCount: number;
}

/**
 * Process outbox job payload
 */
export interface ProcessOutboxPayload {
  /** Batch size to process */
  batchSize?: number;
  /** Specific event types to process (empty = all) */
  eventTypes?: string[];
  /** Whether to cleanup old events after processing */
  cleanup?: boolean;
  /** Age threshold for cleanup (e.g., "7 days") */
  cleanupAge?: string;
}

/**
 * Domain event published to Redis Streams
 */
export interface DomainEvent {
  /** Event ID (from outbox) */
  eventId: string;
  /** Tenant context */
  tenantId: string;
  /** Aggregate type (e.g., employee, leave_request) */
  aggregateType: string;
  /** Aggregate ID */
  aggregateId: string;
  /** Event type (e.g., hr.employee.created) */
  eventType: string;
  /** Event payload */
  payload: Record<string, unknown>;
  /** Event metadata */
  metadata: {
    /** When the event was created */
    createdAt: string;
    /** When the event was published */
    publishedAt: string;
    /** Correlation ID for tracing */
    correlationId?: string;
    /** Causation ID (event that caused this) */
    causationId?: string;
  };
}

// =============================================================================
// Event Type Routing
// =============================================================================

/**
 * Map event types to Redis Stream keys
 * Events are routed to specific streams based on their type
 */
const EVENT_STREAM_MAPPING: Record<string, string> = {
  // HR events go to main domain stream
  "hr.employee": StreamKeys.DOMAIN_EVENTS,
  "hr.org": StreamKeys.DOMAIN_EVENTS,
  "hr.position": StreamKeys.DOMAIN_EVENTS,

  // Time & Attendance events
  "time.event": StreamKeys.DOMAIN_EVENTS,
  "time.timesheet": StreamKeys.DOMAIN_EVENTS,

  // Absence events
  "absence.request": StreamKeys.DOMAIN_EVENTS,
  "absence.balance": StreamKeys.DOMAIN_EVENTS,

  // Security events (might trigger notifications)
  "security.auth": StreamKeys.NOTIFICATIONS,
  "security.user": StreamKeys.NOTIFICATIONS,
  "security.role": StreamKeys.DOMAIN_EVENTS,

  // Default
  default: StreamKeys.DOMAIN_EVENTS,
};

/**
 * Get the stream key for an event type
 */
function getStreamForEvent(eventType: string): string {
  // Try to match prefix (e.g., "hr.employee" from "hr.employee.created")
  const parts = eventType.split(".");
  if (parts.length >= 2) {
    const prefix = `${parts[0]}.${parts[1]}`;
    if (prefix in EVENT_STREAM_MAPPING) {
      return EVENT_STREAM_MAPPING[prefix] as string;
    }
  }

  return EVENT_STREAM_MAPPING["default"] as string;
}

// =============================================================================
// Outbox Processor
// =============================================================================

/**
 * Process domain events from the outbox table
 */
async function processOutbox(
  payload: JobPayload<ProcessOutboxPayload>,
  context: JobContext
): Promise<void> {
  const { log, db, redis } = context;
  const batchSize = payload.data.batchSize ?? 100;
  const eventTypes = payload.data.eventTypes ?? [];
  const cleanup = payload.data.cleanup ?? false;
  const cleanupAge = payload.data.cleanupAge ?? "7 days";

  log.info("Starting outbox processing", { batchSize, eventTypes, cleanup });

  let totalProcessed = 0;
  let totalFailed = 0;

  try {
    // Claim a batch of unprocessed events
    const events = await db.withSystemContext(async (tx) => {
      // Build optional event type filter
      const eventTypeFilter =
        eventTypes.length > 0
          ? tx`AND event_type = ANY(${eventTypes})`
          : tx``;

      return await tx<OutboxEvent[]>`
        SELECT
          id,
          tenant_id as "tenantId",
          aggregate_type as "aggregateType",
          aggregate_id as "aggregateId",
          event_type as "eventType",
          payload,
          metadata,
          created_at as "createdAt",
          retry_count as "retryCount"
        FROM app.domain_outbox
        WHERE processed_at IS NULL
          AND (next_retry_at IS NULL OR next_retry_at <= now())
          ${eventTypeFilter}
        ORDER BY created_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `;
    });

    if (events.length === 0) {
      log.debug("No events to process");
      return;
    }

    log.info(`Claimed ${events.length} events for processing`);

    // Process each event
    for (const event of events) {
      try {
        await processEvent(event, redis, log);
        totalProcessed++;

        // Mark as processed
        await db.withSystemContext(async (tx) => {
          await tx`SELECT app.mark_outbox_event_processed(${event.id}::uuid)`;
        });
      } catch (error) {
        totalFailed++;
        log.error(`Failed to process event ${event.id}`, error);

        // Mark as failed with retry scheduling
        const errorMessage = error instanceof Error ? error.message : String(error);
        await db.withSystemContext(async (tx) => {
          await tx`SELECT app.mark_outbox_event_failed(${event.id}::uuid, ${errorMessage})`;
        });
      }
    }

    log.info("Outbox processing complete", { totalProcessed, totalFailed });

    // Cleanup old events if requested
    if (cleanup) {
      const deleted = await db.withSystemContext(async (tx) => {
        const result = await tx<{ count: number }[]>`
          SELECT app.cleanup_processed_outbox_events(${cleanupAge}::interval) as count
        `;
        return result[0]?.count ?? 0;
      });

      if (deleted > 0) {
        log.info(`Cleaned up ${deleted} old events`);
      }
    }
  } catch (error) {
    log.error("Outbox processing failed", error);
    throw error;
  }
}

/**
 * Process a single outbox event
 */
async function processEvent(
  event: OutboxEvent,
  redis: import("ioredis").default,
  log: import("./base").JobLogger
): Promise<void> {
  const streamKey = getStreamForEvent(event.eventType);

  // Build domain event
  const domainEvent: DomainEvent = {
    eventId: event.id,
    tenantId: event.tenantId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    payload: event.payload,
    metadata: {
      createdAt: event.createdAt.toISOString(),
      publishedAt: new Date().toISOString(),
      correlationId: event.metadata.correlationId as string | undefined,
      causationId: event.metadata.causationId as string | undefined,
    },
  };

  // Publish to Redis Stream
  const messageId = await redis.xadd(
    streamKey,
    "*",
    "eventId",
    event.id,
    "eventType",
    event.eventType,
    "tenantId",
    event.tenantId,
    "aggregateType",
    event.aggregateType,
    "aggregateId",
    event.aggregateId,
    "payload",
    JSON.stringify(domainEvent)
  );

  log.debug(`Published event ${event.id} to ${streamKey}`, {
    messageId,
    eventType: event.eventType,
  });
}

// =============================================================================
// Continuous Outbox Polling
// =============================================================================

/**
 * Continuously poll the outbox for new events
 * This is meant to be run as a separate async process
 */
export async function startOutboxPolling(
  context: Omit<JobContext, "log" | "jobId" | "messageId" | "attempt">,
  options: {
    batchSize?: number;
    pollIntervalMs?: number;
    onError?: (error: Error) => void;
  } = {}
): Promise<{ stop: () => void }> {
  const { db, redis } = context;
  const batchSize = options.batchSize ?? 100;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const onError = options.onError ?? ((err) => console.error("[OutboxPoller] Error:", err));

  let isRunning = true;
  // Backpressure: limit concurrent Redis publishes to prevent overwhelming the server
  const MAX_CONCURRENT = 10;
  // Adaptive polling: back off when idle, reset when events found
  let consecutiveEmpty = 0;

  const log = {
    info: (msg: string, data?: Record<string, unknown>) =>
      console.log(`[OutboxPoller] ${msg}`, data ? JSON.stringify(data) : ""),
    warn: (msg: string, data?: Record<string, unknown>) =>
      console.warn(`[OutboxPoller] ${msg}`, data ? JSON.stringify(data) : ""),
    error: (msg: string, error?: unknown, data?: Record<string, unknown>) =>
      console.error(`[OutboxPoller] ${msg}`, error, data ? JSON.stringify(data) : ""),
    debug: (msg: string, data?: Record<string, unknown>) => {
      if (process.env["NODE_ENV"] !== "production") {
        console.debug(`[OutboxPoller] ${msg}`, data ? JSON.stringify(data) : "");
      }
    },
  };

  /** Process a chunk of events with bounded concurrency */
  async function processChunk(chunk: OutboxEvent[]): Promise<void> {
    await Promise.all(
      chunk.map(async (event) => {
        try {
          await processEvent(event, redis, log);
          await db.withSystemContext(async (tx) => {
            await tx`SELECT app.mark_outbox_event_processed(${event.id}::uuid)`;
          });
        } catch (error) {
          log.error(`Failed to process event ${event.id}`, error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          await db.withSystemContext(async (tx) => {
            await tx`SELECT app.mark_outbox_event_failed(${event.id}::uuid, ${errorMessage})`;
          });
        }
      })
    );
  }

  async function poll(): Promise<void> {
    while (isRunning) {
      try {
        // Claim events
        const events = await db.withSystemContext(async (tx) => {
          return await tx<OutboxEvent[]>`
            SELECT
              id,
              tenant_id as "tenantId",
              aggregate_type as "aggregateType",
              aggregate_id as "aggregateId",
              event_type as "eventType",
              payload,
              metadata,
              created_at as "createdAt",
              retry_count as "retryCount"
            FROM app.domain_outbox
            WHERE processed_at IS NULL
              AND (next_retry_at IS NULL OR next_retry_at <= now())
            ORDER BY created_at
            LIMIT ${batchSize}
            FOR UPDATE SKIP LOCKED
          `;
        });

        if (events.length > 0) {
          consecutiveEmpty = 0;
          log.debug(`Processing ${events.length} events`);

          // Process in chunks of MAX_CONCURRENT for backpressure
          for (let i = 0; i < events.length; i += MAX_CONCURRENT) {
            if (!isRunning) break;
            const chunk = events.slice(i, i + MAX_CONCURRENT);
            await processChunk(chunk);
          }
        } else {
          consecutiveEmpty++;
        }

        // Adaptive polling: back off when idle (up to 5x base interval)
        const adaptiveInterval = consecutiveEmpty > 3
          ? Math.min(pollIntervalMs * Math.min(consecutiveEmpty - 2, 5), pollIntervalMs * 5)
          : pollIntervalMs;
        await sleep(adaptiveInterval);
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
        await sleep(pollIntervalMs * 2); // Longer wait on error
      }
    }
  }

  // Start polling in background
  poll();

  return {
    stop: () => {
      isRunning = false;
    },
  };
}

// =============================================================================
// Processor Registration
// =============================================================================

/**
 * Outbox processor registration
 */
export const outboxProcessor: ProcessorRegistration<ProcessOutboxPayload> = {
  type: JobTypes.PROCESS_OUTBOX,
  processor: processOutbox,
  timeoutMs: 300000, // 5 minutes
  retry: true,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get outbox statistics
 */
export async function getOutboxStats(
  db: import("../plugins/db").DatabaseClient
): Promise<{
  totalPending: number;
  totalFailed: number;
  totalProcessedToday: number;
  oldestPendingAt: Date | null;
  eventsByType: Record<string, number>;
}> {
  const stats = await db.withSystemContext(async (tx) => {
    return await tx<
      Array<{
        totalPending: number;
        totalFailed: number;
        totalProcessedToday: number;
        oldestPendingAt: Date | null;
        eventsByType: Record<string, number>;
      }>
    >`SELECT * FROM app.get_outbox_stats()`;
  });

  const result = stats[0];
  return {
    totalPending: Number(result?.totalPending ?? 0),
    totalFailed: Number(result?.totalFailed ?? 0),
    totalProcessedToday: Number(result?.totalProcessedToday ?? 0),
    oldestPendingAt: result?.oldestPendingAt ?? null,
    eventsByType: result?.eventsByType ?? {},
  };
}

/**
 * Write an event to the outbox (for use in application code)
 */
export async function writeOutboxEvent(
  db: import("../plugins/db").DatabaseClient,
  event: {
    tenantId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  const result = await db.withSystemContext(async (tx) => {
    return await tx<{ id: string }[]>`
      SELECT app.write_outbox_event(
        ${event.tenantId}::uuid,
        ${event.aggregateType},
        ${event.aggregateId}::uuid,
        ${event.eventType},
        ${JSON.stringify(event.payload ?? {})}::jsonb,
        ${JSON.stringify(event.metadata ?? {})}::jsonb
      ) as id
    `;
  });

  return result[0]?.id ?? "";
}

export default outboxProcessor;
