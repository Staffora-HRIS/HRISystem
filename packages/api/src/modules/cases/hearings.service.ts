/**
 * Case Hearings Module - Service Layer
 *
 * Business logic for hearing scheduling and management.
 * Enforces ACAS Code of Practice requirements:
 *   - Minimum 5 working days notice for hearings (para 12)
 *   - Right to be accompanied by trade union rep or colleague (para 14 / s.10 TULRCA 1992)
 *   - Notice period validation: notice_sent_at + minimum_notice_days <= scheduled_date
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { emitDomainEvent } from "../../lib/outbox";
import { HearingsRepository } from "./hearings.repository";
import { CasesRepository } from "./repository";
import type { TenantContext, ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  HearingResponse,
  CreateHearing,
  UpdateHearing,
  HearingStatus,
} from "./hearings.schemas";

// =============================================================================
// Status Transition Rules
// =============================================================================

/**
 * Valid status transitions for hearings.
 */
const VALID_HEARING_TRANSITIONS: Record<HearingStatus, HearingStatus[]> = {
  scheduled: ["postponed", "in_progress", "cancelled"],
  postponed: ["scheduled", "cancelled"],
  in_progress: ["completed", "postponed"],
  completed: [],  // Terminal state
  cancelled: [],  // Terminal state
};

// =============================================================================
// Working Days Calculation
// =============================================================================

/**
 * Count working days between two dates (excludes Saturday and Sunday).
 * Counts from the day after `from` up to (not including) `to`.
 */
