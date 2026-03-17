/**
 * IR35 Off-Payroll Compliance Module - Service Layer
 *
 * Implements business logic for IR35 off-payroll working compliance.
 * Enforces UK off-payroll working rules introduced in April 2021.
 *
 * Key rules enforced:
 * - Medium/large employers must make the IR35 determination (client_led = true)
 * - A Status Determination Statement (SDS) with reasons is mandatory
 *   when the determination is "inside" or "outside"
 * - Contractors have a legal right to dispute the SDS
 * - The client must respond to a dispute within 45 days
 * - Only assessments with dispute_status = 'none' can be freely updated
 * - Once a dispute is raised, the determination cannot be changed until resolved
 *
 * Emits domain events via the outbox pattern for audit trail.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  IR35Repository,
  IR35AssessmentRow,
  IR35AssessmentListRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateIR35Assessment,
  UpdateIR35Assessment,
  DisputeIR35Assessment,
  IR35AssessmentFilters,
  PaginationQuery,
  IR35AssessmentResponse,
  IR35AssessmentListItem,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/**
 * Domain event types for IR35 assessments
 */
type DomainEventType =
  | "ir35.assessment.created"
  | "ir35.assessment.updated"
  | "ir35.assessment.disputed";

// =============================================================================
// IR35 Service
// =============================================================================

