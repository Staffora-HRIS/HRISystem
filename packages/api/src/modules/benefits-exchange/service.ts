/**
 * Benefits Exchange Module - Service Layer
 *
 * Implements business logic for Benefits Provider Data Exchange.
 * Handles generating outbound exchange files, processing inbound files,
 * and querying exchange history.
 *
 * All domain events are written to the outbox atomically with business writes.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { BenefitsExchangeRepository, DataExchangeRow } from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  GenerateExchangeFile,
  ProcessInboundFile,
  ExchangeHistoryQuery,
  DataExchangeResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "benefits.exchange.outbound_generated"
  | "benefits.exchange.inbound_processed"
  | "benefits.exchange.status_changed";

// =============================================================================
// Benefits Exchange Service
// =============================================================================

export class BenefitsExchangeService {
  constructor(
    private repository: BenefitsExchangeRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateType: string,
    aggregateId: string,
    eventType: DomainEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        ${aggregateType},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Generate Outbound Exchange File
  // ===========================================================================

  /**
   * Generates an outbound exchange file for a benefits provider.
   *
   * Creates a new exchange record with direction=outbound and status=pending,
   * then emits a domain event for downstream processing.
   */
  async generateExchangeFile(
    context: TenantContext,
    data: GenerateExchangeFile
  ): Promise<ServiceResult<DataExchangeResponse>> {
    // Validate that the provider (carrier) exists by querying within tenant RLS
    const providerExists = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        SELECT id FROM app.benefit_carriers
        WHERE id = ${data.provider_id}::uuid AND is_active = true
      `;
      return rows.length > 0;
    });

    if (!providerExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Benefits provider (carrier) not found or inactive",
          details: { provider_id: data.provider_id },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const exchange = await this.repository.create(tx, context, {
        providerId: data.provider_id,
        exchangeType: data.exchange_type,
        direction: "outbound",
        fileFormat: data.file_format,
        status: "pending",
        payload: data.payload || {},
      });

      await this.emitEvent(
        tx,
        context,
        "benefits_data_exchange",
        exchange.id,
        "benefits.exchange.outbound_generated",
        {
          exchangeId: exchange.id,
          providerId: data.provider_id,
          exchangeType: data.exchange_type,
          fileFormat: data.file_format,
        }
      );

      return exchange;
    });

    // Re-fetch with provider name join
    const enriched = await this.repository.findById(context, result.id);

    return {
      success: true,
      data: this.mapToResponse(enriched || result),
    };
  }

  // ===========================================================================
  // Process Inbound File
  // ===========================================================================

  /**
   * Processes an inbound exchange file from a benefits provider.
   *
   * Creates a new exchange record with direction=inbound and status=acknowledged,
   * then emits a domain event for downstream processing.
   */
  async processInboundFile(
    context: TenantContext,
    data: ProcessInboundFile
  ): Promise<ServiceResult<DataExchangeResponse>> {
    // Validate that the provider (carrier) exists
    const providerExists = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        SELECT id FROM app.benefit_carriers
        WHERE id = ${data.provider_id}::uuid AND is_active = true
      `;
      return rows.length > 0;
    });

    if (!providerExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Benefits provider (carrier) not found or inactive",
          details: { provider_id: data.provider_id },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const exchange = await this.repository.create(tx, context, {
        providerId: data.provider_id,
        exchangeType: data.exchange_type,
        direction: "inbound",
        fileFormat: data.file_format,
        status: "acknowledged",
        payload: data.payload,
      });

      await this.emitEvent(
        tx,
        context,
        "benefits_data_exchange",
        exchange.id,
        "benefits.exchange.inbound_processed",
        {
          exchangeId: exchange.id,
          providerId: data.provider_id,
          exchangeType: data.exchange_type,
          fileFormat: data.file_format,
        }
      );

      return exchange;
    });

    // Re-fetch with provider name join
    const enriched = await this.repository.findById(context, result.id);

    return {
      success: true,
      data: this.mapToResponse(enriched || result),
    };
  }

  // ===========================================================================
  // Exchange History
  // ===========================================================================

  /**
   * Returns paginated exchange history, optionally filtered by provider,
   * exchange_type, direction, or status.
   */
  async getExchangeHistory(
    context: TenantContext,
    filters: ExchangeHistoryQuery = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<DataExchangeResponse>> {
    const result = await this.repository.findExchanges(
      context,
      filters,
      { limit: filters.limit || pagination.limit, cursor: filters.cursor || pagination.cursor }
    );

    return {
      items: result.items.map(this.mapToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single exchange by ID.
   */
  async getExchange(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<DataExchangeResponse>> {
    const exchange = await this.repository.findById(context, id);

    if (!exchange) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Data exchange not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(exchange),
    };
  }

  // ===========================================================================
  // Mapping Helpers
  // ===========================================================================

  private mapToResponse(row: DataExchangeRow): DataExchangeResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      provider_id: row.providerId,
      provider_name: row.providerName ?? null,
      exchange_type: row.exchangeType,
      direction: row.direction,
      file_format: row.fileFormat,
      status: row.status,
      payload: row.payload,
      sent_at: row.sentAt?.toISOString() ?? null,
      acknowledged_at: row.acknowledgedAt?.toISOString() ?? null,
      error_message: row.errorMessage,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
