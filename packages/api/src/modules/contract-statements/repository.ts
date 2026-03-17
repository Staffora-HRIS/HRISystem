/**
 * Contract Statements Module - Repository Layer
 *
 * Provides data access methods for contract statement entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * Pulls employee, position, contract, and org unit data to populate
 * the legally required statement content. Explicit column lists
 * throughout to avoid SELECT * anti-pattern.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  StatementFilters,
  AllStatementsFilters,
  PaginationQuery,
  StatementContent,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

/**
 * Database row for contract_statements
 */
export interface ContractStatementRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  contractId: string;
  statementType: string;
  generatedAt: Date;
  generatedBy: string;
  templateId: string | null;
  content: StatementContent;
  pdfFileKey: string | null;
  issuedAt: Date | null;
  acknowledgedAt: Date | null;
  acknowledgedByEmployee: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Statement list row with joined employee name
 */
export interface StatementListRow extends Row {
  id: string;
  employeeId: string;
  contractId: string;
  statementType: string;
  generatedAt: Date;
  issuedAt: Date | null;
  acknowledgedAt: Date | null;
  acknowledgedByEmployee: boolean;
  employeeName: string | null;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Employee data gathering types
// =============================================================================

/**
 * Row returned when gathering employee data for statement generation
 */
export interface EmployeeDataRow extends Row {
  employeeId: string;
  employeeNumber: string;
  hireDate: Date;
  status: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
}

export interface ContractDataRow extends Row {
  id: string;
  employeeId: string;
  contractType: string;
  employmentType: string;
  fte: string;
  workingHoursPerWeek: string | null;
  probationEndDate: Date | null;
  noticePeriodDays: number | null;
  effectiveFrom: Date;
}

export interface PositionDataRow extends Row {
  positionId: string;
  positionTitle: string;
  positionDescription: string | null;
  orgUnitId: string;
  orgUnitName: string;
  orgUnitCode: string;
  jobGrade: string | null;
}

export interface CompensationDataRow extends Row {
  baseSalary: string;
  currency: string;
  payFrequency: string;
  effectiveFrom: Date;
}

export interface AddressRow extends Row {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  county: string | null;
  postcode: string | null;
  country: string;
}

export interface LeaveBalanceRow extends Row {
  openingBalance: string;
  accrued: string;
  adjustments: string;
}

/**
 * Row returned for compliance status reporting
 */
export interface ComplianceEmployeeRow extends Row {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  hireDate: Date;
  status: string;
  hasDayOneStatement: boolean;
  statementIssuedAt: Date | null;
  statementAcknowledged: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class ContractStatementsRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Statement CRUD
  // ---------------------------------------------------------------------------

