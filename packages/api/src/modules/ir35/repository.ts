/**
 * IR35 Off-Payroll Compliance Module - Repository Layer
 *
 * Provides data access methods for IR35 assessments.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  CreateIR35Assessment,
  UpdateIR35Assessment,
  IR35AssessmentFilters,
  PaginationQuery,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface IR35AssessmentRow extends Row {
  id: string;
  tenantId: string;
  contractorId: string;
  engagementId: string;
  assessmentDate: Date;
  statusDetermination: string;
  determinationReasons: unknown;
  assessorId: string;
  clientLed: boolean;
  disputeStatus: string;
  disputeReason: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IR35AssessmentListRow extends Row {
  id: string;
  contractorId: string;
  contractorName: string | null;
  employeeNumber: string | null;
  engagementId: string;
  assessmentDate: Date;
  statusDetermination: string;
  clientLed: boolean;
  disputeStatus: string;
  createdAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// IR35 Repository
// =============================================================================

export class IR35Repository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // IR35 Assessment Methods
  // ===========================================================================

  /**
   * Create a new IR35 assessment (called within an existing transaction)
   */
  async createAssessment(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateIR35Assessment
  ): Promise<IR35AssessmentRow> {
    const rows = await tx<IR35AssessmentRow[]>`
      INSERT INTO app.ir35_assessments (
        tenant_id, contractor_id, engagement_id, assessment_date,
        status_determination, determination_reasons, assessor_id, client_led
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.contractor_id}::uuid,
        ${data.engagement_id},
        ${data.assessment_date}::date,
        ${data.status_determination}::app.ir35_status_determination,
        ${JSON.stringify(data.determination_reasons)}::jsonb,
        ${context.userId || null}::uuid,
        ${data.client_led !== undefined ? data.client_led : true}
      )
      RETURNING
        id, tenant_id, contractor_id, engagement_id, assessment_date,
        status_determination, determination_reasons, assessor_id, client_led,
        dispute_status, dispute_reason, reviewed_at, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Find IR35 assessment by ID
   */
  async findAssessmentById(
    context: TenantContext,
    id: string
  ): Promise<IR35AssessmentRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<IR35AssessmentRow[]>`
        SELECT
          id, tenant_id, contractor_id, engagement_id, assessment_date,
          status_determination, determination_reasons, assessor_id, client_led,
          dispute_status, dispute_reason, reviewed_at, created_at, updated_at
        FROM app.ir35_assessments
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Find IR35 assessments with filters and cursor-based pagination
   */
  async findAssessments(
    context: TenantContext,
    filters: IR35AssessmentFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<IR35AssessmentListRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<IR35AssessmentListRow[]>`
        SELECT
          ia.id,
          ia.contractor_id,
          (
            SELECT CONCAT(ep.first_name, ' ', ep.last_name)
            FROM app.employee_personal ep
            WHERE ep.employee_id = ia.contractor_id
              AND ep.effective_to IS NULL
            LIMIT 1
          ) as contractor_name,
          e.employee_number,
          ia.engagement_id,
          ia.assessment_date,
          ia.status_determination,
          ia.client_led,
          ia.dispute_status,
          ia.created_at
        FROM app.ir35_assessments ia
        JOIN app.employees e ON e.id = ia.contractor_id
        WHERE 1=1
          ${filters.contractor_id ? tx`AND ia.contractor_id = ${filters.contractor_id}::uuid` : tx``}
          ${filters.engagement_id ? tx`AND ia.engagement_id = ${filters.engagement_id}` : tx``}
          ${filters.status_determination ? tx`AND ia.status_determination = ${filters.status_determination}::app.ir35_status_determination` : tx``}
          ${filters.dispute_status ? tx`AND ia.dispute_status = ${filters.dispute_status}::app.ir35_dispute_status` : tx``}
          ${filters.assessment_date_from ? tx`AND ia.assessment_date >= ${filters.assessment_date_from}::date` : tx``}
          ${filters.assessment_date_to ? tx`AND ia.assessment_date <= ${filters.assessment_date_to}::date` : tx``}
          ${filters.search ? tx`AND (
            ia.engagement_id ILIKE ${"%" + filters.search + "%"}
            OR e.employee_number ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${cursor ? tx`AND ia.id < ${cursor}::uuid` : tx``}
        ORDER BY ia.created_at DESC, ia.id DESC
        LIMIT ${fetchLimit}
      `;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Update IR35 assessment fields (called within an existing transaction)
   */
  async updateAssessment(
    tx: TransactionSql,
    id: string,
    data: UpdateIR35Assessment
  ): Promise<IR35AssessmentRow | null> {
    const rows = await tx<IR35AssessmentRow[]>`
      UPDATE app.ir35_assessments
      SET
        assessment_date = COALESCE(${data.assessment_date || null}::date, assessment_date),
        status_determination = COALESCE(${data.status_determination || null}::app.ir35_status_determination, status_determination),
        determination_reasons = COALESCE(${data.determination_reasons ? JSON.stringify(data.determination_reasons) : null}::jsonb, determination_reasons),
        client_led = COALESCE(${data.client_led !== undefined ? data.client_led : null}::boolean, client_led),
        reviewed_at = now(),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, contractor_id, engagement_id, assessment_date,
        status_determination, determination_reasons, assessor_id, client_led,
        dispute_status, dispute_reason, reviewed_at, created_at, updated_at
    `;

    return rows[0] || null;
  }

  /**
   * Set dispute on an assessment (called within an existing transaction)
   */
  async setDispute(
    tx: TransactionSql,
    id: string,
    disputeReason: string
  ): Promise<IR35AssessmentRow | null> {
    const rows = await tx<IR35AssessmentRow[]>`
      UPDATE app.ir35_assessments
      SET
        dispute_status = 'pending'::app.ir35_dispute_status,
        dispute_reason = ${disputeReason},
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, contractor_id, engagement_id, assessment_date,
        status_determination, determination_reasons, assessor_id, client_led,
        dispute_status, dispute_reason, reviewed_at, created_at, updated_at
    `;

    return rows[0] || null;
  }
}
