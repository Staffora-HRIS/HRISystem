/**
 * Core HR Module - Employee Changes Service
 *
 * Implements business logic for effective-dated employee changes:
 * personal info updates, contract amendments, transfers, promotions,
 * compensation changes, and manager reassignments.
 *
 * Enforces invariants and emits domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { HRRepository } from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { EmployeeStates } from "@staffora/shared/state-machines";
import type {
  UpdateEmployeePersonal,
  UpdateEmployeeContract,
  UpdateEmployeePosition,
  UpdateEmployeeCompensation,
  UpdateEmployeeManager,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

type ChangesDomainEventType =
  | "hr.employee.updated"
  | "hr.employee.transferred"
  | "hr.employee.promoted";

// =============================================================================
// Employee Changes Service
// =============================================================================

export class EmployeeChangesService {
  constructor(
    private repository: HRRepository,
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
    eventType: ChangesDomainEventType,
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
  // Personal Info Update
  // ===========================================================================

  /**
   * Update employee personal info (effective-dated)
   */
  async updateEmployeePersonal(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePersonal,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Validate employee exists and is not terminated
    const employeeResult = await this.repository.findEmployeeById(context, employeeId);
    if (!employeeResult.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    if (employeeResult.employee.status === EmployeeStates.TERMINATED) {
      return {
        success: false,
        error: {
          code: "TERMINATED",
          message: "Cannot update terminated employee",
          details: { id: employeeId },
        },
      };
    }

    // Update in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.updateEmployeePersonal(
        tx,
        context,
        employeeId,
        data,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.updated", {
        employeeId,
        dimension: "personal",
        effectiveFrom: data.effective_from,
      });
    });

    return { success: true };
  }

  // ===========================================================================
  // Contract Update
  // ===========================================================================

  /**
   * Update employee contract (effective-dated)
   */
  async updateEmployeeContract(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeContract,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Validate employee exists and is not terminated
    const employeeResult = await this.repository.findEmployeeById(context, employeeId);
    if (!employeeResult.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    if (employeeResult.employee.status === EmployeeStates.TERMINATED) {
      return {
        success: false,
        error: {
          code: "TERMINATED",
          message: "Cannot update terminated employee",
          details: { id: employeeId },
        },
      };
    }

    // Update in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.updateEmployeeContract(
        tx,
        context,
        employeeId,
        data,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.updated", {
        employeeId,
        dimension: "contract",
        effectiveFrom: data.effective_from,
      });
    });

    return { success: true };
  }

  // ===========================================================================
  // Transfer
  // ===========================================================================

  /**
   * Transfer employee to new position (effective-dated)
   */
  async transferEmployee(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Validate employee exists and is not terminated
    const employeeResult = await this.repository.findEmployeeById(context, employeeId);
    if (!employeeResult.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    if (employeeResult.employee.status === EmployeeStates.TERMINATED) {
      return {
        success: false,
        error: {
          code: "TERMINATED",
          message: "Cannot transfer terminated employee",
          details: { id: employeeId },
        },
      };
    }

    // Validate position exists
    const position = await this.repository.findPositionById(context, data.position_id);
    if (!position) {
      return {
        success: false,
        error: {
          code: "POSITION_NOT_FOUND",
          message: "Position not found",
          details: { position_id: data.position_id },
        },
      };
    }

    // Validate org unit exists
    const orgUnit = await this.repository.findOrgUnitById(context, data.org_unit_id);
    if (!orgUnit) {
      return {
        success: false,
        error: {
          code: "ORG_UNIT_NOT_FOUND",
          message: "Org unit not found",
          details: { org_unit_id: data.org_unit_id },
        },
      };
    }

    // Update in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.updateEmployeePosition(
        tx,
        context,
        employeeId,
        data,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.transferred", {
        employeeId,
        positionId: data.position_id,
        orgUnitId: data.org_unit_id,
        effectiveFrom: data.effective_from,
        reason: data.assignment_reason,
      });
    });

    return { success: true };
  }

  // ===========================================================================
  // Promotion
  // ===========================================================================

  /**
   * Promote employee (same as transfer but different event)
   */
  async promoteEmployee(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Validate employee exists and is not terminated
    const employeeResult = await this.repository.findEmployeeById(context, employeeId);
    if (!employeeResult.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    if (employeeResult.employee.status === EmployeeStates.TERMINATED) {
      return {
        success: false,
        error: {
          code: "TERMINATED",
          message: "Cannot promote terminated employee",
          details: { id: employeeId },
        },
      };
    }

    // Validate position exists
    const position = await this.repository.findPositionById(context, data.position_id);
    if (!position) {
      return {
        success: false,
        error: {
          code: "POSITION_NOT_FOUND",
          message: "Position not found",
          details: { position_id: data.position_id },
        },
      };
    }

    // Update in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.updateEmployeePosition(
        tx,
        context,
        employeeId,
        { ...data, assignment_reason: data.assignment_reason || "promotion" },
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.promoted", {
        employeeId,
        positionId: data.position_id,
        orgUnitId: data.org_unit_id,
        effectiveFrom: data.effective_from,
        reason: data.assignment_reason || "promotion",
      });
    });

    return { success: true };
  }

  // ===========================================================================
  // Compensation Change
  // ===========================================================================

  /**
   * Change employee compensation (effective-dated)
   */
  async changeCompensation(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeCompensation,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Validate employee exists and is not terminated
    const employeeResult = await this.repository.findEmployeeById(context, employeeId);
    if (!employeeResult.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    if (employeeResult.employee.status === EmployeeStates.TERMINATED) {
      return {
        success: false,
        error: {
          code: "TERMINATED",
          message: "Cannot change compensation for terminated employee",
          details: { id: employeeId },
        },
      };
    }

    // Update in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.updateEmployeeCompensation(
        tx,
        context,
        employeeId,
        data,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.updated", {
        employeeId,
        dimension: "compensation",
        effectiveFrom: data.effective_from,
        baseSalary: data.base_salary,
        changeReason: data.change_reason,
      });
    });

    return { success: true };
  }

  // ===========================================================================
  // Manager Change
  // ===========================================================================

  /**
   * Change employee manager (effective-dated)
   */
  async changeManager(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeManager,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Validate employee exists and is not terminated
    const employeeResult = await this.repository.findEmployeeById(context, employeeId);
    if (!employeeResult.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    if (employeeResult.employee.status === EmployeeStates.TERMINATED) {
      return {
        success: false,
        error: {
          code: "TERMINATED",
          message: "Cannot change manager for terminated employee",
          details: { id: employeeId },
        },
      };
    }

    // Validate manager exists and is active
    const managerResult = await this.repository.findEmployeeById(context, data.manager_id);
    if (!managerResult.employee) {
      return {
        success: false,
        error: {
          code: "MANAGER_NOT_FOUND",
          message: "Manager not found",
          details: { manager_id: data.manager_id },
        },
      };
    }

    if (managerResult.employee.status !== "active" && managerResult.employee.status !== "on_leave") {
      return {
        success: false,
        error: {
          code: "INVALID_MANAGER",
          message: "Manager is not in active status",
          details: { manager_id: data.manager_id, status: managerResult.employee.status },
        },
      };
    }

    // Check for circular reporting
    if (data.is_primary !== false) {
      const isCircular = await this.repository.checkCircularReporting(
        context,
        employeeId,
        data.manager_id
      );
      if (isCircular) {
        return {
          success: false,
          error: {
            code: "CIRCULAR_REPORTING",
            message: "Cannot set manager that would create circular reporting chain",
            details: { employee_id: employeeId, manager_id: data.manager_id },
          },
        };
      }
    }

    // Update in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.updateEmployeeManager(
        tx,
        context,
        employeeId,
        data,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.updated", {
        employeeId,
        dimension: "manager",
        managerId: data.manager_id,
        effectiveFrom: data.effective_from,
      });
    });

    return { success: true };
  }
}
