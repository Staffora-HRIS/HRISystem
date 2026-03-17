/**
 * Webhooks Module - Service Layer
 *
 * Business logic for webhook subscription management and delivery orchestration.
 * Handles validation, domain events, and webhook signing.
 */

import type { TransactionSql } from "postgres";
import { WebhooksRepository, type TenantContext, type PaginationOptions, type DeliveryFilters } from "./repository";
import type {
  CreateWebhookSubscription,
  UpdateWebhookSubscription,
  WebhookSubscriptionResponse,
  WebhookDeliveryResponse,
} from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of webhook subscriptions per tenant */
const MAX_SUBSCRIPTIONS_PER_TENANT = 50;

/** Default maximum delivery attempts */
const DEFAULT_MAX_ATTEMPTS = 5;

/** Base delay for exponential backoff (seconds) */
const BASE_RETRY_DELAY_SECONDS = 30;

// =============================================================================
// HMAC Signing
// =============================================================================

/**
 * Compute the HMAC-SHA256 signature of a payload.
 * The signature is returned as a hex-encoded string prefixed with "sha256=".
 */
export async function computeWebhookSignature(
  payload: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

/**
 * Calculate the next retry time using exponential backoff with jitter.
 * Attempt 1 -> ~30s, Attempt 2 -> ~60s, Attempt 3 -> ~120s, etc.
 * Capped at 1 hour.
 */
export function calculateNextRetryAt(attemptNumber: number): Date {
  const delay = Math.min(
    BASE_RETRY_DELAY_SECONDS * Math.pow(2, attemptNumber),
    3600 // Cap at 1 hour
  );
  // Add jitter: +/- 20%
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  const totalDelay = Math.max(delay + jitter, 10); // Minimum 10 seconds
  return new Date(Date.now() + totalDelay * 1000);
}

// =============================================================================
// Service
// =============================================================================

export class WebhooksService {
  constructor(
    private repository: WebhooksRepository,
    private db: any
  ) {}

  // ===========================================================================
  // Subscription Operations
  // ===========================================================================

  async listSubscriptions(
    ctx: TenantContext,
    pagination: PaginationOptions
  ) {
    return this.repository.listSubscriptions(ctx, pagination);
  }

  async getSubscription(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<WebhookSubscriptionResponse>> {
    const subscription = await this.repository.getSubscriptionById(ctx, id);

    if (!subscription) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Webhook subscription not found",
        },
      };
    }

    return { success: true, data: subscription };
  }

  async createSubscription(
    ctx: TenantContext,
    data: CreateWebhookSubscription
  ): Promise<ServiceResult<WebhookSubscriptionResponse>> {
    // Validate URL format (must be HTTPS in production)
    if (!this.isValidWebhookUrl(data.url)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Webhook URL must be a valid HTTPS URL",
          details: { field: "url" },
        },
      };
    }

    // Check subscription limit per tenant
    const existing = await this.repository.listSubscriptions(ctx, { limit: MAX_SUBSCRIPTIONS_PER_TENANT + 1 });
    if (existing.items.length >= MAX_SUBSCRIPTIONS_PER_TENANT) {
      return {
        success: false,
        error: {
          code: ErrorCodes.LIMIT_EXCEEDED,
          message: `Maximum of ${MAX_SUBSCRIPTIONS_PER_TENANT} webhook subscriptions per tenant`,
        },
      };
    }

    // Validate event type patterns
    for (const pattern of data.eventTypes) {
      if (!this.isValidEventTypePattern(pattern)) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Invalid event type pattern: ${pattern}`,
            details: {
              field: "eventTypes",
              hint: 'Use exact types like "hr.employee.created", prefix wildcards like "hr.employee.*", or "*" for all events',
            },
          },
        };
      }
    }

    try {
      const subscription = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createSubscription(ctx, data, tx);

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "webhook_subscription",
            aggregateId: result.id,
            eventType: "webhooks.subscription.created",
            payload: {
              subscriptionId: result.id,
              name: result.name,
              url: result.url,
              eventTypes: result.eventTypes,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: subscription };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error.message || "Failed to create webhook subscription",
        },
      };
    }
  }

  async updateSubscription(
    ctx: TenantContext,
    id: string,
    data: UpdateWebhookSubscription
  ): Promise<ServiceResult<WebhookSubscriptionResponse>> {
    const existing = await this.repository.getSubscriptionById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Webhook subscription not found",
        },
      };
    }

    // Validate URL if provided
    if (data.url && !this.isValidWebhookUrl(data.url)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Webhook URL must be a valid HTTPS URL",
          details: { field: "url" },
        },
      };
    }

    // Validate event type patterns if provided
    if (data.eventTypes) {
      for (const pattern of data.eventTypes) {
        if (!this.isValidEventTypePattern(pattern)) {
          return {
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: `Invalid event type pattern: ${pattern}`,
              details: { field: "eventTypes" },
            },
          };
        }
      }
    }

    try {
      const subscription = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateSubscription(ctx, id, data, tx);

          if (!result) {
            return null;
          }

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "webhook_subscription",
            aggregateId: id,
            eventType: "webhooks.subscription.updated",
            payload: {
              subscriptionId: id,
              changes: data,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!subscription) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update webhook subscription",
          },
        };
      }

      return { success: true, data: subscription };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to update webhook subscription",
        },
      };
    }
  }

  async deleteSubscription(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    const existing = await this.repository.getSubscriptionById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Webhook subscription not found",
        },
      };
    }

    try {
      const deleted = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.deleteSubscription(ctx, id, tx);

          if (result) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "webhook_subscription",
              aggregateId: id,
              eventType: "webhooks.subscription.deleted",
              payload: {
                subscriptionId: id,
                name: existing.name,
                actor: ctx.userId,
              },
            });
          }

          return result;
        }
      );

      return { success: true, data: { deleted } };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: error.message || "Failed to delete webhook subscription",
        },
      };
    }
  }

  // ===========================================================================
  // Delivery Operations
  // ===========================================================================

  async listDeliveries(
    ctx: TenantContext,
    subscriptionId: string,
    filters: DeliveryFilters,
    pagination: PaginationOptions
  ) {
    // Verify subscription exists and belongs to this tenant
    const subscription = await this.repository.getSubscriptionById(ctx, subscriptionId);
    if (!subscription) {
      return {
        success: false as const,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Webhook subscription not found",
        },
      };
    }

    const result = await this.repository.listDeliveries(ctx, subscriptionId, filters, pagination);
    return { success: true as const, data: result };
  }

  async getDelivery(
    ctx: TenantContext,
    deliveryId: string
  ): Promise<ServiceResult<WebhookDeliveryResponse>> {
    const delivery = await this.repository.getDeliveryById(ctx, deliveryId);

    if (!delivery) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Webhook delivery not found",
        },
      };
    }

    return { success: true, data: delivery };
  }

  // ===========================================================================
  // Webhook Delivery (used by the worker)
  // ===========================================================================

  /**
   * Deliver a webhook event to all matching subscriptions for a tenant.
   * Creates delivery records and schedules them for immediate processing.
   */
  async enqueueDeliveries(
    tenantId: string,
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<string[]> {
    const subscriptions = await this.repository.findMatchingSubscriptions(
      tenantId,
      eventType
    );

    const deliveryIds: string[] = [];

    for (const subscription of subscriptions) {
      const deliveryId = await this.repository.createDelivery({
        tenantId,
        subscriptionId: subscription.id,
        eventId,
        eventType,
        payload,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        nextRetryAt: new Date(), // Immediate
      });
      deliveryIds.push(deliveryId);
    }

    return deliveryIds;
  }

  /**
   * Execute a single webhook delivery attempt.
   * Signs the payload and sends the HTTP request.
   */
  async executeDelivery(delivery: {
    id: string;
    subscriptionUrl: string;
    subscriptionSecret: string;
    eventType: string;
    payload: Record<string, unknown>;
    attempts: number;
    maxAttempts: number;
  }): Promise<{ success: boolean; responseCode?: number }> {
    const payloadStr = JSON.stringify(delivery.payload);
    const signature = await computeWebhookSignature(payloadStr, delivery.subscriptionSecret);
    const deliveryTimestamp = Math.floor(Date.now() / 1000).toString();

    const startTime = Date.now();
    let responseCode: number | undefined;
    let responseBody: string | undefined;
    let errorMessage: string | undefined;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(delivery.subscriptionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Timestamp": deliveryTimestamp,
          "X-Webhook-Event": delivery.eventType,
          "X-Webhook-Delivery-Id": delivery.id,
          "User-Agent": "Staffora-Webhooks/1.0",
        },
        body: payloadStr,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      responseCode = response.status;

      try {
        responseBody = await response.text();
      } catch {
        responseBody = "[Could not read response body]";
      }

      const durationMs = Date.now() - startTime;
      const success = responseCode >= 200 && responseCode < 300;

      if (!success) {
        errorMessage = `HTTP ${responseCode}`;
      }

      await this.repository.recordDeliveryAttempt(delivery.id, {
        success,
        responseCode,
        responseBody,
        errorMessage,
        durationMs,
        nextRetryAt: success
          ? undefined
          : delivery.attempts + 1 < delivery.maxAttempts
            ? calculateNextRetryAt(delivery.attempts + 1)
            : undefined,
      });

      return { success, responseCode };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      errorMessage = error.name === "AbortError"
        ? "Request timed out (30s)"
        : error.message || "Unknown error";

      await this.repository.recordDeliveryAttempt(delivery.id, {
        success: false,
        errorMessage,
        durationMs,
        nextRetryAt:
          delivery.attempts + 1 < delivery.maxAttempts
            ? calculateNextRetryAt(delivery.attempts + 1)
            : undefined,
      });

      return { success: false };
    }
  }

  // ===========================================================================
  // Validation Helpers
  // ===========================================================================

  /**
   * Validate that a URL is acceptable for webhook delivery.
   * In production, only HTTPS URLs are allowed.
   * In development, HTTP localhost is also accepted.
   */
  private isValidWebhookUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:") return true;
      // Allow HTTP in development for localhost testing
      if (
        process.env["NODE_ENV"] !== "production" &&
        parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Validate an event type pattern.
   * Allowed formats: "*", "category.entity.action", "category.entity.*"
   */
  private isValidEventTypePattern(pattern: string): boolean {
    if (pattern === "*") return true;
    // Must be dot-separated segments, optionally ending in .*
    return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*(\.\*)?$/.test(pattern);
  }

  // ===========================================================================
  // Domain Event Helper
  // ===========================================================================

  private async emitDomainEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    event: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
      ) VALUES (
        gen_random_uuid(), ${ctx.tenantId}::uuid, ${event.aggregateType},
        ${event.aggregateId}::uuid, ${event.eventType},
        ${JSON.stringify(event.payload)}::jsonb, now()
      )
    `;
  }
}
