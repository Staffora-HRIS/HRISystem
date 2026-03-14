/**
 * NMW (National Minimum Wage) Module - Service Layer
 *
 * Implements business logic for UK NMW/NLW compliance checking.
 * Calculates hourly rates from salary/hours data, determines applicable
 * statutory rates by employee age, and records compliance check results.
 *
 * UK National Minimum Wage Act 1998:
 * - Employers must pay at least NMW/NLW based on employee age
 * - Rates change annually (usually April)
 * - 2025/26: NLW 21+ = £12.21, 18-20 = £10.00, 16-17 = £7.55, Apprentice = £7.55
 *
 * Hourly rate derivation:
 * - Annual salary / (52 weeks * weekly hours)
 * - Monthly salary * 12 / (52 * weekly hours)
 * - Weekly salary / weekly hours
 * - Bi-weekly salary / (2 * weekly hours)
 * - Semi-monthly salary * 24 / (52 * weekly hours)
 * - Default weekly hours = 37.5 if not specified
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  NMWRepository,
  NMWRateRow,
  ComplianceCheckRow,
  ComplianceCheckWithEmployeeRow,
  EmployeeComplianceData,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateNMWRate,
  NMWRateFilters,
  NMWRateResponse,
  ComplianceCheckResponse,
  BulkComplianceResponse,
  ComplianceReportFilters,
  ComplianceReportResponse,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/** Default weekly working hours if not specified on the contract */
const DEFAULT_WEEKLY_HOURS = 37.5;

/** Weeks per year for annualisation */
const WEEKS_PER_YEAR = 52;

// =============================================================================
// Types
// =============================================================================

type DomainEventType =
  | "nmw.rate.created"
  | "nmw.compliance.checked"
  | "nmw.compliance.bulk_checked"
  | "nmw.compliance.violation_detected";

// =============================================================================
// NMW Service
// =============================================================================

