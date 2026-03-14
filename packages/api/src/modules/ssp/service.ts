/**
 * SSP (Statutory Sick Pay) Module - Service Layer
 *
 * Implements business logic for UK Statutory Sick Pay.
 * Enforces SSP rules, calculates payments, handles PIW linking,
 * and emits domain events via the outbox pattern.
 *
 * UK SSP Key Rules (2024/25):
 * - Weekly rate: £116.75
 * - 4+ consecutive days of incapacity (including non-working days)
 * - 3 waiting days before SSP starts (qualifying days only)
 * - Max 28 weeks per PIW
 * - Lower Earnings Limit: £123/week
 * - PIW linking: periods <=8 weeks (56 days) apart
 * - Qualifying days: days employee normally works
 * - Fit note required after 7 consecutive calendar days of sickness
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  SSPRepository,
  SSPRecordRow,
  SSPDailyLogRow,
  SSPFitNoteRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import {
  SSP_CONSTANTS,
  type CreateSSPRecord,
  type UpdateSSPRecord,
  type EndSSPRecord,
  type SSPRecordFilters,
  type PaginationQuery,
  type CalculateSSP,
  type CreateFitNote,
  type UpdateFitNote,
  type SSPRecordResponse,
  type SSPRecordDetailResponse,
  type SSPDailyLogResponse,
  type SSPEligibilityResponse,
  type SSPEntitlementResponse,
  type SSPCalculationResponse,
  type SSPFitNoteResponse,
  type SSPHistoryResponse,
  type SSPDayType,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

type DomainEventType =
  | "ssp.record.created"
  | "ssp.record.updated"
  | "ssp.record.ended"
  | "ssp.record.exhausted"
  | "ssp.record.ineligible"
  | "ssp.fit_note.created"
  | "ssp.fit_note.updated";

// =============================================================================
// Earnings Calculation Helper
// =============================================================================

/**
 * Convert a base salary with pay frequency to weekly earnings.
 * Mirrors the logic in the database function app.calculate_annual_salary.
 */
function calculateWeeklyEarnings(
  baseSalary: number,
  payFrequency: string
): number {
  let annualSalary: number;

  switch (payFrequency) {
    case "annual":
      annualSalary = baseSalary;
      break;
    case "monthly":
      annualSalary = baseSalary * 12;
      break;
    case "semi_monthly":
      annualSalary = baseSalary * 24;
      break;
    case "bi_weekly":
      annualSalary = baseSalary * 26;
      break;
    case "weekly":
      annualSalary = baseSalary * 52;
      break;
    default:
      // Default to monthly if unknown frequency
      annualSalary = baseSalary * 12;
      break;
  }

  return annualSalary / 52;
}

// =============================================================================
// SSP Service
// =============================================================================

