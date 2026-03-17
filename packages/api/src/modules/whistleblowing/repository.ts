/**
 * Whistleblowing Module - Repository Layer
 *
 * Provides data access methods for whistleblowing case entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Security: Reporter identity is stored but access is restricted
 * to designated officers only via service-level authorization.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  SubmitReport,
  UpdateCase,
  WhistleblowingFilters,
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

export interface WhistleblowingCaseRow extends Row {
  id: string;
  tenantId: string;
  reporterId: string | null;
  category: string;
  description: string;
  confidentialityLevel: string;
  pidaProtected: boolean;
  assignedTo: string | null;
  status: string;
  investigationNotes: string | null;
  outcome: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WhistleblowingAuditRow extends Row {
  id: string;
  tenantId: string;
  caseId: string;
  action: string;
  actionBy: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  notes: string | null;
  createdAt: Date;
}

// =============================================================================
// Column Lists (explicit, avoiding SELECT *)
// =============================================================================

const CASE_COLUMNS = `
  id, tenant_id, reporter_id, category, description,
  confidentiality_level, pida_protected, assigned_to,
  status, investigation_notes, outcome,
  created_at, updated_at
`;

const AUDIT_COLUMNS = `
  id, tenant_id, case_id, action, action_by,
  old_values, new_values, notes, created_at
`;

// =============================================================================
// Repository
// =============================================================================

export class WhistleblowingRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Case Operations
  // ===========================================================================

  async listCases(
    ctx: TenantContext,
    filters: WhistleblowingFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<WhistleblowingCaseRow>> {
    const limit = pagination.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<WhistleblowingCaseRow[]>`
        SELECT ${tx.unsafe(CASE_COLUMNS)}
        FROM whistleblowing_cases
        WHERE 1=1
          ${pagination.cursor ? tx`AND id < ${pagination.cursor}` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.category ? tx`AND category = ${filters.category}` : tx``}
          ${filters.confidentiality_level ? tx`AND confidentiality_level = ${filters.confidentiality_level}` : tx``}
          ${filters.pida_protected !== undefined ? tx`AND pida_protected = ${filters.pida_protected}` : tx``}
          ${filters.assigned_to ? tx`AND assigned_to = ${filters.assigned_to}` : tx``}
          ${filters.created_from ? tx`AND created_at >= ${filters.created_from}::date` : tx``}
          ${filters.created_to ? tx`AND created_at <= ${filters.created_to}::date + interval '1 day'` : tx``}
          ${filters.search ? tx`AND (
            description ILIKE ${"%" + filters.search + "%"}
            OR investigation_notes ILIKE ${"%" + filters.search + "%"}
            OR outcome ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getCaseById(
    ctx: TenantContext,
    id: string
  ): Promise<WhistleblowingCaseRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<WhistleblowingCaseRow[]>`
        SELECT ${tx.unsafe(CASE_COLUMNS)}
        FROM whistleblowing_cases
        WHERE id = ${id}
      `;
    });

    return rows.length > 0 ? rows[0] : null;
  }

  async createCase(
    tx: TransactionSql,
    ctx: TenantContext,
    data: SubmitReport & { reporterId: string | null }
  ): Promise<WhistleblowingCaseRow> {
    const rows = await tx<WhistleblowingCaseRow[]>`
      INSERT INTO whistleblowing_cases (
        tenant_id, reporter_id, category, description,
        confidentiality_level, pida_protected, status
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.reporterId}::uuid,
        ${data.category},
        ${data.description},
        ${data.confidentiality_level || "confidential"},
        ${data.pida_protected ?? false},
        'submitted'
      )
      RETURNING ${tx.unsafe(CASE_COLUMNS)}
    `;

    return rows[0];
  }

  async updateCase(
    tx: TransactionSql,
    id: string,
    data: UpdateCase,
    currentStatus: string
  ): Promise<WhistleblowingCaseRow | null> {
    // Build the update dynamically based on provided fields
    // We use currentStatus as an optimistic concurrency guard
    const rows = await tx<WhistleblowingCaseRow[]>`
      UPDATE whistleblowing_cases
      SET
        ${data.status !== undefined ? tx`status = ${data.status},` : tx``}
        ${data.assigned_to !== undefined ? tx`assigned_to = ${data.assigned_to}::uuid,` : tx``}
        ${data.investigation_notes !== undefined ? tx`investigation_notes = ${data.investigation_notes},` : tx``}
        ${data.outcome !== undefined ? tx`outcome = ${data.outcome},` : tx``}
        ${data.pida_protected !== undefined ? tx`pida_protected = ${data.pida_protected},` : tx``}
        updated_at = now()
      WHERE id = ${id}
        AND status = ${currentStatus}
      RETURNING ${tx.unsafe(CASE_COLUMNS)}
    `;

    return rows.length > 0 ? rows[0] : null;
  }

  // ===========================================================================
  // Audit Trail Operations
  // ===========================================================================

  async getAuditTrail(
    ctx: TenantContext,
    caseId: string
  ): Promise<WhistleblowingAuditRow[]> {
    return await this.db.withTransaction(ctx, async (tx) => {
      return await tx<WhistleblowingAuditRow[]>`
        SELECT ${tx.unsafe(AUDIT_COLUMNS)}
        FROM whistleblowing_audit_log
        WHERE case_id = ${caseId}
        ORDER BY created_at DESC
      `;
    });
  }

  async createAuditEntry(
    tx: TransactionSql,
    ctx: TenantContext,
    caseId: string,
    data: {
      action: string;
      actionBy: string | null;
      oldValues?: Record<string, unknown> | null;
      newValues?: Record<string, unknown> | null;
      notes?: string | null;
    }
  ): Promise<WhistleblowingAuditRow> {
    const rows = await tx<WhistleblowingAuditRow[]>`
      INSERT INTO whistleblowing_audit_log (
        tenant_id, case_id, action, action_by,
        old_values, new_values, notes
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${caseId}::uuid,
        ${data.action},
        ${data.actionBy}::uuid,
        ${data.oldValues ? JSON.stringify(data.oldValues) : null}::jsonb,
        ${data.newValues ? JSON.stringify(data.newValues) : null}::jsonb,
        ${data.notes || null}
      )
      RETURNING ${tx.unsafe(AUDIT_COLUMNS)}
    `;

    return rows[0];
  }
}
