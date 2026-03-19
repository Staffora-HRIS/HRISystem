/**
 * Payslips Module - Service Layer
 *
 * Business logic for payslip templates, payslip generation from payroll
 * runs, viewing, distribution, and PDF generation triggers.
 *
 * Key rules:
 * - Template names are unique per tenant
 * - One payslip per employee per payroll run
 * - Status transitions: generated -> approved -> issued/distributed
 * - Bulk generation reads payroll lines and computes YTD totals
 * - Distribution emits domain events for notifications
 * - PDF generation is delegated to the pdf-worker via outbox events
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
  type GeneratePayslips,
  type GeneratePayslipsResponse,
  type DistributePayslips,
  type DistributePayslipsResponse,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "payroll.payslip_template.created"
  | "payroll.payslip_template.updated"
  | "payroll.payslip.created"
  | "payroll.payslip.status_changed"
  | "payroll.payslips.generated"
  | "payroll.payslips.distributed"
  | "payroll.payslip.pdf_requested";

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
        ? row.createdAt.toISOString() : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }

  private toDateStr(val: Date | string | null | undefined): string | null {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString().split("T")[0]!;
    return String(val);
  }

  private toIsoStr(val: Date | string | null | undefined): string | null {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString();
    return String(val);
  }

  private mapPayslipToResponse(row: PayslipRow): PayslipResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      payroll_run_id: row.payrollRunId ?? null,
      pay_period_id: row.payPeriodId ?? null,
      pay_period_start: this.toDateStr(row.payPeriodStart),
      pay_period_end: this.toDateStr(row.payPeriodEnd),
      employee_name: row.employeeName ?? null,
      employee_number: row.employeeNumber ?? null,
      gross_pay: Number(row.grossPay),
      net_pay: Number(row.netPay),
      tax_deducted: Number(row.taxDeducted),
      ni_employee: Number(row.niEmployee),
      ni_employer: Number(row.niEmployer),
      pension_employee: Number(row.pensionEmployee),
      pension_employer: Number(row.pensionEmployer),
      student_loan: Number(row.studentLoan ?? 0),
      deductions: Array.isArray(row.deductions)
        ? (row.deductions as Record<string, unknown>[]) : [],
      additions: Array.isArray(row.additions)
        ? (row.additions as Record<string, unknown>[]) : [],
      other_deductions: Array.isArray(row.otherDeductions)
        ? (row.otherDeductions as Record<string, unknown>[]) : [],
      other_additions: Array.isArray(row.otherAdditions)
        ? (row.otherAdditions as Record<string, unknown>[]) : [],
      tax_code: row.taxCode ?? null,
      ni_number: row.niNumber ?? null,
      ni_category: row.niCategory ?? null,
      payment_method: row.paymentMethod ?? null,
      payment_date: row.paymentDate instanceof Date
        ? row.paymentDate.toISOString().split("T")[0]! : String(row.paymentDate),
      status: row.status,
      ytd_gross_pay: Number(row.ytdGrossPay ?? 0),
      ytd_tax_deducted: Number(row.ytdTaxDeducted ?? 0),
      ytd_ni_employee: Number(row.ytdNiEmployee ?? 0),
      ytd_ni_employer: Number(row.ytdNiEmployer ?? 0),
      ytd_pension_employee: Number(row.ytdPensionEmployee ?? 0),
      ytd_pension_employer: Number(row.ytdPensionEmployer ?? 0),
      ytd_student_loan: Number(row.ytdStudentLoan ?? 0),
      ytd_net_pay: Number(row.ytdNetPay ?? 0),
      generated_at: this.toIsoStr(row.generatedAt),
      distributed_at: this.toIsoStr(row.distributedAt),
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString() : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }

  // ===========================================================================
  // Payslip Templates
  // ===========================================================================

  async createTemplate(
    context: TenantContext, data: CreatePayslipTemplate, _idempotencyKey?: string
  ): Promise<ServiceResult<PayslipTemplateResponse>> {
    const nameExists = await this.repository.templateNameExists(context, data.name);
    if (nameExists) {
      return { success: false, error: { code: ErrorCodes.CONFLICT, message: `A payslip template named "${data.name}" already exists`, details: { name: data.name } } };
    }
    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.createTemplate(context, data, tx);
      await this.emitEvent(tx, context, "payslip_template", row.id, "payroll.payslip_template.created", { template: this.mapTemplateToResponse(row) });
      return { success: true, data: this.mapTemplateToResponse(row) };
    });
  }

  async getTemplateById(context: TenantContext, id: string): Promise<ServiceResult<PayslipTemplateResponse>> {
    const row = await this.repository.findTemplateById(context, id);
    if (!row) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: `Payslip template ${id} not found` } };
    return { success: true, data: this.mapTemplateToResponse(row) };
  }

  async listTemplates(context: TenantContext, pagination: PaginationQuery = {}): Promise<PaginatedServiceResult<PayslipTemplateResponse>> {
    const result = await this.repository.findAllTemplates(context, pagination);
    return { items: result.items.map((row) => this.mapTemplateToResponse(row)), nextCursor: result.nextCursor, hasMore: result.hasMore };
  }

  async updateTemplate(context: TenantContext, id: string, data: UpdatePayslipTemplate, _idempotencyKey?: string): Promise<ServiceResult<PayslipTemplateResponse>> {
    const existing = await this.repository.findTemplateById(context, id);
    if (!existing) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: `Payslip template ${id} not found` } };
    if (data.name && data.name !== existing.name) {
      const nameExists = await this.repository.templateNameExists(context, data.name, id);
      if (nameExists) return { success: false, error: { code: ErrorCodes.CONFLICT, message: `A payslip template named "${data.name}" already exists`, details: { name: data.name } } };
    }
    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.updateTemplate(context, id, data, tx);
      if (!row) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: `Payslip template ${id} not found` } };
      await this.emitEvent(tx, context, "payslip_template", row.id, "payroll.payslip_template.updated", { template: this.mapTemplateToResponse(row), previous: this.mapTemplateToResponse(existing) });
      return { success: true, data: this.mapTemplateToResponse(row) };
    });
  }

  // ===========================================================================
  // Payslips - Single CRUD
  // ===========================================================================

  async createPayslip(context: TenantContext, data: CreatePayslip, _idempotencyKey?: string): Promise<ServiceResult<PayslipResponse>> {
    return await this.db.withTransaction(context, async (tx) => {
      if (data.pay_period_id) {
        const exists = await this.repository.payslipExistsForPeriod(context, data.employee_id, data.pay_period_id, tx);
        if (exists) return { success: false, error: { code: ErrorCodes.CONFLICT, message: "A payslip already exists for this employee and pay period", details: { employee_id: data.employee_id, pay_period_id: data.pay_period_id } } };
      }
      const row = await this.repository.createPayslip(context, data, tx);
      await this.emitEvent(tx, context, "payslip", row.id, "payroll.payslip.created", { payslip: this.mapPayslipToResponse(row), employee_id: data.employee_id });
      return { success: true, data: this.mapPayslipToResponse(row) };
    });
  }

  async getPayslipById(context: TenantContext, id: string): Promise<ServiceResult<PayslipResponse>> {
    const row = await this.repository.findPayslipById(context, id);
    if (!row) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: `Payslip ${id} not found` } };
    return { success: true, data: this.mapPayslipToResponse(row) };
  }

  async getPayslipsByEmployee(context: TenantContext, employeeId: string, filters: PayslipFilters = {}): Promise<PaginatedServiceResult<PayslipResponse>> {
    const result = await this.repository.findPayslipsByEmployee(context, employeeId, filters);
    return { items: result.items.map((row) => this.mapPayslipToResponse(row)), nextCursor: result.nextCursor, hasMore: result.hasMore };
  }

  async updatePayslipStatus(context: TenantContext, id: string, data: UpdatePayslipStatus, _idempotencyKey?: string): Promise<ServiceResult<PayslipResponse>> {
    const existing = await this.repository.findPayslipById(context, id);
    if (!existing) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: `Payslip ${id} not found` } };
    const allowed = PAYSLIP_STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(data.status)) {
      return { success: false, error: { code: "INVALID_TRANSITION", message: `Cannot transition payslip from "${existing.status}" to "${data.status}"`, details: { current_status: existing.status, requested_status: data.status, allowed_transitions: allowed } } };
    }
    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.updatePayslipStatus(context, id, data.status, tx);
      if (!row) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: `Payslip ${id} not found` } };
      await this.emitEvent(tx, context, "payslip", row.id, "payroll.payslip.status_changed", { payslip: this.mapPayslipToResponse(row), previous_status: existing.status, new_status: data.status });
      return { success: true, data: this.mapPayslipToResponse(row) };
    });
  }

  // ===========================================================================
  // Admin List
  // ===========================================================================

  async listPayslips(context: TenantContext, filters: PayslipFilters = {}): Promise<PaginatedServiceResult<PayslipResponse>> {
    const result = await this.repository.findPayslipsForAdmin(context, filters);
    return { items: result.items.map((row) => this.mapPayslipToResponse(row)), nextCursor: result.nextCursor, hasMore: result.hasMore };
  }

  // ===========================================================================
  // Bulk Generate Payslips from Payroll Run
  // ===========================================================================

  async generatePayslips(context: TenantContext, data: GeneratePayslips, _idempotencyKey?: string): Promise<ServiceResult<GeneratePayslipsResponse>> {
    return await this.db.withTransaction(context, async (tx) => {
      const run = await this.repository.getPayrollRunForGeneration(context, data.payroll_run_id, tx);
      if (!run) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: `Payroll run ${data.payroll_run_id} not found` } };

      const validStatuses = ["approved", "submitted", "paid", "review"];
      if (!validStatuses.includes(run.status)) {
        return { success: false, error: { code: "INVALID_TRANSITION", message: `Cannot generate payslips from a payroll run in "${run.status}" status. Run must be approved, submitted, or paid.`, details: { current_status: run.status, required_statuses: validStatuses } } };
      }

      const lines = await this.repository.getPayrollLinesForPayslips(context, data.payroll_run_id, tx);
      const payPeriodStart = run.payPeriodStart instanceof Date ? run.payPeriodStart.toISOString().split("T")[0]! : String(run.payPeriodStart);
      const payPeriodEnd = run.payPeriodEnd instanceof Date ? run.payPeriodEnd.toISOString().split("T")[0]! : String(run.payPeriodEnd);
      const payDate = run.payDate instanceof Date ? run.payDate.toISOString().split("T")[0]! : String(run.payDate);

      let generated = 0;
      let skipped = 0;

      for (const line of lines) {
        const exists = await this.repository.payslipExistsForRun(context, data.payroll_run_id, line.employeeId, tx);
        if (exists) { skipped++; continue; }

        const ytd = await this.repository.getYtdTotals(context, line.employeeId, payDate, tx);
        const grossPay = Number(line.totalGross);
        const taxDeducted = Number(line.taxDeduction);
        const niEmployee = Number(line.niEmployee);
        const niEmployer = Number(line.niEmployer);
        const pensionEmployee = Number(line.pensionEmployee);
        const pensionEmployer = Number(line.pensionEmployer);
        const studentLoan = Number(line.studentLoan);
        const netPay = Number(line.netPay);

        const deductions: Array<{ name: string; code: string; amount: string }> = [];
        if (taxDeducted > 0) deductions.push({ name: "PAYE Income Tax", code: "tax", amount: taxDeducted.toFixed(2) });
        if (niEmployee > 0) deductions.push({ name: "Employee National Insurance", code: "ni_employee", amount: niEmployee.toFixed(2) });
        if (pensionEmployee > 0) deductions.push({ name: "Employee Pension", code: "pension_employee", amount: pensionEmployee.toFixed(2) });
        if (studentLoan > 0) deductions.push({ name: "Student Loan Repayment", code: "student_loan", amount: studentLoan.toFixed(2) });
        if (Number(line.otherDeductions) > 0) deductions.push({ name: "Other Deductions", code: "other", amount: Number(line.otherDeductions).toFixed(2) });

        const additions: Array<{ name: string; code: string; amount: string }> = [];
        if (Number(line.basicPay) > 0) additions.push({ name: "Basic Pay", code: "basic_pay", amount: Number(line.basicPay).toFixed(2) });
        if (Number(line.overtimePay) > 0) additions.push({ name: "Overtime", code: "overtime", amount: Number(line.overtimePay).toFixed(2) });
        if (Number(line.bonusPay) > 0) additions.push({ name: "Bonus", code: "bonus", amount: Number(line.bonusPay).toFixed(2) });

        await this.repository.insertGeneratedPayslip(context, {
          employeeId: line.employeeId, payrollRunId: data.payroll_run_id,
          payPeriodStart, payPeriodEnd,
          employeeName: line.employeeName, employeeNumber: line.employeeNumber,
          grossPay, netPay, taxDeducted, niEmployee, niEmployer,
          pensionEmployee, pensionEmployer, studentLoan,
          deductions, additions,
          taxCode: line.taxCode, niNumber: line.niNumber, niCategory: line.niCategory,
          paymentMethod: line.paymentMethod ?? "bacs", paymentDate: payDate,
          ytdGrossPay: ytd.grossPay + grossPay, ytdTaxDeducted: ytd.taxDeducted + taxDeducted,
          ytdNiEmployee: ytd.niEmployee + niEmployee, ytdNiEmployer: ytd.niEmployer + niEmployer,
          ytdPensionEmployee: ytd.pensionEmployee + pensionEmployee, ytdPensionEmployer: ytd.pensionEmployer + pensionEmployer,
          ytdStudentLoan: ytd.studentLoan + studentLoan, ytdNetPay: ytd.netPay + netPay,
        }, tx);
        generated++;
      }

      await this.emitEvent(tx, context, "payroll_run", data.payroll_run_id, "payroll.payslips.generated", {
        payroll_run_id: data.payroll_run_id, payslips_generated: generated, payslips_skipped: skipped, pay_period_start: payPeriodStart, pay_period_end: payPeriodEnd,
      });

      return { success: true, data: { payroll_run_id: data.payroll_run_id, payslips_generated: generated, payslips_skipped: skipped, status: generated > 0 ? "generated" : "no_new_payslips" } };
    });
  }

  // ===========================================================================
  // Distribute Payslips
  // ===========================================================================

  async distributePayslips(context: TenantContext, data: DistributePayslips, _idempotencyKey?: string): Promise<ServiceResult<DistributePayslipsResponse>> {
    if (!data.payslip_ids && !data.payroll_run_id) {
      return { success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: "Either payslip_ids or payroll_run_id must be provided" } };
    }
    return await this.db.withTransaction(context, async (tx) => {
      let payslipIds: string[];
      if (data.payslip_ids) { payslipIds = data.payslip_ids; }
      else {
        payslipIds = await this.repository.getDistributablePayslipIds(context, data.payroll_run_id!, tx);
        if (payslipIds.length === 0) return { success: true, data: { distributed_count: 0, already_distributed: 0, status: "no_eligible_payslips" } };
      }

      const result = await this.repository.distributePayslips(context, payslipIds, tx);
      if (result.distributedCount > 0) {
        const recipients = await this.repository.getDistributedPayslipRecipients(context, payslipIds, tx);
        await this.emitEvent(tx, context, "payslip_batch", data.payroll_run_id ?? payslipIds[0], "payroll.payslips.distributed", {
          payslip_count: result.distributedCount, payroll_run_id: data.payroll_run_id,
          recipients: recipients.map((r) => ({ payslip_id: r.payslipId, employee_id: r.employeeId, employee_name: r.employeeName })),
        });
      }
      return { success: true, data: { distributed_count: result.distributedCount, already_distributed: result.alreadyDistributed, status: result.distributedCount > 0 ? "distributed" : "all_already_distributed" } };
    });
  }

  // ===========================================================================
  // PDF Generation Trigger
  // ===========================================================================

  async requestPayslipPdf(context: TenantContext, payslipId: string): Promise<ServiceResult<{ payslip_id: string; status: string }>> {
    const row = await this.repository.findPayslipById(context, payslipId);
    if (!row) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: `Payslip ${payslipId} not found` } };
    return await this.db.withTransaction(context, async (tx) => {
      await this.emitEvent(tx, context, "payslip", payslipId, "payroll.payslip.pdf_requested", { payslip: this.mapPayslipToResponse(row) });
      return { success: true, data: { payslip_id: payslipId, status: "pdf_generation_queued" } };
    });
  }

  // ===========================================================================
  // Portal: My Payslips
  // ===========================================================================

  async getMyPayslips(context: TenantContext, filters: PayslipFilters = {}): Promise<PaginatedServiceResult<PayslipResponse>> {
    const result = await this.repository.findMyPayslips(context, filters);
    return { items: result.items.map((row) => this.mapPayslipToResponse(row)), nextCursor: result.nextCursor, hasMore: result.hasMore };
  }
}
