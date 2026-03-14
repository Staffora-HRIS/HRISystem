/**
 * Core HR Module - Service Layer
 *
 * Implements business logic for Core HR operations.
 * Enforces invariants, validates state machine transitions,
 * and emits domain events via the outbox pattern.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  HRRepository,
  OrgUnitRow,
  PositionRow,
  EmployeeRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateOrgUnit,
  UpdateOrgUnit,
  OrgUnitFilters,
  CreatePosition,
  UpdatePosition,
  PositionFilters,
  CreateEmployee,
  UpdateEmployeePersonal,
  UpdateEmployeeContract,
  UpdateEmployeePosition,
  UpdateEmployeeCompensation,
  UpdateEmployeeManager,
  EmployeeFilters,
  EmployeeStatus,
  EmployeeStatusTransition,
  EmployeeTermination,
  PaginationQuery,
  OrgUnitResponse,
  PositionResponse,
  EmployeeResponse,
  EmployeeListItem,
  HistoryDimension,
  HistoryRecord,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

/**
 * State machine transitions
 */
const VALID_STATUS_TRANSITIONS: Record<EmployeeStatus, EmployeeStatus[]> = {
  pending: ["active"],
  active: ["on_leave", "terminated"],
  on_leave: ["active", "terminated"],
  terminated: [],
};

/**
 * Domain event types
 */
type DomainEventType =
  | "hr.org_unit.created"
  | "hr.org_unit.updated"
  | "hr.org_unit.deleted"
  | "hr.position.created"
  | "hr.position.updated"
  | "hr.position.deleted"
  | "hr.employee.created"
  | "hr.employee.updated"
  | "hr.employee.transferred"
  | "hr.employee.promoted"
  | "hr.employee.terminated"
  | "hr.employee.status_changed"
  | "hr.employee.ni_category_changed"
  | "benefits.enrollment.ceased";

// =============================================================================
// HR Service
// =============================================================================

export class HRService {
  constructor(
    private repository: HRRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox
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

  // ===========================================================================
  // Stats
  // ===========================================================================

  async getStats(context: TenantContext) {
    return this.repository.getStats(context);
  }

  // ===========================================================================
  // Org Unit Business Logic
  // ===========================================================================

  /**
   * List org units with filters
   */
  async listOrgUnits(
    context: TenantContext,
    filters: OrgUnitFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<OrgUnitResponse>> {
    const result = await this.repository.findOrgUnits(context, filters, pagination);

    return {
      items: result.items.map(this.mapOrgUnitToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get org unit by ID
   */
  async getOrgUnit(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<OrgUnitResponse>> {
    const orgUnit = await this.repository.findOrgUnitById(context, id);

    if (!orgUnit) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Org unit not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapOrgUnitToResponse(orgUnit),
    };
  }

  /**
   * Get org unit hierarchy
   */
  async getOrgUnitHierarchy(
    context: TenantContext,
    rootId?: string
  ): Promise<ServiceResult<OrgUnitResponse[]>> {
    const orgUnits = await this.repository.getOrgUnitHierarchy(context, rootId);

    return {
      success: true,
      data: orgUnits.map(this.mapOrgUnitToResponse),
    };
  }

  /**
   * Create org unit
   */
  async createOrgUnit(
    context: TenantContext,
    data: CreateOrgUnit,
    idempotencyKey?: string
  ): Promise<ServiceResult<OrgUnitResponse>> {
    // Validate parent exists if specified
    if (data.parent_id) {
      const parent = await this.repository.findOrgUnitById(context, data.parent_id);
      if (!parent) {
        return {
          success: false,
          error: {
            code: "INVALID_PARENT",
            message: "Parent org unit not found",
            details: { parent_id: data.parent_id },
          },
        };
      }
      if (!parent.isActive) {
        return {
          success: false,
          error: {
            code: "INACTIVE_PARENT",
            message: "Cannot create org unit under inactive parent",
            details: { parent_id: data.parent_id },
          },
        };
      }
    }

    // Check for duplicate code
    const existing = await this.repository.findOrgUnitByCode(context, data.code);
    if (existing) {
      return {
        success: false,
        error: {
          code: "DUPLICATE_CODE",
          message: "Org unit with this code already exists",
          details: { code: data.code },
        },
      };
    }

    // Create org unit in transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      const orgUnit = await this.repository.createOrgUnit(
        tx,
        context,
        data,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "org_unit", orgUnit.id, "hr.org_unit.created", {
        orgUnit: this.mapOrgUnitToResponse(orgUnit),
      });

      return orgUnit;
    });

    return {
      success: true,
      data: this.mapOrgUnitToResponse(result),
    };
  }

  /**
   * Update org unit
   */
  async updateOrgUnit(
    context: TenantContext,
    id: string,
    data: UpdateOrgUnit,
    idempotencyKey?: string
  ): Promise<ServiceResult<OrgUnitResponse>> {
    // Check org unit exists
    const existing = await this.repository.findOrgUnitById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Org unit not found",
          details: { id },
        },
      };
    }

