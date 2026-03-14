/**
 * Pension Auto-Enrolment Module - Repository Layer
 *
 * Provides data access methods for pension schemes, enrolments, and contributions.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * UK Pensions Act 2008 compliance — criminal prosecution risk for non-compliance.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreatePensionScheme,
  UpdatePensionScheme,
  PensionSchemeType,
  PensionSchemeStatus,
  PensionEnrolmentStatus,
  PensionWorkerCategory,
  PensionContributionStatus,
  PaginationQuery,
  EnrolmentFilters,
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

export interface PensionSchemeRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  provider: string;
  schemeType: PensionSchemeType;
  employerContributionPct: string; // numeric comes as string from postgres
  employeeContributionPct: string;
  qualifyingEarningsLower: number;
  qualifyingEarningsUpper: number;
  isDefault: boolean;
  status: PensionSchemeStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PensionEnrolmentRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  schemeId: string;
  workerCategory: PensionWorkerCategory;
  status: PensionEnrolmentStatus;
  enrolmentDate: Date | null;
  optOutDeadline: Date | null;
  optedOutAt: Date | null;
  optOutReason: string | null;
  reEnrolmentDate: Date | null;
  postponementEndDate: Date | null;
  contributionsStartDate: Date | null;
  assessedAnnualEarnings: number | null;
  assessedAge: number | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  employeeName?: string;
  schemeName?: string;
}

export interface PensionContributionRow extends Row {
  id: string;
  tenantId: string;
  enrolmentId: string;
  employeeId: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  qualifyingEarnings: number;
  employerAmount: number;
  employeeAmount: number;
  totalAmount: number;
  status: PensionContributionStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Employee assessment data (joined from employees table)
 */
export interface EmployeeAssessmentData extends Row {
  id: string;
  dateOfBirth: Date | null;
  hireDate: Date;
  status: string;
  // We need a way to get salary — join from employee history or compensation
  annualSalary: number | null;
}

// =============================================================================
// Repository
// =============================================================================

