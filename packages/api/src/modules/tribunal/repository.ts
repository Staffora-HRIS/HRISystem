/**
 * Tribunal Module - Repository Layer
 *
 * Provides data access methods for employment tribunal case entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateTribunalCase,
  UpdateTribunalCase,
  TribunalCaseFilters,
  PaginationQuery,
  TribunalDocument,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

/**
 * Database row type for tribunal cases
 */
export interface TribunalCaseRow extends Row {
  id: string;
  tenantId: string;
  caseId: string | null;
  employeeId: string;
  tribunalReference: string | null;
  hearingDate: Date | null;
  claimType: string;
  respondentRepresentative: string | null;
  claimantRepresentative: string | null;
  documents: TribunalDocument[];
  status: string;
  outcome: string | null;
  notes: string | null;
  employeeName?: string;
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
}

// =============================================================================
// Repository
// =============================================================================

export class TribunalRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Find Operations
  // ===========================================================================

  /**
   * Find tribunal case by ID
   */
  async findById(
    context: TenantContext,
    id: string
  ): Promise<TribunalCaseRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<TribunalCaseRow[]>`
        SELECT
          tc.id,
          tc.tenant_id,
          tc.case_id,
          tc.employee_id,
          tc.tribunal_reference,
          tc.hearing_date,
          tc.claim_type,
          tc.respondent_representative,
          tc.claimant_representative,
          tc.documents,
          tc.status,
          tc.outcome,
          tc.notes,
          tc.created_at,
          tc.updated_at,
          COALESCE(
            (SELECT ep.first_name || ' ' || ep.last_name
             FROM employee_personal ep
             WHERE ep.employee_id = tc.employee_id
               AND ep.effective_to IS NULL
             LIMIT 1),
            'Unknown'
          ) AS employee_name
        FROM tribunal_cases tc
        WHERE tc.id = ${id}
      `;
    });
    return rows[0] || null;
  }

  /**
   * Find tribunal cases with filters and cursor-based pagination
   */
  async findAll(
    context: TenantContext,
    filters: TribunalCaseFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<TribunalCaseRow>> {
    const limit = pagination.limit || 20;
    const cursor = pagination.cursor;

    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<TribunalCaseRow[]>`
        SELECT
          tc.id,
          tc.tenant_id,
          tc.case_id,
          tc.employee_id,
          tc.tribunal_reference,
          tc.hearing_date,
          tc.claim_type,
          tc.respondent_representative,
          tc.claimant_representative,
          tc.documents,
          tc.status,
          tc.outcome,
          tc.notes,
          tc.created_at,
          tc.updated_at,
          COALESCE(
            (SELECT ep.first_name || ' ' || ep.last_name
             FROM employee_personal ep
             WHERE ep.employee_id = tc.employee_id
               AND ep.effective_to IS NULL
             LIMIT 1),
            'Unknown'
          ) AS employee_name
        FROM tribunal_cases tc
        WHERE 1=1
          ${filters.status ? tx`AND tc.status = ${filters.status}` : tx``}
          ${filters.claim_type ? tx`AND tc.claim_type = ${filters.claim_type}` : tx``}
          ${filters.employee_id ? tx`AND tc.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.search ? tx`AND (
            tc.tribunal_reference ILIKE ${"%" + filters.search + "%"}
            OR tc.respondent_representative ILIKE ${"%" + filters.search + "%"}
            OR tc.claimant_representative ILIKE ${"%" + filters.search + "%"}
            OR tc.notes ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${cursor ? tx`AND tc.id < ${cursor}` : tx``}
        ORDER BY tc.created_at DESC, tc.id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  /**
   * Create a new tribunal case
   */
  async create(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateTribunalCase
  ): Promise<TribunalCaseRow> {
    const rows = await tx<TribunalCaseRow[]>`
      INSERT INTO tribunal_cases (
        tenant_id,
        case_id,
        employee_id,
        tribunal_reference,
        hearing_date,
        claim_type,
        respondent_representative,
        claimant_representative,
        notes,
        status,
        documents
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.case_id || null},
        ${data.employee_id}::uuid,
        ${data.tribunal_reference || null},
        ${data.hearing_date || null},
        ${data.claim_type},
        ${data.respondent_representative || null},
        ${data.claimant_representative || null},
        ${data.notes || null},
        'preparation',
        '[]'::jsonb
      )
      RETURNING *
    `;
    return rows[0]!;
  }

  /**
   * Update a tribunal case
   */
  async update(
    tx: TransactionSql,
    id: string,
    data: UpdateTribunalCase
  ): Promise<TribunalCaseRow | null> {
    const rows = await tx<TribunalCaseRow[]>`
      UPDATE tribunal_cases
      SET
        tribunal_reference = COALESCE(${data.tribunal_reference !== undefined ? data.tribunal_reference : null}, tribunal_reference),
        hearing_date = CASE
          WHEN ${data.hearing_date !== undefined} THEN ${data.hearing_date ?? null}::date
          ELSE hearing_date
        END,
        claim_type = COALESCE(${data.claim_type || null}, claim_type),
        respondent_representative = CASE
          WHEN ${data.respondent_representative !== undefined} THEN ${data.respondent_representative ?? null}
          ELSE respondent_representative
        END,
        claimant_representative = CASE
          WHEN ${data.claimant_representative !== undefined} THEN ${data.claimant_representative ?? null}
          ELSE claimant_representative
        END,
        status = COALESCE(${data.status || null}, status),
        outcome = CASE
          WHEN ${data.outcome !== undefined} THEN ${data.outcome ?? null}
          ELSE outcome
        END,
        notes = CASE
          WHEN ${data.notes !== undefined} THEN ${data.notes ?? null}
          ELSE notes
        END,
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] || null;
  }

  /**
   * Delete a tribunal case (only allowed in preparation status)
   */
  async delete(
    tx: TransactionSql,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM tribunal_cases
      WHERE id = ${id}
        AND status = 'preparation'
    `;
    return result.count > 0;
  }

  /**
   * Update the documents JSONB column for a tribunal case
   */
  async updateDocuments(
    tx: TransactionSql,
    id: string,
    documents: TribunalDocument[]
  ): Promise<TribunalCaseRow | null> {
    const rows = await tx<TribunalCaseRow[]>`
      UPDATE tribunal_cases
      SET
        documents = ${JSON.stringify(documents)}::jsonb,
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] || null;
  }

  /**
   * Check if employee exists
   */
  async employeeExists(
    context: TenantContext,
    employeeId: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx`
        SELECT 1 FROM employees WHERE id = ${employeeId} LIMIT 1
      `;
    });
    return rows.length > 0;
  }
}