    // Validate parent change doesn't create circular hierarchy
    if (data.parent_id !== undefined && data.parent_id !== null) {
      // Check parent exists
      const parent = await this.repository.findOrgUnitById(context, data.parent_id);
      if (!parent) {
        return {
          success: false,
          error: {
            code: "INVALID_PARENT",
            message: "Parent org unit not found",
            details: { parent_id: data.parent_id },
          },
        };
      }

      // Check for circular hierarchy
      if (parent.path && parent.path.includes(id)) {
        return {
          success: false,
          error: {
            code: "CIRCULAR_HIERARCHY",
            message: "Cannot set parent that would create circular hierarchy",
            details: { parent_id: data.parent_id, org_unit_id: id },
          },
        };
      }
    }

    // Update in transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      const orgUnit = await this.repository.updateOrgUnit(
        tx,
        context,
        id,
        data,
        context.userId || "system"
      );

      if (!orgUnit) {
        throw new Error("Failed to update org unit");
      }

      // Emit event
      await this.emitEvent(tx, context, "org_unit", id, "hr.org_unit.updated", {
        orgUnit: this.mapOrgUnitToResponse(orgUnit),
        changes: data,
      });

      return orgUnit;
    });

    return {
      success: true,
      data: this.mapOrgUnitToResponse(result),
    };
  }

  /**
   * Delete org unit (soft delete)
   */
  async deleteOrgUnit(
    context: TenantContext,
    id: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Check org unit exists
    const existing = await this.repository.findOrgUnitById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Org unit not found",
          details: { id },
        },
      };
    }

    // Check for children
    const hasChildren = await this.repository.orgUnitHasChildren(context, id);
    if (hasChildren) {
      return {
        success: false,
        error: {
          code: "HAS_CHILDREN",
          message: "Cannot delete org unit with active children",
          details: { id },
        },
      };
    }

    // Check for employees
    const hasEmployees = await this.repository.orgUnitHasEmployees(context, id);
    if (hasEmployees) {
      return {
        success: false,
        error: {
          code: "HAS_EMPLOYEES",
          message: "Cannot delete org unit with active employees",
          details: { id },
        },
      };
    }

    // Delete in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deleteOrgUnit(tx, context, id);

      // Emit event
      await this.emitEvent(tx, context, "org_unit", id, "hr.org_unit.deleted", {
        orgUnitId: id,
      });
    });

    return { success: true };
  }

  // ===========================================================================
  // Position Business Logic
  // ===========================================================================

  /**
   * List positions with filters
   */
  async listPositions(
    context: TenantContext,
    filters: PositionFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<PositionResponse>> {
    const result = await this.repository.findPositions(context, filters, pagination);

    return {
      items: result.items.map(this.mapPositionToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get position by ID
   */
  async getPosition(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<PositionResponse>> {
    const position = await this.repository.findPositionById(context, id);

    if (!position) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Position not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapPositionToResponse(position),
    };
  }

  /**
   * Create position
   */
  async createPosition(
    context: TenantContext,
    data: CreatePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<PositionResponse>> {
    // Validate org unit exists
    const orgUnit = await this.repository.findOrgUnitById(context, data.org_unit_id);
    if (!orgUnit) {
      return {
        success: false,
        error: {
          code: "INVALID_ORG_UNIT",
          message: "Org unit not found",
          details: { org_unit_id: data.org_unit_id },
        },
      };
    }

    // Validate salary range
    if (data.min_salary !== undefined && data.max_salary !== undefined) {
      if (data.min_salary > data.max_salary) {
        return {
          success: false,
          error: {
            code: "INVALID_SALARY_RANGE",
            message: "Minimum salary cannot exceed maximum salary",
            details: { min_salary: data.min_salary, max_salary: data.max_salary },
          },
        };
      }
    }

    // Create in transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      const position = await this.repository.createPosition(
        tx,
        context,
        data,
        context.userId || "system"
      );

      // Emit event
      await this.emitEvent(tx, context, "position", position.id, "hr.position.created", {
        position: this.mapPositionToResponse(position),
      });

      return position;
    });

    return {
      success: true,
      data: this.mapPositionToResponse(result),
    };
  }

  /**
   * Update position
   */
  async updatePosition(
    context: TenantContext,
    id: string,
    data: UpdatePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<PositionResponse>> {
    // Check position exists
    const existing = await this.repository.findPositionById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Position not found",
          details: { id },
        },
      };
    }

    // Validate org unit if changing
    if (data.org_unit_id) {
      const orgUnit = await this.repository.findOrgUnitById(context, data.org_unit_id);
      if (!orgUnit) {
        return {
          success: false,
          error: {
            code: "INVALID_ORG_UNIT",
            message: "Org unit not found",
            details: { org_unit_id: data.org_unit_id },
          },
        };
      }
    }

    // Update in transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      const position = await this.repository.updatePosition(
        tx,
        context,
        id,
        data,
        context.userId || "system"
      );

      if (!position) {
        throw new Error("Failed to update position");
      }

      // Emit event
      await this.emitEvent(tx, context, "position", id, "hr.position.updated", {
        position: this.mapPositionToResponse(position),
        changes: data,
      });

      return position;
    });

    return {
      success: true,
      data: this.mapPositionToResponse(result),
    };
  }

  /**
   * Delete position (soft delete)
   */
  async deletePosition(
    context: TenantContext,
    id: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    // Check position exists
    const existing = await this.repository.findPositionById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Position not found",
          details: { id },
        },
      };
    }

    // Check for active assignments
    const hasAssignments = await this.repository.positionHasActiveAssignments(context, id);
    if (hasAssignments) {
      return {
        success: false,
        error: {
          code: "HAS_ASSIGNMENTS",
          message: "Cannot delete position with active assignments",
          details: { id },
        },
      };
    }

    // Delete in transaction
    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deletePosition(tx, context, id);

      // Emit event
      await this.emitEvent(tx, context, "position", id, "hr.position.deleted", {
        positionId: id,
      });
    });

    return { success: true };
  }

  // ===========================================================================
  // Employee Business Logic
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

    if (employeeResult.employee.status === "terminated") {
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

    if (employeeResult.employee.status === "terminated") {
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

    if (employeeResult.employee.status === "terminated") {
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

    if (employeeResult.employee.status === "terminated") {
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

    if (employeeResult.employee.status === "terminated") {
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

    if (employeeResult.employee.status === "terminated") {
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

    // Validate state machine transition
    const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    if (!validTransitions.includes(data.to_status)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INVALID_LIFECYCLE_TRANSITION,
          message: `Cannot transition from ${currentStatus} to ${data.to_status}`,
          details: {
            current_status: currentStatus,
            requested_status: data.to_status,
            valid_transitions: validTransitions,
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
    if (currentStatus === "terminated") {
      return {
        success: false,
        error: {
          code: "ALREADY_TERMINATED",
          message: "Employee is already terminated",
          details: { id: employeeId },
        },
      };
    }

    if (currentStatus === "pending") {
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
    if (employeeResult.employee.status === "terminated") {
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
    const hireDate = new Date(employee.hireDate);
    const referenceDate = employee.terminationDate
      ? new Date(employee.terminationDate)
      : new Date();

    // Calculate months and years of service
    const diffMs = referenceDate.getTime() - hireDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const monthsOfService = Math.floor(diffDays / 30.44); // average days per month
    const yearsOfService = Math.floor(diffDays / 365.25);

    // Statutory notice weeks (Employment Rights Act 1996, s.86)
    let statutoryNoticeWeeks: number;
    if (monthsOfService < 1) {
      statutoryNoticeWeeks = 0;
    } else if (yearsOfService < 2) {
      statutoryNoticeWeeks = 1;
    } else {
      statutoryNoticeWeeks = Math.min(yearsOfService, 12);
    }

    const statutoryNoticeDays = statutoryNoticeWeeks * 7;

    // Get current contractual notice period
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

    const contractualNoticeDays = contractRows[0]?.noticePeriodDays ?? null;

    // Compliance: contractual must be >= statutory (employer-to-employee notice)
    const isCompliant = contractualNoticeDays === null
      ? statutoryNoticeWeeks === 0 // no contract needed if < 1 month
      : contractualNoticeDays >= statutoryNoticeDays;

    let complianceMessage: string;
    if (monthsOfService < 1) {
      complianceMessage = "Employee has less than 1 month service — no statutory notice entitlement yet.";
    } else if (contractualNoticeDays === null) {
      complianceMessage = `No contractual notice period set. Statutory minimum is ${statutoryNoticeWeeks} week(s).`;
    } else if (isCompliant) {
      complianceMessage = `Contractual notice (${contractualNoticeDays} days) meets or exceeds statutory minimum (${statutoryNoticeDays} days / ${statutoryNoticeWeeks} weeks).`;
    } else {
      complianceMessage = `NON-COMPLIANT: Contractual notice (${contractualNoticeDays} days) is below statutory minimum (${statutoryNoticeDays} days / ${statutoryNoticeWeeks} weeks). Update the employment contract.`;
    }

    return {
      success: true,
      data: {
        employee_id: employeeId,
        hire_date: employee.hireDate,
        reference_date: referenceDate.toISOString().split("T")[0],
        years_of_service: yearsOfService,
        months_of_service: monthsOfService,
        statutory_notice_weeks: statutoryNoticeWeeks,
        statutory_notice_days: statutoryNoticeDays,
        contractual_notice_days: contractualNoticeDays ?? null,
        is_compliant: isCompliant,
        compliance_message: complianceMessage,
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
  // Mapping Helpers
  // ===========================================================================

  private mapOrgUnitToResponse(row: OrgUnitRow): OrgUnitResponse {
    const formatDateOnly = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString().split("T")[0]!;
      }

      if (typeof value === "string") {
        return value.includes("T") ? value.split("T")[0]! : value;
      }

      return "";
    };

    const formatDateTime = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString();
      }

      if (typeof value === "string") {
        return value;
      }

      return new Date(0).toISOString();
    };

    const effectiveFromRaw = (row as any).effectiveFrom ?? (row as any).effective_from;
    const effectiveToRaw = (row as any).effectiveTo ?? (row as any).effective_to;
    const createdAtRaw = (row as any).createdAt ?? (row as any).created_at;
    const updatedAtRaw = (row as any).updatedAt ?? (row as any).updated_at;

    const tenantIdRaw = (row as any).tenantId ?? (row as any).tenant_id;
    const parentIdRaw = (row as any).parentId ?? (row as any).parent_id ?? null;
    const managerPositionIdRaw =
      (row as any).managerPositionId ?? (row as any).manager_position_id ?? null;
    const costCenterIdRaw = (row as any).costCenterId ?? (row as any).cost_center_id ?? null;
    const isActiveRaw = (row as any).isActive ?? (row as any).is_active;

    return {
      id: row.id,
      tenant_id: tenantIdRaw,
      parent_id: parentIdRaw,
      code: row.code,
      name: row.name,
      description: row.description,
      level: row.level,
      path: row.path,
      manager_position_id: managerPositionIdRaw,
      cost_center_id: costCenterIdRaw,
      is_active: typeof isActiveRaw === "boolean" ? isActiveRaw : true,
      effective_from: formatDateOnly(effectiveFromRaw),
      effective_to: effectiveToRaw ? formatDateOnly(effectiveToRaw) : null,
      created_at: formatDateTime(createdAtRaw),
      updated_at: formatDateTime(updatedAtRaw),
    };
  }

  private mapPositionToResponse(row: PositionRow): PositionResponse {
    // Handle both camelCase (TypeScript interface) and snake_case (PostgreSQL columns)
    // PostgreSQL returns snake_case, but our interface expects camelCase
    const rawRow = row as Record<string, unknown>;

    const tenantId = rawRow.tenantId ?? rawRow.tenant_id;
    const orgUnitId = rawRow.orgUnitId ?? rawRow.org_unit_id;
    const orgUnitName = rawRow.orgUnitName ?? rawRow.org_unit_name;
    const jobGrade = rawRow.jobGrade ?? rawRow.job_grade;
    const minSalary = rawRow.minSalary ?? rawRow.min_salary;
    const maxSalary = rawRow.maxSalary ?? rawRow.max_salary;
    const isManager = rawRow.isManager ?? rawRow.is_manager;
    const currentHeadcount = rawRow.currentHeadcount ?? rawRow.current_headcount;
    const reportsToPositionId = rawRow.reportsToPositionId ?? rawRow.reports_to_position_id;
    const isActive = rawRow.isActive ?? rawRow.is_active;
    const createdAt = rawRow.createdAt ?? rawRow.created_at;
    const updatedAt = rawRow.updatedAt ?? rawRow.updated_at;

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

    return {
      id: row.id,
      tenant_id: String(tenantId),
      code: row.code,
      title: row.title,
      description: row.description,
      org_unit_id: orgUnitId ? String(orgUnitId) : null,
      org_unit_name: orgUnitName ? String(orgUnitName) : undefined,
      job_grade: jobGrade ? String(jobGrade) : null,
      min_salary: minSalary ? parseFloat(String(minSalary)) : null,
      max_salary: maxSalary ? parseFloat(String(maxSalary)) : null,
      currency: row.currency,
      is_manager: Boolean(isManager),
      headcount: row.headcount,
      current_headcount: currentHeadcount != null ? Number(currentHeadcount) : undefined,
      reports_to_position_id: reportsToPositionId ? String(reportsToPositionId) : null,
      is_active: isActive !== false,
      created_at: toISOString(createdAt),
      updated_at: toISOString(updatedAt),
    };
  }

  private mapEmployeeToResponse(
    result: {
      employee: EmployeeRow | null;
      personal: import("./repository").EmployeePersonalRow | null;
      contract: import("./repository").EmployeeContractRow | null;
      position: import("./repository").PositionAssignmentRow | null;
      compensation: import("./repository").CompensationRow | null;
      manager: import("./repository").ReportingLineRow | null;
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
}
