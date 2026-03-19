/**
 * Tribunal Module - Service Layer
 *
 * Business logic for Employment Tribunal Preparation.
 * Handles validation, status transitions, document bundle management,
 * and domain events via the outbox pattern.
 *
 * Status transitions:
 *   preparation -> submitted | resolved | decided
 *   submitted   -> hearing | resolved | decided
 *   hearing     -> resolved | decided
 *   resolved    -> (terminal)
 *   decided     -> (terminal)
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { TribunalRepository, type TenantContext, type BundleDocumentRow } from "./repository";
import type {
  CreateTribunalCase,
  UpdateTribunalCase,
  AddTribunalDocument,
  UpdateTribunalDocument,
  AddBundleDocument,
  UpdateBundleDocument,
  TribunalCaseFilters,
  PaginationQuery,
  TribunalDocument,
  BundleDocumentResponse,
  BundleIndexResponse,
} from "./schemas";
import type { ServiceResult, PaginatedServiceResult } from "../../types/service-result";
import type { TribunalCaseRow } from "./repository";
import { ErrorCodes } from "../../plugins/errors";

// =============================================================================
// Constants
// =============================================================================

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  preparation: ["submitted", "resolved", "decided"],
  submitted: ["hearing", "resolved", "decided"],
  hearing: ["resolved", "decided"],
  resolved: [],
  decided: [],
};

const SECTION_ORDER = [
  "chronological", "statements", "correspondence", "policies",
  "contracts", "medical", "financial", "other",
];

// =============================================================================
// Helpers
// =============================================================================

function serialiseTribunalCase(row: TribunalCaseRow): Record<string, unknown> {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    case_id: row.caseId,
    employee_id: row.employeeId,
    tribunal_reference: row.tribunalReference,
    hearing_date: row.hearingDate instanceof Date ? row.hearingDate.toISOString().split("T")[0] : row.hearingDate,
    claim_type: row.claimType,
    respondent_representative: row.respondentRepresentative,
    claimant_representative: row.claimantRepresentative,
    solicitor_reference: row.solicitorReference,
    documents: Array.isArray(row.documents) ? row.documents : [],
    status: row.status,
    outcome: row.outcome,
    notes: row.notes,
    employee_name: row.employeeName,
    created_by: row.createdBy,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function serialiseBundleDocument(row: BundleDocumentRow): BundleDocumentResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    tribunal_case_id: row.tribunalCaseId,
    document_id: row.documentId,
    title: row.title,
    description: row.description,
    page_number: row.pageNumber,
    section: row.section,
    document_date: row.documentDate instanceof Date ? row.documentDate.toISOString().split("T")[0] : row.documentDate,
    file_url: row.fileUrl,
    file_name: row.fileName,
    file_size_bytes: row.fileSizeBytes,
    added_by: row.addedBy,
    added_at: row.addedAt instanceof Date ? row.addedAt.toISOString() : String(row.addedAt),
    notes: row.notes,
    sort_order: row.sortOrder,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// =============================================================================
// Service
// =============================================================================

export class TribunalService {
  constructor(private repository: TribunalRepository, private db: DatabaseClient) {}

  // ===========================================================================
  // Query Operations
  // ===========================================================================

  async listTribunalCases(ctx: TenantContext, filters: TribunalCaseFilters = {}, pagination: PaginationQuery = {}): Promise<PaginatedServiceResult<Record<string, unknown>>> {
    const result = await this.repository.findAll(ctx, filters, pagination);
    return { items: result.items.map(serialiseTribunalCase), nextCursor: result.nextCursor, hasMore: result.hasMore };
  }

  async getTribunalCase(ctx: TenantContext, id: string): Promise<ServiceResult<Record<string, unknown>>> {
    try {
      const tc = await this.repository.findById(ctx, id);
      if (!tc) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Tribunal case not found" } };
      return { success: true, data: serialiseTribunalCase(tc) };
    } catch (error) {
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: error instanceof Error ? error.message : "Failed to fetch tribunal case" } };
    }
  }

  // ===========================================================================
  // Mutating Operations
  // ===========================================================================

  async createTribunalCase(ctx: TenantContext, data: CreateTribunalCase, _idempotencyKey?: string): Promise<ServiceResult<Record<string, unknown>>> {
    const employeeExists = await this.repository.employeeExists(ctx, data.employee_id);
    if (!employeeExists) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Employee not found" } };
    try {
      const tc = await this.db.withTransaction({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx: TransactionSql) => {
        const result = await this.repository.create(tx, ctx, data);
        await this.emitDomainEvent(tx, ctx, { aggregateType: "tribunal_case", aggregateId: result.id, eventType: "tribunal.case.created", payload: { tribunalCase: serialiseTribunalCase(result), employeeId: data.employee_id, claimType: data.claim_type, actor: ctx.userId } });
        return result;
      });
      return { success: true, data: serialiseTribunalCase(tc) };
    } catch (error: unknown) {
      return { success: false, error: { code: "CREATE_FAILED", message: error instanceof Error ? error.message : "Failed to create tribunal case" } };
    }
  }

  async updateTribunalCase(ctx: TenantContext, id: string, data: UpdateTribunalCase, _idempotencyKey?: string): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await this.repository.findById(ctx, id);
    if (!existing) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Tribunal case not found" } };
    if (data.status && data.status !== existing.status) {
      const valid = VALID_STATUS_TRANSITIONS[existing.status] || [];
      if (!valid.includes(data.status)) return { success: false, error: { code: ErrorCodes.STATE_MACHINE_VIOLATION, message: `Cannot transition from '${existing.status}' to '${data.status}'`, details: { currentStatus: existing.status, requestedStatus: data.status, validTransitions: valid } } };
    }
    if (data.status === "decided" && !data.outcome && !existing.outcome) return { success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: "Outcome must be provided when marking a tribunal case as decided" } };
    try {
      const tc = await this.db.withTransaction({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx: TransactionSql) => {
        const result = await this.repository.update(tx, id, data);
        if (!result) return null;
        await this.emitDomainEvent(tx, ctx, { aggregateType: "tribunal_case", aggregateId: id, eventType: data.status && data.status !== existing.status ? "tribunal.case.status_changed" : "tribunal.case.updated", payload: { tribunalCaseId: id, employeeId: existing.employeeId, changes: data, previousStatus: existing.status, newStatus: data.status || existing.status, actor: ctx.userId } });
        return result;
      });
      if (!tc) return { success: false, error: { code: "UPDATE_FAILED", message: "Failed to update tribunal case" } };
      return { success: true, data: serialiseTribunalCase(tc) };
    } catch (error: unknown) {
      return { success: false, error: { code: "UPDATE_FAILED", message: error instanceof Error ? error.message : "Failed to update tribunal case" } };
    }
  }

  async deleteTribunalCase(ctx: TenantContext, id: string, _idempotencyKey?: string): Promise<ServiceResult<{ message: string }>> {
    const existing = await this.repository.findById(ctx, id);
    if (!existing) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Tribunal case not found" } };
    if (existing.status !== "preparation") return { success: false, error: { code: ErrorCodes.STATE_MACHINE_VIOLATION, message: `Cannot delete a tribunal case with status '${existing.status}'. Only 'preparation' cases can be deleted.`, details: { currentStatus: existing.status } } };
    try {
      const deleted = await this.db.withTransaction({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx: TransactionSql) => {
        const result = await this.repository.delete(tx, id);
        if (result) await this.emitDomainEvent(tx, ctx, { aggregateType: "tribunal_case", aggregateId: id, eventType: "tribunal.case.deleted", payload: { tribunalCaseId: id, employeeId: existing.employeeId, claimType: existing.claimType, actor: ctx.userId } });
        return result;
      });
      if (!deleted) return { success: false, error: { code: "DELETE_FAILED", message: "Failed to delete tribunal case" } };
      return { success: true, data: { message: "Tribunal case deleted successfully" } };
    } catch (error: unknown) {
      return { success: false, error: { code: "DELETE_FAILED", message: error instanceof Error ? error.message : "Failed to delete tribunal case" } };
    }
  }

  // ===========================================================================
  // Legacy Document Management (JSONB)
  // ===========================================================================

  async addDocument(ctx: TenantContext, tribunalCaseId: string, data: AddTribunalDocument, _idempotencyKey?: string): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await this.repository.findById(ctx, tribunalCaseId);
    if (!existing) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Tribunal case not found" } };
    const newDoc: TribunalDocument = { id: crypto.randomUUID(), name: data.name, type: data.type, url: data.url, added_at: new Date().toISOString(), added_by: ctx.userId, notes: data.notes };
    const updatedDocs = [...(Array.isArray(existing.documents) ? existing.documents : []), newDoc];
    try {
      const tc = await this.db.withTransaction({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx: TransactionSql) => {
        const result = await this.repository.updateDocuments(tx, tribunalCaseId, updatedDocs);
        if (result) await this.emitDomainEvent(tx, ctx, { aggregateType: "tribunal_case", aggregateId: tribunalCaseId, eventType: "tribunal.document.added", payload: { tribunalCaseId, document: newDoc, documentCount: updatedDocs.length, actor: ctx.userId } });
        return result;
      });
      if (!tc) return { success: false, error: { code: "UPDATE_FAILED", message: "Failed to add document" } };
      return { success: true, data: serialiseTribunalCase(tc) };
    } catch (error: unknown) {
      return { success: false, error: { code: "UPDATE_FAILED", message: error instanceof Error ? error.message : "Failed to add document" } };
    }
  }

  async updateDocument(ctx: TenantContext, tribunalCaseId: string, documentId: string, data: UpdateTribunalDocument, _idempotencyKey?: string): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await this.repository.findById(ctx, tribunalCaseId);
    if (!existing) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Tribunal case not found" } };
    const currentDocs: TribunalDocument[] = Array.isArray(existing.documents) ? existing.documents : [];
    const idx = currentDocs.findIndex((d) => d.id === documentId);
    if (idx === -1) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Document not found in tribunal case" } };
    const updatedDocs = [...currentDocs];
    updatedDocs[idx] = { ...updatedDocs[idx]!, ...(data.name !== undefined && { name: data.name }), ...(data.type !== undefined && { type: data.type }), ...(data.url !== undefined && { url: data.url ?? undefined }), ...(data.notes !== undefined && { notes: data.notes ?? undefined }) };
    try {
      const tc = await this.db.withTransaction({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx: TransactionSql) => {
        const result = await this.repository.updateDocuments(tx, tribunalCaseId, updatedDocs);
        if (result) await this.emitDomainEvent(tx, ctx, { aggregateType: "tribunal_case", aggregateId: tribunalCaseId, eventType: "tribunal.document.updated", payload: { tribunalCaseId, documentId, changes: data, actor: ctx.userId } });
        return result;
      });
      if (!tc) return { success: false, error: { code: "UPDATE_FAILED", message: "Failed to update document" } };
      return { success: true, data: serialiseTribunalCase(tc) };
    } catch (error: unknown) {
      return { success: false, error: { code: "UPDATE_FAILED", message: error instanceof Error ? error.message : "Failed to update document" } };
    }
  }

  async removeDocument(ctx: TenantContext, tribunalCaseId: string, documentId: string, _idempotencyKey?: string): Promise<ServiceResult<Record<string, unknown>>> {
    const existing = await this.repository.findById(ctx, tribunalCaseId);
    if (!existing) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Tribunal case not found" } };
    const currentDocs: TribunalDocument[] = Array.isArray(existing.documents) ? existing.documents : [];
    const idx = currentDocs.findIndex((d) => d.id === documentId);
    if (idx === -1) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Document not found in tribunal case" } };
    const removedDoc = currentDocs[idx]!;
    const updatedDocs = currentDocs.filter((d) => d.id !== documentId);
    try {
      const tc = await this.db.withTransaction({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx: TransactionSql) => {
        const result = await this.repository.updateDocuments(tx, tribunalCaseId, updatedDocs);
        if (result) await this.emitDomainEvent(tx, ctx, { aggregateType: "tribunal_case", aggregateId: tribunalCaseId, eventType: "tribunal.document.removed", payload: { tribunalCaseId, documentId, documentName: removedDoc.name, documentCount: updatedDocs.length, actor: ctx.userId } });
        return result;
      });
      if (!tc) return { success: false, error: { code: "UPDATE_FAILED", message: "Failed to remove document" } };
      return { success: true, data: serialiseTribunalCase(tc) };
    } catch (error: unknown) {
      return { success: false, error: { code: "UPDATE_FAILED", message: error instanceof Error ? error.message : "Failed to remove document" } };
    }
  }

  // ===========================================================================
  // Structured Bundle Document Operations
  // ===========================================================================

  async addBundleDocument(ctx: TenantContext, tribunalCaseId: string, data: AddBundleDocument, _idempotencyKey?: string): Promise<ServiceResult<BundleDocumentResponse>> {
    const existing = await this.repository.findById(ctx, tribunalCaseId);
    if (!existing) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Tribunal case not found" } };
    try {
      const doc = await this.db.withTransaction({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx: TransactionSql) => {
        const result = await this.repository.addBundleDocument(tx, ctx, tribunalCaseId, data);
        await this.emitDomainEvent(tx, ctx, { aggregateType: "tribunal_case", aggregateId: tribunalCaseId, eventType: "tribunal.bundle_document.added", payload: { tribunalCaseId, bundleDocumentId: result.id, title: data.title, section: data.section, actor: ctx.userId } });
        return result;
      });
      return { success: true, data: serialiseBundleDocument(doc) };
    } catch (error: unknown) {
      return { success: false, error: { code: "CREATE_FAILED", message: error instanceof Error ? error.message : "Failed to add bundle document" } };
    }
  }

  async updateBundleDocument(ctx: TenantContext, tribunalCaseId: string, bundleDocId: string, data: UpdateBundleDocument, _idempotencyKey?: string): Promise<ServiceResult<BundleDocumentResponse>> {
    const existing = await this.repository.findById(ctx, tribunalCaseId);
    if (!existing) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Tribunal case not found" } };
    const existingDoc = await this.repository.findBundleDocumentById(ctx, bundleDocId);
    if (!existingDoc || existingDoc.tribunalCaseId !== tribunalCaseId) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Bundle document not found" } };
    try {
      const doc = await this.db.withTransaction({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx: TransactionSql) => {
        const result = await this.repository.updateBundleDocument(tx, bundleDocId, data);
        if (result) await this.emitDomainEvent(tx, ctx, { aggregateType: "tribunal_case", aggregateId: tribunalCaseId, eventType: "tribunal.bundle_document.updated", payload: { tribunalCaseId, bundleDocumentId: bundleDocId, changes: data, actor: ctx.userId } });
        return result;
      });
      if (!doc) return { success: false, error: { code: "UPDATE_FAILED", message: "Failed to update bundle document" } };
      return { success: true, data: serialiseBundleDocument(doc) };
    } catch (error: unknown) {
      return { success: false, error: { code: "UPDATE_FAILED", message: error instanceof Error ? error.message : "Failed to update bundle document" } };
    }
  }

  async removeBundleDocument(ctx: TenantContext, tribunalCaseId: string, bundleDocId: string, _idempotencyKey?: string): Promise<ServiceResult<{ message: string }>> {
    const existingDoc = await this.repository.findBundleDocumentById(ctx, bundleDocId);
    if (!existingDoc || existingDoc.tribunalCaseId !== tribunalCaseId) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Bundle document not found" } };
    try {
      const deleted = await this.db.withTransaction({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx: TransactionSql) => {
        const result = await this.repository.removeBundleDocument(tx, bundleDocId);
        if (result) await this.emitDomainEvent(tx, ctx, { aggregateType: "tribunal_case", aggregateId: tribunalCaseId, eventType: "tribunal.bundle_document.removed", payload: { tribunalCaseId, bundleDocumentId: bundleDocId, title: existingDoc.title, actor: ctx.userId } });
        return result;
      });
      if (!deleted) return { success: false, error: { code: "DELETE_FAILED", message: "Failed to remove bundle document" } };
      return { success: true, data: { message: "Bundle document removed successfully" } };
    } catch (error: unknown) {
      return { success: false, error: { code: "DELETE_FAILED", message: error instanceof Error ? error.message : "Failed to remove bundle document" } };
    }
  }

  // ===========================================================================
  // Bundle Index Generation
  // ===========================================================================

  async getBundleIndex(ctx: TenantContext, tribunalCaseId: string): Promise<ServiceResult<BundleIndexResponse>> {
    const tc = await this.repository.findById(ctx, tribunalCaseId);
    if (!tc) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Tribunal case not found" } };
    try {
      const documents = await this.repository.findBundleDocuments(ctx, tribunalCaseId);
      const stats = await this.repository.getBundleStats(ctx, tribunalCaseId);
      const sectionMap = new Map<string, BundleDocumentResponse[]>();
      for (const doc of documents) {
        const s = serialiseBundleDocument(doc);
        const arr = sectionMap.get(doc.section) || [];
        arr.push(s);
        sectionMap.set(doc.section, arr);
      }
      const sections = SECTION_ORDER.filter((s) => sectionMap.has(s)).map((s) => ({ section: s, documents: sectionMap.get(s)!, document_count: sectionMap.get(s)!.length }));
      return {
        success: true,
        data: {
          tribunal_case_id: tribunalCaseId,
          tribunal_reference: tc.tribunalReference,
          claim_type: tc.claimType,
          hearing_date: tc.hearingDate instanceof Date ? tc.hearingDate.toISOString().split("T")[0] : tc.hearingDate,
          status: tc.status,
          total_documents: stats.totalDocuments,
          total_pages: stats.totalPages,
          total_size_bytes: stats.totalSizeBytes,
          sections,
          generated_at: new Date().toISOString(),
        },
      };
    } catch (error: unknown) {
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: error instanceof Error ? error.message : "Failed to generate bundle index" } };
    }
  }

  // ===========================================================================
  // Bundle PDF Generation (emits event for async processing)
  // ===========================================================================

  async generateBundle(ctx: TenantContext, tribunalCaseId: string): Promise<ServiceResult<{ message: string; eventId: string }>> {
    const tc = await this.repository.findById(ctx, tribunalCaseId);
    if (!tc) return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Tribunal case not found" } };
    const stats = await this.repository.getBundleStats(ctx, tribunalCaseId);
    if (stats.totalDocuments === 0) return { success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: "Cannot generate bundle: no documents have been added" } };
    try {
      const eventId = crypto.randomUUID();
      await this.db.withTransaction({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx: TransactionSql) => {
        await this.emitDomainEvent(tx, ctx, {
          aggregateType: "tribunal_case",
          aggregateId: tribunalCaseId,
          eventType: "tribunal.bundle.generate_requested",
          payload: { tribunalCaseId, tribunalReference: tc.tribunalReference, employeeId: tc.employeeId, claimType: tc.claimType, hearingDate: tc.hearingDate, totalDocuments: stats.totalDocuments, totalSizeBytes: stats.totalSizeBytes, requestedBy: ctx.userId, eventId },
        });
      });
      return { success: true, data: { message: "Bundle generation has been queued. You will be notified when the PDF is ready.", eventId } };
    } catch (error: unknown) {
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: error instanceof Error ? error.message : "Failed to queue bundle generation" } };
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async emitDomainEvent(tx: TransactionSql, ctx: TenantContext, event: { aggregateType: string; aggregateId: string; eventType: string; payload: Record<string, unknown> }): Promise<void> {
    await tx`INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at) VALUES (gen_random_uuid(), ${ctx.tenantId}::uuid, ${event.aggregateType}, ${event.aggregateId}::uuid, ${event.eventType}, ${JSON.stringify(event.payload)}::jsonb, now())`;
  }
}
