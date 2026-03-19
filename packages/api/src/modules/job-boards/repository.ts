/**
 * Job Boards Repository
 *
 * Database operations for job board integrations and postings.
 * All queries use postgres.js tagged templates and respect RLS
 * via db.withTransaction(ctx, ...).
 */

import type { DatabaseClient } from "../../plugins/db";

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface JobBoardIntegration {
  id: string;
  tenant_id: string;
  provider: "indeed" | "linkedin" | "reed" | "totaljobs" | "cwjobs";
  config: Record<string, unknown>;
  enabled: boolean;
  display_name: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobBoardPosting {
  id: string;
  tenant_id: string;
  vacancy_id: string;
  board_name: "indeed" | "linkedin" | "reed" | "totaljobs" | "cwjobs";
  board_job_id: string | null;
  external_posting_id: string | null;
  integration_id: string | null;
  posted_at: string | null;
  expires_at: string | null;
  status: "draft" | "posted" | "expired" | "withdrawn" | "removed";
  application_url: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  vacancy_title?: string;
  vacancy_code?: string;
}

// =============================================================================
// Repository
// =============================================================================

export class JobBoardsRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Integration Methods
  // ===========================================================================

  async listIntegrations(
    ctx: TenantContext,
    options: { cursor?: string; limit?: number; provider?: string; enabled?: boolean } = {}
  ): Promise<{ items: JobBoardIntegration[]; nextCursor: string | null; hasMore: boolean }> {
    const { cursor, limit = 20, provider, enabled } = options;
    const rows = await this.db.withTransaction(ctx, async (tx: any) => {
      return tx<JobBoardIntegration[]>`
        SELECT * FROM app.job_board_integrations
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${provider ? tx`AND provider = ${provider}::app.job_board_name` : tx``}
        ${enabled !== undefined ? tx`AND enabled = ${enabled}` : tx``}
        ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY created_at DESC, id ASC
        LIMIT ${limit + 1}
      `;
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;
    return { items, nextCursor, hasMore };
  }

  async getIntegrationById(ctx: TenantContext, id: string): Promise<JobBoardIntegration | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardIntegration[]>`
        SELECT * FROM app.job_board_integrations
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
  }

  async getIntegrationByProvider(ctx: TenantContext, provider: string): Promise<JobBoardIntegration | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardIntegration[]>`
        SELECT * FROM app.job_board_integrations
        WHERE provider = ${provider}::app.job_board_name AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
  }

  async createIntegration(
    ctx: TenantContext,
    data: { provider: string; config: Record<string, unknown>; enabled?: boolean; displayName?: string }
  ): Promise<JobBoardIntegration> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardIntegration[]>`
        INSERT INTO app.job_board_integrations (tenant_id, provider, config, enabled, display_name, created_by)
        VALUES (
          ${ctx.tenantId}::uuid, ${data.provider}::app.job_board_name,
          ${JSON.stringify(data.config)}::jsonb, ${data.enabled !== false},
          ${data.displayName || null}, ${ctx.userId || null}::uuid
        ) RETURNING *
      `;
    });
    return rows[0];
  }

  async updateIntegration(
    ctx: TenantContext, id: string,
    data: Partial<{ config: Record<string, unknown>; enabled: boolean; displayName: string | null }>
  ): Promise<JobBoardIntegration | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardIntegration[]>`
        UPDATE app.job_board_integrations SET
          config = COALESCE(${data.config ? JSON.stringify(data.config) : null}::jsonb, config),
          enabled = COALESCE(${data.enabled}, enabled),
          display_name = COALESCE(${data.displayName}, display_name),
          updated_by = ${ctx.userId || null}::uuid, updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    });
    return rows[0] || null;
  }

  async deleteIntegration(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ id: string }[]>`
        DELETE FROM app.job_board_integrations WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid RETURNING id
      `;
    });
    return rows.length > 0;
  }

  // ===========================================================================
  // Posting Methods
  // ===========================================================================

  async listPostings(
    ctx: TenantContext,
    options: { cursor?: string; limit?: number; vacancyId?: string; boardName?: string; status?: string } = {}
  ): Promise<{ items: JobBoardPosting[]; nextCursor: string | null; hasMore: boolean }> {
    const { cursor, limit = 20, vacancyId, boardName, status } = options;
    const rows = await this.db.withTransaction(ctx, async (tx: any) => {
      return tx<JobBoardPosting[]>`
        SELECT p.*, r.title AS vacancy_title, r.code AS vacancy_code
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
        SELECT p.*, r.title AS vacancy_title, r.code AS vacancy_code
        FROM app.job_board_postings p JOIN app.requisitions r ON r.id = p.vacancy_id
        WHERE p.id = ${id}::uuid AND p.tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
  }

  async getPostingByVacancyAndBoard(ctx: TenantContext, vacancyId: string, boardName: string): Promise<JobBoardPosting | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardPosting[]>`
        SELECT p.*, r.title AS vacancy_title, r.code AS vacancy_code
        FROM app.job_board_postings p JOIN app.requisitions r ON r.id = p.vacancy_id
        WHERE p.vacancy_id = ${vacancyId}::uuid AND p.board_name = ${boardName}::app.job_board_name AND p.tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
  }

  async createPosting(
    ctx: TenantContext,
    data: { vacancyId: string; boardName: string; integrationId?: string; applicationUrl?: string; expiresAt?: string }
  ): Promise<JobBoardPosting> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardPosting[]>`
        INSERT INTO app.job_board_postings (tenant_id, vacancy_id, board_name, integration_id, status, posted_at, expires_at, application_url, created_by)
        VALUES (
          ${ctx.tenantId}::uuid, ${data.vacancyId}::uuid, ${data.boardName}::app.job_board_name,
          ${data.integrationId || null}::uuid, 'posted', now(),
          ${data.expiresAt || null}::timestamptz, ${data.applicationUrl || null}, ${ctx.userId || null}::uuid
        ) RETURNING *
      `;
    });
    return rows[0];
  }

  async updatePostingStatus(ctx: TenantContext, id: string, status: string, updatedBy?: string): Promise<JobBoardPosting | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardPosting[]>`
        UPDATE app.job_board_postings SET status = ${status}::app.job_board_posting_status,
          updated_by = ${updatedBy || null}::uuid, updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid RETURNING *
      `;
    });
    return rows[0] || null;
  }

  async updateBoardJobId(ctx: TenantContext, id: string, boardJobId: string): Promise<JobBoardPosting | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardPosting[]>`
        UPDATE app.job_board_postings SET board_job_id = ${boardJobId}, updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid RETURNING *
      `;
    });
    return rows[0] || null;
  }

  async updateExternalPostingId(ctx: TenantContext, id: string, externalPostingId: string): Promise<JobBoardPosting | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<JobBoardPosting[]>`
        UPDATE app.job_board_postings SET external_posting_id = ${externalPostingId}, updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid RETURNING *
      `;
    });
    return rows[0] || null;
  }

  async deletePosting(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ id: string }[]>`
        DELETE FROM app.job_board_postings WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid RETURNING id
      `;
    });
    return rows.length > 0;
  }
}
