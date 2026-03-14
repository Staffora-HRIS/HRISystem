/**
 * Bank Holiday Module - Service Layer
 *
 * Implements business logic for bank holiday configuration.
 * Enforces uniqueness constraints, validates input, and emits
 * domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  BankHolidayRepository,
  BankHolidayRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateBankHoliday,
  UpdateBankHoliday,
  BankHolidayFilters,
  BulkImportBankHolidays,
  PaginationQuery,
  BankHolidayResponse,
  BulkImportResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

/**
 * Domain event types for bank holidays
 */
type DomainEventType =
  | "bank_holidays.created"
  | "bank_holidays.updated"
  | "bank_holidays.deleted"
  | "bank_holidays.bulk_imported";

// =============================================================================
// Bank Holiday Service
// =============================================================================

export class BankHolidayService {
  constructor(
    private repository: BankHolidayRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox in the same transaction as the business write
   */
  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
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
        'bank_holiday',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Response Mapping
  // ===========================================================================

  /**
   * Map a database row to the API response shape.
   *
   * The DB row uses camelCase (via postgres.js transform) but the
   * API response uses snake_case to match the schema contracts.
   */
  private mapToResponse(row: BankHolidayRow): BankHolidayResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      name: row.name,
      date:
        row.date instanceof Date
          ? row.date.toISOString().split("T")[0]!
          : String(row.date),
      country_code: row.countryCode,
      region: row.region,
      created_at:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    };
  }

  // ===========================================================================
  // List
  // ===========================================================================

  /**
   * List bank holidays with filters and cursor-based pagination
   */
  async list(
    context: TenantContext,
    filters: BankHolidayFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<BankHolidayResponse>> {
    const result = await this.repository.findAll(context, filters, pagination);

    return {
      items: result.items.map((row) => this.mapToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Get by ID
  // ===========================================================================

  /**
   * Get a single bank holiday by ID
   */
  async getById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<BankHolidayResponse>> {
    const row = await this.repository.findById(context, id);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Bank holiday not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  // ===========================================================================
  // Create
  // ===========================================================================

  /**
   * Create a new bank holiday.
   *
   * Validates that no duplicate exists for the same (date, country_code, region)
   * before inserting, to provide an actionable error message rather than a
   * generic constraint violation.
   */
  async create(
    context: TenantContext,
    data: CreateBankHoliday,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BankHolidayResponse>> {
    // Check for duplicate
    const countryCode = data.country_code || "GB";
    const region = data.region ?? null;

    const duplicate = await this.repository.findDuplicate(
      context,
      data.date,
      countryCode,
      region
    );

    if (duplicate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: `A bank holiday already exists for ${data.date} in ${countryCode}${region ? "/" + region : ""}`,
          details: {
            date: data.date,
            country_code: countryCode,
            region,
            existing_id: duplicate.id,
          },
        },
      };
    }

    // Create in transaction with outbox event
    const result = await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.create(tx, context, data);

      await this.emitEvent(tx, context, row.id, "bank_holidays.created", {
        bankHoliday: this.mapToResponse(row),
      });

      return row;
    });

    return {
      success: true,
      data: this.mapToResponse(result),
    };
  }

  // ===========================================================================
  // Update
  // ===========================================================================

  /**
   * Update an existing bank holiday.
   *
   * Validates existence and checks for duplicate conflicts if the date,
   * country_code, or region are being changed.
   */
  async update(
    context: TenantContext,
    id: string,
    data: UpdateBankHoliday,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BankHolidayResponse>> {
    // Check exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Bank holiday not found",
          details: { id },
        },
      };
    }

    // If date, country_code, or region are changing, check for conflicts
    const newDate = data.date ?? (existing.date instanceof Date
      ? existing.date.toISOString().split("T")[0]!
      : String(existing.date));
    const newCountryCode = data.country_code ?? existing.countryCode;
    const newRegion = data.region !== undefined ? data.region : existing.region;

    const dateChanged = newDate !== (existing.date instanceof Date
      ? existing.date.toISOString().split("T")[0]!
      : String(existing.date));
    const countryChanged = newCountryCode !== existing.countryCode;
    const regionChanged = newRegion !== existing.region;

    if (dateChanged || countryChanged || regionChanged) {
      const duplicate = await this.repository.findDuplicate(
        context,
        newDate,
        newCountryCode,
        newRegion,
        id // exclude current record
      );

      if (duplicate) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: `A bank holiday already exists for ${newDate} in ${newCountryCode}${newRegion ? "/" + newRegion : ""}`,
            details: {
              date: newDate,
              country_code: newCountryCode,
              region: newRegion,
              existing_id: duplicate.id,
            },
          },
        };
      }
    }

    // Update in transaction with outbox event
    const result = await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.update(tx, context, id, data);

      if (!row) {
        throw new Error("Failed to update bank holiday");
      }

      await this.emitEvent(tx, context, id, "bank_holidays.updated", {
        bankHoliday: this.mapToResponse(row),
        changes: data,
      });

      return row;
    });

    return {
      success: true,
      data: this.mapToResponse(result),
    };
  }

  // ===========================================================================
  // Delete
  // ===========================================================================

  /**
   * Delete a bank holiday (hard delete).
   *
   * Bank holidays are tenant configuration data, not employee records,
   * so hard delete is appropriate.
   */
  async delete(
    context: TenantContext,
    id: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Check exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Bank holiday not found",
          details: { id },
        },
      };
    }

    // Delete in transaction with outbox event
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.delete(tx, context, id);

      await this.emitEvent(tx, context, id, "bank_holidays.deleted", {
        bankHoliday: this.mapToResponse(existing),
      });
    });

    return { success: true };
  }

  // ===========================================================================
  // Bulk Import
  // ===========================================================================

  /**
   * Bulk import bank holidays.
   *
   * Uses ON CONFLICT DO NOTHING at the database level so duplicates
   * (same tenant + date + country_code + region) are silently skipped.
   * Returns the count of imported vs skipped items.
   */
  async bulkImport(
    context: TenantContext,
    data: BulkImportBankHolidays,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BulkImportResponse>> {
    const totalRequested = data.holidays.length;

    const inserted = await this.db.withTransaction(context, async (tx) => {
      const rows = await this.repository.bulkCreate(tx, context, data.holidays);

      // Emit a single aggregate event for the bulk import
      if (rows.length > 0) {
        await this.emitEvent(
          tx,
          context,
          // Use first inserted row ID as aggregate ID
          rows[0]!.id,
          "bank_holidays.bulk_imported",
          {
            imported: rows.length,
            skipped: totalRequested - rows.length,
            dates: rows.map((r) =>
              r.date instanceof Date
                ? r.date.toISOString().split("T")[0]
                : String(r.date)
            ),
          }
        );
      }

      return rows;
    });

    return {
      success: true,
      data: {
        imported: inserted.length,
        skipped: totalRequested - inserted.length,
        items: inserted.map((row) => this.mapToResponse(row)),
      },
    };
  }
}
