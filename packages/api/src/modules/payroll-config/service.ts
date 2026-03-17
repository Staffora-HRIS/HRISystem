/**
 * Payroll Config Module - Service Layer
 *
 * Implements business logic for pay schedules, employee pay assignments,
 * and NI category tracking. Enforces invariants and emits domain events
 * via the outbox pattern.
 *
 * Key rules:
 * - Weekly/fortnightly/four_weekly schedules require pay_day_of_week
 * - Monthly/annually schedules require pay_day_of_month
 * - Only one default schedule per tenant
 * - Employee pay assignments are effective-dated with overlap prevention
 * - NI categories are effective-dated with overlap prevention
 * - All writes emit domain events in the same transaction
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  PayrollConfigRepository,
  PayScheduleRow,
  PayAssignmentRow,
  NiCategoryRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreatePaySchedule,
  UpdatePaySchedule,
  CreatePayAssignment,
  UpdatePayAssignment,
  CreateNiCategory,
  UpdateNiCategory,
  PayScheduleResponse,
  PayAssignmentResponse,
  NiCategoryResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "payroll.schedule.created"
  | "payroll.schedule.updated"
  | "payroll.assignment.created"
  | "payroll.assignment.updated"
  | "payroll.assignment.deleted"
  | "payroll.ni_category.created"
  | "payroll.ni_category.updated"
  | "payroll.ni_category.deleted";

// =============================================================================
// Service
// =============================================================================

export class PayrollConfigService {
  constructor(
    private repository: PayrollConfigRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox within the same transaction
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
  // Mappers
  // ===========================================================================

  /**
   * Map a pay schedule database row to the API response shape
   */
  private mapScheduleToResponse(row: PayScheduleRow): PayScheduleResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      name: row.name,
      frequency: row.frequency,
      pay_day_of_week: row.payDayOfWeek,
      pay_day_of_month: row.payDayOfMonth,
      tax_week_start: row.taxWeekStart
        ? row.taxWeekStart instanceof Date
          ? row.taxWeekStart.toISOString().split("T")[0]
          : String(row.taxWeekStart)
        : null,
      is_default: row.isDefault,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  /**
   * Map an employee pay assignment row to the API response shape
   */
  private mapAssignmentToResponse(row: PayAssignmentRow): PayAssignmentResponse {
    const response: PayAssignmentResponse = {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      pay_schedule_id: row.payScheduleId,
      effective_from: row.effectiveFrom instanceof Date
        ? row.effectiveFrom.toISOString().split("T")[0]
        : String(row.effectiveFrom),
      effective_to: row.effectiveTo
        ? row.effectiveTo instanceof Date
          ? row.effectiveTo.toISOString().split("T")[0]
          : String(row.effectiveTo)
        : null,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };

    if (row.scheduleName) {
      response.schedule_name = row.scheduleName;
    }
    if (row.scheduleFrequency) {
      response.schedule_frequency = row.scheduleFrequency;
    }

    return response;
  }

  /**
   * Map an NI category row to the API response shape
   */
  private mapNiCategoryToResponse(row: NiCategoryRow): NiCategoryResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      category_letter: row.categoryLetter,
      effective_from: row.effectiveFrom instanceof Date
        ? row.effectiveFrom.toISOString().split("T")[0]
        : String(row.effectiveFrom),
      effective_to: row.effectiveTo
        ? row.effectiveTo instanceof Date
          ? row.effectiveTo.toISOString().split("T")[0]
          : String(row.effectiveTo)
        : null,
      notes: row.notes,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  // ===========================================================================
  // Pay Schedules
  // ===========================================================================

  /**
   * Validate pay day consistency against frequency.
   * Weekly-type frequencies require pay_day_of_week.
   * Monthly/annually require pay_day_of_month.
   */
  private validatePayDayConsistency(
    frequency: string,
    payDayOfWeek: number | null | undefined,
    payDayOfMonth: number | null | undefined
  ): string | null {
    const weeklyTypes = ["weekly", "fortnightly", "four_weekly"];
    const monthlyTypes = ["monthly", "annually"];

    if (weeklyTypes.includes(frequency)) {
      if (payDayOfWeek === null || payDayOfWeek === undefined) {
        return `pay_day_of_week is required for ${frequency} frequency`;
      }
    }
    if (monthlyTypes.includes(frequency)) {
      if (payDayOfMonth === null || payDayOfMonth === undefined) {
        return `pay_day_of_month is required for ${frequency} frequency`;
      }
    }

    return null;
  }

  /**
   * Create a new pay schedule.
   *
   * Validates:
   * - Pay day consistency with frequency
   * - Unique schedule name per tenant
   * - Only one default schedule per tenant (clears existing default)
   */
  async createPaySchedule(
    context: TenantContext,
    data: CreatePaySchedule,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PayScheduleResponse>> {
    // Validate pay day consistency
    const validationError = this.validatePayDayConsistency(
      data.frequency,
      data.pay_day_of_week ?? null,
      data.pay_day_of_month ?? null
    );
    if (validationError) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: validationError,
          details: {
            frequency: data.frequency,
            pay_day_of_week: data.pay_day_of_week,
            pay_day_of_month: data.pay_day_of_month,
          },
        },
      };
    }

    // Check for duplicate name
    const nameExists = await this.repository.payScheduleNameExists(
      context,
      data.name
    );
    if (nameExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: `A pay schedule named "${data.name}" already exists`,
          details: { name: data.name },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      // If this schedule is being set as default, clear any existing default
      if (data.is_default) {
        // We need a placeholder ID; the clearDefaultExcept will be called after insert
      }

      const row = await this.repository.createPaySchedule(context, data, tx);

      // If this is the new default, clear the old default
      if (data.is_default) {
        await this.repository.clearDefaultExcept(context, row.id, tx);
      }

      // Emit domain event in the same transaction
      await this.emitEvent(
        tx,
        context,
        "pay_schedule",
        row.id,
        "payroll.schedule.created",
        { schedule: this.mapScheduleToResponse(row) }
      );

      return {
        success: true,
        data: this.mapScheduleToResponse(row),
      };
    });
  }

  /**
   * Get a single pay schedule by ID.
   */
  async getPayScheduleById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<PayScheduleResponse>> {
    const row = await this.repository.findPayScheduleById(context, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Pay schedule ${id} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapScheduleToResponse(row),
    };
  }

  /**
   * List all pay schedules for the tenant
   */
  async listPaySchedules(
    context: TenantContext,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<PayScheduleResponse>> {
    const result = await this.repository.findAllPaySchedules(context, pagination);
    return {
      items: result.items.map((row) => this.mapScheduleToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Update an existing pay schedule.
   *
   * Validates:
   * - Schedule exists
   * - Pay day consistency (if frequency is being changed)
   * - Unique name per tenant (if name is being changed)
   * - Default flag management
   */
  async updatePaySchedule(
    context: TenantContext,
    id: string,
    data: UpdatePaySchedule,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PayScheduleResponse>> {
    // Fetch existing schedule to merge values for validation
    const existing = await this.repository.findPayScheduleById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Pay schedule ${id} not found`,
        },
      };
    }

    // Determine effective values after the update
    const effectiveFrequency = data.frequency ?? existing.frequency;
    const effectivePayDayOfWeek = data.pay_day_of_week !== undefined
      ? data.pay_day_of_week
      : existing.payDayOfWeek;
    const effectivePayDayOfMonth = data.pay_day_of_month !== undefined
      ? data.pay_day_of_month
      : existing.payDayOfMonth;

    // Validate pay day consistency with the effective frequency
    const validationError = this.validatePayDayConsistency(
      effectiveFrequency,
      effectivePayDayOfWeek,
      effectivePayDayOfMonth
    );
    if (validationError) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: validationError,
          details: {
            frequency: effectiveFrequency,
            pay_day_of_week: effectivePayDayOfWeek,
            pay_day_of_month: effectivePayDayOfMonth,
          },
        },
      };
    }

    // Check name uniqueness (if name is being changed)
    if (data.name && data.name !== existing.name) {
      const nameExists = await this.repository.payScheduleNameExists(
        context,
        data.name,
        id
      );
      if (nameExists) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: `A pay schedule named "${data.name}" already exists`,
            details: { name: data.name },
          },
        };
      }
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.updatePaySchedule(context, id, data, tx);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Pay schedule ${id} not found`,
          },
        };
      }

      // If this schedule is now the default, clear the old default
      if (data.is_default === true) {
        await this.repository.clearDefaultExcept(context, id, tx);
      }

      // Emit domain event
      await this.emitEvent(
        tx,
        context,
        "pay_schedule",
        row.id,
        "payroll.schedule.updated",
        {
          schedule: this.mapScheduleToResponse(row),
          previous: this.mapScheduleToResponse(existing),
        }
      );

      return {
        success: true,
        data: this.mapScheduleToResponse(row),
      };
    });
  }

  // ===========================================================================
  // Employee Pay Assignments
  // ===========================================================================

  /**
   * Assign an employee to a pay schedule.
   *
   * Validates:
   * - The referenced pay schedule exists
   * - No overlapping assignment for the same employee in the date range
   * - effective_to >= effective_from (if provided)
   */
  async createPayAssignment(
    context: TenantContext,
    data: CreatePayAssignment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PayAssignmentResponse>> {
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

    // Verify pay schedule exists
    const schedule = await this.repository.findPayScheduleById(
      context,
      data.pay_schedule_id
    );
    if (!schedule) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Pay schedule ${data.pay_schedule_id} not found`,
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      // Check for overlapping assignments
      const hasOverlap = await this.repository.hasOverlappingPayAssignment(
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
              "Employee already has a pay schedule assignment that overlaps with the given date range",
            details: {
              employee_id: data.employee_id,
              effective_from: data.effective_from,
              effective_to: data.effective_to,
            },
          },
        };
      }

      const row = await this.repository.createPayAssignment(context, data, tx);

      // Emit domain event
      await this.emitEvent(
        tx,
        context,
        "employee_pay_assignment",
        row.id,
        "payroll.assignment.created",
        {
          assignment: this.mapAssignmentToResponse(row),
          employee_id: data.employee_id,
          pay_schedule_id: data.pay_schedule_id,
        }
      );

      return {
        success: true,
        data: this.mapAssignmentToResponse(row),
      };
    });
  }

  /**
   * Get all pay assignments for an employee (current and historical)
   */
  async getPayAssignmentsByEmployee(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<PayAssignmentResponse[]>> {
    const rows = await this.repository.findPayAssignmentsByEmployee(
      context,
      employeeId
    );

    return {
      success: true,
      data: rows.map((row) => this.mapAssignmentToResponse(row)),
    };
  }

  /**
   * Get a single pay assignment by ID.
   */
  async getPayAssignmentById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<PayAssignmentResponse>> {
    const row = await this.repository.findPayAssignmentById(context, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Pay assignment ${id} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapAssignmentToResponse(row),
    };
  }

  /**
   * Get the current (active) pay assignment for an employee.
   * Returns the record where effective_from <= today and
   * (effective_to IS NULL OR effective_to >= today).
   */
  async getCurrentPayAssignment(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<PayAssignmentResponse | null>> {
    const row = await this.repository.findCurrentPayAssignment(
      context,
      employeeId
    );

    return {
      success: true,
      data: row ? this.mapAssignmentToResponse(row) : null,
    };
  }

  /**
   * Update an existing pay assignment.
   *
   * Common use cases:
   * - End an assignment by setting effective_to (e.g., employee changes schedule)
   * - Reassign to a different pay schedule
   * - Adjust effective dates
   *
   * Validates:
   * - Assignment exists
   * - If pay_schedule_id is changing, the new schedule exists
   * - effective_to >= effective_from (considering merged values)
   * - No overlapping assignments (excluding self)
   */
  async updatePayAssignment(
    context: TenantContext,
    id: string,
    data: UpdatePayAssignment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PayAssignmentResponse>> {
    // Fetch existing record to merge values for validation
    const existing = await this.repository.findPayAssignmentById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Pay assignment ${id} not found`,
        },
      };
    }

    // If changing the pay schedule, verify the new one exists
    if (data.pay_schedule_id && data.pay_schedule_id !== existing.payScheduleId) {
      const schedule = await this.repository.findPayScheduleById(
        context,
        data.pay_schedule_id
      );
      if (!schedule) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Pay schedule ${data.pay_schedule_id} not found`,
          },
        };
      }
    }

    // Determine effective values after the update
    const effectiveFrom = data.effective_from
      ?? (existing.effectiveFrom instanceof Date
        ? existing.effectiveFrom.toISOString().split("T")[0]
        : String(existing.effectiveFrom));

    const effectiveTo = data.effective_to !== undefined
      ? data.effective_to
      : existing.effectiveTo
        ? existing.effectiveTo instanceof Date
          ? existing.effectiveTo.toISOString().split("T")[0]
          : String(existing.effectiveTo)
        : null;

    // Validate effective_to >= effective_from
    if (effectiveTo && effectiveTo < effectiveFrom) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "effective_to must be on or after effective_from",
          details: {
            effective_from: effectiveFrom,
            effective_to: effectiveTo,
          },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      // Check for overlapping assignments (excluding current record)
      const hasOverlap = await this.repository.hasOverlappingPayAssignment(
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
              "Employee already has a pay schedule assignment that overlaps with the given date range",
            details: {
              employee_id: existing.employeeId,
              effective_from: effectiveFrom,
              effective_to: effectiveTo,
            },
          },
        };
      }

      const row = await this.repository.updatePayAssignment(context, id, data, tx);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Pay assignment ${id} not found`,
          },
        };
      }

      // Emit domain event
      await this.emitEvent(
        tx,
        context,
        "employee_pay_assignment",
        row.id,
        "payroll.assignment.updated",
        {
          assignment: this.mapAssignmentToResponse(row),
          previous: this.mapAssignmentToResponse(existing),
          employee_id: existing.employeeId,
        }
      );

      return {
        success: true,
        data: this.mapAssignmentToResponse(row),
      };
    });
  }

  /**
   * Delete a pay assignment.
   *
   * Validates:
   * - Assignment exists
   * Emits a domain event for audit trail.
   */
  async deletePayAssignment(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<{ deleted: true }>> {
    // Verify record exists first
    const existing = await this.repository.findPayAssignmentById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Pay assignment ${id} not found`,
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const deleted = await this.repository.deletePayAssignment(context, id, tx);

      if (!deleted) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Pay assignment ${id} not found`,
          },
        };
      }

      // Emit domain event
      await this.emitEvent(
        tx,
        context,
        "employee_pay_assignment",
        id,
        "payroll.assignment.deleted",
        {
          assignment: this.mapAssignmentToResponse(deleted),
          employee_id: deleted.employeeId,
        }
      );

      return {
        success: true,
        data: { deleted: true as const },
      };
    });
  }

  // ===========================================================================
  // NI Categories
  // ===========================================================================

  /**
   * Set an NI category for an employee.
   *
   * Validates:
   * - No overlapping NI category record for the same employee in the date range
   * - effective_to >= effective_from (if provided)
   */
  async createNiCategory(
    context: TenantContext,
    data: CreateNiCategory,
    _idempotencyKey?: string
  ): Promise<ServiceResult<NiCategoryResponse>> {
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
      // Check for overlapping NI categories
      const hasOverlap = await this.repository.hasOverlappingNiCategory(
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
              "Employee already has an NI category record that overlaps with the given date range",
            details: {
              employee_id: data.employee_id,
              effective_from: data.effective_from,
              effective_to: data.effective_to,
            },
          },
        };
      }

      const row = await this.repository.createNiCategory(context, data, tx);

      // Emit domain event
      await this.emitEvent(
        tx,
        context,
        "ni_category",
        row.id,
        "payroll.ni_category.created",
        {
          ni_category: this.mapNiCategoryToResponse(row),
          employee_id: data.employee_id,
        }
      );

      return {
        success: true,
        data: this.mapNiCategoryToResponse(row),
      };
    });
  }

  /**
   * Get a single NI category record by ID.
   */
  async getNiCategoryById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<NiCategoryResponse>> {
    const row = await this.repository.findNiCategoryById(context, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `NI category record ${id} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapNiCategoryToResponse(row),
    };
  }

  /**
   * Get all NI categories for an employee (current and historical)
   */
  async getNiCategoriesByEmployee(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<NiCategoryResponse[]>> {
    const rows = await this.repository.findNiCategoriesByEmployee(
      context,
      employeeId
    );

    return {
      success: true,
      data: rows.map((row) => this.mapNiCategoryToResponse(row)),
    };
  }

  /**
   * Get the current (active) NI category for an employee.
   * Returns the record where effective_from <= today and
   * (effective_to IS NULL OR effective_to >= today).
   */
  async getCurrentNiCategory(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<NiCategoryResponse | null>> {
    const row = await this.repository.findCurrentNiCategory(
      context,
      employeeId
    );

    return {
      success: true,
      data: row ? this.mapNiCategoryToResponse(row) : null,
    };
  }

  /**
   * Update an existing NI category record.
   *
   * Validates:
   * - Record exists
   * - effective_to >= effective_from (considering merged values)
   * - No overlapping NI category records (excluding self)
   */
  async updateNiCategory(
    context: TenantContext,
    id: string,
    data: UpdateNiCategory,
    _idempotencyKey?: string
  ): Promise<ServiceResult<NiCategoryResponse>> {
    // Fetch existing record to merge values for validation
    const existing = await this.repository.findNiCategoryById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `NI category record ${id} not found`,
        },
      };
    }

    // Determine effective values after the update
    const effectiveFrom = data.effective_from
      ?? (existing.effectiveFrom instanceof Date
        ? existing.effectiveFrom.toISOString().split("T")[0]
        : String(existing.effectiveFrom));

    const effectiveTo = data.effective_to !== undefined
      ? data.effective_to
      : existing.effectiveTo
        ? existing.effectiveTo instanceof Date
          ? existing.effectiveTo.toISOString().split("T")[0]
          : String(existing.effectiveTo)
        : null;

    // Validate effective_to >= effective_from
    if (effectiveTo && effectiveTo < effectiveFrom) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "effective_to must be on or after effective_from",
          details: {
            effective_from: effectiveFrom,
            effective_to: effectiveTo,
          },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      // Check for overlapping NI categories (excluding current record)
      const hasOverlap = await this.repository.hasOverlappingNiCategory(
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
              "Employee already has an NI category record that overlaps with the given date range",
            details: {
              employee_id: existing.employeeId,
              effective_from: effectiveFrom,
              effective_to: effectiveTo,
            },
          },
        };
      }

      const row = await this.repository.updateNiCategory(context, id, data, tx);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `NI category record ${id} not found`,
          },
        };
      }

      // Emit domain event
      await this.emitEvent(
        tx,
        context,
        "ni_category",
        row.id,
        "payroll.ni_category.updated",
        {
          ni_category: this.mapNiCategoryToResponse(row),
          previous: this.mapNiCategoryToResponse(existing),
          employee_id: existing.employeeId,
        }
      );

      return {
        success: true,
        data: this.mapNiCategoryToResponse(row),
      };
    });
  }

  /**
   * Delete an NI category record.
   *
   * Validates:
   * - Record exists
   * Emits a domain event for audit trail.
   */
  async deleteNiCategory(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<{ deleted: true }>> {
    // Verify record exists first
    const existing = await this.repository.findNiCategoryById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `NI category record ${id} not found`,
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const deleted = await this.repository.deleteNiCategory(context, id, tx);

      if (!deleted) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `NI category record ${id} not found`,
          },
        };
      }

      // Emit domain event
      await this.emitEvent(
        tx,
        context,
        "ni_category",
        id,
        "payroll.ni_category.deleted",
        {
          ni_category: this.mapNiCategoryToResponse(deleted),
          employee_id: deleted.employeeId,
        }
      );

      return {
        success: true,
        data: { deleted: true as const },
      };
    });
  }
}
