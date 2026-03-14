/**
 * Reasonable Adjustments Module - Repository Layer
 *
 * Provides data access methods for reasonable adjustment records.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  CreateAdjustment,
  AdjustmentFilters,
  PaginationQuery,
  AdjustmentStatus,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

/**
 * Database row type for reasonable_adjustments
 */
export interface AdjustmentRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  requestedDate: Date;
  requestedBy: string;
  description: string;
  reason: string | null;
  category: string;
  status: AdjustmentStatus;
  assessmentDate: Date | null;
  assessedBy: string | null;
  assessmentNotes: string | null;
  decisionDate: Date | null;
  decidedBy: string | null;
  rejectionReason: string | null;
  implementationDate: Date | null;
  implementationNotes: string | null;
  reviewDate: Date | null;
  costEstimate: string | null;
  actualCost: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

// =============================================================================
// Repository
// =============================================================================

export class ReasonableAdjustmentsRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Create
  // ===========================================================================

  /**
   * Insert a new reasonable adjustment record within a transaction
   */
  async create(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateAdjustment
  ): Promise<AdjustmentRow> {
    const [row] = await tx<AdjustmentRow[]>`
      INSERT INTO app.reasonable_adjustments (
        tenant_id,
        employee_id,
        requested_date,
        requested_by,
        description,
        reason,
        category,
        status,
        review_date,
        cost_estimate
      ) VALUES (
        ${context.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.requested_date}::date,
        ${data.requested_by},
        ${data.description},
        ${data.reason ?? null},
        ${data.category},
        'requested',
        ${data.review_date ?? null}::date,
        ${data.cost_estimate ?? null}
      )
      RETURNING *
    `;
    return row;
  }

  // ===========================================================================
  // Read
  // ===========================================================================

  /**
   * Find a single adjustment by ID
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<AdjustmentRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<AdjustmentRow[]>`
        SELECT
          id, tenant_id, employee_id,
          requested_date, requested_by, description, reason, category, status,
          assessment_date, assessed_by, assessment_notes,
          decision_date, decided_by, rejection_reason,
          implementation_date, implementation_notes,
          review_date, cost_estimate, actual_cost,
          created_at, updated_at
        FROM app.reasonable_adjustments
        WHERE id = ${id}::uuid
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Find a single adjustment by ID within a transaction (for update operations)
   */
  async findByIdForUpdate(
    tx: TransactionSql,
    id: string
  ): Promise<AdjustmentRow | null> {
    const rows = await tx<AdjustmentRow[]>`
      SELECT
        id, tenant_id, employee_id,
        requested_date, requested_by, description, reason, category, status,
        assessment_date, assessed_by, assessment_notes,
        decision_date, decided_by, rejection_reason,
        implementation_date, implementation_notes,
        review_date, cost_estimate, actual_cost,
        created_at, updated_at
      FROM app.reasonable_adjustments
      WHERE id = ${id}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /**
   * List adjustments with filters and cursor-based pagination
   */
  async findAll(
    context: TenantContext,
    filters: AdjustmentFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<AdjustmentRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1; // Fetch one extra to check hasMore

    const rows = await this.db.withTransaction(context, async (tx) => {
      // Build dynamic WHERE conditions
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters.employee_id) {
        conditions.push(`employee_id = '${filters.employee_id}'::uuid`);
      }
      if (filters.status) {
        conditions.push(`status = '${filters.status}'::app.adjustment_status`);
      }
      if (filters.category) {
        conditions.push(`category = '${filters.category}'`);
      }
      if (filters.requested_by) {
        conditions.push(`requested_by = '${filters.requested_by}'`);
      }

      // For search, match against description
      if (filters.search) {
        // Use parameterized approach via tagged template for the main query
      }

      // Use a simpler approach with tagged templates
      if (filters.employee_id && filters.status) {
        if (cursor) {
          return tx<AdjustmentRow[]>`
            SELECT id, tenant_id, employee_id,
              requested_date, requested_by, description, reason, category, status,
              assessment_date, assessed_by, assessment_notes,
              decision_date, decided_by, rejection_reason,
              implementation_date, implementation_notes,
              review_date, cost_estimate, actual_cost,
              created_at, updated_at
            FROM app.reasonable_adjustments
            WHERE employee_id = ${filters.employee_id}::uuid
              AND status = ${filters.status}::app.adjustment_status
              AND id > ${cursor}::uuid
            ORDER BY id
            LIMIT ${fetchLimit}
          `;
        }
        return tx<AdjustmentRow[]>`
          SELECT id, tenant_id, employee_id,
            requested_date, requested_by, description, reason, category, status,
            assessment_date, assessed_by, assessment_notes,
            decision_date, decided_by, rejection_reason,
            implementation_date, implementation_notes,
            review_date, cost_estimate, actual_cost,
            created_at, updated_at
          FROM app.reasonable_adjustments
          WHERE employee_id = ${filters.employee_id}::uuid
            AND status = ${filters.status}::app.adjustment_status
          ORDER BY id
          LIMIT ${fetchLimit}
        `;
      }

      if (filters.employee_id) {
        if (cursor) {
          return tx<AdjustmentRow[]>`
            SELECT id, tenant_id, employee_id,
              requested_date, requested_by, description, reason, category, status,
              assessment_date, assessed_by, assessment_notes,
              decision_date, decided_by, rejection_reason,
              implementation_date, implementation_notes,
              review_date, cost_estimate, actual_cost,
              created_at, updated_at
            FROM app.reasonable_adjustments
            WHERE employee_id = ${filters.employee_id}::uuid
              AND id > ${cursor}::uuid
            ORDER BY id
            LIMIT ${fetchLimit}
          `;
        }
        return tx<AdjustmentRow[]>`
          SELECT id, tenant_id, employee_id,
            requested_date, requested_by, description, reason, category, status,
            assessment_date, assessed_by, assessment_notes,
            decision_date, decided_by, rejection_reason,
            implementation_date, implementation_notes,
            review_date, cost_estimate, actual_cost,
            created_at, updated_at
          FROM app.reasonable_adjustments
          WHERE employee_id = ${filters.employee_id}::uuid
          ORDER BY id
          LIMIT ${fetchLimit}
        `;
      }

      if (filters.status) {
        if (cursor) {
          return tx<AdjustmentRow[]>`
            SELECT id, tenant_id, employee_id,
              requested_date, requested_by, description, reason, category, status,
              assessment_date, assessed_by, assessment_notes,
              decision_date, decided_by, rejection_reason,
              implementation_date, implementation_notes,
              review_date, cost_estimate, actual_cost,
              created_at, updated_at
            FROM app.reasonable_adjustments
            WHERE status = ${filters.status}::app.adjustment_status
              AND id > ${cursor}::uuid
            ORDER BY id
            LIMIT ${fetchLimit}
          `;
        }
        return tx<AdjustmentRow[]>`
          SELECT id, tenant_id, employee_id,
            requested_date, requested_by, description, reason, category, status,
            assessment_date, assessed_by, assessment_notes,
            decision_date, decided_by, rejection_reason,
            implementation_date, implementation_notes,
            review_date, cost_estimate, actual_cost,
            created_at, updated_at
          FROM app.reasonable_adjustments
          WHERE status = ${filters.status}::app.adjustment_status
          ORDER BY id
          LIMIT ${fetchLimit}
        `;
      }

      if (filters.category) {
        if (cursor) {
          return tx<AdjustmentRow[]>`
            SELECT id, tenant_id, employee_id,
              requested_date, requested_by, description, reason, category, status,
              assessment_date, assessed_by, assessment_notes,
              decision_date, decided_by, rejection_reason,
              implementation_date, implementation_notes,
              review_date, cost_estimate, actual_cost,
              created_at, updated_at
            FROM app.reasonable_adjustments
            WHERE category = ${filters.category}
              AND id > ${cursor}::uuid
            ORDER BY id
            LIMIT ${fetchLimit}
          `;
        }
        return tx<AdjustmentRow[]>`
          SELECT id, tenant_id, employee_id,
            requested_date, requested_by, description, reason, category, status,
            assessment_date, assessed_by, assessment_notes,
            decision_date, decided_by, rejection_reason,
            implementation_date, implementation_notes,
            review_date, cost_estimate, actual_cost,
            created_at, updated_at
          FROM app.reasonable_adjustments
          WHERE category = ${filters.category}
          ORDER BY id
          LIMIT ${fetchLimit}
        `;
      }

      if (filters.search) {
        const searchPattern = `%${filters.search}%`;
        if (cursor) {
          return tx<AdjustmentRow[]>`
            SELECT id, tenant_id, employee_id,
              requested_date, requested_by, description, reason, category, status,
              assessment_date, assessed_by, assessment_notes,
              decision_date, decided_by, rejection_reason,
              implementation_date, implementation_notes,
              review_date, cost_estimate, actual_cost,
              created_at, updated_at
            FROM app.reasonable_adjustments
            WHERE description ILIKE ${searchPattern}
              AND id > ${cursor}::uuid
            ORDER BY id
            LIMIT ${fetchLimit}
          `;
        }
        return tx<AdjustmentRow[]>`
          SELECT id, tenant_id, employee_id,
            requested_date, requested_by, description, reason, category, status,
            assessment_date, assessed_by, assessment_notes,
            decision_date, decided_by, rejection_reason,
            implementation_date, implementation_notes,
            review_date, cost_estimate, actual_cost,
            created_at, updated_at
          FROM app.reasonable_adjustments
          WHERE description ILIKE ${searchPattern}
          ORDER BY id
          LIMIT ${fetchLimit}
        `;
      }

      // No filters
      if (cursor) {
        return tx<AdjustmentRow[]>`
          SELECT id, tenant_id, employee_id,
            requested_date, requested_by, description, reason, category, status,
            assessment_date, assessed_by, assessment_notes,
            decision_date, decided_by, rejection_reason,
            implementation_date, implementation_notes,
            review_date, cost_estimate, actual_cost,
            created_at, updated_at
          FROM app.reasonable_adjustments
          WHERE id > ${cursor}::uuid
          ORDER BY id
          LIMIT ${fetchLimit}
        `;
      }

      return tx<AdjustmentRow[]>`
        SELECT id, tenant_id, employee_id,
          requested_date, requested_by, description, reason, category, status,
          assessment_date, assessed_by, assessment_notes,
          decision_date, decided_by, rejection_reason,
          implementation_date, implementation_notes,
          review_date, cost_estimate, actual_cost,
          created_at, updated_at
        FROM app.reasonable_adjustments
        ORDER BY id
        LIMIT ${fetchLimit}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find adjustments with reviews due on or before a given date
   */
  async findDueReviews(
    context: TenantContext,
    asOfDate: string
  ): Promise<AdjustmentRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<AdjustmentRow[]>`
        SELECT id, tenant_id, employee_id,
          requested_date, requested_by, description, reason, category, status,
          assessment_date, assessed_by, assessment_notes,
          decision_date, decided_by, rejection_reason,
          implementation_date, implementation_notes,
          review_date, cost_estimate, actual_cost,
          created_at, updated_at
        FROM app.reasonable_adjustments
        WHERE status = 'implemented'
          AND review_date IS NOT NULL
          AND review_date <= ${asOfDate}::date
        ORDER BY review_date ASC
      `;
    });
  }

  // ===========================================================================
  // Update
  // ===========================================================================

  /**
   * Update status to under_review with assessment details
   */
  async assess(
    tx: TransactionSql,
    id: string,
    assessedBy: string,
    assessmentNotes: string
  ): Promise<AdjustmentRow> {
    const [row] = await tx<AdjustmentRow[]>`
      UPDATE app.reasonable_adjustments
      SET
        status = 'under_review',
        assessment_date = CURRENT_DATE,
        assessed_by = ${assessedBy}::uuid,
        assessment_notes = ${assessmentNotes},
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    return row;
  }

  /**
   * Record decision (approve or reject)
   */
  async decide(
    tx: TransactionSql,
    id: string,
    decidedBy: string,
    status: "approved" | "rejected",
    rejectionReason: string | null,
    reviewDate: string | null,
    costEstimate: number | null
  ): Promise<AdjustmentRow> {
    const [row] = await tx<AdjustmentRow[]>`
      UPDATE app.reasonable_adjustments
      SET
        status = ${status}::app.adjustment_status,
        decision_date = CURRENT_DATE,
        decided_by = ${decidedBy}::uuid,
        rejection_reason = ${rejectionReason},
        review_date = COALESCE(${reviewDate}::date, review_date),
        cost_estimate = COALESCE(${costEstimate}, cost_estimate),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    return row;
  }

  /**
   * Record implementation
   */
  async implement(
    tx: TransactionSql,
    id: string,
    implementationNotes: string | null,
    actualCost: number | null,
    reviewDate: string | null
  ): Promise<AdjustmentRow> {
    const [row] = await tx<AdjustmentRow[]>`
      UPDATE app.reasonable_adjustments
      SET
        status = 'implemented',
        implementation_date = CURRENT_DATE,
        implementation_notes = ${implementationNotes},
        actual_cost = ${actualCost},
        review_date = COALESCE(${reviewDate}::date, review_date),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    return row;
  }

  /**
   * Withdraw an adjustment
   */
  async withdraw(
    tx: TransactionSql,
    id: string
  ): Promise<AdjustmentRow> {
    const [row] = await tx<AdjustmentRow[]>`
      UPDATE app.reasonable_adjustments
      SET
        status = 'withdrawn',
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    return row;
  }
}
