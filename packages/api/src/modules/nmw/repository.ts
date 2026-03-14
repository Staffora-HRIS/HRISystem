/**
 * NMW (National Minimum Wage) Module - Repository Layer
 *
 * Provides data access methods for NMW rates and compliance checks.
 * All tenant-scoped methods respect RLS through tenant context.
 * System-wide rates (tenant_id IS NULL) are read via system context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  NMWRateFilters,
  ComplianceReportFilters,
  PaginationQuery,
  CreateNMWRate,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

export interface NMWRateRow extends Row {
  id: string;
  tenantId: string | null;
  rateName: string;
  ageFrom: number;
  ageTo: number | null;
  hourlyRate: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  rateType: string;
  createdAt: Date;
}

export interface ComplianceCheckRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  checkDate: Date;
  employeeAge: number;
  applicableRate: string;
  actualHourlyRate: string;
  compliant: boolean;
  shortfall: string | null;
  checkedBy: string;
  notes: string | null;
  createdAt: Date;
}

/** Extended compliance check row with employee details joined in */
export interface ComplianceCheckWithEmployeeRow extends ComplianceCheckRow {
  employeeName: string | null;
  employeeNumber: string | null;
}

/** Employee data needed for a compliance check */
export interface EmployeeComplianceData extends Row {
  id: string;
  tenantId: string;
  employeeNumber: string;
  status: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  baseSalary: string | null;
  payFrequency: string | null;
  workingHoursPerWeek: string | null;
}

export type { TenantContext } from "../../types/service-result";

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// NMW Repository
// =============================================================================

