/**
 * Flexible Working Module - Service Layer
 *
 * Implements business logic for Flexible Working Requests under the
 * Employment Relations (Flexible Working) Act 2023.
 *
 * Enforces:
 * - Day-one right (no qualifying period since April 2024)
 * - Maximum 2 requests per 12-month rolling period
 * - Automatic 2-month response deadline calculation
 * - Mandatory consultation before refusal
 * - Valid rejection grounds (ERA 1996, s.80G(1)(b)) - all 8 statutory grounds
 * - Extended state machine with appeal support
 * - Outbox pattern for domain events
 * - Immutable history trail for all transitions
 *
 * State machine:
 *   submitted -> under_review -> consultation_scheduled -> consultation_complete
 *     -> approved (with effective date, optional modifications)
 *     -> rejected (must cite 1 of 8 statutory grounds, must be after consultation)
 *   rejected -> appeal -> appeal_approved / appeal_rejected
 *   Any non-terminal -> withdrawn
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  FlexibleWorkingRepository,
  FlexibleWorkingRequestRow,
  ConsultationRow,
  RequestHistoryRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import {
  canTransitionFlexibleWorking,
  getValidFlexibleWorkingTransitions,
  isStatutoryRejectionGround,
  type FlexibleWorkingState,
} from "@staffora/shared/state-machines";
import type {
  SubmitRequest,
  RecordConsultation,
  ApproveRequest,
  RejectRequest,
  AppealDecision,
  ResolveAppeal,
  RespondToRequest,
  FlexibleWorkingFilters,
  FlexibleWorkingResponse,
  ConsultationResponse,
  RequestHistoryEntry,
  ComplianceSummary,
  PaginationQuery,
  FlexibleWorkingStatus,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

const MAX_REQUESTS_PER_PERIOD = 2;
const RESPONSE_DEADLINE_MONTHS = 2;

// Active statuses that are not yet decided
const ACTIVE_STATUSES: FlexibleWorkingStatus[] = [
  "submitted",
  "pending",
  "under_review",
  "consultation_scheduled",
  "consultation",
  "consultation_complete",
];

/**
 * Domain event types
 */
type DomainEventType =
  | "flexible_working.request.submitted"
  | "flexible_working.request.review_started"
  | "flexible_working.request.consultation_scheduled"
  | "flexible_working.request.consultation_recorded"
  | "flexible_working.request.consultation_completed"
  | "flexible_working.request.approved"
  | "flexible_working.request.rejected"
  | "flexible_working.request.withdrawn"
  | "flexible_working.request.appealed"
  | "flexible_working.request.appeal_approved"
  | "flexible_working.request.appeal_rejected"
  | "flexible_working.request.deadline_approaching"
  // Legacy compat
  | "flexible_working.request.created"
  | "flexible_working.request.consultation_started";

// =============================================================================
// Service
// =============================================================================

export class FlexibleWorkingService {
  constructor(
    private repository: FlexibleWorkingRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

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
        'flexible_working_request',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private calculateResponseDeadline(requestDate: string): string {
    const date = new Date(requestDate);
    date.setMonth(date.getMonth() + RESPONSE_DEADLINE_MONTHS);
    return date.toISOString().split("T")[0];
  }

  private formatDate(value: Date | string | null): string | null {
    if (value === null) return null;
    if (value instanceof Date) return value.toISOString().split("T")[0];
    return String(value);
  }

  private formatTimestamp(value: Date | string): string {
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  private mapConsultationToResponse(row: ConsultationRow): ConsultationResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      request_id: row.requestId,
      consultation_date: this.formatDate(row.consultationDate) || "",
      consultation_type: row.consultationType,
      attendees: row.attendees,
      notes: row.notes,
      outcomes: row.outcomes,
      next_steps: row.nextSteps,
      recorded_by: row.recordedBy,
      created_at: this.formatTimestamp(row.createdAt),
      updated_at: this.formatTimestamp(row.updatedAt),
    };
  }

