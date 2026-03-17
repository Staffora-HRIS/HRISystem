/**
 * Background Checks Service
 *
 * Business logic for background check provider integration.
 * Handles requesting checks, tracking status, and processing
 * provider webhook callbacks. TODO-194.
 */

import crypto from "node:crypto";
import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { emitDomainEvent } from "../../lib/outbox";
import {
  withServiceErrorHandling,
  notFound,
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "../../lib/service-errors";
import { BackgroundCheckRepository, type TenantContext, type BackgroundCheckRequest } from "./repository";

// =============================================================================
// Service
// =============================================================================

export class BackgroundCheckService {
  private repository: BackgroundCheckRepository;

  constructor(private db: DatabaseClient) {
    this.repository = new BackgroundCheckRepository(db);
  }

  /**
   * List background check requests with cursor-based pagination.
   */
  async list(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      employeeId?: string;
      status?: string;
      checkType?: string;
      provider?: string;
      search?: string;
    } = {}
  ) {
    return this.repository.list(ctx, options);
  }

  /**
   * Get a single background check request by ID.
   */
  async getById(ctx: TenantContext, id: string): Promise<ServiceResult<BackgroundCheckRequest>> {
    return withServiceErrorHandling("fetching background check request", async () => {
      const check = await this.repository.getById(ctx, id);
      if (!check) return notFound("Background check request");
      return serviceSuccess(check);
    });
  }

  /**
   * Request a new background check from an external provider.
   *
   * Creates the request in 'pending' status, generates a webhook secret
   * for HMAC verification of provider callbacks, then simulates sending
   * to the provider by transitioning to 'in_progress' with a generated
   * provider reference.
   *
   * In a real integration, the provider API call would happen here and
   * the provider_reference would come from the provider's response.
   * The check would remain 'pending' until the provider confirms receipt.
   */
  async requestCheck(
    ctx: TenantContext,
    data: {
      employeeId: string;
      checkType: string;
      provider: string;
      notes?: string;
    }
  ): Promise<ServiceResult<BackgroundCheckRequest>> {
    return withServiceErrorHandling("requesting background check", async () => {
      // Generate a per-request webhook secret for HMAC signature verification
      const webhookSecret = crypto.randomBytes(32).toString("hex");

      const result = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
        // Create the request record
        const check = await this.repository.create(
          ctx,
          {
            employeeId: data.employeeId,
            checkType: data.checkType,
            provider: data.provider,
            requestedBy: ctx.userId,
            webhookSecret,
          },
          tx
        );

        // In a real integration, this is where we would call the provider API.
        // The provider would return a reference ID. For now, we generate one
        // and immediately transition to in_progress to simulate the provider
        // accepting the request.
        const providerReference = `${data.provider.toUpperCase().replace(/\s+/g, "_")}-${crypto.randomUUID().slice(0, 8)}`;

        const updatedCheck = await this.repository.markInProgress(
          ctx,
          check.id,
          providerReference,
          tx
        );

        if (!updatedCheck) {
          throw new Error("Failed to transition background check to in_progress");
        }

        // Emit domain event atomically with the business write
        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "background_check_request",
          aggregateId: updatedCheck.id,
          eventType: "recruitment.background_check.requested",
          payload: {
            backgroundCheck: updatedCheck,
            checkType: data.checkType,
            provider: data.provider,
            employeeId: data.employeeId,
          },
          userId: ctx.userId,
        });

        return updatedCheck;
      });

      return serviceSuccess(result);
    });
  }

  /**
   * Process a webhook callback from an external screening provider.
   *
   * This method uses system context to bypass RLS since webhook callbacks
   * are provider-initiated (unauthenticated from a tenant perspective).
   * The provider_reference is used to locate the matching request record.
   *
   * Optionally verifies HMAC signature if the provider sends one in the
   * X-Webhook-Signature header.
   *
   * @param providerName - The provider name from the URL path
   * @param providerReference - The provider's reference ID for the check
   * @param status - Final status from the provider (completed or failed)
   * @param result - Provider-specific result payload (JSONB)
   * @param signature - Optional HMAC signature from the provider for verification
   * @param rawBody - Optional raw request body for HMAC verification
   */
  async processWebhook(
    providerName: string,
    providerReference: string,
    status: "completed" | "failed",
    result: Record<string, unknown> | null,
    signature?: string,
    rawBody?: string
  ): Promise<ServiceResult<BackgroundCheckRequest>> {
    return withServiceErrorHandling("processing background check webhook", async () => {
      const updatedCheck = await this.db.withSystemContext(async (tx: TransactionSql) => {
        // Look up the request by provider reference to verify it exists
        const existing = await this.repository.findByProviderReference(
          providerName,
          providerReference,
          tx
        );

        if (!existing) {
          return null;
        }

        // Verify HMAC signature if provided
        if (signature && rawBody && existing.webhookSecret) {
          const expectedSignature = crypto
            .createHmac("sha256", existing.webhookSecret)
            .update(rawBody)
            .digest("hex");

          if (!crypto.timingSafeEqual(
            Buffer.from(signature, "hex"),
            Buffer.from(expectedSignature, "hex")
          )) {
            return "INVALID_SIGNATURE" as const;
          }
        }

        // Only process if the check is currently in_progress
        if (existing.status !== "in_progress") {
          return "INVALID_STATUS" as const;
        }

        // Record the result
        const updated = await this.repository.recordResult(
          providerName,
          providerReference,
          status,
          result,
          tx
        );

        if (!updated) {
          return null;
        }

        // Emit domain event atomically with the result update
        await emitDomainEvent(tx, {
          tenantId: updated.tenantId,
          aggregateType: "background_check_request",
          aggregateId: updated.id,
          eventType: `recruitment.background_check.${status}`,
          payload: {
            backgroundCheck: updated,
            provider: providerName,
            providerReference,
            result,
          },
        });

        return updated;
      });

      if (updatedCheck === null) {
        return notFound("Background check request");
      }

      if (updatedCheck === "INVALID_SIGNATURE") {
        return serviceFailure(
          "FORBIDDEN",
          "Invalid webhook signature"
        );
      }

      if (updatedCheck === "INVALID_STATUS") {
        return serviceFailure(
          "INVALID_TRANSITION",
          "Background check is not in a state that accepts webhook callbacks (must be in_progress)"
        );
      }

      return serviceSuccess(updatedCheck);
    });
  }
}
