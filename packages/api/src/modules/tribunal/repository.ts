/**
 * Tribunal Module - Repository Layer
 *
 * Provides data access methods for employment tribunal case entities
 * and tribunal bundle documents.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateTribunalCase,
  UpdateTribunalCase,
  TribunalCaseFilters,
  PaginationQuery,
  TribunalDocument,
  AddBundleDocument,
  UpdateBundleDocument,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

export interface TribunalCaseRow extends Row {
  id: string;
  tenantId: string;
  caseId: string | null;
  employeeId: string;
  tribunalReference: string | null;
  hearingDate: Date | null;
  claimType: string;
  respondentRepresentative: string | null;
  claimantRepresentative: string | null;
  solicitorReference: string | null;
  documents: TribunalDocument[];
  status: string;
  outcome: string | null;
  notes: string | null;
  employeeName?: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BundleDocumentRow extends Row {
  id: string;
  tenantId: string;
  tribunalCaseId: string;
  documentId: string | null;
  title: string;
  description: string | null;
  pageNumber: number | null;
  section: string;
  documentDate: Date | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  addedBy: string;
  addedAt: Date;
  notes: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class TribunalRepository {
  constructor(private db: DatabaseClient) {}

  async findById(context: TenantContext, id: string): Promise<TribunalCaseRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<TribunalCaseRow[]>`
        SELECT tc.*, COALESCE(
          (SELECT ep.first_name || ' ' || ep.last_name FROM employee_personal ep
           WHERE ep.employee_id = tc.employee_id AND ep.effective_to IS NULL LIMIT 1),
          'Unknown'
        ) AS employee_name
        FROM tribunal_cases tc WHERE tc.id = ${id}
      `;
    });
    return rows[0] || null;
  }

  async findAll(
    context: TenantContext,
    filters: TribunalCaseFilters = {},
    pagination: PaginationQuery = {},
  ): Promise<PaginatedResult<TribunalCaseRow>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor;
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<TribunalCaseRow[]>`
        SELECT tc.*, COALESCE(
          (SELECT ep.first_name || ' ' || ep.last_name FROM employee_personal ep
           WHERE ep.employee_id = tc.employee_id AND ep.effective_to IS NULL LIMIT 1),
          'Unknown'
        ) AS employee_name
        FROM tribunal_cases tc
        WHERE 1=1
          ${filters.status ? tx`AND tc.status = ${filters.status}` : tx``}
          ${filters.claim_type ? tx`AND tc.claim_type = ${filters.claim_type}` : tx``}
          ${filters.employee_id ? tx`AND tc.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.search ? tx`AND (tc.tribunal_reference ILIKE ${"%" + filters.search + "%"} OR tc.solicitor_reference ILIKE ${"%" + filters.search + "%"} OR tc.respondent_representative ILIKE ${"%" + filters.search + "%"} OR tc.claimant_representative ILIKE ${"%" + filters.search + "%"} OR tc.notes ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${cursor ? tx`AND tc.id < ${cursor}` : tx``}
        ORDER BY tc.created_at DESC, tc.id DESC
        LIMIT ${limit + 1}
      `;
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;
    return { items, nextCursor, hasMore };
  }

  async create(tx: TransactionSql, context: TenantContext, data: CreateTribunalCase): Promise<TribunalCaseRow> {
    const rows = await tx<TribunalCaseRow[]>`
      INSERT INTO tribunal_cases (tenant_id, case_id, employee_id, tribunal_reference, hearing_date, claim_type, respondent_representative, claimant_representative, solicitor_reference, notes, status, documents, created_by)
      VALUES (${context.tenantId}::uuid, ${data.case_id || null}, ${data.employee_id}::uuid, ${data.tribunal_reference || null}, ${data.hearing_date || null}, ${data.claim_type}, ${data.respondent_representative || null}, ${data.claimant_representative || null}, ${data.solicitor_reference || null}, ${data.notes || null}, 'preparation', '[]'::jsonb, ${context.userId || null}::uuid)
      RETURNING *
    `;
    return rows[0]!;
  }

  async update(tx: TransactionSql, id: string, data: UpdateTribunalCase): Promise<TribunalCaseRow | null> {
    const rows = await tx<TribunalCaseRow[]>`
      UPDATE tribunal_cases SET
        tribunal_reference = CASE WHEN ${data.tribunal_reference !== undefined} THEN ${data.tribunal_reference ?? null} ELSE tribunal_reference END,
        hearing_date = CASE WHEN ${data.hearing_date !== undefined} THEN ${data.hearing_date ?? null}::date ELSE hearing_date END,
        claim_type = COALESCE(${data.claim_type || null}, claim_type),
        respondent_representative = CASE WHEN ${data.respondent_representative !== undefined} THEN ${data.respondent_representative ?? null} ELSE respondent_representative END,
        claimant_representative = CASE WHEN ${data.claimant_representative !== undefined} THEN ${data.claimant_representative ?? null} ELSE claimant_representative END,
        solicitor_reference = CASE WHEN ${data.solicitor_reference !== undefined} THEN ${data.solicitor_reference ?? null} ELSE solicitor_reference END,
        status = COALESCE(${data.status || null}, status),
        outcome = CASE WHEN ${data.outcome !== undefined} THEN ${data.outcome ?? null} ELSE outcome END,
        notes = CASE WHEN ${data.notes !== undefined} THEN ${data.notes ?? null} ELSE notes END,
        updated_at = now()
      WHERE id = ${id} RETURNING *
    `;
    return rows[0] || null;
  }

  async delete(tx: TransactionSql, id: string): Promise<boolean> {
    const result = await tx`DELETE FROM tribunal_cases WHERE id = ${id} AND status = 'preparation'`;
    return result.count > 0;
  }

  async updateDocuments(tx: TransactionSql, id: string, documents: TribunalDocument[]): Promise<TribunalCaseRow | null> {
    const rows = await tx<TribunalCaseRow[]>`
      UPDATE tribunal_cases SET documents = ${JSON.stringify(documents)}::jsonb, updated_at = now() WHERE id = ${id} RETURNING *
    `;
    return rows[0] || null;
  }

  async employeeExists(context: TenantContext, employeeId: string): Promise<boolean> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx`SELECT 1 FROM employees WHERE id = ${employeeId} LIMIT 1`;
    });
    return rows.length > 0;
  }

  // ===========================================================================
  // Bundle Document Operations
  // ===========================================================================

  async addBundleDocument(tx: TransactionSql, context: TenantContext, tribunalCaseId: string, data: AddBundleDocument): Promise<BundleDocumentRow> {
    const rows = await tx<BundleDocumentRow[]>`
      INSERT INTO tribunal_bundle_documents (tenant_id, tribunal_case_id, document_id, title, description, page_number, section, document_date, file_url, file_name, file_size_bytes, added_by, notes, sort_order)
      VALUES (${context.tenantId}::uuid, ${tribunalCaseId}::uuid, ${data.document_id || null}::uuid, ${data.title}, ${data.description || null}, ${data.page_number ?? null}, ${data.section}, ${data.document_date || null}::date, ${data.file_url || null}, ${data.file_name || null}, ${data.file_size_bytes ?? null}, ${context.userId}::uuid, ${data.notes || null}, ${data.sort_order ?? 0})
      RETURNING *
    `;
    return rows[0]!;
  }

  async updateBundleDocument(tx: TransactionSql, bundleDocId: string, data: UpdateBundleDocument): Promise<BundleDocumentRow | null> {
    const rows = await tx<BundleDocumentRow[]>`
      UPDATE tribunal_bundle_documents SET
        title = COALESCE(${data.title || null}, title),
        description = CASE WHEN ${data.description !== undefined} THEN ${data.description ?? null} ELSE description END,
        page_number = CASE WHEN ${data.page_number !== undefined} THEN ${data.page_number ?? null} ELSE page_number END,
        section = COALESCE(${data.section || null}, section),
        document_date = CASE WHEN ${data.document_date !== undefined} THEN ${data.document_date ?? null}::date ELSE document_date END,
        file_url = CASE WHEN ${data.file_url !== undefined} THEN ${data.file_url ?? null} ELSE file_url END,
        file_name = CASE WHEN ${data.file_name !== undefined} THEN ${data.file_name ?? null} ELSE file_name END,
        file_size_bytes = CASE WHEN ${data.file_size_bytes !== undefined} THEN ${data.file_size_bytes ?? null} ELSE file_size_bytes END,
        notes = CASE WHEN ${data.notes !== undefined} THEN ${data.notes ?? null} ELSE notes END,
        sort_order = COALESCE(${data.sort_order ?? null}, sort_order),
        updated_at = now()
      WHERE id = ${bundleDocId} RETURNING *
    `;
    return rows[0] || null;
  }

  async removeBundleDocument(tx: TransactionSql, bundleDocId: string): Promise<boolean> {
    const result = await tx`DELETE FROM tribunal_bundle_documents WHERE id = ${bundleDocId}`;
    return result.count > 0;
  }

  async findBundleDocumentById(context: TenantContext, bundleDocId: string): Promise<BundleDocumentRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<BundleDocumentRow[]>`SELECT * FROM tribunal_bundle_documents WHERE id = ${bundleDocId}`;
    });
    return rows[0] || null;
  }

  async findBundleDocuments(context: TenantContext, tribunalCaseId: string): Promise<BundleDocumentRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<BundleDocumentRow[]>`
        SELECT * FROM tribunal_bundle_documents
        WHERE tribunal_case_id = ${tribunalCaseId}::uuid
        ORDER BY CASE section WHEN 'chronological' THEN 1 WHEN 'statements' THEN 2 WHEN 'correspondence' THEN 3 WHEN 'policies' THEN 4 WHEN 'contracts' THEN 5 WHEN 'medical' THEN 6 WHEN 'financial' THEN 7 WHEN 'other' THEN 8 END, sort_order ASC, page_number ASC NULLS LAST, created_at ASC
      `;
    });
  }

  async getBundleStats(context: TenantContext, tribunalCaseId: string): Promise<{ totalDocuments: number; totalPages: number | null; totalSizeBytes: number | null }> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx`SELECT COUNT(*)::int AS total_documents, MAX(page_number) AS total_pages, SUM(file_size_bytes) AS total_size_bytes FROM tribunal_bundle_documents WHERE tribunal_case_id = ${tribunalCaseId}::uuid`;
    });
    const row = rows[0] as Record<string, unknown>;
    return {
      totalDocuments: Number(row?.totalDocuments) || 0,
      totalPages: row?.totalPages ? Number(row.totalPages) : null,
      totalSizeBytes: row?.totalSizeBytes ? Number(row.totalSizeBytes) : null,
    };
  }
}