export class NMWService {
  constructor(
    private repository: NMWRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql<Record<string, unknown>>,
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
  // Rate Methods
  // ===========================================================================

  /**
   * List all NMW/NLW rates visible to the current tenant.
   */
  async listRates(
    context: TenantContext,
    filters: NMWRateFilters = {}
  ): Promise<ServiceResult<NMWRateResponse[]>> {
    const rows = await this.repository.findRates(context, filters);

    return {
      success: true,
      data: rows.map(this.mapRateToResponse),
    };
  }

  /**
   * Create a tenant-specific NMW rate.
   * Writes outbox event in the same transaction.
   */
  async createRate(
    context: TenantContext,
    data: CreateNMWRate
  ): Promise<ServiceResult<NMWRateResponse>> {
    // Validate age band
    if (data.age_to !== undefined && data.age_to !== null && data.age_to <= data.age_from) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "age_to must be greater than age_from",
        },
      };
    }

    // Validate effective dates
    if (data.effective_to && data.effective_to <= data.effective_from) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "effective_to must be after effective_from",
        },
      };
    }

    const row = await this.db.withTransaction(context, async (tx) => {
      const created = await this.repository.createRate(tx, context, data);

      await this.emitEvent(
        tx,
        context,
        "nmw_rate",
        created.id,
        "nmw.rate.created",
        { rate: created }
      );

      return created;
    });

    return {
      success: true,
      data: this.mapRateToResponse(row),
    };
  }

  /**
   * Get the applicable rate for a given age and date.
   */
  async getApplicableRate(
    context: TenantContext,
    age: number,
    asOfDate?: string
  ): Promise<ServiceResult<NMWRateResponse>> {
    const date = asOfDate || new Date().toISOString().split("T")[0]!;

    const row = await this.repository.getApplicableRate(context, age, date);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `No applicable NMW/NLW rate found for age ${age} on ${date}`,
        },
      };
    }

    return {
      success: true,
      data: this.mapRateToResponse(row),
    };
  }

  // ===========================================================================
  // Compliance Check Methods
  // ===========================================================================

  /**
   * Check NMW compliance for a single employee.
   *
   * Steps:
   * 1. Load employee data (DOB, salary, hours)
   * 2. Calculate age as of check date
   * 3. Look up applicable NMW/NLW rate for that age
   * 4. Derive hourly rate from salary and hours
   * 5. Compare and record result
   */
  async checkEmployee(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<ComplianceCheckResponse>> {
    const checkDate = new Date().toISOString().split("T")[0]!;

    // 1. Load employee data
    const employee = await this.repository.getEmployeeComplianceData(
      context,
      employeeId
    );

    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
        },
      };
    }

    if (employee.status === "terminated") {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Cannot check compliance for a terminated employee",
        },
      };
    }

    // 2. Calculate age
    if (!employee.dateOfBirth) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Employee date of birth is required for NMW compliance checking",
          details: { employeeId, field: "date_of_birth" },
        },
      };
    }

    const age = this.calculateAge(employee.dateOfBirth, new Date(checkDate));

    // 3. Look up applicable rate
    const rate = await this.repository.getApplicableRate(context, age, checkDate);
    if (!rate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `No applicable NMW/NLW rate found for age ${age} on ${checkDate}`,
        },
      };
    }

    // 4. Derive hourly rate
    if (!employee.baseSalary) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Employee compensation data is required for NMW compliance checking",
          details: { employeeId, field: "base_salary" },
        },
      };
    }

    const weeklyHours = employee.workingHoursPerWeek
      ? Number(employee.workingHoursPerWeek)
      : DEFAULT_WEEKLY_HOURS;

    const actualHourlyRate = this.deriveHourlyRate(
      Number(employee.baseSalary),
      employee.payFrequency || "annual",
      weeklyHours
    );

    const applicableRate = Number(rate.hourlyRate);
    const compliant = actualHourlyRate >= applicableRate;
    const shortfall = compliant ? null : Number((applicableRate - actualHourlyRate).toFixed(2));

    // 5. Record result (outbox in same transaction)
    const checkedBy = context.userId || "system";

    const checkRow = await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.insertComplianceCheck(tx, context, {
        employeeId,
        checkDate,
        employeeAge: age,
        applicableRate,
        actualHourlyRate: Number(actualHourlyRate.toFixed(2)),
        compliant,
        shortfall,
        checkedBy,
        notes: compliant
          ? null
          : `Hourly rate £${actualHourlyRate.toFixed(2)} is below the applicable NMW/NLW rate of £${applicableRate.toFixed(2)} for age ${age}`,
      });

      // Emit compliance check event
      await this.emitEvent(
        tx,
        context,
        "nmw_compliance_check",
        row.id,
        "nmw.compliance.checked",
        {
          employeeId,
          checkDate,
          compliant,
          applicableRate,
          actualHourlyRate: Number(actualHourlyRate.toFixed(2)),
        }
      );

      // Emit violation event if non-compliant
      if (!compliant) {
        await this.emitEvent(
          tx,
          context,
          "nmw_compliance_check",
          row.id,
          "nmw.compliance.violation_detected",
          {
            employeeId,
            employeeName: `${employee.firstName} ${employee.lastName}`,
            employeeNumber: employee.employeeNumber,
            checkDate,
            applicableRate,
            actualHourlyRate: Number(actualHourlyRate.toFixed(2)),
            shortfall,
            age,
          }
        );
      }

      return row;
    });

    return {
      success: true,
      data: this.mapCheckToResponse(checkRow, employee),
    };
  }

  /**
   * Bulk check NMW compliance for all active employees.
   * Each check is recorded individually. Summary is returned.
   */
  async checkAll(
    context: TenantContext
  ): Promise<ServiceResult<BulkComplianceResponse>> {
    const checkDate = new Date().toISOString().split("T")[0]!;

    // Load all active employees
    const employees = await this.repository.getAllActiveEmployeesComplianceData(context);

    const results: ComplianceCheckResponse[] = [];
    let compliantCount = 0;
    let nonCompliantCount = 0;
    let skippedCount = 0;

    for (const employee of employees) {
      // Skip employees missing required data
      if (!employee.dateOfBirth || !employee.baseSalary) {
        skippedCount++;
        continue;
      }

      const age = this.calculateAge(employee.dateOfBirth, new Date(checkDate));

      const rate = await this.repository.getApplicableRate(context, age, checkDate);
      if (!rate) {
        skippedCount++;
        continue;
      }

      const weeklyHours = employee.workingHoursPerWeek
        ? Number(employee.workingHoursPerWeek)
        : DEFAULT_WEEKLY_HOURS;

      const actualHourlyRate = this.deriveHourlyRate(
        Number(employee.baseSalary),
        employee.payFrequency || "annual",
        weeklyHours
      );

      const applicableRate = Number(rate.hourlyRate);
      const compliant = actualHourlyRate >= applicableRate;
      const shortfall = compliant ? null : Number((applicableRate - actualHourlyRate).toFixed(2));

      const checkedBy = context.userId || "system";

      const checkRow = await this.db.withTransaction(context, async (tx) => {
        const row = await this.repository.insertComplianceCheck(tx, context, {
          employeeId: employee.id,
          checkDate,
          employeeAge: age,
          applicableRate,
          actualHourlyRate: Number(actualHourlyRate.toFixed(2)),
          compliant,
          shortfall,
          checkedBy,
          notes: compliant
            ? null
            : `Hourly rate £${actualHourlyRate.toFixed(2)} is below the applicable NMW/NLW rate of £${applicableRate.toFixed(2)} for age ${age}`,
        });

        // Emit individual check event
        await this.emitEvent(
          tx,
          context,
          "nmw_compliance_check",
          row.id,
          "nmw.compliance.checked",
          {
            employeeId: employee.id,
            checkDate,
            compliant,
            applicableRate,
            actualHourlyRate: Number(actualHourlyRate.toFixed(2)),
          }
        );

        if (!compliant) {
          await this.emitEvent(
            tx,
            context,
            "nmw_compliance_check",
            row.id,
            "nmw.compliance.violation_detected",
            {
              employeeId: employee.id,
              employeeName: `${employee.firstName} ${employee.lastName}`,
              employeeNumber: employee.employeeNumber,
              checkDate,
              applicableRate,
              actualHourlyRate: Number(actualHourlyRate.toFixed(2)),
              shortfall,
              age,
            }
          );
        }

        return row;
      });

      const response = this.mapCheckToResponse(checkRow, employee);
      results.push(response);

      if (compliant) {
        compliantCount++;
      } else {
        nonCompliantCount++;
      }
    }

    // Emit bulk check summary event
    if (results.length > 0) {
      await this.db.withTransaction(context, async (tx) => {
        await this.emitEvent(
          tx,
          context,
          "nmw_compliance",
          context.tenantId,
          "nmw.compliance.bulk_checked",
          {
            checkDate,
            totalChecked: results.length,
            compliant: compliantCount,
            nonCompliant: nonCompliantCount,
            skipped: skippedCount,
          }
        );
      });
    }

    return {
      success: true,
      data: {
        totalChecked: results.length,
        compliant: compliantCount,
        nonCompliant: nonCompliantCount,
        skipped: skippedCount,
        checkDate,
        results,
      },
    };
  }

  /**
   * Get compliance report with filtering and pagination.
   */
  async getComplianceReport(
    context: TenantContext,
    filters: ComplianceReportFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<ServiceResult<ComplianceReportResponse>> {
    const [paginatedResult, summary] = await Promise.all([
      this.repository.findComplianceChecks(context, filters, pagination),
      this.repository.getComplianceSummary(context, filters),
    ]);

    return {
      success: true,
      data: {
        items: paginatedResult.items.map((row) =>
          this.mapCheckWithEmployeeToResponse(row)
        ),
        nextCursor: paginatedResult.nextCursor,
        hasMore: paginatedResult.hasMore,
        summary,
      },
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Calculate a person's age as of a given date.
   */
  private calculateAge(dateOfBirth: Date, asOfDate: Date): number {
    let age = asOfDate.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = asOfDate.getMonth() - dateOfBirth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && asOfDate.getDate() < dateOfBirth.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * Derive an hourly rate from a salary, pay frequency, and weekly hours.
   *
   * Conversions:
   * - annual:       salary / (52 * weeklyHours)
   * - monthly:      (salary * 12) / (52 * weeklyHours)
   * - bi_weekly:    salary / (2 * weeklyHours)
   * - weekly:       salary / weeklyHours
   * - semi_monthly: (salary * 24) / (52 * weeklyHours)
   */
  private deriveHourlyRate(
    baseSalary: number,
    payFrequency: string,
    weeklyHours: number
  ): number {
    if (weeklyHours <= 0) {
      return 0;
    }

    const annualHours = WEEKS_PER_YEAR * weeklyHours;

    switch (payFrequency) {
      case "annual":
        return baseSalary / annualHours;
      case "monthly":
        return (baseSalary * 12) / annualHours;
      case "bi_weekly":
        return baseSalary / (2 * weeklyHours);
      case "weekly":
        return baseSalary / weeklyHours;
      case "semi_monthly":
        return (baseSalary * 24) / annualHours;
      default:
        // Default: treat as annual
        return baseSalary / annualHours;
    }
  }

  // ===========================================================================
  // Response Mappers
  // ===========================================================================

  private mapRateToResponse(row: NMWRateRow): NMWRateResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      rateName: row.rateName,
      ageFrom: row.ageFrom,
      ageTo: row.ageTo,
      hourlyRate: String(row.hourlyRate),
      effectiveFrom: row.effectiveFrom instanceof Date
        ? row.effectiveFrom.toISOString().split("T")[0]!
        : String(row.effectiveFrom),
      effectiveTo: row.effectiveTo instanceof Date
        ? row.effectiveTo.toISOString().split("T")[0]!
        : row.effectiveTo ? String(row.effectiveTo) : null,
      rateType: row.rateType,
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    };
  }

  private mapCheckToResponse(
    row: ComplianceCheckRow,
    employee: EmployeeComplianceData
  ): ComplianceCheckResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      employeeId: row.employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeNumber: employee.employeeNumber,
      checkDate: row.checkDate instanceof Date
        ? row.checkDate.toISOString().split("T")[0]!
        : String(row.checkDate),
      employeeAge: row.employeeAge,
      applicableRate: String(row.applicableRate),
      actualHourlyRate: String(row.actualHourlyRate),
      compliant: row.compliant,
      shortfall: row.shortfall ? String(row.shortfall) : null,
      checkedBy: row.checkedBy,
      notes: row.notes,
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    };
  }

  private mapCheckWithEmployeeToResponse(
    row: ComplianceCheckWithEmployeeRow
  ): ComplianceCheckResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      employeeId: row.employeeId,
      employeeName: row.employeeName || undefined,
      employeeNumber: row.employeeNumber || undefined,
      checkDate: row.checkDate instanceof Date
        ? row.checkDate.toISOString().split("T")[0]!
        : String(row.checkDate),
      employeeAge: row.employeeAge,
      applicableRate: String(row.applicableRate),
      actualHourlyRate: String(row.actualHourlyRate),
      compliant: row.compliant,
      shortfall: row.shortfall ? String(row.shortfall) : null,
      checkedBy: row.checkedBy,
      notes: row.notes,
      createdAt: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    };
  }
}
