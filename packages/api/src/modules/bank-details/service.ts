/**
 * Bank Details Module - Service Layer
 *
 * Implements business logic for employee bank detail operations.
 * Enforces invariants:
 * - Employee must exist before adding bank details
 * - Single primary bank account per employee (at any effective date)
 * - No overlapping effective date ranges for the same employee
 * - Sort code and account number format validation
 *
 * Emits domain events via the outbox pattern.
 *
 * Sensitive data: bank details should only be accessible to
 * HR admin and payroll roles (enforced at route level via RBAC).
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  BankDetailRepository,
  BankDetailRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateBankDetail,
  UpdateBankDetail,
  BankDetailResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "hr.bank_detail.created"
  | "hr.bank_detail.updated"
  | "hr.bank_detail.deleted";

// =============================================================================
// Bank Detail Service
// =============================================================================

export class BankDetailService {
  constructor(
    private repository: BankDetailRepository,
    private db: DatabaseClient
  ) {}

  // ---------------------------------------------------------------------------
  // Domain Event Emission
  // ---------------------------------------------------------------------------

  /**
   * Emit domain event to outbox (same transaction as business write)
   */
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

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Map database row to API response shape.
   *
   * Dates are formatted as ISO date strings (YYYY-MM-DD) rather than
   * full ISO 8601 timestamps because effective_from/effective_to are
   * DATE columns, not TIMESTAMPTZ.
   */
  private mapToResponse(row: BankDetailRow): BankDetailResponse {
    return {
      id: row.id,
      employeeId: row.employeeId,
      accountName: row.accountName,
      sortCode: row.sortCode,
      accountNumber: row.accountNumber,
      bankName: row.bankName,
      buildingSocietyReference: row.buildingSocietyReference,
      isPrimary: row.isPrimary,
      effectiveFrom: row.effectiveFrom instanceof Date
        ? row.effectiveFrom.toISOString().split("T")[0]!
        : String(row.effectiveFrom),
      effectiveTo: row.effectiveTo instanceof Date
        ? row.effectiveTo.toISOString().split("T")[0]!
        : row.effectiveTo ? String(row.effectiveTo) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Verify that the employee exists.
   * Returns success=false if not found.
   */
  private async verifyEmployeeExists(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<void>> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<{ id: string }[]>`
        SELECT id FROM employees WHERE id = ${employeeId}::uuid
      `;
    });

    if (rows.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Employee with ID '${employeeId}' not found`,
          details: { employeeId },
        },
      };
    }

    return { success: true };
  }

  /**
   * Validate effective date range: effective_from must be before effective_to
   * when both are provided.
   */
  private validateEffectiveDates(
    effectiveFrom?: string,
    effectiveTo?: string | null
  ): ServiceResult<void> {
    if (effectiveFrom && effectiveTo) {
      if (effectiveFrom >= effectiveTo) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "effective_from must be before effective_to",
            details: { effectiveFrom, effectiveTo },
          },
        };
      }
    }

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------

  /**
   * List bank details for an employee
   */
  async listByEmployee(
    context: TenantContext,
    employeeId: string,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<BankDetailResponse>> {
    // Verify employee exists
    const check = await this.verifyEmployeeExists(context, employeeId);
    if (!check.success) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const result = await this.repository.listByEmployee(
      context,
      employeeId,
      pagination
    );

    return {
      items: result.items.map((row) => this.mapToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ---------------------------------------------------------------------------
  // Get
  // ---------------------------------------------------------------------------

  /**
   * Get a single bank detail by ID, scoped to the employee
   */
  async getById(
    context: TenantContext,
    employeeId: string,
    id: string
  ): Promise<ServiceResult<BankDetailResponse>> {
    const row = await this.repository.findByIdAndEmployee(context, id, employeeId);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Bank detail with ID '${id}' not found`,
          details: { id, employeeId },
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  /**
   * Create a bank detail record for an employee.
   *
   * Business rules:
   * - Employee must exist.
   * - effective_from must be before effective_to (when both provided).
   * - No overlapping effective date ranges for the same employee.
   * - If is_primary=true, unset primary flag on all other bank details
   *   for the same employee.
   * - If this is the first bank detail for the employee, default is_primary
   *   to true.
   */
  async create(
    context: TenantContext,
    employeeId: string,
    data: CreateBankDetail,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BankDetailResponse>> {
    // Verify employee exists
    const employeeCheck = await this.verifyEmployeeExists(context, employeeId);
    if (!employeeCheck.success) {
      return {
        success: false,
        error: employeeCheck.error,
      };
    }

    // Validate effective date range
    const dateCheck = this.validateEffectiveDates(data.effective_from, data.effective_to);
    if (!dateCheck.success) {
      return {
        success: false,
        error: dateCheck.error,
      };
    }

    // Check for effective date overlap
    const effectiveFrom = data.effective_from ?? new Date().toISOString().split("T")[0]!;
    const hasOverlap = await this.repository.checkEffectiveDateOverlap(
      context,
      employeeId,
      effectiveFrom,
      data.effective_to ?? null
    );

    if (hasOverlap) {
      return {
        success: false,
        error: {
          code: ErrorCodes.EFFECTIVE_DATE_OVERLAP,
          message: "Bank detail effective dates overlap with an existing record for this employee",
          details: { employeeId, effectiveFrom, effectiveTo: data.effective_to ?? null },
        },
      };
    }

    // Create inside a transaction so outbox + primary-flag management are atomic
    const bankDetail = await this.db.withTransaction(context, async (tx) => {
      // If the new record is marked as primary, unset existing primary records
      if (data.is_primary === true) {
        await this.repository.unsetPrimaryForEmployee(tx, context, employeeId);
      }

      // If this is the first bank detail and is_primary is not explicitly set, make it primary
      const existingCount = await this.repository.countByEmployee(context, employeeId);
      const effectiveData = { ...data };
      if (existingCount === 0 && effectiveData.is_primary === undefined) {
        effectiveData.is_primary = true;
      }

      // Create the bank detail
      const row = await this.repository.create(tx, context, employeeId, effectiveData);

      // Emit domain event in the same transaction
      await this.emitEvent(
        tx,
        context,
        "bank_detail",
        row.id,
        "hr.bank_detail.created",
        { bankDetail: this.mapToResponse(row), employeeId }
      );

      return row;
    });

    return {
      success: true,
      data: this.mapToResponse(bankDetail),
    };
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  /**
   * Update a bank detail record.
   *
   * Business rules:
   * - Record must exist and belong to the specified employee.
   * - If effective dates are being changed, validate no overlap.
   * - If is_primary is being set to true, unset all other primaries
   *   for that employee.
   */
  async update(
    context: TenantContext,
    employeeId: string,
    id: string,
    data: UpdateBankDetail,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BankDetailResponse>> {
    // Verify record exists and belongs to employee
    const existing = await this.repository.findByIdAndEmployee(context, id, employeeId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Bank detail with ID '${id}' not found`,
          details: { id, employeeId },
        },
      };
    }

    // If effective dates are being changed, validate them
    const newEffectiveFrom = data.effective_from
      ?? (existing.effectiveFrom instanceof Date
        ? existing.effectiveFrom.toISOString().split("T")[0]!
        : String(existing.effectiveFrom));
    const newEffectiveTo = data.effective_to !== undefined
      ? data.effective_to
      : (existing.effectiveTo instanceof Date
        ? existing.effectiveTo.toISOString().split("T")[0]!
        : existing.effectiveTo ? String(existing.effectiveTo) : null);

    // Validate effective date range
    const dateCheck = this.validateEffectiveDates(newEffectiveFrom, newEffectiveTo);
    if (!dateCheck.success) {
      return {
        success: false,
        error: dateCheck.error,
      };
    }

    // Check for effective date overlap (exclude current record)
    if (data.effective_from !== undefined || data.effective_to !== undefined) {
      const hasOverlap = await this.repository.checkEffectiveDateOverlap(
        context,
        employeeId,
        newEffectiveFrom,
        newEffectiveTo,
        id
      );

      if (hasOverlap) {
        return {
          success: false,
          error: {
            code: ErrorCodes.EFFECTIVE_DATE_OVERLAP,
            message: "Bank detail effective dates overlap with an existing record for this employee",
            details: { employeeId, effectiveFrom: newEffectiveFrom, effectiveTo: newEffectiveTo },
          },
        };
      }
    }

    const updated = await this.db.withTransaction(context, async (tx) => {
      // If setting this record as primary, unset others first
      if (data.is_primary === true && !existing.isPrimary) {
        await this.repository.unsetPrimaryForEmployee(
          tx,
          context,
          employeeId,
          id
        );
      }

      // Update the record
      const row = await this.repository.update(tx, context, id, data);

      if (!row) {
        throw new Error(`Bank detail '${id}' disappeared during update`);
      }

      // Emit domain event in the same transaction
      await this.emitEvent(
        tx,
        context,
        "bank_detail",
        row.id,
        "hr.bank_detail.updated",
        {
          bankDetail: this.mapToResponse(row),
          employeeId,
          changes: data,
        }
      );

      return row;
    });

    return {
      success: true,
      data: this.mapToResponse(updated),
    };
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  /**
   * Delete a bank detail record.
   *
   * If the deleted record was the primary and other records remain,
   * the caller should be aware that no primary is set (we do not
   * auto-promote another record to avoid surprising behaviour).
   */
  async delete(
    context: TenantContext,
    employeeId: string,
    id: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Verify record exists and belongs to employee
    const existing = await this.repository.findByIdAndEmployee(context, id, employeeId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Bank detail with ID '${id}' not found`,
          details: { id, employeeId },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      const deleted = await this.repository.delete(tx, context, id);

      if (!deleted) {
        throw new Error(`Bank detail '${id}' disappeared during delete`);
      }

      // Emit domain event in the same transaction
      await this.emitEvent(
        tx,
        context,
        "bank_detail",
        id,
        "hr.bank_detail.deleted",
        {
          bankDetail: this.mapToResponse(existing),
          employeeId,
        }
      );
    });

    return { success: true };
  }
}