export class SSPService {
  constructor(
    private repository: SSPRepository,
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
  // List / Get Methods
  // ===========================================================================

  async listRecords(
    context: TenantContext,
    filters: SSPRecordFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<SSPRecordResponse>> {
    const result = await this.repository.findRecords(
      context,
      filters,
      pagination
    );

    return {
      items: result.items.map(this.mapRecordToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getRecord(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<SSPRecordDetailResponse>> {
    const record = await this.repository.findRecordById(context, id);

    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "SSP record not found",
          details: { id },
        },
      };
    }

    // Get the daily log
    const dailyLog = await this.repository.getDailyLog(context, id);

    return {
      success: true,
      data: this.mapRecordToDetailResponse(record, dailyLog),
    };
  }

  // ===========================================================================
  // Start SSP
  // ===========================================================================

  async startSSP(
    context: TenantContext,
    data: CreateSSPRecord
  ): Promise<ServiceResult<SSPRecordResponse>> {
    // Check for existing active SSP record
    const activeRecords = await this.repository.findActiveRecordsByEmployee(
      context,
      data.employee_id
    );

    if (activeRecords.length > 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message:
            "Employee already has an active SSP record. End the current record before starting a new one.",
          details: {
            activeRecordId: activeRecords[0]!.id,
          },
        },
      };
    }

    const qualifyingDaysPattern = data.qualifying_days_pattern || [1, 2, 3, 4, 5];
    const qualifyingDaysPerWeek = qualifyingDaysPattern.length;

    // Check PIW linking: is there a recent completed/exhausted PIW within 56 days?
    const linkablePIWs = await this.repository.findLinkablePIWs(
      context,
      data.employee_id,
      data.start_date
    );

    let linkedPiwId: string | null = null;
    let waitingDaysServed = 0;

    if (linkablePIWs.length > 0) {
      const previousPIW = linkablePIWs[0]!;
      // Link to the root PIW in the chain
      linkedPiwId = previousPIW.linkedPiwId || previousPIW.id;

      // When PIWs link, waiting days from the previous PIW carry over
      // (i.e., no new waiting days if already served in the linked PIW)
      waitingDaysServed = Math.min(previousPIW.waitingDaysServed, SSP_CONSTANTS.WAITING_DAYS);

      // Check if the linked PIW chain has already exhausted 28 weeks
      const totalPaidInChain =
        await this.repository.getTotalPaidDaysInLinkedPIW(
          context,
          data.employee_id,
          linkedPiwId
        );

      const maxQualifyingDays = SSP_CONSTANTS.MAX_WEEKS * qualifyingDaysPerWeek;
      if (totalPaidInChain >= maxQualifyingDays) {
        // SSP exhausted in the linked chain - create record as exhausted
        const record = await this.db.withTransaction(context, async (tx) => {
          const rec = await this.repository.createRecord(tx, context, {
            employeeId: data.employee_id,
            startDate: data.start_date,
            qualifyingDaysPattern,
            weeklyRate: SSP_CONSTANTS.WEEKLY_RATE,
            status: "exhausted",
            linkedPiwId,
            waitingDaysServed,
            fitNoteRequired: data.fit_note_required ?? false,
            notes: data.notes || null,
            ineligibilityReason: null,
          });

          await this.emitEvent(
            tx,
            context,
            "ssp_record",
            rec.id,
            "ssp.record.exhausted",
            {
              record: this.mapRecordToResponse(rec),
              reason: "SSP exhausted in linked PIW chain",
            }
          );

          return rec;
        });

        return {
          success: true,
          data: this.mapRecordToResponse(record),
        };
      }
    }

    // Create the SSP record
    const record = await this.db.withTransaction(context, async (tx) => {
      const rec = await this.repository.createRecord(tx, context, {
        employeeId: data.employee_id,
        startDate: data.start_date,
        qualifyingDaysPattern,
        weeklyRate: SSP_CONSTANTS.WEEKLY_RATE,
        status: "active",
        linkedPiwId,
        waitingDaysServed,
        fitNoteRequired: data.fit_note_required ?? false,
        notes: data.notes || null,
        ineligibilityReason: null,
      });

      await this.emitEvent(
        tx,
        context,
        "ssp_record",
        rec.id,
        "ssp.record.created",
        {
          record: this.mapRecordToResponse(rec),
          linkedPiwId,
        }
      );

      return rec;
    });

    return {
      success: true,
      data: this.mapRecordToResponse(record),
    };
  }

  // ===========================================================================
  // End SSP
  // ===========================================================================

  async endSSP(
    context: TenantContext,
    id: string,
    data: EndSSPRecord
  ): Promise<ServiceResult<SSPRecordDetailResponse>> {
    const record = await this.repository.findRecordById(context, id);

    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "SSP record not found",
          details: { id },
        },
      };
    }

    if (record.status !== "active") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot end SSP record with status '${record.status}'. Only active records can be ended.`,
          details: { currentStatus: record.status },
        },
      };
    }

    const endDate = new Date(data.end_date);
    const startDate = new Date(record.startDate);

    if (endDate < startDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "End date cannot be before start date",
          details: {
            startDate: record.startDate,
            endDate: data.end_date,
          },
        },
      };
    }

    // Get the max remaining days accounting for linked PIW chain
    const maxRemainingDays = await this.getMaxRemainingDaysAsync(context, record);

    // Calculate SSP for the full period
    const calculation = this.calculateDailySSP(
      startDate,
      endDate,
      record.qualifyingDaysPattern as number[],
      parseFloat(record.weeklyRate),
      record.waitingDaysServed,
      maxRemainingDays
    );

    // Update record and insert daily log in same transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      // Clear existing daily log and recalculate
      await this.repository.deleteDailyLogFrom(
        tx,
        context,
        id,
        this.formatDate(startDate)
      );

      // Insert daily log entries
      if (calculation.dailyEntries.length > 0) {
        await this.repository.addDailyLogEntries(tx, context, calculation.dailyEntries.map((e) => ({
          sspRecordId: id,
          logDate: e.date,
          dayType: e.dayType,
          amount: e.amount,
        })));
      }

      // Determine final status
      const qualifyingDaysPerWeek = (record.qualifyingDaysPattern as number[]).length;
      const maxQualifyingDays = SSP_CONSTANTS.MAX_WEEKS * qualifyingDaysPerWeek;

      const totalPaidInChain = record.linkedPiwId
        ? await this.repository.getTotalPaidDaysInLinkedPIW(
            context,
            record.employeeId,
            record.linkedPiwId
          )
        : 0;

      const combinedPaid = totalPaidInChain + calculation.totalDaysPaid;
      const finalStatus = combinedPaid >= maxQualifyingDays ? "exhausted" : "completed";

      const updated = await this.repository.updateRecord(tx, context, id, {
        endDate: data.end_date,
        waitingDaysServed: calculation.waitingDaysServed,
        totalDaysPaid: calculation.totalDaysPaid,
        totalAmountPaid: calculation.totalAmountPaid,
        status: finalStatus,
        notes: data.notes || undefined,
      });

      const eventType: DomainEventType =
        finalStatus === "exhausted" ? "ssp.record.exhausted" : "ssp.record.ended";

      await this.emitEvent(
        tx,
        context,
        "ssp_record",
        id,
        eventType,
        {
          record: updated ? this.mapRecordToResponse(updated) : null,
          calculation: {
            totalDaysPaid: calculation.totalDaysPaid,
            totalAmountPaid: calculation.totalAmountPaid,
            waitingDaysServed: calculation.waitingDaysServed,
          },
        }
      );

      return updated;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to update SSP record",
        },
      };
    }

    // Fetch the daily log for the response
    const dailyLog = await this.repository.getDailyLog(context, id);

    return {
      success: true,
      data: this.mapRecordToDetailResponse(result, dailyLog),
    };
  }

  // ===========================================================================
  // Update SSP Record
  // ===========================================================================

  async updateRecord(
    context: TenantContext,
    id: string,
    data: UpdateSSPRecord
  ): Promise<ServiceResult<SSPRecordResponse>> {
    const record = await this.repository.findRecordById(context, id);

    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "SSP record not found",
          details: { id },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateRecord(tx, context, id, {
        endDate: data.end_date,
        fitNoteRequired: data.fit_note_required,
        notes: data.notes,
        qualifyingDaysPattern: data.qualifying_days_pattern,
      });

      if (updated) {
        await this.emitEvent(
          tx,
          context,
          "ssp_record",
          id,
          "ssp.record.updated",
          {
            record: this.mapRecordToResponse(updated),
            changes: data,
          }
        );
      }

      return updated;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to update SSP record",
        },
      };
    }

    return {
      success: true,
      data: this.mapRecordToResponse(result),
    };
  }

  // ===========================================================================
  // Eligibility Check
  // ===========================================================================

  /**
   * Check if an employee is eligible for SSP.
   *
   * Checks:
   * 1. Employee exists
   * 2. Employee is an active employee (not terminated, not self-employed)
   * 3. Weekly earnings meet or exceed the Lower Earnings Limit (LEL)
   * 4. No active SSP record already running
   *
   * Uses the compensation_history table to derive weekly earnings
   * from base_salary and pay_frequency.
   */
  async checkEligibility(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<SSPEligibilityResponse>> {
    const reasons: string[] = [];
    let eligible = true;
    let weeklyEarnings: number | null = null;
    let employmentStatus: string | null = null;

    // Check employee existence and get earnings data
    const empData = await this.repository.getEmployeeEarnings(context, employeeId);

    if (!empData) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employeeId },
        },
      };
    }

    employmentStatus = empData.status;

    // Check employment status: must be an active employee
    if (empData.status === "terminated") {
      eligible = false;
      reasons.push("Employee is terminated and not eligible for SSP");
    } else if (empData.status === "pending") {
      eligible = false;
      reasons.push("Employee has not started employment yet (status: pending)");
    }

    // Check earnings against Lower Earnings Limit
    if (empData.baseSalary !== null && empData.payFrequency !== null) {
      const baseSalary = parseFloat(empData.baseSalary);
      weeklyEarnings = calculateWeeklyEarnings(baseSalary, empData.payFrequency);

      if (weeklyEarnings < SSP_CONSTANTS.LOWER_EARNINGS_LIMIT) {
        eligible = false;
        reasons.push(
          `Weekly earnings (£${weeklyEarnings.toFixed(2)}) are below the Lower Earnings Limit (£${SSP_CONSTANTS.LOWER_EARNINGS_LIMIT.toFixed(2)}/week)`
        );
      }
    } else {
      reasons.push(
        "No current compensation record found. Earnings check could not be performed — SSP eligibility unconfirmed."
      );
    }

    // Check currency: SSP only applies to GBP-paid employees
    if (empData.currency && empData.currency !== "GBP") {
      reasons.push(
        `Employee is paid in ${empData.currency}. SSP applies to UK employees paid in GBP. Manual verification required.`
      );
    }

    // Check for existing active SSP record
    const activeRecords = await this.repository.findActiveRecordsByEmployee(
      context,
      employeeId
    );
    const hasActiveSSP = activeRecords.length > 0;

    if (hasActiveSSP) {
      reasons.push("Employee already has an active SSP record");
    }

    if (eligible && reasons.length === 0) {
      reasons.push("Employee meets all SSP qualifying conditions");
    }

    return {
      success: true,
      data: {
        employee_id: employeeId,
        eligible,
        reasons,
        weekly_earnings: weeklyEarnings !== null
          ? Math.round(weeklyEarnings * 100) / 100
          : null,
        lower_earnings_limit: SSP_CONSTANTS.LOWER_EARNINGS_LIMIT,
        has_active_ssp: hasActiveSSP,
        employment_status: employmentStatus,
      },
    };
  }

  // ===========================================================================
  // Entitlement Check
  // ===========================================================================

  async getEntitlement(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<SSPEntitlementResponse>> {
    const allRecords = await this.repository.findAllRecordsByEmployee(
      context,
      employeeId
    );

    // Find the active record (if any)
    const activeRecord = allRecords.find((r) => r.status === "active");

    // Calculate qualifying days per week (use active record's pattern or default)
    const qualifyingDaysPerWeek = activeRecord
      ? (activeRecord.qualifyingDaysPattern as number[]).length
      : 5;

    const maxQualifyingDays = SSP_CONSTANTS.MAX_WEEKS * qualifyingDaysPerWeek;

    // Calculate total used qualifying days across linked PIWs
    // We need to find the current PIW chain
    let usedQualifyingDays = 0;

    if (activeRecord) {
      // Get days from the current record
      usedQualifyingDays = activeRecord.totalDaysPaid;

      // Add days from linked PIW chain
      if (activeRecord.linkedPiwId) {
        const chainDays = await this.repository.getTotalPaidDaysInLinkedPIW(
          context,
          employeeId,
          activeRecord.linkedPiwId
        );
        usedQualifyingDays += chainDays;
      }
    } else {
      // No active record - check if there's a recent completed PIW that would link
      // to a new absence. Use the most recent record's chain.
      const recentRecords = allRecords.filter(
        (r) => r.status === "completed" || r.status === "exhausted"
      );

      if (recentRecords.length > 0) {
        const mostRecent = recentRecords[0]!;
        const daysSinceEnd = mostRecent.endDate
          ? Math.floor(
              (Date.now() - new Date(mostRecent.endDate).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : 0;

        // Only count if within linking window
        if (daysSinceEnd <= SSP_CONSTANTS.PIW_LINKING_GAP_DAYS) {
          usedQualifyingDays = mostRecent.totalDaysPaid;
          if (mostRecent.linkedPiwId) {
            const chainDays =
              await this.repository.getTotalPaidDaysInLinkedPIW(
                context,
                employeeId,
                mostRecent.linkedPiwId
              );
            usedQualifyingDays += chainDays;
          }
        }
      }
    }

    const remainingQualifyingDays = Math.max(
      0,
      maxQualifyingDays - usedQualifyingDays
    );
    const usedWeeks = usedQualifyingDays / qualifyingDaysPerWeek;
    const remainingWeeks = remainingQualifyingDays / qualifyingDaysPerWeek;

    const dailyRate =
      qualifyingDaysPerWeek > 0
        ? SSP_CONSTANTS.WEEKLY_RATE / qualifyingDaysPerWeek
        : 0;

    return {
      success: true,
      data: {
        employee_id: employeeId,
        max_weeks: SSP_CONSTANTS.MAX_WEEKS,
        max_qualifying_days: maxQualifyingDays,
        used_qualifying_days: usedQualifyingDays,
        remaining_qualifying_days: remainingQualifyingDays,
        used_weeks: Math.round(usedWeeks * 100) / 100,
        remaining_weeks: Math.round(remainingWeeks * 100) / 100,
        weekly_rate: SSP_CONSTANTS.WEEKLY_RATE,
        daily_rate: Math.round(dailyRate * 100) / 100,
        has_active_ssp: activeRecord !== undefined,
        active_ssp_record_id: activeRecord?.id || null,
      },
    };
  }

  // ===========================================================================
  // SSP Calculation Projection (POST /calculate)
  // ===========================================================================

  /**
   * Calculate projected SSP entitlement for a given sickness period.
   * This is a read-only projection -- it does not create any records.
   *
   * Steps:
   * 1. Verify employee eligibility (earnings, employment status)
   * 2. Check if the sickness period meets the 4-day minimum
   * 3. Check for PIW linking with previous SSP records
   * 4. Calculate waiting days, paid days, and daily breakdown
   * 5. Determine if a fit note is required (7+ calendar days)
   */
  async calculateSSPEntitlement(
    context: TenantContext,
    data: CalculateSSP
  ): Promise<ServiceResult<SSPCalculationResponse>> {
    const { employee_id, sickness_start, sickness_end } = data;
    const qualifyingDaysPattern = data.qualifying_days_pattern || [1, 2, 3, 4, 5];
    const qualifyingDaysPerWeek = qualifyingDaysPattern.length;

    const startDate = new Date(sickness_start);
    const endDate = new Date(sickness_end);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(0, 0, 0, 0);

    // Validate date range
    if (endDate < startDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Sickness end date cannot be before start date",
          details: { sickness_start, sickness_end },
        },
      };
    }

    // Calculate total calendar days (inclusive)
    const totalCalendarDays = Math.floor(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    const ineligibilityReasons: string[] = [];
    let eligible = true;

    // Check minimum incapacity period: must be 4+ consecutive calendar days
    if (totalCalendarDays < SSP_CONSTANTS.MIN_INCAPACITY_DAYS) {
      eligible = false;
      ineligibilityReasons.push(
        `Sickness period is ${totalCalendarDays} calendar days. SSP requires at least ${SSP_CONSTANTS.MIN_INCAPACITY_DAYS} consecutive days of incapacity.`
      );
    }

    // Check earnings and employment status
    const empData = await this.repository.getEmployeeEarnings(context, employee_id);

    if (!empData) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employee_id },
        },
      };
    }

    if (empData.status === "terminated") {
      eligible = false;
      ineligibilityReasons.push("Employee is terminated");
    }

    if (empData.baseSalary !== null && empData.payFrequency !== null) {
      const baseSalary = parseFloat(empData.baseSalary);
      const weeklyEarnings = calculateWeeklyEarnings(baseSalary, empData.payFrequency);

      if (weeklyEarnings < SSP_CONSTANTS.LOWER_EARNINGS_LIMIT) {
        eligible = false;
        ineligibilityReasons.push(
          `Weekly earnings (£${weeklyEarnings.toFixed(2)}) below Lower Earnings Limit (£${SSP_CONSTANTS.LOWER_EARNINGS_LIMIT.toFixed(2)})`
        );
      }
    }

    // Fit note determination
    const fitNoteRequired = totalCalendarDays > SSP_CONSTANTS.FIT_NOTE_REQUIRED_AFTER_DAYS;
    let fitNoteRequiredFrom: string | null = null;
    if (fitNoteRequired) {
      // Fit note is required from day 8 onwards
      const fitNoteDate = new Date(startDate);
      fitNoteDate.setUTCDate(fitNoteDate.getUTCDate() + SSP_CONSTANTS.FIT_NOTE_REQUIRED_AFTER_DAYS);
      fitNoteRequiredFrom = this.formatDate(fitNoteDate);
    }

    // Check PIW linking
    const linkablePIWs = await this.repository.findLinkablePIWs(
      context,
      employee_id,
      sickness_start
    );

    let linkedPiwId: string | null = null;
    let existingWaitingDaysServed = 0;
    let usedDaysInChain = 0;
    const linksToPreviousPIW = linkablePIWs.length > 0;

    if (linksToPreviousPIW) {
      const previousPIW = linkablePIWs[0]!;
      linkedPiwId = previousPIW.linkedPiwId || previousPIW.id;

      // Waiting days carry over from previous PIW
      existingWaitingDaysServed = Math.min(
        previousPIW.waitingDaysServed,
        SSP_CONSTANTS.WAITING_DAYS
      );

      // Get total paid days already used in the chain
      usedDaysInChain = await this.repository.getTotalPaidDaysInLinkedPIW(
        context,
        employee_id,
        linkedPiwId
      );
    }

    // Calculate the max remaining paid days
    const maxQualifyingDays = SSP_CONSTANTS.MAX_WEEKS * qualifyingDaysPerWeek;
    const maxRemainingDays = Math.max(0, maxQualifyingDays - usedDaysInChain);

    // Calculate daily SSP breakdown
    const calculation = this.calculateDailySSP(
      startDate,
      endDate,
      qualifyingDaysPattern,
      SSP_CONSTANTS.WEEKLY_RATE,
      existingWaitingDaysServed,
      eligible ? maxRemainingDays : 0 // No paid days if ineligible
    );

    // Count qualifying days in the period
    const qualifyingDaysInPeriod = calculation.dailyEntries.filter(
      (e) => e.dayType === "waiting" || e.dayType === "paid"
    ).length;

    // Calculate remaining weeks after this period
    const totalPaidAfter = usedDaysInChain + calculation.totalDaysPaid;
    const remainingDaysAfter = Math.max(0, maxQualifyingDays - totalPaidAfter);
    const remainingWeeksAfter = qualifyingDaysPerWeek > 0
      ? remainingDaysAfter / qualifyingDaysPerWeek
      : 0;

    const dailyRate = qualifyingDaysPerWeek > 0
      ? SSP_CONSTANTS.WEEKLY_RATE / qualifyingDaysPerWeek
      : 0;

    return {
      success: true,
      data: {
        employee_id,
        sickness_start,
        sickness_end,
        eligible,
        ineligibility_reasons: ineligibilityReasons,
        total_calendar_days: totalCalendarDays,
        qualifying_days_in_period: qualifyingDaysInPeriod,
        waiting_days: calculation.waitingDaysServed - existingWaitingDaysServed,
        paid_days: calculation.totalDaysPaid,
        total_ssp_amount: calculation.totalAmountPaid,
        weekly_rate: SSP_CONSTANTS.WEEKLY_RATE,
        daily_rate: Math.round(dailyRate * 100) / 100,
        fit_note_required: fitNoteRequired,
        fit_note_required_from: fitNoteRequiredFrom,
        links_to_previous_piw: linksToPreviousPIW,
        linked_piw_id: linkedPiwId,
        remaining_weeks_after: Math.round(remainingWeeksAfter * 100) / 100,
        daily_breakdown: calculation.dailyEntries.map((e) => ({
          date: e.date,
          day_type: e.dayType,
          amount: e.amount,
        })),
      },
    };
  }

  // ===========================================================================
  // Get Linking Periods
  // ===========================================================================

  /**
   * Get all SSP records in the PIW chain linked to a given record or employee.
   * Returns the full chain of linked PIWs for audit and review.
   */
  async getLinkingPeriods(
    context: TenantContext,
    employeeId: string,
    currentRecordId?: string
  ): Promise<ServiceResult<SSPRecordResponse[]>> {
    // If a specific record is given, find its root and walk the chain
    if (currentRecordId) {
      const record = await this.repository.findRecordById(context, currentRecordId);
      if (!record) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "SSP record not found",
            details: { id: currentRecordId },
          },
        };
      }

      const rootPiwId = record.linkedPiwId || record.id;
      const chain = await this.repository.getLinkedPIWChain(
        context,
        employeeId,
        rootPiwId
      );

      return {
        success: true,
        data: chain.map(this.mapRecordToResponse),
      };
    }

    // No specific record: find the most recent PIW chain
    const allRecords = await this.repository.findAllRecordsByEmployee(
      context,
      employeeId
    );

    if (allRecords.length === 0) {
      return {
        success: true,
        data: [],
      };
    }

    // Find the active record or the most recent one
    const anchorRecord = allRecords.find((r) => r.status === "active") || allRecords[0]!;
    const rootPiwId = anchorRecord.linkedPiwId || anchorRecord.id;

    const chain = await this.repository.getLinkedPIWChain(
      context,
      employeeId,
      rootPiwId
    );

    return {
      success: true,
      data: chain.map(this.mapRecordToResponse),
    };
  }

  // ===========================================================================
  // Get Remaining SSP Weeks
  // ===========================================================================

  /**
   * Get the remaining SSP weeks for an employee.
   * Simplified view of entitlement focused on weeks remaining.
   */
  async getRemainingSSPWeeks(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<{ remaining_weeks: number; max_weeks: number; used_weeks: number }>> {
    const entitlementResult = await this.getEntitlement(context, employeeId);

    if (!entitlementResult.success) {
      return entitlementResult as ServiceResult<never>;
    }

    const ent = entitlementResult.data!;
    return {
      success: true,
      data: {
        remaining_weeks: ent.remaining_weeks,
        max_weeks: ent.max_weeks,
        used_weeks: ent.used_weeks,
      },
    };
  }

  // ===========================================================================
  // Employee SSP History
  // ===========================================================================

  /**
   * Get full SSP history for an employee including all records and fit notes.
   */
  async getHistory(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<SSPHistoryResponse>> {
    const allRecords = await this.repository.findAllRecordsByEmployee(
      context,
      employeeId
    );

    const fitNotes = await this.repository.findFitNotesByEmployee(
      context,
      employeeId
    );

    const summary = await this.repository.getEmployeeSSPSummary(
      context,
      employeeId
    );

    return {
      success: true,
      data: {
        employee_id: employeeId,
        records: allRecords.map(this.mapRecordToResponse),
        fit_notes: fitNotes.map(this.mapFitNoteToResponse),
        total_ssp_paid: summary.totalAmountPaid,
        total_days_paid: summary.totalDaysPaid,
        total_records: allRecords.length,
      },
    };
  }

  // ===========================================================================
  // Fit Note Operations
  // ===========================================================================

  /**
   * Create a fit note for an SSP record.
   * Validates that the SSP record exists and belongs to the employee.
   */
  async createFitNote(
    context: TenantContext,
    data: CreateFitNote
  ): Promise<ServiceResult<SSPFitNoteResponse>> {
    // Verify the SSP record exists
    const record = await this.repository.findRecordById(context, data.ssp_record_id);
    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "SSP record not found",
          details: { ssp_record_id: data.ssp_record_id },
        },
      };
    }

    const fitNote = await this.db.withTransaction(context, async (tx) => {
      const note = await this.repository.createFitNote(tx, context, {
        sspRecordId: data.ssp_record_id,
        employeeId: record.employeeId,
        status: data.status || "pending",
        coverFrom: data.cover_from,
        coverTo: data.cover_to || null,
        documentId: data.document_id || null,
        issuingDoctor: data.issuing_doctor || null,
        diagnosis: data.diagnosis || null,
        notes: data.notes || null,
        mayBeFit: data.may_be_fit ?? false,
        adjustments: data.adjustments || null,
        receivedDate: data.received_date || null,
      });

      // Update the SSP record's fit_note_required flag
      await this.repository.updateRecord(tx, context, data.ssp_record_id, {
        fitNoteRequired: true,
      });

      await this.emitEvent(
        tx,
        context,
        "ssp_fit_note",
        note.id,
        "ssp.fit_note.created",
        {
          fitNote: this.mapFitNoteToResponse(note),
          sspRecordId: data.ssp_record_id,
        }
      );

      return note;
    });

    return {
      success: true,
      data: this.mapFitNoteToResponse(fitNote),
    };
  }

  /**
   * Update a fit note.
   */
  async updateFitNote(
    context: TenantContext,
    id: string,
    data: UpdateFitNote
  ): Promise<ServiceResult<SSPFitNoteResponse>> {
    const existing = await this.repository.findFitNoteById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Fit note not found",
          details: { id },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateFitNote(tx, context, id, {
        status: data.status,
        coverTo: data.cover_to,
        documentId: data.document_id,
        issuingDoctor: data.issuing_doctor,
        diagnosis: data.diagnosis,
        notes: data.notes,
        mayBeFit: data.may_be_fit,
        adjustments: data.adjustments,
        receivedDate: data.received_date,
      });

      if (updated) {
        await this.emitEvent(
          tx,
          context,
          "ssp_fit_note",
          id,
          "ssp.fit_note.updated",
          {
            fitNote: this.mapFitNoteToResponse(updated),
            changes: data,
          }
        );
      }

      return updated;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to update fit note",
        },
      };
    }

    return {
      success: true,
      data: this.mapFitNoteToResponse(result),
    };
  }

  /**
   * Get fit notes for an SSP record.
   */
  async getFitNotesByRecord(
    context: TenantContext,
    sspRecordId: string
  ): Promise<ServiceResult<SSPFitNoteResponse[]>> {
    const record = await this.repository.findRecordById(context, sspRecordId);
    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "SSP record not found",
          details: { ssp_record_id: sspRecordId },
        },
      };
    }

    const fitNotes = await this.repository.findFitNotesByRecord(context, sspRecordId);

    return {
      success: true,
      data: fitNotes.map(this.mapFitNoteToResponse),
    };
  }

  // ===========================================================================
  // SSP Calculation Logic
  // ===========================================================================

  /**
   * Calculate daily SSP amounts for a date range.
   *
   * Rules:
   * 1. Only qualifying days (days the employee normally works) count
   * 2. First 3 qualifying days are waiting days (no pay)
   * 3. After waiting days, pay = weekly_rate / qualifying_days_per_week per day
   * 4. Maximum total paid days = 28 * qualifying_days_per_week
   */
  private calculateDailySSP(
    startDate: Date,
    endDate: Date,
    qualifyingDaysPattern: number[],
    weeklyRate: number,
    existingWaitingDaysServed: number,
    maxRemainingDays: number
  ): {
    dailyEntries: Array<{ date: string; dayType: SSPDayType; amount: number }>;
    totalDaysPaid: number;
    totalAmountPaid: number;
    waitingDaysServed: number;
  } {
    const dailyEntries: Array<{
      date: string;
      dayType: SSPDayType;
      amount: number;
    }> = [];
    let waitingDaysServed = existingWaitingDaysServed;
    let totalDaysPaid = 0;
    let totalAmountPaid = 0;

    const dailyRate =
      qualifyingDaysPattern.length > 0
        ? weeklyRate / qualifyingDaysPattern.length
        : 0;

    const current = new Date(startDate);
    // Normalize to midnight UTC to avoid timezone issues
    current.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(0, 0, 0, 0);

    while (current <= end) {
      const isoDay = this.getISODayOfWeek(current);
      const dateStr = this.formatDate(current);

      if (qualifyingDaysPattern.includes(isoDay)) {
        // This is a qualifying day
        if (waitingDaysServed < SSP_CONSTANTS.WAITING_DAYS) {
          // Still in waiting period
          dailyEntries.push({
            date: dateStr,
            dayType: "waiting",
            amount: 0,
          });
          waitingDaysServed++;
        } else if (totalDaysPaid < maxRemainingDays) {
          // Paid qualifying day
          const amount = Math.round(dailyRate * 100) / 100;
          dailyEntries.push({
            date: dateStr,
            dayType: "paid",
            amount,
          });
          totalDaysPaid++;
          totalAmountPaid += amount;
        } else {
          // Exhausted - no more paid days available
          dailyEntries.push({
            date: dateStr,
            dayType: "non_qualifying",
            amount: 0,
          });
        }
      } else {
        // Non-qualifying day (weekend, etc.)
        dailyEntries.push({
          date: dateStr,
          dayType: "non_qualifying",
          amount: 0,
        });
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    totalAmountPaid = Math.round(totalAmountPaid * 100) / 100;

    return {
      dailyEntries,
      totalDaysPaid,
      totalAmountPaid,
      waitingDaysServed,
    };
  }

  /**
   * Get the maximum remaining paid days for a record, considering linked PIWs.
   * Queries the database for linked PIW chain totals.
   */
  private async getMaxRemainingDaysAsync(
    context: TenantContext,
    record: SSPRecordRow
  ): Promise<number> {
    const qualifyingDaysPerWeek = (
      record.qualifyingDaysPattern as number[]
    ).length;
    const maxQualifyingDays = SSP_CONSTANTS.MAX_WEEKS * qualifyingDaysPerWeek;

    // Get days already paid in the linked chain (excluding this record)
    let usedInChain = 0;
    if (record.linkedPiwId) {
      usedInChain = await this.repository.getTotalPaidDaysInLinkedPIW(
        context,
        record.employeeId,
        record.linkedPiwId
      );
    }

    return Math.max(0, maxQualifyingDays - usedInChain);
  }

  // ===========================================================================
  // Date Helpers
  // ===========================================================================

  /**
   * Get ISO day of week (1=Monday, 7=Sunday) from a Date object
   */
  private getISODayOfWeek(date: Date): number {
    const day = date.getUTCDay(); // 0=Sun, 6=Sat
    return day === 0 ? 7 : day;
  }

  /**
   * Format a Date to YYYY-MM-DD string
   */
  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0]!;
  }

  // ===========================================================================
  // Response Mapping
  // ===========================================================================

  private mapRecordToResponse = (record: SSPRecordRow): SSPRecordResponse => {
    return {
      id: record.id,
      tenant_id: record.tenantId,
      employee_id: record.employeeId,
      start_date: record.startDate instanceof Date
        ? this.formatDate(record.startDate)
        : String(record.startDate),
      end_date: record.endDate
        ? record.endDate instanceof Date
          ? this.formatDate(record.endDate)
          : String(record.endDate)
        : null,
      qualifying_days_pattern: Array.isArray(record.qualifyingDaysPattern)
        ? record.qualifyingDaysPattern
        : JSON.parse(String(record.qualifyingDaysPattern)),
      waiting_days_served: record.waitingDaysServed,
      total_days_paid: record.totalDaysPaid,
      total_amount_paid: parseFloat(String(record.totalAmountPaid)),
      weekly_rate: parseFloat(String(record.weeklyRate)),
      status: record.status,
      linked_piw_id: record.linkedPiwId,
      fit_note_required: record.fitNoteRequired,
      notes: record.notes,
      ineligibility_reason: record.ineligibilityReason,
      created_at: record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : String(record.createdAt),
      updated_at: record.updatedAt instanceof Date
        ? record.updatedAt.toISOString()
        : String(record.updatedAt),
    };
  };

  private mapDailyLogToResponse = (
    entry: SSPDailyLogRow
  ): SSPDailyLogResponse => {
    return {
      id: entry.id,
      ssp_record_id: entry.sspRecordId,
      log_date: entry.logDate instanceof Date
        ? this.formatDate(entry.logDate)
        : String(entry.logDate),
      day_type: entry.dayType,
      amount: parseFloat(String(entry.amount)),
      created_at: entry.createdAt instanceof Date
        ? entry.createdAt.toISOString()
        : String(entry.createdAt),
    };
  };

  private mapRecordToDetailResponse = (
    record: SSPRecordRow,
    dailyLog: SSPDailyLogRow[]
  ): SSPRecordDetailResponse => {
    const base = this.mapRecordToResponse(record);
    return {
      ...base,
      daily_log: dailyLog.map(this.mapDailyLogToResponse),
    };
  };

  private mapFitNoteToResponse = (note: SSPFitNoteRow): SSPFitNoteResponse => {
    return {
      id: note.id,
      ssp_record_id: note.sspRecordId,
      employee_id: note.employeeId,
      status: note.status,
      cover_from: note.coverFrom instanceof Date
        ? this.formatDate(note.coverFrom)
        : String(note.coverFrom),
      cover_to: note.coverTo
        ? note.coverTo instanceof Date
          ? this.formatDate(note.coverTo)
          : String(note.coverTo)
        : null,
      document_id: note.documentId,
      issuing_doctor: note.issuingDoctor,
      diagnosis: note.diagnosis,
      notes: note.notes,
      may_be_fit: note.mayBeFit,
      adjustments: note.adjustments,
      received_date: note.receivedDate
        ? note.receivedDate instanceof Date
          ? this.formatDate(note.receivedDate)
          : String(note.receivedDate)
        : null,
      created_at: note.createdAt instanceof Date
        ? note.createdAt.toISOString()
        : String(note.createdAt),
      updated_at: note.updatedAt instanceof Date
        ? note.updatedAt.toISOString()
        : String(note.updatedAt),
    };
  };
}
