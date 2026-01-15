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
  TenantContext,
  OrgUnitRow,
  PositionRow,
  EmployeeRow,
} from "./repository";
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
 * Service result type
 */
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Paginated service result
 */
export interface PaginatedServiceResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

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
  | "hr.employee.status_changed";

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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
      items: result.items.map((emp) => ({
        id: emp.id,
        employee_number: emp.employeeNumber,
        status: emp.status,
        hire_date: emp.hireDate.toISOString().split("T")[0]!,
        full_name: emp.fullName || "",
        display_name: emp.displayName || "",
        position_title: emp.positionTitle,
        org_unit_name: emp.orgUnitName,
        manager_name: emp.managerName,
      })),
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
          code: "INVALID_TRANSITION",
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
          code: "NOT_FOUND",
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

      // Emit event
      await this.emitEvent(tx, context, "employee", employeeId, "hr.employee.terminated", {
        employeeId,
        terminationDate: data.termination_date,
        reason: data.reason,
      });
    });

    return this.getEmployee(context, employeeId);
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
          code: "NOT_FOUND",
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
    return {
      id: row.id,
      tenant_id: row.tenantId,
      code: row.code,
      title: row.title,
      description: row.description,
      org_unit_id: row.orgUnitId,
      org_unit_name: row.orgUnitName,
      job_grade: row.jobGrade,
      min_salary: row.minSalary ? parseFloat(row.minSalary) : null,
      max_salary: row.maxSalary ? parseFloat(row.maxSalary) : null,
      currency: row.currency,
      is_manager: row.isManager,
      headcount: row.headcount,
      current_headcount: row.currentHeadcount,
      reports_to_position_id: row.reportsToPositionId,
      is_active: row.isActive,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
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

    return {
      id: emp.id,
      tenant_id: emp.tenantId,
      employee_number: emp.employeeNumber,
      user_id: emp.userId,
      status: emp.status,
      hire_date: emp.hireDate.toISOString().split("T")[0]!,
      termination_date: emp.terminationDate?.toISOString().split("T")[0] || null,
      termination_reason: emp.terminationReason,
      tenure_years: tenure,
      personal: personal
        ? {
            first_name: personal.firstName,
            last_name: personal.lastName,
            middle_name: personal.middleName,
            preferred_name: personal.preferredName,
            full_name: personal.middleName
              ? `${personal.firstName} ${personal.middleName} ${personal.lastName}`
              : `${personal.firstName} ${personal.lastName}`,
            display_name: `${personal.preferredName || personal.firstName} ${personal.lastName}`,
            date_of_birth: personal.dateOfBirth?.toISOString().split("T")[0] || null,
            gender: personal.gender as EmployeeResponse["personal"] extends { gender: infer G } ? G : never,
            marital_status: personal.maritalStatus as EmployeeResponse["personal"] extends { marital_status: infer M } ? M : never,
            nationality: personal.nationality,
            effective_from: personal.effectiveFrom.toISOString().split("T")[0]!,
          }
        : undefined,
      contract: contract
        ? {
            contract_type: contract.contractType as import("./schemas").ContractType,
            employment_type: contract.employmentType as import("./schemas").EmploymentType,
            fte: parseFloat(contract.fte),
            working_hours_per_week: contract.workingHoursPerWeek
              ? parseFloat(contract.workingHoursPerWeek)
              : null,
            probation_end_date: contract.probationEndDate?.toISOString().split("T")[0] || null,
            notice_period_days: contract.noticePeriodDays,
            effective_from: contract.effectiveFrom.toISOString().split("T")[0]!,
          }
        : undefined,
      position: position
        ? {
            position_id: position.positionId,
            position_code: position.positionCode || "",
            position_title: position.positionTitle || "",
            org_unit_id: position.orgUnitId,
            org_unit_name: position.orgUnitName || "",
            job_grade: position.jobGrade || null,
            is_primary: position.isPrimary,
            effective_from: position.effectiveFrom.toISOString().split("T")[0]!,
          }
        : undefined,
      compensation: compensation
        ? {
            base_salary: parseFloat(compensation.baseSalary),
            currency: compensation.currency,
            pay_frequency: compensation.payFrequency,
            annual_salary: annualSalary || parseFloat(compensation.baseSalary) * 12,
            effective_from: compensation.effectiveFrom.toISOString().split("T")[0]!,
          }
        : undefined,
      manager: manager
        ? {
            manager_id: manager.managerId,
            manager_number: manager.managerNumber || "",
            manager_name: manager.managerName || "",
            relationship_type: manager.relationshipType,
            is_primary: manager.isPrimary,
            effective_from: manager.effectiveFrom.toISOString().split("T")[0]!,
          }
        : null,
      created_at: emp.createdAt.toISOString(),
      updated_at: emp.updatedAt.toISOString(),
    };
  }
}
