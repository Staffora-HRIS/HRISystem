/**
 * Benefits Exchange Module - Repository Layer
 *
 * Provides data access methods for Benefits Data Exchanges.
 * All methods respect RLS through tenant context.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  ExchangeType,
  ExchangeDirection,
  ExchangeFileFormat,
  ExchangeStatus,
  ExchangeHistoryQuery,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface DataExchangeRow extends Row {
  id: string;
  tenantId: string;
  providerId: string;
  providerName?: string | null;
  exchangeType: ExchangeType;
  direction: ExchangeDirection;
  fileFormat: ExchangeFileFormat;
  status: ExchangeStatus;
  payload: Record<string, unknown>;
  sentAt: Date | null;
  acknowledgedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Benefits Exchange Repository
// =============================================================================

export class BenefitsExchangeRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * List exchanges with optional filters and cursor-based pagination.
   */
  async findExchanges(
    context: TenantContext,
    filters: ExchangeHistoryQuery = {},
    pagination: { limit?: number; cursor?: string } = {}
  ): Promise<PaginatedResult<DataExchangeRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<DataExchangeRow[]>`
        SELECT
          bde.id, bde.tenant_id, bde.provider_id,
          bc.name AS provider_name,
          bde.exchange_type, bde.direction, bde.file_format,
          bde.status, bde.payload,
          bde.sent_at, bde.acknowledged_at, bde.error_message,
          bde.created_at, bde.updated_at
        FROM app.benefits_data_exchanges bde
        LEFT JOIN app.benefit_carriers bc ON bde.provider_id = bc.id
        WHERE 1=1
          ${filters.provider_id ? tx`AND bde.provider_id = ${filters.provider_id}::uuid` : tx``}
          ${filters.exchange_type ? tx`AND bde.exchange_type = ${filters.exchange_type}::app.benefits_exchange_type` : tx``}
          ${filters.direction ? tx`AND bde.direction = ${filters.direction}::app.benefits_exchange_direction` : tx``}
          ${filters.status ? tx`AND bde.status = ${filters.status}::app.benefits_exchange_status` : tx``}
          ${cursor ? tx`AND bde.id < ${cursor}::uuid` : tx``}
        ORDER BY bde.created_at DESC, bde.id DESC
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find a single exchange by ID.
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<DataExchangeRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<DataExchangeRow[]>`
        SELECT
          bde.id, bde.tenant_id, bde.provider_id,
          bc.name AS provider_name,
          bde.exchange_type, bde.direction, bde.file_format,
          bde.status, bde.payload,
          bde.sent_at, bde.acknowledged_at, bde.error_message,
          bde.created_at, bde.updated_at
        FROM app.benefits_data_exchanges bde
        LEFT JOIN app.benefit_carriers bc ON bde.provider_id = bc.id
        WHERE bde.id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Create a new exchange record (outbound or inbound).
   */
  async create(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      providerId: string;
      exchangeType: ExchangeType;
      direction: ExchangeDirection;
      fileFormat: ExchangeFileFormat;
      status?: ExchangeStatus;
      payload: Record<string, unknown>;
      sentAt?: Date | null;
    }
  ): Promise<DataExchangeRow> {
    const rows = await tx<DataExchangeRow[]>`
      INSERT INTO app.benefits_data_exchanges (
        tenant_id, provider_id, exchange_type, direction,
        file_format, status, payload, sent_at
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.providerId}::uuid,
        ${data.exchangeType}::app.benefits_exchange_type,
        ${data.direction}::app.benefits_exchange_direction,
        ${data.fileFormat}::app.benefits_exchange_file_format,
        ${data.status || "pending"}::app.benefits_exchange_status,
        ${JSON.stringify(data.payload)}::jsonb,
        ${data.sentAt || null}
      )
      RETURNING id, tenant_id, provider_id, exchange_type, direction,
                file_format, status, payload, sent_at, acknowledged_at,
                error_message, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update the status and optional fields of an exchange.
   */
  async updateStatus(
    tx: TransactionSql,
    _context: TenantContext,
    id: string,
    data: {
      status: ExchangeStatus;
      sentAt?: Date | null;
      acknowledgedAt?: Date | null;
      errorMessage?: string | null;
    }
  ): Promise<DataExchangeRow | null> {
    const rows = await tx<DataExchangeRow[]>`
      UPDATE app.benefits_data_exchanges
      SET
        status = ${data.status}::app.benefits_exchange_status,
        sent_at = COALESCE(${data.sentAt || null}, sent_at),
        acknowledged_at = COALESCE(${data.acknowledgedAt || null}, acknowledged_at),
        error_message = COALESCE(${data.errorMessage || null}, error_message),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, tenant_id, provider_id, exchange_type, direction,
                file_format, status, payload, sent_at, acknowledged_at,
                error_message, created_at, updated_at
    `;

    return rows[0] || null;
  }
}
