/**
 * Probation Module - Service Layer
 *
 * Business logic for probation review management.
 * Enforces state machine transitions for probation outcomes.
 * Emits domain events via the outbox pattern for all mutations.
 *
 * Validates:
 * - Employee existence before creating a review
 * - No duplicate pending reviews per employee
 * - Valid outcome transitions (pending -> passed/extended/failed/terminated,
 *   extended -> passed/failed/terminated)
 * - Extension weeks when extending
 * - Automatic reminder scheduling (30 days, 14 days, due date)
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import {
  ProbationRepository,
  type ProbationReviewRow,
  type ProbationReminderRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateProbationReview,
  ExtendProbation,
  CompleteProbation,
  ProbationFilters,
  ProbationReviewResponse,
  ProbationReviewDetailResponse,
  ProbationReminderResponse,
  ProbationOutcome,
  ReminderType,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// State Machine
// =============================================================================

/**
 * Valid outcome transitions for probation reviews.
 *
 * pending   -> passed | extended | failed | terminated
 * extended  -> passed | failed | terminated
 * passed    -> (terminal)
 * failed    -> (terminal)
 * terminated -> (terminal)
 */
const VALID_TRANSITIONS: Record<ProbationOutcome, ProbationOutcome[]> = {
  pending: ["passed", "extended", "failed", "terminated"],
  extended: ["passed", "failed", "terminated"],
  passed: [],
  failed: [],
  terminated: [],
};

// =============================================================================
// Domain Event Types
// =============================================================================

type ProbationEventType =
  | "probation.review.created"
  | "probation.review.extended"
  | "probation.review.completed"
  | "probation.reminders.scheduled";

// =============================================================================
// Mappers
// =============================================================================

function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().split("T")[0];
}

