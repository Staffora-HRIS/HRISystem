/**
 * Integrations Module - Service Layer
 *
 * Business logic for managing third-party integrations.
 * All integrations are tenant-scoped.
 * Emits domain events via the outbox pattern for mutations.
 */

import type { DatabaseClient } from "../../plugins/db";
import { emitDomainEvent } from "../../lib/outbox";
import {
  IntegrationsRepository,
  type IntegrationRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  IntegrationFilters,
  PaginationQuery,
  IntegrationResponse,
  ConnectIntegration,
  UpdateIntegrationConfig,
  TestConnectionResponse,
} from "./schemas";

// =============================================================================
// Mappers
// =============================================================================

function mapIntegrationToResponse(row: IntegrationRow): IntegrationResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    provider: row.provider,
    name: row.name,
    description: row.description,
    category: row.category,
    status: row.status,
    last_sync_at: row.lastSyncAt?.toISOString() ?? null,
    error_message: row.errorMessage,
    webhook_url: row.webhookUrl,
    enabled: row.enabled,
    connected_at: row.connectedAt?.toISOString() ?? null,
    connected_by: row.connectedBy,
    disconnected_at: row.disconnectedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// =============================================================================
// Service
// =============================================================================

export class IntegrationsService {
  constructor(
    private repository: IntegrationsRepository,
    private db: DatabaseClient
  ) {}

  /**
   * List integrations for the current tenant
   */
  async listIntegrations(
    ctx: TenantContext,
    filters: IntegrationFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<IntegrationResponse>> {
    const result = await this.repository.listIntegrations(
      ctx,
      filters,
      pagination
    );

    return {
      items: result.items.map(mapIntegrationToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single integration by ID
   */
  async getIntegration(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<IntegrationResponse>> {
    const integration = await this.repository.getById(ctx, id);

    if (!integration) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Integration not found",
        },
      };
    }

    return { success: true, data: mapIntegrationToResponse(integration) };
  }

  /**
   * Connect (create or update) an integration, with outbox event
   */
  async connectIntegration(
    ctx: TenantContext,
    data: ConnectIntegration
  ): Promise<ServiceResult<IntegrationResponse>> {
    const integration = await this.db.withTransaction(ctx, async (tx) => {
      const result = await this.repository.connect(ctx, data, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "integration",
        aggregateId: result.id,
        eventType: "integration.connected",
        payload: {
          integrationId: result.id,
          provider: data.provider,
          category: data.category,
        },
        userId: ctx.userId,
      });

      return result;
    });

    return { success: true, data: mapIntegrationToResponse(integration) };
  }

  /**
   * Update integration configuration
   */
  async updateConfig(
    ctx: TenantContext,
    id: string,
    data: UpdateIntegrationConfig
  ): Promise<ServiceResult<IntegrationResponse>> {
    const integration = await this.db.withTransaction(ctx, async (tx) => {
      const result = await this.repository.updateConfig(ctx, id, data, tx);

      if (!result) {
        return null;
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "integration",
        aggregateId: id,
        eventType: "integration.config_updated",
        payload: {
          integrationId: id,
          provider: result.provider,
        },
        userId: ctx.userId,
      });

      return result;
    });

    if (!integration) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Integration not found",
        },
      };
    }

    return { success: true, data: mapIntegrationToResponse(integration) };
  }

  /**
   * Disconnect an integration
   */
  async disconnectIntegration(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<IntegrationResponse>> {
    const integration = await this.db.withTransaction(ctx, async (tx) => {
      const result = await this.repository.disconnect(ctx, id, tx);

      if (!result) {
        return null;
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "integration",
        aggregateId: id,
        eventType: "integration.disconnected",
        payload: {
          integrationId: id,
          provider: result.provider,
        },
        userId: ctx.userId,
      });

      return result;
    });

    if (!integration) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Integration not found or already disconnected",
        },
      };
    }

    return { success: true, data: mapIntegrationToResponse(integration) };
  }

  /**
   * Delete an integration permanently
   */
  async deleteIntegration(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    const deleted = await this.db.withTransaction(ctx, async (tx) => {
      const success = await this.repository.deleteIntegration(ctx, id, tx);

      if (success) {
        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "integration",
          aggregateId: id,
          eventType: "integration.deleted",
          payload: { integrationId: id },
          userId: ctx.userId,
        });
      }

      return success;
    });

    if (!deleted) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Integration not found",
        },
      };
    }

    return { success: true, data: { deleted: true } };
  }

  /**
   * Test an integration connection by verifying the stored config is valid.
   *
   * For now this performs a lightweight validation (checks the integration
   * exists, is connected, and has non-empty config). Actual provider-specific
   * connectivity checks (OAuth token refresh, API ping, etc.) would be
   * added per-provider in future iterations.
   */
  async testConnection(
    ctx: TenantContext,
    provider: string
  ): Promise<ServiceResult<TestConnectionResponse>> {
    const startMs = Date.now();

    const integration = await this.repository.getByProvider(ctx, provider);

    if (!integration) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `No integration found for provider '${provider}'`,
        },
      };
    }

    if (integration.status !== "connected") {
      return {
        success: true,
        data: {
          success: false,
          provider,
          message: `Integration is not connected (status: ${integration.status})`,
          latencyMs: Date.now() - startMs,
          testedAt: new Date().toISOString(),
        },
      };
    }

    // Validate that config has at least one credential present
    const config = integration.config as Record<string, unknown>;
    const hasCredentials =
      config &&
      Object.keys(config).length > 0 &&
      Object.values(config).some(
        (v) => v !== null && v !== undefined && v !== ""
      );

    if (!hasCredentials) {
      // Update status to error since config is incomplete
      await this.db.withTransaction(ctx, async (tx) => {
        await tx`
          UPDATE integrations
          SET status = 'error', error_message = 'Missing credentials', updated_at = now()
          WHERE id = ${integration.id}
        `;

        await emitDomainEvent(tx, {
          tenantId: ctx.tenantId,
          aggregateType: "integration",
          aggregateId: integration.id,
          eventType: "integration.test_failed",
          payload: {
            integrationId: integration.id,
            provider,
            reason: "Missing credentials",
          },
          userId: ctx.userId,
        });
      });

      return {
        success: true,
        data: {
          success: false,
          provider,
          message: "Connection test failed: credentials are missing or empty",
          latencyMs: Date.now() - startMs,
          testedAt: new Date().toISOString(),
        },
      };
    }

    // Record a successful test event
    await this.db.withTransaction(ctx, async (tx) => {
      await tx`
        UPDATE integrations
        SET error_message = NULL, last_sync_at = now(), updated_at = now()
        WHERE id = ${integration.id}
      `;

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "integration",
        aggregateId: integration.id,
        eventType: "integration.test_passed",
        payload: {
          integrationId: integration.id,
          provider,
        },
        userId: ctx.userId,
      });
    });

    return {
      success: true,
      data: {
        success: true,
        provider,
        message: "Connection test passed successfully",
        latencyMs: Date.now() - startMs,
        testedAt: new Date().toISOString(),
      },
    };
  }
}
