/**
 * Tax Codes Module - Service Layer
 *
 * Implements business logic for employee tax code management.
 * Enforces invariants:
 * - is_cumulative and week1_month1 are mutually exclusive
 * - Effective date ranges do not overlap per employee
 * - effective_to >= effective_from (if provided)
 * - Tax code format matches UK HMRC patterns
 * - All writes emit domain events in the same transaction
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  TaxCodeRepository,
  TaxCodeRow,
} from "./repository";
import type {
  ServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateTaxCode,
  UpdateTaxCode,
  TaxCodeResponse,
} from "./schemas";
import { UK_TAX_CODE_REGEX } from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "payroll.tax_code.created"
  | "payroll.tax_code.updated";

// =============================================================================
// Tax Code Format Validation
// =============================================================================

/**
 * Compiled regex for UK HMRC tax code format validation.
 * Used for service-level validation (in addition to TypeBox schema validation).
 */
const TAX_CODE_FORMAT_RE = new RegExp(UK_TAX_CODE_REGEX);

/**
 * Validate that a tax code string matches UK HMRC format.
 * Returns null if valid, or an error message if invalid.
 */
function validateTaxCodeFormat(taxCode: string): string | null {
  if (!TAX_CODE_FORMAT_RE.test(taxCode)) {
    return `Invalid UK tax code format: "${taxCode}". Expected patterns: 1257L, BR, D0, D1, NT, S1257L, C1257L, K100, 0T`;
  }
  return null;
}

// =============================================================================
// Service
// =============================================================================

