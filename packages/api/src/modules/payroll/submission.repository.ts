/**
 * Payroll Submission Repository (TODO-064)
 *
 * Data access layer for RTI (Real Time Information) submissions to HMRC.
 * Operates on the `payroll_rti_submissions` table with RLS tenant isolation.
 *
 * Column mapping notes (DB -> TS):
 *   - `tax_month`           -> `period`
 *   - `generated_at`        -> `validatedAt`
 *   - `generated_by`        -> `validatedBy`
 *   - `response_at`         -> `responseReceivedAt`
 *   - `submission_data`     -> stores `validationErrors` and `items` as jsonb keys
 *
 * Uses postgres.js tagged templates with automatic snake_case <-> camelCase
 * transform configured in the DatabaseClient.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface SubmissionRow {
  id: string;
  tenantId: string;
  submissionType: string;
  taxYear: string;
  period: number | null;
  status: string;
  payrollRunId: string | null;
  employerPayeRef: string | null;
  accountsOfficeRef: string | null;
  hmrcCorrelationId: string | null;
  validationErrors: string[] | null;
  validatedAt: Date | null;
  submittedAt: Date | null;
  submittedBy: string | null;
  responseReceivedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionItemRow {
  id: string;
  submissionId: string;
  employeeId: string;
  employeeNiNumber: string | null;
  employeeTaxCode: string | null;
  niCategory: string | null;
  grossPay: string;
  taxDeducted: string;
  niEmployee: string;
  niEmployer: string;
  studentLoan: string;
  pensionEmployee: string;
  pensionEmployer: string;
  netPay: string;
  taxablePayYtd: string | null;
  taxDeductedYtd: string | null;
  niEmployeeYtd: string | null;
  niEmployerYtd: string | null;
  studentLoanYtd: string | null;
  createdAt: Date;
}

interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface CreateSubmissionData {
  submissionType: string;
  taxYear: string;
  period: number | null;
  payrollRunId: string | null;
  employerPayeRef: string | null;
  accountsOfficeRef: string | null;
  payload: Record<string, unknown>;
  notes: string | null;
}

interface CreateSubmissionItemData {
  employeeId: string;
  employeeNiNumber: string | null;
  employeeTaxCode: string | null;
  niCategory: string | null;
  grossPay: string;
  taxDeducted: string;
  niEmployee: string;
  niEmployer: string;
  studentLoan: string;
  pensionEmployee: string;
  pensionEmployer: string;
  netPay: string;
  taxablePayYtd: string | null;
  taxDeductedYtd: string | null;
  niEmployeeYtd: string | null;
  niEmployerYtd: string | null;
  studentLoanYtd: string | null;
}

interface SubmissionListFilters {
  cursor?: string;
  limit?: number;
  submission_type?: string;
  status?: string;
  tax_year?: string;
  payroll_run_id?: string;
}

interface UpdateExtras {
  validationErrors?: string[] | null;
  validatedAt?: Date;
  validatedBy?: string;
  submittedAt?: Date;
  submittedBy?: string;
  hmrcCorrelationId?: string;
  hmrcResponse?: Record<string, unknown>;
  responseReceivedAt?: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class SubmissionRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Find Existing Submission (duplicate detection)
  // ===========================================================================

  /**
   * Check for an existing submission that matches the given criteria.
   * Used to prevent duplicate FPS/EPS submissions for the same period.
   */
  async findExistingSubmission(
    ctx: TenantContext,
    submissionType: string,
    taxYear: string,
    period: number | null,
    payrollRunId: string | null,
    tx?: TransactionSql
  ): Promise<SubmissionRow | null> {
    const query = async (sql: TransactionSql) => {
      const rows = await sql`
        SELECT
          id, tenant_id, submission_type, tax_year, tax_month,
          status, payroll_run_id, employer_paye_ref, accounts_office_ref,
          hmrc_correlation_id, submission_data, generated_at, submitted_at,
          submitted_by, response_at, notes, created_at, updated_at
        FROM payroll_rti_submissions
        WHERE submission_type = ${submissionType}::app.rti_submission_type
          AND tax_year = ${taxYear}
          AND status NOT IN ('rejected')
          ${period !== null ? sql`AND tax_month = ${period}` : sql`AND tax_month IS NULL`}
          ${payrollRunId ? sql`AND payroll_run_id = ${payrollRunId}::uuid` : sql``}
        LIMIT 1
      `;
      return rows;
    };

    const rows = tx
      ? await query(tx)
      : await this.db.withTransaction(ctx, query);

    if (rows.length === 0) return null;
    return this.mapRowToSubmission(rows[0]);
  }

  // ===========================================================================
  // Create Submission
  // ===========================================================================

  /**
   * Insert a new submission record with status 'draft'.
   * The payload is stored in the submission_data jsonb column.
   */
  async createSubmission(
    ctx: TenantContext,
    data: CreateSubmissionData,
    tx: TransactionSql
  ): Promise<SubmissionRow> {
    const [row] = await tx`
      INSERT INTO payroll_rti_submissions (
        tenant_id,
        payroll_run_id,
        submission_type,
        status,
        tax_year,
        tax_month,
        employer_paye_ref,
        accounts_office_ref,
        submission_data,
        notes,
        generated_by,
        created_at,
        updated_at
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.payrollRunId}::uuid,
        ${data.submissionType}::app.rti_submission_type,
        'draft'::app.rti_submission_status,
        ${data.taxYear},
        ${data.period},
        ${data.employerPayeRef},
        ${data.accountsOfficeRef},
        ${JSON.stringify(data.payload)}::jsonb,
        ${data.notes},
        ${ctx.userId ?? null}::uuid,
        now(),
        now()
      )
      RETURNING
        id, tenant_id, submission_type, tax_year, tax_month,
        status, payroll_run_id, employer_paye_ref, accounts_office_ref,
        hmrc_correlation_id, submission_data, generated_at, submitted_at,
        submitted_by, response_at, notes, created_at, updated_at
    `;
    return this.mapRowToSubmission(row);
  }

  // ===========================================================================
  // Create Submission Items
  // ===========================================================================

  /**
   * Store per-employee line items as a JSON array in submission_data.items.
   * Since there is no separate items table, we update the submission_data jsonb.
   * Returns the items as SubmissionItemRow[] for the service to use.
   */
  async createSubmissionItems(
    ctx: TenantContext,
    submissionId: string,
    items: CreateSubmissionItemData[],
    tx: TransactionSql
  ): Promise<SubmissionItemRow[]> {
    // Build item records with generated IDs and timestamps
    const now = new Date();
    const itemRecords = items.map((item) => ({
      id: crypto.randomUUID(),
      submissionId,
      ...item,
      createdAt: now.toISOString(),
    }));

    // Update the submission_data to include the items array
    await tx`
      UPDATE payroll_rti_submissions
      SET submission_data = submission_data || ${JSON.stringify({ items: itemRecords })}::jsonb,
          updated_at = now()
      WHERE id = ${submissionId}::uuid
    `;

    // Return the items as SubmissionItemRow[]
    return itemRecords.map((item) => ({
      id: item.id,
      submissionId: item.submissionId,
      employeeId: item.employeeId,
      employeeNiNumber: item.employeeNiNumber,
      employeeTaxCode: item.employeeTaxCode,
      niCategory: item.niCategory,
      grossPay: item.grossPay,
      taxDeducted: item.taxDeducted,
      niEmployee: item.niEmployee,
      niEmployer: item.niEmployer,
      studentLoan: item.studentLoan,
      pensionEmployee: item.pensionEmployee,
      pensionEmployer: item.pensionEmployer,
      netPay: item.netPay,
      taxablePayYtd: item.taxablePayYtd,
      taxDeductedYtd: item.taxDeductedYtd,
      niEmployeeYtd: item.niEmployeeYtd,
      niEmployerYtd: item.niEmployerYtd,
      studentLoanYtd: item.studentLoanYtd,
      createdAt: now,
    }));
  }

  // ===========================================================================
  // List Submissions
  // ===========================================================================

  /**
   * Paginated list of submissions with optional filters.
   * Uses cursor-based pagination on created_at.
   */
  async listSubmissions(
    ctx: TenantContext,
    filters: SubmissionListFilters
  ): Promise<PaginatedResult<SubmissionRow>> {
    const limit = filters.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, submission_type, tax_year, tax_month,
          status, payroll_run_id, employer_paye_ref, accounts_office_ref,
          hmrc_correlation_id, submission_data, generated_at, submitted_at,
          submitted_by, response_at, notes, created_at, updated_at
        FROM payroll_rti_submissions
        WHERE 1=1
          ${filters.submission_type ? tx`AND submission_type = ${filters.submission_type}::app.rti_submission_type` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}::app.rti_submission_status` : tx``}
          ${filters.tax_year ? tx`AND tax_year = ${filters.tax_year}` : tx``}
          ${filters.payroll_run_id ? tx`AND payroll_run_id = ${filters.payroll_run_id}::uuid` : tx``}
          ${filters.cursor ? tx`AND created_at < ${new Date(filters.cursor)}::timestamptz` : tx``}
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit).map((r) => this.mapRowToSubmission(r));
    const hasMore = rows.length > limit;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    return { items, nextCursor, hasMore };
  }

  // ===========================================================================
  // Find Submission By ID
  // ===========================================================================

  async findSubmissionById(
    ctx: TenantContext,
    id: string
  ): Promise<SubmissionRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, submission_type, tax_year, tax_month,
          status, payroll_run_id, employer_paye_ref, accounts_office_ref,
          hmrc_correlation_id, submission_data, generated_at, submitted_at,
          submitted_by, response_at, notes, created_at, updated_at
        FROM payroll_rti_submissions
        WHERE id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return this.mapRowToSubmission(rows[0]);
  }

  // ===========================================================================
  // Find Submission Items
  // ===========================================================================

  /**
   * Read per-employee items from the submission_data.items jsonb array.
   */
  async findSubmissionItems(
    ctx: TenantContext,
    submissionId: string
  ): Promise<SubmissionItemRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT submission_data
        FROM payroll_rti_submissions
        WHERE id = ${submissionId}::uuid
      `;
    });

    if (rows.length === 0) return [];

    const submissionData = (rows[0] as Record<string, unknown>).submissionData as Record<string, unknown> | null;
    if (!submissionData || !Array.isArray(submissionData.items)) return [];

    return (submissionData.items as Record<string, unknown>[]).map((item) => ({
      id: String(item.id ?? crypto.randomUUID()),
      submissionId: String(item.submissionId ?? submissionId),
      employeeId: String(item.employeeId ?? ""),
      employeeNiNumber: item.employeeNiNumber != null ? String(item.employeeNiNumber) : null,
      employeeTaxCode: item.employeeTaxCode != null ? String(item.employeeTaxCode) : null,
      niCategory: item.niCategory != null ? String(item.niCategory) : null,
      grossPay: String(item.grossPay ?? "0"),
      taxDeducted: String(item.taxDeducted ?? "0"),
      niEmployee: String(item.niEmployee ?? "0"),
      niEmployer: String(item.niEmployer ?? "0"),
      studentLoan: String(item.studentLoan ?? "0"),
      pensionEmployee: String(item.pensionEmployee ?? "0"),
      pensionEmployer: String(item.pensionEmployer ?? "0"),
      netPay: String(item.netPay ?? "0"),
      taxablePayYtd: item.taxablePayYtd != null ? String(item.taxablePayYtd) : null,
      taxDeductedYtd: item.taxDeductedYtd != null ? String(item.taxDeductedYtd) : null,
      niEmployeeYtd: item.niEmployeeYtd != null ? String(item.niEmployeeYtd) : null,
      niEmployerYtd: item.niEmployerYtd != null ? String(item.niEmployerYtd) : null,
      studentLoanYtd: item.studentLoanYtd != null ? String(item.studentLoanYtd) : null,
      createdAt: item.createdAt ? new Date(String(item.createdAt)) : new Date(),
    }));
  }

  // ===========================================================================
  // Update Submission Status
  // ===========================================================================

  /**
   * Update the status of a submission with optional extra fields.
   * Supports storing validation errors in submission_data and mapping
   * validated_at/validated_by to generated_at/generated_by columns.
   */
  async updateSubmissionStatus(
    ctx: TenantContext,
    id: string,
    status: string,
    tx: TransactionSql,
    extras?: UpdateExtras
  ): Promise<SubmissionRow | null> {
    // Build the submission_data patch for validation errors
    let dataPatch: string | null = null;
    if (extras?.validationErrors !== undefined) {
      dataPatch = JSON.stringify({
        validationErrors: extras.validationErrors,
      });
    }

    const [row] = await tx`
      UPDATE payroll_rti_submissions
      SET
        status = ${status}::app.rti_submission_status,
        ${extras?.validatedAt ? tx`generated_at = ${extras.validatedAt},` : tx``}
        ${extras?.validatedBy ? tx`generated_by = ${extras.validatedBy}::uuid,` : tx``}
        ${extras?.submittedAt ? tx`submitted_at = ${extras.submittedAt},` : tx``}
        ${extras?.submittedBy ? tx`submitted_by = ${extras.submittedBy}::uuid,` : tx``}
        ${extras?.hmrcCorrelationId ? tx`hmrc_correlation_id = ${extras.hmrcCorrelationId},` : tx``}
        ${extras?.hmrcResponse ? tx`hmrc_response = ${JSON.stringify(extras.hmrcResponse)}::jsonb,` : tx``}
        ${extras?.responseReceivedAt ? tx`response_at = ${extras.responseReceivedAt},` : tx``}
        ${dataPatch ? tx`submission_data = submission_data || ${dataPatch}::jsonb,` : tx``}
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, submission_type, tax_year, tax_month,
        status, payroll_run_id, employer_paye_ref, accounts_office_ref,
        hmrc_correlation_id, submission_data, generated_at, submitted_at,
        submitted_by, response_at, notes, created_at, updated_at
    `;

    if (!row) return null;
    return this.mapRowToSubmission(row);
  }

  // ===========================================================================
  // Row Mapper
  // ===========================================================================

  /**
   * Map a raw database row to a SubmissionRow.
   * Handles the column mapping:
   *   - tax_month -> period
   *   - generated_at -> validatedAt
   *   - response_at -> responseReceivedAt
   *   - submission_data.validationErrors -> validationErrors
   */
  private mapRowToSubmission(row: unknown): SubmissionRow {
    const r = row as Record<string, unknown>;
    const submissionData = r.submissionData as Record<string, unknown> | null;
    const validationErrors =
      submissionData && Array.isArray(submissionData.validationErrors)
        ? (submissionData.validationErrors as string[])
        : null;

    return {
      id: String(r.id),
      tenantId: String(r.tenantId),
      submissionType: String(r.submissionType),
      taxYear: String(r.taxYear),
      period: r.taxMonth != null ? Number(r.taxMonth) : null,
      status: String(r.status),
      payrollRunId: r.payrollRunId != null ? String(r.payrollRunId) : null,
      employerPayeRef: r.employerPayeRef != null ? String(r.employerPayeRef) : null,
      accountsOfficeRef: r.accountsOfficeRef != null ? String(r.accountsOfficeRef) : null,
      hmrcCorrelationId: r.hmrcCorrelationId != null ? String(r.hmrcCorrelationId) : null,
      validationErrors,
      validatedAt: r.generatedAt instanceof Date ? r.generatedAt : r.generatedAt ? new Date(String(r.generatedAt)) : null,
      submittedAt: r.submittedAt instanceof Date ? r.submittedAt : r.submittedAt ? new Date(String(r.submittedAt)) : null,
      submittedBy: r.submittedBy != null ? String(r.submittedBy) : null,
      responseReceivedAt: r.responseAt instanceof Date ? r.responseAt : r.responseAt ? new Date(String(r.responseAt)) : null,
      notes: r.notes != null ? String(r.notes) : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(String(r.createdAt)),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt : new Date(String(r.updatedAt)),
    };
  }
}
