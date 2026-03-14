/**
 * Employee Photos Module - Service Layer
 *
 * Business logic for employee photo management.
 * Emits domain events via the outbox pattern for all mutations.
 *
 * Validates:
 * - Employee existence before photo operations
 * - File size limits (configurable, default 5 MB)
 * - MIME type allowlist
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import {
  EmployeePhotosRepository,
  type EmployeePhotoRow,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type { UploadPhoto, PhotoResponse } from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/** Maximum allowed file size in bytes (5 MB) */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Allowed MIME types for employee photos */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
]);

// =============================================================================
// Domain Event Types
// =============================================================================

type PhotoEventType =
  | "hr.employee_photo.uploaded"
  | "hr.employee_photo.replaced"
  | "hr.employee_photo.deleted";

// =============================================================================
// Mapper
// =============================================================================

function mapRowToResponse(row: EmployeePhotoRow): PhotoResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    file_key: row.fileKey,
    original_filename: row.originalFilename,
    mime_type: row.mimeType,
    file_size_bytes: row.fileSizeBytes !== null ? Number(row.fileSizeBytes) : null,
    uploaded_by: row.uploadedBy,
    uploaded_at: row.uploadedAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// =============================================================================
// Service
// =============================================================================

export class EmployeePhotosService {
  constructor(
    private repository: EmployeePhotosRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  /**
   * Emit domain event to outbox within the same transaction as the business write
   */
  private async emitEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    aggregateId: string,
    eventType: PhotoEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        'employee_photo',
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: ctx.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Operations
  // ===========================================================================

  /**
   * Get photo metadata for an employee
   */
  async getPhoto(
    ctx: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<PhotoResponse>> {
    // Verify employee exists
    const empCheck = await this.db.withTransaction(ctx, async (tx) => {
      return tx`SELECT id FROM employees WHERE id = ${employeeId}::uuid`;
    });

    if (empCheck.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employeeId },
        },
      };
    }

    const photo = await this.repository.getByEmployeeId(ctx, employeeId);
    if (!photo) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "No photo found for this employee",
          details: { employeeId },
        },
      };
    }

    return { success: true, data: mapRowToResponse(photo) };
  }

  /**
   * Upload (create or replace) an employee photo.
   * Validates file size and MIME type before persisting.
   */
  async uploadPhoto(
    ctx: TenantContext,
    employeeId: string,
    data: UploadPhoto
  ): Promise<ServiceResult<PhotoResponse>> {
    // Validate file size
    if (data.file_size_bytes !== undefined && data.file_size_bytes > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `File size exceeds maximum allowed (${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`,
          details: {
            fileSizeBytes: data.file_size_bytes,
            maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
          },
        },
      };
    }

    // Validate MIME type
    if (data.mime_type && !ALLOWED_MIME_TYPES.has(data.mime_type)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `MIME type '${data.mime_type}' is not allowed. Allowed types: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
          details: {
            mimeType: data.mime_type,
            allowedTypes: [...ALLOWED_MIME_TYPES],
          },
        },
      };
    }

    // Check for existing photo to determine event type
    const existing = await this.repository.getByEmployeeId(ctx, employeeId);
    const eventType: PhotoEventType = existing
      ? "hr.employee_photo.replaced"
      : "hr.employee_photo.uploaded";

    const photo = await this.db.withTransaction(ctx, async (tx) => {
      // Verify employee exists within the transaction
      const empRows = await tx`SELECT id FROM employees WHERE id = ${employeeId}::uuid`;
      if (empRows.length === 0) {
        throw new EmployeeNotFoundError(employeeId);
      }

      const result = await this.repository.upsert(ctx, employeeId, data, tx);

      await this.emitEvent(tx, ctx, employeeId, eventType, {
        employeeId,
        photoId: result.id,
        fileKey: data.file_key,
        mimeType: data.mime_type ?? null,
        replaced: !!existing,
      });

      return result;
    });

    return { success: true, data: mapRowToResponse(photo) };
  }

  /**
   * Delete an employee photo
   */
  async deletePhoto(
    ctx: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    const existing = await this.repository.getByEmployeeId(ctx, employeeId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "No photo found for this employee",
          details: { employeeId },
        },
      };
    }

    await this.db.withTransaction(ctx, async (tx) => {
      await this.repository.deleteByEmployeeId(ctx, employeeId, tx);

      await this.emitEvent(tx, ctx, employeeId, "hr.employee_photo.deleted", {
        employeeId,
        photoId: existing.id,
        fileKey: existing.fileKey,
      });
    });

    return { success: true, data: { deleted: true } };
  }
}

// =============================================================================
// Internal Errors (used within transactions, caught by service layer)
// =============================================================================

class EmployeeNotFoundError extends Error {
  public readonly employeeId: string;
  constructor(employeeId: string) {
    super(`Employee not found: ${employeeId}`);
    this.name = "EmployeeNotFoundError";
    this.employeeId = employeeId;
  }
}
