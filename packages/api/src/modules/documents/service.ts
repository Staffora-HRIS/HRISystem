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
  DocumentRow,
  DocumentVersionRow,
  MyDocumentsSummaryRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateDocument,
  UpdateDocument,
  DocumentFilters,
  DocumentResponse,
  DocumentVersionResponse,
  UploadUrlResponse,
} from "./schemas";
import { getStorageService } from "../../lib/storage";
import { scanBuffer, getVirusScanConfig } from "../../lib/virus-scan";
import { logger } from "../../lib/logger";

// =============================================================================
// Types
// =============================================================================

type DomainEventType =
  | "documents.document.created"
  | "documents.document.updated"
  | "documents.document.deleted"
  | "documents.version.created";

export interface MyDocumentsSummaryResponse {
  totalDocuments: number;
  byCategory: { category: string; count: number }[];
  recentDocuments: {
    id: string;
    name: string;
    category: string;
    mimeType: string | null;
    fileSize: number | null;
    createdAt: string;
  }[];
  expiringDocuments: {
    id: string;
    name: string;
    category: string;
    expiresAt: string;
  }[];
  message?: string;
}

// =============================================================================
// File Upload Constants
// =============================================================================

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// =============================================================================
// Service
// =============================================================================

export class DocumentsService {
  constructor(
    private repository: DocumentsRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Virus Scanning
  // ===========================================================================

  /**
   * Scan a file for viruses before storing a document record.
   *
   * Retrieves the file from storage using its key and sends it to ClamAV
   * for scanning. If ClamAV is unavailable, the upload proceeds in degraded
   * mode with a warning logged. If a virus is detected, the file is deleted
   * from storage and an error result is returned.
   *
   * @param fileKey - The storage key of the uploaded file
   * @param context - Tenant context for logging
   * @returns null if the file is clean (or degraded mode), ServiceResult error if infected
   */
  private async scanFileForViruses(
    fileKey: string,
    context: TenantContext
  ): Promise<ServiceResult<never> | null> {
    const virusConfig = getVirusScanConfig();
    const scanLog = logger.child({
      component: "virus-scan",
      tenantId: context.tenantId,
      userId: context.userId,
    });

    if (!virusConfig.enabled) {
      scanLog.debug({ fileKey }, "Virus scanning disabled, skipping");
      return null;
    }

    const storage = getStorageService();

    // Retrieve file content from storage
    let fileBuffer: Buffer | null;
    try {
      fileBuffer = await storage.getFile(fileKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      scanLog.warn(
        { fileKey, error: message },
        "Failed to retrieve file for virus scan, allowing upload in degraded mode"
      );
      return null;
    }

    if (!fileBuffer) {
      scanLog.warn(
        { fileKey },
        "File not found in storage for virus scan, allowing upload in degraded mode"
      );
      return null;
    }

    // Scan the file
    const result = await scanBuffer(fileBuffer, virusConfig);

    if (result.degraded) {
      scanLog.warn(
        { fileKey, error: result.error },
        "Virus scan ran in degraded mode (ClamAV unavailable), upload allowed"
      );
      return null;
    }

    if (!result.clean) {
      scanLog.error(
        { fileKey, virusName: result.virusName },
        "Virus detected in uploaded file, rejecting and deleting from storage"
      );

      // Delete the infected file from storage
      try {
        await storage.delete(fileKey);
      } catch (deleteErr) {
        scanLog.error(
          { fileKey, error: deleteErr instanceof Error ? deleteErr.message : String(deleteErr) },
          "Failed to delete infected file from storage"
        );
      }

      return {
        success: false,
        error: {
          code: ErrorCodes.VIRUS_DETECTED,
          message: `The uploaded file was rejected: virus '${result.virusName}' detected. Please scan your file with antivirus software and try again.`,
          details: { virusName: result.virusName },
        },
      };
    }

    scanLog.info({ fileKey }, "File passed virus scan");
    return null;
  }

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
          code: ErrorCodes.NOT_FOUND,
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
    // Scan file for viruses before creating the document record
    const scanError = await this.scanFileForViruses(fileKey, context);
    if (scanError) {
      return scanError;
    }

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
          code: ErrorCodes.NOT_FOUND,
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
          code: ErrorCodes.NOT_FOUND,
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
          code: ErrorCodes.NOT_FOUND,
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
          code: ErrorCodes.NOT_FOUND,
          message: "Document not found",
          details: { documentId },
        },
      };
    }

    // Scan file for viruses before creating the version record
    const scanError = await this.scanFileForViruses(fileKey, context);
    if (scanError) {
      return scanError;
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
  // Upload URL (delegates to StorageService — local or S3)
  // ===========================================================================

  async getUploadUrl(
    context: TenantContext,
    fileName: string,
    mimeType: string
  ): Promise<ServiceResult<UploadUrlResponse>> {
    // Validate MIME type against whitelist
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return {
        success: false,
        error: {
          code: "INVALID_MIME_TYPE",
          message: `File type '${mimeType}' is not allowed`,
        },
      };
    }

    const fileKey = `${context.tenantId}/${Date.now()}-${fileName}`;
    const expiresInSeconds = 15 * 60; // 15 minutes
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const storage = getStorageService();
    const uploadUrl = await storage.getUploadUrl(fileKey, mimeType, expiresInSeconds);

    return {
      success: true,
      data: {
        upload_url: uploadUrl,
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
          code: ErrorCodes.NOT_FOUND,
          message: "Document not found",
          details: { documentId },
        },
      };
    }

    const storage = getStorageService();
    const downloadUrl = await storage.getDownloadUrl(document.fileKey);

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
  // My Documents Summary (Self-Service Portal)
  // ===========================================================================

  async getMyDocumentsSummary(
    context: TenantContext
  ): Promise<ServiceResult<MyDocumentsSummaryResponse>> {
    const summary = await this.repository.getMyDocumentsSummary(context);

    if (!summary.employeeId) {
      return {
        success: true,
        data: {
          totalDocuments: 0,
          byCategory: [],
          recentDocuments: [],
          expiringDocuments: [],
          message: "No employee record found",
        },
      };
    }

    const totalDocuments = summary.categoryCounts.reduce(
      (sum, c) => sum + (c.count || 0),
      0
    );

    return {
      success: true,
      data: {
        totalDocuments,
        byCategory: summary.categoryCounts.map((c) => ({
          category: c.category,
          count: c.count,
        })),
        recentDocuments: summary.recentDocuments.map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          mimeType: d.mimeType,
          fileSize: d.fileSize,
          createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
        })),
        expiringDocuments: summary.expiringDocuments.map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          expiresAt: d.expiresAt instanceof Date ? d.expiresAt.toISOString() : String(d.expiresAt),
        })),
      },
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