function countWorkingDays(from: Date, to: Date): number {
  let count = 0;
  const current = new Date(from);
  current.setDate(current.getDate() + 1);

  while (current < to) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Add working days to a date (excludes Saturday and Sunday).
 * Returns the date that is `days` working days after `from`.
 */
function addWorkingDays(from: Date, days: number): Date {
  const result = new Date(from);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return result;
}

// =============================================================================
// Service
// =============================================================================

export class HearingsService {
  constructor(
    private repository: HearingsRepository,
    private casesRepository: CasesRepository,
    private db: DatabaseClient
  ) {}

  // ---------------------------------------------------------------------------
  // Schedule (Create) Hearing
  // ---------------------------------------------------------------------------

  async scheduleHearing(
    ctx: TenantContext,
    caseId: string,
    data: CreateHearing
  ): Promise<ServiceResult<HearingResponse>> {
    // Verify parent case exists
    const parentCase = await this.casesRepository.getCaseById(ctx, caseId);
    if (!parentCase) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Case not found",
        },
      };
    }

    // Cannot schedule hearings for closed/cancelled cases
    if (["closed", "cancelled"].includes(parentCase.status)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CASE_CLOSED,
          message: `Cannot schedule a hearing for a ${parentCase.status} case`,
        },
      };
    }

    // Validate ACAS notice period: notice_sent_at + minimum_notice_days <= scheduled_date
    const noticeSentAt = data.noticeSentAt ? new Date(data.noticeSentAt) : new Date();
    const scheduledDate = new Date(data.scheduledDate);
    const minimumNoticeDays = data.minimumNoticeDays ?? 5;

    const workingDaysBetween = countWorkingDays(noticeSentAt, scheduledDate);

    if (workingDaysBetween < minimumNoticeDays) {
      const earliestDate = addWorkingDays(noticeSentAt, minimumNoticeDays);
      return {
        success: false,
        error: {
          code: "ACAS_NOTICE_PERIOD",
          message: `Hearing must be scheduled at least ${minimumNoticeDays} working days after notice is sent. Earliest allowed date: ${earliestDate.toISOString().split("T")[0]}. ACAS Code of Practice para 12.`,
          details: {
            noticeSentAt: noticeSentAt.toISOString(),
            scheduledDate: data.scheduledDate,
            minimumNoticeDays,
            workingDaysProvided: workingDaysBetween,
            earliestAllowedDate: earliestDate.toISOString().split("T")[0],
            acasReference: "ACAS Code of Practice on Disciplinary and Grievance Procedures, paragraph 12",
          },
        },
      };
    }

    // Validate companion_type is provided when companion_id is set
    if (data.companionId && !data.companionType) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "companionType is required when companionId is provided. Must be 'trade_union_rep' or 'colleague' per s.10 TULRCA 1992.",
        },
      };
    }

    try {
      const hearing = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createHearing(tx, ctx, caseId, data);

          // Emit domain event atomically within the same transaction
          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "case_hearing",
            aggregateId: result.id,
            eventType: "cases.hearing.scheduled",
            payload: {
              hearingId: result.id,
              caseId,
              hearingType: data.hearingType,
              scheduledDate: data.scheduledDate,
              location: data.location,
              employeeId: data.employeeId,
              chairPersonId: data.chairPersonId || null,
              minimumNoticeDays,
              noticeCompliant: result.noticeCompliant,
            },
            userId: ctx.userId,
          });

          return result;
        }
      );

      return { success: true, data: hearing };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to schedule hearing",
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // List Hearings for a Case
  // ---------------------------------------------------------------------------

  async listHearings(
    ctx: TenantContext,
    caseId: string
  ): Promise<ServiceResult<HearingResponse[]>> {
    // Verify parent case exists
    const parentCase = await this.casesRepository.getCaseById(ctx, caseId);
    if (!parentCase) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Case not found",
        },
      };
    }

    const hearings = await this.repository.listHearingsByCaseId(ctx, caseId);
    return { success: true, data: hearings };
  }

  // ---------------------------------------------------------------------------
  // Get Single Hearing
  // ---------------------------------------------------------------------------

  async getHearing(
    ctx: TenantContext,
    caseId: string,
    hearingId: string
  ): Promise<ServiceResult<HearingResponse>> {
    const hearing = await this.repository.getHearingById(ctx, hearingId);
    if (!hearing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Hearing not found",
        },
      };
    }

    // Verify the hearing belongs to the specified case
    if (hearing.caseId !== caseId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Hearing not found for this case",
        },
      };
    }

    return { success: true, data: hearing };
  }

  // ---------------------------------------------------------------------------
  // Update Hearing
  // ---------------------------------------------------------------------------

  async updateHearing(
    ctx: TenantContext,
    caseId: string,
    hearingId: string,
    data: UpdateHearing
  ): Promise<ServiceResult<HearingResponse>> {
    // Fetch existing hearing
    const existing = await this.repository.getHearingById(ctx, hearingId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Hearing not found",
        },
      };
    }

    // Verify the hearing belongs to the specified case
    if (existing.caseId !== caseId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Hearing not found for this case",
        },
      };
    }

    // Validate status transition if status is being changed
    if (data.status && data.status !== existing.status) {
      const currentStatus = existing.status as keyof typeof VALID_HEARING_TRANSITIONS;
      const validTransitions = VALID_HEARING_TRANSITIONS[currentStatus] || [];
      if (!validTransitions.includes(data.status)) {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition hearing from '${existing.status}' to '${data.status}'. Valid transitions: ${validTransitions.join(", ") || "none (terminal state)"}`,
            details: { currentStatus: existing.status, requestedStatus: data.status, validTransitions },
          },
        };
      }
    }

    // If rescheduling (changing scheduled_date), re-validate ACAS notice period
    if (data.scheduledDate) {
      const noticeSentAt = data.noticeSentAt
        ? new Date(data.noticeSentAt)
        : (existing.noticeSentAt ? new Date(existing.noticeSentAt) : new Date());
      const scheduledDate = new Date(data.scheduledDate);
      const minimumNoticeDays = data.minimumNoticeDays ?? existing.minimumNoticeDays;

      const workingDaysBetween = countWorkingDays(noticeSentAt, scheduledDate);

      if (workingDaysBetween < minimumNoticeDays) {
        const earliestDate = addWorkingDays(noticeSentAt, minimumNoticeDays);
        return {
          success: false,
          error: {
            code: "ACAS_NOTICE_PERIOD",
            message: `Rescheduled hearing must still allow at least ${minimumNoticeDays} working days notice. Earliest allowed date: ${earliestDate.toISOString().split("T")[0]}. ACAS Code of Practice para 12.`,
            details: {
              noticeSentAt: noticeSentAt.toISOString(),
              scheduledDate: data.scheduledDate,
              minimumNoticeDays,
              workingDaysProvided: workingDaysBetween,
              earliestAllowedDate: earliestDate.toISOString().split("T")[0],
              acasReference: "ACAS Code of Practice on Disciplinary and Grievance Procedures, paragraph 12",
            },
          },
        };
      }
    }

    // Validate companion_type when companion_id is provided
    if (data.companionId && !data.companionType && !existing.companionType) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "companionType is required when companionId is provided. Must be 'trade_union_rep' or 'colleague' per s.10 TULRCA 1992.",
        },
      };
    }

    try {
      const hearing = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateHearing(tx, ctx, hearingId, data);

          if (!result) {
            return null;
          }

          // Determine event type based on what changed
          let eventType = "cases.hearing.updated";
          if (data.status === "cancelled") {
            eventType = "cases.hearing.cancelled";
          } else if (data.status === "completed") {
            eventType = "cases.hearing.completed";
          } else if (data.status === "postponed") {
            eventType = "cases.hearing.postponed";
          } else if (data.scheduledDate && data.scheduledDate !== existing.scheduledDate) {
            eventType = "cases.hearing.rescheduled";
          }

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "case_hearing",
            aggregateId: hearingId,
            eventType,
            payload: {
              hearingId,
              caseId,
              previousStatus: existing.status,
              newStatus: data.status || existing.status,
              changes: data,
              employeeId: existing.employeeId,
            },
            userId: ctx.userId,
          });

          return result;
        }
      );

      if (!hearing) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to update hearing",
          },
        };
      }

      return { success: true, data: hearing };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to update hearing",
        },
      };
    }
  }
}
