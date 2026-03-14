/**
 * Shared Outbox Helper
 *
 * Centralizes the pattern of writing domain events to the outbox table.
 * Must always be called with the SAME transaction handle as the business write
 * to guarantee atomicity (outbox pattern).
 *
 * Usage:
 * ```ts
 * await db.withTransaction(ctx, async (tx) => {
 *   const [employee] = await tx`INSERT INTO employees ...`;
 *   await emitDomainEvent(tx, {
 *     tenantId: ctx.tenantId,
 *     aggregateType: "employee",
 *     aggregateId: employee.id,
 *     eventType: "hr.employee.created",
 *     payload: { employee, actor: ctx.userId },
 *   });
 * });
 * ```
 */

import type { TransactionSql } from "postgres";

export interface OutboxEvent {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  /** Optional convenience: when set, `{ actor: userId }` is merged into the payload automatically. */
  userId?: string;
}

/**
 * Emit a domain event via the transactional outbox.
 * MUST be called within the same transaction as the business write.
 *
 * If `userId` is provided on the event, it is automatically injected as
 * `actor` into the payload (matching the convention used across all services).
 */
export async function emitDomainEvent(
  tx: TransactionSql<Record<string, unknown>>,
  event: OutboxEvent
): Promise<void> {
  const finalPayload = event.userId
    ? { ...event.payload, actor: event.userId }
    : event.payload;

  await tx`
    INSERT INTO app.domain_outbox (
      id, tenant_id, aggregate_type, aggregate_id,
      event_type, payload, created_at
    )
    VALUES (
      gen_random_uuid(),
      ${event.tenantId}::uuid,
      ${event.aggregateType},
      ${event.aggregateId}::uuid,
      ${event.eventType},
      ${JSON.stringify(finalPayload)}::jsonb,
      now()
    )
  `;
}

/**
 * Emit multiple domain events in a single batch insert.
 * MUST be called within the same transaction as the business write.
 *
 * More efficient than calling `emitDomainEvent` in a loop when multiple
 * events need to be written (e.g., status change + special-case event).
 *
 * If `userId` is provided on any event, it is automatically injected as
 * `actor` into that event's payload.
 */
export async function emitDomainEvents(
  tx: TransactionSql<Record<string, unknown>>,
  events: OutboxEvent[]
): Promise<void> {
  if (events.length === 0) return;

  // For a single event, delegate to the singular version to avoid overhead
  if (events.length === 1) {
    return emitDomainEvent(tx, events[0]);
  }

  const rows = events.map((event) => {
    const finalPayload = event.userId
      ? { ...event.payload, actor: event.userId }
      : event.payload;

    return {
      tenant_id: event.tenantId,
      aggregate_type: event.aggregateType,
      aggregate_id: event.aggregateId,
      event_type: event.eventType,
      payload: JSON.stringify(finalPayload),
    };
  });

  // Build a batch INSERT using UNNEST for efficient multi-row insertion.
  // This avoids string concatenation and keeps the query parameterised.
  await tx`
    INSERT INTO app.domain_outbox (
      id, tenant_id, aggregate_type, aggregate_id,
      event_type, payload, created_at
    )
    SELECT
      gen_random_uuid(),
      tenant_id::uuid,
      aggregate_type,
      aggregate_id::uuid,
      event_type,
      payload::jsonb,
      now()
    FROM UNNEST(
      ${rows.map((r) => r.tenant_id)}::uuid[],
      ${rows.map((r) => r.aggregate_type)}::text[],
      ${rows.map((r) => r.aggregate_id)}::uuid[],
      ${rows.map((r) => r.event_type)}::text[],
      ${rows.map((r) => r.payload)}::jsonb[]
    ) AS t(tenant_id, aggregate_type, aggregate_id, event_type, payload)
  `;
}
