/**
 * Data Breach Module - Service Layer
 *
 * Implements business logic for UK GDPR data breach notification workflow.
 * Enforces the state machine, calculates ICO deadlines,
 * and emits domain events via the outbox pattern.
 *
 * UK GDPR Article 33: Report to ICO within 72 hours of becoming aware
 * UK GDPR Article 34: Notify individuals when high risk to rights and freedoms
 *
 * State machine: reported -> assessing -> ico_notified -> subjects_notified -> closed
 *                                      \-> remediation_only -> closed
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { DataBreachRepository, BreachRow, TimelineEntryRow } from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import {
  getValidDataBreachTransitions,
  validateDataBreachTransition,
  DataBreachStates,
  type DataBreachState,
} from "@staffora/shared/state-machines";
import type {
  ReportBreach,
  AssessBreach,
  NotifyIco,
  NotifySubjects,
  CloseBreach,
  CreateTimelineEntry,
  BreachFilters,
  PaginationQuery,
  BreachResponse,
  TimelineEntryResponse,
  BreachDashboardResponse,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/** ICO notification deadline: 72 hours from detection */
const ICO_DEADLINE_HOURS = 72;

/** Warning threshold: hours remaining before ICO deadline triggers warning */
const ICO_WARNING_THRESHOLD_HOURS = 12;

// =============================================================================
// Service
// =============================================================================

