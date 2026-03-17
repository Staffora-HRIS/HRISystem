/**
 * Integrations Module - Service Layer
 *
 * Business logic for managing third-party integrations.
 * All integrations are tenant-scoped.
 * Emits domain events via the outbox pattern for mutations.
 */

import type { DatabaseClient } from "../../plugins/db";
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

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'integration',
          ${result.id},
          'integration.connected',
          ${JSON.stringify({ integrationId: result.id, provider: data.provider, actor: ctx.userId })}::jsonb,
          now()
        )
      `;

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

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'integration',
          ${id},
          'integration.config_updated',
          ${JSON.stringify({ integrationId: id, actor: ctx.userId })}::jsonb,
          now()
        )
      `;

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

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'integration',
          ${id},
          'integration.disconnected',
          ${JSON.stringify({ integrationId: id, provider: result.provider, actor: ctx.userId })}::jsonb,
          now()
        )
      `;

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
        // Write outbox event in same transaction
        await tx`
          INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
          VALUES (
            ${crypto.randomUUID()},
            ${ctx.tenantId},
            'integration',
            ${id},
            'integration.deleted',
            ${JSON.stringify({ integrationId: id, actor: ctx.userId })}::jsonb,
            now()
          )
        `;
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
}