export class TaxCodeService {
  constructor(
    private repository: TaxCodeRepository,
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
  // Mapper
  // ===========================================================================

  private mapToResponse(row: TaxCodeRow): TaxCodeResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      tax_code: row.taxCode,
      is_cumulative: row.isCumulative,
      week1_month1: row.week1Month1,
      effective_from: row.effectiveFrom instanceof Date
        ? row.effectiveFrom.toISOString().split("T")[0]
        : String(row.effectiveFrom),
      effective_to: row.effectiveTo
        ? row.effectiveTo instanceof Date
          ? row.effectiveTo.toISOString().split("T")[0]
          : String(row.effectiveTo)
        : null,
      source: row.source,
      notes: row.notes ?? null,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  // ===========================================================================
  // Validation
  // ===========================================================================

  private validateCumulativeConsistency(
    isCumulative: boolean | undefined,
    week1Month1: boolean | undefined
  ): string | null {
    if (isCumulative === true && week1Month1 === true) {
      return "is_cumulative and week1_month1 cannot both be true";
    }
    return null;
  }

  // ===========================================================================
  // Create
  // ===========================================================================

  async createTaxCode(
    context: TenantContext,
    data: CreateTaxCode,
    _idempotencyKey?: string
  ): Promise<ServiceResult<TaxCodeResponse>> {
    // Validate tax code format
    const formatError = validateTaxCodeFormat(data.tax_code);
    if (formatError) {
      return {
        success: false,
        error: {
          code: "INVALID_TAX_CODE_FORMAT",
          message: formatError,
          details: { tax_code: data.tax_code },
        },
      };
    }

    // Validate cumulative consistency
    const validationError = this.validateCumulativeConsistency(
      data.is_cumulative,
      data.week1_month1
    );
    if (validationError) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: validationError,
        },
      };
    }

    // Validate effective_to >= effective_from
    if (data.effective_to && data.effective_to < data.effective_from) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "effective_to must be on or after effective_from",
          details: {
            effective_from: data.effective_from,
            effective_to: data.effective_to,
          },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      // Check for overlapping tax codes
      const hasOverlap = await this.repository.hasOverlappingTaxCode(
        context,
        data.employee_id,
        data.effective_from,
        data.effective_to,
        tx
      );

      if (hasOverlap) {
        return {
          success: false,
          error: {
            code: "EFFECTIVE_DATE_OVERLAP",
            message:
              "Employee already has a tax code record that overlaps with the given date range",
            details: {
              employee_id: data.employee_id,
              effective_from: data.effective_from,
              effective_to: data.effective_to,
            },
          },
        };
      }

      const row = await this.repository.createTaxCode(context, data, tx);

      await this.emitEvent(
        tx,
        context,
        "employee_tax_code",
        row.id,
        "payroll.tax_code.created",
        {
          tax_code: this.mapToResponse(row),
          employee_id: data.employee_id,
        }
      );

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ===========================================================================
  // Read
  // ===========================================================================

  async getTaxCodesByEmployee(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<TaxCodeResponse[]>> {
    const rows = await this.repository.findByEmployee(context, employeeId);
    return {
      success: true,
      data: rows.map((row) => this.mapToResponse(row)),
    };
  }

  async getTaxCodeById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<TaxCodeResponse>> {
    const row = await this.repository.findById(context, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Tax code record ${id} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  /**
   * Get the current (effective today) tax code for an employee.
   * This is used by payroll processing to determine the employee's
   * tax code at the time of calculation.
   *
   * @param asOfDate - Optional date to check against (defaults to today).
   *                   Useful for payroll runs that calculate for a specific pay period.
   */
  async getCurrentTaxCode(
    context: TenantContext,
    employeeId: string,
    asOfDate?: string
  ): Promise<ServiceResult<TaxCodeResponse>> {
    const row = await this.repository.findCurrentByEmployee(
      context,
      employeeId,
      asOfDate
    );

    if (!row) {
      return {
        success: false,
        error: {
          code: "NO_CURRENT_TAX_CODE",
          message: `No current tax code found for employee ${employeeId}${asOfDate ? ` as of ${asOfDate}` : ""}`,
          details: { employee_id: employeeId, as_of_date: asOfDate ?? null },
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  // ===========================================================================
  // Update
  // ===========================================================================

  async updateTaxCode(
    context: TenantContext,
    id: string,
    data: UpdateTaxCode,
    _idempotencyKey?: string
  ): Promise<ServiceResult<TaxCodeResponse>> {
    // Validate tax code format if provided
    if (data.tax_code) {
      const formatError = validateTaxCodeFormat(data.tax_code);
      if (formatError) {
        return {
          success: false,
          error: {
            code: "INVALID_TAX_CODE_FORMAT",
            message: formatError,
            details: { tax_code: data.tax_code },
          },
        };
      }
    }

    // Fetch existing record
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Tax code record ${id} not found`,
        },
      };
    }

    // Validate cumulative consistency with merged values
    const effectiveCumulative = data.is_cumulative !== undefined
      ? data.is_cumulative
      : existing.isCumulative;
    const effectiveWeek1Month1 = data.week1_month1 !== undefined
      ? data.week1_month1
      : existing.week1Month1;

    const validationError = this.validateCumulativeConsistency(
      effectiveCumulative,
      effectiveWeek1Month1
    );
    if (validationError) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: validationError,
        },
      };
    }

    // Validate effective dates
    const effectiveFrom = data.effective_from ?? (
      existing.effectiveFrom instanceof Date
        ? existing.effectiveFrom.toISOString().split("T")[0]
        : String(existing.effectiveFrom)
    );
    const effectiveTo = data.effective_to !== undefined
      ? data.effective_to
      : existing.effectiveTo
        ? existing.effectiveTo instanceof Date
          ? existing.effectiveTo.toISOString().split("T")[0]
          : String(existing.effectiveTo)
        : null;

    if (effectiveTo && effectiveTo < effectiveFrom) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "effective_to must be on or after effective_from",
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      // Check for overlapping tax codes when dates change, excluding the current record
      if (data.effective_from !== undefined || data.effective_to !== undefined) {
        const hasOverlap = await this.repository.hasOverlappingTaxCode(
          context,
          existing.employeeId,
          effectiveFrom,
          effectiveTo,
          tx,
          id
        );

        if (hasOverlap) {
          return {
            success: false,
            error: {
              code: "EFFECTIVE_DATE_OVERLAP",
              message:
                "Updated date range overlaps with another tax code record for this employee",
              details: {
                employee_id: existing.employeeId,
                effective_from: effectiveFrom,
                effective_to: effectiveTo,
              },
            },
          };
        }
      }

      const row = await this.repository.updateTaxCode(context, id, data, tx);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Tax code record ${id} not found`,
          },
        };
      }

      await this.emitEvent(
        tx,
        context,
        "employee_tax_code",
        row.id,
        "payroll.tax_code.updated",
        {
          tax_code: this.mapToResponse(row),
          previous: this.mapToResponse(existing),
        }
      );

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }
}
