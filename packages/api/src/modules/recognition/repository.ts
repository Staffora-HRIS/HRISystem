/**
 * Recognition Module - Repository Layer
 *
 * Database operations for peer recognitions.
 * All queries respect RLS via tenant context.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateRecognition,
  RecognitionResponse,
  LeaderboardEntry,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// DB Row Shapes
// =============================================================================

interface RecognitionDbRow {
  id: string;
  tenantId: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  fromEmployeeName: string;
  toEmployeeName: string;
  category: string;
  message: string;
  visibility: string;
  createdAt: Date;
}

interface LeaderboardDbRow {
  employeeId: string;
  employeeName: string;
  recognitionCount: string;
  topCategory: string | null;
}

// =============================================================================
// Repository
// =============================================================================

export class RecognitionRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * List recognitions with optional filters and cursor-based pagination.
   */
  async list(
    ctx: TenantContext,
    filters: {
      category?: string;
      visibility?: string;
      toEmployeeId?: string;
      fromEmployeeId?: string;
      cursor?: string;
      limit: number;
    }
  ): Promise<{ items: RecognitionResponse[]; nextCursor: string | null }> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<RecognitionDbRow[]>`
        SELECT
          pr.id, pr.tenant_id, pr.from_employee_id, pr.to_employee_id,
          pr.category, pr.message, pr.visibility, pr.created_at,
          ef.first_name || ' ' || ef.last_name AS from_employee_name,
          et.first_name || ' ' || et.last_name AS to_employee_name
        FROM app.peer_recognitions pr
        JOIN app.employees ef ON ef.id = pr.from_employee_id
        JOIN app.employees et ON et.id = pr.to_employee_id
        WHERE pr.tenant_id = ${ctx.tenantId}::uuid
          ${filters.category ? tx`AND pr.category = ${filters.category}` : tx``}
          ${filters.visibility ? tx`AND pr.visibility = ${filters.visibility}` : tx``}
          ${filters.toEmployeeId ? tx`AND pr.to_employee_id = ${filters.toEmployeeId}::uuid` : tx``}
          ${filters.fromEmployeeId ? tx`AND pr.from_employee_id = ${filters.fromEmployeeId}::uuid` : tx``}
          ${filters.cursor ? tx`AND pr.created_at < ${filters.cursor}::timestamptz` : tx``}
        ORDER BY pr.created_at DESC
        LIMIT ${filters.limit + 1}
      `;
    });

    const hasMore = rows.length > filters.limit;
    const items = (hasMore ? rows.slice(0, filters.limit) : rows).map(this.mapRow);
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt
      : null;

    return { items, nextCursor };
  }

  /**
   * Create a new peer recognition.
   */
  async create(
    ctx: TenantContext,
    fromEmployeeId: string,
    data: CreateRecognition,
    tx: TransactionSql
  ): Promise<RecognitionResponse> {
    const visibility = data.visibility || "public";

    const [row] = await tx<RecognitionDbRow[]>`
      WITH inserted AS (
        INSERT INTO app.peer_recognitions (
          id, tenant_id, from_employee_id, to_employee_id,
          category, message, visibility
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid, ${fromEmployeeId}::uuid,
          ${data.toEmployeeId}::uuid, ${data.category},
          ${data.message}, ${visibility}
        )
        RETURNING *
      )
      SELECT
        i.id, i.tenant_id, i.from_employee_id, i.to_employee_id,
        i.category, i.message, i.visibility, i.created_at,
        ef.first_name || ' ' || ef.last_name AS from_employee_name,
        et.first_name || ' ' || et.last_name AS to_employee_name
      FROM inserted i
      JOIN app.employees ef ON ef.id = i.from_employee_id
      JOIN app.employees et ON et.id = i.to_employee_id
    `;

    return this.mapRow(row);
  }

  /**
   * Get the leaderboard of most-recognised employees over the last N days.
   */
  async getLeaderboard(
    ctx: TenantContext,
    days: number = 30,
    limit: number = 10
  ): Promise<LeaderboardEntry[]> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<LeaderboardDbRow[]>`
        SELECT
          pr.to_employee_id AS employee_id,
          e.first_name || ' ' || e.last_name AS employee_name,
          COUNT(*)::text AS recognition_count,
          (
            SELECT pr2.category
            FROM app.peer_recognitions pr2
            WHERE pr2.to_employee_id = pr.to_employee_id
              AND pr2.tenant_id = ${ctx.tenantId}::uuid
              AND pr2.created_at >= now() - make_interval(days => ${days})
            GROUP BY pr2.category
            ORDER BY COUNT(*) DESC
            LIMIT 1
          ) AS top_category
        FROM app.peer_recognitions pr
        JOIN app.employees e ON e.id = pr.to_employee_id
        WHERE pr.tenant_id = ${ctx.tenantId}::uuid
          AND pr.created_at >= now() - make_interval(days => ${days})
        GROUP BY pr.to_employee_id, e.first_name, e.last_name
        ORDER BY COUNT(*) DESC
        LIMIT ${limit}
      `;
    });

    return rows.map((row) => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      recognitionCount: Number(row.recognitionCount),
      topCategory: row.topCategory,
    }));
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapRow(row: RecognitionDbRow): RecognitionResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      fromEmployeeId: row.fromEmployeeId,
      toEmployeeId: row.toEmployeeId,
      fromEmployeeName: row.fromEmployeeName,
      toEmployeeName: row.toEmployeeName,
      category: row.category,
      message: row.message,
      visibility: row.visibility,
      createdAt: row.createdAt?.toISOString() || String(row.createdAt),
    };
  }
}
