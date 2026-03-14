/**
 * Working Time Regulations Module - Service Layer
 *
 * Implements business logic for UK Working Time Regulations 1998 compliance.
 * Enforces invariants, validates opt-out agreements, and generates compliance alerts.
 *
 * Key regulations monitored:
 * - Maximum 48-hour average working week (17-week reference period)
 * - Opt-out agreements (voluntary, in writing)
 * - Daily rest (11 hours), weekly rest (24 hours), break (20 min after 6 hours)
 * - Night worker limits (8 hours average per 24-hour period)
 */

import type { DatabaseClient } from "../../plugins/db";
import type {
  WTRRepository,
  OptOutRow,
  AlertRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import {
  WTR_CONSTANTS,
  type CreateOptOut,
  type RevokeOptOut,
  type OptOutFilters,
  type AlertFilters,
  type OptOutResponse,
  type AlertResponse,
  type EmployeeWorkingTimeStatus,
  type ComplianceReport,
  type PaginationQuery,
} from "./schemas";

// =============================================================================
// Mappers
// =============================================================================

function mapOptOutToResponse(row: OptOutRow): OptOutResponse {
  return {
    id: row.id,
    tenantId: row.tenantId,
    employeeId: row.employeeId,
    optedOut: row.optedOut,
    optOutDate: row.optOutDate instanceof Date
      ? row.optOutDate.toISOString().split("T")[0]!
      : String(row.optOutDate),
    optInDate: row.optInDate
      ? row.optInDate instanceof Date
        ? row.optInDate.toISOString().split("T")[0]!
        : String(row.optInDate)
      : null,
    noticePeriodWeeks: row.noticePeriodWeeks,
    signedDocumentKey: row.signedDocumentKey,
    status: row.status as "active" | "revoked",
    createdAt: row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : String(row.updatedAt),
  };
}

function mapAlertToResponse(row: AlertRow): AlertResponse {
  return {
    id: row.id,
    tenantId: row.tenantId,
    employeeId: row.employeeId,
    alertType: row.alertType as AlertResponse["alertType"],
    referencePeriodStart: row.referencePeriodStart instanceof Date
      ? row.referencePeriodStart.toISOString().split("T")[0]!
      : String(row.referencePeriodStart),
    referencePeriodEnd: row.referencePeriodEnd instanceof Date
      ? row.referencePeriodEnd.toISOString().split("T")[0]!
      : String(row.referencePeriodEnd),
    actualValue: Number(row.actualValue),
    thresholdValue: Number(row.thresholdValue),
    details: row.details ?? {},
    acknowledged: row.acknowledged,
    acknowledgedBy: row.acknowledgedBy,
    acknowledgedAt: row.acknowledgedAt
      ? row.acknowledgedAt instanceof Date
        ? row.acknowledgedAt.toISOString()
        : String(row.acknowledgedAt)
      : null,
    createdAt: row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt),
  };
}

// =============================================================================
// Service Class
// =============================================================================

export class WTRService {
  constructor(
    private repository: WTRRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Opt-Out Management
  // ===========================================================================

  /**
   * Create a new 48-hour opt-out agreement for an employee.
   * Validates that the employee does not already have an active opt-out.
   */
  async createOptOut(
    ctx: TenantContext,
    data: CreateOptOut
  ): Promise<ServiceResult<OptOutResponse>> {
    // Check for existing active opt-out
    const existing = await this.repository.getActiveOptOutByEmployee(
      ctx,
      data.employeeId
    );
    if (existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message:
            "Employee already has an active 48-hour opt-out agreement. Revoke the existing one first.",
          details: { existingOptOutId: existing.id },
        },
      };
    }

    const row = await this.repository.createOptOut(ctx, {
      employeeId: data.employeeId,
      optOutDate: new Date(data.optOutDate),
      noticePeriodWeeks: data.noticePeriodWeeks ?? 0,
      signedDocumentKey: data.signedDocumentKey,
    });

