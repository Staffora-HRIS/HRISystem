/**
 * Contract End Date Report - Repository Layer
 *
 * Data access for the contract end date reporting endpoint.
 * Queries employment_contracts, employees, employee_personal,
 * position_assignments, and org_units with RLS via tagged template SQL.
 */

import type { TransactionSql, Row } from "../../plugins/db";

// =============================================================================
// Types
// =============================================================================

export interface ContractEndDateRow extends Row {
  contractId: string;
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  contractType: string;
  contractEndDate: string;
  daysRemaining: number;
  departmentId: string | null;
  departmentName: string | null;
}

export interface ContractEndDateParams {
  daysAhead: number;
  contractType?: string;
  departmentId?: string;
  cursor?: { endDate: string; contractId: string };
  limit: number;
}

// =============================================================================
// Repository
// =============================================================================

export async function getContractsEndingSoon(
  tx: TransactionSql,
  params: ContractEndDateParams
): Promise<{ rows: ContractEndDateRow[]; total: number }> {
  const { daysAhead, contractType, departmentId, cursor, limit } = params;

  // Count total matching records (unaffected by pagination)
  const [countResult] = await tx`
    SELECT COUNT(*)::int AS total
    FROM employment_contracts ec
    INNER JOIN employees e ON ec.employee_id = e.id
    ${departmentId
      ? tx`INNER JOIN position_assignments pa
            ON pa.employee_id = e.id
            AND pa.is_primary = true
            AND pa.effective_to IS NULL`
      : tx``}
    WHERE ec.contract_type IN ('fixed_term', 'contractor', 'intern', 'temporary')
      AND ec.effective_to IS NOT NULL
      AND ec.effective_to >= CURRENT_DATE
      AND ec.effective_to <= CURRENT_DATE + ${daysAhead}
      AND e.status IN ('active', 'on_leave')
      ${contractType ? tx`AND ec.contract_type = ${contractType}` : tx``}
      ${departmentId ? tx`AND pa.org_unit_id = ${departmentId}` : tx``}
  ` as { total: number }[];

  const total = countResult?.total ?? 0;

  // Fetch paginated rows with cursor-based pagination
  const rows = await tx`
    SELECT
      ec.id AS contract_id,
      ec.employee_id,
      e.employee_number,
      ep.first_name,
      ep.last_name,
      ec.contract_type,
      ec.effective_to AS contract_end_date,
      (ec.effective_to - CURRENT_DATE)::int AS days_remaining,
      pa_dept.org_unit_id AS department_id,
      ou.name AS department_name
    FROM employment_contracts ec
    INNER JOIN employees e ON ec.employee_id = e.id
    LEFT JOIN employee_personal ep
      ON ep.employee_id = e.id
      AND ep.effective_to IS NULL
    LEFT JOIN position_assignments pa_dept
      ON pa_dept.employee_id = e.id
      AND pa_dept.is_primary = true
      AND pa_dept.effective_to IS NULL
    LEFT JOIN org_units ou
      ON ou.id = pa_dept.org_unit_id
    WHERE ec.contract_type IN ('fixed_term', 'contractor', 'intern', 'temporary')
      AND ec.effective_to IS NOT NULL
      AND ec.effective_to >= CURRENT_DATE
      AND ec.effective_to <= CURRENT_DATE + ${daysAhead}
      AND e.status IN ('active', 'on_leave')
      ${contractType ? tx`AND ec.contract_type = ${contractType}` : tx``}
      ${departmentId ? tx`AND pa_dept.org_unit_id = ${departmentId}` : tx``}
      ${cursor
        ? tx`AND (ec.effective_to, ec.id) > (${cursor.endDate}::date, ${cursor.contractId}::uuid)`
        : tx``}
    ORDER BY ec.effective_to ASC, ec.id ASC
    LIMIT ${limit}
  ` as ContractEndDateRow[];

  return { rows, total };
}