  private mapHistoryToResponse(row: RequestHistoryRow): RequestHistoryEntry {
    return {
      id: row.id,
      request_id: row.requestId,
      from_status: row.fromStatus,
      to_status: row.toStatus,
      changed_by: row.changedBy,
      reason: row.reason,
      metadata: row.metadata,
      created_at: this.formatTimestamp(row.createdAt),
    };
  }

  /**
   * Map a database row to the API response shape
   */
  private mapToResponse(
    row: FlexibleWorkingRequestRow,
    consultations?: ConsultationRow[],
    history?: RequestHistoryRow[]
  ): FlexibleWorkingResponse {
    const now = new Date();
    const deadline =
      row.responseDeadline instanceof Date
        ? row.responseDeadline
        : new Date(row.responseDeadline);
    const isOverdue =
      ACTIVE_STATUSES.includes(row.status) && deadline < now;

    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      request_date: this.formatDate(row.requestDate) || "",
      change_type: row.changeType,
      current_working_pattern: row.currentWorkingPattern,
      requested_working_pattern: row.requestedWorkingPattern,
      requested_start_date: this.formatDate(row.requestedStartDate) || "",
      reason: row.reason,
      impact_assessment: row.impactAssessment,
      status: row.status,
      response_deadline: this.formatDate(row.responseDeadline) || "",
      decision_date: this.formatDate(row.decisionDate),
      decision_by: row.decisionBy,
      rejection_grounds: row.rejectionGrounds,
      rejection_explanation: row.rejectionExplanation,
      effective_date: this.formatDate(row.effectiveDate),
      approved_modifications: row.approvedModifications,
      contract_amendment_id: row.contractAmendmentId,
      trial_period_end_date: this.formatDate(row.trialPeriodEndDate),
      withdrawal_reason: row.withdrawalReason,
      appeal_date: this.formatDate(row.appealDate),
      appeal_grounds: row.appealGrounds,
      appeal_outcome: row.appealOutcome as FlexibleWorkingResponse["appeal_outcome"],
      appeal_decision_by: row.appealDecisionBy,
      appeal_decision_date: this.formatDate(row.appealDecisionDate),
      consultation_completed: row.consultationCompleted,
      request_number_in_period: row.requestNumberInPeriod,
      is_overdue: isOverdue,
      consultations: consultations
        ? consultations.map((c) => this.mapConsultationToResponse(c))
        : undefined,
      history: history
        ? history.map((h) => this.mapHistoryToResponse(h))
        : undefined,
      created_at: this.formatTimestamp(row.createdAt),
      updated_at: this.formatTimestamp(row.updatedAt),
    };
  }

  /**
   * Build a not-found error result
   */
  private notFoundError(id: string): ServiceResult<FlexibleWorkingResponse> {
    return {
      success: false,
      error: {
        code: ErrorCodes.NOT_FOUND,
        message: "Flexible working request not found",
        details: { id },
      },
    };
  }

  /**
   * Validate a state transition and return a failed ServiceResult if invalid, or null if valid.
   */
  private checkTransition(
    currentStatus: FlexibleWorkingStatus,
    targetStatus: FlexibleWorkingStatus
  ): ServiceResult<FlexibleWorkingResponse> | null {
    if (!canTransitionFlexibleWorking(currentStatus as FlexibleWorkingState, targetStatus as FlexibleWorkingState)) {
      const validTransitions = getValidFlexibleWorkingTransitions(currentStatus as FlexibleWorkingState);
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot transition from '${currentStatus}' to '${targetStatus}'.`,
          details: {
            current_status: currentStatus,
            target_status: targetStatus,
            allowed_transitions: validTransitions,
          },
        },
      };
    }
    return null;
  }

  /**
   * Build a conflict error result
   */
  private conflictError(id: string): ServiceResult<FlexibleWorkingResponse> {
    return {
      success: false,
      error: {
        code: ErrorCodes.CONFLICT,
        message: "Request was modified concurrently. Please retry.",
        details: { id },
      },
    };
  }

  // ===========================================================================
  // submitRequest
  // ===========================================================================

  /**
   * Submit a new flexible working request.
   *
   * Validates:
   * - Employee has not exceeded 2 requests in the current 12-month period
   * - Requested start date is on or after the request date
   *
   * Automatically:
   * - Calculates the 2-month response deadline
   * - Determines the request number in the period (1 or 2)
   * - Records initial history entry
   * - Emits a domain event via the outbox
   */
  async submitRequest(
    context: TenantContext,
    data: SubmitRequest,
    _idempotencyKey?: string
  ): Promise<ServiceResult<FlexibleWorkingResponse>> {
    const requestDate = data.request_date || new Date().toISOString().split("T")[0];

    // Validate requested start date is on or after request date
    if (data.requested_start_date < requestDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Requested start date must be on or after the request date",
          details: {
            requested_start_date: data.requested_start_date,
            request_date: requestDate,
          },
        },
      };
    }

    const responseDeadline = this.calculateResponseDeadline(requestDate);

    return await this.db.withTransaction(context, async (tx) => {
      // Check 12-month rolling limit
      const existingCount = await this.repository.countRequestsInPeriod(
        context,
        data.employee_id,
        tx
      );

      if (existingCount >= MAX_REQUESTS_PER_PERIOD) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Employee has already made ${MAX_REQUESTS_PER_PERIOD} flexible working requests in the last 12 months. The Employment Relations (Flexible Working) Act 2023 limits employees to ${MAX_REQUESTS_PER_PERIOD} requests per 12-month period.`,
            details: {
              employee_id: data.employee_id,
              existing_requests: existingCount,
              max_allowed: MAX_REQUESTS_PER_PERIOD,
            },
          },
        };
      }

      const requestNumberInPeriod = existingCount + 1;

      const row = await this.repository.create(
        context,
        {
          employeeId: data.employee_id,
          requestDate,
          changeType: data.change_type ?? null,
          currentWorkingPattern: data.current_working_pattern,
          requestedWorkingPattern: data.requested_working_pattern,
          requestedStartDate: data.requested_start_date,
          reason: data.reason,
          impactAssessment: data.impact_assessment ?? null,
          responseDeadline,
          requestNumberInPeriod,
        },
        tx
      );

      // Record initial history entry
      await this.repository.recordHistory(
        context,
        {
          requestId: row.id,
          fromStatus: null,
          toStatus: "submitted",
          changedBy: context.userId ?? null,
          reason: "Request submitted",
          metadata: { request_number_in_period: requestNumberInPeriod },
        },
        tx
      );

      // Emit domain event in same transaction
      await this.emitEvent(tx, context, row.id, "flexible_working.request.submitted", {
        request: this.mapToResponse(row),
        response_deadline: responseDeadline,
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  /** @deprecated Use submitRequest */
  async createRequest(
    context: TenantContext,
    data: SubmitRequest,
    idempotencyKey?: string
  ): Promise<ServiceResult<FlexibleWorkingResponse>> {
    return this.submitRequest(context, data, idempotencyKey);
  }

  // ===========================================================================
  // listRequests
  // ===========================================================================

  async listRequests(
    context: TenantContext,
    filters: FlexibleWorkingFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<FlexibleWorkingResponse>> {
    const result = await this.repository.findAll(context, filters, pagination);

    return {
      items: result.items.map((row) => this.mapToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // getRequest (with full history and consultations)
  // ===========================================================================

  async getRequest(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<FlexibleWorkingResponse>> {
    const row = await this.repository.findById(context, id);
    if (!row) return this.notFoundError(id);

    // Fetch consultations and history in parallel
    const [consultations, history] = await Promise.all([
      this.repository.findConsultationsByRequestId(context, id),
      this.repository.findHistoryByRequestId(context, id),
    ]);

    return {
      success: true,
      data: this.mapToResponse(row, consultations, history),
    };
  }

  // ===========================================================================
  // recordConsultation
  // ===========================================================================

  /**
   * Record a mandatory consultation meeting.
   *
   * Under the 2023 Act, employers MUST consult with the employee before refusing.
   * This records the consultation and transitions the request to consultation_complete
   * if the request is currently in consultation_scheduled state.
   */
  async recordConsultation(
    context: TenantContext,
    requestId: string,
    data: RecordConsultation,
    _idempotencyKey?: string
  ): Promise<ServiceResult<ConsultationResponse>> {
    const existing = await this.repository.findById(context, requestId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Flexible working request not found",
          details: { id: requestId },
        },
      };
    }

    // Consultations can be recorded for requests in review or consultation states
    const allowedStatuses: FlexibleWorkingStatus[] = [
      "under_review",
      "consultation_scheduled",
      "consultation",
      "consultation_complete",
    ];

    if (!allowedStatuses.includes(existing.status)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot record consultation for a request with status '${existing.status}'. Request must be under review or in consultation.`,
          details: {
            current_status: existing.status,
            allowed_statuses: allowedStatuses,
          },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      // Record the consultation
      const consultationRow = await this.repository.createConsultation(
        context,
        {
          requestId,
          consultationDate: data.consultation_date,
          consultationType: data.consultation_type || "meeting",
          attendees: data.attendees,
          notes: data.notes,
          outcomes: data.outcomes ?? null,
          nextSteps: data.next_steps ?? null,
          recordedBy: data.recorded_by,
        },
        tx
      );

      // If in consultation_scheduled, move to consultation_complete
      if (existing.status === "consultation_scheduled" || existing.status === "consultation") {
        const updatedRow = await this.repository.completeConsultation(context, requestId, tx);

        if (updatedRow) {
          // Record history
          await this.repository.recordHistory(
            context,
            {
              requestId,
              fromStatus: existing.status,
              toStatus: "consultation_complete",
              changedBy: data.recorded_by,
              reason: "Consultation meeting completed",
              metadata: { consultation_id: consultationRow.id },
            },
            tx
          );

          await this.emitEvent(
            tx,
            context,
            requestId,
            "flexible_working.request.consultation_completed",
            { consultation: this.mapConsultationToResponse(consultationRow) }
          );
        }
      }

      // Always emit the consultation recorded event
      await this.emitEvent(
        tx,
        context,
        requestId,
        "flexible_working.request.consultation_recorded",
        { consultation: this.mapConsultationToResponse(consultationRow) }
      );

      return {
        success: true,
        data: this.mapConsultationToResponse(consultationRow),
      };
    });
  }

  // ===========================================================================
  // approveRequest
  // ===========================================================================

  /**
   * Approve a flexible working request.
   *
   * Requires:
   * - Effective date for when the new arrangement starts
   * - Decision-maker ID
   *
   * Optional:
   * - Modifications agreed during consultation
   * - Contract amendment reference
   * - Trial period end date
   */
  async approveRequest(
    context: TenantContext,
    id: string,
    data: ApproveRequest,
    _idempotencyKey?: string
  ): Promise<ServiceResult<FlexibleWorkingResponse>> {
    const existing = await this.repository.findById(context, id);
    if (!existing) return this.notFoundError(id);

    // Approval is allowed from any active state (employer can approve at any point)
    const transitionError = this.checkTransition(existing.status, "approved");
    if (transitionError) return transitionError;

    const decisionDate = new Date().toISOString().split("T")[0];

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.approve(
        context,
        id,
        data.decision_by,
        decisionDate,
        data.effective_date,
        data.approved_modifications ?? null,
        data.contract_amendment_id ?? null,
        data.trial_period_end_date ?? null,
        tx
      );

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Request was modified concurrently. Please retry.",
            details: { id },
          },
        };
      }

      await this.repository.recordHistory(
        context,
        {
          requestId: id,
          fromStatus: existing.status,
          toStatus: "approved",
          changedBy: data.decision_by,
          reason: data.approved_modifications
            ? `Approved with modifications: ${data.approved_modifications}`
            : "Approved as requested",
          metadata: {
            effective_date: data.effective_date,
            contract_amendment_id: data.contract_amendment_id,
            trial_period_end_date: data.trial_period_end_date,
          },
        },
        tx
      );

      await this.emitEvent(tx, context, id, "flexible_working.request.approved", {
        request: this.mapToResponse(row),
        decision_by: data.decision_by,
        effective_date: data.effective_date,
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ===========================================================================
  // rejectRequest
  // ===========================================================================

  /**
   * Reject a flexible working request.
   *
   * Legal requirements enforced:
   * - Must specify one of the 8 statutory grounds (ERA 1996, s.80G(1)(b))
   * - Must provide an explanation
   * - Consultation must have been completed first (the Act requires this)
   */
  async rejectRequest(
    context: TenantContext,
    id: string,
    data: RejectRequest,
    _idempotencyKey?: string
  ): Promise<ServiceResult<FlexibleWorkingResponse>> {
    const existing = await this.repository.findById(context, id);
    if (!existing) return this.notFoundError(id);

    // Rejection can only come from consultation_complete
    const transitionError = this.checkTransition(existing.status, "rejected");
    if (transitionError) return transitionError;

    // Validate statutory rejection grounds
    if (!isStatutoryRejectionGround(data.rejection_grounds)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Invalid rejection grounds. Must be one of the 8 statutory grounds (ERA 1996, s.80G(1)(b)).",
          details: {
            provided_grounds: data.rejection_grounds,
            valid_grounds: [
              "burden_of_additional_costs",
              "detrimental_effect_customer_demand",
              "inability_to_reorganise",
              "inability_to_recruit",
              "detrimental_impact_quality",
              "detrimental_impact_performance",
              "insufficient_work",
              "planned_structural_changes",
            ],
          },
        },
      };
    }

    // Verify consultation was completed
    if (!existing.consultationCompleted) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Cannot reject a flexible working request without completing the mandatory consultation. The Employment Relations (Flexible Working) Act 2023 requires employers to consult with the employee before refusing a request.",
          details: {
            consultation_completed: false,
            current_status: existing.status,
          },
        },
      };
    }

    const decisionDate = new Date().toISOString().split("T")[0];

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.reject(
        context,
        id,
        data.decision_by,
        decisionDate,
        data.rejection_grounds,
        data.rejection_explanation,
        tx
      );

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Request was modified concurrently. Please retry.",
            details: { id },
          },
        };
      }

      await this.repository.recordHistory(
        context,
        {
          requestId: id,
          fromStatus: existing.status,
          toStatus: "rejected",
          changedBy: data.decision_by,
          reason: `Rejected on grounds: ${data.rejection_grounds}. ${data.rejection_explanation}`,
          metadata: {
            rejection_grounds: data.rejection_grounds,
            business_justification: data.business_justification,
          },
        },
        tx
      );

      await this.emitEvent(tx, context, id, "flexible_working.request.rejected", {
        request: this.mapToResponse(row),
        decision_by: data.decision_by,
        rejection_grounds: data.rejection_grounds,
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ===========================================================================
  // appealDecision
  // ===========================================================================

  /**
   * Employee appeals a rejection decision.
   *
   * Only possible when the request status is 'rejected'.
   * The employee must provide grounds for the appeal.
   */
  async appealDecision(
    context: TenantContext,
    id: string,
    data: AppealDecision,
    _idempotencyKey?: string
  ): Promise<ServiceResult<FlexibleWorkingResponse>> {
    const existing = await this.repository.findById(context, id);
    if (!existing) return this.notFoundError(id);

    const transitionError = this.checkTransition(existing.status, "appeal");
    if (transitionError) return transitionError;

    const appealDate = new Date().toISOString().split("T")[0];

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.fileAppeal(
        context,
        id,
        appealDate,
        data.appeal_grounds,
        tx
      );

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Request was modified concurrently. Please retry.",
            details: { id },
          },
        };
      }

      await this.repository.recordHistory(
        context,
        {
          requestId: id,
          fromStatus: existing.status,
          toStatus: "appeal",
          changedBy: context.userId ?? null,
          reason: data.appeal_grounds,
          metadata: null,
        },
        tx
      );

      await this.emitEvent(tx, context, id, "flexible_working.request.appealed", {
        request: this.mapToResponse(row),
        appeal_grounds: data.appeal_grounds,
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ===========================================================================
  // resolveAppeal
  // ===========================================================================

  /**
   * Resolve an appeal (uphold rejection or overturn it).
   *
   * If overturned (appeal_approved), the request is effectively approved
   * and requires an effective date.
   */
  async resolveAppeal(
    context: TenantContext,
    id: string,
    data: ResolveAppeal,
    _idempotencyKey?: string
  ): Promise<ServiceResult<FlexibleWorkingResponse>> {
    const existing = await this.repository.findById(context, id);
    if (!existing) return this.notFoundError(id);

    const transitionError = this.checkTransition(existing.status, data.outcome);
    if (transitionError) return transitionError;

    // If overturning the rejection, effective_date is required
    if (data.outcome === "appeal_approved" && !data.effective_date) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "An effective date is required when upholding an appeal (overturning the rejection).",
          details: { outcome: data.outcome },
        },
      };
    }

    const decisionDate = new Date().toISOString().split("T")[0];

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.resolveAppeal(
        context,
        id,
        data.outcome,
        data.decision_by,
        decisionDate,
        data.effective_date ?? null,
        tx
      );

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Request was modified concurrently. Please retry.",
            details: { id },
          },
        };
      }

      const eventType: DomainEventType =
        data.outcome === "appeal_approved"
          ? "flexible_working.request.appeal_approved"
          : "flexible_working.request.appeal_rejected";

      await this.repository.recordHistory(
        context,
        {
          requestId: id,
          fromStatus: existing.status,
          toStatus: data.outcome,
          changedBy: data.decision_by,
          reason: data.reason,
          metadata: { effective_date: data.effective_date },
        },
        tx
      );

      await this.emitEvent(tx, context, id, eventType, {
        request: this.mapToResponse(row),
        decision_by: data.decision_by,
        outcome: data.outcome,
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ===========================================================================
  // withdrawRequest
  // ===========================================================================

  /**
   * Withdraw a flexible working request.
   * Only possible if the request is not yet in a terminal state.
   */
  async withdrawRequest(
    context: TenantContext,
    id: string,
    reason?: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<FlexibleWorkingResponse>> {
    const existing = await this.repository.findById(context, id);
    if (!existing) return this.notFoundError(id);

    const transitionError = this.checkTransition(existing.status, "withdrawn");
    if (transitionError) return transitionError;

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.withdraw(context, id, reason ?? null, tx);

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Request was modified concurrently. Please retry.",
            details: { id },
          },
        };
      }

      await this.repository.recordHistory(
        context,
        {
          requestId: id,
          fromStatus: existing.status,
          toStatus: "withdrawn",
          changedBy: context.userId ?? null,
          reason: reason ?? "Request withdrawn by employee",
          metadata: null,
        },
        tx
      );

      await this.emitEvent(tx, context, id, "flexible_working.request.withdrawn", {
        request: this.mapToResponse(row),
        withdrawal_reason: reason,
      });

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ===========================================================================
  // moveToConsultation (schedule consultation)
  // ===========================================================================

  /**
   * Move a request to consultation_scheduled status.
   * Under the 2023 Act, employers must consult with the employee before refusing.
   */
  async moveToConsultation(
    context: TenantContext,
    id: string,
    impactAssessment?: string | null,
    _idempotencyKey?: string
  ): Promise<ServiceResult<FlexibleWorkingResponse>> {
    const existing = await this.repository.findById(context, id);
    if (!existing) return this.notFoundError(id);

    // Allow transition from pending/under_review/consultation to consultation_scheduled
    const targetStatus = "consultation_scheduled" as FlexibleWorkingStatus;
    const transitionError = this.checkTransition(existing.status, targetStatus);
    if (transitionError) return transitionError;

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.scheduleConsultation(
        context,
        id,
        impactAssessment ?? null,
        tx
      );

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Request was modified concurrently. Please retry.",
            details: { id },
          },
        };
      }

      await this.repository.recordHistory(
        context,
        {
          requestId: id,
          fromStatus: existing.status,
          toStatus: targetStatus,
          changedBy: context.userId ?? null,
          reason: "Consultation scheduled with employee",
          metadata: impactAssessment ? { impact_assessment: impactAssessment } : null,
        },
        tx
      );

      await this.emitEvent(
        tx,
        context,
        id,
        "flexible_working.request.consultation_scheduled",
        { request: this.mapToResponse(row) }
      );

      return {
        success: true,
        data: this.mapToResponse(row),
      };
    });
  }

  // ===========================================================================
  // respondToRequest (legacy combined approve/reject)
  // ===========================================================================

  /**
   * @deprecated Use approveRequest or rejectRequest instead.
   * Kept for backwards compatibility.
   */
  async respondToRequest(
    context: TenantContext,
    id: string,
    data: RespondToRequest,
    _idempotencyKey?: string
  ): Promise<ServiceResult<FlexibleWorkingResponse>> {
    if (data.decision === "approved") {
      if (!data.effective_date) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "An effective date is required when approving a flexible working request.",
            details: { decision: data.decision },
          },
        };
      }
      return this.approveRequest(context, id, {
        decision_by: data.decision_by,
        effective_date: data.effective_date,
        approved_modifications: data.approved_modifications,
        contract_amendment_id: data.contract_amendment_id,
        trial_period_end_date: data.trial_period_end_date,
      });
    }

    if (!data.rejection_grounds) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Rejection grounds are required when rejecting a flexible working request. Employers must cite one of the 8 statutory grounds (ERA 1996, s.80G(1)(b)).",
          details: { decision: data.decision },
        },
      };
    }
    if (!data.rejection_explanation) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "A rejection explanation is required when rejecting a flexible working request.",
          details: { decision: data.decision },
        },
      };
    }

    return this.rejectRequest(context, id, {
      decision_by: data.decision_by,
      rejection_grounds: data.rejection_grounds,
      rejection_explanation: data.rejection_explanation,
      business_justification: data.business_justification,
    });
  }

  // ===========================================================================
  // Compliance Summary
  // ===========================================================================

  async getComplianceSummary(
    context: TenantContext
  ): Promise<ServiceResult<ComplianceSummary>> {
    const [statusCounts, overdueRequests, avgDays, rejectionBreakdown, consultationRate] =
      await Promise.all([
        this.repository.getStatusCounts(context),
        this.repository.getOverdueRequests(context),
        this.repository.getAverageResponseDays(context),
        this.repository.getRejectionBreakdown(context),
        this.repository.getConsultationComplianceRate(context),
      ]);

    const totalRequests = Object.values(statusCounts).reduce(
      (sum, count) => sum + count,
      0
    );

    const summary: ComplianceSummary = {
      total_requests: totalRequests,
      pending_requests: (statusCounts["submitted"] || 0) + (statusCounts["pending"] || 0),
      under_review_requests: statusCounts["under_review"] || 0,
      in_consultation:
        (statusCounts["consultation_scheduled"] || 0) +
        (statusCounts["consultation"] || 0) +
        (statusCounts["consultation_complete"] || 0),
      approved_requests: (statusCounts["approved"] || 0) + (statusCounts["appeal_approved"] || 0),
      rejected_requests: (statusCounts["rejected"] || 0) + (statusCounts["appeal_rejected"] || 0),
      withdrawn_requests: statusCounts["withdrawn"] || 0,
      appeal_requests: statusCounts["appeal"] || 0,
      overdue_responses: overdueRequests.length,
      overdue_requests: overdueRequests.map((r) => ({
        id: r.id,
        employee_id: r.employeeId,
        request_date:
          r.requestDate instanceof Date
            ? r.requestDate.toISOString().split("T")[0]
            : String(r.requestDate),
        response_deadline:
          r.responseDeadline instanceof Date
            ? r.responseDeadline.toISOString().split("T")[0]
            : String(r.responseDeadline),
        days_overdue: r.daysOverdue,
      })),
      average_response_days: avgDays,
      rejection_grounds_breakdown: rejectionBreakdown.map((r) => ({
        grounds: r.grounds,
        count: r.count,
      })),
      consultation_compliance_rate: consultationRate,
    };

    return {
      success: true,
      data: summary,
    };
  }
}
