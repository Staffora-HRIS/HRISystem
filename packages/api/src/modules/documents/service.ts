/**
 * Documents Module - Service Layer
 *
 * Implements business logic for document management.
 * Handles file storage integration and domain event emission.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  DocumentsRepository,
  TenantContext,
  DocumentRow,
  DocumentVersionRow,
} from "./repository";
import type {
  CreateDocument,
  UpdateDocument,
  DocumentFilters,
  DocumentResponse,
  DocumentVersionResponse,
  UploadUrlResponse,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedServiceResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

type DomainEventType =
  | "documents.document.created"
  | "documents.document.updated"
  | "documents.document.deleted"
  | "documents.version.created";

// =============================================================================
// Service
// =============================================================================

export class DocumentsService {
  constructor(
    private repository: DocumentsRepository,
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
  // Document Methods
  // ===========================================================================

  async listDocuments(
    context: TenantContext,
    filters: DocumentFilters = {},
    pagination: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedServiceResult<DocumentResponse>> {
    const result = await this.repository.findDocuments(context, filters, pagination);

    return {
      items: result.items.map(this.mapDocumentToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getDocument(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<DocumentResponse>> {
    const document = await this.repository.findDocumentById(context, id);

    if (!document) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Document not found",
          details: { id },
        },
      };
    }

    return {
      success: true,
      data: this.mapDocumentToResponse(document),
    };
  }

  async createDocument(
    context: TenantContext,
    data: CreateDocument,
    fileKey: string
  ): Promise<ServiceResult<DocumentResponse>> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const document = await this.repository.createDocument(tx, context, {
        ...data,
        file_key: fileKey,
      });

      await this.emitEvent(
        tx,
        context,
        "document",
        document.id,
        "documents.document.created",
        { documentId: document.id, name: data.name, category: data.category }
      );

      return document;
    });

    return {
      success: true,
      data: this.mapDocumentToResponse(result),
    };
  }

  async updateDocument(
    context: TenantContext,
    id: string,
    data: UpdateDocument
  ): Promise<ServiceResult<DocumentResponse>> {
    const existing = await this.repository.findDocumentById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Document not found",
          details: { id },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const document = await this.repository.updateDocument(tx, context, id, data);

      if (document) {
        await this.emitEvent(
          tx,
          context,
          "document",
          id,
          "documents.document.updated",
          { document, changes: data }
        );
      }

      return document;
    });

    return {
      success: true,
      data: this.mapDocumentToResponse(result!),
    };
  }

  async deleteDocument(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.findDocumentById(context, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Document not found",
          details: { id },
        },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deleteDocument(tx, context, id);

      await this.emitEvent(
        tx,
        context,
        "document",
        id,
        "documents.document.deleted",
        { documentId: id }
      );
    });

    return { success: true };
  }

  // ===========================================================================
  // Version Methods
  // ===========================================================================

  async listVersions(
    context: TenantContext,
    documentId: string
  ): Promise<ServiceResult<DocumentVersionResponse[]>> {
    const existing = await this.repository.findDocumentById(context, documentId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Document not found",
          details: { documentId },
        },
      };
    }

    const versions = await this.repository.findDocumentVersions(context, documentId);

    return {
      success: true,
      data: versions.map(this.mapVersionToResponse),
    };
  }

  async createVersion(
    context: TenantContext,
    documentId: string,
    fileKey: string,
    fileSize: number
  ): Promise<ServiceResult<DocumentVersionResponse>> {
    const existing = await this.repository.findDocumentById(context, documentId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Document not found",
          details: { documentId },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const version = await this.repository.createDocumentVersion(
        tx,
        context,
        documentId,
        fileKey,
        fileSize
      );

      await this.emitEvent(
        tx,
        context,
        "document",
        documentId,
        "documents.version.created",
        { documentId, version: version.version }
      );

      return version;
    });

    return {
      success: true,
      data: this.mapVersionToResponse(result),
    };
  }

  // ===========================================================================
  // Upload URL (S3 presigned URL placeholder)
  // ===========================================================================

  async getUploadUrl(
    context: TenantContext,
    fileName: string,
    mimeType: string
  ): Promise<ServiceResult<UploadUrlResponse>> {
    // In a real implementation, this would generate a presigned S3 URL
    const fileKey = `${context.tenantId}/${Date.now()}-${fileName}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    return {
      success: true,
      data: {
        upload_url: `https://storage.example.com/upload?key=${fileKey}`,
        file_key: fileKey,
        expires_at: expiresAt.toISOString(),
      },
    };
  }

  async getDownloadUrl(
    context: TenantContext,
    documentId: string
  ): Promise<ServiceResult<string>> {
    const document = await this.repository.findDocumentById(context, documentId);
    if (!document) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Document not found",
          details: { documentId },
        },
      };
    }

    // In a real implementation, this would generate a presigned S3 download URL
    const downloadUrl = `https://storage.example.com/download?key=${document.fileKey}`;

    return {
      success: true,
      data: downloadUrl,
    };
  }

  // ===========================================================================
  // Expiring Documents
  // ===========================================================================

  async getExpiringDocuments(
    context: TenantContext,
    daysAhead: number = 30
  ): Promise<ServiceResult<DocumentResponse[]>> {
    const documents = await this.repository.getExpiringDocuments(context, daysAhead);

    return {
      success: true,
      data: documents.map(this.mapDocumentToResponse),
    };
  }

  // ===========================================================================
  // Mapping Helpers
  // ===========================================================================

  private mapDocumentToResponse(row: DocumentRow): DocumentResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      employee_name: row.employeeName ?? undefined,
      category: row.category,
      name: row.name,
      description: row.description,
      file_key: row.fileKey,
      file_name: row.fileName,
      file_size: row.fileSize,
      mime_type: row.mimeType,
      version: row.version,
      status: row.status,
      expires_at: row.expiresAt?.toISOString().split("T")[0] ?? null,
      tags: row.tags,
      uploaded_by: row.uploadedBy,
      uploaded_by_name: row.uploadedByName ?? undefined,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private mapVersionToResponse(row: DocumentVersionRow): DocumentVersionResponse {
    return {
      id: row.id,
      document_id: row.documentId,
      version: row.version,
      file_key: row.fileKey,
      file_size: row.fileSize,
      uploaded_by: row.uploadedBy,
      uploaded_by_name: row.uploadedByName ?? undefined,
      created_at: row.createdAt.toISOString(),
    };
  }
}
