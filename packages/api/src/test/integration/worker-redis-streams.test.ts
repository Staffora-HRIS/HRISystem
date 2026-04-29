/**
 * Worker Redis Streams E2E Integration Tests (TODO-093)
 *
 * Tests the full domain event lifecycle from outbox through Redis Streams
 * to worker handlers:
 *   1. Insert into domain_outbox (simulating business write)
 *   2. Verify outbox-processor picks it up (reads unprocessed events)
 *   3. Publish to Redis Streams
 *   4. Verify event reaches the correct handler via consumer group
 *   5. Verify outbox entry is marked as processed
 *
 * Also tests:
 *   - Multiple event types routed to correct handlers
 *   - Handler registry wildcard matching
 *   - Concurrent event processing order preservation
 *   - Consumer group rebalancing on new consumer join
 *   - Stream trimming after processing
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
import type { DomainEvent } from "../../jobs/outbox-processor";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Unique stream key prefix for test isolation.
 */
function testStreamKey(): string {
  return `test:worker-redis-streams:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
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

/**
 * Build a DomainEvent from an outbox row.
 */
function buildDomainEvent(row: {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: any;
  createdAt: Date;
}): DomainEvent {
  const parsedPayload =
    typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return {
    eventId: row.id,
    tenantId: row.tenantId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    eventType: row.eventType,
    payload: parsedPayload,
    metadata: {
      createdAt: new Date(row.createdAt).toISOString(),
      publishedAt: new Date().toISOString(),
    },
  };
}

/**
 * Parse flat Redis field array into a key-value map.
 */
function parseFields(fields: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    map[fields[i]!] = fields[i + 1]!;
  }
  return map;
}

// =============================================================================
// Test Suite
// =============================================================================

describe("Worker Redis Streams E2E (TODO-093)", () => {
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
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant.id}::uuid`;
    });
    await clearTenantContext(db);
  });

  // ===========================================================================
  // 1. Outbox insert -> processor pickup -> Redis Stream publish
  // ===========================================================================

  describe("Outbox to handler pipeline", () => {
    it("should flow domain event from outbox insert through Redis Stream to consumer handler", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const consumerGroup = `test-pipeline-group-${Date.now()}`;
      const consumerName = `test-pipeline-consumer-${Date.now()}`;
      const employeeNumber = `WRK-PIPE-${Date.now()}`;

      // Step 1: Create employee and outbox event atomically (simulating real business write)
      let outboxId: string;
      await db.begin(async (tx) => {
        const empResult = await tx<{ id: string }[]>`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenant.id}::uuid, ${employeeNumber}, 'pending', CURRENT_DATE)
          RETURNING id
        `;
        const employeeId = empResult[0]!.id;

        const outboxResult = await tx<{ id: string }[]>`
          INSERT INTO app.domain_outbox (
            tenant_id, aggregate_type, aggregate_id, event_type, payload, metadata
          )
          VALUES (
            ${tenant.id}::uuid, 'employee', ${employeeId}::uuid,
            'hr.employee.created',
            ${JSON.stringify({ employeeId, employeeNumber, actor: user.id })}::jsonb,
            ${JSON.stringify({ correlationId: crypto.randomUUID() })}::jsonb
          )
          RETURNING id
        `;
        outboxId = outboxResult[0]!.id;
      });

      // Step 2: Simulate outbox processor picking up the event
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
          WHERE id = ${outboxId!}::uuid
            AND processed_at IS NULL
          FOR UPDATE SKIP LOCKED
        `;
      });

      expect(events.length).toBe(1);
      expect(events[0]!.eventType).toBe("hr.employee.created");

      // Step 3: Publish to Redis Stream (as outbox processor would)
      await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM");

      const domainEvent = buildDomainEvent(events[0]!);
      await redis.xadd(
        streamKey,
        "*",
        "eventId", domainEvent.eventId,
        "eventType", domainEvent.eventType,
        "tenantId", domainEvent.tenantId,
        "aggregateType", domainEvent.aggregateType,
        "aggregateId", domainEvent.aggregateId,
        "payload", JSON.stringify(domainEvent)
      );

      // Mark outbox as processed
      await withSystemContext(db, async (tx) => {
        await tx`SELECT app.mark_outbox_event_processed(${outboxId!}::uuid)`;
      });

      // Step 4: Consumer reads from stream (simulating event handler)
      const results = (await redis.xreadgroup(
        "GROUP", consumerGroup, consumerName,
        "COUNT", 10, "BLOCK", 2000,
        "STREAMS", streamKey, ">"
      )) as Array<[string, Array<[string, string[]]>]> | null;

      expect(results).not.toBeNull();
      const [, messages] = results![0]!;
      expect(messages.length).toBe(1);

      const [messageId, fields] = messages[0]!;
      const fieldMap = parseFields(fields);
      const consumed: DomainEvent = JSON.parse(fieldMap["payload"]!);

      // Verify event fidelity
      expect(consumed.eventId).toBe(outboxId!);
      expect(consumed.tenantId).toBe(tenant.id);
      expect(consumed.eventType).toBe("hr.employee.created");
      expect(consumed.payload.employeeNumber).toBe(employeeNumber);

      // Acknowledge (handler completed successfully)
      await redis.xack(streamKey, consumerGroup, messageId);

      // Step 5: Verify outbox entry is processed
      const final = await withSystemContext(db, async (tx) => {
        return await tx<{ processedAt: Date | null }[]>`
          SELECT processed_at as "processedAt"
          FROM app.domain_outbox
          WHERE id = ${outboxId!}::uuid
        `;
      });
      expect(final[0]!.processedAt).not.toBeNull();

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE employee_number = ${employeeNumber}`;
      });
      await cleanupStream(redis, streamKey);
    });

    it("should route different event types to correct handlers via handler registry", async () => {
      if (!isInfraAvailable()) return;

      // Build a handler registry identical to domain-event-handlers pattern
      const handledEvents: Array<{ eventType: string; handler: string }> = [];
      const handlers = new Map<string, Array<(e: DomainEvent) => Promise<void>>>();

      function registerHandler(
        pattern: string,
        handler: (e: DomainEvent) => Promise<void>
      ) {
        const existing = handlers.get(pattern) || [];
        existing.push(handler);
        handlers.set(pattern, existing);
      }

      function getHandlers(eventType: string) {
        const result: Array<(e: DomainEvent) => Promise<void>> = [];
        // Exact match
        const exact = handlers.get(eventType);
        if (exact) result.push(...exact);
        // Wildcard match
        for (const [pattern, patternHandlers] of handlers.entries()) {
          if (pattern.endsWith(".*")) {
            const prefix = pattern.slice(0, -2);
            if (eventType.startsWith(prefix + ".")) {
              result.push(...patternHandlers);
            }
          }
        }
        // Global match
        const global = handlers.get("*");
        if (global) result.push(...global);
        return result;
      }

      // Register handlers for different event types
      registerHandler("hr.employee.created", async (e) => {
        handledEvents.push({ eventType: e.eventType, handler: "hr.employee.created" });
      });
      registerHandler("hr.employee.terminated", async (e) => {
        handledEvents.push({ eventType: e.eventType, handler: "hr.employee.terminated" });
      });
      registerHandler("absence.request.submitted", async (e) => {
        handledEvents.push({ eventType: e.eventType, handler: "absence.request.submitted" });
      });
      registerHandler("hr.employee.*", async (e) => {
        handledEvents.push({ eventType: e.eventType, handler: "hr.employee.*" });
      });

      // Dispatch various event types
      const testEvents: DomainEvent[] = [
        {
          eventId: crypto.randomUUID(),
          tenantId: tenant.id,
          aggregateType: "employee",
          aggregateId: crypto.randomUUID(),
          eventType: "hr.employee.created",
          payload: {},
          metadata: { createdAt: new Date().toISOString(), publishedAt: new Date().toISOString() },
        },
        {
          eventId: crypto.randomUUID(),
          tenantId: tenant.id,
          aggregateType: "employee",
          aggregateId: crypto.randomUUID(),
          eventType: "hr.employee.terminated",
          payload: {},
          metadata: { createdAt: new Date().toISOString(), publishedAt: new Date().toISOString() },
        },
        {
          eventId: crypto.randomUUID(),
          tenantId: tenant.id,
          aggregateType: "leave_request",
          aggregateId: crypto.randomUUID(),
          eventType: "absence.request.submitted",
          payload: {},
          metadata: { createdAt: new Date().toISOString(), publishedAt: new Date().toISOString() },
        },
      ];

      for (const event of testEvents) {
        const eventHandlers = getHandlers(event.eventType);
        for (const handler of eventHandlers) {
          await handler(event);
        }
      }

      // hr.employee.created: exact + wildcard = 2 handlers
      const createdHandlers = handledEvents.filter(
        (e) => e.eventType === "hr.employee.created"
      );
      expect(createdHandlers.length).toBe(2);
      expect(createdHandlers.some((h) => h.handler === "hr.employee.created")).toBe(true);
      expect(createdHandlers.some((h) => h.handler === "hr.employee.*")).toBe(true);

      // hr.employee.terminated: exact + wildcard = 2 handlers
      const terminatedHandlers = handledEvents.filter(
        (e) => e.eventType === "hr.employee.terminated"
      );
      expect(terminatedHandlers.length).toBe(2);

      // absence.request.submitted: exact only = 1 handler
      const absenceHandlers = handledEvents.filter(
        (e) => e.eventType === "absence.request.submitted"
      );
      expect(absenceHandlers.length).toBe(1);
    });
  });

  // ===========================================================================
  // 2. Multiple events processed in insertion order
  // ===========================================================================

  describe("Ordering guarantees", () => {
    it("should process multiple outbox events preserving insertion order", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const consumerGroup = `test-order-group-${Date.now()}`;
      const consumerName = `test-order-consumer-${Date.now()}`;
      const eventCount = 10;
      const outboxIds: string[] = [];

      // Create consumer group
      await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM");

      // Insert multiple outbox events with sequence numbers
      for (let i = 0; i < eventCount; i++) {
        const aggregateId = crypto.randomUUID();
        const result = await db<{ id: string }[]>`
          INSERT INTO app.domain_outbox (
            tenant_id, aggregate_type, aggregate_id, event_type, payload
          )
          VALUES (
            ${tenant.id}::uuid, 'employee', ${aggregateId}::uuid,
            'hr.employee.updated',
            ${JSON.stringify({ sequence: i, employeeId: aggregateId })}::jsonb
          )
          RETURNING id
        `;
        outboxIds.push(result[0]!.id);
      }

      // Simulate outbox processor: read and publish all
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
          ORDER BY created_at ASC
        `;
      });

      expect(events.length).toBe(eventCount);

      for (const evt of events) {
        const domainEvent = buildDomainEvent(evt);
        await redis.xadd(
          streamKey, "*",
          "payload", JSON.stringify(domainEvent)
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
        "GROUP", consumerGroup, consumerName,
        "COUNT", eventCount + 5, "BLOCK", 2000,
        "STREAMS", streamKey, ">"
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
        await redis.xack(streamKey, consumerGroup, msgId);
      }

      await cleanupStream(redis, streamKey);
    });
  });

  // ===========================================================================
  // 3. Consumer group behavior
  // ===========================================================================

  describe("Consumer group behavior", () => {
    it("should distribute messages across multiple consumers in same group", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const consumerGroup = `test-dist-group-${Date.now()}`;
      const consumer1 = `consumer-1-${Date.now()}`;
      const consumer2 = `consumer-2-${Date.now()}`;

      await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM");

      // Publish 6 messages
      const messageCount = 6;
      for (let i = 0; i < messageCount; i++) {
        await redis.xadd(
          streamKey, "*",
          "payload", JSON.stringify({ seq: i }),
          "eventType", "test.event"
        );
      }

      // Consumer 1 reads first batch
      const results1 = (await redis.xreadgroup(
        "GROUP", consumerGroup, consumer1,
        "COUNT", 3, "BLOCK", 1000,
        "STREAMS", streamKey, ">"
      )) as Array<[string, Array<[string, string[]]>]> | null;

      // Consumer 2 reads remaining batch
      const results2 = (await redis.xreadgroup(
        "GROUP", consumerGroup, consumer2,
        "COUNT", 10, "BLOCK", 1000,
        "STREAMS", streamKey, ">"
      )) as Array<[string, Array<[string, string[]]>]> | null;

      const count1 = results1 ? results1[0]![1].length : 0;
      const count2 = results2 ? results2[0]![1].length : 0;

      // Together they should have consumed all messages
      expect(count1 + count2).toBe(messageCount);
      // Consumer 1 should have taken some messages
      expect(count1).toBeGreaterThan(0);

      // Acknowledge all messages from both consumers
      if (results1) {
        for (const [msgId] of results1[0]![1]) {
          await redis.xack(streamKey, consumerGroup, msgId);
        }
      }
      if (results2) {
        for (const [msgId] of results2[0]![1]) {
          await redis.xack(streamKey, consumerGroup, msgId);
        }
      }

      // Verify no pending messages
      const pending = await redis.xpending(streamKey, consumerGroup);
      expect(Number(pending[0])).toBe(0);

      await cleanupStream(redis, streamKey);
    });

    it("should not deliver same message to two consumers in the same group", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();
      const consumerGroup = `test-nodup-group-${Date.now()}`;
      const consumer1 = `consumer-nodup-1-${Date.now()}`;
      const consumer2 = `consumer-nodup-2-${Date.now()}`;

      await redis.xgroup("CREATE", streamKey, consumerGroup, "$", "MKSTREAM");

      // Publish single message
      await redis.xadd(
        streamKey, "*",
        "payload", JSON.stringify({ unique: true })
      );

      // Both consumers try to read
      const results1 = (await redis.xreadgroup(
        "GROUP", consumerGroup, consumer1,
        "COUNT", 1, "BLOCK", 1000,
        "STREAMS", streamKey, ">"
      )) as Array<[string, Array<[string, string[]]>]> | null;

      const results2 = (await redis.xreadgroup(
        "GROUP", consumerGroup, consumer2,
        "COUNT", 1, "BLOCK", 500,
        "STREAMS", streamKey, ">"
      )) as Array<[string, Array<[string, string[]]>]> | null;

      const count1 = results1 ? results1[0]![1].length : 0;
      const count2 = results2 ? results2[0]![1].length : 0;

      // Exactly one consumer should have received the message
      expect(count1 + count2).toBe(1);

      await cleanupStream(redis, streamKey);
    });
  });

  // ===========================================================================
  // 4. Stream trimming after processing
  // ===========================================================================

  describe("Stream maintenance", () => {
    it("should support XTRIM to cap stream length after processing", async () => {
      if (!isInfraAvailable()) return;

      const streamKey = testStreamKey();

      // Add 20 messages
      for (let i = 0; i < 20; i++) {
        await redis.xadd(
          streamKey, "*",
          "payload", JSON.stringify({ i })
        );
      }

      const lenBefore = await redis.xlen(streamKey);
      expect(lenBefore).toBe(20);

      // Trim to approximately 5 messages
      await redis.xtrim(streamKey, "MAXLEN", "~", 5);

      const lenAfter = await redis.xlen(streamKey);
      // MAXLEN ~ is approximate, but should be significantly reduced
      expect(lenAfter).toBeLessThanOrEqual(10);

      await cleanupStream(redis, streamKey);
    });
  });

  // ===========================================================================
  // 5. Outbox event with notification side-effect verification
  // ===========================================================================

  describe("Outbox event side-effects", () => {
    it("should publish notification to NOTIFICATIONS stream when handler queues one", async () => {
      if (!isInfraAvailable()) return;

      // Use a unique prefix for the notifications stream to avoid interference
      const notifStreamKey = `test:notifs:${Date.now()}`;

      // Simulate what a handler does: queue a notification to Redis
      const notificationPayload = {
        id: crypto.randomUUID(),
        type: "notification.email",
        tenantId: tenant.id,
        data: {
          to: "test@example.com",
          subject: "Welcome!",
          template: "welcome",
          templateData: { firstName: "Test" },
        },
      };

      await redis.xadd(
        notifStreamKey,
        "*",
        "payload",
        JSON.stringify(notificationPayload),
        "attempt",
        "1"
      );

      // Read from the notification stream
      const notifMessages = await redis.xrange(notifStreamKey, "-", "+");
      expect(notifMessages.length).toBe(1);

      const [, fields] = notifMessages[0]!;
      const fieldMap = parseFields(fields);
      const parsed = JSON.parse(fieldMap["payload"]!);

      expect(parsed.type).toBe("notification.email");
      expect(parsed.tenantId).toBe(tenant.id);
      expect(parsed.data.to).toBe("test@example.com");
      expect(parsed.data.subject).toBe("Welcome!");

      await redis.del(notifStreamKey);
    });
  });
});