export class DataBreachService {
  constructor(
    private repository: DataBreachRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // reportBreach — Create initial breach report
  // ===========================================================================

  async reportBreach(
    ctx: TenantContext,
    data: ReportBreach,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BreachResponse>> {
    // Calculate ICO deadline: 72 hours from discovery
    const discoveryDate = new Date(data.discovery_date);
    const icoDeadline = new Date(
      discoveryDate.getTime() + ICO_DEADLINE_HOURS * 60 * 60 * 1000
    );

    try {
      const breach = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          // Create the breach record (status = 'reported')
          const result = await this.repository.createBreach(tx, ctx, {
            ...data,
            icoDeadline,
          });

          // Add initial timeline entry
          await this.repository.createTimelineEntry(tx, ctx, result.id, {
            action: "Breach reported and registered",
            notes: `Severity: ${data.severity || "medium"}. Breach type: ${data.breach_category}. ICO notification deadline: ${icoDeadline.toISOString()}`,
          });

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "data_breach",
            aggregateId: result.id,
            eventType: "compliance.data_breach.reported",
            payload: {
              breach: {
                id: result.id,
                title: result.title,
                severity: result.severity,
                breachCategory: result.breachCategory,
                discoveryDate: result.detectedAt,
                icoDeadline: result.icoDeadline,
                estimatedIndividualsAffected: result.estimatedIndividualsAffected,
              },
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: this.mapBreachToResponse(breach) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create data breach record",
        },
      };
    }
  }

  // ===========================================================================
  // assessBreach — Risk assessment
  // ===========================================================================

  async assessBreach(
    ctx: TenantContext,
    breachId: string,
    data: AssessBreach,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BreachResponse>> {
    // Fetch existing breach
    const existing = await this.repository.getBreachById(ctx, breachId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Data breach not found",
        },
      };
    }

    // Validate state transition: must be in 'reported' to transition to 'assessing'
    const currentStatus = existing.status as DataBreachState;

    // Allow assess from 'reported' or if already 'assessing' (re-assessment)
    if (
      currentStatus !== DataBreachStates.REPORTED &&
      currentStatus !== DataBreachStates.ASSESSING
    ) {
      const validTransitions = getValidDataBreachTransitions(currentStatus);
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot assess breach in '${currentStatus}' state. Breach must be in 'reported' or 'assessing' state.`,
          details: {
            currentStatus,
            validTransitions,
          },
        },
      };
    }

    try {
      const breach = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.assessBreach(
            tx,
            breachId,
            data,
            currentStatus,
            ctx.userId || ""
          );

          if (!result) {
            return null; // Concurrent modification
          }

          // Add timeline entry
          await this.repository.createTimelineEntry(tx, ctx, breachId, {
            action: "Risk assessment completed",
            notes:
              `Severity: ${data.severity}. ` +
              `Risk to individuals: ${data.risk_to_individuals ? "yes" : "no"}. ` +
              `High risk: ${data.high_risk_to_individuals ? "yes" : "no"}. ` +
              `ICO notification required: ${data.ico_notification_required ? "yes" : "no"}. ` +
              `Subject notification required: ${data.subject_notification_required ? "yes" : "no"}.`,
          });

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "data_breach",
            aggregateId: breachId,
            eventType: "compliance.data_breach.assessed",
            payload: {
              breachId,
              severity: data.severity,
              riskToIndividuals: data.risk_to_individuals,
              highRiskToIndividuals: data.high_risk_to_individuals,
              icoNotificationRequired: data.ico_notification_required,
              subjectNotificationRequired: data.subject_notification_required,
              icoDeadline: result.icoDeadline,
              actor: ctx.userId,
            },
          });

          // If ICO notification is NOT required, auto-check the deadline warning
          if (!data.ico_notification_required) {
            const hoursRemaining = this.calculateHoursRemaining(result.icoDeadline);
            // Emit warning event if approaching deadline and they decided not to notify
            if (hoursRemaining !== null && hoursRemaining <= ICO_WARNING_THRESHOLD_HOURS) {
              await this.emitDomainEvent(tx, ctx, {
                aggregateType: "data_breach",
                aggregateId: breachId,
                eventType: "compliance.data_breach.ico_deadline_approaching",
                payload: {
                  breachId,
                  hoursRemaining,
                  icoDeadline: result.icoDeadline,
                  icoNotificationRequired: false,
                  actor: ctx.userId,
                },
              });
            }
          }

          return result;
        }
      );

      if (!breach) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message:
              "Breach status was modified concurrently. Please retry.",
          },
        };
      }

      return { success: true, data: this.mapBreachToResponse(breach) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to assess breach",
        },
      };
    }
  }

  // ===========================================================================
  // notifyICO — Record ICO notification details
  // ===========================================================================

  async notifyICO(
    ctx: TenantContext,
    breachId: string,
    data: NotifyIco,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BreachResponse>> {
    const existing = await this.repository.getBreachById(ctx, breachId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Data breach not found",
        },
      };
    }

    // Validate state: must be in 'assessing' to transition to 'ico_notified'
    const currentStatus = existing.status as DataBreachState;
    if (currentStatus !== DataBreachStates.ASSESSING) {
      const transitionError = validateDataBreachTransition(
        currentStatus,
        DataBreachStates.ICO_NOTIFIED
      );
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message:
            transitionError ||
            `Cannot notify ICO when breach is in '${currentStatus}' state`,
          details: {
            currentStatus,
            validTransitions: getValidDataBreachTransitions(currentStatus),
          },
        },
      };
    }

    try {
      const breach = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.notifyIco(
            tx,
            breachId,
            data,
            currentStatus,
            existing.icoDeadline
          );

          if (!result) {
            return null;
          }

          // Calculate compliance
          const notificationDate = new Date(data.ico_notification_date);
          const within72h = existing.icoDeadline
            ? notificationDate <= new Date(existing.icoDeadline)
            : null;

          // Add timeline entry
          await this.repository.createTimelineEntry(tx, ctx, breachId, {
            action: "ICO notified",
            notes:
              `ICO reference: ${data.ico_reference}. ` +
              `DPO: ${data.dpo_name} (${data.dpo_email}). ` +
              `Notified at: ${data.ico_notification_date}. ` +
              `Within 72 hours: ${within72h ? "yes" : "no"}.`,
          });

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "data_breach",
            aggregateId: breachId,
            eventType: "compliance.data_breach.ico_notified",
            payload: {
              breachId,
              icoReference: data.ico_reference,
              icoNotificationDate: data.ico_notification_date,
              dpoName: data.dpo_name,
              dpoEmail: data.dpo_email,
              within72Hours: within72h,
              actor: ctx.userId,
            },
          });

          // If not within 72 hours, emit a compliance warning
          if (within72h === false) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "data_breach",
              aggregateId: breachId,
              eventType: "compliance.data_breach.ico_notification_late",
              payload: {
                breachId,
                icoDeadline: existing.icoDeadline,
                actualNotificationDate: data.ico_notification_date,
                actor: ctx.userId,
              },
            });
          }

          return result;
        }
      );

      if (!breach) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Breach status was modified concurrently. Please retry.",
          },
        };
      }

      return { success: true, data: this.mapBreachToResponse(breach) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to record ICO notification",
        },
      };
    }
  }

  // ===========================================================================
  // notifyDataSubjects — Record data subject notifications
  // ===========================================================================

  async notifyDataSubjects(
    ctx: TenantContext,
    breachId: string,
    data: NotifySubjects,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BreachResponse>> {
    const existing = await this.repository.getBreachById(ctx, breachId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Data breach not found",
        },
      };
    }

    // Validate state: must be in 'ico_notified' to transition to 'subjects_notified'
    const currentStatus = existing.status as DataBreachState;
    if (currentStatus !== DataBreachStates.ICO_NOTIFIED) {
      const transitionError = validateDataBreachTransition(
        currentStatus,
        DataBreachStates.SUBJECTS_NOTIFIED
      );
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message:
            transitionError ||
            `Cannot notify data subjects when breach is in '${currentStatus}' state. ICO must be notified first.`,
          details: {
            currentStatus,
            validTransitions: getValidDataBreachTransitions(currentStatus),
          },
        },
      };
    }

    try {
      const breach = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.notifySubjects(
            tx,
            breachId,
            data,
            currentStatus
          );

          if (!result) {
            return null;
          }

          // Add timeline entry
          await this.repository.createTimelineEntry(tx, ctx, breachId, {
            action: "Data subjects notified",
            notes:
              `Method: ${data.subject_notification_method}. ` +
              `Subjects notified: ${data.subjects_notified_count}. ` +
              `Date: ${data.notification_date}.`,
          });

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "data_breach",
            aggregateId: breachId,
            eventType: "compliance.data_breach.subjects_notified",
            payload: {
              breachId,
              method: data.subject_notification_method,
              subjectsNotifiedCount: data.subjects_notified_count,
              notificationDate: data.notification_date,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!breach) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Breach status was modified concurrently. Please retry.",
          },
        };
      }

      return { success: true, data: this.mapBreachToResponse(breach) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to record data subject notifications",
        },
      };
    }
  }

  // ===========================================================================
  // closeBreach — Close with lessons learned
  // ===========================================================================

  async closeBreach(
    ctx: TenantContext,
    breachId: string,
    data: CloseBreach,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BreachResponse>> {
    const existing = await this.repository.getBreachById(ctx, breachId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Data breach not found",
        },
      };
    }

    // Validate state: can close from subjects_notified or remediation_only
    const currentStatus = existing.status as DataBreachState;
    const transitionError = validateDataBreachTransition(
      currentStatus,
      DataBreachStates.CLOSED
    );

    if (transitionError) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: transitionError,
          details: {
            currentStatus,
            validTransitions: getValidDataBreachTransitions(currentStatus),
          },
        },
      };
    }

    try {
      const breach = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.closeBreach(
            tx,
            breachId,
            data,
            currentStatus,
            ctx.userId || ""
          );

          if (!result) {
            return null;
          }

          // Add timeline entry
          await this.repository.createTimelineEntry(tx, ctx, breachId, {
            action: "Breach closed",
            notes: `Lessons learned documented. Remediation plan recorded.`,
          });

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "data_breach",
            aggregateId: breachId,
            eventType: "compliance.data_breach.closed",
            payload: {
              breachId,
              previousStatus: currentStatus,
              icoNotified: result.icoNotified,
              individualsNotified: result.individualsNotified,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!breach) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Breach status was modified concurrently. Please retry.",
          },
        };
      }

      return { success: true, data: this.mapBreachToResponse(breach) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to close breach",
        },
      };
    }
  }

  // ===========================================================================
  // List & Get operations
  // ===========================================================================

  async listBreaches(
    ctx: TenantContext,
    filters: BreachFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<BreachResponse>> {
    const result = await this.repository.listBreaches(ctx, filters, pagination);

    return {
      items: result.items.map((row) => this.mapBreachToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getBreach(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<BreachResponse>> {
    const breach = await this.repository.getBreachById(ctx, id);

    if (!breach) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Data breach not found",
        },
      };
    }

    return { success: true, data: this.mapBreachToResponse(breach) };
  }

  async getOverdueBreaches(
    ctx: TenantContext,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<BreachResponse>> {
    const result = await this.repository.getOverdueBreaches(ctx, pagination);

    return {
      items: result.items.map((row) => this.mapBreachToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Dashboard
  // ===========================================================================

  async getBreachDashboard(
    ctx: TenantContext
  ): Promise<ServiceResult<BreachDashboardResponse>> {
    try {
      const stats = await this.repository.getDashboardStats(ctx);

      return {
        success: true,
        data: {
          open_breaches: stats.openBreaches,
          overdue_ico_notifications: stats.overdueIcoNotifications,
          pending_ico_notifications: stats.pendingIcoNotifications,
          pending_subject_notifications: stats.pendingSubjectNotifications,
          recently_closed: stats.recentlyClosed,
          by_severity: stats.bySeverity,
          by_status: stats.byStatus,
          avg_hours_to_ico_notification: stats.avgHoursToIcoNotification,
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message:
            error instanceof Error
              ? error.message
              : "Failed to load breach dashboard",
        },
      };
    }
  }

  // ===========================================================================
  // Timeline Operations
  // ===========================================================================

  async getTimeline(
    ctx: TenantContext,
    breachId: string
  ): Promise<ServiceResult<TimelineEntryResponse[]>> {
    const breach = await this.repository.getBreachById(ctx, breachId);
    if (!breach) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Data breach not found",
        },
      };
    }

    const entries = await this.repository.getTimeline(ctx, breachId);
    return {
      success: true,
      data: entries.map((entry) => this.mapTimelineToResponse(entry)),
    };
  }

  async addTimelineEntry(
    ctx: TenantContext,
    breachId: string,
    data: CreateTimelineEntry,
    _idempotencyKey?: string
  ): Promise<ServiceResult<TimelineEntryResponse>> {
    const breach = await this.repository.getBreachById(ctx, breachId);
    if (!breach) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Data breach not found",
        },
      };
    }

    // Cannot add timeline entries to closed breaches
    if (breach.status === "closed") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: "Cannot add timeline entries to a closed breach",
        },
      };
    }

    try {
      const entry = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createTimelineEntry(
            tx,
            ctx,
            breachId,
            data
          );

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "data_breach",
            aggregateId: breachId,
            eventType: "compliance.data_breach.timeline_entry_added",
            payload: {
              breachId,
              timelineEntryId: result.id,
              action: data.action,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: this.mapTimelineToResponse(entry) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to add timeline entry",
        },
      };
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private calculateHoursRemaining(
    icoDeadline: Date | null
  ): number | null {
    if (!icoDeadline) return null;
    const now = new Date();
    const deadline = new Date(icoDeadline);
    const diffMs = deadline.getTime() - now.getTime();
    return Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10; // 1 decimal place
  }

  private toISOStringOrNull(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  private mapBreachToResponse(row: BreachRow): BreachResponse {
    const hoursRemaining = this.calculateHoursRemaining(row.icoDeadline);
    const isOverdue =
      !row.icoNotified &&
      hoursRemaining !== null &&
      hoursRemaining < 0 &&
      row.status !== "closed" &&
      row.status !== "remediation_only";

    return {
      id: row.id,
      tenant_id: row.tenantId,
      title: row.title,
      description: row.description,
      discovery_date: this.toISOStringOrNull(row.detectedAt) || "",
      detected_by: row.detectedBy,
      severity: row.severity as BreachResponse["severity"],
      status: row.status,
      breach_category: row.breachCategory,
      breach_type: row.breachType,
      nature_of_breach: row.natureOfBreach,
      data_categories_affected: row.dataCategoriesAffected,
      estimated_individuals_affected: row.estimatedIndividualsAffected,
      likely_consequences: row.likelyConsequences,
      measures_taken: row.measuresTaken,
      containment_actions: row.containmentActions,
      root_cause: row.rootCause,
      // Risk assessment
      risk_to_individuals: row.riskToIndividuals,
      high_risk_to_individuals: row.highRiskToIndividuals,
      ico_notification_required: row.icoNotificationRequired,
      subject_notification_required: row.subjectNotificationRequired,
      assessment_notes: row.assessmentNotes,
      assessed_at: this.toISOStringOrNull(row.assessedAt),
      // ICO notification
      ico_notified: row.icoNotified,
      ico_notification_date: this.toISOStringOrNull(row.icoNotificationDate),
      ico_reference: row.icoReference,
      ico_deadline: this.toISOStringOrNull(row.icoDeadline),
      ico_notified_within_72h: row.icoNotifiedWithin72h,
      // DPO
      dpo_name: row.dpoName,
      dpo_email: row.dpoEmail,
      dpo_phone: row.dpoPhone,
      // Data subject notification
      individuals_notified: row.individualsNotified,
      subject_notification_method: row.subjectNotificationMethod,
      subjects_notified_count: row.subjectsNotifiedCount,
      subject_notification_content: row.subjectNotificationContent,
      subjects_notification_date: this.toISOStringOrNull(row.subjectsNotificationDate),
      // Resolution
      lessons_learned: row.lessonsLearned,
      remediation_plan: row.remediationPlan,
      resolved_at: this.toISOStringOrNull(row.resolvedAt),
      closed_at: this.toISOStringOrNull(row.closedAt),
      // Computed
      is_overdue: isOverdue,
      hours_remaining: row.icoNotified ? null : hoursRemaining,
      created_at: this.toISOStringOrNull(row.createdAt) || "",
      updated_at: this.toISOStringOrNull(row.updatedAt) || "",
    };
  }

  private mapTimelineToResponse(
    row: TimelineEntryRow
  ): TimelineEntryResponse {
    return {
      id: row.id,
      breach_id: row.breachId,
      action: row.action,
      action_by: row.actionBy,
      action_at: this.toISOStringOrNull(row.actionAt) || "",
      notes: row.notes,
      created_at: this.toISOStringOrNull(row.createdAt) || "",
    };
  }

  private async emitDomainEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    event: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
      ) VALUES (
        gen_random_uuid(), ${ctx.tenantId}::uuid, ${event.aggregateType},
        ${event.aggregateId}::uuid, ${event.eventType},
        ${JSON.stringify(event.payload)}::jsonb, now()
      )
    `;
  }
}
