/**
 * Core HR Module - Employee Positions Service (Concurrent Employment)
 *
 * Implements business logic for multi-position / concurrent employment:
 * listing positions, assigning additional positions, and ending
 * position assignments with FTE validation.
 *
 * Enforces invariants and emits domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { HRRepository } from "./repository";
import type { PositionAssignmentRow } from "./repository.types";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  AssignEmployeePosition,
  EmployeePositionAssignmentResponse,
  EmployeePositionsListResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

type PositionDomainEventType =
  | "hr.employee.position_assigned"
  | "hr.employee.position_ended";

// =============================================================================
// Employee Positions Service
// =============================================================================

export class EmployeePositionsService {
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
    eventType: PositionDomainEventType,
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
  // List Positions
  // ===========================================================================

  /**
   * Get all active position assignments for an employee with FTE summary.
   */
  async getEmployeePositions(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<EmployeePositionsListResponse>> {
    // Verify employee exists
    const { employee } = await this.repository.findEmployeeById(context, employeeId);
    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employeeId },
        },
      };
    }

    const positions = await this.repository.findEmployeePositions(context, employeeId);
    const totalFte = await this.repository.getEmployeeTotalFte(context, employeeId);
    const maxFte = await this.repository.getTenantMaxFte(context);

    return {
      success: true,
      data: {
        employee_id: employeeId,
        total_fte_percentage: totalFte,
        max_fte_percentage: maxFte,
        positions: positions.map((row) => this.mapPositionAssignmentToResponse(row)),
      },
    };
  }

  // ===========================================================================
  // Assign Additional Position
  // ===========================================================================

  /**
   * Assign an additional position to an employee (concurrent employment).
   * Validates:
   * - Employee exists and is not terminated
   * - Position exists and is active
   * - Org unit exists
   * - Total FTE does not exceed tenant-configured maximum
   */
  async assignAdditionalPosition(
    context: TenantContext,
    employeeId: string,
    data: AssignEmployeePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeePositionAssignmentResponse>> {
    // Verify employee exists
    const { employee } = await this.repository.findEmployeeById(context, employeeId);
    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employeeId },
        },
      };
    }

    // Check employee is not terminated
    if (employee.status === "terminated") {
      return {
        success: false,
        error: {
          code: "TERMINATED",
          message: "Cannot assign positions to a terminated employee",
          details: { employeeId, status: employee.status },
        },
      };
    }

    // Verify position exists and is active
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

    const rawPosition = position as Record<string, unknown>;
    const isActive = rawPosition.isActive ?? rawPosition.is_active;
    if (isActive === false) {
      return {
        success: false,
        error: {
          code: "POSITION_NOT_FOUND",
          message: "Position is not active",
          details: { position_id: data.position_id },
        },
      };
    }

    // Verify org unit exists
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

    // Validate FTE does not exceed max
    const currentTotalFte = await this.repository.getEmployeeTotalFte(context, employeeId);
    const maxFte = await this.repository.getTenantMaxFte(context);
    const newTotalFte = currentTotalFte + data.fte_percentage;

    if (newTotalFte > maxFte) {
      return {
        success: false,
        error: {
          code: "FTE_LIMIT_EXCEEDED",
          message: `Total FTE (${newTotalFte}%) would exceed the configured maximum (${maxFte}%)`,
          details: {
            current_total_fte: currentTotalFte,
            requested_fte: data.fte_percentage,
            new_total_fte: newTotalFte,
            max_fte: maxFte,
          },
        },
      };
    }

    const isPrimary = data.is_primary === true;

    // Create assignment in transaction with outbox event
    const assignment = await this.db.withTransaction(context, async (tx) => {
      const result = await this.repository.assignAdditionalPosition(
        tx,
        context,
        employeeId,
        {
          position_id: data.position_id,
          org_unit_id: data.org_unit_id,
          is_primary: isPrimary,
          fte_percentage: data.fte_percentage,
          effective_from: data.effective_from,
          assignment_reason: data.assignment_reason,
        },
        context.userId || "system"
      );

      // Emit domain event
      await this.emitEvent(
        tx,
        context,
        "employee",
        employeeId,
        "hr.employee.position_assigned",
        {
          assignment_id: result.id,
          employee_id: employeeId,
          position_id: data.position_id,
          org_unit_id: data.org_unit_id,
          is_primary: isPrimary,
          fte_percentage: data.fte_percentage,
          effective_from: data.effective_from,
          assignment_reason: data.assignment_reason,
        }
      );

      return result;
    });

    // Re-fetch the full assignment with joined data
    const fullAssignment = await this.repository.findPositionAssignmentById(
      context,
      assignment.id
    );

    return {
      success: true,
      data: this.mapPositionAssignmentToResponse(fullAssignment || assignment),
    };
  }

  // ===========================================================================
  // End Position Assignment
  // ===========================================================================

  /**
   * End a specific position assignment for an employee.
   */
  async endEmployeePositionAssignment(
    context: TenantContext,
    employeeId: string,
    assignmentId: string,
    effectiveTo: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Verify employee exists
    const { employee } = await this.repository.findEmployeeById(context, employeeId);
    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employeeId },
        },
      };
    }

    // Verify assignment exists and belongs to this employee
    const assignment = await this.repository.findPositionAssignmentById(context, assignmentId);
    if (!assignment) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Position assignment not found",
          details: { assignmentId },
        },
      };
    }

    const rawAssignment = assignment as Record<string, unknown>;
    const assignmentEmployeeId = rawAssignment.employeeId ?? rawAssignment.employee_id;
    if (String(assignmentEmployeeId) !== employeeId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Position assignment does not belong to this employee",
          details: { assignmentId, employeeId },
        },
      };
    }

    // End the assignment in transaction with outbox event
    await this.db.withTransaction(context, async (tx) => {
      const ended = await this.repository.endPositionAssignment(tx, assignmentId, effectiveTo);

      if (!ended) {
        throw new Error("Failed to end position assignment -- it may already be ended or the date is invalid");
      }

      // Emit domain event
      await this.emitEvent(
        tx,
        context,
        "employee",
        employeeId,
        "hr.employee.position_ended",
        {
          assignment_id: assignmentId,
          employee_id: employeeId,
          effective_to: effectiveTo,
        }
      );
    });

    return { success: true };
  }

  // ===========================================================================
  // Position Assignment Mapping Helper
  // ===========================================================================

  mapPositionAssignmentToResponse(
    row: PositionAssignmentRow
  ): EmployeePositionAssignmentResponse {
    const raw = row as Record<string, unknown>;

    const employeeId = raw.employeeId ?? raw.employee_id;
    const positionId = raw.positionId ?? raw.position_id;
    const positionCode = raw.positionCode ?? raw.position_code;
    const positionTitle = raw.positionTitle ?? raw.position_title;
    const orgUnitId = raw.orgUnitId ?? raw.org_unit_id;
    const orgUnitName = raw.orgUnitName ?? raw.org_unit_name;
    const isPrimary = raw.isPrimary ?? raw.is_primary;
    const ftePercentage = raw.ftePercentage ?? raw.fte_percentage;
    const assignmentReason = raw.assignmentReason ?? raw.assignment_reason;
    const effectiveFrom = raw.effectiveFrom ?? raw.effective_from;
    const effectiveTo = raw.effectiveTo ?? raw.effective_to;
    const createdAt = raw.createdAt ?? raw.created_at;

    const toDateString = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString().split("T")[0]!;
      }
      if (typeof value === "string") {
        return value.split("T")[0]!;
      }
      return new Date().toISOString().split("T")[0]!;
    };

    const toISOString = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === "string") {
        return value;
      }
      return new Date().toISOString();
    };

    return {
      id: row.id,
      employee_id: String(employeeId),
      position_id: String(positionId),
      position_code: positionCode ? String(positionCode) : "",
      position_title: positionTitle ? String(positionTitle) : "",
      org_unit_id: String(orgUnitId),
      org_unit_name: orgUnitName ? String(orgUnitName) : "",
      is_primary: Boolean(isPrimary),
      fte_percentage: ftePercentage ? parseFloat(String(ftePercentage)) : 100,
      assignment_reason: assignmentReason ? String(assignmentReason) : null,
      effective_from: toDateString(effectiveFrom),
      effective_to: effectiveTo ? toDateString(effectiveTo) : null,
      created_at: toISOString(createdAt),
    };
  }
}
