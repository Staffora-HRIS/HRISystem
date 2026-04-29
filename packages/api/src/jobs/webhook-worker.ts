/**
 * Webhook Delivery Worker
 *
 * Background processor that:
 * 1. Listens for domain events and creates delivery records for matching subscriptions
 * 2. Polls pending deliveries and executes HTTP POST requests with HMAC-SHA256 signatures
 * 3. Retries failed deliveries with exponential backoff (1min, 5min, 30min, 2hr, 24hr approx)
 * 4. Marks deliveries as expired after max attempts exceeded
 *
 * This module exports:
 * - A domain event handler that enqueues deliveries (registered in domain-event-handlers.ts)
 * - A Redis Streams processor that executes pending deliveries
 */

import type { DomainEvent } from "./outbox-processor";
import type { EventHandlerContext } from "./domain-event-handlers";
import type { ProcessorRegistration, JobPayload, JobContext } from "./base";
import { WebhooksRepository } from "../modules/webhooks/repository";
import { WebhooksService } from "../modules/webhooks/service";

// =============================================================================
// Constants
// =============================================================================

const DELIVERY_BATCH_SIZE = 50;

// =============================================================================
// Domain Event Handler
// =============================================================================

/**
 * Handle any domain event by checking for matching webhook subscriptions
 * and creating delivery records. This is registered as a global ("*") handler
 * in domain-event-handlers.ts so it receives every domain event.
 */
export async function handleWebhookDelivery(
  event: DomainEvent,
  ctx: EventHandlerContext
): Promise<void> {
  try {
    const repository = new WebhooksRepository(ctx.db);
    const service = new WebhooksService(repository, ctx.db);

    const deliveryIds = await service.enqueueDeliveries(
      event.tenantId,
      event.eventId,
      event.eventType,
      event.payload
    );

    if (deliveryIds.length > 0) {
      ctx.log.info("Webhook deliveries enqueued", {
        eventType: event.eventType,
        tenantId: event.tenantId,
        deliveryCount: deliveryIds.length,
      });
    }
  } catch (error) {
    // Webhook delivery is best-effort; log but do not re-throw
    // to avoid blocking other event handlers
    ctx.log.error("Failed to enqueue webhook deliveries", error);
  }
}

// =============================================================================
// Delivery Executor (Redis Streams Processor)
// =============================================================================

/**
 * Process pending webhook deliveries. This processor is registered with
 * the worker system and triggered periodically or by a scheduled job.
 */
async function processWebhookDeliveries(
  payload: JobPayload,
  context: JobContext
): Promise<void> {
  const repository = new WebhooksRepository(context.db);
  const service = new WebhooksService(repository, context.db);

  const batchSize = (payload.data as any)?.batchSize ?? DELIVERY_BATCH_SIZE;
  const pendingDeliveries = await repository.getPendingDeliveries(batchSize);

  if (pendingDeliveries.length === 0) {
    context.log.debug("No pending webhook deliveries");
    return;
  }

  context.log.info("Processing webhook deliveries", {
    count: pendingDeliveries.length,
  });

  // Process deliveries concurrently (up to 10 at a time)
  const concurrency = 10;
  for (let i = 0; i < pendingDeliveries.length; i += concurrency) {
    const batch = pendingDeliveries.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((delivery) => service.executeDelivery(delivery))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const delivery = batch[j];
      if (result.status === "rejected") {
        context.log.error(
          "Webhook delivery execution failed unexpectedly",
          result.reason,
          { deliveryId: delivery.id }
        );
      } else if (result.value.success) {
        context.log.debug("Webhook delivery succeeded", {
          deliveryId: delivery.id,
          responseCode: result.value.responseCode,
        });
      } else {
        context.log.debug("Webhook delivery failed, will retry", {
          deliveryId: delivery.id,
          responseCode: result.value.responseCode,
          attempt: delivery.attempts + 1,
          maxAttempts: delivery.maxAttempts,
        });
      }
    }
  }
}

// =============================================================================
// Processor Registration
// =============================================================================

export const webhookDeliveryProcessor: ProcessorRegistration = {
  type: "webhook.deliver",
  processor: processWebhookDeliveries,
  timeoutMs: 120000, // 2 minutes
  retry: true,
};
