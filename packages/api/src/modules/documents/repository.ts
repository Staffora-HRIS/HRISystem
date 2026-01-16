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

// =============================================================================
// Types
// =============================================================================

export interface TenantContext {
  tenantId: string;
  userId: string;
}

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

    const rows = await this.db.query<DocumentRow>`
      SELECT
        d.id,
        d.tenant_id as "tenantId",
        d.employee_id as "employeeId",
        app.get_employee_display_name(d.employee_id) as "employeeName",
        d.category,
        d.name,
        d.description,
        d.file_key as "fileKey",
        d.file_name as "fileName",
        d.file_size as "fileSize",
        d.mime_type as "mimeType",
        d.version,
        d.status,
        d.expires_at as "expiresAt",
        d.tags,
        d.uploaded_by as "uploadedBy",
        app.get_user_display_name(d.uploaded_by) as "uploadedByName",
        d.created_at as "createdAt",
        d.updated_at as "updatedAt"
      FROM app.documents d
      WHERE d.tenant_id = ${context.tenantId}::uuid
        ${filters.employee_id ? this.db.client`AND d.employee_id = ${filters.employee_id}::uuid` : this.db.client``}
        ${filters.category ? this.db.client`AND d.category = ${filters.category}` : this.db.client``}
        ${filters.status ? this.db.client`AND d.status = ${filters.status}` : this.db.client``}
        ${
          filters.expiring_within_days
            ? this.db.client`AND d.expires_at IS NOT NULL AND d.expires_at <= now() + ${filters.expiring_within_days}::integer * interval '1 day'`
            : this.db.client``
        }
        ${filters.search ? this.db.client`AND d.name ILIKE ${"%" + filters.search + "%"}` : this.db.client``}
        ${pagination.cursor ? this.db.client`AND d.id > ${pagination.cursor}::uuid` : this.db.client``}
      ORDER BY d.created_at DESC, d.id
      LIMIT ${limit + 1}
    `;

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  async findDocumentById(
    context: TenantContext,
    id: string
  ): Promise<DocumentRow | null> {
    const rows = await this.db.query<DocumentRow>`
      SELECT
        d.id,
        d.tenant_id as "tenantId",
        d.employee_id as "employeeId",
        app.get_employee_display_name(d.employee_id) as "employeeName",
        d.category,
        d.name,
        d.description,
        d.file_key as "fileKey",
        d.file_name as "fileName",
        d.file_size as "fileSize",
        d.mime_type as "mimeType",
        d.version,
        d.status,
        d.expires_at as "expiresAt",
        d.tags,
        d.uploaded_by as "uploadedBy",
        app.get_user_display_name(d.uploaded_by) as "uploadedByName",
        d.created_at as "createdAt",
        d.updated_at as "updatedAt"
      FROM app.documents d
      WHERE d.id = ${id}::uuid
        AND d.tenant_id = ${context.tenantId}::uuid
    `;

    return rows[0] ?? null;
  }

  async findDocumentVersions(
    context: TenantContext,
    documentId: string
  ): Promise<DocumentVersionRow[]> {
    return await this.db.query<DocumentVersionRow>`
      SELECT
        dv.id,
        dv.document_id as "documentId",
        dv.version,
        dv.file_key as "fileKey",
        dv.file_size as "fileSize",
        dv.uploaded_by as "uploadedBy",
        app.get_user_display_name(dv.uploaded_by) as "uploadedByName",
        dv.created_at as "createdAt"
      FROM app.document_versions dv
      INNER JOIN app.documents d ON dv.document_id = d.id
      WHERE dv.document_id = ${documentId}::uuid
        AND d.tenant_id = ${context.tenantId}::uuid
      ORDER BY dv.version DESC
    `;
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
        tenant_id, employee_id, category, name, description,
        file_key, file_name, file_size, mime_type,
        version, status, expires_at, tags, uploaded_by
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
        'active',
        ${data.expires_at ?? null}::date,
        ${data.tags ?? []}::text[],
        ${context.userId}::uuid
      )
      RETURNING
        id,
        tenant_id as "tenantId",
        employee_id as "employeeId",
        category,
        name,
        description,
        file_key as "fileKey",
        file_name as "fileName",
        file_size as "fileSize",
        mime_type as "mimeType",
        version,
        status,
        expires_at as "expiresAt",
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
        name = COALESCE(${data.name ?? null}, name),
        description = COALESCE(${data.description ?? null}, description),
        category = COALESCE(${data.category ?? null}, category),
        expires_at = COALESCE(${data.expires_at ?? null}::date, expires_at),
        tags = COALESCE(${data.tags ?? null}::text[], tags),
        status = COALESCE(${data.status ?? null}, status),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
      RETURNING
        id,
        tenant_id as "tenantId",
        employee_id as "employeeId",
        category,
        name,
        description,
        file_key as "fileKey",
        file_name as "fileName",
        file_size as "fileSize",
        mime_type as "mimeType",
        version,
        status,
        expires_at as "expiresAt",
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
      SET status = 'archived', updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
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
        document_id, version, file_key, file_size, uploaded_by
      )
      SELECT
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
        version,
        file_key as "fileKey",
        file_size as "fileSize",
        uploaded_by as "uploadedBy",
        created_at as "createdAt"
    `;

    return rows[0]!;
  }

  // ===========================================================================
  // Expiry Check
  // ===========================================================================

  async getExpiringDocuments(
    context: TenantContext,
    daysAhead: number = 30
  ): Promise<DocumentRow[]> {
    return await this.db.query<DocumentRow>`
      SELECT
        d.id,
        d.tenant_id as "tenantId",
        d.employee_id as "employeeId",
        app.get_employee_display_name(d.employee_id) as "employeeName",
        d.category,
        d.name,
        d.description,
        d.file_key as "fileKey",
        d.file_name as "fileName",
        d.file_size as "fileSize",
        d.mime_type as "mimeType",
        d.version,
        d.status,
        d.expires_at as "expiresAt",
        d.tags,
        d.uploaded_by as "uploadedBy",
        d.created_at as "createdAt",
        d.updated_at as "updatedAt"
      FROM app.documents d
      WHERE d.tenant_id = ${context.tenantId}::uuid
        AND d.status = 'active'
        AND d.expires_at IS NOT NULL
        AND d.expires_at <= now() + ${daysAhead}::integer * interval '1 day'
        AND d.expires_at > now()
      ORDER BY d.expires_at ASC
    `;
  }
}
