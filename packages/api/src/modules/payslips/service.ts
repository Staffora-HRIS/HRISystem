/**
 * Payslips Module - Service Layer
 *
 * Business logic for payslip templates and payslip generation.
 *
 * Key rules:
 * - Template names are unique per tenant
 * - One payslip per employee per pay period
 * - Status transitions: draft -> approved -> issued
 * - All writes emit domain events in the same transaction
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  PayslipRepository,
  PayslipTemplateRow,
  PayslipRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import {
  PAYSLIP_STATUS_TRANSITIONS,
  type CreatePayslipTemplate,
  type UpdatePayslipTemplate,
  type PayslipTemplateResponse,
  type CreatePayslip,
  type UpdatePayslipStatus,
  type PayslipResponse,
  type PayslipFilters,
  type PaginationQuery,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "payroll.payslip_template.created"
  | "payroll.payslip_template.updated"
  | "payroll.payslip.created"
  | "payroll.payslip.status_changed";

// =============================================================================
// Service
// =============================================================================

export class PayslipService {
  constructor(
    private repository: PayslipRepository,
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

  private mapTemplateToResponse(row: PayslipTemplateRow): PayslipTemplateResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      name: row.name,
      layout_config: row.layoutConfig ?? {},
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  private mapPayslipToResponse(row: PayslipRow): PayslipResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      pay_period_id: row.payPeriodId,
      gross_pay: Number(row.grossPay),
      net_pay: Number(row.netPay),
      tax_deducted: Number(row.taxDeducted),
      ni_employee: Number(row.niEmployee),
      ni_employer: Number(row.niEmployer),
      pension_employee: Number(row.pensionEmployee),
      pension_employer: Number(row.pensionEmployer),
      other_deductions: Array.isArray(row.otherDeductions)
        ? (row.otherDeductions as Record<string, unknown>[])
        : [],
      other_additions: Array.isArray(row.otherAdditions)
        ? (row.otherAdditions as Record<string, unknown>[])
        : [],
      payment_date: row.paymentDate instanceof Date
        ? row.paymentDate.toISOString().split("T")[0]
        : String(row.paymentDate),
      status: row.status,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  // ===========================================================================
  // Payslip Templates
  // ===========================================================================

  async createTemplate(
    context: TenantContext,
    data: CreatePayslipTemplate,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PayslipTemplateResponse>> {
    const nameExists = await this.repository.templateNameExists(
      context,
      data.name
    );
    if (nameExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: `A payslip template named "${data.name}" already exists`,
          details: { name: data.name },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.createTemplate(context, data, tx);

      await this.emitEvent(
        tx,
        context,
        "payslip_template",
        row.id,
        "payroll.payslip_template.created",
        { template: this.mapTemplateToResponse(row) }
      );

      return {
        success: true,
        data: this.mapTemplateToResponse(row),
      };
    });
  }

  async getTemplateById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<PayslipTemplateResponse>> {
    const row = await this.repository.findTemplateById(context, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Payslip template ${id} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapTemplateToResponse(row),
    };
  }

  async listTemplates(
    context: TenantContext,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<PayslipTemplateResponse>> {
    const result = await this.repository.findAllTemplates(context, pagination);
    return {
      items: result.items.map((row) => this.mapTemplateToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async updateTemplate(
    context: TenantContext,
    id: string,
    data: UpdatePayslipTemplate,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PayslipTemplateResponse>> {
    const existing = await this.repository.findTemplateById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Payslip template ${id} not found`,
        },
      };
    }

    if (data.name && data.name !== existing.name) {
      const nameExists = await this.repository.templateNameExists(
        context,
        data.name,
        id
      );
      if (nameExists) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: `A payslip template named "${data.name}" already exists`,
            details: { name: data.name },
          },
        };
      }
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.updateTemplate(context, id, data, tx);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Payslip template ${id} not found`,
          },
        };
      }

      await this.emitEvent(
        tx,
        context,
        "payslip_template",
        row.id,
        "payroll.payslip_template.updated",
        {
          template: this.mapTemplateToResponse(row),
          previous: this.mapTemplateToResponse(existing),
        }
      );

      return {
        success: true,
        data: this.mapTemplateToResponse(row),
      };
    });
  }

  // ===========================================================================
  // Payslips
  // ===========================================================================

  async createPayslip(
    context: TenantContext,
    data: CreatePayslip,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PayslipResponse>> {
    return await this.db.withTransaction(context, async (tx) => {
      // Check for duplicate payslip per employee+period
      if (data.pay_period_id) {
        const exists = await this.repository.payslipExistsForPeriod(
          context,
          data.employee_id,
          data.pay_period_id,
          tx
        );
        if (exists) {
          return {
            success: false,
            error: {
              code: ErrorCodes.CONFLICT,
              message: "A payslip already exists for this employee and pay period",
              details: {
                employee_id: data.employee_id,
                pay_period_id: data.pay_period_id,
              },
            },
          };
        }
      }

      const row = await this.repository.createPayslip(context, data, tx);

      await this.emitEvent(
        tx,
        context,
        "payslip",
        row.id,
        "payroll.payslip.created",
        {
          payslip: this.mapPayslipToResponse(row),
          employee_id: data.employee_id,
        }
      );

      return {
        success: true,
        data: this.mapPayslipToResponse(row),
      };
    });
  }

  async getPayslipById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<PayslipResponse>> {
    const row = await this.repository.findPayslipById(context, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Payslip ${id} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapPayslipToResponse(row),
    };
  }

  async getPayslipsByEmployee(
    context: TenantContext,
    employeeId: string,
    filters: PayslipFilters = {}
  ): Promise<PaginatedServiceResult<PayslipResponse>> {
    const result = await this.repository.findPayslipsByEmployee(
      context,
      employeeId,
      filters
    );
    return {
      items: result.items.map((row) => this.mapPayslipToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async updatePayslipStatus(
    context: TenantContext,
    id: string,
    data: UpdatePayslipStatus,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PayslipResponse>> {
    const existing = await this.repository.findPayslipById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Payslip ${id} not found`,
        },
      };
    }

    // Validate status transition
    const allowed = PAYSLIP_STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(data.status)) {
      return {
        success: false,
        error: {
          code: "INVALID_TRANSITION",
          message: `Cannot transition payslip from "${existing.status}" to "${data.status}"`,
          details: {
            current_status: existing.status,
            requested_status: data.status,
            allowed_transitions: allowed,
          },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.updatePayslipStatus(
        context,
        id,
        data.status,
        tx
      );

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Payslip ${id} not found`,
          },
        };
      }

      await this.emitEvent(
        tx,
        context,
        "payslip",
        row.id,
        "payroll.payslip.status_changed",
        {
          payslip: this.mapPayslipToResponse(row),
          previous_status: existing.status,
          new_status: data.status,
        }
      );

      return {
        success: true,
        data: this.mapPayslipToResponse(row),
      };
    });
  }
}
