/**
 * Health & Safety Module - Service Layer
 *
 * Implements business logic for Health & Safety operations.
 * Enforces state machine transitions for incidents and risk assessments,
 * auto-flags RIDDOR-reportable incidents, and emits domain events
 * via the outbox pattern.
 *
 * UK Statutory Requirements:
 * - Accident book recording (all incidents)
 * - RIDDOR reporting (deaths, specified injuries, >7-day incapacity,
 *   occupational diseases, dangerous occurrences)
 * - Risk assessment documentation (mandatory for 5+ employees)
 * - DSE assessments for habitual VDU users
 */

import type { DatabaseClient } from "../../plugins/db";
import type {
  HealthSafetyRepository,
  IncidentRow,
  RiskAssessmentRow,
  DSEAssessmentRow,
  TenantContext,
} from "./repository";
import type {
  CreateIncident,
  UpdateIncident,
  IncidentFilters,
  IncidentResponse,
  CreateRiskAssessment,
  UpdateRiskAssessment,
  RiskAssessmentFilters,
  RiskAssessmentResponse,
  CreateDSEAssessment,
  UpdateDSEAssessment,
  DSEAssessmentFilters,
  DSEAssessmentResponse,
  DashboardResponse,
  PaginationQuery,
  IncidentStatus,
  RiskAssessmentStatus,
} from "./schemas";
import type { ServiceResult, PaginatedServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

// =============================================================================
// State Machine: Incident Status
// =============================================================================

/**
 * Valid incident status transitions.
 * reported -> investigating -> resolved -> closed
 * Cannot skip investigating (must investigate before resolving).
 */
const VALID_INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  reported: ["investigating"],
  investigating: ["resolved"],
  resolved: ["closed", "investigating"], // Can reopen investigation
  closed: [], // Terminal state
};

// =============================================================================
// State Machine: Risk Assessment Status
// =============================================================================

/**
 * Valid risk assessment status transitions.
 * draft -> active (via approval) -> review_due -> active (re-reviewed) -> archived
 */
const VALID_RA_TRANSITIONS: Record<RiskAssessmentStatus, RiskAssessmentStatus[]> = {
  draft: ["active", "archived"],
  active: ["review_due", "archived"],
  review_due: ["active", "archived"],
  archived: [], // Terminal state
};

// =============================================================================
// RIDDOR Auto-Detection
// =============================================================================

/**
 * Severities that are automatically flagged as RIDDOR-reportable.
 * Deaths and major injuries must be reported immediately.
 * Fatal incidents always require RIDDOR reporting.
 * Major incidents are very likely RIDDOR-reportable (specified injuries).
 */
const RIDDOR_AUTO_SEVERITIES = new Set(["fatal", "major"]);

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "hs.incident.reported"
  | "hs.incident.updated"
  | "hs.incident.closed"
  | "hs.incident.riddor_flagged"
  | "hs.risk_assessment.created"
  | "hs.risk_assessment.updated"
  | "hs.risk_assessment.approved"
  | "hs.dse_assessment.created"
  | "hs.dse_assessment.updated";

// =============================================================================
// Service
// =============================================================================

