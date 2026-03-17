/**
 * Whistleblowing Module - Service Layer
 *
 * Implements business logic for whistleblowing case management.
 * Enforces state machine transitions, PIDA protection rules,
 * anonymous reporting, and emits domain events via the outbox pattern.
 *
 * UK Public Interest Disclosure Act 1998 (PIDA):
 * - Workers who make qualifying disclosures are protected from detriment
 * - Qualifying disclosures: criminal offences, health & safety, environmental,
 *   miscarriages of justice, breach of legal obligation, cover-ups
 * - Anonymous reporting must be supported alongside confidential reporting
 *
 * State machine:
 *   submitted -> under_review -> investigating -> resolved -> closed
 *                                              -> dismissed -> closed
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  WhistleblowingRepository,
  WhistleblowingCaseRow,
  WhistleblowingAuditRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  SubmitReport,
  UpdateCase,
  WhistleblowingFilters,
  PaginationQuery,
  WhistleblowingCaseResponse,
  WhistleblowingAuditEntryResponse,
  WhistleblowingStatus,
} from "./schemas";

// =============================================================================
// State Machine
// =============================================================================

/**
 * Valid state transitions for whistleblowing cases.
 * Each key is the current status; the value is the set of valid target statuses.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  submitted: ["under_review"],
  under_review: ["investigating", "dismissed"],
  investigating: ["resolved", "dismissed"],
  resolved: ["closed"],
  dismissed: ["closed", "under_review"], // dismissed can be reopened for review
  closed: [], // terminal state
};

function canTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

function getValidTransitions(status: string): string[] {
  return VALID_TRANSITIONS[status] || [];
}

// =============================================================================
// Service
// =============================================================================

export class WhistleblowingService {
  constructor(
    private repository: WhistleblowingRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // submitReport - Create a new whistleblowing report
  // ===========================================================================

  async submitReport(
    ctx: TenantContext,
    data: SubmitReport,
    _idempotencyKey?: string
  ): Promise<ServiceResult<WhistleblowingCaseResponse>> {
    // For anonymous reports, do not store the reporter ID
    const isAnonymous = data.confidentiality_level === "anonymous";
    const reporterId = isAnonymous ? null : (ctx.userId || null);

    try {
      const whistleblowingCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          // Create the case record
          const result = await this.repository.createCase(tx, ctx, {
            ...data,
            reporterId,
          });

          // Create audit trail entry
          await this.repository.createAuditEntry(tx, ctx, result.id, {
            action: "case_submitted",
            actionBy: isAnonymous ? null : (ctx.userId || null),
            newValues: {
              category: data.category,
              confidentiality_level: data.confidentiality_level || "confidential",
              pida_protected: data.pida_protected ?? false,
            },
            notes: isAnonymous
              ? "Anonymous report submitted"
              : "Confidential report submitted",
          });

          // Emit domain event atomically
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "whistleblowing_case",
            aggregateId: result.id,
            eventType: "compliance.whistleblowing.report_submitted",
            payload: {
              caseId: result.id,
              category: result.category,
              confidentialityLevel: result.confidentialityLevel,
              pidaProtected: result.pidaProtected,
              isAnonymous,
              // Deliberately omit reporter identity from event payload
            },
          });

          return result;
        }
      );

      return { success: true, data: this.mapCaseToResponse(whistleblowingCase) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to submit whistleblowing report",
        },
      };
    }
  }

  // ===========================================================================
  // updateCase - Update case status, assignment, investigation notes, outcome
  // ===========================================================================

  async updateCase(
    ctx: TenantContext,
    caseId: string,
    data: UpdateCase,
    _idempotencyKey?: string
  ): Promise<ServiceResult<WhistleblowingCaseResponse>> {
    // Fetch existing case
    const existing = await this.repository.getCaseById(ctx, caseId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Whistleblowing case not found",
        },
      };
    }

    // Validate state transition if status is being changed
    if (data.status && data.status !== existing.status) {
      if (!canTransition(existing.status, data.status)) {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition from '${existing.status}' to '${data.status}'`,
            details: {
              currentStatus: existing.status,
              requestedStatus: data.status,
              validTransitions: getValidTransitions(existing.status),
            },
          },
        };
      }
    }

    // Prevent modification of closed cases (except via state transition which is blocked above)
    if (existing.status === "closed") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: "Cannot modify a closed whistleblowing case",
          details: {
            currentStatus: existing.status,
            validTransitions: [],
          },
        },
      };
    }

    try {
      const updatedCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateCase(
            tx,
            caseId,
            data,
            existing.status
          );

          if (!result) {
            return null; // Concurrent modification
          }

          // Build old/new values for audit
          const oldValues: Record<string, unknown> = {};
          const newValues: Record<string, unknown> = {};

          if (data.status !== undefined && data.status !== existing.status) {
            oldValues.status = existing.status;
            newValues.status = data.status;
          }
          if (data.assigned_to !== undefined && data.assigned_to !== existing.assignedTo) {
            oldValues.assigned_to = existing.assignedTo;
            newValues.assigned_to = data.assigned_to;
          }
          if (data.investigation_notes !== undefined) {
            newValues.investigation_notes = "[updated]"; // Don't store full notes in audit diff
          }
          if (data.outcome !== undefined) {
            oldValues.outcome = existing.outcome;
            newValues.outcome = data.outcome;
          }
          if (data.pida_protected !== undefined && data.pida_protected !== existing.pidaProtected) {
            oldValues.pida_protected = existing.pidaProtected;
            newValues.pida_protected = data.pida_protected;
          }

          // Determine action description
          let action = "case_updated";
          if (data.status && data.status !== existing.status) {
            action = `status_changed_to_${data.status}`;
          } else if (data.assigned_to !== undefined) {
            action = "case_assigned";
          }

          // Create audit trail entry
          await this.repository.createAuditEntry(tx, ctx, caseId, {
            action,
            actionBy: ctx.userId || null,
            oldValues: Object.keys(oldValues).length > 0 ? oldValues : null,
            newValues: Object.keys(newValues).length > 0 ? newValues : null,
          });

          // Emit domain event
          const eventType = data.status && data.status !== existing.status
            ? `compliance.whistleblowing.status_changed`
            : `compliance.whistleblowing.case_updated`;

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "whistleblowing_case",
            aggregateId: caseId,
            eventType,
            payload: {
              caseId,
              previousStatus: existing.status,
              newStatus: data.status || existing.status,
              assignedTo: data.assigned_to,
              pidaProtected: result.pidaProtected,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!updatedCase) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Case was modified concurrently. Please retry.",
          },
        };
      }

      return { success: true, data: this.mapCaseToResponse(updatedCase) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to update whistleblowing case",
        },
      };
    }
  }

  // ===========================================================================
  // List & Get operations
  // ===========================================================================

  async listCases(
    ctx: TenantContext,
    filters: WhistleblowingFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<WhistleblowingCaseResponse>> {
    const result = await this.repository.listCases(ctx, filters, pagination);

    return {
      items: result.items.map((row) => this.mapCaseToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getCase(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<WhistleblowingCaseResponse>> {
    const whistleblowingCase = await this.repository.getCaseById(ctx, id);

    if (!whistleblowingCase) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Whistleblowing case not found",
        },
      };
    }

    return { success: true, data: this.mapCaseToResponse(whistleblowingCase) };
  }

  // ===========================================================================
  // Audit Trail
  // ===========================================================================

  async getAuditTrail(
    ctx: TenantContext,
    caseId: string
  ): Promise<ServiceResult<WhistleblowingAuditEntryResponse[]>> {
    // Verify case exists first
    const whistleblowingCase = await this.repository.getCaseById(ctx, caseId);
    if (!whistleblowingCase) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Whistleblowing case not found",
        },
      };
    }

    const entries = await this.repository.getAuditTrail(ctx, caseId);
    return {
      success: true,
      data: entries.map((entry) => this.mapAuditToResponse(entry)),
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private toISOStringOrNull(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  private mapCaseToResponse(row: WhistleblowingCaseRow): WhistleblowingCaseResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      reporter_id: row.reporterId,
      category: row.category as WhistleblowingCaseResponse["category"],
      description: row.description,
      confidentiality_level: row.confidentialityLevel as WhistleblowingCaseResponse["confidentiality_level"],
      pida_protected: row.pidaProtected,
      assigned_to: row.assignedTo,
      status: row.status as WhistleblowingCaseResponse["status"],
      investigation_notes: row.investigationNotes,
      outcome: row.outcome,
      created_at: this.toISOStringOrNull(row.createdAt) || "",
      updated_at: this.toISOStringOrNull(row.updatedAt) || "",
    };
  }

  private mapAuditToResponse(row: WhistleblowingAuditRow): WhistleblowingAuditEntryResponse {
    return {
      id: row.id,
      case_id: row.caseId,
      action: row.action,
      action_by: row.actionBy,
      old_values: row.oldValues,
      new_values: row.newValues,
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
