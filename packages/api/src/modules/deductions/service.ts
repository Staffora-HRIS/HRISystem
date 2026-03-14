/**
 * Deductions Module - Service Layer
 *
 * Business logic for deduction types and employee deduction management.
 *
 * Key rules:
 * - Deduction type codes are unique per tenant
 * - Employee deductions are effective-dated per deduction type (no overlaps)
 * - At least one of amount or percentage must be provided
 * - effective_to >= effective_from (if provided)
 * - All writes emit domain events in the same transaction
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  DeductionRepository,
  DeductionTypeRow,
  EmployeeDeductionRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateDeductionType,
  UpdateDeductionType,
  DeductionTypeResponse,
  CreateEmployeeDeduction,
  UpdateEmployeeDeduction,
  EmployeeDeductionResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "payroll.deduction_type.created"
  | "payroll.deduction_type.updated"
  | "payroll.employee_deduction.created"
  | "payroll.employee_deduction.updated";

// =============================================================================
// Service
// =============================================================================

export class DeductionService {
  constructor(
    private repository: DeductionRepository,
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
  // Mappers
  // ===========================================================================

  private mapDeductionTypeToResponse(row: DeductionTypeRow): DeductionTypeResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      name: row.name,
      code: row.code,
      category: row.category,
      is_statutory: row.isStatutory,
      calculation_method: row.calculationMethod,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  private mapEmployeeDeductionToResponse(
    row: EmployeeDeductionRow
  ): EmployeeDeductionResponse {
    const response: EmployeeDeductionResponse = {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      deduction_type_id: row.deductionTypeId,
      amount: row.amount != null ? Number(row.amount) : null,
      percentage: row.percentage != null ? Number(row.percentage) : null,
      effective_from: row.effectiveFrom instanceof Date
        ? row.effectiveFrom.toISOString().split("T")[0]
        : String(row.effectiveFrom),
      effective_to: row.effectiveTo
        ? row.effectiveTo instanceof Date
          ? row.effectiveTo.toISOString().split("T")[0]
          : String(row.effectiveTo)
        : null,
      reference: row.reference,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };

    if (row.deductionTypeName) {
      response.deduction_type_name = row.deductionTypeName;
    }
    if (row.deductionTypeCode) {
      response.deduction_type_code = row.deductionTypeCode;
    }
    if (row.deductionCategory) {
      response.deduction_category = row.deductionCategory;
    }

    return response;
  }

  // ===========================================================================
  // Deduction Types
  // ===========================================================================

  async createDeductionType(
    context: TenantContext,
    data: CreateDeductionType,
    _idempotencyKey?: string
  ): Promise<ServiceResult<DeductionTypeResponse>> {
    // Check for duplicate code
    const codeExists = await this.repository.deductionTypeCodeExists(
      context,
      data.code
    );
    if (codeExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: `A deduction type with code "${data.code}" already exists`,
          details: { code: data.code },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.createDeductionType(context, data, tx);

      await this.emitEvent(
        tx,
        context,
        "deduction_type",
        row.id,
        "payroll.deduction_type.created",
        { deduction_type: this.mapDeductionTypeToResponse(row) }
      );

      return {
        success: true,
        data: this.mapDeductionTypeToResponse(row),
      };
    });
  }

  async getDeductionTypeById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<DeductionTypeResponse>> {
    const row = await this.repository.findDeductionTypeById(context, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Deduction type ${id} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapDeductionTypeToResponse(row),
    };
  }

  async listDeductionTypes(
    context: TenantContext,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<DeductionTypeResponse>> {
    const result = await this.repository.findAllDeductionTypes(context, pagination);
    return {
      items: result.items.map((row) => this.mapDeductionTypeToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async updateDeductionType(
    context: TenantContext,
    id: string,
    data: UpdateDeductionType,
    _idempotencyKey?: string
  ): Promise<ServiceResult<DeductionTypeResponse>> {
    const existing = await this.repository.findDeductionTypeById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Deduction type ${id} not found`,
        },
      };
    }

    // Check code uniqueness if being changed
    if (data.code && data.code !== existing.code) {
      const codeExists = await this.repository.deductionTypeCodeExists(
        context,
        data.code,
        id
      );
      if (codeExists) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: `A deduction type with code "${data.code}" already exists`,
            details: { code: data.code },
          },
        };
      }
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.updateDeductionType(context, id, data, tx);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Deduction type ${id} not found`,
          },
        };
      }

      await this.emitEvent(
        tx,
        context,
        "deduction_type",
        row.id,
        "payroll.deduction_type.updated",
        {
          deduction_type: this.mapDeductionTypeToResponse(row),
          previous: this.mapDeductionTypeToResponse(existing),
        }
      );

      return {
        success: true,
        data: this.mapDeductionTypeToResponse(row),
      };
    });
  }

  // ===========================================================================
  // Employee Deductions
  // ===========================================================================

  async createEmployeeDeduction(
    context: TenantContext,
    data: CreateEmployeeDeduction,
    _idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeDeductionResponse>> {
    // Validate at least one of amount or percentage
    if (data.amount == null && data.percentage == null) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "At least one of amount or percentage must be provided",
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

    // Verify deduction type exists
    const deductionType = await this.repository.findDeductionTypeById(
      context,
      data.deduction_type_id
    );
    if (!deductionType) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Deduction type ${data.deduction_type_id} not found`,
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      // Check for overlapping deductions of the same type
      const hasOverlap = await this.repository.hasOverlappingDeduction(
        context,
        data.employee_id,
        data.deduction_type_id,
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
              "Employee already has a deduction of this type that overlaps with the given date range",
            details: {
              employee_id: data.employee_id,
              deduction_type_id: data.deduction_type_id,
              effective_from: data.effective_from,
              effective_to: data.effective_to,
            },
          },
        };
      }

      const row = await this.repository.createEmployeeDeduction(context, data, tx);

      await this.emitEvent(
        tx,
        context,
        "employee_deduction",
        row.id,
        "payroll.employee_deduction.created",
        {
          deduction: this.mapEmployeeDeductionToResponse(row),
          employee_id: data.employee_id,
          deduction_type_id: data.deduction_type_id,
        }
      );

      return {
        success: true,
        data: this.mapEmployeeDeductionToResponse(row),
      };
    });
  }

  async getEmployeeDeductionById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<EmployeeDeductionResponse>> {
    const row = await this.repository.findEmployeeDeductionById(context, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Employee deduction ${id} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapEmployeeDeductionToResponse(row),
    };
  }

  async getEmployeeDeductionsByEmployee(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<EmployeeDeductionResponse[]>> {
    const rows = await this.repository.findEmployeeDeductionsByEmployee(
      context,
      employeeId
    );

    return {
      success: true,
      data: rows.map((row) => this.mapEmployeeDeductionToResponse(row)),
    };
  }

  async updateEmployeeDeduction(
    context: TenantContext,
    id: string,
    data: UpdateEmployeeDeduction,
    _idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeDeductionResponse>> {
    const existing = await this.repository.findEmployeeDeductionById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Employee deduction ${id} not found`,
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
      const row = await this.repository.updateEmployeeDeduction(context, id, data, tx);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Employee deduction ${id} not found`,
          },
        };
      }

      await this.emitEvent(
        tx,
        context,
        "employee_deduction",
        row.id,
        "payroll.employee_deduction.updated",
        {
          deduction: this.mapEmployeeDeductionToResponse(row),
          previous: this.mapEmployeeDeductionToResponse(existing),
        }
      );

      return {
        success: true,
        data: this.mapEmployeeDeductionToResponse(row),
      };
    });
  }
}