export class PensionRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Pension Schemes
  // ===========================================================================

  async createScheme(
    ctx: TenantContext,
    data: CreatePensionScheme,
    tx: TransactionSql
  ): Promise<PensionSchemeRow> {
    const [row] = await tx`
      INSERT INTO pension_schemes (
        tenant_id, name, provider, scheme_type,
        employer_contribution_pct, employee_contribution_pct,
        qualifying_earnings_lower, qualifying_earnings_upper,
        is_default
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.name},
        ${data.provider},
        ${data.scheme_type}::app.pension_scheme_type,
        ${data.employer_contribution_pct},
        ${data.employee_contribution_pct},
        ${data.qualifying_earnings_lower ?? 624000},
        ${data.qualifying_earnings_upper ?? 5027000},
        ${data.is_default ?? false}
      )
      RETURNING
        id, tenant_id, name, provider, scheme_type,
        employer_contribution_pct, employee_contribution_pct,
        qualifying_earnings_lower, qualifying_earnings_upper,
        is_default, status, created_at, updated_at
    `;
    return row as unknown as PensionSchemeRow;
  }

  async findSchemeById(
    ctx: TenantContext,
    id: string
  ): Promise<PensionSchemeRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, name, provider, scheme_type,
          employer_contribution_pct, employee_contribution_pct,
          qualifying_earnings_lower, qualifying_earnings_upper,
          is_default, status, created_at, updated_at
        FROM pension_schemes
        WHERE id = ${id}::uuid
      `;
    });
    if (rows.length === 0) return null;
    return rows[0] as unknown as PensionSchemeRow;
  }

  async findDefaultScheme(
    ctx: TenantContext
  ): Promise<PensionSchemeRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, name, provider, scheme_type,
          employer_contribution_pct, employee_contribution_pct,
          qualifying_earnings_lower, qualifying_earnings_upper,
          is_default, status, created_at, updated_at
        FROM pension_schemes
        WHERE is_default = true AND status = 'active'
        LIMIT 1
      `;
    });
    if (rows.length === 0) return null;
    return rows[0] as unknown as PensionSchemeRow;
  }

  async findAllSchemes(
    ctx: TenantContext,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<PensionSchemeRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      if (pagination.cursor) {
        return await tx`
          SELECT
            id, tenant_id, name, provider, scheme_type,
            employer_contribution_pct, employee_contribution_pct,
            qualifying_earnings_lower, qualifying_earnings_upper,
            is_default, status, created_at, updated_at
          FROM pension_schemes
          WHERE created_at < ${new Date(pagination.cursor)}::timestamptz
          ORDER BY created_at DESC
          LIMIT ${fetchLimit}
        `;
      }
      return await tx`
        SELECT
          id, tenant_id, name, provider, scheme_type,
          employer_contribution_pct, employee_contribution_pct,
          qualifying_earnings_lower, qualifying_earnings_upper,
          is_default, status, created_at, updated_at
        FROM pension_schemes
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as PensionSchemeRow[];
    const hasMore = rows.length > limit;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    return { items, nextCursor, hasMore };
  }

  async schemeNameExists(
    ctx: TenantContext,
    name: string,
    excludeId?: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      if (excludeId) {
        return await tx`
          SELECT 1 FROM pension_schemes
          WHERE name = ${name} AND id != ${excludeId}::uuid
          LIMIT 1
        `;
      }
      return await tx`
        SELECT 1 FROM pension_schemes WHERE name = ${name} LIMIT 1
      `;
    });
    return rows.length > 0;
  }

  async clearDefaultSchemeExcept(
    ctx: TenantContext,
    schemeId: string,
    tx: TransactionSql
  ): Promise<void> {
    await tx`
      UPDATE pension_schemes
      SET is_default = false, updated_at = now()
      WHERE id != ${schemeId}::uuid AND is_default = true
    `;
  }

  // ===========================================================================
  // Employee Assessment Data
  // ===========================================================================

  /**
   * Fetch employee data needed for auto-enrolment assessment.
   * Gets date_of_birth and current annual salary from the most recent
   * compensation history record.
   */
  async getEmployeeAssessmentData(
    ctx: TenantContext,
    employeeId: string
  ): Promise<EmployeeAssessmentData | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          e.id,
          e.date_of_birth,
          e.hire_date,
          e.status,
          (
            SELECT eh.new_value::jsonb->>'salary'
            FROM employee_history eh
            WHERE eh.employee_id = e.id
              AND eh.dimension = 'compensation'
              AND (eh.effective_to IS NULL OR eh.effective_to >= CURRENT_DATE)
              AND eh.effective_from <= CURRENT_DATE
            ORDER BY eh.effective_from DESC
            LIMIT 1
          )::integer AS annual_salary
        FROM employees e
        WHERE e.id = ${employeeId}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as EmployeeAssessmentData;
  }

  // ===========================================================================
  // Pension Enrolments
  // ===========================================================================

  async createEnrolment(
    ctx: TenantContext,
    data: {
      employee_id: string;
      scheme_id: string;
      worker_category: PensionWorkerCategory;
      status: PensionEnrolmentStatus;
      enrolment_date: string | null;
      opt_out_deadline: string | null;
      re_enrolment_date: string | null;
      postponement_end_date: string | null;
      contributions_start_date: string | null;
      assessed_annual_earnings: number | null;
      assessed_age: number | null;
    },
    tx: TransactionSql
  ): Promise<PensionEnrolmentRow> {
    const [row] = await tx`
      INSERT INTO pension_enrolments (
        tenant_id, employee_id, scheme_id, worker_category, status,
        enrolment_date, opt_out_deadline, re_enrolment_date,
        postponement_end_date, contributions_start_date,
        assessed_annual_earnings, assessed_age
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.scheme_id}::uuid,
        ${data.worker_category}::app.pension_worker_category,
        ${data.status}::app.pension_enrolment_status,
        ${data.enrolment_date}::date,
        ${data.opt_out_deadline}::date,
        ${data.re_enrolment_date}::date,
        ${data.postponement_end_date}::date,
        ${data.contributions_start_date}::date,
        ${data.assessed_annual_earnings},
        ${data.assessed_age}
      )
      RETURNING
        id, tenant_id, employee_id, scheme_id, worker_category, status,
        enrolment_date, opt_out_deadline, opted_out_at, opt_out_reason,
        re_enrolment_date, postponement_end_date, contributions_start_date,
        assessed_annual_earnings, assessed_age, created_at, updated_at
    `;
    return row as unknown as PensionEnrolmentRow;
  }

  async findEnrolmentById(
    ctx: TenantContext,
    id: string
  ): Promise<PensionEnrolmentRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          pe.id, pe.tenant_id, pe.employee_id, pe.scheme_id,
          pe.worker_category, pe.status,
          pe.enrolment_date, pe.opt_out_deadline, pe.opted_out_at,
          pe.opt_out_reason, pe.re_enrolment_date, pe.postponement_end_date,
          pe.contributions_start_date,
          pe.assessed_annual_earnings, pe.assessed_age,
          pe.created_at, pe.updated_at,
          e.first_name || ' ' || e.last_name AS employee_name,
          ps.name AS scheme_name
        FROM pension_enrolments pe
        JOIN employees e ON e.id = pe.employee_id
        JOIN pension_schemes ps ON ps.id = pe.scheme_id
        WHERE pe.id = ${id}::uuid
      `;
    });
    if (rows.length === 0) return null;
    return rows[0] as unknown as PensionEnrolmentRow;
  }

  async findActiveEnrolmentByEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<PensionEnrolmentRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          pe.id, pe.tenant_id, pe.employee_id, pe.scheme_id,
          pe.worker_category, pe.status,
          pe.enrolment_date, pe.opt_out_deadline, pe.opted_out_at,
          pe.opt_out_reason, pe.re_enrolment_date, pe.postponement_end_date,
          pe.contributions_start_date,
          pe.assessed_annual_earnings, pe.assessed_age,
          pe.created_at, pe.updated_at
        FROM pension_enrolments pe
        WHERE pe.employee_id = ${employeeId}::uuid
          AND pe.status IN ('eligible', 'enrolled', 're_enrolled', 'postponed')
        ORDER BY pe.created_at DESC
        LIMIT 1
      `;
    });
    if (rows.length === 0) return null;
    return rows[0] as unknown as PensionEnrolmentRow;
  }

  async findEnrolments(
    ctx: TenantContext,
    filters: EnrolmentFilters = {}
  ): Promise<PaginatedResult<PensionEnrolmentRow>> {
    const limit = filters.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          pe.id, pe.tenant_id, pe.employee_id, pe.scheme_id,
          pe.worker_category, pe.status,
          pe.enrolment_date, pe.opt_out_deadline, pe.opted_out_at,
          pe.opt_out_reason, pe.re_enrolment_date, pe.postponement_end_date,
          pe.contributions_start_date,
          pe.assessed_annual_earnings, pe.assessed_age,
          pe.created_at, pe.updated_at,
          e.first_name || ' ' || e.last_name AS employee_name,
          ps.name AS scheme_name
        FROM pension_enrolments pe
        JOIN employees e ON e.id = pe.employee_id
        JOIN pension_schemes ps ON ps.id = pe.scheme_id
        WHERE 1=1
          ${filters.status ? tx`AND pe.status = ${filters.status}::app.pension_enrolment_status` : tx``}
          ${filters.employee_id ? tx`AND pe.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.cursor ? tx`AND pe.created_at < ${new Date(filters.cursor)}::timestamptz` : tx``}
        ORDER BY pe.created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as PensionEnrolmentRow[];
    const hasMore = rows.length > limit;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    return { items, nextCursor, hasMore };
  }

  async updateEnrolmentStatus(
    ctx: TenantContext,
    id: string,
    updates: {
      status: PensionEnrolmentStatus;
      opted_out_at?: Date | null;
      opt_out_reason?: string | null;
      re_enrolment_date?: string | null;
      enrolment_date?: string | null;
      opt_out_deadline?: string | null;
      contributions_start_date?: string | null;
      postponement_end_date?: string | null;
    },
    tx: TransactionSql
  ): Promise<PensionEnrolmentRow | null> {
    const [row] = await tx`
      UPDATE pension_enrolments
      SET
        status = ${updates.status}::app.pension_enrolment_status,
        opted_out_at = CASE
          WHEN ${updates.opted_out_at !== undefined} THEN ${updates.opted_out_at ?? null}::timestamptz
          ELSE opted_out_at
        END,
        opt_out_reason = CASE
          WHEN ${updates.opt_out_reason !== undefined} THEN ${updates.opt_out_reason ?? null}
          ELSE opt_out_reason
        END,
        re_enrolment_date = CASE
          WHEN ${updates.re_enrolment_date !== undefined} THEN ${updates.re_enrolment_date ?? null}::date
          ELSE re_enrolment_date
        END,
        enrolment_date = CASE
          WHEN ${updates.enrolment_date !== undefined} THEN ${updates.enrolment_date ?? null}::date
          ELSE enrolment_date
        END,
        opt_out_deadline = CASE
          WHEN ${updates.opt_out_deadline !== undefined} THEN ${updates.opt_out_deadline ?? null}::date
          ELSE opt_out_deadline
        END,
        contributions_start_date = CASE
          WHEN ${updates.contributions_start_date !== undefined} THEN ${updates.contributions_start_date ?? null}::date
          ELSE contributions_start_date
        END,
        postponement_end_date = CASE
          WHEN ${updates.postponement_end_date !== undefined} THEN ${updates.postponement_end_date ?? null}::date
          ELSE postponement_end_date
        END,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, scheme_id, worker_category, status,
        enrolment_date, opt_out_deadline, opted_out_at, opt_out_reason,
        re_enrolment_date, postponement_end_date, contributions_start_date,
        assessed_annual_earnings, assessed_age, created_at, updated_at
    `;
    if (!row) return null;
    return row as unknown as PensionEnrolmentRow;
  }

  /**
   * Find opted-out enrolments due for re-enrolment (3-year cycle).
   * Returns enrolments where re_enrolment_date <= today.
   */
  async findDueForReEnrolment(
    ctx: TenantContext,
    tx: TransactionSql
  ): Promise<PensionEnrolmentRow[]> {
    const rows = await tx`
      SELECT
        pe.id, pe.tenant_id, pe.employee_id, pe.scheme_id,
        pe.worker_category, pe.status,
        pe.enrolment_date, pe.opt_out_deadline, pe.opted_out_at,
        pe.opt_out_reason, pe.re_enrolment_date, pe.postponement_end_date,
        pe.contributions_start_date,
        pe.assessed_annual_earnings, pe.assessed_age,
        pe.created_at, pe.updated_at
      FROM pension_enrolments pe
      JOIN employees e ON e.id = pe.employee_id AND e.status = 'active'
      WHERE pe.status = 'opted_out'
        AND pe.re_enrolment_date IS NOT NULL
        AND pe.re_enrolment_date <= CURRENT_DATE
    `;
    return rows as unknown as PensionEnrolmentRow[];
  }

  // ===========================================================================
  // Pension Contributions
  // ===========================================================================

  async createContribution(
    ctx: TenantContext,
    data: {
      enrolment_id: string;
      employee_id: string;
      pay_period_start: string;
      pay_period_end: string;
      qualifying_earnings: number;
      employer_amount: number;
      employee_amount: number;
      total_amount: number;
    },
    tx: TransactionSql
  ): Promise<PensionContributionRow> {
    const [row] = await tx`
      INSERT INTO pension_contributions (
        tenant_id, enrolment_id, employee_id,
        pay_period_start, pay_period_end,
        qualifying_earnings, employer_amount, employee_amount, total_amount
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.enrolment_id}::uuid,
        ${data.employee_id}::uuid,
        ${data.pay_period_start}::date,
        ${data.pay_period_end}::date,
        ${data.qualifying_earnings},
        ${data.employer_amount},
        ${data.employee_amount},
        ${data.total_amount}
      )
      RETURNING
        id, tenant_id, enrolment_id, employee_id,
        pay_period_start, pay_period_end,
        qualifying_earnings, employer_amount, employee_amount, total_amount,
        status, created_at, updated_at
    `;
    return row as unknown as PensionContributionRow;
  }

  async contributionExistsForPeriod(
    ctx: TenantContext,
    enrolmentId: string,
    payPeriodStart: string,
    payPeriodEnd: string,
    tx: TransactionSql
  ): Promise<boolean> {
    const rows = await tx`
      SELECT 1 FROM pension_contributions
      WHERE enrolment_id = ${enrolmentId}::uuid
        AND pay_period_start = ${payPeriodStart}::date
        AND pay_period_end = ${payPeriodEnd}::date
      LIMIT 1
    `;
    return rows.length > 0;
  }

  // ===========================================================================
  // Compliance Summary
  // ===========================================================================

  async getComplianceSummary(
    ctx: TenantContext
  ): Promise<{
    totalEmployees: number;
    eligibleCount: number;
    enrolledCount: number;
    optedOutCount: number;
    postponedCount: number;
    ceasedCount: number;
    reEnrolledCount: number;
    pendingReEnrolmentCount: number;
    totalEmployerContributions: number;
    totalEmployeeContributions: number;
    schemesCount: number;
  }> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      // Get employee count
      const [empCount] = await tx`
        SELECT count(*)::integer AS count
        FROM employees
        WHERE status = 'active'
      `;

      // Get enrolment status counts
      const statusCounts = await tx`
        SELECT status, count(*)::integer AS count
        FROM pension_enrolments
        GROUP BY status
      `;

      // Get pending re-enrolment count
      const [reEnrolCount] = await tx`
        SELECT count(*)::integer AS count
        FROM pension_enrolments
        WHERE status = 'opted_out'
          AND re_enrolment_date IS NOT NULL
          AND re_enrolment_date <= CURRENT_DATE
      `;

      // Get contribution totals
      const [contribTotals] = await tx`
        SELECT
          COALESCE(sum(employer_amount), 0)::integer AS total_employer,
          COALESCE(sum(employee_amount), 0)::integer AS total_employee
        FROM pension_contributions
      `;

      // Get active schemes count
      const [schemesCount] = await tx`
        SELECT count(*)::integer AS count
        FROM pension_schemes
        WHERE status = 'active'
      `;

      const statusMap: Record<string, number> = {};
      for (const row of statusCounts as unknown as Array<{ status: string; count: number }>) {
        statusMap[row.status] = row.count;
      }

      const empCountTyped = empCount as unknown as { count: number } | undefined;
      const reEnrolCountTyped = reEnrolCount as unknown as { count: number } | undefined;
      const contribTotalsTyped = contribTotals as unknown as
        | { totalEmployer: number; totalEmployee: number }
        | undefined;
      const schemesCountTyped = schemesCount as unknown as { count: number } | undefined;

      return {
        totalEmployees: empCountTyped?.count ?? 0,
        eligibleCount: statusMap["eligible"] ?? 0,
        enrolledCount: statusMap["enrolled"] ?? 0,
        optedOutCount: statusMap["opted_out"] ?? 0,
        postponedCount: statusMap["postponed"] ?? 0,
        ceasedCount: statusMap["ceased"] ?? 0,
        reEnrolledCount: statusMap["re_enrolled"] ?? 0,
        pendingReEnrolmentCount: reEnrolCountTyped?.count ?? 0,
        totalEmployerContributions: contribTotalsTyped?.totalEmployer ?? 0,
        totalEmployeeContributions: contribTotalsTyped?.totalEmployee ?? 0,
        schemesCount: schemesCountTyped?.count ?? 0,
      };
    });

    return result;
  }
}
