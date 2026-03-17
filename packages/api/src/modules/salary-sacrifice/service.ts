/**
 * Salary Sacrifice Module - Service Layer
 *
 * Business logic for managing salary sacrifice arrangements.
 *
 * Key rules:
 * - Sacrifice amount must be > 0
 * - end_date >= start_date (if provided)
 * - Creating or updating a sacrifice must not reduce the employee's
 *   effective salary below the National Minimum Wage (NMW/NLW)
 * - All writes emit domain events in the same transaction (outbox pattern)
 *
 * NMW validation approach:
 * 1. Load the employee's base salary and weekly hours
 * 2. Sum all active monthly sacrifices (including the new/updated one)
 * 3. Calculate the post-sacrifice annual salary
 * 4. Derive hourly rate = post-sacrifice annual / (52 * weekly hours)
 * 5. Compare against the applicable NMW rate for the employee's age
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  SalarySacrificeRepository,
  SalarySacrificeRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateSalarySacrifice,
  UpdateSalarySacrifice,
  SalarySacrificeResponse,
  SalarySacrificeFilters,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/** Default weekly working hours (UK standard) if not specified on the contract */
const DEFAULT_WEEKLY_HOURS = 37.5;

/** Weeks per year for annualisation */
const WEEKS_PER_YEAR = 52;

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "payroll.salary_sacrifice.created"
  | "payroll.salary_sacrifice.updated"
  | "payroll.salary_sacrifice.ended";

// =============================================================================
// Service
// =============================================================================

export class SalarySacrificeService {
  constructor(
    private repository: SalarySacrificeRepository,
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
  // Mapper
  // ===========================================================================

  private mapToResponse(row: SalarySacrificeRow): SalarySacrificeResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      sacrifice_type: row.sacrificeType,
      amount: parseFloat(row.amount),
      frequency: row.frequency,
      start_date: row.startDate instanceof Date
        ? row.startDate.toISOString().split("T")[0]!
        : String(row.startDate),
      end_date: row.endDate
        ? row.endDate instanceof Date
          ? row.endDate.toISOString().split("T")[0]!
          : String(row.endDate)
        : null,
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
  // NMW Validation
  // ===========================================================================

  /**
   * Validate that the employee's post-sacrifice salary does not fall
   * below the National Minimum Wage.
   *
   * @param context Tenant context
   * @param employeeId Employee to check
   * @param additionalMonthlySacrifice The new monthly sacrifice amount to add
   * @param excludeSacrificeId Sacrifice ID to exclude from current total (for updates)
   * @returns null if compliant, or an error result if non-compliant
   */
  private async validateNMWCompliance(
    context: TenantContext,
    employeeId: string,
    additionalMonthlySacrifice: number,
    excludeSacrificeId?: string
  ): Promise<ServiceResult<void> | null> {
    const salaryData = await this.repository.getEmployeeSalaryData(
      context,
      employeeId
    );

    if (!salaryData || !salaryData.baseSalary) {
      // Cannot validate without salary data; allow the sacrifice but log concern
      // In a production system this would be a warning event
      return null;
    }

    const baseSalary = parseFloat(salaryData.baseSalary);
    const payFrequency = salaryData.payFrequency || "annual";
    const weeklyHours = salaryData.workingHoursPerWeek
      ? parseFloat(salaryData.workingHoursPerWeek)
      : DEFAULT_WEEKLY_HOURS;

    if (weeklyHours <= 0) return null;

    // Convert base salary to annual
    const annualSalary = this.toAnnualSalary(baseSalary, payFrequency);

    // Get current total active monthly sacrifice (excluding the sacrifice being updated)
    const currentMonthlySacrifice =
      await this.repository.getTotalActiveMonthlySacrifice(
        context,
        employeeId,
        excludeSacrificeId
      );

    // Total monthly sacrifice including the new one
    const totalMonthlySacrifice = currentMonthlySacrifice + additionalMonthlySacrifice;

    // Post-sacrifice annual salary
    const postSacrificeAnnual = annualSalary - totalMonthlySacrifice * 12;

    if (postSacrificeAnnual <= 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message:
            "Salary sacrifice would reduce the employee's salary to zero or below",
          details: {
            annual_salary: annualSalary,
            total_monthly_sacrifice: totalMonthlySacrifice,
            post_sacrifice_annual: postSacrificeAnnual,
          },
        },
      };
    }

    // Derive post-sacrifice hourly rate
    const postSacrificeHourly =
      postSacrificeAnnual / (WEEKS_PER_YEAR * weeklyHours);

