/**
 * Income Protection Module - Repository Layer
 *
 * Data access for income protection policies and employee enrollments.
 * All methods respect RLS through tenant context.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreatePolicy,
  UpdatePolicy,
  PolicyFilters,
  CreateEnrollment,
  UpdateEnrollment,
  EnrollmentFilters,
  PaginationQuery,
  PolicyStatus,
  EnrollmentStatus,
  BenefitBasis,
  DeferredPeriod,
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

export interface PolicyRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  policyNumber: string | null;
  providerName: string;
  providerContactEmail: string | null;
  providerContactPhone: string | null;
  status: PolicyStatus;
  benefitBasis: BenefitBasis;
  benefitPercentage: string | null;
  benefitFixedAmount: string | null;
  benefitCap: string | null;
  deferredPeriod: DeferredPeriod;
  maxBenefitAge: number;
  employerContributionPct: string;
  employeeContributionPct: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  eligibilityRules: Record<string, unknown>;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnrollmentRow extends Row {
  id: string;
  tenantId: string;
  policyId: string;
  employeeId: string;
  status: EnrollmentStatus;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  annualSalaryAtEnrollment: string | null;
  annualBenefitAmount: string | null;
  employeePremiumMonthly: string;
  employerPremiumMonthly: string;
  claimStartDate: Date | null;
  claimEndDate: Date | null;
  claimReason: string | null;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  policyName?: string;
  providerName?: string;
}

// =============================================================================
// Repository
// =============================================================================

export class IncomeProtectionRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Policy Methods
  // ===========================================================================

  async createPolicy(
    ctx: TenantContext,
    data: CreatePolicy,
    tx: TransactionSql
  ): Promise<PolicyRow> {
    const [row] = await tx`
      INSERT INTO income_protection_policies (
        tenant_id, name, policy_number, provider_name,
        provider_contact_email, provider_contact_phone,
        benefit_basis, benefit_percentage, benefit_fixed_amount, benefit_cap,
        deferred_period, max_benefit_age,
        employer_contribution_pct, employee_contribution_pct,
        effective_from, effective_to, eligibility_rules, notes,
        created_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.name},
        ${data.policy_number ?? null},
        ${data.provider_name},
        ${data.provider_contact_email ?? null},
        ${data.provider_contact_phone ?? null},
        ${data.benefit_basis}::app.income_protection_benefit_basis,
        ${data.benefit_percentage ?? null},
        ${data.benefit_fixed_amount ?? null},
        ${data.benefit_cap ?? null},
        ${data.deferred_period}::app.income_protection_deferred_period,
        ${data.max_benefit_age ?? 65},
        ${data.employer_contribution_pct ?? 100},
        ${data.employee_contribution_pct ?? 0},
        ${data.effective_from}::date,
        ${data.effective_to ?? null}::date,
        ${JSON.stringify(data.eligibility_rules ?? {})}::jsonb,
        ${data.notes ?? null},
        ${ctx.userId ?? null}::uuid
      )
      RETURNING *
    `;
    return row as unknown as PolicyRow;
  }

  async findPolicyById(
    ctx: TenantContext,
    id: string
  ): Promise<PolicyRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT *
        FROM income_protection_policies
        WHERE id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as PolicyRow;
  }

  async findAllPolicies(
    ctx: TenantContext,
    filters: PolicyFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<PolicyRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT *
        FROM income_protection_policies
        WHERE 1=1
          ${filters.status ? tx`AND status = ${filters.status}::app.income_protection_policy_status` : tx``}
          ${filters.search ? tx`AND (name ILIKE ${"%" + filters.search + "%"} OR provider_name ILIKE ${"%" + filters.search + "%"} OR policy_number ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${pagination.cursor ? tx`AND created_at < ${new Date(pagination.cursor)}::timestamptz` : tx``}
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as PolicyRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  async updatePolicy(
    ctx: TenantContext,
    id: string,
    data: UpdatePolicy,
    tx: TransactionSql
  ): Promise<PolicyRow | null> {
    const [row] = await tx`
      UPDATE income_protection_policies
      SET
        name = COALESCE(${data.name ?? null}, name),
        policy_number = CASE
          WHEN ${data.policy_number !== undefined} THEN ${data.policy_number ?? null}
          ELSE policy_number
        END,
        provider_name = COALESCE(${data.provider_name ?? null}, provider_name),
        provider_contact_email = CASE
          WHEN ${data.provider_contact_email !== undefined} THEN ${data.provider_contact_email ?? null}
          ELSE provider_contact_email
        END,
        provider_contact_phone = CASE
          WHEN ${data.provider_contact_phone !== undefined} THEN ${data.provider_contact_phone ?? null}
          ELSE provider_contact_phone
        END,
        status = COALESCE(${data.status ?? null}::app.income_protection_policy_status, status),
        benefit_basis = COALESCE(${data.benefit_basis ?? null}::app.income_protection_benefit_basis, benefit_basis),
        benefit_percentage = CASE
          WHEN ${data.benefit_percentage !== undefined} THEN ${data.benefit_percentage ?? null}
          ELSE benefit_percentage
        END,
        benefit_fixed_amount = CASE
          WHEN ${data.benefit_fixed_amount !== undefined} THEN ${data.benefit_fixed_amount ?? null}
          ELSE benefit_fixed_amount
        END,
        benefit_cap = CASE
          WHEN ${data.benefit_cap !== undefined} THEN ${data.benefit_cap ?? null}
          ELSE benefit_cap
        END,
        deferred_period = COALESCE(${data.deferred_period ?? null}::app.income_protection_deferred_period, deferred_period),
        max_benefit_age = COALESCE(${data.max_benefit_age ?? null}, max_benefit_age),
        employer_contribution_pct = COALESCE(${data.employer_contribution_pct ?? null}, employer_contribution_pct),
        employee_contribution_pct = COALESCE(${data.employee_contribution_pct ?? null}, employee_contribution_pct),
        effective_from = COALESCE(${data.effective_from ?? null}::date, effective_from),
        effective_to = CASE
          WHEN ${data.effective_to !== undefined} THEN ${data.effective_to ?? null}::date
          ELSE effective_to
        END,
        eligibility_rules = COALESCE(${data.eligibility_rules ? JSON.stringify(data.eligibility_rules) : null}::jsonb, eligibility_rules),
        notes = CASE
          WHEN ${data.notes !== undefined} THEN ${data.notes ?? null}
          ELSE notes
        END,
        updated_by = ${ctx.userId ?? null}::uuid,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `;

    if (!row) return null;
    return row as unknown as PolicyRow;
  }

  // ===========================================================================
  // Enrollment Methods
  // ===========================================================================

  async createEnrollment(
    ctx: TenantContext,
    data: CreateEnrollment,
    annualBenefitAmount: number | null,
    tx: TransactionSql
  ): Promise<EnrollmentRow> {
    const [row] = await tx`
      INSERT INTO income_protection_enrollments (
        tenant_id, policy_id, employee_id,
        effective_from, effective_to,
        annual_salary_at_enrollment, annual_benefit_amount,
        employee_premium_monthly, employer_premium_monthly,
        notes, created_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.policy_id}::uuid,
        ${data.employee_id}::uuid,
        ${data.effective_from}::date,
        ${data.effective_to ?? null}::date,
        ${data.annual_salary_at_enrollment ?? null},
        ${annualBenefitAmount},
        ${data.employee_premium_monthly ?? 0},
        ${data.employer_premium_monthly ?? 0},
        ${data.notes ?? null},
        ${ctx.userId ?? null}::uuid
      )
      RETURNING *
    `;
    return row as unknown as EnrollmentRow;
  }

  async findEnrollmentById(
    ctx: TenantContext,
    id: string
  ): Promise<EnrollmentRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          e.*,
          p.name AS policy_name,
          p.provider_name
        FROM income_protection_enrollments e
        JOIN income_protection_policies p ON p.id = e.policy_id
        WHERE e.id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as EnrollmentRow;
  }

  async findAllEnrollments(
    ctx: TenantContext,
    filters: EnrollmentFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<EnrollmentRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          e.*,
          p.name AS policy_name,
          p.provider_name
        FROM income_protection_enrollments e
        JOIN income_protection_policies p ON p.id = e.policy_id
        WHERE 1=1
          ${filters.policy_id ? tx`AND e.policy_id = ${filters.policy_id}::uuid` : tx``}
          ${filters.employee_id ? tx`AND e.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.status ? tx`AND e.status = ${filters.status}::app.income_protection_enrollment_status` : tx``}
          ${pagination.cursor ? tx`AND e.created_at < ${new Date(pagination.cursor)}::timestamptz` : tx``}
        ORDER BY e.created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as EnrollmentRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  async updateEnrollment(
    ctx: TenantContext,
    id: string,
    data: UpdateEnrollment,
    tx: TransactionSql
  ): Promise<EnrollmentRow | null> {
    const [row] = await tx`
      UPDATE income_protection_enrollments
      SET
        status = COALESCE(${data.status ?? null}::app.income_protection_enrollment_status, status),
        effective_to = CASE
          WHEN ${data.effective_to !== undefined} THEN ${data.effective_to ?? null}::date
          ELSE effective_to
        END,
        annual_salary_at_enrollment = CASE
          WHEN ${data.annual_salary_at_enrollment !== undefined} THEN ${data.annual_salary_at_enrollment ?? null}
          ELSE annual_salary_at_enrollment
        END,
        annual_benefit_amount = CASE
          WHEN ${data.annual_benefit_amount !== undefined} THEN ${data.annual_benefit_amount ?? null}
          ELSE annual_benefit_amount
        END,
        employee_premium_monthly = COALESCE(${data.employee_premium_monthly ?? null}, employee_premium_monthly),
        employer_premium_monthly = COALESCE(${data.employer_premium_monthly ?? null}, employer_premium_monthly),
        claim_start_date = CASE
          WHEN ${data.claim_start_date !== undefined} THEN ${data.claim_start_date ?? null}::date
          ELSE claim_start_date
        END,
        claim_end_date = CASE
          WHEN ${data.claim_end_date !== undefined} THEN ${data.claim_end_date ?? null}::date
          ELSE claim_end_date
        END,
        claim_reason = CASE
          WHEN ${data.claim_reason !== undefined} THEN ${data.claim_reason ?? null}
          ELSE claim_reason
        END,
        notes = CASE
          WHEN ${data.notes !== undefined} THEN ${data.notes ?? null}
          ELSE notes
        END,
        updated_by = ${ctx.userId ?? null}::uuid,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `;

    if (!row) return null;
    return row as unknown as EnrollmentRow;
  }

  async hasOverlappingEnrollment(
    ctx: TenantContext,
    employeeId: string,
    policyId: string,
    effectiveFrom: string,
    effectiveTo: string | null | undefined,
    tx: TransactionSql,
    excludeId?: string
  ): Promise<boolean> {
    const rows = excludeId
      ? await tx`
          SELECT 1 FROM income_protection_enrollments
          WHERE employee_id = ${employeeId}::uuid
            AND policy_id = ${policyId}::uuid
            AND id != ${excludeId}::uuid
            AND status IN ('pending', 'active', 'on_claim')
            AND daterange(effective_from, effective_to, '[]') &&
                daterange(${effectiveFrom}::date, ${effectiveTo ?? null}::date, '[]')
          LIMIT 1
        `
      : await tx`
          SELECT 1 FROM income_protection_enrollments
          WHERE employee_id = ${employeeId}::uuid
            AND policy_id = ${policyId}::uuid
            AND status IN ('pending', 'active', 'on_claim')
            AND daterange(effective_from, effective_to, '[]') &&
                daterange(${effectiveFrom}::date, ${effectiveTo ?? null}::date, '[]')
          LIMIT 1
        `;
    return rows.length > 0;
  }
}
