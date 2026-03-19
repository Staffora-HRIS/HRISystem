/**
 * DPIA Module - Repository Layer
 *
 * Provides data access methods for DPIA (Data Protection Impact Assessment) entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateDpia,
  UpdateDpia,
  AddRisk,
  DpiaFilters,
  PaginationQuery,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DpiaRow extends Row {
  id: string;
  tenantId: string;
  processingActivityId: string | null;
  title: string;
  description: string | null;
  necessityAssessment: string | null;
  riskAssessment: Record<string, unknown> | null;
  mitigationMeasures: Record<string, unknown>[] | null;
  dpoOpinion: string | null;
  status: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  reviewDate: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DpiaRiskRow extends Row {
  id: string;
  tenantId: string;
  dpiaId: string;
  riskDescription: string;
  likelihood: string;
  impact: string;
  riskScore: number;
  mitigation: string | null;
  residualRisk: string;
  createdAt: Date;
}

// =============================================================================
// Column Lists (explicit, avoiding SELECT *)
// =============================================================================

const DPIA_COLUMNS = `
  id, tenant_id, processing_activity_id, title, description,
  necessity_assessment, risk_assessment, mitigation_measures,
  dpo_opinion, status, approved_by, approved_at, review_date,
  created_by, created_at, updated_at
`;

const RISK_COLUMNS = `
  id, tenant_id, dpia_id, risk_description, likelihood, impact,
  risk_score, mitigation, residual_risk, created_at
`;

// =============================================================================
// Repository
// =============================================================================

export class DpiaRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // DPIA CRUD Operations
  // ===========================================================================

  async listDpias(
    ctx: TenantContext,
    filters: DpiaFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<DpiaRow>> {
    const limit = pagination.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<DpiaRow[]>`
        SELECT ${tx.unsafe(DPIA_COLUMNS)}
        FROM dpia_assessments
        WHERE 1=1
          ${pagination.cursor ? tx`AND id < ${pagination.cursor}` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.search ? tx`AND (
            title ILIKE ${"%" + filters.search + "%"}
            OR description ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${filters.review_due_before ? tx`AND review_date <= ${filters.review_due_before}::date` : tx``}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getDpiaById(
    ctx: TenantContext,
    id: string
  ): Promise<DpiaRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<DpiaRow[]>`
        SELECT ${tx.unsafe(DPIA_COLUMNS)}
        FROM dpia_assessments
        WHERE id = ${id}
      `;
    });

    return rows.length > 0 ? rows[0] : null;
  }

  async createDpia(
    tx: TransactionSql,
    ctx: TenantContext,
    data: CreateDpia
  ): Promise<DpiaRow> {
    const rows = await tx<DpiaRow[]>`
      INSERT INTO dpia_assessments (
        tenant_id, processing_activity_id, title, description,
        necessity_assessment, risk_assessment, mitigation_measures,
        dpo_opinion, status, review_date, created_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.processing_activity_id || null},
        ${data.title},
        ${data.description || null},
        ${data.necessity_assessment || null},
        ${data.risk_assessment ? JSON.stringify(data.risk_assessment) : "{}"}::jsonb,
        ${data.mitigation_measures ? JSON.stringify(data.mitigation_measures) : "[]"}::jsonb,
        ${data.dpo_opinion || null},
        'draft',
        ${data.review_date || null},
        ${ctx.userId || null}::uuid
      )
      RETURNING ${tx.unsafe(DPIA_COLUMNS)}
    `;

    return rows[0];
  }

  async updateDpia(
    tx: TransactionSql,
    id: string,
    data: UpdateDpia,
    currentStatus: string
  ): Promise<DpiaRow | null> {
    // Build dynamic update; only provided fields are changed.
    // We guard with currentStatus to prevent concurrent modifications.
    const rows = await tx<DpiaRow[]>`
      UPDATE dpia_assessments
      SET
        ${data.title !== undefined ? tx`title = ${data.title},` : tx``}
        ${data.description !== undefined ? tx`description = ${data.description},` : tx``}
        ${data.processing_activity_id !== undefined ? tx`processing_activity_id = ${data.processing_activity_id},` : tx``}
        ${data.necessity_assessment !== undefined ? tx`necessity_assessment = ${data.necessity_assessment},` : tx``}
        ${data.risk_assessment !== undefined ? tx`risk_assessment = ${JSON.stringify(data.risk_assessment)}::jsonb,` : tx``}
        ${data.mitigation_measures !== undefined ? tx`mitigation_measures = ${JSON.stringify(data.mitigation_measures)}::jsonb,` : tx``}
        ${data.dpo_opinion !== undefined ? tx`dpo_opinion = ${data.dpo_opinion},` : tx``}
        ${data.review_date !== undefined ? tx`review_date = ${data.review_date},` : tx``}
        updated_at = now()
      WHERE id = ${id}
        AND status = ${currentStatus}
      RETURNING ${tx.unsafe(DPIA_COLUMNS)}
    `;

    return rows.length > 0 ? rows[0] : null;
  }

  async submitForReview(
    tx: TransactionSql,
    id: string,
    currentStatus: string
  ): Promise<DpiaRow | null> {
    const rows = await tx<DpiaRow[]>`
      UPDATE dpia_assessments
      SET status = 'in_review', updated_at = now()
      WHERE id = ${id}
        AND status = ${currentStatus}
      RETURNING ${tx.unsafe(DPIA_COLUMNS)}
    `;

    return rows.length > 0 ? rows[0] : null;
  }

  async approveDpia(
    tx: TransactionSql,
    id: string,
    decision: "approved" | "rejected",
    approvedBy: string,
    dpoOpinion: string | null,
    currentStatus: string
  ): Promise<DpiaRow | null> {
    const rows = await tx<DpiaRow[]>`
      UPDATE dpia_assessments
      SET
        status = ${decision},
        approved_by = ${approvedBy}::uuid,
        approved_at = now(),
        ${dpoOpinion !== null ? tx`dpo_opinion = ${dpoOpinion},` : tx``}
        updated_at = now()
      WHERE id = ${id}
        AND status = ${currentStatus}
      RETURNING ${tx.unsafe(DPIA_COLUMNS)}
    `;

    return rows.length > 0 ? rows[0] : null;
  }

  // ===========================================================================
  // Risk Operations
  // ===========================================================================

  async listRisks(
    ctx: TenantContext,
    dpiaId: string
  ): Promise<DpiaRiskRow[]> {
    return await this.db.withTransaction(ctx, async (tx) => {
      return await tx<DpiaRiskRow[]>`
        SELECT ${tx.unsafe(RISK_COLUMNS)}
        FROM dpia_risks
        WHERE dpia_id = ${dpiaId}
        ORDER BY risk_score DESC, created_at ASC
      `;
    });
  }

  async createRisk(
    tx: TransactionSql,
    ctx: TenantContext,
    dpiaId: string,
    data: AddRisk
  ): Promise<DpiaRiskRow> {
    const rows = await tx<DpiaRiskRow[]>`
      INSERT INTO dpia_risks (
        tenant_id, dpia_id, risk_description, likelihood, impact,
        risk_score, mitigation, residual_risk
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${dpiaId}::uuid,
        ${data.risk_description},
        ${data.likelihood},
        ${data.impact},
        ${data.risk_score},
        ${data.mitigation || null},
        ${data.residual_risk}
      )
      RETURNING ${tx.unsafe(RISK_COLUMNS)}
    `;

    return rows[0];
  }

  async deleteRisk(
    tx: TransactionSql,
    riskId: string,
    dpiaId: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM dpia_risks
      WHERE id = ${riskId} AND dpia_id = ${dpiaId}
    `;

    return result.count > 0;
  }
}