export class IR35Service {
  constructor(
    private repository: IR35Repository,
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
  // Assessment CRUD
  // ===========================================================================

  /**
   * Create a new IR35 assessment.
   *
   * Validates:
   * - Contractor (employee) exists
   * - SDS reasons are provided when determination is inside or outside
   *   (mandatory under off-payroll working rules)
   */
  async createAssessment(
    context: TenantContext,
    data: CreateIR35Assessment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<IR35AssessmentResponse>> {
    // Validate contractor exists
    const contractorExists = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx`
        SELECT id FROM app.employees WHERE id = ${data.contractor_id}::uuid
      `;
      return rows.length > 0;
    });

    if (!contractorExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Contractor not found",
          details: { contractor_id: data.contractor_id },
        },
      };
    }

    // Under off-payroll rules, an SDS with reasons is mandatory when
    // the determination is "inside" or "outside"
    if (
      data.status_determination !== "undetermined" &&
      (!data.determination_reasons || data.determination_reasons.length === 0)
    ) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message:
            "Determination reasons are required when the status is 'inside' or 'outside'. " +
            "The off-payroll working rules require a Status Determination Statement (SDS) with reasons.",
          details: {
            status_determination: data.status_determination,
          },
        },
      };
    }

    // Create assessment in transaction with outbox event
    const result = await this.db.withTransaction(context, async (tx) => {
      const assessment = await this.repository.createAssessment(tx, context, data);

      await this.emitEvent(tx, context, "ir35_assessment", assessment.id, "ir35.assessment.created", {
        assessment: this.mapAssessmentToResponse(assessment),
        contractorId: data.contractor_id,
        engagementId: data.engagement_id,
        statusDetermination: data.status_determination,
      });

      return assessment;
    });

    return {
      success: true,
      data: this.mapAssessmentToResponse(result),
    };
  }

  /**
   * Get a single IR35 assessment by ID
   */
  async getAssessment(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<IR35AssessmentResponse>> {
    const assessment = await this.repository.findAssessmentById(context, id);

    if (!assessment) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "IR35 assessment not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapAssessmentToResponse(assessment),
    };
  }

  /**
   * List IR35 assessments with filters and pagination
   */
  async listAssessments(
    context: TenantContext,
    filters: IR35AssessmentFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<IR35AssessmentListItem>> {
    const result = await this.repository.findAssessments(context, filters, pagination);

    return {
      items: result.items.map(this.mapAssessmentListRowToItem),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Update an IR35 assessment (determination, reasons, etc.).
   *
   * Business rules:
   * - Cannot update an assessment that has an active dispute (pending).
   *   The dispute must be resolved first.
   * - SDS reasons are required when changing determination to inside/outside.
   */
  async updateAssessment(
    context: TenantContext,
    id: string,
    data: UpdateIR35Assessment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<IR35AssessmentResponse>> {
    const existing = await this.repository.findAssessmentById(context, id);

    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "IR35 assessment not found",
          details: { id },
        },
      };
    }

    // Cannot update an assessment with a pending dispute
    if (existing.disputeStatus === "pending") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message:
            "Cannot update an assessment with a pending dispute. " +
            "Resolve the dispute before making changes to the determination.",
          details: {
            id,
            disputeStatus: existing.disputeStatus,
          },
        },
      };
    }

    // If changing to inside/outside, ensure reasons are provided
    const newDetermination = data.status_determination || existing.statusDetermination;
    const newReasons = data.determination_reasons !== undefined
      ? data.determination_reasons
      : (existing.determinationReasons as unknown[]);

    if (
      newDetermination !== "undetermined" &&
      (!newReasons || (Array.isArray(newReasons) && newReasons.length === 0))
    ) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message:
            "Determination reasons are required when the status is 'inside' or 'outside'. " +
            "The off-payroll working rules require a Status Determination Statement (SDS) with reasons.",
          details: {
            status_determination: newDetermination,
          },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateAssessment(tx, id, data);

      if (updated) {
        await this.emitEvent(tx, context, "ir35_assessment", id, "ir35.assessment.updated", {
          assessment: this.mapAssessmentToResponse(updated),
          changes: data,
          previousDetermination: existing.statusDetermination,
        });
      }

      return updated;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "IR35 assessment not found after update",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapAssessmentToResponse(result),
    };
  }

  // ===========================================================================
  // Dispute Handling
  // ===========================================================================

  /**
   * Raise a dispute against an IR35 determination.
   *
   * Under the off-payroll working rules, contractors have the legal right
   * to dispute the Status Determination Statement. The client must:
   * 1. Consider the reasons given by the contractor
   * 2. Respond within 45 days
   * 3. Either uphold or change the determination
   *
   * Business rules:
   * - Only assessments with a definitive determination (inside/outside) can be disputed
   * - Cannot dispute an assessment that is already disputed (pending/upheld/rejected)
   */
  async disputeAssessment(
    context: TenantContext,
    id: string,
    data: DisputeIR35Assessment,
    _idempotencyKey?: string
  ): Promise<ServiceResult<IR35AssessmentResponse>> {
    const existing = await this.repository.findAssessmentById(context, id);

    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "IR35 assessment not found",
          details: { id },
        },
      };
    }

    // Can only dispute a definitive determination
    if (existing.statusDetermination === "undetermined") {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message:
            "Cannot dispute an undetermined assessment. " +
            "A Status Determination Statement must be issued before it can be disputed.",
          details: {
            id,
            statusDetermination: existing.statusDetermination,
          },
        },
      };
    }

    // Cannot dispute if already disputed
    if (existing.disputeStatus !== "none") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot raise a dispute when dispute status is '${existing.disputeStatus}'. ` +
            "A dispute has already been raised for this assessment.",
          details: {
            id,
            currentDisputeStatus: existing.disputeStatus,
          },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.setDispute(tx, id, data.dispute_reason);

      if (updated) {
        await this.emitEvent(tx, context, "ir35_assessment", id, "ir35.assessment.disputed", {
          assessment: this.mapAssessmentToResponse(updated),
          disputeReason: data.dispute_reason,
          contractorId: updated.contractorId,
          engagementId: updated.engagementId,
        });
      }

      return updated;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "IR35 assessment not found after dispute update",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapAssessmentToResponse(result),
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Format Date to ISO date string (YYYY-MM-DD)
   */
  private formatDate(date: Date | string | null): string | null {
    if (!date) return null;
    if (typeof date === "string") return date;
    return date.toISOString().split("T")[0] || null;
  }

  /**
   * Format Date to ISO datetime string
   */
  private formatDateTime(date: Date | string | null): string | null {
    if (!date) return null;
    if (typeof date === "string") return date;
    return date.toISOString();
  }

  /**
   * Parse determination_reasons from JSONB.
   * Handles both raw JSON strings and already-parsed arrays.
   */
  private parseReasons(raw: unknown): Array<{ factor: string; detail: string; supports: "inside" | "outside" }> {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as Array<{ factor: string; detail: string; supports: "inside" | "outside" }>;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Map database row to API response
   */
  private mapAssessmentToResponse = (row: IR35AssessmentRow): IR35AssessmentResponse => ({
    id: row.id,
    tenant_id: row.tenantId,
    contractor_id: row.contractorId,
    engagement_id: row.engagementId,
    assessment_date: this.formatDate(row.assessmentDate) || "",
    status_determination: row.statusDetermination as IR35AssessmentResponse["status_determination"],
    determination_reasons: this.parseReasons(row.determinationReasons),
    assessor_id: row.assessorId,
    client_led: row.clientLed,
    dispute_status: row.disputeStatus as IR35AssessmentResponse["dispute_status"],
    dispute_reason: row.disputeReason,
    reviewed_at: this.formatDateTime(row.reviewedAt),
    created_at: this.formatDateTime(row.createdAt) || "",
    updated_at: this.formatDateTime(row.updatedAt) || "",
  });

  /**
   * Map list row to list item
   */
  private mapAssessmentListRowToItem = (row: IR35AssessmentListRow): IR35AssessmentListItem => ({
    id: row.id,
    contractor_id: row.contractorId,
    contractor_name: row.contractorName,
    employee_number: row.employeeNumber,
    engagement_id: row.engagementId,
    assessment_date: this.formatDate(row.assessmentDate) || "",
    status_determination: row.statusDetermination as IR35AssessmentListItem["status_determination"],
    client_led: row.clientLed,
    dispute_status: row.disputeStatus as IR35AssessmentListItem["dispute_status"],
    created_at: this.formatDateTime(row.createdAt) || "",
  });
}
