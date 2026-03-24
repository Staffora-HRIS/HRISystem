/**
 * Documents Module - Repository Layer
 *
 * Handles database operations for document management.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  CreateDocument,
  UpdateDocument,
  DocumentFilters,
  DocumentCategory,
  DocumentStatus,
} from "./schemas";

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface DocumentRow {
  id: string;
  tenantId: string;
  employeeId: string | null;
  employeeName: string | null;
  category: DocumentCategory;
  name: string;
  description: string | null;
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  version: number;
  status: DocumentStatus;
  expiresAt: Date | null;
  tags: string[];
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentVersionRow {
  id: string;
  documentId: string;
  version: number;
  fileKey: string;
  fileSize: number;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface RecentDocumentRow {
  id: string;
  name: string;
  category: string;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: Date;
}

export interface ExpiringDocumentRow {
  id: string;
  name: string;
  category: string;
  expiresAt: Date;
}

export interface MyDocumentsSummaryRow {
  employeeId: string | null;
  categoryCounts: CategoryCount[];
  recentDocuments: RecentDocumentRow[];
  expiringDocuments: ExpiringDocumentRow[];
}

// =============================================================================
// Repository
// =============================================================================

export class DocumentsRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Find Operations
  // ===========================================================================

  async findDocuments(
    context: TenantContext,
    filters: DocumentFilters = {},
    pagination: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedResult<DocumentRow>> {
    const limit = pagination.limit ?? 20;

    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<DocumentRow[]>`
        SELECT
          d.id,
          d.tenant_id as "tenantId",
          d.employee_id as "employeeId",
          app.get_employee_display_name(d.employee_id) as "employeeName",
          d.category,
          d.title as "name",
          d.description,
          d.file_path as "fileKey",
          d.original_filename as "fileName",
          d.file_size as "fileSize",
          d.mime_type as "mimeType",
          d.version,
          CASE WHEN d.deleted_at IS NOT NULL THEN 'archived' ELSE 'active' END as "status",
          d.valid_until as "expiresAt",
          d.tags,
          d.uploaded_by as "uploadedBy",
          COALESCE((SELECT u.name FROM app."user" u WHERE u.id = d.uploaded_by::text), 'Unknown') as "uploadedByName",
          d.created_at as "createdAt",
          d.updated_at as "updatedAt"
        FROM app.documents d
        WHERE d.tenant_id = ${context.tenantId}::uuid
          ${filters.employee_id ? tx`AND d.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.category ? tx`AND d.category = ${filters.category}` : tx``}
          ${
            filters.status === 'archived'
              ? tx`AND d.deleted_at IS NOT NULL`
              : filters.status
                ? tx`AND d.deleted_at IS NULL`
                : tx`AND d.deleted_at IS NULL`
          }
          ${
            filters.expiring_within_days
              ? tx`AND d.valid_until IS NOT NULL AND d.valid_until <= now() + ${filters.expiring_within_days}::integer * interval '1 day'`
              : tx``
          }
          ${filters.search ? tx`AND d.title ILIKE ${"%" + filters.search + "%"}` : tx``}
          ${pagination.cursor ? tx`AND d.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY d.created_at DESC, d.id
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  async findDocumentById(
    context: TenantContext,
    id: string
  ): Promise<DocumentRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<DocumentRow[]>`
        SELECT
          d.id,
          d.tenant_id as "tenantId",
          d.employee_id as "employeeId",
          app.get_employee_display_name(d.employee_id) as "employeeName",
          d.category,
          d.title as "name",
          d.description,
          d.file_path as "fileKey",
          d.original_filename as "fileName",
          d.file_size as "fileSize",
          d.mime_type as "mimeType",
          d.version,
          CASE WHEN d.deleted_at IS NOT NULL THEN 'archived' ELSE 'active' END as "status",
          d.valid_until as "expiresAt",
          d.tags,
          d.uploaded_by as "uploadedBy",
          COALESCE((SELECT u.name FROM app."user" u WHERE u.id = d.uploaded_by::text), 'Unknown') as "uploadedByName",
          d.created_at as "createdAt",
          d.updated_at as "updatedAt"
        FROM app.documents d
        WHERE d.id = ${id}::uuid
          AND d.tenant_id = ${context.tenantId}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  async findDocumentVersions(
    context: TenantContext,
    documentId: string
  ): Promise<DocumentVersionRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<DocumentVersionRow[]>`
        SELECT
          dv.id,
          dv.document_id as "documentId",
          dv.version_number as "version",
          dv.file_path as "fileKey",
          dv.file_size as "fileSize",
          dv.created_by as "uploadedBy",
          COALESCE((SELECT u.name FROM app."user" u WHERE u.id = dv.created_by::text), 'Unknown') as "uploadedByName",
          dv.created_at as "createdAt"
        FROM app.document_versions dv
        INNER JOIN app.documents d ON dv.document_id = d.id
        WHERE dv.document_id = ${documentId}::uuid
          AND d.tenant_id = ${context.tenantId}::uuid
        ORDER BY dv.version_number DESC
      `;
    });
  }

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  async createDocument(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateDocument & { file_key: string }
  ): Promise<DocumentRow> {
    const rows = await tx<DocumentRow[]>`
      INSERT INTO app.documents (
        tenant_id, employee_id, category, title, description,
        file_path, original_filename, file_size, mime_type,
        version, valid_until, tags, uploaded_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employee_id ?? null}::uuid,
        ${data.category},
        ${data.name},
        ${data.description ?? null},
        ${data.file_key},
        ${data.file_name},
        ${data.file_size},
        ${data.mime_type},
        1,
        ${data.expires_at ?? null}::date,
        ${data.tags ?? []}::text[],
        ${context.userId}::uuid
      )
      RETURNING
        id,
        tenant_id as "tenantId",
        employee_id as "employeeId",
        category,
        title as "name",
        description,
        file_path as "fileKey",
        original_filename as "fileName",
        file_size as "fileSize",
        mime_type as "mimeType",
        version,
        CASE WHEN deleted_at IS NOT NULL THEN 'archived' ELSE 'active' END as "status",
        valid_until as "expiresAt",
        tags,
        uploaded_by as "uploadedBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return rows[0]!;
  }

  async updateDocument(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateDocument
  ): Promise<DocumentRow | null> {
    const rows = await tx<DocumentRow[]>`
      UPDATE app.documents
      SET
        title = COALESCE(${data.name ?? null}, title),
        description = COALESCE(${data.description ?? null}, description),
        category = COALESCE(${data.category ?? null}, category),
        valid_until = COALESCE(${data.expires_at ?? null}::date, valid_until),
        tags = COALESCE(${data.tags ?? null}::text[], tags),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
      RETURNING
        id,
        tenant_id as "tenantId",
        employee_id as "employeeId",
        category,
        title as "name",
        description,
        file_path as "fileKey",
        original_filename as "fileName",
        file_size as "fileSize",
        mime_type as "mimeType",
        version,
        CASE WHEN deleted_at IS NOT NULL THEN 'archived' ELSE 'active' END as "status",
        valid_until as "expiresAt",
        tags,
        uploaded_by as "uploadedBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    return rows[0] ?? null;
  }

  async deleteDocument(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.documents
      SET deleted_at = now(), updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
        AND deleted_at IS NULL
    `;

    return result.count > 0;
  }

  async createDocumentVersion(
    tx: TransactionSql,
    context: TenantContext,
    documentId: string,
    fileKey: string,
    fileSize: number
  ): Promise<DocumentVersionRow> {
    // Increment version on main document
    await tx`
      UPDATE app.documents
      SET version = version + 1, updated_at = now()
      WHERE id = ${documentId}::uuid
        AND tenant_id = ${context.tenantId}::uuid
    `;

    // Insert version record
    const rows = await tx<DocumentVersionRow[]>`
      INSERT INTO app.document_versions (
        tenant_id, document_id, version_number, file_path, file_size, created_by
      )
      SELECT
        d.tenant_id,
        ${documentId}::uuid,
        d.version,
        ${fileKey},
        ${fileSize},
        ${context.userId}::uuid
      FROM app.documents d
      WHERE d.id = ${documentId}::uuid
      RETURNING
        id,
        document_id as "documentId",
        version_number as "version",
        file_path as "fileKey",
        file_size as "fileSize",
        created_by as "uploadedBy",
        created_at as "createdAt"
    `;

    return rows[0]!;
  }

  // ===========================================================================
  // My Documents Summary (Self-Service Portal)
  // ===========================================================================

  async getMyDocumentsSummary(
    context: TenantContext
  ): Promise<MyDocumentsSummaryRow> {
    return await this.db.withTransaction(context, async (tx) => {
      // Get employee ID for current user
      const employees = await tx<{ id: string }[]>`
        SELECT id FROM app.employees
        WHERE user_id = ${context.userId!}::uuid AND tenant_id = ${context.tenantId}::uuid
        LIMIT 1
      `;

      const employee = employees[0];
      if (!employee) {
        return {
          employeeId: null,
          categoryCounts: [],
          recentDocuments: [],
          expiringDocuments: [],
        };
      }

      // Get document counts by category
      const categoryCounts = await tx<CategoryCount[]>`
        SELECT category, COUNT(*)::int as count
        FROM app.documents
        WHERE employee_id = ${employee.id}::uuid
          AND tenant_id = ${context.tenantId}::uuid
          AND deleted_at IS NULL
        GROUP BY category
        ORDER BY count DESC
      `;

      // Get recent documents
      const recentDocuments = await tx<RecentDocumentRow[]>`
        SELECT id, title as "name", category, mime_type as "mimeType", file_size as "fileSize", created_at as "createdAt"
        FROM app.documents
        WHERE employee_id = ${employee.id}::uuid
          AND tenant_id = ${context.tenantId}::uuid
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 5
      `;

      // Get expiring documents (within 30 days)
      const expiringDocuments = await tx<ExpiringDocumentRow[]>`
        SELECT id, title as "name", category, valid_until as "expiresAt"
        FROM app.documents
        WHERE employee_id = ${employee.id}::uuid
          AND tenant_id = ${context.tenantId}::uuid
          AND deleted_at IS NULL
          AND valid_until IS NOT NULL
          AND valid_until <= NOW() + INTERVAL '30 days'
        ORDER BY valid_until ASC
        LIMIT 10
      `;

      return {
        employeeId: employee.id,
        categoryCounts: [...categoryCounts],
        recentDocuments: [...recentDocuments],
        expiringDocuments: [...expiringDocuments],
      };
    });
  }

  // ===========================================================================
  // Expiry Check
  // ===========================================================================

  async getExpiringDocuments(
    context: TenantContext,
    daysAhead: number = 30
  ): Promise<DocumentRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<DocumentRow[]>`
        SELECT
          d.id,
          d.tenant_id as "tenantId",
          d.employee_id as "employeeId",
          app.get_employee_display_name(d.employee_id) as "employeeName",
          d.category,
          d.title as "name",
          d.description,
          d.file_path as "fileKey",
          d.original_filename as "fileName",
          d.file_size as "fileSize",
          d.mime_type as "mimeType",
          d.version,
          CASE WHEN d.deleted_at IS NOT NULL THEN 'archived' ELSE 'active' END as "status",
          d.valid_until as "expiresAt",
          d.tags,
          d.uploaded_by as "uploadedBy",
          d.created_at as "createdAt",
          d.updated_at as "updatedAt"
        FROM app.documents d
        WHERE d.tenant_id = ${context.tenantId}::uuid
          AND d.deleted_at IS NULL
          AND d.valid_until IS NOT NULL
          AND d.valid_until <= now() + ${daysAhead}::integer * interval '1 day'
          AND d.valid_until > now()
        ORDER BY d.valid_until ASC
      `;
    });
  }
}