export class HealthSafetyService {
  constructor(
    private repository: HealthSafetyRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Incidents
  // ===========================================================================

  /**
   * List incidents with filters and cursor-based pagination.
   */
  async listIncidents(
    ctx: TenantContext,
    filters: IncidentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<IncidentResponse>> {
    const result = await this.repository.listIncidents(ctx, filters, pagination);
    return {
      items: result.items.map(mapIncidentRow),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single incident by ID.
   */
  async getIncident(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<IncidentResponse>> {
    const row = await this.repository.getIncidentById(ctx, id);
    if (!row) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Incident not found" },
      };
    }
    return { success: true, data: mapIncidentRow(row) };
  }

  /**
   * Report a new incident (accident book entry).
   *
   * Auto-flags RIDDOR reportability based on severity:
   * - Fatal and major severity incidents are automatically flagged
   * - Caller can also explicitly set riddor_reportable=true
   */
  async reportIncident(
    ctx: TenantContext,
    data: CreateIncident
  ): Promise<ServiceResult<IncidentResponse>> {
    const id = crypto.randomUUID();

    // Auto-flag RIDDOR based on severity
    const autoRiddor = RIDDOR_AUTO_SEVERITIES.has(data.severity);
    const riddorReportable = data.riddor_reportable || autoRiddor;
    const incidentData: CreateIncident = {
      ...data,
      riddor_reportable: riddorReportable,
    };

    const row = await this.db.withTransaction(ctx, async (tx) => {
      const incident = await this.repository.createIncident(tx, ctx, id, incidentData);

      // Outbox: incident reported
      await this.emitEvent(tx, ctx, "hs.incident.reported", "hs_incident", id, {
        incident: mapIncidentRow(incident),
        actor: ctx.userId,
      });

      // If RIDDOR-reportable, emit a separate high-priority event
      if (riddorReportable) {
        await this.emitEvent(tx, ctx, "hs.incident.riddor_flagged", "hs_incident", id, {
          incident: mapIncidentRow(incident),
          severity: data.severity,
          autoFlagged: autoRiddor,
          actor: ctx.userId,
        });
      }

      return incident;
    });

    return { success: true, data: mapIncidentRow(row) };
  }

  /**
   * Update an incident with investigation findings, corrective actions,
   * or status transition.
   *
   * Validates state machine transitions:
   * - reported -> investigating
   * - investigating -> resolved
   * - resolved -> closed or back to investigating
   * - closed is terminal
   */
  async updateIncident(
    ctx: TenantContext,
    id: string,
    data: UpdateIncident
  ): Promise<ServiceResult<IncidentResponse>> {
    // Fetch current state
    const existing = await this.repository.getIncidentById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Incident not found" },
      };
    }

    // Validate status transition if status is changing
    if (data.status && data.status !== existing.status) {
      const currentStatus = existing.status as IncidentStatus;
      const validTargets = VALID_INCIDENT_TRANSITIONS[currentStatus] || [];
      if (!validTargets.includes(data.status)) {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition incident from '${currentStatus}' to '${data.status}'. Valid transitions: ${validTargets.join(", ") || "none (terminal state)"}`,
            details: {
              currentStatus,
              requestedStatus: data.status,
              validTransitions: validTargets,
            },
          },
        };
      }
    }

    // Validate RIDDOR constraints
    if (data.riddor_reference && !data.riddor_reportable && !existing.riddorReportable) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "RIDDOR reference can only be set on RIDDOR-reportable incidents",
        },
      };
    }

    const updated = await this.db.withTransaction(ctx, async (tx) => {
      const row = await this.repository.updateIncident(tx, ctx, id, data);
      if (!row) return null;

      // Determine event type
      let eventType: DomainEventType = "hs.incident.updated";
      if (data.status === "closed") {
        eventType = "hs.incident.closed";
      }

      await this.emitEvent(tx, ctx, eventType, "hs_incident", id, {
        incident: mapIncidentRow(row),
        changes: data,
        actor: ctx.userId,
      });

      // If RIDDOR was newly flagged
      if (data.riddor_reportable && !existing.riddorReportable) {
        await this.emitEvent(tx, ctx, "hs.incident.riddor_flagged", "hs_incident", id, {
          incident: mapIncidentRow(row),
          autoFlagged: false,
          actor: ctx.userId,
        });
      }

      return row;
    });

    if (!updated) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Incident not found" },
      };
    }

    return { success: true, data: mapIncidentRow(updated) };
  }

  /**
   * Close an incident. Requires status to be 'resolved'.
   */
  async closeIncident(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<IncidentResponse>> {
    return this.updateIncident(ctx, id, { status: "closed" });
  }

  /**
   * Get all RIDDOR-reportable incidents.
   */
  async getRIDDORReports(
    ctx: TenantContext,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<IncidentResponse>> {
    const result = await this.repository.getRIDDORIncidents(ctx, pagination);
    return {
      items: result.items.map(mapIncidentRow),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Risk Assessments
  // ===========================================================================

  /**
   * List risk assessments with filters and cursor-based pagination.
   */
  async listRiskAssessments(
    ctx: TenantContext,
    filters: RiskAssessmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<RiskAssessmentResponse>> {
    const result = await this.repository.listRiskAssessments(ctx, filters, pagination);
    return {
      items: result.items.map(mapRiskAssessmentRow),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single risk assessment by ID.
   */
  async getRiskAssessment(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<RiskAssessmentResponse>> {
    const row = await this.repository.getRiskAssessmentById(ctx, id);
    if (!row) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Risk assessment not found" },
      };
    }
    return { success: true, data: mapRiskAssessmentRow(row) };
  }

  /**
   * Create a new risk assessment with hazard matrix.
   * Starts in 'draft' status.
   */
  async createRiskAssessment(
    ctx: TenantContext,
    data: CreateRiskAssessment
  ): Promise<ServiceResult<RiskAssessmentResponse>> {
    // Validate review_date >= assessment_date
    if (data.review_date < data.assessment_date) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Review date must be on or after the assessment date",
        },
      };
    }

    const id = crypto.randomUUID();

    const row = await this.db.withTransaction(ctx, async (tx) => {
      const assessment = await this.repository.createRiskAssessment(tx, ctx, id, data);

      await this.emitEvent(tx, ctx, "hs.risk_assessment.created", "hs_risk_assessment", id, {
        assessment: mapRiskAssessmentRow(assessment),
        actor: ctx.userId,
      });

      return assessment;
    });

    return { success: true, data: mapRiskAssessmentRow(row) };
  }

  /**
   * Update a risk assessment. Validates state transitions.
   */
  async updateRiskAssessment(
    ctx: TenantContext,
    id: string,
    data: UpdateRiskAssessment
  ): Promise<ServiceResult<RiskAssessmentResponse>> {
    const existing = await this.repository.getRiskAssessmentById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Risk assessment not found" },
      };
    }

    // Validate status transition
    if (data.status && data.status !== existing.status) {
      const currentStatus = existing.status as RiskAssessmentStatus;
      const validTargets = VALID_RA_TRANSITIONS[currentStatus] || [];
      if (!validTargets.includes(data.status)) {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition risk assessment from '${currentStatus}' to '${data.status}'. Valid transitions: ${validTargets.join(", ") || "none (terminal state)"}`,
            details: {
              currentStatus,
              requestedStatus: data.status,
              validTransitions: validTargets,
            },
          },
        };
      }
    }

