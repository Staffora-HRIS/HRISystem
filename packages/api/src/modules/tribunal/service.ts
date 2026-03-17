/**
 * Tribunal Module - Service Layer
 *
 * Business logic for Employment Tribunal Preparation.
 * Handles validation, status transitions, document bundle management,
 * and domain events via the outbox pattern.
 *
 * Status transitions:
 *   preparation -> submitted   (ET1/ET3 forms filed)
 *   submitted   -> hearing     (hearing date confirmed/approaching)
 *   hearing     -> decided     (tribunal decision received)
 *   preparation -> decided     (case settled/withdrawn before submission)
 *
 * Documents are stored as JSONB array for flexibility. Each document entry
 * tracks name, type, URL, and provenance (who added it and when).
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { TribunalRepository, type TenantContext } from "./repository";
import type {
  CreateTribunalCase,
  UpdateTribunalCase,
  AddTribunalDocument,
  UpdateTribunalDocument,
  TribunalCaseFilters,
  PaginationQuery,
  TribunalDocument,
} from "./schemas";
import type { ServiceResult, PaginatedServiceResult } from "../../types/service-result";
import type { TribunalCaseRow } from "./repository";
import { ErrorCodes } from "../../plugins/errors";

// =============================================================================
// Constants
// =============================================================================

/**
 * Valid status transitions for tribunal cases.
 *
 * A case generally flows: preparation -> submitted -> hearing -> decided
 * But can also go directly from preparation to decided (settlement/withdrawal).
 */
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  preparation: ["submitted", "decided"],
  submitted: ["hearing", "decided"],
  hearing: ["decided"],
  decided: [],  // terminal state
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Serialise a TribunalCaseRow for API responses.
 * Converts Date objects to ISO strings for JSON serialization.
 */