export class NMWRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // NMW Rate Methods
  // ===========================================================================

  /**
   * Find all rates visible to the current tenant (system + tenant-specific).
   * Optionally filter by rate_type and effective date.
   */
  async findRates(
    context: { tenantId: string; userId?: string },
    filters: NMWRateFilters = {}
  ): Promise<NMWRateRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<NMWRateRow[]>`
        SELECT id, tenant_id, rate_name, age_from, age_to,
               hourly_rate, effective_from, effective_to,
               rate_type, created_at
        FROM app.nmw_rates
        WHERE 1=1
          ${filters.rate_type ? tx`AND rate_type = ${filters.rate_type}::app.nmw_rate_type` : tx``}
          ${filters.effective_on ? tx`AND effective_from <= ${filters.effective_on}::date AND (effective_to IS NULL OR effective_to > ${filters.effective_on}::date)` : tx``}
          ${filters.include_system === "false" ? tx`AND tenant_id IS NOT NULL` : tx``}
        ORDER BY rate_type, age_from
      `;

      return rows as NMWRateRow[];
    });
  }

  /**
   * Get the applicable rate for a given age and date.
   * Prefers tenant-specific rates over system-wide rates.
   * Excludes apprentice rates (those must be explicitly requested).
   */
  async getApplicableRate(
    context: { tenantId: string; userId?: string },
    age: number,
    asOfDate: string
  ): Promise<NMWRateRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<NMWRateRow[]>`
        SELECT id, tenant_id, rate_name, age_from, age_to,
               hourly_rate, effective_from, effective_to,
               rate_type, created_at
        FROM app.nmw_rates
        WHERE rate_type != 'apprentice'
          AND age_from <= ${age}
          AND (age_to IS NULL OR age_to > ${age})
          AND effective_from <= ${asOfDate}::date
          AND (effective_to IS NULL OR effective_to > ${asOfDate}::date)
        ORDER BY
          -- Prefer tenant-specific over system-wide
          CASE WHEN tenant_id IS NOT NULL THEN 0 ELSE 1 END,
          -- Use the most recent effective_from
          effective_from DESC
        LIMIT 1
      `;
    });

    return rows.length > 0 ? rows[0]! : null;
  }

  /**
   * Get the apprentice rate for a given date.
   */
  async getApprenticeRate(
    context: { tenantId: string; userId?: string },
    asOfDate: string
  ): Promise<NMWRateRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<NMWRateRow[]>`
        SELECT id, tenant_id, rate_name, age_from, age_to,
               hourly_rate, effective_from, effective_to,
               rate_type, created_at
        FROM app.nmw_rates
        WHERE rate_type = 'apprentice'
          AND effective_from <= ${asOfDate}::date
          AND (effective_to IS NULL OR effective_to > ${asOfDate}::date)
        ORDER BY
          CASE WHEN tenant_id IS NOT NULL THEN 0 ELSE 1 END,
          effective_from DESC
        LIMIT 1
      `;
    });

    return rows.length > 0 ? rows[0]! : null;
  }

  /**
   * Create a tenant-specific NMW rate.
   */
  async createRate(
    tx: TransactionSql<Record<string, unknown>>,
    context: { tenantId: string; userId?: string },
    data: CreateNMWRate
  ): Promise<NMWRateRow> {
    const rows = await tx<NMWRateRow[]>`
      INSERT INTO app.nmw_rates (
        id, tenant_id, rate_name, age_from, age_to,
        hourly_rate, effective_from, effective_to,
        rate_type, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        ${data.rate_name},
        ${data.age_from},
        ${data.age_to ?? null},
        ${data.hourly_rate},
        ${data.effective_from}::date,
        ${data.effective_to ?? null}::date,
        ${data.rate_type}::app.nmw_rate_type,
        now()
      )
      RETURNING id, tenant_id, rate_name, age_from, age_to,
                hourly_rate, effective_from, effective_to,
                rate_type, created_at
    `;

    return rows[0]!;
  }

  // ===========================================================================
  // Employee Data Methods (for compliance checks)
  // ===========================================================================

  /**
   * Get a single employee's data for compliance checking.
   * Joins employees, current personal info (for DOB), current contract
   * (for hours), and current compensation (for salary).
   */
  async getEmployeeComplianceData(
    context: { tenantId: string; userId?: string },
    employeeId: string
  ): Promise<EmployeeComplianceData | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<EmployeeComplianceData[]>`
        SELECT
          e.id,
          e.tenant_id,
          e.employee_number,
          e.status,
          ep.first_name,
          ep.last_name,
          ep.date_of_birth,
          ch.base_salary,
          ch.pay_frequency,
          ec.working_hours_per_week
        FROM app.employees e
        LEFT JOIN app.employee_personal ep
          ON ep.employee_id = e.id
          AND ep.effective_to IS NULL
        LEFT JOIN app.compensation_history ch
          ON ch.employee_id = e.id
          AND ch.effective_to IS NULL
        LEFT JOIN app.employment_contracts ec
          ON ec.employee_id = e.id
          AND ec.effective_to IS NULL
        WHERE e.id = ${employeeId}::uuid
        LIMIT 1
      `;
    });

    return rows.length > 0 ? rows[0]! : null;
  }

  /**
   * Get all active employees' data for bulk compliance checking.
   */
  async getAllActiveEmployeesComplianceData(
    context: { tenantId: string; userId?: string }
  ): Promise<EmployeeComplianceData[]> {
    return await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EmployeeComplianceData[]>`
        SELECT
          e.id,
          e.tenant_id,
          e.employee_number,
          e.status,
          ep.first_name,
          ep.last_name,
          ep.date_of_birth,
          ch.base_salary,
          ch.pay_frequency,
          ec.working_hours_per_week
        FROM app.employees e
        LEFT JOIN app.employee_personal ep
          ON ep.employee_id = e.id
          AND ep.effective_to IS NULL
        LEFT JOIN app.compensation_history ch
          ON ch.employee_id = e.id
          AND ch.effective_to IS NULL
        LEFT JOIN app.employment_contracts ec
          ON ec.employee_id = e.id
          AND ec.effective_to IS NULL
        WHERE e.status IN ('active', 'on_leave')
        ORDER BY e.employee_number
      `;

      return rows as EmployeeComplianceData[];
    });
  }

  // ===========================================================================
  // Compliance Check Methods
  // ===========================================================================

  /**
   * Insert a compliance check record.
   */
  async insertComplianceCheck(
    tx: TransactionSql<Record<string, unknown>>,
    context: { tenantId: string; userId?: string },
    data: {
      employeeId: string;
      checkDate: string;
      employeeAge: number;
      applicableRate: number;
      actualHourlyRate: number;
      compliant: boolean;
      shortfall: number | null;
      checkedBy: string;
      notes: string | null;
    }
  ): Promise<ComplianceCheckRow> {
    const rows = await tx<ComplianceCheckRow[]>`
      INSERT INTO app.nmw_compliance_checks (
        id, tenant_id, employee_id, check_date, employee_age,
        applicable_rate, actual_hourly_rate, compliant,
        shortfall, checked_by, notes, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.checkDate}::date,
        ${data.employeeAge},
        ${data.applicableRate},
        ${data.actualHourlyRate},
        ${data.compliant},
        ${data.shortfall},
        ${data.checkedBy},
        ${data.notes},
        now()
      )
      RETURNING id, tenant_id, employee_id, check_date, employee_age,
                applicable_rate, actual_hourly_rate, compliant,
                shortfall, checked_by, notes, created_at
    `;

    return rows[0]!;
  }

  /**
   * Find compliance checks with optional filters and cursor-based pagination.
   * Joins employee data for display purposes.
   */
  async findComplianceChecks(
    context: { tenantId: string; userId?: string },
    filters: ComplianceReportFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<ComplianceCheckWithEmployeeRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<ComplianceCheckWithEmployeeRow[]>`
        SELECT
          cc.id, cc.tenant_id, cc.employee_id, cc.check_date,
          cc.employee_age, cc.applicable_rate, cc.actual_hourly_rate,
          cc.compliant, cc.shortfall, cc.checked_by, cc.notes,
          cc.created_at,
          CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name,
          e.employee_number
        FROM app.nmw_compliance_checks cc
        JOIN app.employees e ON e.id = cc.employee_id
        LEFT JOIN app.employee_personal ep
          ON ep.employee_id = cc.employee_id
          AND ep.effective_to IS NULL
        WHERE 1=1
          ${filters.date_from ? tx`AND cc.check_date >= ${filters.date_from}::date` : tx``}
          ${filters.date_to ? tx`AND cc.check_date <= ${filters.date_to}::date` : tx``}
          ${filters.compliant === "true" ? tx`AND cc.compliant = true` : tx``}
          ${filters.compliant === "false" ? tx`AND cc.compliant = false` : tx``}
          ${filters.employee_id ? tx`AND cc.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${cursor ? tx`AND cc.id < ${cursor}::uuid` : tx``}
        ORDER BY cc.check_date DESC, cc.created_at DESC, cc.id DESC
        LIMIT ${fetchLimit}
      `;

      return rows as ComplianceCheckWithEmployeeRow[];
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Get summary counts for compliance report.
   */
  async getComplianceSummary(
    context: { tenantId: string; userId?: string },
    filters: ComplianceReportFilters = {}
  ): Promise<{ totalChecks: number; compliantCount: number; nonCompliantCount: number }> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return await tx<Array<{ totalChecks: string; compliantCount: string; nonCompliantCount: string }>>`
        SELECT
          COUNT(*)::text AS total_checks,
          COUNT(*) FILTER (WHERE compliant = true)::text AS compliant_count,
          COUNT(*) FILTER (WHERE compliant = false)::text AS non_compliant_count
        FROM app.nmw_compliance_checks
        WHERE 1=1
          ${filters.date_from ? tx`AND check_date >= ${filters.date_from}::date` : tx``}
          ${filters.date_to ? tx`AND check_date <= ${filters.date_to}::date` : tx``}
          ${filters.compliant === "true" ? tx`AND compliant = true` : tx``}
          ${filters.compliant === "false" ? tx`AND compliant = false` : tx``}
          ${filters.employee_id ? tx`AND employee_id = ${filters.employee_id}::uuid` : tx``}
      `;
    });

    const row = rows[0];
    return {
      totalChecks: Number(row?.totalChecks || 0),
      compliantCount: Number(row?.compliantCount || 0),
      nonCompliantCount: Number(row?.nonCompliantCount || 0),
    };
  }
}
