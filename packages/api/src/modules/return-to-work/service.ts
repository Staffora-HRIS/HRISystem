/**
 * Return to Work Module - Service Layer
 *
 * Implements business logic for return-to-work interview operations.
 * Validates date constraints, emits domain events via the outbox pattern,
 * and maps database rows to API response shapes.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  ReturnToWorkRepository,
  InterviewRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateInterview,
  UpdateInterview,
  CompleteInterview,
  InterviewFilters,
  PaginationQuery,
  InterviewResponse,
} from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "absence.return_to_work.created"
  | "absence.return_to_work.updated"
  | "absence.return_to_work.completed";

// =============================================================================
// Service
// =============================================================================

export class ReturnToWorkService {
  constructor(
    private repository: ReturnToWorkRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox in the same transaction as the business write
   */
  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
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
        'return_to_work_interview',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // List Interviews
  // ===========================================================================

  /**
   * List return-to-work interviews with filters and pagination
   */
  async listInterviews(
    context: TenantContext,
    filters: InterviewFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<InterviewResponse>> {
    const result = await this.repository.findInterviews(context, filters, pagination);

    return {
      items: result.items.map(this.mapRowToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Get Interview
  // ===========================================================================

  /**
   * Get a single interview by ID
   */
  async getInterview(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<InterviewResponse>> {
    const interview = await this.repository.findById(context, id);

    if (!interview) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Return-to-work interview not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapRowToResponse(interview),
    };
  }

  // ===========================================================================
  // Create Interview
  // ===========================================================================

  /**
   * Create a new return-to-work interview.
   *
   * Validates:
   * - absence_end_date >= absence_start_date (DB constraint rtw_absence_date_range)
   * - interview_date >= absence_end_date (DB constraint rtw_interview_after_absence)
   *
   * These are also enforced at the DB level, but we validate early to return
   * clear error messages rather than raw constraint violation errors.
   */
  async createInterview(
    context: TenantContext,
    data: CreateInterview,
    _idempotencyKey?: string
  ): Promise<ServiceResult<InterviewResponse>> {
    // Validate absence date range
    if (data.absence_end_date < data.absence_start_date) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Absence end date must be on or after absence start date",
          details: {
            absence_start_date: data.absence_start_date,
            absence_end_date: data.absence_end_date,
          },
        },
      };
    }

    // Validate interview date is on or after the absence end date
    if (data.interview_date < data.absence_end_date) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Interview date must be on or after absence end date",
          details: {
            interview_date: data.interview_date,
            absence_end_date: data.absence_end_date,
          },
        },
      };
    }

    // Create interview in transaction with outbox event
    const result = await this.db.withTransaction(context, async (tx) => {
      const interview = await this.repository.create(tx, context, data);

      // Emit domain event in the same transaction
      await this.emitEvent(tx, context, interview.id, "absence.return_to_work.created", {
        interview: this.mapRowToResponse(interview),
      });

      return interview;
    });

    return {
      success: true,
      data: this.mapRowToResponse(result),
    };
  }

  // ===========================================================================
  // Update Interview
  // ===========================================================================

  /**
   * Update an existing return-to-work interview.
   * Validates date constraints when dates are being changed.
   */
  async updateInterview(
    context: TenantContext,
    id: string,
    data: UpdateInterview,
    _idempotencyKey?: string
  ): Promise<ServiceResult<InterviewResponse>> {
    // Check interview exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Return-to-work interview not found",
          details: { id },
        },
      };
    }

    // Resolve effective dates for validation (use incoming values or fall back to existing)
    const effectiveStartDate = data.absence_start_date ?? this.formatDate(existing.absenceStartDate);
    const effectiveEndDate = data.absence_end_date ?? this.formatDate(existing.absenceEndDate);
    const effectiveInterviewDate = data.interview_date ?? this.formatDate(existing.interviewDate);

    // Validate absence date range
    if (effectiveEndDate < effectiveStartDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Absence end date must be on or after absence start date",
          details: {
            absence_start_date: effectiveStartDate,
            absence_end_date: effectiveEndDate,
          },
        },
      };
    }

    // Validate interview date is on or after the absence end date
    if (effectiveInterviewDate < effectiveEndDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Interview date must be on or after absence end date",
          details: {
            interview_date: effectiveInterviewDate,
            absence_end_date: effectiveEndDate,
          },
        },
      };
    }

    // Update in transaction with outbox event
    const result = await this.db.withTransaction(context, async (tx) => {
      const interview = await this.repository.update(tx, context, id, data);

      if (!interview) {
        throw new Error("Failed to update return-to-work interview");
      }

      // Emit domain event
      await this.emitEvent(tx, context, id, "absence.return_to_work.updated", {
        interview: this.mapRowToResponse(interview),
        changes: data,
      });

      return interview;
    });

    return {
      success: true,
      data: this.mapRowToResponse(result),
    };
  }

  // ===========================================================================
  // Complete Interview
  // ===========================================================================

  /**
   * Complete a return-to-work interview with final assessment data.
   * This is a specialised update that sets the core assessment fields:
   * fit_for_work, adjustments_needed, referral_to_occupational_health, notes.
   */
  async completeInterview(
    context: TenantContext,
    id: string,
    data: CompleteInterview,
    _idempotencyKey?: string
  ): Promise<ServiceResult<InterviewResponse>> {
    // Check interview exists
    const existing = await this.repository.findById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Return-to-work interview not found",
          details: { id },
        },
      };
    }

    // Complete in transaction with outbox event
    const result = await this.db.withTransaction(context, async (tx) => {
      const interview = await this.repository.complete(tx, context, id, {
        fitForWork: data.fit_for_work,
        adjustmentsNeeded: data.adjustments_needed,
        referralToOccupationalHealth: data.referral_to_occupational_health,
        notes: data.notes,
      });

      if (!interview) {
        throw new Error("Failed to complete return-to-work interview");
      }

      // Emit domain event
      await this.emitEvent(tx, context, id, "absence.return_to_work.completed", {
        interview: this.mapRowToResponse(interview),
        assessment: {
          fitForWork: data.fit_for_work,
          adjustmentsNeeded: data.adjustments_needed ?? null,
          referralToOccupationalHealth: data.referral_to_occupational_health ?? false,
        },
      });

      return interview;
    });

    return {
      success: true,
      data: this.mapRowToResponse(result),
    };
  }

  // ===========================================================================
  // Mapping
  // ===========================================================================

  /**
   * Format a Date object to YYYY-MM-DD string
   */
  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0]!;
  }

  /**
   * Map a database row to the API response shape.
   * Converts camelCase row properties to snake_case response and
   * formats Date objects to ISO strings.
   */
  private mapRowToResponse = (row: InterviewRow): InterviewResponse => {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      leave_request_id: row.leaveRequestId,
      absence_start_date: this.formatDate(row.absenceStartDate),
      absence_end_date: this.formatDate(row.absenceEndDate),
      interview_date: this.formatDate(row.interviewDate),
      interviewer_id: row.interviewerId,
      fit_for_work: row.fitForWork,
      adjustments_needed: row.adjustmentsNeeded,
      referral_to_occupational_health: row.referralToOccupationalHealth,
      notes: row.notes,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  };
}