    // Validate review_date >= assessment_date if both provided
    const effectiveAssessmentDate = data.assessment_date || existing.assessmentDate;
    const effectiveReviewDate = data.review_date || existing.reviewDate;
    if (effectiveReviewDate < effectiveAssessmentDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Review date must be on or after the assessment date",
        },
      };
    }

    const updated = await this.db.withTransaction(ctx, async (tx) => {
      const row = await this.repository.updateRiskAssessment(tx, ctx, id, data);
      if (!row) return null;

      await this.emitEvent(tx, ctx, "hs.risk_assessment.updated", "hs_risk_assessment", id, {
        assessment: mapRiskAssessmentRow(row),
        changes: data,
        actor: ctx.userId,
      });

      return row;
    });

    if (!updated) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Risk assessment not found" },
      };
    }

    return { success: true, data: mapRiskAssessmentRow(updated) };
  }

  /**
   * Approve a risk assessment and set it to 'active'.
   * Only draft assessments can be approved.
   * Sets the next review date cycle.
   */
  async approveRiskAssessment(
    ctx: TenantContext,
    id: string,
    approverEmployeeId: string
  ): Promise<ServiceResult<RiskAssessmentResponse>> {
    const existing = await this.repository.getRiskAssessmentById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Risk assessment not found" },
      };
    }

    // Can only approve from draft or review_due status
    const currentStatus = existing.status as RiskAssessmentStatus;
    if (currentStatus !== "draft" && currentStatus !== "review_due") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot approve risk assessment in '${currentStatus}' status. Must be in 'draft' or 'review_due' status.`,
        },
      };
    }

    const updated = await this.db.withTransaction(ctx, async (tx) => {
      const row = await this.repository.approveRiskAssessment(tx, ctx, id, approverEmployeeId);
      if (!row) return null;

      await this.emitEvent(tx, ctx, "hs.risk_assessment.approved", "hs_risk_assessment", id, {
        assessment: mapRiskAssessmentRow(row),
        approvedBy: approverEmployeeId,
        actor: ctx.userId,
      });

      return row;
    });

    if (!updated) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Risk assessment not found" },
      };
    }

    return { success: true, data: mapRiskAssessmentRow(updated) };
  }

  /**
   * Mark a risk assessment as reviewed and set its next review date.
   * Transitions from review_due -> active.
   */
  async reviewRiskAssessment(
    ctx: TenantContext,
    id: string,
    nextReviewDate: string
  ): Promise<ServiceResult<RiskAssessmentResponse>> {
    const existing = await this.repository.getRiskAssessmentById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Risk assessment not found" },
      };
    }

    const currentStatus = existing.status as RiskAssessmentStatus;
    if (currentStatus !== "active" && currentStatus !== "review_due") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot review risk assessment in '${currentStatus}' status. Must be 'active' or 'review_due'.`,
        },
      };
    }

    return this.updateRiskAssessment(ctx, id, {
      status: "active",
      review_date: nextReviewDate,
      assessment_date: new Date().toISOString().split("T")[0],
    });
  }

  // ===========================================================================
  // DSE Assessments
  // ===========================================================================

  /**
   * List DSE assessments with filters and cursor-based pagination.
   */
  async listDSEAssessments(
    ctx: TenantContext,
    filters: DSEAssessmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<DSEAssessmentResponse>> {
    const result = await this.repository.listDSEAssessments(ctx, filters, pagination);
    return {
      items: result.items.map(mapDSEAssessmentRow),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single DSE assessment by ID.
   */
  async getDSEAssessment(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<DSEAssessmentResponse>> {
    const row = await this.repository.getDSEAssessmentById(ctx, id);
    if (!row) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "DSE assessment not found" },
      };
    }
    return { success: true, data: mapDSEAssessmentRow(row) };
  }

  /**
   * Get DSE assessments for a specific employee.
   */
  async getDSEAssessmentsByEmployee(
    ctx: TenantContext,
    employeeId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<DSEAssessmentResponse>> {
    const result = await this.repository.getDSEAssessmentsByEmployee(ctx, employeeId, pagination);
    return {
      items: result.items.map(mapDSEAssessmentRow),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Create a DSE assessment for an employee.
   * If issues are found and actions required, status defaults to 'actions_pending'.
   */
  async createDSEAssessment(
    ctx: TenantContext,
    data: CreateDSEAssessment
  ): Promise<ServiceResult<DSEAssessmentResponse>> {
    // Validate next_review_date >= assessment_date
    if (data.next_review_date && data.next_review_date < data.assessment_date) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Next review date must be on or after the assessment date",
        },
      };
    }

    const id = crypto.randomUUID();

    // Auto-determine status if not provided
    const effectiveStatus = data.status
      || (data.actions_required ? "actions_pending" : "completed");
    const dseData: CreateDSEAssessment = {
      ...data,
      status: effectiveStatus,
    };

    const row = await this.db.withTransaction(ctx, async (tx) => {
      const assessment = await this.repository.createDSEAssessment(tx, ctx, id, dseData);

      await this.emitEvent(tx, ctx, "hs.dse_assessment.created", "hs_dse_assessment", id, {
        assessment: mapDSEAssessmentRow(assessment),
        actor: ctx.userId,
      });

      return assessment;
    });

    return { success: true, data: mapDSEAssessmentRow(row) };
  }

  /**
   * Update a DSE assessment.
   */
  async updateDSEAssessment(
    ctx: TenantContext,
    id: string,
    data: UpdateDSEAssessment
  ): Promise<ServiceResult<DSEAssessmentResponse>> {
    const existing = await this.repository.getDSEAssessmentById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "DSE assessment not found" },
      };
    }

    const updated = await this.db.withTransaction(ctx, async (tx) => {
      const row = await this.repository.updateDSEAssessment(tx, ctx, id, data);
      if (!row) return null;

      await this.emitEvent(tx, ctx, "hs.dse_assessment.updated", "hs_dse_assessment", id, {
        assessment: mapDSEAssessmentRow(row),
        changes: data,
        actor: ctx.userId,
      });

      return row;
    });

    if (!updated) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "DSE assessment not found" },
      };
    }

    return { success: true, data: mapDSEAssessmentRow(updated) };
  }

  // ===========================================================================
  // Dashboard
  // ===========================================================================

  /**
   * Get H&S dashboard statistics.
   * Returns counts of open incidents, overdue reviews, RIDDOR reports, etc.
   */
  async getDashboard(ctx: TenantContext): Promise<ServiceResult<DashboardResponse>> {
    const stats = await this.repository.getDashboardStats(ctx);

    return {
      success: true,
      data: {
        open_incidents: stats.openIncidents,
        investigating_incidents: stats.investigatingIncidents,
        riddor_reportable_total: stats.riddorReportableTotal,
        riddor_unreported: stats.riddorUnreported,
        active_risk_assessments: stats.activeRiskAssessments,
        overdue_risk_reviews: stats.overdueRiskReviews,
        high_critical_risks: stats.highCriticalRisks,
        dse_actions_pending: stats.dseActionsPending,
        dse_reviews_due: stats.dseReviewsDue,
      },
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Emit a domain event to the outbox table within the current transaction.
   */
  private async emitEvent(
    tx: import("postgres").TransactionSql,
    ctx: TenantContext,
    eventType: DomainEventType,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const eventId = crypto.randomUUID();
    await tx`
      INSERT INTO domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      ) VALUES (
        ${eventId}, ${ctx.tenantId}, ${aggregateType}, ${aggregateId},
        ${eventType}, ${JSON.stringify(payload)}::jsonb, now()
      )
    `;
  }
}

// =============================================================================
// Row Mappers
// =============================================================================

function mapIncidentRow(row: IncidentRow): IncidentResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    reported_by_employee_id: row.reportedByEmployeeId,
    injured_employee_id: row.injuredEmployeeId,
    incident_date: row.incidentDate instanceof Date ? row.incidentDate.toISOString() : String(row.incidentDate),
    reported_date: row.reportedDate instanceof Date ? row.reportedDate.toISOString() : String(row.reportedDate),
    location: row.location,
    description: row.description,
    severity: row.severity as IncidentResponse["severity"],
    injury_type: row.injuryType,
    body_part_affected: row.bodyPartAffected,
    treatment_given: row.treatmentGiven,
    witness_names: row.witnessNames,
    status: row.status as IncidentResponse["status"],
    investigation_findings: row.investigationFindings,
    corrective_actions: row.correctiveActions,
    riddor_reportable: row.riddorReportable,
    riddor_reference: row.riddorReference,
    riddor_reported_date: row.riddorReportedDate ? String(row.riddorReportedDate) : null,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function mapRiskAssessmentRow(row: RiskAssessmentRow): RiskAssessmentResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    title: row.title,
    description: row.description,
    area_or_activity: row.areaOrActivity,
    assessor_employee_id: row.assessorEmployeeId,
    assessment_date: String(row.assessmentDate),
    review_date: String(row.reviewDate),
    status: row.status as RiskAssessmentResponse["status"],
    hazards: row.hazards,
    overall_risk_level: row.overallRiskLevel as RiskAssessmentResponse["overall_risk_level"],
    approved_by: row.approvedBy,
    approved_at: row.approvedAt instanceof Date ? row.approvedAt.toISOString() : row.approvedAt ? String(row.approvedAt) : null,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function mapDSEAssessmentRow(row: DSEAssessmentRow): DSEAssessmentResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    assessment_date: String(row.assessmentDate),
    next_review_date: row.nextReviewDate ? String(row.nextReviewDate) : null,
    assessor_employee_id: row.assessorEmployeeId,
    workstation_adequate: row.workstationAdequate,
    chair_adjustable: row.chairAdjustable,
    screen_position_ok: row.screenPositionOk,
    lighting_adequate: row.lightingAdequate,
    breaks_taken: row.breaksTaken,
    eye_test_offered: row.eyeTestOffered,
    issues_found: row.issuesFound,
    actions_required: row.actionsRequired,
    status: row.status as DSEAssessmentResponse["status"],
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}