function serialiseTribunalCase(row: TribunalCaseRow): Record<string, unknown> {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    case_id: row.caseId,
    employee_id: row.employeeId,
    tribunal_reference: row.tribunalReference,
    hearing_date: row.hearingDate instanceof Date
      ? row.hearingDate.toISOString().split("T")[0]
      : row.hearingDate,
    claim_type: row.claimType,
    respondent_representative: row.respondentRepresentative,
    claimant_representative: row.claimantRepresentative,
    documents: Array.isArray(row.documents) ? row.documents : [],
    status: row.status,
    outcome: row.outcome,
    notes: row.notes,
    employee_name: row.employeeName,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// =============================================================================
// Service
// =============================================================================

export class TribunalService {
  constructor(
    private repository: TribunalRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Query Operations
  // ===========================================================================

  /**
   * List tribunal cases with optional filters and cursor-based pagination
   */
  async listTribunalCases(
    ctx: TenantContext,
    filters: TribunalCaseFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<Record<string, unknown>>> {
    const result = await this.repository.findAll(ctx, filters, pagination);

    return {
      items: result.items.map(serialiseTribunalCase),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single tribunal case by ID
   */
  async getTribunalCase(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const tribunalCase = await this.repository.findById(ctx, id);

      if (!tribunalCase) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Tribunal case not found",
          },
        };
      }

      return { success: true, data: serialiseTribunalCase(tribunalCase) };
    } catch (error) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Failed to fetch tribunal case",
        },
      };
    }
  }

  // ===========================================================================
  // Mutating Operations
  // ===========================================================================

  /**
   * Create a new tribunal case.
   *
   * Validates the employee exists and writes an outbox event atomically.
   */
  async createTribunalCase(
    ctx: TenantContext,
    data: CreateTribunalCase,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    // Validate employee exists
    const employeeExists = await this.repository.employeeExists(ctx, data.employee_id);
    if (!employeeExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
        },
      };
    }

    try {
      const tribunalCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.create(tx, ctx, data);

          // Emit domain event atomically
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "tribunal_case",
            aggregateId: result.id,
            eventType: "tribunal.case.created",
            payload: {
              tribunalCase: serialiseTribunalCase(result),
              employeeId: data.employee_id,
              claimType: data.claim_type,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: serialiseTribunalCase(tribunalCase) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to create tribunal case",
        },
      };
    }
  }

  /**
   * Update a tribunal case.
   *
   * Validates status transitions if status is being changed.
   */
  async updateTribunalCase(
    ctx: TenantContext,
    id: string,
    data: UpdateTribunalCase,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    // Verify case exists
    const existing = await this.repository.findById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Tribunal case not found",
        },
      };
    }

    // Validate status transition if status is being changed
    if (data.status && data.status !== existing.status) {
      const validTransitions = VALID_STATUS_TRANSITIONS[existing.status] || [];
      if (!validTransitions.includes(data.status)) {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition tribunal case from '${existing.status}' to '${data.status}'`,
            details: {
              currentStatus: existing.status,
              requestedStatus: data.status,
              validTransitions,
            },
          },
        };
      }
    }

    // If transitioning to 'decided', outcome should be provided
    if (data.status === "decided" && !data.outcome && !existing.outcome) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Outcome must be provided when marking a tribunal case as decided",
        },
      };
    }

    try {
      const tribunalCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.update(tx, id, data);

          if (!result) {
            return null;
          }

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "tribunal_case",
            aggregateId: id,
            eventType: data.status && data.status !== existing.status
              ? "tribunal.case.status_changed"
              : "tribunal.case.updated",
            payload: {
              tribunalCaseId: id,
              employeeId: existing.employeeId,
              changes: data,
              previousStatus: existing.status,
              newStatus: data.status || existing.status,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!tribunalCase) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update tribunal case",
          },
        };
      }

      return { success: true, data: serialiseTribunalCase(tribunalCase) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to update tribunal case",
        },
      };
    }
  }

  /**
   * Delete a tribunal case.
   *
   * Only cases in 'preparation' status can be deleted.
   */
  async deleteTribunalCase(
    ctx: TenantContext,
    id: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<{ message: string }>> {
    const existing = await this.repository.findById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Tribunal case not found",
        },
      };
    }

    if (existing.status !== "preparation") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot delete a tribunal case with status '${existing.status}'. Only cases in 'preparation' status can be deleted.`,
          details: { currentStatus: existing.status, validStatuses: ["preparation"] },
        },
      };
    }

    try {
      const deleted = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.delete(tx, id);

          if (result) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "tribunal_case",
              aggregateId: id,
              eventType: "tribunal.case.deleted",
              payload: {
                tribunalCaseId: id,
                employeeId: existing.employeeId,
                claimType: existing.claimType,
                actor: ctx.userId,
              },
            });
          }

          return result;
        }
      );

      if (!deleted) {
        return {
          success: false,
          error: {
            code: "DELETE_FAILED",
            message: "Failed to delete tribunal case. It may have changed status.",
          },
        };
      }

      return { success: true, data: { message: "Tribunal case deleted successfully" } };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: error instanceof Error ? error.message : "Failed to delete tribunal case",
        },
      };
    }
  }

  // ===========================================================================
  // Document Bundle Management
  // ===========================================================================

  /**
   * Add a document to a tribunal case's document bundle.
   */
  async addDocument(
    ctx: TenantContext,
    tribunalCaseId: string,
    data: AddTribunalDocument,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await this.repository.findById(ctx, tribunalCaseId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Tribunal case not found",
        },
      };
    }

    const newDocument: TribunalDocument = {
      id: crypto.randomUUID(),
      name: data.name,
      type: data.type,
      url: data.url,
      added_at: new Date().toISOString(),
      added_by: ctx.userId,
      notes: data.notes,
    };

    const currentDocs: TribunalDocument[] = Array.isArray(existing.documents)
      ? existing.documents
      : [];
    const updatedDocs = [...currentDocs, newDocument];

    try {
      const tribunalCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateDocuments(tx, tribunalCaseId, updatedDocs);

          if (result) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "tribunal_case",
              aggregateId: tribunalCaseId,
              eventType: "tribunal.document.added",
              payload: {
                tribunalCaseId,
                document: newDocument,
                documentCount: updatedDocs.length,
                actor: ctx.userId,
              },
            });
          }

          return result;
        }
      );

      if (!tribunalCase) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to add document to tribunal case",
          },
        };
      }

      return { success: true, data: serialiseTribunalCase(tribunalCase) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to add document",
        },
      };
    }
  }

  /**
   * Update a document in a tribunal case's document bundle.
   */
  async updateDocument(
    ctx: TenantContext,
    tribunalCaseId: string,
    documentId: string,
    data: UpdateTribunalDocument,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await this.repository.findById(ctx, tribunalCaseId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Tribunal case not found",
        },
      };
    }

    const currentDocs: TribunalDocument[] = Array.isArray(existing.documents)
      ? existing.documents
      : [];
    const docIndex = currentDocs.findIndex((d) => d.id === documentId);

    if (docIndex === -1) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Document not found in tribunal case",
        },
      };
    }

    const updatedDocs = [...currentDocs];
    updatedDocs[docIndex] = {
      ...updatedDocs[docIndex]!,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.url !== undefined && { url: data.url ?? undefined }),
      ...(data.notes !== undefined && { notes: data.notes ?? undefined }),
    };

    try {
      const tribunalCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateDocuments(tx, tribunalCaseId, updatedDocs);

          if (result) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "tribunal_case",
              aggregateId: tribunalCaseId,
              eventType: "tribunal.document.updated",
              payload: {
                tribunalCaseId,
                documentId,
                changes: data,
                actor: ctx.userId,
              },
            });
          }

          return result;
        }
      );

      if (!tribunalCase) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update document in tribunal case",
          },
        };
      }

      return { success: true, data: serialiseTribunalCase(tribunalCase) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to update document",
        },
      };
    }
  }

  /**
   * Remove a document from a tribunal case's document bundle.
   */
  async removeDocument(
    ctx: TenantContext,
    tribunalCaseId: string,
    documentId: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await this.repository.findById(ctx, tribunalCaseId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Tribunal case not found",
        },
      };
    }

    const currentDocs: TribunalDocument[] = Array.isArray(existing.documents)
      ? existing.documents
      : [];
    const docIndex = currentDocs.findIndex((d) => d.id === documentId);

    if (docIndex === -1) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Document not found in tribunal case",
        },
      };
    }

    const removedDoc = currentDocs[docIndex]!;
    const updatedDocs = currentDocs.filter((d) => d.id !== documentId);

    try {
      const tribunalCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateDocuments(tx, tribunalCaseId, updatedDocs);

          if (result) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "tribunal_case",
              aggregateId: tribunalCaseId,
              eventType: "tribunal.document.removed",
              payload: {
                tribunalCaseId,
                documentId,
                documentName: removedDoc.name,
                documentCount: updatedDocs.length,
                actor: ctx.userId,
              },
            });
          }

          return result;
        }
      );

      if (!tribunalCase) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to remove document from tribunal case",
          },
        };
      }

      return { success: true, data: serialiseTribunalCase(tribunalCase) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Failed to remove document",
        },
      };
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

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
