/**
 * CPD Module - Repository Layer
 *
 * Database operations for CPD records.
 * All queries respect RLS via tenant context.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import {
  parsePaginationParams,
  buildPaginatedResult,
  type PaginationParams,
  type PaginatedResult,
} from "../../lib/pagination";
import type {
  CreateCpdRecord,
  UpdateCpdRecord,
  CpdRecordResponse,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";
export type { PaginationParams, PaginatedResult } from "../../lib/pagination";

// =============================================================================
// DB Row Shape
// =============================================================================

interface CpdRecordDbRow {
  id: string;
  tenantId: string;
  employeeId: string;
  activityType: string;
  title: string;
  provider: string | null;
  hours: string;
  points: string;
  startDate: Date;
  endDate: Date | null;
  certificateKey: string | null;
  reflection: string | null;
  verified: boolean;
  verifiedBy: string | null;
  employeeName?: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class CpdRepository {
  constructor(private db: DatabaseClient) {}

  async listRecords(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      activityType?: string;
      verified?: boolean;
    },
    pagination: PaginationParams
  ): Promise<PaginatedResult<CpdRecordResponse>> {
    const { limit, cursor } = parsePaginationParams(pagination);
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<CpdRecordDbRow[]>`
        SELECT cr.id, cr.tenant_id, cr.employee_id, cr.activity_type,
               cr.title, cr.provider, cr.hours, cr.points,
               cr.start_date, cr.end_date, cr.certificate_key,
               cr.reflection, cr.verified, cr.verified_by,
               cr.created_at, cr.updated_at,
               e.first_name || ' ' || e.last_name as employee_name
        FROM app.cpd_records cr
        JOIN app.employees e ON e.id = cr.employee_id
        WHERE cr.tenant_id = ${ctx.tenantId}::uuid
        ${filters.employeeId ? tx`AND cr.employee_id = ${filters.employeeId}::uuid` : tx``}
        ${filters.activityType ? tx`AND cr.activity_type = ${filters.activityType}::app.cpd_activity_type` : tx``}
        ${filters.verified !== undefined ? tx`AND cr.verified = ${filters.verified}` : tx``}
        ${cursor ? tx`AND cr.id > ${cursor}::uuid` : tx``}
        ORDER BY cr.start_date DESC, cr.created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const result = buildPaginatedResult(rows, limit);
    return {
      ...result,
      items: result.items.map(this.mapCpdRow),
    };
  }

  async getRecordById(ctx: TenantContext, id: string): Promise<CpdRecordResponse | null> {
    const [row] = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<CpdRecordDbRow[]>`
        SELECT cr.id, cr.tenant_id, cr.employee_id, cr.activity_type,
               cr.title, cr.provider, cr.hours, cr.points,
               cr.start_date, cr.end_date, cr.certificate_key,
               cr.reflection, cr.verified, cr.verified_by,
               cr.created_at, cr.updated_at,
               e.first_name || ' ' || e.last_name as employee_name
        FROM app.cpd_records cr
        JOIN app.employees e ON e.id = cr.employee_id
        WHERE cr.id = ${id}::uuid AND cr.tenant_id = ${ctx.tenantId}::uuid
      `;
    });

    return row ? this.mapCpdRow(row) : null;
  }

  async createRecord(
    ctx: TenantContext,
    data: CreateCpdRecord,
    tx: TransactionSql
  ): Promise<CpdRecordResponse> {
    const [row] = await tx<CpdRecordDbRow[]>`
      INSERT INTO app.cpd_records (
        id, tenant_id, employee_id, activity_type, title, provider,
        hours, points, start_date, end_date, certificate_key, reflection
      ) VALUES (
        gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
        ${data.activityType}::app.cpd_activity_type, ${data.title},
        ${data.provider || null},
        ${data.hours}, ${data.points || 0},
        ${data.startDate}::date, ${data.endDate || null}::date,
        ${data.certificateKey || null}, ${data.reflection || null}
      )
      RETURNING id, tenant_id, employee_id, activity_type, title, provider,
                hours, points, start_date, end_date, certificate_key,
                reflection, verified, verified_by, created_at, updated_at
    `;

    return this.mapCpdRow(row);
  }

  async updateRecord(
    ctx: TenantContext,
    id: string,
    data: UpdateCpdRecord,
    tx: TransactionSql
  ): Promise<CpdRecordResponse | null> {
    const [row] = await tx<CpdRecordDbRow[]>`
      UPDATE app.cpd_records SET
        activity_type = COALESCE(${data.activityType ?? null}::app.cpd_activity_type, activity_type),
        title = COALESCE(${data.title ?? null}, title),
        provider = COALESCE(${data.provider ?? null}, provider),
        hours = COALESCE(${data.hours ?? null}, hours),
        points = COALESCE(${data.points ?? null}, points),
        start_date = COALESCE(${data.startDate ?? null}::date, start_date),
        end_date = COALESCE(${data.endDate ?? null}::date, end_date),
        certificate_key = COALESCE(${data.certificateKey ?? null}, certificate_key),
        reflection = COALESCE(${data.reflection ?? null}, reflection),
        updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING id, tenant_id, employee_id, activity_type, title, provider,
                hours, points, start_date, end_date, certificate_key,
                reflection, verified, verified_by, created_at, updated_at
    `;

    return row ? this.mapCpdRow(row) : null;
  }

  async verifyRecord(
    ctx: TenantContext,
    id: string,
    verifiedBy: string,
    tx: TransactionSql
  ): Promise<CpdRecordResponse | null> {
    const [row] = await tx<CpdRecordDbRow[]>`
      UPDATE app.cpd_records SET
        verified = true,
        verified_by = ${verifiedBy}::uuid,
        updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING id, tenant_id, employee_id, activity_type, title, provider,
                hours, points, start_date, end_date, certificate_key,
                reflection, verified, verified_by, created_at, updated_at
    `;

    return row ? this.mapCpdRow(row) : null;
  }

  async deleteRecord(ctx: TenantContext, id: string): Promise<boolean> {
    const result = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx`
        DELETE FROM app.cpd_records
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id
      `;
    });

    return result.length > 0;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapCpdRow(row: CpdRecordDbRow): CpdRecordResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      employeeId: row.employeeId,
      activityType: row.activityType,
      title: row.title,
      provider: row.provider,
      hours: Number(row.hours),
      points: Number(row.points),
      startDate: row.startDate instanceof Date
        ? row.startDate.toISOString().split("T")[0]
        : String(row.startDate),
      endDate: row.endDate instanceof Date
        ? row.endDate.toISOString().split("T")[0]
        : row.endDate ? String(row.endDate) : null,
      certificateKey: row.certificateKey,
      reflection: row.reflection,
      verified: row.verified,
      verifiedBy: row.verifiedBy,
      employeeName: row.employeeName,
      createdAt: row.createdAt?.toISOString() || String(row.createdAt),
      updatedAt: row.updatedAt?.toISOString() || String(row.updatedAt),
    };
  }
}
