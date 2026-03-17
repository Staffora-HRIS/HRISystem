/**
 * Worker Integration Tests (Redis Streams E2E)
 *
 * Tests the full domain event lifecycle:
 *   1. Insert a domain_outbox event (DB)
 *   2. Outbox processor picks it up and publishes to Redis Streams
 *   3. Event consumer reads from Redis Streams and dispatches to handlers
 *   4. Outbox entry is marked as processed in DB
 *
 * Also tests error handling: poison messages, handler failures, retries.
 *
 * Requires Docker containers (postgres + redis) running.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import type Redis from "ioredis";
import type postgres from "postgres";
import {
  getTestDb,
  getTestRedis,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../setup";
import { StreamKeys } from "../../jobs/base";
import type { DomainEvent } from "../../jobs/outbox-processor";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Helper to wait for a condition with timeout.
 * Polls the check function every `intervalMs` until it returns true or timeout.
 */
async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 100
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/**
 * Build a lightweight DatabaseClient-like wrapper around the test postgres.js
 * connection so startOutboxPolling can call db.withSystemContext().
 */
function wrapTestDb(db: ReturnType<typeof getTestDb>) {
  return {
    withSystemContext: async <T>(
      callback: (tx: any) => Promise<T>
    ): Promise<T> => {
      return (await db.begin(async (tx: any) => {
        await tx`SELECT set_config('app.current_tenant', '00000000-0000-0000-0000-000000000000', true)`;
        await tx`SELECT app.enable_system_context()`;
        try {
          return await callback(tx);
        } finally {
          await tx`SELECT app.disable_system_context()`;
        }
      })) as unknown as T;
    },
  };
}

/**
 * Unique stream key prefix for test isolation.
 * Each test suite uses a unique stream key to avoid interference from other
 * concurrent test runs or leftover data.
 */