function mapReviewToResponse(row: ProbationReviewRow): ProbationReviewResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    probation_start_date: formatDate(row.probationStartDate) ?? "",
    original_end_date: formatDate(row.originalEndDate) ?? "",
    current_end_date: formatDate(row.currentEndDate) ?? "",
    review_date: formatDate(row.reviewDate),
    reviewer_id: row.reviewerId,
    outcome: row.outcome as ProbationOutcome,
    extension_weeks: row.extensionWeeks,
    performance_notes: row.performanceNotes,
    areas_of_concern: row.areasOfConcern,
    development_plan: row.developmentPlan,
    recommendation: row.recommendation,
    meeting_date: formatDate(row.meetingDate),
    meeting_notes: row.meetingNotes,
    employee_number: row.employeeNumber,
    employee_name: row.employeeName,
    days_remaining: row.daysRemaining,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function mapReminderToResponse(row: ProbationReminderRow): ProbationReminderResponse {
  return {
    id: row.id,
    probation_review_id: row.probationReviewId,
    reminder_type: row.reminderType as ReminderType,
    scheduled_date: formatDate(row.scheduledDate) ?? "",
    sent: row.sent,
    sent_at: row.sentAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

// =============================================================================
// Reminder Scheduling
// =============================================================================

/**
 * Calculate reminder dates based on the probation end date.
 * Only schedules reminders that are in the future.
 */
function calculateReminders(
  endDate: string
): Array<{ reminderType: ReminderType; scheduledDate: string }> {
  const end = new Date(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reminders: Array<{ reminderType: ReminderType; scheduledDate: string }> = [];

  // 30 days before end
  const thirtyDaysBefore = new Date(end);
  thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - 30);
  if (thirtyDaysBefore >= today) {
    reminders.push({
      reminderType: "30_day_warning",
      scheduledDate: thirtyDaysBefore.toISOString().split("T")[0],
    });
  }

  // 14 days before end
  const fourteenDaysBefore = new Date(end);
  fourteenDaysBefore.setDate(fourteenDaysBefore.getDate() - 14);
  if (fourteenDaysBefore >= today) {
    reminders.push({
      reminderType: "14_day_warning",
      scheduledDate: fourteenDaysBefore.toISOString().split("T")[0],
    });
  }

  // On the due date
  if (end >= today) {
    reminders.push({
      reminderType: "review_due",
      scheduledDate: endDate,
    });
  }

  return reminders;
}

// =============================================================================
// Service
// =============================================================================

export class ProbationService {
  constructor(
    private repository: ProbationRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox within the same transaction as the business write
   */
  private async emitEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    aggregateId: string,
    eventType: ProbationEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        'probation_review',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: ctx.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // List Operations
  // ===========================================================================

  /**
   * List probation reviews with filters and pagination.
   */
  async listReviews(
    ctx: TenantContext,
    filters: ProbationFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<ProbationReviewResponse>> {
    const result = await this.repository.listReviews(ctx, filters, pagination);
    return {
      items: result.items.map(mapReviewToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * List upcoming probation reviews (pending reviews due within next N days).
   */
  async listUpcoming(
    ctx: TenantContext,
    daysAhead: number,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<ProbationReviewResponse>> {
    const result = await this.repository.listUpcoming(ctx, daysAhead, pagination);
    return {
      items: result.items.map(mapReviewToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * List overdue probation reviews (pending reviews past their end date).
   */
  async listOverdue(
    ctx: TenantContext,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<ProbationReviewResponse>> {
    const result = await this.repository.listOverdue(ctx, pagination);
    return {
      items: result.items.map(mapReviewToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Get Operations
  // ===========================================================================

  /**
   * Get a probation review by ID with its reminders.
   */
  async getReview(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<ProbationReviewDetailResponse>> {
    const review = await this.repository.getReviewById(ctx, id);
    if (!review) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Probation review not found",
          details: { id },
        },
      };
    }

    const reminders = await this.repository.getRemindersForReview(ctx, id);

    return {
      success: true,
      data: {
        review: mapReviewToResponse(review),
        reminders: reminders.map(mapReminderToResponse),
      },
    };
  }

  // ===========================================================================
  // Create Operations
  // ===========================================================================

  /**
   * Create a probation review for an employee.
   * Validates:
   * - Employee exists
   * - No duplicate pending review for the employee
   * - Start date is before end date
   * Schedules reminders automatically.
   */
  async createReview(
    ctx: TenantContext,
    data: CreateProbationReview
  ): Promise<ServiceResult<ProbationReviewDetailResponse>> {
    // Validate dates
    if (data.original_end_date < data.probation_start_date) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Probation end date must be after start date",
          details: {
            probation_start_date: data.probation_start_date,
            original_end_date: data.original_end_date,
          },
        },
      };
    }

    // Check for existing pending review
    const existing = await this.repository.findPendingReviewForEmployee(
      ctx,
      data.employee_id
    );
    if (existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Employee already has a pending probation review",
          details: {
            existing_review_id: existing.id,
            employee_id: data.employee_id,
          },
        },
      };
    }

    // Verify employee exists
    const employeeExists = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx`
        SELECT id FROM employees WHERE id = ${data.employee_id}::uuid LIMIT 1
      `;
      return rows.length > 0;
    });

    if (!employeeExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employee_id: data.employee_id },
        },
      };
    }

    // Create review and schedule reminders in same transaction
    const currentEndDate = data.current_end_date || data.original_end_date;
    const reminderDates = calculateReminders(currentEndDate);

    const result = await this.db.withTransaction(ctx, async (tx) => {
      // Create the review
      const review = await this.repository.createReview(ctx, data, tx);

      // Schedule reminders
      const reminders = await this.repository.createReminders(
        ctx,
        review.id,
        reminderDates,
        tx
      );

      // Emit domain event
      await this.emitEvent(tx, ctx, review.id, "probation.review.created", {
        review: {
          id: review.id,
          employeeId: data.employee_id,
          probationStartDate: data.probation_start_date,
          originalEndDate: data.original_end_date,
          currentEndDate,
        },
        remindersScheduled: reminderDates.length,
      });

      return { review, reminders };
    });

    return {
      success: true,
      data: {
        review: mapReviewToResponse(result.review),
        reminders: result.reminders.map(mapReminderToResponse),
      },
    };
  }

  // ===========================================================================
  // Extend Operations
  // ===========================================================================

  /**
   * Extend a probation review.
   * Only valid from 'pending' or 'extended' outcome.
   * Recalculates end date and reschedules reminders.
   */
  async extendReview(
    ctx: TenantContext,
    id: string,
    data: ExtendProbation
  ): Promise<ServiceResult<ProbationReviewDetailResponse>> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      // Get current review
      const review = await this.repository.getReviewByIdTx(id, tx);
      if (!review) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Probation review not found",
            details: { id },
          },
        };
      }

      // Validate state transition
      const currentOutcome = review.outcome as ProbationOutcome;
      const allowed = VALID_TRANSITIONS[currentOutcome] || [];
      if (!allowed.includes("extended")) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot extend probation from outcome '${currentOutcome}'`,
            details: {
              currentOutcome,
              allowedTransitions: allowed,
            },
          },
        };
      }

      // Calculate new end date
      const currentEnd = new Date(review.currentEndDate);
      const newEnd = new Date(currentEnd);
      newEnd.setDate(newEnd.getDate() + data.extension_weeks * 7);
      const newEndDate = newEnd.toISOString().split("T")[0];

      // Update the review
      const updated = await this.repository.extendReview(
        id,
        newEndDate,
        data.extension_weeks,
        {
          performanceNotes: data.performance_notes,
          areasOfConcern: data.areas_of_concern,
          developmentPlan: data.development_plan,
          recommendation: data.recommendation,
        },
        tx
      );

      if (!updated) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Failed to update probation review",
            details: { id },
          },
        };
      }

      // Delete old unsent reminders and create new ones
      await this.repository.deleteUnsentReminders(id, tx);
      const newReminders = calculateReminders(newEndDate);
      const reminders = await this.repository.createReminders(
        ctx,
        id,
        newReminders,
        tx
      );

      // Emit domain event
      await this.emitEvent(tx, ctx, id, "probation.review.extended", {
        review: {
          id,
          employeeId: review.employeeId,
          previousEndDate: formatDate(review.currentEndDate),
          newEndDate,
          extensionWeeks: data.extension_weeks,
        },
        remindersRescheduled: newReminders.length,
      });

      return {
        success: true as const,
        data: {
          review: mapReviewToResponse(updated),
          reminders: reminders.map(mapReminderToResponse),
        },
      };
    });

    return result;
  }

  // ===========================================================================
  // Complete Operations
  // ===========================================================================

  /**
   * Complete a probation review with a final outcome.
   * Only valid from 'pending' or 'extended' outcome.
   * Clears unsent reminders after completion.
   */
  async completeReview(
    ctx: TenantContext,
    id: string,
    data: CompleteProbation
  ): Promise<ServiceResult<ProbationReviewDetailResponse>> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      // Get current review
      const review = await this.repository.getReviewByIdTx(id, tx);
      if (!review) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Probation review not found",
            details: { id },
          },
        };
      }

      // Validate state transition
      const currentOutcome = review.outcome as ProbationOutcome;
      const allowed = VALID_TRANSITIONS[currentOutcome] || [];
      if (!allowed.includes(data.outcome)) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition probation outcome from '${currentOutcome}' to '${data.outcome}'`,
            details: {
              currentOutcome,
              requestedOutcome: data.outcome,
              allowedTransitions: allowed,
            },
          },
        };
      }

      // Complete the review
      const updated = await this.repository.completeReview(
        id,
        data.outcome,
        {
          reviewDate: data.review_date,
          performanceNotes: data.performance_notes,
          areasOfConcern: data.areas_of_concern,
          developmentPlan: data.development_plan,
          recommendation: data.recommendation,
          meetingDate: data.meeting_date,
          meetingNotes: data.meeting_notes,
        },
        ctx.userId,
        tx
      );

      if (!updated) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Failed to update probation review",
            details: { id },
          },
        };
      }

      // Delete remaining unsent reminders
      await this.repository.deleteUnsentReminders(id, tx);

      // Emit domain event
      await this.emitEvent(tx, ctx, id, "probation.review.completed", {
        review: {
          id,
          employeeId: review.employeeId,
          outcome: data.outcome,
          reviewDate: data.review_date,
          reviewerId: ctx.userId,
        },
      });

      return {
        success: true as const,
        data: {
          review: mapReviewToResponse(updated),
          reminders: [],
        },
      };
    });

    return result;
  }
}
