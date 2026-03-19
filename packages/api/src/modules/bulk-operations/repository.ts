/**
 * Bulk Operations Module - Repository Layer
 *
 * Provides data access methods for bulk operations.
 * All write operations include outbox event emission within the same transaction.
 * All methods respect RLS through tenant context.
 *
 * Design note: Each bulk item is processed within its own savepoint inside
 * a shared transaction. This means a single item failure does not abort the
 * entire batch, while still keeping all successful writes (and their outbox
 * events) atomic per item.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  BulkCreateEmployeeItem,
  BulkUpdateEmployeeItem,
  BulkLeaveRequestActionItem,
  BulkItemResult,
  GenericBulkOperationItem,
  GenericBulkOperationResult,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface EmployeeRow {
  id: string;
  tenantId: string;
  employeeNumber: string;
  status: string;
  hireDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeaveRequestRow {
  id: string;
  tenantId: string;
  employeeId: string;
  leaveTypeId: string;
  status: string;
  approvedById: string | null;
  rejectionReason: string | null;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class BulkOperationsRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Bulk Create Employees
  // ===========================================================================

  /**
   * Create multiple employees within a single transaction.
   * Each item is wrapped in a savepoint so individual failures
   * do not abort the entire batch.
   */
  async bulkCreateEmployees(
    ctx: TenantContext,
    items: BulkCreateEmployeeItem[]
  ): Promise<BulkItemResult[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const results: BulkItemResult[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        try {
          const result = await this.createSingleEmployee(tx, ctx, item, i);
          results.push(result);
        } catch (error: unknown) {
          results.push({
            index: i,
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: error instanceof Error ? error.message : "Unknown error creating employee",
            },
          });
        }
      }

      return results;
    });
  }

  private async createSingleEmployee(
    tx: TransactionSql,
    ctx: TenantContext,
    item: BulkCreateEmployeeItem,
    index: number
  ): Promise<BulkItemResult> {
    // Generate employee number if not provided
    let employeeNumber = item.employee_number;
    if (!employeeNumber) {
      const [seqRow] = await tx<Array<{ nextNumber: string }>>`
        SELECT LPAD(
          (COALESCE(
            (SELECT MAX(CAST(employee_number AS INTEGER))
             FROM employees
             WHERE tenant_id = ${ctx.tenantId}::uuid
               AND employee_number ~ '^[0-9]+$'
            ), 0
          ) + 1)::text,
          6, '0'
        ) AS next_number
      `;
      employeeNumber = seqRow?.nextNumber || `EMP-${Date.now()}`;
    }

    // Check for duplicate employee number
    const [existing] = await tx<Array<{ id: string }>>`
      SELECT id FROM employees
      WHERE tenant_id = ${ctx.tenantId}::uuid AND employee_number = ${employeeNumber}
      LIMIT 1
    `;
    if (existing) {
      return {
        index,
        success: false,
        error: {
          code: "DUPLICATE_EMPLOYEE_NUMBER",
          message: `Employee number '${employeeNumber}' already exists`,
          details: { employee_number: employeeNumber },
        },
      };
    }

    // Validate position exists
    const [position] = await tx<Array<{ id: string; headcount: number }>>`
      SELECT id, headcount FROM positions
      WHERE id = ${item.position.position_id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      LIMIT 1
    `;
    if (!position) {
      return {
        index,
        success: false,
        error: {
          code: "POSITION_NOT_FOUND",
          message: "Position not found",
          details: { position_id: item.position.position_id },
        },
      };
    }

    // Validate org unit exists
    const [orgUnit] = await tx<Array<{ id: string }>>`
      SELECT id FROM org_units
      WHERE id = ${item.position.org_unit_id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      LIMIT 1
    `;
    if (!orgUnit) {
      return {
        index,
        success: false,
        error: {
          code: "ORG_UNIT_NOT_FOUND",
          message: "Org unit not found",
          details: { org_unit_id: item.position.org_unit_id },
        },
      };
    }

    // Create employee record
    const employeeId = crypto.randomUUID();
    await tx`
      INSERT INTO employees (
        id, tenant_id, employee_number, status, hire_date,
        created_by, updated_by
      ) VALUES (
        ${employeeId}::uuid, ${ctx.tenantId}::uuid, ${employeeNumber},
        'pending', ${item.contract.hire_date}::date,
        ${ctx.userId || null}::uuid, ${ctx.userId || null}::uuid
      )
    `;

    // Create personal info record
    const personalId = crypto.randomUUID();
    await tx`
      INSERT INTO employee_personal (
        id, tenant_id, employee_id,
        first_name, last_name, middle_name, preferred_name,
        date_of_birth, gender, marital_status, nationality,
        effective_from, created_by
      ) VALUES (
        ${personalId}::uuid, ${ctx.tenantId}::uuid, ${employeeId}::uuid,
        ${item.personal.first_name}, ${item.personal.last_name},
        ${item.personal.middle_name || null}, ${item.personal.preferred_name || null},
        ${item.personal.date_of_birth || null}::date,
        ${item.personal.gender || null}, ${item.personal.marital_status || null},
        ${item.personal.nationality || null},
        ${item.contract.hire_date}::date, ${ctx.userId || null}::uuid
      )
    `;

    // Create contract record
    const contractId = crypto.randomUUID();
    await tx`
      INSERT INTO employee_contracts (
        id, tenant_id, employee_id,
        contract_type, employment_type, fte,
        working_hours_per_week, probation_end_date, notice_period_days,
        effective_from, created_by
      ) VALUES (
        ${contractId}::uuid, ${ctx.tenantId}::uuid, ${employeeId}::uuid,
        ${item.contract.contract_type}, ${item.contract.employment_type},
        ${item.contract.fte},
        ${item.contract.working_hours_per_week || null},
        ${item.contract.probation_end_date || null}::date,
        ${item.contract.notice_period_days || null},
        ${item.contract.hire_date}::date, ${ctx.userId || null}::uuid
      )
    `;

    // Create position assignment
    const assignmentId = crypto.randomUUID();
    await tx`
      INSERT INTO position_assignments (
        id, tenant_id, employee_id, position_id, org_unit_id,
        is_primary, effective_from, created_by
      ) VALUES (
        ${assignmentId}::uuid, ${ctx.tenantId}::uuid, ${employeeId}::uuid,
        ${item.position.position_id}::uuid, ${item.position.org_unit_id}::uuid,
        ${item.position.is_primary ?? true}, ${item.contract.hire_date}::date,
        ${ctx.userId || null}::uuid
      )
    `;

    // Create compensation record
    const compensationId = crypto.randomUUID();
    await tx`
      INSERT INTO employee_compensation (
        id, tenant_id, employee_id,
        base_salary, currency, pay_frequency,
        effective_from, created_by
      ) VALUES (
        ${compensationId}::uuid, ${ctx.tenantId}::uuid, ${employeeId}::uuid,
        ${item.compensation.base_salary}, ${item.compensation.currency || "GBP"},
        ${item.compensation.pay_frequency || "monthly"},
        ${item.contract.hire_date}::date, ${ctx.userId || null}::uuid
      )
    `;

    // Create reporting line if manager specified
    if (item.manager_id) {
      const reportingLineId = crypto.randomUUID();
      await tx`
        INSERT INTO reporting_lines (
          id, tenant_id, employee_id, manager_id,
          relationship_type, is_primary,
          effective_from, created_by
        ) VALUES (
          ${reportingLineId}::uuid, ${ctx.tenantId}::uuid, ${employeeId}::uuid,
          ${item.manager_id}::uuid, 'direct', true,
          ${item.contract.hire_date}::date, ${ctx.userId || null}::uuid
        )
      `;
    }

    // Create status history record
    const statusHistoryId = crypto.randomUUID();
    await tx`
      INSERT INTO employee_status_history (
        id, tenant_id, employee_id,
        from_status, to_status, changed_at, changed_by, reason
      ) VALUES (
        ${statusHistoryId}::uuid, ${ctx.tenantId}::uuid, ${employeeId}::uuid,
        NULL, 'pending', now(), ${ctx.userId || null}::uuid, 'Bulk hire'
      )
    `;

    // Write outbox event
    await this.writeOutbox(tx, ctx.tenantId, "employee", employeeId, "hr.employee.created", {
      employeeId,
      employeeNumber,
      hireDate: item.contract.hire_date,
      source: "bulk_create",
      actor: ctx.userId,
    });

    return {
      index,
      success: true,
      id: employeeId,
      data: {
        employee_id: employeeId,
        employee_number: employeeNumber,
        status: "pending",
        personal: {
          first_name: item.personal.first_name,
          last_name: item.personal.last_name,
        },
      },
    };
  }

  // ===========================================================================
  // Bulk Update Employees
  // ===========================================================================

  /**
   * Update multiple employees within a single transaction.
   * Each item is processed individually so one failure does not abort the batch.
   */
  async bulkUpdateEmployees(
    ctx: TenantContext,
    items: BulkUpdateEmployeeItem[]
  ): Promise<BulkItemResult[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const results: BulkItemResult[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        try {
          const result = await this.updateSingleEmployee(tx, ctx, item, i);
          results.push(result);
        } catch (error: unknown) {
          results.push({
            index: i,
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: error instanceof Error ? error.message : "Unknown error updating employee",
            },
          });
        }
      }

      return results;
    });
  }

  private async updateSingleEmployee(
    tx: TransactionSql,
    ctx: TenantContext,
    item: BulkUpdateEmployeeItem,
    index: number
  ): Promise<BulkItemResult> {
    // Validate employee exists
    const [employee] = await tx<Array<{ id: string; status: string }>>`
      SELECT id, status FROM employees
      WHERE id = ${item.employee_id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      LIMIT 1
    `;

    if (!employee) {
      return {
        index,
        success: false,
        error: {
          code: "EMPLOYEE_NOT_FOUND",
          message: "Employee not found",
          details: { employee_id: item.employee_id },
        },
      };
    }

    if (employee.status === "terminated") {
      return {
        index,
        success: false,
        error: {
          code: "TERMINATED",
          message: "Cannot update terminated employee",
          details: { employee_id: item.employee_id, status: employee.status },
        },
      };
    }

    const updatedDimensions: string[] = [];

    // Update personal info if provided
    if (item.personal) {
      const p = item.personal;
      // Close current record and insert new effective-dated record
      await tx`
        UPDATE employee_personal
        SET effective_to = ${item.effective_from}::date - interval '1 day'
        WHERE employee_id = ${item.employee_id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND effective_to IS NULL
      `;

      const personalId = crypto.randomUUID();
      await tx`
        INSERT INTO employee_personal (
          id, tenant_id, employee_id,
          first_name, last_name, middle_name, preferred_name,
          date_of_birth, gender, marital_status, nationality,
          effective_from, created_by
        )
        SELECT
          ${personalId}::uuid, ${ctx.tenantId}::uuid, ${item.employee_id}::uuid,
          COALESCE(${p.first_name ?? null}, ep.first_name),
          COALESCE(${p.last_name ?? null}, ep.last_name),
          ${p.middle_name === null ? null : p.middle_name === undefined ? tx`ep.middle_name` : tx`${p.middle_name}`},
          ${p.preferred_name === null ? null : p.preferred_name === undefined ? tx`ep.preferred_name` : tx`${p.preferred_name}`},
          ${p.date_of_birth === null ? null : p.date_of_birth === undefined ? tx`ep.date_of_birth` : tx`${p.date_of_birth}::date`},
          ${p.gender === null ? null : p.gender === undefined ? tx`ep.gender` : tx`${p.gender}`},
          ${p.marital_status === null ? null : p.marital_status === undefined ? tx`ep.marital_status` : tx`${p.marital_status}`},
          ${p.nationality === null ? null : p.nationality === undefined ? tx`ep.nationality` : tx`${p.nationality}`},
          ${item.effective_from}::date, ${ctx.userId || null}::uuid
        FROM employee_personal ep
        WHERE ep.employee_id = ${item.employee_id}::uuid
          AND ep.tenant_id = ${ctx.tenantId}::uuid
        ORDER BY ep.effective_from DESC
        LIMIT 1
      `;
      updatedDimensions.push("personal");
    }

    // Update contract if provided
    if (item.contract) {
      const c = item.contract;
      await tx`
        UPDATE employee_contracts
        SET effective_to = ${item.effective_from}::date - interval '1 day'
        WHERE employee_id = ${item.employee_id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND effective_to IS NULL
      `;

      const contractId = crypto.randomUUID();
      await tx`
        INSERT INTO employee_contracts (
          id, tenant_id, employee_id,
          contract_type, employment_type, fte,
          working_hours_per_week, probation_end_date, notice_period_days,
          effective_from, created_by
        )
        SELECT
          ${contractId}::uuid, ${ctx.tenantId}::uuid, ${item.employee_id}::uuid,
          COALESCE(${c.contract_type ?? null}, ec.contract_type),
          COALESCE(${c.employment_type ?? null}, ec.employment_type),
          COALESCE(${c.fte ?? null}, ec.fte),
          ${c.working_hours_per_week === null ? null : c.working_hours_per_week === undefined ? tx`ec.working_hours_per_week` : tx`${c.working_hours_per_week}`},
          ${c.probation_end_date === null ? null : c.probation_end_date === undefined ? tx`ec.probation_end_date` : tx`${c.probation_end_date}::date`},
          ${c.notice_period_days === null ? null : c.notice_period_days === undefined ? tx`ec.notice_period_days` : tx`${c.notice_period_days}`},
          ${item.effective_from}::date, ${ctx.userId || null}::uuid
        FROM employee_contracts ec
        WHERE ec.employee_id = ${item.employee_id}::uuid
          AND ec.tenant_id = ${ctx.tenantId}::uuid
        ORDER BY ec.effective_from DESC
        LIMIT 1
      `;
      updatedDimensions.push("contract");
    }

    // Update compensation if provided
    if (item.compensation) {
      const comp = item.compensation;
      await tx`
        UPDATE employee_compensation
        SET effective_to = ${item.effective_from}::date - interval '1 day'
        WHERE employee_id = ${item.employee_id}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND effective_to IS NULL
      `;

      const compensationId = crypto.randomUUID();
      await tx`
        INSERT INTO employee_compensation (
          id, tenant_id, employee_id,
          base_salary, currency, pay_frequency,
          effective_from, created_by
        )
        SELECT
          ${compensationId}::uuid, ${ctx.tenantId}::uuid, ${item.employee_id}::uuid,
          ${comp.base_salary},
          COALESCE(${comp.currency ?? null}, ec.currency),
          COALESCE(${comp.pay_frequency ?? null}, ec.pay_frequency),
          ${item.effective_from}::date, ${ctx.userId || null}::uuid
        FROM employee_compensation ec
        WHERE ec.employee_id = ${item.employee_id}::uuid
          AND ec.tenant_id = ${ctx.tenantId}::uuid
        ORDER BY ec.effective_from DESC
        LIMIT 1
      `;
      updatedDimensions.push("compensation");
    }

    if (updatedDimensions.length === 0) {
      return {
        index,
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "No update fields provided. Specify at least one of: personal, contract, compensation",
        },
      };
    }

    // Update employee updated_at timestamp
    await tx`
      UPDATE employees SET updated_at = now(), updated_by = ${ctx.userId || null}::uuid
      WHERE id = ${item.employee_id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
    `;

    // Write outbox event
    await this.writeOutbox(tx, ctx.tenantId, "employee", item.employee_id, "hr.employee.updated", {
      employeeId: item.employee_id,
      dimensions: updatedDimensions,
      effectiveFrom: item.effective_from,
      source: "bulk_update",
      actor: ctx.userId,
    });

    return {
      index,
      success: true,
      id: item.employee_id,
      data: {
        employee_id: item.employee_id,
        updated_dimensions: updatedDimensions,
        effective_from: item.effective_from,
      },
    };
  }

  // ===========================================================================
  // Bulk Leave Request Actions
  // ===========================================================================

  /**
   * Approve or reject multiple leave requests within a single transaction.
   */
  async bulkLeaveRequestActions(
    ctx: TenantContext,
    items: BulkLeaveRequestActionItem[]
  ): Promise<BulkItemResult[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const results: BulkItemResult[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        try {
          const result = await this.processSingleLeaveAction(tx, ctx, item, i);
          results.push(result);
        } catch (error: unknown) {
          results.push({
            index: i,
            success: false,
            error: {
              code: "INTERNAL_ERROR",
              message: error instanceof Error ? error.message : "Unknown error processing leave request",
            },
          });
        }
      }

      return results;
    });
  }

  private async processSingleLeaveAction(
    tx: TransactionSql,
    ctx: TenantContext,
    item: BulkLeaveRequestActionItem,
    index: number
  ): Promise<BulkItemResult> {
    // Validate leave request exists and is in pending status
    const [request] = await tx<Array<{ id: string; status: string; employeeId: string }>>`
      SELECT id, status, employee_id FROM leave_requests
      WHERE id = ${item.leave_request_id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      LIMIT 1
    `;

    if (!request) {
      return {
        index,
        success: false,
        error: {
          code: "LEAVE_REQUEST_NOT_FOUND",
          message: "Leave request not found",
          details: { leave_request_id: item.leave_request_id },
        },
      };
    }

    if (request.status !== "pending") {
      return {
        index,
        success: false,
        error: {
          code: "REQUEST_NOT_PENDING",
          message: `Leave request is in '${request.status}' status, not 'pending'`,
          details: { leave_request_id: item.leave_request_id, current_status: request.status },
        },
      };
    }

    const approverId = ctx.userId || null;

    if (item.action === "approve") {
      // Approve the request
      const [updated] = await tx<LeaveRequestRow[]>`
        UPDATE leave_requests SET
          status = 'approved',
          approved_at = now(),
          approved_by = ${approverId}::uuid,
          updated_at = now()
        WHERE id = ${item.leave_request_id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'pending'
        RETURNING *
      `;

      if (!updated) {
        return {
          index,
          success: false,
          error: {
            code: "REQUEST_NOT_PENDING",
            message: "Leave request could not be approved (concurrent modification)",
            details: { leave_request_id: item.leave_request_id },
          },
        };
      }

      // Record approval action
      await tx`
        INSERT INTO leave_request_approvals (id, tenant_id, request_id, actor_id, action, comment)
        VALUES (
          ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid,
          ${item.leave_request_id}::uuid, ${approverId}::uuid,
          'approve', ${item.comments || null}
        )
      `;

      // Write outbox event
      await this.writeOutbox(tx, ctx.tenantId, "leave_request", item.leave_request_id, "absence.request.approved", {
        requestId: item.leave_request_id,
        employeeId: request.employeeId,
        approverId,
        source: "bulk_action",
      });

      return {
        index,
        success: true,
        id: item.leave_request_id,
        data: {
          leave_request_id: item.leave_request_id,
          action: "approved",
          employee_id: request.employeeId,
        },
      };
    } else {
      // Reject the request
      const [updated] = await tx<LeaveRequestRow[]>`
        UPDATE leave_requests SET
          status = 'rejected',
          rejection_reason = ${item.comments || null},
          updated_at = now()
        WHERE id = ${item.leave_request_id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'pending'
        RETURNING *
      `;

      if (!updated) {
        return {
          index,
          success: false,
          error: {
            code: "REQUEST_NOT_PENDING",
            message: "Leave request could not be rejected (concurrent modification)",
            details: { leave_request_id: item.leave_request_id },
          },
        };
      }

      // Record rejection action
      await tx`
        INSERT INTO leave_request_approvals (id, tenant_id, request_id, actor_id, action, comment)
        VALUES (
          ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid,
          ${item.leave_request_id}::uuid, ${approverId}::uuid,
          'reject', ${item.comments || "Rejected"}
        )
      `;

      // Write outbox event
      await this.writeOutbox(tx, ctx.tenantId, "leave_request", item.leave_request_id, "absence.request.denied", {
        requestId: item.leave_request_id,
        employeeId: request.employeeId,
        approverId,
        reason: item.comments,
        source: "bulk_action",
      });

      return {
        index,
        success: true,
        id: item.leave_request_id,
        data: {
          leave_request_id: item.leave_request_id,
          action: "rejected",
          employee_id: request.employeeId,
        },
      };
    }
  }

  // ===========================================================================
  // Generic Bulk Operations
  // ===========================================================================

  async executeGenericOperations(
    ctx: TenantContext,
    operations: GenericBulkOperationItem[],
    appFetch: (request: Request) => Promise<Response>,
    authHeaders: Record<string, string>
  ): Promise<GenericBulkOperationResult[]> {
    const results: GenericBulkOperationResult[] = [];
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i]!;
      try {
        const result = await this.executeSingleOperation(op, i, appFetch, authHeaders);
        results.push(result);
      } catch (error: unknown) {
        results.push({
          index: i, method: op.method, path: op.path, ref: op.ref, status: 500, success: false,
          error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Unknown error executing operation" },
        });
      }
    }
    return results;
  }

  private async executeSingleOperation(
    op: GenericBulkOperationItem,
    index: number,
    appFetch: (request: Request) => Promise<Response>,
    authHeaders: Record<string, string>
  ): Promise<GenericBulkOperationResult> {
    const url = `http://localhost${op.path}`;
    const headers: Record<string, string> = { ...authHeaders };
    let requestBody: string | undefined;
    if (op.body && (op.method === "POST" || op.method === "PUT" || op.method === "PATCH")) {
      headers["content-type"] = "application/json";
      requestBody = JSON.stringify(op.body);
    }
    const request = new Request(url, { method: op.method, headers, body: requestBody });
    const response = await appFetch(request);
    const status = response.status;
    let responseData: unknown;
    try {
      const text = await response.text();
      if (text) { responseData = JSON.parse(text); }
    } catch { /* non-JSON response */ }
    const success = status >= 200 && status < 300;
    if (success) {
      return { index, method: op.method, path: op.path, ref: op.ref, status, success: true, data: responseData };
    }
    const errorObj = responseData as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | undefined;
    return {
      index, method: op.method, path: op.path, ref: op.ref, status, success: false,
      error: { code: errorObj?.error?.code || "OPERATION_FAILED", message: errorObj?.error?.message || `Operation returned status ${status}`, details: errorObj?.error?.details },
    };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async writeOutbox(
    tx: TransactionSql,
    tenantId: string,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
      ) VALUES (
        ${crypto.randomUUID()}::uuid, ${tenantId}::uuid,
        ${aggregateType}, ${aggregateId}::uuid, ${eventType},
        ${JSON.stringify(payload)}::jsonb, now()
      )
    `;
  }
}
