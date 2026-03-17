/**
 * ROPA Module - Repository Layer
 *
 * Provides data access methods for processing activity entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * UK GDPR Article 30 — Records of Processing Activities.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateProcessingActivity,
  UpdateProcessingActivity,
  ProcessingActivityFilters,
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

export interface ProcessingActivityRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  purpose: string;
  lawfulBasis: string;
  lawfulBasisDetail: string | null;
  dataSubjects: string[];
  dataCategories: string[];
  recipients: string[];
  internationalTransfers: Record<string, unknown>[];
  retentionPeriod: string | null;
  securityMeasures: string | null;
  dpiaRequired: boolean;
  dpiaId: string | null;
  controllerName: string | null;
  controllerContact: string | null;
  dpoContact: string | null;
  status: string;
  lastReviewedAt: Date | null;
  lastReviewedBy: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Column List (explicit, avoiding SELECT *)
// =============================================================================

const COLUMNS = `
  id, tenant_id, name, description, purpose,
  lawful_basis, lawful_basis_detail,
  data_subjects, data_categories, recipients, international_transfers,
  retention_period, security_measures,
  dpia_required, dpia_id,
  controller_name, controller_contact, dpo_contact,
  status, last_reviewed_at, last_reviewed_by,
  created_by, updated_by, created_at, updated_at
`;

// =============================================================================
// Repository
// =============================================================================

export class RopaRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // List Processing Activities
  // ===========================================================================

  async list(
    ctx: TenantContext,
    filters: ProcessingActivityFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<ProcessingActivityRow>> {
    const limit = pagination.limit || 20;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<ProcessingActivityRow[]>`
        SELECT ${tx.unsafe(COLUMNS)}
        FROM processing_activities
        WHERE 1=1
          ${pagination.cursor ? tx`AND id < ${pagination.cursor}` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.lawful_basis ? tx`AND lawful_basis = ${filters.lawful_basis}` : tx``}
          ${filters.dpia_required !== undefined ? tx`AND dpia_required = ${filters.dpia_required}` : tx``}
          ${filters.search ? tx`AND (
            name ILIKE ${"%" + filters.search + "%"}
            OR purpose ILIKE ${"%" + filters.search + "%"}
            OR description ILIKE ${"%" + filters.search + "%"}
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

  // ===========================================================================
  // Get by ID
  // ===========================================================================

  async getById(
    ctx: TenantContext,
    id: string
  ): Promise<ProcessingActivityRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<ProcessingActivityRow[]>`
        SELECT ${tx.unsafe(COLUMNS)}
        FROM processing_activities
        WHERE id = ${id}
      `;
    });

    return rows.length > 0 ? rows[0] : null;
  }

  // ===========================================================================
  // Create
  // ===========================================================================

  async create(
    tx: TransactionSql,
    ctx: TenantContext,
    data: CreateProcessingActivity
  ): Promise<ProcessingActivityRow> {
    const rows = await tx<ProcessingActivityRow[]>`
      INSERT INTO processing_activities (
        tenant_id, name, description, purpose,
        lawful_basis, lawful_basis_detail,
        data_subjects, data_categories, recipients, international_transfers,
        retention_period, security_measures,
        dpia_required, dpia_id,
        controller_name, controller_contact, dpo_contact,
        status, created_by, updated_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.name},
        ${data.description || null},
        ${data.purpose},
        ${data.lawful_basis},
        ${data.lawful_basis_detail || null},
        ${JSON.stringify(data.data_subjects)}::jsonb,
        ${JSON.stringify(data.data_categories)}::jsonb,
        ${JSON.stringify(data.recipients || [])}::jsonb,
        ${JSON.stringify(data.international_transfers || [])}::jsonb,
        ${data.retention_period || null},
        ${data.security_measures || null},
        ${data.dpia_required ?? false},
        ${data.dpia_id || null},
        ${data.controller_name || null},
        ${data.controller_contact || null},
        ${data.dpo_contact || null},
        'draft',
        ${ctx.userId || null}::uuid,
        ${ctx.userId || null}::uuid
      )
      RETURNING ${tx.unsafe(COLUMNS)}
    `;

    return rows[0];
  }

  // ===========================================================================
  // Update
  // ===========================================================================

  async update(
    tx: TransactionSql,
    id: string,
    data: UpdateProcessingActivity,
    updatedBy: string | undefined
  ): Promise<ProcessingActivityRow | null> {
    // Build SET clauses dynamically for only provided fields
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      setClauses.push("name = $" + (values.length + 1));
      values.push(data.name);
    }
    if (data.description !== undefined) {
      setClauses.push("description = $" + (values.length + 1));
      values.push(data.description);
    }
    if (data.purpose !== undefined) {
      setClauses.push("purpose = $" + (values.length + 1));
      values.push(data.purpose);
    }
    if (data.lawful_basis !== undefined) {
      setClauses.push("lawful_basis = $" + (values.length + 1));
      values.push(data.lawful_basis);
    }
    if (data.lawful_basis_detail !== undefined) {
      setClauses.push("lawful_basis_detail = $" + (values.length + 1));
      values.push(data.lawful_basis_detail);
    }
    if (data.data_subjects !== undefined) {
      setClauses.push("data_subjects = $" + (values.length + 1) + "::jsonb");
      values.push(JSON.stringify(data.data_subjects));
    }
    if (data.data_categories !== undefined) {
      setClauses.push("data_categories = $" + (values.length + 1) + "::jsonb");
      values.push(JSON.stringify(data.data_categories));
    }
    if (data.recipients !== undefined) {
      setClauses.push("recipients = $" + (values.length + 1) + "::jsonb");
      values.push(JSON.stringify(data.recipients ?? []));
    }
    if (data.international_transfers !== undefined) {
      setClauses.push("international_transfers = $" + (values.length + 1) + "::jsonb");
      values.push(JSON.stringify(data.international_transfers ?? []));
    }
    if (data.retention_period !== undefined) {
      setClauses.push("retention_period = $" + (values.length + 1));
      values.push(data.retention_period);
    }
    if (data.security_measures !== undefined) {
      setClauses.push("security_measures = $" + (values.length + 1));
      values.push(data.security_measures);
    }
    if (data.dpia_required !== undefined) {
      setClauses.push("dpia_required = $" + (values.length + 1));
      values.push(data.dpia_required);
    }
    if (data.dpia_id !== undefined) {
      setClauses.push("dpia_id = $" + (values.length + 1));
      values.push(data.dpia_id);
    }
    if (data.controller_name !== undefined) {
      setClauses.push("controller_name = $" + (values.length + 1));
      values.push(data.controller_name);
    }
    if (data.controller_contact !== undefined) {
      setClauses.push("controller_contact = $" + (values.length + 1));
      values.push(data.controller_contact);
    }
    if (data.dpo_contact !== undefined) {
      setClauses.push("dpo_contact = $" + (values.length + 1));
      values.push(data.dpo_contact);
    }
    if (data.status !== undefined) {
      setClauses.push("status = $" + (values.length + 1));
      values.push(data.status);
    }

    // Always update updated_by and updated_at
    setClauses.push("updated_by = $" + (values.length + 1) + "::uuid");
    values.push(updatedBy || null);
    setClauses.push("updated_at = now()");

    if (setClauses.length <= 2) {
      // Nothing to update besides metadata
      return this.getByIdTx(tx, id);
    }

    // Use tagged template with unsafe for the dynamic SET clause
    // We need to build the full query since postgres.js doesn't support dynamic SET
    const rows = await tx<ProcessingActivityRow[]>`
      UPDATE processing_activities
      SET
        ${tx.unsafe(setClauses.join(", ").replace(/\$(\d+)/g, (_, n) => {
          const val = values[parseInt(n) - 1];
          if (val === null) return "NULL";
          if (typeof val === "boolean") return val.toString();
          if (typeof val === "string") return "'" + val.replace(/'/g, "''") + "'";
          return String(val);
        }))}
      WHERE id = ${id}
      RETURNING ${tx.unsafe(COLUMNS)}
    `;

    return rows.length > 0 ? rows[0] : null;
  }

  // ===========================================================================
  // Delete
  // ===========================================================================

  async delete(
    tx: TransactionSql,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM processing_activities
      WHERE id = ${id}
    `;

    return result.count > 0;
  }

  // ===========================================================================
  // Get all for export (no pagination, active and under_review only)
  // ===========================================================================

  async getAllForExport(
    ctx: TenantContext
  ): Promise<ProcessingActivityRow[]> {
    return await this.db.withTransaction(ctx, async (tx) => {
      return await tx<ProcessingActivityRow[]>`
        SELECT ${tx.unsafe(COLUMNS)}
        FROM processing_activities
        ORDER BY name ASC
      `;
    });
  }

  // ===========================================================================
  // Bulk insert (for seeding)
  // ===========================================================================

  async bulkCreate(
    tx: TransactionSql,
    ctx: TenantContext,
    activities: CreateProcessingActivity[]
  ): Promise<ProcessingActivityRow[]> {
    const results: ProcessingActivityRow[] = [];

    for (const data of activities) {
      const rows = await tx<ProcessingActivityRow[]>`
        INSERT INTO processing_activities (
          tenant_id, name, description, purpose,
          lawful_basis, lawful_basis_detail,
          data_subjects, data_categories, recipients, international_transfers,
          retention_period, security_measures,
          dpia_required, dpia_id,
          controller_name, controller_contact, dpo_contact,
          status, created_by, updated_by
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${data.name},
          ${data.description || null},
          ${data.purpose},
          ${data.lawful_basis},
          ${data.lawful_basis_detail || null},
          ${JSON.stringify(data.data_subjects)}::jsonb,
          ${JSON.stringify(data.data_categories)}::jsonb,
          ${JSON.stringify(data.recipients || [])}::jsonb,
          ${JSON.stringify(data.international_transfers || [])}::jsonb,
          ${data.retention_period || null},
          ${data.security_measures || null},
          ${data.dpia_required ?? false},
          ${data.dpia_id || null},
          ${data.controller_name || null},
          ${data.controller_contact || null},
          ${data.dpo_contact || null},
          'active',
          ${ctx.userId || null}::uuid,
          ${ctx.userId || null}::uuid
        )
        RETURNING ${tx.unsafe(COLUMNS)}
      `;

      results.push(rows[0]);
    }

    return results;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private async getByIdTx(
    tx: TransactionSql,
    id: string
  ): Promise<ProcessingActivityRow | null> {
    const rows = await tx<ProcessingActivityRow[]>`
      SELECT ${tx.unsafe(COLUMNS)}
      FROM processing_activities
      WHERE id = ${id}
    `;

    return rows.length > 0 ? rows[0] : null;
  }
}