    return { success: true, data: mapOptOutToResponse(row) };
  }

  /**
   * Revoke an existing opt-out agreement (employee opts back in).
   * Under WTR, workers have the right to opt back in at any time,
   * giving between 1 week and 3 months notice.
   */
  async revokeOptOut(
    ctx: TenantContext,
    optOutId: string,
    data: RevokeOptOut
  ): Promise<ServiceResult<OptOutResponse>> {
    const existing = await this.repository.getOptOutById(ctx, optOutId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Opt-out agreement not found",
        },
      };
    }

    if (existing.status === "revoked") {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Opt-out agreement has already been revoked",
        },
      };
    }

    const row = await this.repository.revokeOptOut(
      ctx,
      optOutId,
      new Date(data.optInDate)
    );

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Failed to revoke opt-out agreement",
        },
      };
    }

    return { success: true, data: mapOptOutToResponse(row) };
  }

  /**
   * List opt-out agreements with optional filters and pagination.
   */
  async listOptOuts(
    ctx: TenantContext,
    filters: OptOutFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<OptOutResponse>> {
    const result = await this.repository.listOptOuts(ctx, {
      employeeId: filters.employeeId,
      status: filters.status,
      cursor: pagination.cursor,
      limit: pagination.limit,
    });

    return {
      items: result.data.map(mapOptOutToResponse),
      nextCursor: result.cursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Alert Management
  // ===========================================================================

  /**
   * Acknowledge a compliance alert.
   */
  async acknowledgeAlert(
    ctx: TenantContext,
    alertId: string
  ): Promise<ServiceResult<AlertResponse>> {
    if (!ctx.userId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: "User context required to acknowledge alerts",
        },
      };
    }

    const existing = await this.repository.getAlertById(ctx, alertId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Alert not found",
        },
      };
    }

    if (existing.acknowledged) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Alert has already been acknowledged",
        },
      };
    }

    const row = await this.repository.acknowledgeAlert(
      ctx,
      alertId,
      ctx.userId
    );

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Failed to acknowledge alert",
        },
      };
    }

    return { success: true, data: mapAlertToResponse(row) };
  }

  /**
   * List alerts with optional filters and pagination.
   */
  async listAlerts(
    ctx: TenantContext,
    filters: AlertFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<AlertResponse>> {
    const result = await this.repository.listAlerts(ctx, {
      employeeId: filters.employeeId,
      alertType: filters.alertType,
      acknowledged: filters.acknowledged,
      from: filters.from,
      to: filters.to,
      cursor: pagination.cursor,
      limit: pagination.limit,
    });

    return {
      items: result.data.map(mapAlertToResponse),
      nextCursor: result.cursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Compliance Monitoring
  // ===========================================================================

  /**
   * Check weekly hours compliance for all active employees in the tenant.
   * Generates alerts for employees exceeding or approaching the 48-hour limit.
   * Skips employees with active opt-out agreements.
   *
   * This is called by the scheduled job.
   */
  async checkWeeklyHoursCompliance(
    ctx: TenantContext
  ): Promise<ServiceResult<{ alertsCreated: number }>> {
    const optOutEmployeeIds = await this.repository.getActiveOptOutEmployeeIds(ctx);

    const referencePeriodWeeks = WTR_CONSTANTS.REFERENCE_PERIOD_WEEKS;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - referencePeriodWeeks * 7);

    let alertsCreated = 0;

    // Find employees exceeding 48 hours (excluding opt-outs)
    const exceeding = await this.repository.findEmployeesExceedingHours(
      ctx,
      WTR_CONSTANTS.MAX_WEEKLY_HOURS,
      referencePeriodWeeks
    );

    for (const emp of exceeding) {
      if (optOutEmployeeIds.has(emp.employeeId)) {
        continue;
      }

      // Check for duplicate alert in the same reference period
      const hasExisting = await this.repository.hasRecentAlert(
        ctx,
        emp.employeeId,
        "weekly_hours_exceeded",
        startDate,
        endDate
      );

      if (!hasExisting) {
        await this.repository.createAlert(ctx, {
          employeeId: emp.employeeId,
          alertType: "weekly_hours_exceeded",
          referencePeriodStart: startDate,
          referencePeriodEnd: endDate,
          actualValue: Number(emp.averageWeeklyHours),
          thresholdValue: WTR_CONSTANTS.MAX_WEEKLY_HOURS,
          details: {
            employeeName: emp.employeeName,
            employeeNumber: emp.employeeNumber,
            referencePeriodWeeks,
          },
        });
        alertsCreated++;
      }
    }

    // Find employees in the warning zone (>44 but <=48 hours)
    const warning = await this.repository.findEmployeesExceedingHours(
      ctx,
      WTR_CONSTANTS.WARNING_WEEKLY_HOURS,
      referencePeriodWeeks
    );

    for (const emp of warning) {
      if (optOutEmployeeIds.has(emp.employeeId)) {
        continue;
      }
      // Skip if already at exceeded level
      if (Number(emp.averageWeeklyHours) > WTR_CONSTANTS.MAX_WEEKLY_HOURS) {
        continue;
      }

      const hasExisting = await this.repository.hasRecentAlert(
        ctx,
        emp.employeeId,
        "weekly_hours_warning",
        startDate,
        endDate
      );

      if (!hasExisting) {
        await this.repository.createAlert(ctx, {
          employeeId: emp.employeeId,
          alertType: "weekly_hours_warning",
          referencePeriodStart: startDate,
          referencePeriodEnd: endDate,
          actualValue: Number(emp.averageWeeklyHours),
          thresholdValue: WTR_CONSTANTS.WARNING_WEEKLY_HOURS,
          details: {
            employeeName: emp.employeeName,
            employeeNumber: emp.employeeNumber,
            referencePeriodWeeks,
            hoursUntilLimit: Math.round(
              (WTR_CONSTANTS.MAX_WEEKLY_HOURS - Number(emp.averageWeeklyHours)) * 100
            ) / 100,
          },
        });
        alertsCreated++;
      }
    }

    return { success: true, data: { alertsCreated } };
  }

  /**
   * Get an individual employee's working time status.
   * Includes average hours, opt-out status, compliance state, and alerts.
   */
  async getEmployeeWorkingTimeStatus(
    ctx: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<EmployeeWorkingTimeStatus>> {
    const referencePeriodWeeks = WTR_CONSTANTS.REFERENCE_PERIOD_WEEKS;

    // Get average weekly hours and breakdown
    const { average, weeks } = await this.repository.getAverageWeeklyHours(
      ctx,
      employeeId,
      referencePeriodWeeks
    );

    // Get opt-out status
    const optOut = await this.repository.getActiveOptOutByEmployee(
      ctx,
      employeeId
    );

    // Get alerts for this employee
    const alertResult = await this.repository.listAlerts(ctx, {
      employeeId,
      limit: 50,
    });

    // Determine compliance
    const isCompliant =
      optOut !== null || average <= WTR_CONSTANTS.MAX_WEEKLY_HOURS;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - referencePeriodWeeks * 7);

    return {
      success: true,
      data: {
        employeeId,
        employeeName: null, // Could be enriched if needed
        employeeNumber: null,
        averageWeeklyHours: average,
        referencePeriodWeeks,
        referencePeriodStart: startDate.toISOString().split("T")[0]!,
        referencePeriodEnd: endDate.toISOString().split("T")[0]!,
        hasOptOut: optOut !== null,
        optOutStatus: optOut ? (optOut.status as "active" | "revoked") : null,
        isCompliant,
        alerts: alertResult.data.map(mapAlertToResponse),
        weeklyBreakdown: weeks.map((w) => ({
          weekStart: w.weekStart instanceof Date
            ? w.weekStart.toISOString().split("T")[0]!
            : String(w.weekStart),
          weekEnd: w.weekEnd instanceof Date
            ? w.weekEnd.toISOString().split("T")[0]!
            : String(w.weekEnd),
          totalHours: w.totalHours,
        })),
      },
    };
  }

  /**
   * Generate a compliance report summary for the tenant.
   * Shows counts of employees over threshold, opt-outs, warnings, and alerts.
   */
  async getComplianceReport(
    ctx: TenantContext
  ): Promise<ServiceResult<ComplianceReport>> {
    const referencePeriodWeeks = WTR_CONSTANTS.REFERENCE_PERIOD_WEEKS;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - referencePeriodWeeks * 7);

    // Get counts
    const totalEmployees = await this.repository.getActiveEmployeeCount(ctx);
    const optOutCount = await this.repository.getActiveOptOutCount(ctx);
    const unacknowledgedCount = await this.repository.getUnacknowledgedAlertCount(ctx);
    const alertsByType = await this.repository.getAlertCountsByType(ctx);

    // Find employees exceeding and in warning zone
    const exceeding = await this.repository.findEmployeesExceedingHours(
      ctx,
      WTR_CONSTANTS.MAX_WEEKLY_HOURS,
      referencePeriodWeeks
    );

    // Filter out opted-out employees from exceeding count
    const optOutEmployeeIds = await this.repository.getActiveOptOutEmployeeIds(ctx);
    const exceedingWithoutOptOuts = exceeding.filter(
      (e) => !optOutEmployeeIds.has(e.employeeId)
    );

    const warningEmployees = await this.repository.findEmployeesExceedingHours(
      ctx,
      WTR_CONSTANTS.WARNING_WEEKLY_HOURS,
      referencePeriodWeeks
    );
    const warningOnly = warningEmployees.filter(
      (e) =>
        Number(e.averageWeeklyHours) <= WTR_CONSTANTS.MAX_WEEKLY_HOURS &&
        !optOutEmployeeIds.has(e.employeeId)
    );

    return {
      success: true,
      data: {
        totalEmployees,
        employeesOverThreshold: exceedingWithoutOptOuts.length,
        employeesWithOptOut: optOutCount,
        employeesInWarningZone: warningOnly.length,
        unacknowledgedAlerts: unacknowledgedCount,
        alertsByType,
        referencePeriodStart: startDate.toISOString().split("T")[0]!,
        referencePeriodEnd: endDate.toISOString().split("T")[0]!,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
