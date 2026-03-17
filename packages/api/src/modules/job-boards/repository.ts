/**
 * Job Boards Repository
 *
 * Database operations for job board postings
 */

import type { DatabaseClient } from "../../plugins/db";

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface JobBoardPosting {
  id: string;
  tenant_id: string;
  vacancy_id: string;
  board_name: "indeed" | "linkedin" | "reed" | "totaljobs";
  board_job_id: string | null;
  posted_at: string | null;
  expires_at: string | null;
  status: "draft" | "posted" | "expired" | "removed";
  application_url: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  vacancy_title?: string;
  vacancy_code?: string;
}

// =============================================================================
// Repository
// =============================================================================

export class JobBoardsRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async listPostings(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      vacancyId?: string;
      boardName?: string;
      status?: string;
    } = {}
  ): Promise<{ items: JobBoardPosting[]; nextCursor: string | null; hasMore: boolean }> {
    const { cursor, limit = 20, vacancyId, boardName, status } = options;

    const rows = await this.db.withTransaction(ctx, async (tx: any) => {
      return tx<JobBoardPosting[]>`
        SELECT
          p.*,
          r.title AS vacancy_title,
          r.code AS vacancy_code
        FROM app.job_board_postings p
        JOIN app.requisitions r ON r.id = p.vacancy_id
        WHERE p.tenant_id = ${ctx.tenantId}::uuid
        ${vacancyId ? tx`AND p.vacancy_id = ${vacancyId}::uuid` : tx``}
        ${boardName ? tx`AND p.board_name = ${boardName}::app.job_board_name` : tx``}
        ${status ? tx`AND p.status = ${status}::app.job_board_posting_status` : tx``}
        ${cursor ? tx`AND p.id > ${cursor}::uuid` : tx``}
        ORDER BY p.created_at DESC, p.id ASC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getPostingById(ctx: TenantContext, id: string): Promise<JobBoardPosting | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardPosting[]>`
        SELECT
          p.*,
          r.title AS vacancy_title,
          r.code AS vacancy_code
        FROM app.job_board_postings p
        JOIN app.requisitions r ON r.id = p.vacancy_id
        WHERE p.id = ${id}::uuid AND p.tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
  }

  async getPostingByVacancyAndBoard(
    ctx: TenantContext,
    vacancyId: string,
    boardName: string
  ): Promise<JobBoardPosting | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardPosting[]>`
        SELECT
          p.*,
          r.title AS vacancy_title,
          r.code AS vacancy_code
        FROM app.job_board_postings p
        JOIN app.requisitions r ON r.id = p.vacancy_id
        WHERE p.vacancy_id = ${vacancyId}::uuid
          AND p.board_name = ${boardName}::app.job_board_name
          AND p.tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  async createPosting(
    ctx: TenantContext,
    data: {
      vacancyId: string;
      boardName: string;
      applicationUrl?: string;
      expiresAt?: string;
    }
  ): Promise<JobBoardPosting> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardPosting[]>`
        INSERT INTO app.job_board_postings (
          tenant_id, vacancy_id, board_name, status,
          posted_at, expires_at, application_url, created_by
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${data.vacancyId}::uuid,
          ${data.boardName}::app.job_board_name,
          'posted',
          now(),
          ${data.expiresAt || null}::timestamptz,
          ${data.applicationUrl || null},
          ${ctx.userId || null}::uuid
        )
        RETURNING *
      `;
    });
    return rows[0];
  }

  async updatePostingStatus(
    ctx: TenantContext,
    id: string,
    status: string,
    updatedBy?: string
  ): Promise<JobBoardPosting | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardPosting[]>`
        UPDATE app.job_board_postings SET
          status = ${status}::app.job_board_posting_status,
          updated_by = ${updatedBy || null}::uuid,
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    });
    return rows[0] || null;
  }

  async updateBoardJobId(
    ctx: TenantContext,
    id: string,
    boardJobId: string
  ): Promise<JobBoardPosting | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardPosting[]>`
        UPDATE app.job_board_postings SET
          board_job_id = ${boardJobId},
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    });
    return rows[0] || null;
  }

  async deletePosting(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ id: string }[]>`
        DELETE FROM app.job_board_postings
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id
      `;
    });
    return rows.length > 0;
  }
}