  /**
   * Insert a new contract statement with version tracking
   */
  async create(
    tx: TransactionSql,
    data: {
      tenantId: string;
      employeeId: string;
      contractId: string;
      statementType: string;
      generatedBy: string;
      templateId?: string | null;
      content: StatementContent;
    }
  ): Promise<ContractStatementRow[]> {
    // Determine version number: count existing statements for this employee+contract
    const versionRows = await tx<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM contract_statements
      WHERE employee_id = ${data.employeeId}
        AND contract_id = ${data.contractId}
    `;
    const nextVersion = parseInt(versionRows[0]?.count || "0", 10) + 1;

    return await tx<ContractStatementRow[]>`
      INSERT INTO contract_statements (
        tenant_id, employee_id, contract_id,
        statement_type, generated_by, template_id,
        content, generated_at
      ) VALUES (
        ${data.tenantId}, ${data.employeeId}, ${data.contractId},
        ${data.statementType}, ${data.generatedBy}, ${data.templateId || null},
        ${JSON.stringify(data.content)}::jsonb, now()
      )
      RETURNING
        id, tenant_id, employee_id, contract_id,
        statement_type, generated_at, generated_by, template_id,
        content, pdf_file_key, issued_at, acknowledged_at,
        acknowledged_by_employee,
        ${nextVersion}::int AS version,
        created_at, updated_at
    `;
  }

  /**
   * Find statement by ID with explicit column list
   */
  async findById(
    tx: TransactionSql,
    id: string
  ): Promise<ContractStatementRow | null> {
    const rows = await tx<ContractStatementRow[]>`
      SELECT
        cs.id, cs.tenant_id, cs.employee_id, cs.contract_id,
        cs.statement_type, cs.generated_at, cs.generated_by, cs.template_id,
        cs.content, cs.pdf_file_key, cs.issued_at, cs.acknowledged_at,
        cs.acknowledged_by_employee, cs.created_at, cs.updated_at,
        (
          SELECT COUNT(*)::int
          FROM contract_statements cs2
          WHERE cs2.employee_id = cs.employee_id
            AND cs2.contract_id = cs.contract_id
            AND cs2.generated_at <= cs.generated_at
        ) AS version
      FROM contract_statements cs
      WHERE cs.id = ${id}
    `;
    return rows[0] || null;
  }

  /**
   * List statements for a specific employee with cursor-based pagination
   */
  async listByEmployee(
    tx: TransactionSql,
    employeeId: string,
    filters: StatementFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<StatementListRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    const rows = await tx<StatementListRow[]>`
      SELECT
        cs.id,
        cs.employee_id,
        cs.contract_id,
        cs.statement_type,
        cs.generated_at,
        cs.issued_at,
        cs.acknowledged_at,
        cs.acknowledged_by_employee,
        CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name
      FROM contract_statements cs
      LEFT JOIN employee_personal ep
        ON ep.employee_id = cs.employee_id AND ep.effective_to IS NULL
      WHERE cs.employee_id = ${employeeId}
        ${pagination.cursor ? tx`AND cs.id < ${pagination.cursor}` : tx``}
        ${filters.statement_type ? tx`AND cs.statement_type = ${filters.statement_type}` : tx``}
        ${filters.issued === true ? tx`AND cs.issued_at IS NOT NULL` : tx``}
        ${filters.issued === false ? tx`AND cs.issued_at IS NULL` : tx``}
        ${filters.acknowledged === true ? tx`AND cs.acknowledged_by_employee = true` : tx``}
        ${filters.acknowledged === false ? tx`AND cs.acknowledged_by_employee = false` : tx``}
      ORDER BY cs.generated_at DESC, cs.id DESC
      LIMIT ${fetchLimit}
    `;

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id || null : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * List all statements across the tenant with cursor-based pagination
   * and optional filters (employee_id, statement_type, issued, acknowledged).
   */
  async listAll(
    tx: TransactionSql,
    filters: AllStatementsFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<StatementListRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    const rows = await tx<StatementListRow[]>`
      SELECT
        cs.id,
        cs.employee_id,
        cs.contract_id,
        cs.statement_type,
        cs.generated_at,
        cs.issued_at,
        cs.acknowledged_at,
        cs.acknowledged_by_employee,
        CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name
      FROM contract_statements cs
      LEFT JOIN employee_personal ep
        ON ep.employee_id = cs.employee_id AND ep.effective_to IS NULL
      WHERE 1=1
        ${filters.employee_id ? tx`AND cs.employee_id = ${filters.employee_id}` : tx``}
        ${pagination.cursor ? tx`AND cs.id < ${pagination.cursor}` : tx``}
        ${filters.statement_type ? tx`AND cs.statement_type = ${filters.statement_type}` : tx``}
        ${filters.issued === true ? tx`AND cs.issued_at IS NOT NULL` : tx``}
        ${filters.issued === false ? tx`AND cs.issued_at IS NULL` : tx``}
        ${filters.acknowledged === true ? tx`AND cs.acknowledged_by_employee = true` : tx``}
        ${filters.acknowledged === false ? tx`AND cs.acknowledged_by_employee = false` : tx``}
      ORDER BY cs.generated_at DESC, cs.id DESC
      LIMIT ${fetchLimit}
    `;

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id || null : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Mark a statement as issued
   */
  async markIssued(
    tx: TransactionSql,
    id: string,
    issuedAt: Date
  ): Promise<ContractStatementRow | null> {
    const rows = await tx<ContractStatementRow[]>`
      UPDATE contract_statements
      SET issued_at = ${issuedAt.toISOString()},
          updated_at = now()
      WHERE id = ${id}
        AND issued_at IS NULL
      RETURNING
        id, tenant_id, employee_id, contract_id,
        statement_type, generated_at, generated_by, template_id,
        content, pdf_file_key, issued_at, acknowledged_at,
        acknowledged_by_employee, created_at, updated_at
    `;
    return rows[0] || null;
  }

  /**
   * Mark a statement as acknowledged by the employee
   */
  async markAcknowledged(
    tx: TransactionSql,
    id: string,
    acknowledgedAt: Date
  ): Promise<ContractStatementRow | null> {
    const rows = await tx<ContractStatementRow[]>`
      UPDATE contract_statements
      SET acknowledged_by_employee = true,
          acknowledged_at = ${acknowledgedAt.toISOString()},
          updated_at = now()
      WHERE id = ${id}
        AND issued_at IS NOT NULL
        AND acknowledged_by_employee = false
      RETURNING
        id, tenant_id, employee_id, contract_id,
        statement_type, generated_at, generated_by, template_id,
        content, pdf_file_key, issued_at, acknowledged_at,
        acknowledged_by_employee, created_at, updated_at
    `;
    return rows[0] || null;
  }

  // ---------------------------------------------------------------------------
  // Employee data gathering for statement generation
  // ---------------------------------------------------------------------------

  /**
   * Fetch the core employee record with personal details
   */
  async getEmployeeData(
    tx: TransactionSql,
    employeeId: string
  ): Promise<EmployeeDataRow | null> {
    const rows = await tx<EmployeeDataRow[]>`
      SELECT
        e.id AS employee_id,
        e.employee_number,
        e.hire_date,
        e.status,
        ep.first_name,
        ep.last_name,
        ep.middle_name
      FROM employees e
      LEFT JOIN employee_personal ep
        ON ep.employee_id = e.id AND ep.effective_to IS NULL
      WHERE e.id = ${employeeId}
    `;
    return rows[0] || null;
  }

  /**
   * Fetch a specific contract record by ID
   */
  async getContractData(
    tx: TransactionSql,
    contractId: string
  ): Promise<ContractDataRow | null> {
    const rows = await tx<ContractDataRow[]>`
      SELECT
        ec.id,
        ec.employee_id,
        ec.contract_type,
        ec.employment_type,
        ec.fte,
        ec.working_hours_per_week,
        ec.probation_end_date,
        ec.notice_period_days,
        ec.effective_from
      FROM employment_contracts ec
      WHERE ec.id = ${contractId}
    `;
    return rows[0] || null;
  }

  /**
   * Fetch the current effective contract for an employee.
   * Used when no specific contract_id is provided in the generate request.
   */
  async getCurrentContract(
    tx: TransactionSql,
    employeeId: string
  ): Promise<ContractDataRow | null> {
    const rows = await tx<ContractDataRow[]>`
      SELECT
        ec.id,
        ec.employee_id,
        ec.contract_type,
        ec.employment_type,
        ec.fte,
        ec.working_hours_per_week,
        ec.probation_end_date,
        ec.notice_period_days,
        ec.effective_from
      FROM employment_contracts ec
      WHERE ec.employee_id = ${employeeId}
        AND ec.effective_to IS NULL
      ORDER BY ec.effective_from DESC
      LIMIT 1
    `;
    return rows[0] || null;
  }

  /**
   * Fetch the current primary position assignment for an employee
   */
  async getPositionData(
    tx: TransactionSql,
    employeeId: string
  ): Promise<PositionDataRow | null> {
    const rows = await tx<PositionDataRow[]>`
      SELECT
        p.id AS position_id,
        p.title AS position_title,
        p.description AS position_description,
        ou.id AS org_unit_id,
        ou.name AS org_unit_name,
        ou.code AS org_unit_code,
        p.job_grade
      FROM position_assignments pa
      INNER JOIN positions p ON p.id = pa.position_id
      INNER JOIN org_units ou ON ou.id = pa.org_unit_id
      WHERE pa.employee_id = ${employeeId}
        AND pa.is_primary = true
        AND pa.effective_to IS NULL
      LIMIT 1
    `;
    return rows[0] || null;
  }

  /**
   * Fetch the current compensation for an employee
   */
  async getCompensationData(
    tx: TransactionSql,
    employeeId: string
  ): Promise<CompensationDataRow | null> {
    const rows = await tx<CompensationDataRow[]>`
      SELECT
        ch.base_salary,
        ch.currency,
        ch.pay_frequency,
        ch.effective_from
      FROM compensation_history ch
      WHERE ch.employee_id = ${employeeId}
        AND ch.effective_to IS NULL
      ORDER BY ch.effective_from DESC
      LIMIT 1
    `;
    return rows[0] || null;
  }

  /**
   * Fetch the employee's home address
   */
  async getEmployeeAddress(
    tx: TransactionSql,
    employeeId: string
  ): Promise<AddressRow | null> {
    const rows = await tx<AddressRow[]>`
      SELECT
        address_line_1,
        address_line_2,
        city,
        county,
        postcode,
        country
      FROM employee_addresses
      WHERE employee_id = ${employeeId}
        AND address_type = 'home'
        AND is_primary = true
      LIMIT 1
    `;
    return rows[0] || null;
  }

  /**
   * Fetch the tenant (employer) details.
   * Must be called within system context since tenants table has no RLS tenant_id.
   */
  async getTenantData(
    tx: TransactionSql,
    tenantId: string
  ): Promise<{ name: string; settings: Record<string, unknown> } | null> {
    const rows = await tx<
      { name: string; settings: Record<string, unknown> }[]
    >`
      SELECT name, settings
      FROM tenants
      WHERE id = ${tenantId}
    `;
    return rows[0] || null;
  }

  /**
   * Fetch annual leave balance for the current year (holiday entitlement)
   */
  async getAnnualLeaveBalance(
    tx: TransactionSql,
    employeeId: string,
    currentYear: number
  ): Promise<LeaveBalanceRow | null> {
    const rows = await tx<LeaveBalanceRow[]>`
      SELECT
        lb.opening_balance,
        lb.accrued,
        lb.adjustments
      FROM leave_balances lb
      INNER JOIN leave_types lt ON lt.id = lb.leave_type_id
      WHERE lb.employee_id = ${employeeId}
        AND lt.code = 'ANNUAL'
        AND lb.year = ${currentYear}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  // ---------------------------------------------------------------------------
  // Compliance reporting
  // ---------------------------------------------------------------------------

  /**
   * Get all active employees with their section_1 statement status.
   * Returns employees who have started on or after 6 April 2020 (the legal
   * requirement date) along with whether they have a day-one statement.
   */
  async getComplianceData(
    tx: TransactionSql
  ): Promise<ComplianceEmployeeRow[]> {
    return await tx<ComplianceEmployeeRow[]>`
      SELECT
        e.id AS employee_id,
        e.employee_number,
        ep.first_name,
        ep.last_name,
        e.hire_date,
        e.status,
        CASE WHEN cs.id IS NOT NULL THEN true ELSE false END AS has_day_one_statement,
        cs.issued_at AS statement_issued_at,
        COALESCE(cs.acknowledged_by_employee, false) AS statement_acknowledged
      FROM employees e
      LEFT JOIN employee_personal ep
        ON ep.employee_id = e.id AND ep.effective_to IS NULL
      LEFT JOIN LATERAL (
        SELECT cs2.id, cs2.issued_at, cs2.acknowledged_by_employee
        FROM contract_statements cs2
        WHERE cs2.employee_id = e.id
          AND cs2.statement_type = 'section_1'
        ORDER BY cs2.generated_at DESC
        LIMIT 1
      ) cs ON true
      WHERE e.status IN ('active', 'pending', 'on_leave')
      ORDER BY
        CASE WHEN cs.id IS NULL THEN 0 ELSE 1 END,
        e.hire_date ASC
    `;
  }

  /**
   * Count active employees for the tenant (for compliance percentage)
   */
  async getActiveEmployeeCount(
    tx: TransactionSql
  ): Promise<number> {
    const rows = await tx<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM employees
      WHERE status IN ('active', 'pending', 'on_leave')
    `;
    return parseInt(rows[0]?.count || "0", 10);
  }

  // ---------------------------------------------------------------------------
  // Outbox
  // ---------------------------------------------------------------------------

  /**
   * Write a domain outbox event in the same transaction
   */
  async writeOutboxEvent(
    tx: TransactionSql,
    data: {
      tenantId: string;
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      ) VALUES (
        ${crypto.randomUUID()}, ${data.tenantId}, ${data.aggregateType},
        ${data.aggregateId}, ${data.eventType},
        ${JSON.stringify(data.payload)}::jsonb, now()
      )
    `;
  }
}
