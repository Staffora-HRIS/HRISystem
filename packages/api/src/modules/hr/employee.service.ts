/**
 * Core HR Module - Employee Service
 *
 * Implements business logic for Employee operations including
 * hiring, transfers, promotions, termination, status transitions,
 * history, org chart, and UK statutory compliance.
 *
 * Enforces invariants, validates state machine transitions,
 * and emits domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  HRRepository,
  EmployeeRow,
} from "./repository";
import type {
  EmployeePersonalRow,
  EmployeeContractRow,
  PositionAssignmentRow,
  CompensationRow,
  ReportingLineRow,
} from "./repository.types";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import {
  canTransition as canTransitionEmployee,
  getValidTransitions as getValidEmployeeTransitions,
  EmployeeStates,
} from "@staffora/shared/state-machines";
import { calculateStatutoryNoticePeriod } from "@staffora/shared/utils";
import type {
  CreateEmployee,
  UpdateEmployeePersonal,
  UpdateEmployeeContract,
  UpdateEmployeePosition,
  UpdateEmployeeCompensation,
  UpdateEmployeeManager,
  EmployeeFilters,
  EmployeeStatusTransition,
  EmployeeTermination,
  PaginationQuery,
  EmployeeResponse,
  EmployeeListItem,
  HistoryDimension,
  HistoryRecord,
  AssignEmployeePosition,
  EmployeePositionAssignmentResponse,
  EmployeePositionsListResponse,
  RehireEmployee,
  EmploymentRecordResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

type EmployeeDomainEventType =
  | "hr.employee.created"
  | "hr.employee.updated"
  | "hr.employee.transferred"
  | "hr.employee.promoted"
  | "hr.employee.terminated"
  | "hr.employee.rehired"
  | "hr.employee.status_changed"
  | "hr.employee.ni_category_changed"
  | "hr.employee.position_assigned"
  | "hr.employee.position_ended"
  | "benefits.enrollment.ceased";

// =============================================================================
// Employee Service
// =============================================================================

export class EmployeeService {
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
    eventType: EmployeeDomainEventType,
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
  // Stats
  // ===========================================================================

  async getStats(context: TenantContext) {
    return this.repository.getStats(context);
  }

  // ===========================================================================
  // Employee CRUD
  // ===========================================================================

  /**
   * List employees with filters
   */
  async listEmployees(
    context: TenantContext,
    filters: EmployeeFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<EmployeeListItem>> {
    const result = await this.repository.findEmployees(context, filters, pagination);

    return {
      items: result.items.map((emp) => {
        // Handle both camelCase (TypeScript interface) and snake_case (PostgreSQL columns)
        const rawEmp = emp as Record<string, unknown>;

        const employeeNumber = rawEmp.employeeNumber ?? rawEmp.employee_number;
        const hireDate = rawEmp.hireDate ?? rawEmp.hire_date;
        const fullName = rawEmp.fullName ?? rawEmp.full_name;
        const displayName = rawEmp.displayName ?? rawEmp.display_name;
        const positionTitle = rawEmp.positionTitle ?? rawEmp.position_title;
        const orgUnitName = rawEmp.orgUnitName ?? rawEmp.org_unit_name;
        const managerName = rawEmp.managerName ?? rawEmp.manager_name;

        // Helper to safely convert date to YYYY-MM-DD string
        const toDateString = (value: unknown): string => {
          if (value instanceof Date) {
            return value.toISOString().split("T")[0]!;
          }
          if (typeof value === "string") {
            return value.includes("T") ? value.split("T")[0]! : value;
          }
          return "";
        };

        return {
          id: emp.id,
          employee_number: String(employeeNumber || ""),
          status: emp.status,
          hire_date: toDateString(hireDate),
          full_name: fullName ? String(fullName) : "",
          display_name: displayName ? String(displayName) : "",
          position_title: positionTitle ? String(positionTitle) : null,
          org_unit_name: orgUnitName ? String(orgUnitName) : null,
          manager_name: managerName ? String(managerName) : null,
        };
      }),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get employee by ID with full details
   */
  async getEmployee(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const result = await this.repository.findEmployeeById(context, id);

    if (!result.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id },
        },
      };
    }

    const tenure = await this.repository.getEmployeeTenure(context, id);
    const annualSalary = result.compensation
      ? await this.repository.getEmployeeAnnualSalary(context, id)
      : null;

    return {
      success: true,
      data: this.mapEmployeeToResponse(result, tenure, annualSalary),
    };
  }

  /**
   * Get employee by employee number
   */
  async getEmployeeByNumber(
    context: TenantContext,
    employeeNumber: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const employee = await this.repository.findEmployeeByNumber(context, employeeNumber);

    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employee_number: employeeNumber },
        },
      };
    }

    return this.getEmployee(context, employee.id);
  }

  /**
   * Hire a new employee
   */
  async hireEmployee(
    context: TenantContext,
    data: CreateEmployee,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    // Validate position exists and has headcount
    const positionHeadcount = await this.repository.getPositionHeadcount(
      context,
      data.position.position_id
    );

    if (positionHeadcount.headcount === 0) {
      return {
        success: false,
        error: {
          code: "POSITION_NOT_FOUND",
          message: "Position not found",
          details: { position_id: data.position.position_id },
        },
      };
    }

    if (positionHeadcount.currentCount >= positionHeadcount.headcount) {
      return {
        success: false,
        error: {
          code: "POSITION_OVERFILLED",
          message: "Position is already at maximum headcount",
          details: {
            position_id: data.position.position_id,
            headcount: positionHeadcount.headcount,
            current_count: positionHeadcount.currentCount,
          },
        },
      };
    }

    // Validate org unit exists
    const orgUnit = await this.repository.findOrgUnitById(context, data.position.org_unit_id);
    if (!orgUnit) {
      return {
        success: false,
        error: {
          code: "ORG_UNIT_NOT_FOUND",
          message: "Org unit not found",
          details: { org_unit_id: data.position.org_unit_id },
        },
      };
    }

    // Validate manager exists if specified
    if (data.manager_id) {
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
    }

    // Generate employee number if not provided
    const employeeNumber = data.employee_number ||
      await this.repository.generateEmployeeNumber(context);

    // Create employee in transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      const created = await this.repository.createEmployee(
        tx,
        context,
        data,
        employeeNumber,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "employee", created.employee.id, "hr.employee.created", {
        employeeId: created.employee.id,
        employeeNumber,
        hireDate: data.contract.hire_date,
      });

      return created;
    });

    // Fetch full employee details
    return this.getEmployee(context, result.employee.id);
  }

  // ===========================================================================
  // Employee Update Operations (effective-dated)
  // ===========================================================================

  /**
   * Update employee personal info (effective-dated)
   */
  async updateEmployeePersonal(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePersonal,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
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

    return this.getEmployee(context, employeeId);
  }

  /**
   * Update employee contract (effective-dated)
   */
  async updateEmployeeContract(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeContract,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
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

    return this.getEmployee(context, employeeId);
  }

  /**
   * Transfer employee to new position (effective-dated)
   */
  async transferEmployee(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
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

    return this.getEmployee(context, employeeId);
  }

  /**
   * Promote employee (same as transfer but different event)
   */
  async promoteEmployee(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
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

    return this.getEmployee(context, employeeId);
  }

  /**
   * Change employee compensation (effective-dated)
   */
  async changeCompensation(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeCompensation,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
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

    return this.getEmployee(context, employeeId);
  }

  /**
   * Change employee manager (effective-dated)
   */
  async changeManager(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeManager,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
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

    return this.getEmployee(context, employeeId);
  }

  // ===========================================================================
  // Status Transitions
  // ===========================================================================

  /**
   * Transition employee status
   */
  async transitionStatus(
    context: TenantContext,
    employeeId: string,
    data: EmployeeStatusTransition,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    // Get current employee
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

    const currentStatus = employeeResult.employee.status;

    // Validate state machine transition (uses @staffora/shared employee lifecycle)
    if (!canTransitionEmployee(currentStatus, data.to_status)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INVALID_LIFECYCLE_TRANSITION,
          message: `Cannot transition from ${currentStatus} to ${data.to_status}`,
          details: {
            current_status: currentStatus,
            requested_status: data.to_status,
            valid_transitions: getValidEmployeeTransitions(currentStatus),
          },
        },
      };
    }

    // Update in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.transitionEmployeeStatus(
        tx,
        context,
        employeeId,
        data.to_status,
        data.effective_date,
        data.reason || null,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.status_changed", {
        employeeId,
        fromStatus: currentStatus,
        toStatus: data.to_status,
        effectiveDate: data.effective_date,
        reason: data.reason,
      });
    });

    return this.getEmployee(context, employeeId);
  }

  /**
   * Terminate employee
   */
  async terminateEmployee(
    context: TenantContext,
    employeeId: string,
    data: EmployeeTermination,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    // Get current employee
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

    const currentStatus = employeeResult.employee.status;

    // Validate can terminate (not already terminated, not pending)
    if (currentStatus === EmployeeStates.TERMINATED) {
      return {
        success: false,
        error: {
          code: "ALREADY_TERMINATED",
          message: "Employee is already terminated",
          details: { id: employeeId },
        },
      };
    }

    if (currentStatus === EmployeeStates.PENDING) {
      return {
        success: false,
        error: {
          code: "CANNOT_TERMINATE_PENDING",
          message: "Cannot terminate employee that never started. Delete the record instead.",
          details: { id: employeeId },
        },
      };
    }

    // Validate termination date is after hire date
    const hireDate = new Date(employeeResult.employee.hireDate);
    const terminationDate = new Date(data.termination_date);
    if (terminationDate < hireDate) {
      return {
        success: false,
        error: {
          code: "INVALID_TERMINATION_DATE",
          message: "Termination date cannot be before hire date",
          details: {
            hire_date: employeeResult.employee.hireDate,
            termination_date: data.termination_date,
          },
        },
      };
    }

    // Terminate in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.terminateEmployee(
        tx,
        context,
        employeeId,
        data.termination_date,
        data.reason,
        context.userId || "system"
      );

      // End all active benefit enrollments
      await tx`
        UPDATE app.benefit_enrollments
        SET effective_to = ${data.termination_date}::date,
            updated_at = now()
        WHERE employee_id = ${employeeId}::uuid
          AND tenant_id = ${context.tenantId}::uuid
          AND (effective_to IS NULL OR effective_to > ${data.termination_date}::date)
          AND status = 'active'
      `;

      // Emit termination event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.terminated", {
        employeeId,
        terminationDate: data.termination_date,
        reason: data.reason,
      });

      // Emit benefits cessation event
      await this.emitEvent(tx, context, "employee", employeeId, "benefits.enrollment.ceased", {
        employeeId,
        terminationDate: data.termination_date,
      });
    });

    return this.getEmployee(context, employeeId);
  }

  /**
   * Rehire a terminated employee.
   *
   * Creates a new employment record linking to the previous terminated record,
   * preserving the full employment history chain. Reactivates the employee
   * with new contract, position, and compensation records.
   *
   * The employee status transitions: terminated -> pending (rehire sets pending,
   * then the normal activation flow brings them to active).
   */
  async rehireEmployee(
    context: TenantContext,
    employeeId: string,
    data: RehireEmployee,
    idempotencyKey?: string
  ): Promise<ServiceResult<{ employee: EmployeeResponse; employment_records: EmploymentRecordResponse[] }>> {
    // Validate employee exists
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

    // Validate employee is terminated (only terminated employees can be rehired)
    if (employeeResult.employee.status !== EmployeeStates.TERMINATED) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: "Only terminated employees can be rehired",
          details: {
            id: employeeId,
            current_status: employeeResult.employee.status,
            required_status: "terminated",
          },
        },
      };
    }

    // Validate rehire date is after termination date
    const terminationDate = employeeResult.employee.terminationDate
      ? new Date(employeeResult.employee.terminationDate)
      : null;
    const rehireDate = new Date(data.rehire_date);

    if (terminationDate && rehireDate <= terminationDate) {
      return {
        success: false,
        error: {
          code: "INVALID_REHIRE_DATE",
          message: "Rehire date must be after the termination date",
          details: {
            termination_date: employeeResult.employee.terminationDate,
            rehire_date: data.rehire_date,
          },
        },
      };
    }

    // Validate position exists and has headcount
    const positionHeadcount = await this.repository.getPositionHeadcount(
      context,
      data.position.position_id
    );

    if (positionHeadcount.headcount === 0) {
      return {
        success: false,
        error: {
          code: "POSITION_NOT_FOUND",
          message: "Position not found",
          details: { position_id: data.position.position_id },
        },
      };
    }

    if (positionHeadcount.currentCount >= positionHeadcount.headcount) {
      return {
        success: false,
        error: {
          code: "POSITION_OVERFILLED",
          message: "Position is already at maximum headcount",
          details: {
            position_id: data.position.position_id,
            headcount: positionHeadcount.headcount,
            current_count: positionHeadcount.currentCount,
          },
        },
      };
    }

    // Validate org unit exists
    const orgUnit = await this.repository.findOrgUnitById(context, data.position.org_unit_id);
    if (!orgUnit) {
      return {
        success: false,
        error: {
          code: "ORG_UNIT_NOT_FOUND",
          message: "Org unit not found",
          details: { org_unit_id: data.position.org_unit_id },
        },
      };
    }

    // Validate manager exists if specified
    if (data.manager_id) {
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
    }

    // Perform rehire in a single transaction
    await this.db.withTransaction(context, async (tx) => {
      // 1. Close the current employment record if it exists
      //    (if the employee was hired before this feature existed, there may not be one)
      const currentRecord = await tx<{ id: string }[]>`
        SELECT id FROM app.employment_records
        WHERE employee_id = ${employeeId}::uuid AND is_current = true
        LIMIT 1
      `;

      let previousEmploymentId: string | null = null;

      if (currentRecord.length > 0) {
        // Close the existing current record
        previousEmploymentId = currentRecord[0]!.id;
        await this.repository.closeCurrentEmploymentRecord(
          tx,
          context,
          employeeId,
          employeeResult.employee!.terminationDate
            ? new Date(employeeResult.employee!.terminationDate).toISOString().split("T")[0]!
            : data.rehire_date,
          employeeResult.employee!.terminationReason || "terminated"
        );
      } else {
        // No employment record exists yet; create a closed one for the prior employment
        const maxNum = await this.repository.getMaxEmploymentNumber(tx, employeeId);
        const priorRows = await tx<{ id: string }[]>`
          INSERT INTO app.employment_records (
            tenant_id, employee_id, employment_number,
            start_date, end_date, termination_reason,
            is_current
          )
          VALUES (
            ${context.tenantId}::uuid, ${employeeId}::uuid, ${maxNum + 1},
            ${new Date(employeeResult.employee!.hireDate).toISOString().split("T")[0]}::date,
            ${employeeResult.employee!.terminationDate ? new Date(employeeResult.employee!.terminationDate).toISOString().split("T")[0] : data.rehire_date}::date,
            ${employeeResult.employee!.terminationReason || "terminated"},
            false
          )
          RETURNING id
        `;
        previousEmploymentId = priorRows[0]?.id || null;
      }

      // 2. Create a new employment record for the rehire
      const maxNum = await this.repository.getMaxEmploymentNumber(tx, employeeId);
      await this.repository.createEmploymentRecord(tx, context, {
        employeeId,
        employmentNumber: maxNum + 1,
        startDate: data.rehire_date,
        previousEmploymentId,
      });

      // 3. Reactivate the employee (status -> pending, new hire_date, clear termination)
      await this.repository.rehireEmployee(
        tx,
        context,
        employeeId,
        data.rehire_date,
        context.userId || "system"
      );

      // 4. Create new contract record
      await this.repository.updateEmployeeContract(
        tx,
        context,
        employeeId,
        {
          effective_from: data.rehire_date,
          contract_type: data.contract.contract_type,
          employment_type: data.contract.employment_type,
          fte: data.contract.fte,
          working_hours_per_week: data.contract.working_hours_per_week,
          probation_end_date: data.contract.probation_end_date,
          notice_period_days: data.contract.notice_period_days,
        },
        context.userId || "system"
      );

      // 5. Create new position assignment
      await this.repository.updateEmployeePosition(
        tx,
        context,
        employeeId,
        {
          effective_from: data.rehire_date,
          position_id: data.position.position_id,
          org_unit_id: data.position.org_unit_id,
          is_primary: data.position.is_primary !== false,
          assignment_reason: "rehire",
        },
        context.userId || "system"
      );

      // 6. Create new compensation record
      await this.repository.updateEmployeeCompensation(
        tx,
        context,
        employeeId,
        {
          effective_from: data.rehire_date,
          base_salary: data.compensation.base_salary,
          currency: data.compensation.currency,
          pay_frequency: data.compensation.pay_frequency,
          change_reason: "rehire",
        },
        context.userId || "system"
      );

      // 7. Create reporting line if manager specified
      if (data.manager_id) {
        await this.repository.updateEmployeeManager(
          tx,
          context,
          employeeId,
          {
            effective_from: data.rehire_date,
            manager_id: data.manager_id,
            relationship_type: "direct",
            is_primary: true,
          },
          context.userId || "system"
        );
      }

      // 8. Emit rehire domain event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.rehired", {
        employeeId,
        rehireDate: data.rehire_date,
        previousEmploymentId,
        reason: data.reason || "rehire",
      });
    });

    // Fetch updated employee and employment records
    const employeeResponse = await this.getEmployee(context, employeeId);
    if (!employeeResponse.success) {
      return {
        success: false,
        error: employeeResponse.error,
      };
    }

    const employmentRecords = await this.repository.getEmploymentRecords(context, employeeId);

    // Helper to safely convert date to YYYY-MM-DD string
    const toDateString = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString().split("T")[0]!;
      }
      if (typeof value === "string") {
        return value.includes("T") ? value.split("T")[0]! : value;
      }
      return "";
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
      success: true,
      data: {
        employee: employeeResponse.data!,
        employment_records: employmentRecords.map((rec) => {
          const raw = rec as Record<string, unknown>;
          return {
            id: String(raw.id),
            tenant_id: String(raw.tenantId ?? raw.tenant_id),
            employee_id: String(raw.employeeId ?? raw.employee_id),
            employment_number: Number(raw.employmentNumber ?? raw.employment_number),
            start_date: toDateString(raw.startDate ?? raw.start_date),
            end_date: (raw.endDate ?? raw.end_date) ? toDateString(raw.endDate ?? raw.end_date) : null,
            termination_reason: (raw.terminationReason ?? raw.termination_reason) as string | null,
            is_current: Boolean(raw.isCurrent ?? raw.is_current),
            previous_employment_id: (raw.previousEmploymentId ?? raw.previous_employment_id) as string | null,
            created_at: toISOString(raw.createdAt ?? raw.created_at),
          };
        }),
      },
    };
  }

  /**
   * Update employee NI category
   */
  async updateNiCategory(
    context: TenantContext,
    employeeId: string,
    niCategory: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    // Get current employee
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

    // Cannot update terminated employees
    if (employeeResult.employee.status === EmployeeStates.TERMINATED) {
      return {
        success: false,
        error: {
          code: "TERMINATED",
          message: "Cannot update NI category for terminated employee",
          details: { id: employeeId },
        },
      };
    }

    const previousCategory = employeeResult.employee.niCategory ?? "A";

    // Update in transaction with outbox event
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.updateNiCategory(tx, context, employeeId, niCategory);

      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.ni_category_changed", {
        employeeId,
        previousCategory,
        newCategory: niCategory,
      });
    });

    return this.getEmployee(context, employeeId);
  }

  // ===========================================================================
  // Statutory Notice Calculation (UK Employment Rights Act 1996, s.86)
  // ===========================================================================

  /**
   * Calculate the statutory minimum notice period for an employee.
   *
   * UK Employment Rights Act 1996, s.86:
   *  - < 1 month continuous service: no statutory entitlement
   *  - 1 month to 2 years: minimum 1 week
   *  - 2+ complete years: 1 week per year, maximum 12 weeks
   *
   * Returns { statutory_notice_weeks, contractual_notice_days, is_compliant }
   */
  async getStatutoryNoticePeriod(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<{
    employee_id: string;
    hire_date: string;
    reference_date: string;
    years_of_service: number;
    months_of_service: number;
    statutory_notice_weeks: number;
    statutory_notice_days: number;
    contractual_notice_days: number | null;
    is_compliant: boolean;
    compliance_message: string;
  }>> {
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

    const employee = employeeResult.employee;
    const referenceDate = employee.terminationDate
      ? new Date(employee.terminationDate)
      : new Date();

    // Get current contractual notice period from the active employment contract
    const contractRows = await this.db.withTransaction(context, async (tx) => {
      return tx`
        SELECT notice_period_days
        FROM app.employment_contracts
        WHERE employee_id = ${employeeId}::uuid
          AND tenant_id = ${context.tenantId}::uuid
          AND effective_to IS NULL
        ORDER BY effective_from DESC
        LIMIT 1
      `;
    });

    const contractualNoticeDays = (contractRows[0] as any)?.noticePeriodDays ?? null;

    // Delegate calculation to the shared utility (UK Employment Rights Act 1996, s.86)
    const notice = calculateStatutoryNoticePeriod({
      hireDate: employee.hireDate,
      referenceDate,
      contractualNoticeDays,
    });

    return {
      success: true,
      data: {
        employee_id: employeeId,
        hire_date: String(employee.hireDate),
        reference_date: referenceDate.toISOString().split("T")[0],
        years_of_service: notice.yearsOfService,
        months_of_service: notice.monthsOfService,
        statutory_notice_weeks: notice.statutoryNoticeWeeks,
        statutory_notice_days: notice.statutoryNoticeDays,
        contractual_notice_days: notice.contractualNoticeDays,
        is_compliant: notice.isCompliant,
        compliance_message: notice.complianceMessage,
      },
    };
  }

  // ===========================================================================
  // History Methods
  // ===========================================================================

  /**
   * Get employee history for a dimension
   */
  async getEmployeeHistory(
    context: TenantContext,
    employeeId: string,
    dimension: HistoryDimension,
    dateRange?: { from?: string; to?: string }
  ): Promise<ServiceResult<HistoryRecord[]>> {
    // Validate employee exists
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

    let records: HistoryRecord[];

    switch (dimension) {
      case "personal": {
        const history = await this.repository.getEmployeePersonalHistory(
          context,
          employeeId,
          dateRange
        );
        records = history.map((r) => ({
          id: r.id,
          effective_from: r.effectiveFrom.toISOString().split("T")[0]!,
          effective_to: r.effectiveTo?.toISOString().split("T")[0] || null,
          data: {
            first_name: r.firstName,
            middle_name: r.middleName,
            last_name: r.lastName,
            preferred_name: r.preferredName,
            date_of_birth: r.dateOfBirth?.toISOString().split("T")[0] || null,
            gender: r.gender,
            marital_status: r.maritalStatus,
            nationality: r.nationality,
          },
          created_at: r.createdAt.toISOString(),
          created_by: r.createdBy,
        }));
        break;
      }
      case "contract": {
        const history = await this.repository.getEmployeeContractHistory(
          context,
          employeeId,
          dateRange
        );
        records = history.map((r) => ({
          id: r.id,
          effective_from: r.effectiveFrom.toISOString().split("T")[0]!,
          effective_to: r.effectiveTo?.toISOString().split("T")[0] || null,
          data: {
            contract_type: r.contractType,
            employment_type: r.employmentType,
            fte: parseFloat(r.fte),
            working_hours_per_week: r.workingHoursPerWeek ? parseFloat(r.workingHoursPerWeek) : null,
            probation_end_date: r.probationEndDate?.toISOString().split("T")[0] || null,
            notice_period_days: r.noticePeriodDays,
          },
          created_at: r.createdAt.toISOString(),
          created_by: r.createdBy,
        }));
        break;
      }
      case "position": {
        const history = await this.repository.getEmployeePositionHistory(
          context,
          employeeId,
          dateRange
        );
        records = history.map((r) => ({
          id: r.id,
          effective_from: r.effectiveFrom.toISOString().split("T")[0]!,
          effective_to: r.effectiveTo?.toISOString().split("T")[0] || null,
          data: {
            position_id: r.positionId,
            position_code: r.positionCode,
            position_title: r.positionTitle,
            org_unit_id: r.orgUnitId,
            org_unit_name: r.orgUnitName,
            job_grade: r.jobGrade,
            is_primary: r.isPrimary,
            assignment_reason: r.assignmentReason,
          },
          created_at: r.createdAt.toISOString(),
          created_by: r.createdBy,
        }));
        break;
      }
      case "compensation": {
        const history = await this.repository.getEmployeeCompensationHistory(
          context,
          employeeId,
          dateRange
        );
        records = history.map((r) => ({
          id: r.id,
          effective_from: r.effectiveFrom.toISOString().split("T")[0]!,
          effective_to: r.effectiveTo?.toISOString().split("T")[0] || null,
          data: {
            base_salary: parseFloat(r.baseSalary),
            currency: r.currency,
            pay_frequency: r.payFrequency,
            change_reason: r.changeReason,
            change_percentage: r.changePercentage ? parseFloat(r.changePercentage) : null,
            approved_by: r.approvedBy,
            approved_at: r.approvedAt?.toISOString() || null,
          },
          created_at: r.createdAt.toISOString(),
          created_by: r.createdBy,
        }));
        break;
      }
      case "manager": {
        const history = await this.repository.getEmployeeManagerHistory(
          context,
          employeeId,
          dateRange
        );
        records = history.map((r) => ({
          id: r.id,
          effective_from: r.effectiveFrom.toISOString().split("T")[0]!,
          effective_to: r.effectiveTo?.toISOString().split("T")[0] || null,
          data: {
            manager_id: r.managerId,
            manager_number: r.managerNumber,
            manager_name: r.managerName,
            is_primary: r.isPrimary,
            relationship_type: r.relationshipType,
          },
          created_at: r.createdAt.toISOString(),
          created_by: r.createdBy,
        }));
        break;
      }
      case "status": {
        const history = await this.repository.getEmployeeStatusHistory(
          context,
          employeeId,
          dateRange
        );
        records = history.map((r) => ({
          id: r.id,
          effective_from: r.effectiveDate.toISOString().split("T")[0]!,
          effective_to: null,
          data: {
            from_status: r.fromStatus,
            to_status: r.toStatus,
            reason: r.reason,
          },
          created_at: r.createdAt.toISOString(),
          created_by: r.createdBy,
        }));
        break;
      }
      default:
        return {
          success: false,
          error: {
            code: "INVALID_DIMENSION",
            message: "Invalid history dimension",
            details: { dimension },
          },
        };
    }

    return {
      success: true,
      data: records,
    };
  }

  // ===========================================================================
  // Org Chart Methods
  // ===========================================================================

  /**
   * Get org chart data for visualization
   */
  async getOrgChart(
    context: TenantContext,
    rootEmployeeId?: string
  ): Promise<ServiceResult<{
    nodes: Array<{
      id: string;
      employee_id: string;
      name: string;
      title?: string;
      department?: string;
      photo_url?: string;
      manager_id?: string;
      level: number;
      direct_reports_count: number;
    }>;
    edges: Array<{
      from: string;
      to: string;
    }>;
  }>> {
    const nodes: Array<{
      id: string;
      employee_id: string;
      name: string;
      title?: string;
      department?: string;
      photo_url?: string;
      manager_id?: string;
      level: number;
      direct_reports_count: number;
    }> = [];
    const edges: Array<{ from: string; to: string }> = [];

    // Query org chart data
    const rows = await this.db.withTransaction(context, async (tx: any) => {
      return tx`
        WITH RECURSIVE org_tree AS (
          -- Base case: root employees (no manager or specific root)
          SELECT
            e.id,
            e.employee_number,
            ep.first_name,
            ep.last_name,
            p.title as position_title,
            ou.name as org_unit_name,
            NULL::uuid as manager_id,
            0 as level
          FROM app.employees e
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.effective_to IS NULL AND pa.is_primary = true
          LEFT JOIN app.positions p ON pa.position_id = p.id
          LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
          LEFT JOIN app.reporting_lines rl ON rl.employee_id = e.id AND rl.effective_to IS NULL AND rl.is_primary = true
          WHERE e.tenant_id = ${context.tenantId}::uuid
            AND e.status IN ('active', 'on_leave')
            ${rootEmployeeId
              ? tx`AND e.id = ${rootEmployeeId}::uuid`
              : tx`AND rl.manager_id IS NULL`}

          UNION ALL

          -- Recursive case: direct reports
          SELECT
            e.id,
            e.employee_number,
            ep.first_name,
            ep.last_name,
            p.title as position_title,
            ou.name as org_unit_name,
            rl.manager_id,
            ot.level + 1
          FROM app.employees e
          INNER JOIN app.reporting_lines rl ON rl.employee_id = e.id AND rl.effective_to IS NULL AND rl.is_primary = true
          INNER JOIN org_tree ot ON rl.manager_id = ot.id
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.effective_to IS NULL AND pa.is_primary = true
          LEFT JOIN app.positions p ON pa.position_id = p.id
          LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
          WHERE e.status IN ('active', 'on_leave')
            AND ot.level < 10
        ),
        report_counts AS (
          SELECT
            rl.manager_id,
            COUNT(*)::int as direct_reports_count
          FROM app.reporting_lines rl
          INNER JOIN app.employees e ON rl.employee_id = e.id
          WHERE rl.effective_to IS NULL
            AND rl.is_primary = true
            AND e.status IN ('active', 'on_leave')
          GROUP BY rl.manager_id
        )
        SELECT
          ot.id,
          ot.employee_number,
          ot.first_name,
          ot.last_name,
          ot.position_title,
          ot.org_unit_name,
          ot.manager_id,
          ot.level,
          COALESCE(rc.direct_reports_count, 0) as direct_reports_count
        FROM org_tree ot
        LEFT JOIN report_counts rc ON rc.manager_id = ot.id
        ORDER BY ot.level, ot.last_name
      `;
    });

    for (const row of rows) {
      nodes.push({
        id: row.id,
        employee_id: row.id,
        name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
        title: row.position_title || undefined,
        department: row.org_unit_name || undefined,
        photo_url: undefined,
        manager_id: row.manager_id || undefined,
        level: row.level,
        direct_reports_count: row.direct_reports_count,
      });

      if (row.manager_id) {
        edges.push({
          from: row.manager_id,
          to: row.id,
        });
      }
    }

    return {
      success: true,
      data: { nodes, edges },
    };
  }

  /**
   * Get direct reports for an employee
   */
  async getDirectReports(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<Array<{
    id: string;
    employee_id: string;
    name: string;
    title?: string;
    department?: string;
    photo_url?: string;
  }>>> {
    const employee = await this.repository.findEmployeeById(context, employeeId);
    if (!employee.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    const rows = await this.db.withTransaction(context, async (tx: any) => {
      return tx`
        SELECT
          e.id,
          ep.first_name,
          ep.last_name,
          p.title as position_title,
          ou.name as org_unit_name
        FROM app.employees e
        INNER JOIN app.reporting_lines rl ON rl.employee_id = e.id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.effective_to IS NULL
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.effective_to IS NULL AND pa.is_primary = true
        LEFT JOIN app.positions p ON pa.position_id = p.id
        LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
        WHERE rl.manager_id = ${employeeId}::uuid
          AND rl.effective_to IS NULL
          AND rl.is_primary = true
          AND e.status IN ('active', 'on_leave')
          AND e.tenant_id = ${context.tenantId}::uuid
        ORDER BY ep.last_name, ep.first_name
      `;
    });

    return {
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        employee_id: row.id,
        name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
        title: row.position_title || undefined,
        department: row.org_unit_name || undefined,
        photo_url: undefined,
      })),
    };
  }

  /**
   * Get reporting chain for an employee (up to CEO)
   */
  async getReportingChain(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<Array<{
    id: string;
    employee_id: string;
    name: string;
    title?: string;
    level: number;
  }>>> {
    const employee = await this.repository.findEmployeeById(context, employeeId);
    if (!employee.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    const rows = await this.db.withTransaction(context, async (tx: any) => {
      return tx`
        WITH RECURSIVE chain AS (
          -- Start with the employee
          SELECT
            e.id,
            ep.first_name,
            ep.last_name,
            p.title as position_title,
            rl.manager_id,
            0 as level
          FROM app.employees e
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.effective_to IS NULL AND pa.is_primary = true
          LEFT JOIN app.positions p ON pa.position_id = p.id
          LEFT JOIN app.reporting_lines rl ON rl.employee_id = e.id AND rl.effective_to IS NULL AND rl.is_primary = true
          WHERE e.id = ${employeeId}::uuid
            AND e.tenant_id = ${context.tenantId}::uuid

          UNION ALL

          -- Walk up the chain
          SELECT
            e.id,
            ep.first_name,
            ep.last_name,
            p.title as position_title,
            rl.manager_id,
            c.level + 1
          FROM app.employees e
          INNER JOIN chain c ON c.manager_id = e.id
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.effective_to IS NULL AND pa.is_primary = true
          LEFT JOIN app.positions p ON pa.position_id = p.id
          LEFT JOIN app.reporting_lines rl ON rl.employee_id = e.id AND rl.effective_to IS NULL AND rl.is_primary = true
          WHERE c.level < 20
        )
        SELECT * FROM chain ORDER BY level
      `;
    });

    return {
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        employee_id: row.id,
        name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
        title: row.position_title || undefined,
        level: row.level,
      })),
    };
  }

  // ===========================================================================
  // Mapping Helper
  // ===========================================================================

  mapEmployeeToResponse(
    result: {
      employee: EmployeeRow | null;
      personal: EmployeePersonalRow | null;
      contract: EmployeeContractRow | null;
      position: PositionAssignmentRow | null;
      compensation: CompensationRow | null;
      manager: ReportingLineRow | null;
    },
    tenure: number | null,
    annualSalary: number | null
  ): EmployeeResponse {
    const emp = result.employee!;
    const personal = result.personal;
    const contract = result.contract;
    const position = result.position;
    const compensation = result.compensation;
    const manager = result.manager;

    // Helper to safely convert date to YYYY-MM-DD string
    const toDateString = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString().split("T")[0]!;
      }
      if (typeof value === "string") {
        return value.includes("T") ? value.split("T")[0]! : value;
      }
      return "";
    };

    // Helper to safely convert to ISO string
    const toISOString = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === "string") {
        return value;
      }
      return new Date().toISOString();
    };

    // Handle both camelCase (TypeScript interface) and snake_case (PostgreSQL columns) for employee
    const rawEmp = emp as Record<string, unknown>;
    const tenantId = rawEmp.tenantId ?? rawEmp.tenant_id;
    const employeeNumber = rawEmp.employeeNumber ?? rawEmp.employee_number;
    const userId = rawEmp.userId ?? rawEmp.user_id;
    const hireDate = rawEmp.hireDate ?? rawEmp.hire_date;
    const terminationDate = rawEmp.terminationDate ?? rawEmp.termination_date;
    const terminationReason = rawEmp.terminationReason ?? rawEmp.termination_reason;
    const createdAt = rawEmp.createdAt ?? rawEmp.created_at;
    const updatedAt = rawEmp.updatedAt ?? rawEmp.updated_at;

    // Map personal data with snake_case fallbacks
    const mapPersonal = () => {
      if (!personal) return undefined;
      const rawPersonal = personal as Record<string, unknown>;
      const firstName = rawPersonal.firstName ?? rawPersonal.first_name ?? "";
      const lastName = rawPersonal.lastName ?? rawPersonal.last_name ?? "";
      const middleName = rawPersonal.middleName ?? rawPersonal.middle_name;
      const preferredName = rawPersonal.preferredName ?? rawPersonal.preferred_name;
      const dateOfBirth = rawPersonal.dateOfBirth ?? rawPersonal.date_of_birth;
      const maritalStatus = rawPersonal.maritalStatus ?? rawPersonal.marital_status;
      const effectiveFrom = rawPersonal.effectiveFrom ?? rawPersonal.effective_from;

      return {
        first_name: String(firstName),
        last_name: String(lastName),
        middle_name: middleName ? String(middleName) : null,
        preferred_name: preferredName ? String(preferredName) : null,
        full_name: middleName
          ? `${firstName} ${middleName} ${lastName}`
          : `${firstName} ${lastName}`,
        display_name: `${preferredName || firstName} ${lastName}`,
        date_of_birth: dateOfBirth ? toDateString(dateOfBirth) : null,
        gender: (rawPersonal.gender ?? null) as EmployeeResponse["personal"] extends { gender: infer G } ? G : never,
        marital_status: (maritalStatus ?? null) as EmployeeResponse["personal"] extends { marital_status: infer M } ? M : never,
        nationality: (rawPersonal.nationality ?? null) as string | null,
        effective_from: toDateString(effectiveFrom),
      };
    };

    // Map contract data with snake_case fallbacks
    const mapContract = () => {
      if (!contract) return undefined;
      const rawContract = contract as Record<string, unknown>;
      const contractType = rawContract.contractType ?? rawContract.contract_type;
      const employmentType = rawContract.employmentType ?? rawContract.employment_type;
      const workingHoursPerWeek = rawContract.workingHoursPerWeek ?? rawContract.working_hours_per_week;
      const probationEndDate = rawContract.probationEndDate ?? rawContract.probation_end_date;
      const noticePeriodDays = rawContract.noticePeriodDays ?? rawContract.notice_period_days;
      const effectiveFrom = rawContract.effectiveFrom ?? rawContract.effective_from;

      return {
        contract_type: String(contractType) as import("./schemas").ContractType,
        employment_type: String(employmentType) as import("./schemas").EmploymentType,
        fte: parseFloat(String(rawContract.fte)),
        working_hours_per_week: workingHoursPerWeek
          ? parseFloat(String(workingHoursPerWeek))
          : null,
        probation_end_date: probationEndDate ? toDateString(probationEndDate) : null,
        notice_period_days: noticePeriodDays ? Number(noticePeriodDays) : null,
        effective_from: toDateString(effectiveFrom),
      };
    };

    // Map position data with snake_case fallbacks
    const mapPosition = () => {
      if (!position) return undefined;
      const rawPosition = position as Record<string, unknown>;
      const positionId = rawPosition.positionId ?? rawPosition.position_id;
      const positionCode = rawPosition.positionCode ?? rawPosition.position_code;
      const positionTitle = rawPosition.positionTitle ?? rawPosition.position_title;
      const orgUnitId = rawPosition.orgUnitId ?? rawPosition.org_unit_id;
      const orgUnitName = rawPosition.orgUnitName ?? rawPosition.org_unit_name;
      const jobGrade = rawPosition.jobGrade ?? rawPosition.job_grade;
      const isPrimary = rawPosition.isPrimary ?? rawPosition.is_primary;
      const effectiveFrom = rawPosition.effectiveFrom ?? rawPosition.effective_from;

      return {
        position_id: String(positionId),
        position_code: positionCode ? String(positionCode) : "",
        position_title: positionTitle ? String(positionTitle) : "",
        org_unit_id: String(orgUnitId),
        org_unit_name: orgUnitName ? String(orgUnitName) : "",
        job_grade: jobGrade ? String(jobGrade) : null,
        is_primary: Boolean(isPrimary),
        effective_from: toDateString(effectiveFrom),
      };
    };

    // Map compensation data with snake_case fallbacks
    const mapCompensation = () => {
      if (!compensation) return undefined;
      const rawComp = compensation as Record<string, unknown>;
      const baseSalary = rawComp.baseSalary ?? rawComp.base_salary;
      const payFrequency = rawComp.payFrequency ?? rawComp.pay_frequency;
      const effectiveFrom = rawComp.effectiveFrom ?? rawComp.effective_from;

      return {
        base_salary: parseFloat(String(baseSalary)),
        currency: String(rawComp.currency),
        pay_frequency: String(payFrequency),
        annual_salary: annualSalary || parseFloat(String(baseSalary)) * 12,
        effective_from: toDateString(effectiveFrom),
      };
    };

    // Map manager data with snake_case fallbacks
    const mapManager = () => {
      if (!manager) return null;
      const rawManager = manager as Record<string, unknown>;
      const managerId = rawManager.managerId ?? rawManager.manager_id;
      const managerNumber = rawManager.managerNumber ?? rawManager.manager_number;
      const managerName = rawManager.managerName ?? rawManager.manager_name;
      const relationshipType = rawManager.relationshipType ?? rawManager.relationship_type;
      const isPrimary = rawManager.isPrimary ?? rawManager.is_primary;
      const effectiveFrom = rawManager.effectiveFrom ?? rawManager.effective_from;

      return {
        manager_id: String(managerId),
        manager_number: managerNumber ? String(managerNumber) : "",
        manager_name: managerName ? String(managerName) : "",
        relationship_type: String(relationshipType),
        is_primary: Boolean(isPrimary),
        effective_from: toDateString(effectiveFrom),
      };
    };

    return {
      id: emp.id,
      tenant_id: String(tenantId),
      employee_number: String(employeeNumber),
      user_id: userId ? String(userId) : null,
      status: emp.status,
      hire_date: toDateString(hireDate),
      termination_date: terminationDate ? toDateString(terminationDate) : null,
      termination_reason: terminationReason ? String(terminationReason) : null,
      tenure_years: tenure,
      personal: mapPersonal(),
      contract: mapContract(),
      position: mapPosition(),
      compensation: mapCompensation(),
      manager: mapManager(),
      created_at: toISOString(createdAt),
      updated_at: toISOString(updatedAt),
    };
  }

  // ===========================================================================
  // Concurrent Employment / Multi-Position Methods
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

  private mapPositionAssignmentToResponse(
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
