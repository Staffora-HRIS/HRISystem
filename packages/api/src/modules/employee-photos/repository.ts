/**
 * Employee Photos Module - Repository Layer
 *
 * Database operations for employee photo metadata.
 * All queries respect RLS through tenant context.
 * Uses parameterized queries throughout -- no tx.unsafe().
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type { UploadPhoto } from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

/** Raw DB row for employee_photos */
export interface EmployeePhotoRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  fileKey: string;
  originalFilename: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  uploadedBy: string | null;
  uploadedAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class EmployeePhotosRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Get photo metadata for an employee
   */
  async getByEmployeeId(
    ctx: TenantContext,
    employeeId: string
  ): Promise<EmployeePhotoRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<EmployeePhotoRow[]>`
        SELECT
          id, tenant_id, employee_id,
          file_key, original_filename, mime_type, file_size_bytes,
          uploaded_by, uploaded_at, updated_at
        FROM employee_photos
        WHERE employee_id = ${employeeId}::uuid
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Upsert photo metadata (insert or replace) within an existing transaction.
   * Uses ON CONFLICT on (tenant_id, employee_id) to handle the single-photo constraint.
   */
  async upsert(
    ctx: TenantContext,
    employeeId: string,
    data: UploadPhoto,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<EmployeePhotoRow> {
    const rows = await tx<EmployeePhotoRow[]>`
      INSERT INTO employee_photos (
        tenant_id, employee_id,
        file_key, original_filename, mime_type, file_size_bytes,
        uploaded_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${employeeId}::uuid,
        ${data.file_key},
        ${data.original_filename ?? null},
        ${data.mime_type ?? null},
        ${data.file_size_bytes ?? null},
        ${ctx.userId ?? null}
      )
      ON CONFLICT (tenant_id, employee_id)
      DO UPDATE SET
        file_key = EXCLUDED.file_key,
        original_filename = EXCLUDED.original_filename,
        mime_type = EXCLUDED.mime_type,
        file_size_bytes = EXCLUDED.file_size_bytes,
        uploaded_by = EXCLUDED.uploaded_by,
        uploaded_at = now()
      RETURNING
        id, tenant_id, employee_id,
        file_key, original_filename, mime_type, file_size_bytes,
        uploaded_by, uploaded_at, updated_at
    `;
    return rows[0];
  }

  /**
   * Delete photo metadata within an existing transaction
   */
  async deleteByEmployeeId(
    _ctx: TenantContext,
    employeeId: string,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM employee_photos
      WHERE employee_id = ${employeeId}::uuid
    `;
    return result.count > 0;
  }
}