    // Get applicable NMW rate
    if (salaryData.dateOfBirth) {
      const age = this.calculateAge(
        salaryData.dateOfBirth,
        new Date()
      );
      const today = new Date().toISOString().split("T")[0]!;
      const nmwRate = await this.repository.getApplicableNMWRate(
        context,
        age,
        today
      );

      if (nmwRate !== null && postSacrificeHourly < nmwRate) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message:
              "Salary sacrifice would reduce the employee's effective hourly rate below the National Minimum Wage",
            details: {
              annual_salary: annualSalary,
              total_monthly_sacrifice: totalMonthlySacrifice,
              post_sacrifice_annual: postSacrificeAnnual,
              post_sacrifice_hourly_rate: Number(postSacrificeHourly.toFixed(2)),
              nmw_hourly_rate: nmwRate,
              employee_age: age,
            },
          },
        };
      }
    }

    return null;
  }

  private toAnnualSalary(baseSalary: number, payFrequency: string): number {
    switch (payFrequency) {
      case "annual":
        return baseSalary;
      case "monthly":
        return baseSalary * 12;
      case "bi_weekly":
        return baseSalary * 26;
      case "weekly":
        return baseSalary * WEEKS_PER_YEAR;
      case "semi_monthly":
        return baseSalary * 24;
      default:
        return baseSalary; // Default: treat as annual
    }
  }

  private calculateAge(dateOfBirth: Date, asOfDate: Date): number {
    let age = asOfDate.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = asOfDate.getMonth() - dateOfBirth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && asOfDate.getDate() < dateOfBirth.getDate())
    ) {
      age--;
    }
    return age;
  }

  /**
   * Convert an amount to monthly equivalent based on frequency.
   */
  private toMonthlySacrifice(amount: number, frequency: string): number {
    switch (frequency) {
      case "monthly":
        return amount;
      case "annual":
        return amount / 12;
      default:
        return amount;
    }
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  async create(
    context: TenantContext,
    data: CreateSalarySacrifice,
    _idempotencyKey?: string
  ): Promise<ServiceResult<SalarySacrificeResponse>> {
    // Validate end_date >= start_date
    if (data.end_date && data.end_date < data.start_date) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "end_date must be on or after start_date",
          details: { start_date: data.start_date, end_date: data.end_date },
        },
      };
    }

    // NMW validation
    const monthlySacrifice = this.toMonthlySacrifice(
      data.amount,
      data.frequency
    );
    const nmwError = await this.validateNMWCompliance(
      context,
      data.employee_id,
      monthlySacrifice
    );
    if (nmwError) return nmwError as unknown as ServiceResult<SalarySacrificeResponse>;

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.create(
        context,
        {
          employeeId: data.employee_id,
          sacrificeType: data.sacrifice_type,
          amount: data.amount,
          frequency: data.frequency,
          startDate: data.start_date,
          endDate: data.end_date,
        },
        tx
      );

      await this.emitEvent(
        tx,
        context,
        "salary_sacrifice",
        row.id,
        "payroll.salary_sacrifice.created",
        {
          sacrifice: this.mapToResponse(row),
          employee_id: data.employee_id,
        }
      );

      return {
        success: true as const,
        data: this.mapToResponse(row),
      };
    });
  }

  async getById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<SalarySacrificeResponse>> {
    const row = await this.repository.findById(context, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Salary sacrifice ${id} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapToResponse(row),
    };
  }

  async list(
    context: TenantContext,
    filters: SalarySacrificeFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<SalarySacrificeResponse>> {
    const result = await this.repository.findAll(context, filters, pagination);
    return {
      items: result.items.map((row) => this.mapToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async listByEmployee(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<SalarySacrificeResponse[]>> {
    const rows = await this.repository.findByEmployee(context, employeeId);
    return {
      success: true,
      data: rows.map((row) => this.mapToResponse(row)),
    };
  }

  async update(
    context: TenantContext,
    id: string,
    data: UpdateSalarySacrifice,
    _idempotencyKey?: string
  ): Promise<ServiceResult<SalarySacrificeResponse>> {
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Salary sacrifice ${id} not found`,
        },
      };
    }

    // Cannot update an ended sacrifice
    if (existing.status === "ended") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: "Cannot update an ended salary sacrifice",
          details: { id, current_status: "ended" },
        },
      };
    }

    // Validate date consistency
    const effectiveStartDate = data.start_date ?? (
      existing.startDate instanceof Date
        ? existing.startDate.toISOString().split("T")[0]!
        : String(existing.startDate)
    );
    const effectiveEndDate = data.end_date !== undefined
      ? data.end_date
      : existing.endDate
        ? existing.endDate instanceof Date
          ? existing.endDate.toISOString().split("T")[0]!
          : String(existing.endDate)
        : null;

    if (effectiveEndDate && effectiveEndDate < effectiveStartDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "end_date must be on or after start_date",
        },
      };
    }

    // NMW validation for amount/frequency changes on active sacrifices
    const newStatus = data.status ?? existing.status;
    if (newStatus === "active") {
      const newAmount = data.amount ?? parseFloat(existing.amount);
      const newFrequency = data.frequency ?? existing.frequency;
      const monthlySacrifice = this.toMonthlySacrifice(newAmount, newFrequency);

      const nmwError = await this.validateNMWCompliance(
        context,
        existing.employeeId,
        monthlySacrifice,
        id // Exclude this sacrifice from the current total
      );
      if (nmwError) return nmwError as unknown as ServiceResult<SalarySacrificeResponse>;
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.update(
        context,
        id,
        {
          sacrificeType: data.sacrifice_type,
          amount: data.amount,
          frequency: data.frequency,
          startDate: data.start_date,
          endDate: data.end_date,
          status: data.status,
        },
        tx
      );

      if (!row) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Salary sacrifice ${id} not found`,
          },
        };
      }

      await this.emitEvent(
        tx,
        context,
        "salary_sacrifice",
        row.id,
        "payroll.salary_sacrifice.updated",
        {
          sacrifice: this.mapToResponse(row),
          previous: this.mapToResponse(existing),
        }
      );

      return {
        success: true as const,
        data: this.mapToResponse(row),
      };
    });
  }

  async end(
    context: TenantContext,
    id: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Salary sacrifice ${id} not found`,
        },
      };
    }

    if (existing.status === "ended") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: "Salary sacrifice is already ended",
          details: { id, current_status: "ended" },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.delete(context, id, tx);

      await this.emitEvent(
        tx,
        context,
        "salary_sacrifice",
        id,
        "payroll.salary_sacrifice.ended",
        {
          sacrificeId: id,
          employee_id: existing.employeeId,
          sacrifice_type: existing.sacrificeType,
        }
      );
    });

    return { success: true };
  }
}