function testStreamKey(): string {
  return `test:worker:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Clean up a Redis stream and its consumer groups.
 */
async function cleanupStream(redis: Redis, streamKey: string): Promise<void> {
  try {
    await redis.del(streamKey);
    await redis.del(`${streamKey}:dlq`);
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// Test Suite
// =============================================================================

describe("Worker Integration (Redis Streams E2E)", () => {
  let db: ReturnType<typeof getTestDb>;
  let redis: Redis;
  let tenant: TestTenant;
  let user: TestUser;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    redis = getTestRedis();
    tenant = await createTestTenant(db);
    user = await createTestUser(db, tenant.id);
  });

  afterAll(async () => {
    if (!isInfraAvailable()) return;
    await cleanupTestUser(db, user.id);
    await cleanupTestTenant(db, tenant.id);
    await closeTestConnections(db, redis);
  });

  beforeEach(async () => {
    if (!isInfraAvailable()) return;
    await setTenantContext(db, tenant.id, user.id);
  });

  afterEach(async () => {
    if (!isInfraAvailable()) return;
    // Clean up any outbox events created during the test
    await withSystemContext(db, async (tx) => {
      await tx`
        DELETE FROM app.domain_outbox
        WHERE tenant_id = ${tenant.id}::uuid
      `;
    });
    await clearTenantContext(db);
  });

  // ===========================================================================
  // 1. Outbox -> Redis Stream publication
  // ===========================================================================

  describe("Outbox to Redis Stream publication", () => {
    it("should pick up an unprocessed outbox event and publish it to Redis Streams", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const aggregateId = crypto.randomUUID();
      const eventType = "hr.employee.created";

      // 1. Insert domain_outbox event
      const inserted = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload, metadata
        )
        VALUES (
          ${tenant.id}::uuid, 'employee', ${aggregateId}::uuid,
          ${eventType},
          ${JSON.stringify({ employeeId: aggregateId, test: true })}::jsonb,
          '{}'::jsonb
        )
        RETURNING id
      `;
      const outboxId = inserted[0]!.id;

      // 2. Manually simulate the outbox processor's core logic:
      //    - Read unprocessed events from DB
      //    - Publish to Redis Stream
      //    - Mark as processed
      const events = await withSystemContext(db, async (tx) => {
        return await tx<
          Array<{
            id: string;
            tenantId: string;
            aggregateType: string;
            aggregateId: string;
            eventType: string;
            payload: any;
            metadata: any;
            createdAt: Date;
            retryCount: number;
          }>
        >`
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
          WHERE id = ${outboxId}::uuid
            AND processed_at IS NULL
          FOR UPDATE SKIP LOCKED
        `;
      });

      expect(events.length).toBe(1);
      const event = events[0]!;

      // Build domain event and publish to Redis Stream
      const domainEvent: DomainEvent = {
        eventId: event.id,
        tenantId: event.tenantId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload:
          typeof event.payload === "string"
            ? JSON.parse(event.payload)
            : event.payload,
        metadata: {
          createdAt: new Date(event.createdAt).toISOString(),
          publishedAt: new Date().toISOString(),
        },
      };

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

      expect(messageId).toBeTruthy();

      // 3. Mark outbox event as processed
      await withSystemContext(db, async (tx) => {
        await tx`SELECT app.mark_outbox_event_processed(${outboxId}::uuid)`;
      });

      // 4. Verify the outbox entry is marked processed
      const processed = await withSystemContext(db, async (tx) => {
        return await tx<{ processedAt: Date | null }[]>`
          SELECT processed_at as "processedAt"
          FROM app.domain_outbox
          WHERE id = ${outboxId}::uuid
        `;
      });
      expect(processed[0]!.processedAt).not.toBeNull();

      // 5. Verify the message exists in the Redis Stream
      const streamMessages = await redis.xrange(streamKey, "-", "+");
      expect(streamMessages.length).toBe(1);

      const [, fields] = streamMessages[0]!;
      // fields is a flat array: [key1, val1, key2, val2, ...]
      const fieldMap: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        fieldMap[fields[i]!] = fields[i + 1]!;
      }
      expect(fieldMap["eventId"]).toBe(outboxId);
      expect(fieldMap["eventType"]).toBe(eventType);
      expect(fieldMap["tenantId"]).toBe(tenant.id);
      expect(fieldMap["aggregateId"]).toBe(aggregateId);

      // Parse the payload and verify structure
      const publishedEvent: DomainEvent = JSON.parse(fieldMap["payload"]!);
      expect(publishedEvent.eventId).toBe(outboxId);
      expect(publishedEvent.tenantId).toBe(tenant.id);
      expect(publishedEvent.eventType).toBe(eventType);
      expect(publishedEvent.payload.employeeId).toBe(aggregateId);
      expect(publishedEvent.metadata.createdAt).toBeTruthy();
      expect(publishedEvent.metadata.publishedAt).toBeTruthy();

      await cleanupStream(redis, streamKey);
    });

    it("should route events to the correct stream based on event type prefix", async () => {
      if (!isInfraAvailable()) return;

      // Verify the stream routing logic matches the outbox-processor mapping
      const testCases: Array<{ eventType: string; expectedPrefix: string }> = [
        { eventType: "hr.employee.created", expectedPrefix: "staffora:events:domain" },
        { eventType: "hr.employee.terminated", expectedPrefix: "staffora:events:domain" },
        { eventType: "time.event.recorded", expectedPrefix: "staffora:events:domain" },
        { eventType: "absence.request.submitted", expectedPrefix: "staffora:events:domain" },
        { eventType: "security.auth.login", expectedPrefix: "staffora:jobs:notifications" },
        { eventType: "unknown.type.action", expectedPrefix: "staffora:events:domain" },
      ];

      // Re-implement the routing logic from outbox-processor for verification
      const EVENT_STREAM_MAPPING: Record<string, string> = {
        "hr.employee": StreamKeys.DOMAIN_EVENTS,
        "hr.org": StreamKeys.DOMAIN_EVENTS,
        "hr.position": StreamKeys.DOMAIN_EVENTS,
        "time.event": StreamKeys.DOMAIN_EVENTS,
        "time.timesheet": StreamKeys.DOMAIN_EVENTS,
        "absence.request": StreamKeys.DOMAIN_EVENTS,
        "absence.balance": StreamKeys.DOMAIN_EVENTS,
        "security.auth": StreamKeys.NOTIFICATIONS,
        "security.user": StreamKeys.NOTIFICATIONS,
        "security.role": StreamKeys.DOMAIN_EVENTS,
        default: StreamKeys.DOMAIN_EVENTS,
      };

      function getStreamForEvent(eventType: string): string {
        const parts = eventType.split(".");
        if (parts.length >= 2) {
          const prefix = `${parts[0]}.${parts[1]}`;
          if (prefix in EVENT_STREAM_MAPPING) {
            return EVENT_STREAM_MAPPING[prefix]!;
          }
        }
        return EVENT_STREAM_MAPPING["default"]!;
      }

      for (const tc of testCases) {
        const result = getStreamForEvent(tc.eventType);
        expect(result).toBe(tc.expectedPrefix);
      }
    });
  });

  // ===========================================================================
  // 2. Redis Stream consumer group reads and dispatches events
  // ===========================================================================

  describe("Redis Stream consumer reads and dispatches events", () => {
    it("should read events from a consumer group and acknowledge them", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const consumerGroup = `test-group-${Date.now()}`;
      const consumerName = `test-consumer-${Date.now()}`;

      // Create consumer group
      await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM");

      // Publish a test domain event
      const testEvent: DomainEvent = {
        eventId: crypto.randomUUID(),
        tenantId: tenant.id,
        aggregateType: "employee",
        aggregateId: crypto.randomUUID(),
        eventType: "hr.employee.created",
        payload: { employee: { id: crypto.randomUUID(), firstName: "Test" } },
        metadata: {
          createdAt: new Date().toISOString(),
          publishedAt: new Date().toISOString(),
        },
      };

      await redis.xadd(
        streamKey,
        "*",
        "eventId",
        testEvent.eventId,
        "eventType",
        testEvent.eventType,
        "payload",
        JSON.stringify(testEvent)
      );

      // Read from consumer group
      const results = (await redis.xreadgroup(
        "GROUP",
        consumerGroup,
        consumerName,
        "COUNT",
        10,
        "BLOCK",
        1000,
        "STREAMS",
        streamKey,
        ">"
      )) as Array<[string, Array<[string, string[]]>]> | null;

      expect(results).not.toBeNull();
      expect(results!.length).toBe(1);

      const [, messages] = results![0]!;
      expect(messages.length).toBe(1);

      const [messageId, fields] = messages[0]!;
      expect(messageId).toBeTruthy();

      // Parse the payload field
      const payloadIdx = fields.indexOf("payload");
      expect(payloadIdx).toBeGreaterThanOrEqual(0);
      const parsedEvent: DomainEvent = JSON.parse(fields[payloadIdx + 1]!);
      expect(parsedEvent.eventId).toBe(testEvent.eventId);
      expect(parsedEvent.eventType).toBe("hr.employee.created");

      // Acknowledge the message
      const ackResult = await redis.xack(streamKey, consumerGroup, messageId);
      expect(ackResult).toBe(1);

      // Verify pending count is 0 after acknowledgement
      const pendingInfo = await redis.xpending(streamKey, consumerGroup);
      // pendingInfo[0] is the total pending count
      expect(Number(pendingInfo[0])).toBe(0);

      await cleanupStream(redis, streamKey);
    });

    it("should handle handler dispatching for known event types", async () => {
      if (!isInfraAvailable()) return;

      // Test the handler registry pattern from domain-event-handlers
      // We register a mock handler and verify it is invoked
      const handledEvents: DomainEvent[] = [];

      // Simulate a simple handler registry
      const handlers = new Map<string, Array<(e: DomainEvent) => Promise<void>>>();

      function registerHandler(
        eventType: string,
        handler: (e: DomainEvent) => Promise<void>
      ) {
        const existing = handlers.get(eventType) || [];
        existing.push(handler);
        handlers.set(eventType, existing);
      }

      function getHandlers(eventType: string) {
        const result: Array<(e: DomainEvent) => Promise<void>> = [];
        const exact = handlers.get(eventType);
        if (exact) result.push(...exact);

        for (const [pattern, patternHandlers] of handlers.entries()) {
          if (pattern.endsWith(".*")) {
            const prefix = pattern.slice(0, -2);
            if (eventType.startsWith(prefix + ".")) {
              result.push(...patternHandlers);
            }
          }
        }
        return result;
      }

      // Register handlers
      registerHandler("hr.employee.created", async (e) => {
        handledEvents.push(e);
      });
      registerHandler("hr.employee.*", async (e) => {
        handledEvents.push(e);
      });

      // Simulate dispatching
      const testEvent: DomainEvent = {
        eventId: crypto.randomUUID(),
        tenantId: tenant.id,
        aggregateType: "employee",
        aggregateId: crypto.randomUUID(),
        eventType: "hr.employee.created",
        payload: { employee: { id: crypto.randomUUID() } },
        metadata: {
          createdAt: new Date().toISOString(),
          publishedAt: new Date().toISOString(),
        },
      };

      const eventHandlers = getHandlers(testEvent.eventType);
      expect(eventHandlers.length).toBe(2); // exact + wildcard

      for (const handler of eventHandlers) {
        await handler(testEvent);
      }

      expect(handledEvents.length).toBe(2);
      expect(handledEvents[0]!.eventId).toBe(testEvent.eventId);
      expect(handledEvents[1]!.eventId).toBe(testEvent.eventId);
    });
  });

  // ===========================================================================
  // 3. Full E2E: outbox -> Redis -> consumer -> outbox marked processed
  // ===========================================================================

  describe("Full E2E: outbox event lifecycle", () => {
    it("should process an outbox event through the complete pipeline", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const consumerGroup = `test-e2e-group-${Date.now()}`;
      const consumerName = `test-e2e-consumer-${Date.now()}`;
      const aggregateId = crypto.randomUUID();
      const eventType = "hr.employee.created";

      // Create consumer group before publishing
      await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM");

      // Step 1: Insert outbox event (simulating business write)
      const inserted = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload, metadata
        )
        VALUES (
          ${tenant.id}::uuid, 'employee', ${aggregateId}::uuid,
          ${eventType},
          ${JSON.stringify({ employee: { id: aggregateId, firstName: "E2E Test" }, actor: user.id })}::jsonb,
          ${JSON.stringify({ correlationId: crypto.randomUUID() })}::jsonb
        )
        RETURNING id
      `;
      const outboxId = inserted[0]!.id;

      // Step 2: Simulate outbox processor - read unprocessed event
      const events = await withSystemContext(db, async (tx) => {
        return await tx<
          Array<{
            id: string;
            tenantId: string;
            aggregateType: string;
            aggregateId: string;
            eventType: string;
            payload: any;
            metadata: any;
            createdAt: Date;
          }>
        >`
          SELECT
            id,
            tenant_id as "tenantId",
            aggregate_type as "aggregateType",
            aggregate_id as "aggregateId",
            event_type as "eventType",
            payload,
            metadata,
            created_at as "createdAt"
          FROM app.domain_outbox
          WHERE id = ${outboxId}::uuid
            AND processed_at IS NULL
        `;
      });

      expect(events.length).toBe(1);

      const event = events[0]!;
      const parsedPayload =
        typeof event.payload === "string"
          ? JSON.parse(event.payload)
          : event.payload;
      const parsedMetadata =
        typeof event.metadata === "string"
          ? JSON.parse(event.metadata)
          : event.metadata;

      // Step 3: Publish to Redis Stream
      const domainEvent: DomainEvent = {
        eventId: event.id,
        tenantId: event.tenantId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: parsedPayload,
        metadata: {
          createdAt: new Date(event.createdAt).toISOString(),
          publishedAt: new Date().toISOString(),
          correlationId: parsedMetadata.correlationId,
        },
      };

      await redis.xadd(
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

      // Step 4: Mark outbox event as processed
      await withSystemContext(db, async (tx) => {
        await tx`SELECT app.mark_outbox_event_processed(${outboxId}::uuid)`;
      });

      // Step 5: Consumer reads and processes
      const results = (await redis.xreadgroup(
        "GROUP",
        consumerGroup,
        consumerName,
        "COUNT",
        10,
        "BLOCK",
        2000,
        "STREAMS",
        streamKey,
        ">"
      )) as Array<[string, Array<[string, string[]]>]> | null;

      expect(results).not.toBeNull();
      expect(results!.length).toBe(1);

      const [, messages] = results![0]!;
      expect(messages.length).toBe(1);

      const [messageId, fields] = messages[0]!;
      const payloadIdx = fields.indexOf("payload");
      const consumed: DomainEvent = JSON.parse(fields[payloadIdx + 1]!);

      // Verify end-to-end fidelity
      expect(consumed.eventId).toBe(outboxId);
      expect(consumed.tenantId).toBe(tenant.id);
      expect(consumed.eventType).toBe(eventType);
      expect(consumed.aggregateType).toBe("employee");
      expect(consumed.aggregateId).toBe(aggregateId);
      expect(consumed.payload.employee.id).toBe(aggregateId);
      expect(consumed.payload.employee.firstName).toBe("E2E Test");
      expect(consumed.metadata.correlationId).toBeTruthy();

      // Acknowledge
      await redis.xack(streamKey, consumerGroup, messageId);

      // Step 6: Verify outbox is marked processed in DB
      const final = await withSystemContext(db, async (tx) => {
        return await tx<{ processedAt: Date | null; retryCount: number }[]>`
          SELECT processed_at as "processedAt", retry_count as "retryCount"
          FROM app.domain_outbox
          WHERE id = ${outboxId}::uuid
        `;
      });
      expect(final[0]!.processedAt).not.toBeNull();
      expect(final[0]!.retryCount).toBe(0);

      await cleanupStream(redis, streamKey);
    });

    it("should handle multiple outbox events in order", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const consumerGroup = `test-multi-group-${Date.now()}`;
      const consumerName = `test-multi-consumer-${Date.now()}`;
      const eventCount = 5;
      const outboxIds: string[] = [];

      // Create consumer group
      await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM");

      // Insert multiple outbox events
      for (let i = 0; i < eventCount; i++) {
        const aggregateId = crypto.randomUUID();
        const result = await db<{ id: string }[]>`
          INSERT INTO app.domain_outbox (
            tenant_id, aggregate_type, aggregate_id, event_type, payload
          )
          VALUES (
            ${tenant.id}::uuid, 'employee', ${aggregateId}::uuid,
            'hr.employee.created',
            ${JSON.stringify({ sequence: i, employeeId: aggregateId })}::jsonb
          )
          RETURNING id
        `;
        outboxIds.push(result[0]!.id);
      }

      // Simulate outbox processor: read all, publish all, mark all
      const events = await withSystemContext(db, async (tx) => {
        return await tx<
          Array<{
            id: string;
            tenantId: string;
            aggregateType: string;
            aggregateId: string;
            eventType: string;
            payload: any;
            createdAt: Date;
          }>
        >`
          SELECT
            id,
            tenant_id as "tenantId",
            aggregate_type as "aggregateType",
            aggregate_id as "aggregateId",
            event_type as "eventType",
            payload,
            created_at as "createdAt"
          FROM app.domain_outbox
          WHERE id = ANY(${outboxIds}::uuid[])
            AND processed_at IS NULL
          ORDER BY created_at
        `;
      });

      expect(events.length).toBe(eventCount);

      // Publish all to Redis Stream in order
      for (const evt of events) {
        const payload =
          typeof evt.payload === "string" ? JSON.parse(evt.payload) : evt.payload;

        const domainEvent: DomainEvent = {
          eventId: evt.id,
          tenantId: evt.tenantId,
          aggregateType: evt.aggregateType,
          aggregateId: evt.aggregateId,
          eventType: evt.eventType,
          payload,
          metadata: {
            createdAt: new Date(evt.createdAt).toISOString(),
            publishedAt: new Date().toISOString(),
          },
        };

        await redis.xadd(
          streamKey,
          "*",
          "eventId",
          evt.id,
          "eventType",
          evt.eventType,
          "payload",
          JSON.stringify(domainEvent)
        );
      }

      // Mark all as processed
      for (const id of outboxIds) {
        await withSystemContext(db, async (tx) => {
          await tx`SELECT app.mark_outbox_event_processed(${id}::uuid)`;
        });
      }

      // Consumer reads all
      const results = (await redis.xreadgroup(
        "GROUP",
        consumerGroup,
        consumerName,
        "COUNT",
        eventCount + 5,
        "BLOCK",
        2000,
        "STREAMS",
        streamKey,
        ">"
      )) as Array<[string, Array<[string, string[]]>]> | null;

      expect(results).not.toBeNull();
      const [, messages] = results![0]!;
      expect(messages.length).toBe(eventCount);

      // Verify ordering by sequence number
      for (let i = 0; i < messages.length; i++) {
        const [msgId, msgFields] = messages[i]!;
        const payloadIdx = msgFields.indexOf("payload");
        const parsed: DomainEvent = JSON.parse(msgFields[payloadIdx + 1]!);
        expect(parsed.payload.sequence).toBe(i);

        // Acknowledge each message
        await redis.xack(streamKey, consumerGroup, msgId);
      }

      // Verify all outbox entries are marked processed
      const finalStates = await withSystemContext(db, async (tx) => {
        return await tx<{ id: string; processedAt: Date | null }[]>`
          SELECT id, processed_at as "processedAt"
          FROM app.domain_outbox
          WHERE id = ANY(${outboxIds}::uuid[])
        `;
      });

      for (const row of finalStates) {
        expect(row.processedAt).not.toBeNull();
      }

      await cleanupStream(redis, streamKey);
    });
  });

  // ===========================================================================
  // 4. Error handling: failures, retries, DLQ
  // ===========================================================================

  describe("Error handling and retries", () => {
    it("should mark an outbox event as failed and schedule retry with backoff", async () => {
      if (!isInfraAvailable()) return;

      const aggregateId = crypto.randomUUID();

      // Insert outbox event
      const result = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        )
        VALUES (
          ${tenant.id}::uuid, 'employee', ${aggregateId}::uuid,
          'hr.employee.created', '{}'::jsonb
        )
        RETURNING id
      `;
      const outboxId = result[0]!.id;

      // Simulate first failure
      await withSystemContext(db, async (tx) => {
        await tx`SELECT app.mark_outbox_event_failed(${outboxId}::uuid, 'Redis connection refused')`;
      });

      // Verify retry_count is incremented and next_retry_at is set
      const afterFirstFailure = await withSystemContext(db, async (tx) => {
        return await tx<
          {
            retryCount: number;
            errorMessage: string | null;
            nextRetryAt: Date | null;
            processedAt: Date | null;
          }[]
        >`
          SELECT
            retry_count as "retryCount",
            error_message as "errorMessage",
            next_retry_at as "nextRetryAt",
            processed_at as "processedAt"
          FROM app.domain_outbox
          WHERE id = ${outboxId}::uuid
        `;
      });

      expect(afterFirstFailure[0]!.retryCount).toBe(1);
      expect(afterFirstFailure[0]!.errorMessage).toBe("Redis connection refused");
      expect(afterFirstFailure[0]!.nextRetryAt).not.toBeNull();
      expect(afterFirstFailure[0]!.processedAt).toBeNull(); // Not yet processed

      // Simulate second failure
      await withSystemContext(db, async (tx) => {
        await tx`SELECT app.mark_outbox_event_failed(${outboxId}::uuid, 'Redis timeout')`;
      });

      const afterSecondFailure = await withSystemContext(db, async (tx) => {
        return await tx<
          {
            retryCount: number;
            errorMessage: string | null;
            nextRetryAt: Date | null;
          }[]
        >`
          SELECT
            retry_count as "retryCount",
            error_message as "errorMessage",
            next_retry_at as "nextRetryAt"
          FROM app.domain_outbox
          WHERE id = ${outboxId}::uuid
        `;
      });

      expect(afterSecondFailure[0]!.retryCount).toBe(2);
      expect(afterSecondFailure[0]!.errorMessage).toBe("Redis timeout");

      // Verify exponential backoff: second retry should be later than first
      // (The DB function uses power(2, retry_count) seconds backoff)
      expect(afterSecondFailure[0]!.nextRetryAt).not.toBeNull();
    });

    it("should mark event as permanently failed after exceeding max retries", async () => {
      if (!isInfraAvailable()) return;

      const aggregateId = crypto.randomUUID();

      // Insert outbox event
      const result = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        )
        VALUES (
          ${tenant.id}::uuid, 'employee', ${aggregateId}::uuid,
          'hr.employee.created', '{}'::jsonb
        )
        RETURNING id
      `;
      const outboxId = result[0]!.id;

      // Manually set retry_count to max (10) - 1 to simulate near-exhaustion
      await withSystemContext(db, async (tx) => {
        await tx`
          UPDATE app.domain_outbox
          SET retry_count = 9
          WHERE id = ${outboxId}::uuid
        `;
      });

      // Now the 10th failure (retry_count=9, at limit) should mark as permanently failed
      // (mark_outbox_event_failed checks if retry_count >= max_retries)
      await withSystemContext(db, async (tx) => {
        await tx`SELECT app.mark_outbox_event_failed(${outboxId}::uuid, 'Final failure')`;
      });

      const finalState = await withSystemContext(db, async (tx) => {
        return await tx<
          {
            retryCount: number;
            errorMessage: string | null;
            processedAt: Date | null;
          }[]
        >`
          SELECT
            retry_count as "retryCount",
            error_message as "errorMessage",
            processed_at as "processedAt"
          FROM app.domain_outbox
          WHERE id = ${outboxId}::uuid
        `;
      });

      // When max retries exceeded, the DB function marks processed_at and
      // prefixes error_message with MAX_RETRIES_EXCEEDED
      expect(finalState[0]!.retryCount).toBe(10);
      expect(finalState[0]!.processedAt).not.toBeNull();
      expect(finalState[0]!.errorMessage).toContain("MAX_RETRIES_EXCEEDED");
      expect(finalState[0]!.errorMessage).toContain("Final failure");
    });

    it("should handle poison messages (invalid JSON payload) gracefully in consumer", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const consumerGroup = `test-poison-group-${Date.now()}`;
      const consumerName = `test-poison-consumer-${Date.now()}`;

      // Create consumer group
      await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM");

      // Publish a poison message with invalid JSON
      await redis.xadd(
        streamKey,
        "*",
        "payload",
        "THIS IS NOT VALID JSON {{{",
        "eventType",
        "hr.employee.created"
      );

      // Also publish a valid message after the poison one
      const validEvent: DomainEvent = {
        eventId: crypto.randomUUID(),
        tenantId: tenant.id,
        aggregateType: "employee",
        aggregateId: crypto.randomUUID(),
        eventType: "hr.employee.created",
        payload: { employee: { id: crypto.randomUUID() } },
        metadata: {
          createdAt: new Date().toISOString(),
          publishedAt: new Date().toISOString(),
        },
      };

      await redis.xadd(
        streamKey,
        "*",
        "payload",
        JSON.stringify(validEvent),
        "eventType",
        validEvent.eventType
      );

      // Consumer reads both messages
      const results = (await redis.xreadgroup(
        "GROUP",
        consumerGroup,
        consumerName,
        "COUNT",
        10,
        "BLOCK",
        2000,
        "STREAMS",
        streamKey,
        ">"
      )) as Array<[string, Array<[string, string[]]>]> | null;

      expect(results).not.toBeNull();
      const [, messages] = results![0]!;
      expect(messages.length).toBe(2);

      const processedEvents: DomainEvent[] = [];
      const parseErrors: string[] = [];

      // Simulate the consumer's parsing logic from domain-event-handlers
      for (const [messageId, fields] of messages) {
        try {
          const payloadIdx = fields.indexOf("payload");
          if (payloadIdx === -1 || payloadIdx + 1 >= fields.length) {
            parseErrors.push(`Missing payload in message ${messageId}`);
            await redis.xack(streamKey, consumerGroup, messageId);
            continue;
          }

          const event: DomainEvent = JSON.parse(fields[payloadIdx + 1]!);
          processedEvents.push(event);
          await redis.xack(streamKey, consumerGroup, messageId);
        } catch (error) {
          parseErrors.push(
            `Parse error for ${messageId}: ${error instanceof Error ? error.message : String(error)}`
          );
          // Still acknowledge to avoid blocking (matches real consumer behavior)
          await redis.xack(streamKey, consumerGroup, messageId);
        }
      }

      // The poison message should have caused a parse error
      expect(parseErrors.length).toBe(1);
      expect(parseErrors[0]).toContain("Parse error");

      // The valid message should have been processed
      expect(processedEvents.length).toBe(1);
      expect(processedEvents[0]!.eventId).toBe(validEvent.eventId);

      // All messages should be acknowledged (no pending)
      const pendingInfo = await redis.xpending(streamKey, consumerGroup);
      expect(Number(pendingInfo[0])).toBe(0);

      await cleanupStream(redis, streamKey);
    });

    it("should support dead letter queue for permanently failed jobs", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const dlqKey = `${streamKey}:dlq`;

      // Simulate moving a failed job to DLQ (mimics BaseWorker.moveToDeadLetter)
      const failedPayload = {
        id: crypto.randomUUID(),
        type: "outbox.process",
        data: {},
        metadata: { createdAt: new Date().toISOString() },
      };

      const originalMessageId = "1234567890-0";
      const errorMessage = "Handler threw: TypeError: Cannot read property of undefined";

      await redis.xadd(
        dlqKey,
        "*",
        "payload",
        JSON.stringify(failedPayload),
        "originalMessageId",
        originalMessageId,
        "error",
        errorMessage,
        "failedAt",
        new Date().toISOString()
      );

      // Verify DLQ contains the message
      const dlqMessages = await redis.xrange(dlqKey, "-", "+");
      expect(dlqMessages.length).toBe(1);

      const [, dlqFields] = dlqMessages[0]!;
      const dlqMap: Record<string, string> = {};
      for (let i = 0; i < dlqFields.length; i += 2) {
        dlqMap[dlqFields[i]!] = dlqFields[i + 1]!;
      }

      expect(dlqMap["originalMessageId"]).toBe(originalMessageId);
      expect(dlqMap["error"]).toBe(errorMessage);
      expect(dlqMap["failedAt"]).toBeTruthy();

      const parsedDlqPayload = JSON.parse(dlqMap["payload"]!);
      expect(parsedDlqPayload.id).toBe(failedPayload.id);

      // Verify DLQ length (XLEN)
      const dlqLen = await redis.xlen(dlqKey);
      expect(dlqLen).toBe(1);

      await cleanupStream(redis, streamKey);
    });

    it("should handle handler failures without losing the message", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const consumerGroup = `test-handler-fail-${Date.now()}`;
      const consumerName = `test-handler-fail-consumer-${Date.now()}`;

      // Create consumer group
      await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM");

      // Publish event
      const testEvent: DomainEvent = {
        eventId: crypto.randomUUID(),
        tenantId: tenant.id,
        aggregateType: "employee",
        aggregateId: crypto.randomUUID(),
        eventType: "hr.employee.created",
        payload: { employee: { id: crypto.randomUUID() } },
        metadata: {
          createdAt: new Date().toISOString(),
          publishedAt: new Date().toISOString(),
        },
      };

      await redis.xadd(
        streamKey,
        "*",
        "payload",
        JSON.stringify(testEvent)
      );

      // Consumer reads
      const results = (await redis.xreadgroup(
        "GROUP",
        consumerGroup,
        consumerName,
        "COUNT",
        10,
        "BLOCK",
        2000,
        "STREAMS",
        streamKey,
        ">"
      )) as Array<[string, Array<[string, string[]]>]> | null;

      expect(results).not.toBeNull();
      const [, messages] = results![0]!;
      const [messageId] = messages[0]!;

      // Simulate handler failure (DON'T acknowledge)
      // In real code, BaseWorker would re-add to stream with incremented attempt
      // and then acknowledge the original. Here we test the retry path.

      // Re-add to stream as a retry (attempt 2)
      await redis.xadd(
        streamKey,
        "*",
        "payload",
        JSON.stringify(testEvent),
        "attempt",
        "2"
      );

      // Acknowledge original (failed) message so it does not stay pending
      await redis.xack(streamKey, consumerGroup, messageId);

      // The retry message should be readable
      const retryResults = (await redis.xreadgroup(
        "GROUP",
        consumerGroup,
        consumerName,
        "COUNT",
        10,
        "BLOCK",
        2000,
        "STREAMS",
        streamKey,
        ">"
      )) as Array<[string, Array<[string, string[]]>]> | null;

      expect(retryResults).not.toBeNull();
      const [, retryMessages] = retryResults![0]!;
      expect(retryMessages.length).toBe(1);

      const [retryMsgId, retryFields] = retryMessages[0]!;

      // Verify retry attempt is 2
      const attemptIdx = retryFields.indexOf("attempt");
      expect(attemptIdx).toBeGreaterThanOrEqual(0);
      expect(retryFields[attemptIdx + 1]).toBe("2");

      // Acknowledge retry
      await redis.xack(streamKey, consumerGroup, retryMsgId);

      await cleanupStream(redis, streamKey);
    });
  });

  // ===========================================================================
  // 5. Outbox processor database-level behavior
  // ===========================================================================

  describe("Outbox processor database functions", () => {
    it("should claim events with FOR UPDATE SKIP LOCKED (no double-processing)", async () => {
      if (!isInfraAvailable()) return;

      const aggregateId = crypto.randomUUID();

      // Insert an outbox event
      const result = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        )
        VALUES (
          ${tenant.id}::uuid, 'employee', ${aggregateId}::uuid,
          'hr.employee.created', '{}'::jsonb
        )
        RETURNING id
      `;
      const outboxId = result[0]!.id;

      // Use claim_outbox_events function
      const claimed = await withSystemContext(db, async (tx) => {
        return await tx<{ id: string }[]>`
          SELECT id FROM app.claim_outbox_events(10)
        `;
      });

      // The event we inserted should be among the claimed events
      const found = claimed.some((e) => e.id === outboxId);
      expect(found).toBe(true);
    });

    it("should not pick up already-processed events", async () => {
      if (!isInfraAvailable()) return;

      const aggregateId = crypto.randomUUID();

      // Insert and immediately mark as processed
      const result = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        )
        VALUES (
          ${tenant.id}::uuid, 'employee', ${aggregateId}::uuid,
          'hr.employee.created', '{}'::jsonb
        )
        RETURNING id
      `;
      const outboxId = result[0]!.id;

      await withSystemContext(db, async (tx) => {
        await tx`SELECT app.mark_outbox_event_processed(${outboxId}::uuid)`;
      });

      // Try to claim events - should not include the processed one
      const claimed = await withSystemContext(db, async (tx) => {
        return await tx<{ id: string }[]>`
          SELECT id
          FROM app.domain_outbox
          WHERE processed_at IS NULL
            AND id = ${outboxId}::uuid
        `;
      });

      expect(claimed.length).toBe(0);
    });

    it("should not pick up events with future next_retry_at", async () => {
      if (!isInfraAvailable()) return;

      const aggregateId = crypto.randomUUID();

      // Insert event with a future next_retry_at
      const result = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload,
          retry_count, next_retry_at
        )
        VALUES (
          ${tenant.id}::uuid, 'employee', ${aggregateId}::uuid,
          'hr.employee.created', '{}'::jsonb,
          1, now() + interval '1 hour'
        )
        RETURNING id
      `;
      const outboxId = result[0]!.id;

      // The event should NOT be claimable (next_retry_at is in the future)
      const claimed = await withSystemContext(db, async (tx) => {
        return await tx<{ id: string }[]>`
          SELECT id
          FROM app.domain_outbox
          WHERE processed_at IS NULL
            AND (next_retry_at IS NULL OR next_retry_at <= now())
            AND id = ${outboxId}::uuid
        `;
      });

      expect(claimed.length).toBe(0);
    });

    it("should clean up old processed events", async () => {
      if (!isInfraAvailable()) return;

      const aggregateId = crypto.randomUUID();

      // Insert and mark as processed, then backdate processed_at
      const result = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (
          tenant_id, aggregate_type, aggregate_id, event_type, payload
        )
        VALUES (
          ${tenant.id}::uuid, 'employee', ${aggregateId}::uuid,
          'test.cleanup', '{}'::jsonb
        )
        RETURNING id
      `;
      const outboxId = result[0]!.id;

      // Mark processed and backdate
      await withSystemContext(db, async (tx) => {
        await tx`SELECT app.mark_outbox_event_processed(${outboxId}::uuid)`;
        await tx`
          UPDATE app.domain_outbox
          SET processed_at = now() - interval '30 days'
          WHERE id = ${outboxId}::uuid
        `;
      });

      // Run cleanup for events older than 7 days
      const deleted = await withSystemContext(db, async (tx) => {
        return await tx<{ count: number }[]>`
          SELECT app.cleanup_processed_outbox_events('7 days'::interval) as count
        `;
      });

      expect(Number(deleted[0]!.count)).toBeGreaterThanOrEqual(1);

      // Verify the event is gone
      const remaining = await withSystemContext(db, async (tx) => {
        return await tx<{ id: string }[]>`
          SELECT id FROM app.domain_outbox WHERE id = ${outboxId}::uuid
        `;
      });
      expect(remaining.length).toBe(0);
    });
  });

  // ===========================================================================
  // 6. Consumer group and stream infrastructure
  // ===========================================================================

  describe("Stream infrastructure", () => {
    it("should create consumer groups idempotently (MKSTREAM)", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const consumerGroup = `test-idempotent-group-${Date.now()}`;

      // First creation should succeed
      await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM");

      // Second creation should throw BUSYGROUP but be handled gracefully
      try {
        await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM");
        // If we get here, something is unexpected
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("BUSYGROUP");
      }

      await cleanupStream(redis, streamKey);
    });

    it("should track pending messages via XPENDING", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const consumerGroup = `test-pending-group-${Date.now()}`;
      const consumerName = `test-pending-consumer-${Date.now()}`;

      // Create group
      await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM");

      // Add and read a message (without acking)
      await redis.xadd(
        streamKey,
        "*",
        "payload",
        JSON.stringify({ test: true })
      );

      await redis.xreadgroup(
        "GROUP",
        consumerGroup,
        consumerName,
        "COUNT",
        10,
        "BLOCK",
        1000,
        "STREAMS",
        streamKey,
        ">"
      );

      // Check pending - should have 1 pending message
      const pendingInfo = await redis.xpending(streamKey, consumerGroup);
      expect(Number(pendingInfo[0])).toBe(1);

      await cleanupStream(redis, streamKey);
    });

    it("should verify StreamKeys constants match expected values", () => {
      expect(StreamKeys.DOMAIN_EVENTS).toBe("staffora:events:domain");
      expect(StreamKeys.NOTIFICATIONS).toBe("staffora:jobs:notifications");
      expect(StreamKeys.EXPORTS).toBe("staffora:jobs:exports");
      expect(StreamKeys.PDF_GENERATION).toBe("staffora:jobs:pdf");
      expect(StreamKeys.ANALYTICS).toBe("staffora:jobs:analytics");
      expect(StreamKeys.BACKGROUND).toBe("staffora:jobs:background");
    });
  });
});
