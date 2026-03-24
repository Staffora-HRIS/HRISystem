/**
 * Core HR Module - Employee Org Chart & History Service
 *
 * Implements business logic for organizational chart visualization,
 * direct reports, reporting chain traversal, and employee history
 * across all effective-dated dimensions.
 */

import type { DatabaseClient } from "../../plugins/db";
import type { HRRepository } from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  HistoryDimension,
  HistoryRecord,
} from "./schemas";

// =============================================================================
// Employee Org Chart & History Service
// =============================================================================

export class EmployeeOrgChartService {
  constructor(
    private repository: HRRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // History Methods
  // ===========================================================================

  /**
   * Get employee history for a dimension
   */
  async getEmployeeHistory(
    context: TenantContext,
    employeeId: string,
    dimension: HistoryDimension,
    dateRange?: { from?: string; to?: string }
  ): Promise<ServiceResult<HistoryRecord[]>> {
    // Validate employee exists
    const employeeResult = await this.repository.findEmployeeById(context, employeeId);
    if (!employeeResult.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    let records: HistoryRecord[];

    switch (dimension) {
      case "personal": {
        const history = await this.repository.getEmployeePersonalHistory(
          context,
          employeeId,
          dateRange
        );
        records = history.map((r) => ({
          id: r.id,
          effective_from: r.effectiveFrom.toISOString().split("T")[0]!,
          effective_to: r.effectiveTo?.toISOString().split("T")[0] || null,
          data: {
            first_name: r.firstName,
            middle_name: r.middleName,
            last_name: r.lastName,
            preferred_name: r.preferredName,
            date_of_birth: r.dateOfBirth?.toISOString().split("T")[0] || null,
            gender: r.gender,
            marital_status: r.maritalStatus,
            nationality: r.nationality,
          },
          created_at: r.createdAt.toISOString(),
          created_by: r.createdBy,
        }));
        break;
      }
      case "contract": {
        const history = await this.repository.getEmployeeContractHistory(
          context,
          employeeId,
          dateRange
        );
        records = history.map((r) => ({
          id: r.id,
          effective_from: r.effectiveFrom.toISOString().split("T")[0]!,
          effective_to: r.effectiveTo?.toISOString().split("T")[0] || null,
          data: {
            contract_type: r.contractType,
            employment_type: r.employmentType,
            fte: parseFloat(r.fte),
            working_hours_per_week: r.workingHoursPerWeek ? parseFloat(r.workingHoursPerWeek) : null,
            probation_end_date: r.probationEndDate?.toISOString().split("T")[0] || null,
            notice_period_days: r.noticePeriodDays,
          },
          created_at: r.createdAt.toISOString(),
          created_by: r.createdBy,
        }));
        break;
      }
      case "position": {
        const history = await this.repository.getEmployeePositionHistory(
          context,
          employeeId,
          dateRange
        );
        records = history.map((r) => ({
          id: r.id,
          effective_from: r.effectiveFrom.toISOString().split("T")[0]!,
          effective_to: r.effectiveTo?.toISOString().split("T")[0] || null,
          data: {
            position_id: r.positionId,
            position_code: r.positionCode,
            position_title: r.positionTitle,
            org_unit_id: r.orgUnitId,
            org_unit_name: r.orgUnitName,
            job_grade: r.jobGrade,
            is_primary: r.isPrimary,
            assignment_reason: r.assignmentReason,
          },
          created_at: r.createdAt.toISOString(),
          created_by: r.createdBy,
        }));
        break;
      }
      case "compensation": {
        const history = await this.repository.getEmployeeCompensationHistory(
          context,
          employeeId,
          dateRange
        );
        records = history.map((r) => ({
          id: r.id,
          effective_from: r.effectiveFrom.toISOString().split("T")[0]!,
          effective_to: r.effectiveTo?.toISOString().split("T")[0] || null,
          data: {
            base_salary: parseFloat(r.baseSalary),
            currency: r.currency,
            pay_frequency: r.payFrequency,
            change_reason: r.changeReason,
            change_percentage: r.changePercentage ? parseFloat(r.changePercentage) : null,
            approved_by: r.approvedBy,
            approved_at: r.approvedAt?.toISOString() || null,
          },
          created_at: r.createdAt.toISOString(),
          created_by: r.createdBy,
        }));
        break;
      }
      case "manager": {
        const history = await this.repository.getEmployeeManagerHistory(
          context,
          employeeId,
          dateRange
        );
        records = history.map((r) => ({
          id: r.id,
          effective_from: r.effectiveFrom.toISOString().split("T")[0]!,
          effective_to: r.effectiveTo?.toISOString().split("T")[0] || null,
          data: {
            manager_id: r.managerId,
            manager_number: r.managerNumber,
            manager_name: r.managerName,
            is_primary: r.isPrimary,
            relationship_type: r.relationshipType,
          },
          created_at: r.createdAt.toISOString(),
          created_by: r.createdBy,
        }));
        break;
      }
      case "status": {
        const history = await this.repository.getEmployeeStatusHistory(
          context,
          employeeId,
          dateRange
        );
        records = history.map((r) => ({
          id: r.id,
          effective_from: r.effectiveDate.toISOString().split("T")[0]!,
          effective_to: null,
          data: {
            from_status: r.fromStatus,
            to_status: r.toStatus,
            reason: r.reason,
          },
          created_at: r.createdAt.toISOString(),
          created_by: r.createdBy,
        }));
        break;
      }
      default:
        return {
          success: false,
          error: {
            code: "INVALID_DIMENSION",
            message: "Invalid history dimension",
            details: { dimension },
          },
        };
    }

    return {
      success: true,
      data: records,
    };
  }

  // ===========================================================================
  // Org Chart Methods
  // ===========================================================================

  /**
   * Get org chart data for visualization
   */
  async getOrgChart(
    context: TenantContext,
    rootEmployeeId?: string
  ): Promise<ServiceResult<{
    nodes: Array<{
      id: string;
      employee_id: string;
      name: string;
      title?: string;
      department?: string;
      photo_url?: string;
      manager_id?: string;
      level: number;
      direct_reports_count: number;
    }>;
    edges: Array<{
      from: string;
      to: string;
    }>;
  }>> {
    const nodes: Array<{
      id: string;
      employee_id: string;
      name: string;
      title?: string;
      department?: string;
      photo_url?: string;
      manager_id?: string;
      level: number;
      direct_reports_count: number;
    }> = [];
    const edges: Array<{ from: string; to: string }> = [];

    // Query org chart data
    const rows = await this.db.withTransaction(context, async (tx: any) => {
      return tx`
        WITH RECURSIVE org_tree AS (
          -- Base case: root employees (no manager or specific root)
          SELECT
            e.id,
            e.employee_number,
            ep.first_name,
            ep.last_name,
            p.title as position_title,
            ou.name as org_unit_name,
            NULL::uuid as manager_id,
            0 as level
          FROM app.employees e
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.effective_to IS NULL AND pa.is_primary = true
          LEFT JOIN app.positions p ON pa.position_id = p.id
          LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
          LEFT JOIN app.reporting_lines rl ON rl.employee_id = e.id AND rl.effective_to IS NULL AND rl.is_primary = true
          WHERE e.tenant_id = ${context.tenantId}::uuid
            AND e.status IN ('active', 'on_leave')
            ${rootEmployeeId
              ? tx`AND e.id = ${rootEmployeeId}::uuid`
              : tx`AND rl.manager_id IS NULL`}

          UNION ALL

          -- Recursive case: direct reports
          SELECT
            e.id,
            e.employee_number,
            ep.first_name,
            ep.last_name,
            p.title as position_title,
            ou.name as org_unit_name,
            rl.manager_id,
            ot.level + 1
          FROM app.employees e
          INNER JOIN app.reporting_lines rl ON rl.employee_id = e.id AND rl.effective_to IS NULL AND rl.is_primary = true
          INNER JOIN org_tree ot ON rl.manager_id = ot.id
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.effective_to IS NULL AND pa.is_primary = true
          LEFT JOIN app.positions p ON pa.position_id = p.id
          LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
          WHERE e.status IN ('active', 'on_leave')
            AND ot.level < 10
        ),
        report_counts AS (
          SELECT
            rl.manager_id,
            COUNT(*)::int as direct_reports_count
          FROM app.reporting_lines rl
          INNER JOIN app.employees e ON rl.employee_id = e.id
          WHERE rl.effective_to IS NULL
            AND rl.is_primary = true
            AND e.status IN ('active', 'on_leave')
          GROUP BY rl.manager_id
        )
        SELECT
          ot.id,
          ot.employee_number,
          ot.first_name,
          ot.last_name,
          ot.position_title,
          ot.org_unit_name,
          ot.manager_id,
          ot.level,
          COALESCE(rc.direct_reports_count, 0) as direct_reports_count
        FROM org_tree ot
        LEFT JOIN report_counts rc ON rc.manager_id = ot.id
        ORDER BY ot.level, ot.last_name
      `;
    });

    for (const row of rows) {
      nodes.push({
        id: row.id,
        employee_id: row.id,
        name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
        title: row.position_title || undefined,
        department: row.org_unit_name || undefined,
        photo_url: undefined,
        manager_id: row.manager_id || undefined,
        level: row.level,
        direct_reports_count: row.direct_reports_count,
      });

      if (row.manager_id) {
        edges.push({
          from: row.manager_id,
          to: row.id,
        });
      }
    }

    return {
      success: true,
      data: { nodes, edges },
    };
  }

  /**
   * Get direct reports for an employee
   */
  async getDirectReports(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<Array<{
    id: string;
    employee_id: string;
    name: string;
    title?: string;
    department?: string;
    photo_url?: string;
  }>>> {
    const employee = await this.repository.findEmployeeById(context, employeeId);
    if (!employee.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    const rows = await this.db.withTransaction(context, async (tx: any) => {
      return tx`
        SELECT
          e.id,
          ep.first_name,
          ep.last_name,
          p.title as position_title,
          ou.name as org_unit_name
        FROM app.employees e
        INNER JOIN app.reporting_lines rl ON rl.employee_id = e.id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.effective_to IS NULL
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.effective_to IS NULL AND pa.is_primary = true
        LEFT JOIN app.positions p ON pa.position_id = p.id
        LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
        WHERE rl.manager_id = ${employeeId}::uuid
          AND rl.effective_to IS NULL
          AND rl.is_primary = true
          AND e.status IN ('active', 'on_leave')
          AND e.tenant_id = ${context.tenantId}::uuid
        ORDER BY ep.last_name, ep.first_name
      `;
    });

    return {
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        employee_id: row.id,
        name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
        title: row.position_title || undefined,
        department: row.org_unit_name || undefined,
        photo_url: undefined,
      })),
    };
  }

  /**
   * Get reporting chain for an employee (up to CEO)
   */
  async getReportingChain(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<Array<{
    id: string;
    employee_id: string;
    name: string;
    title?: string;
    level: number;
  }>>> {
    const employee = await this.repository.findEmployeeById(context, employeeId);
    if (!employee.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id: employeeId },
        },
      };
    }

    const rows = await this.db.withTransaction(context, async (tx: any) => {
      return tx`
        WITH RECURSIVE chain AS (
          -- Start with the employee
          SELECT
            e.id,
            ep.first_name,
            ep.last_name,
            p.title as position_title,
            rl.manager_id,
            0 as level
          FROM app.employees e
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.effective_to IS NULL AND pa.is_primary = true
          LEFT JOIN app.positions p ON pa.position_id = p.id
          LEFT JOIN app.reporting_lines rl ON rl.employee_id = e.id AND rl.effective_to IS NULL AND rl.is_primary = true
          WHERE e.id = ${employeeId}::uuid
            AND e.tenant_id = ${context.tenantId}::uuid

          UNION ALL

          -- Walk up the chain
          SELECT
            e.id,
            ep.first_name,
            ep.last_name,
            p.title as position_title,
            rl.manager_id,
            c.level + 1
          FROM app.employees e
          INNER JOIN chain c ON c.manager_id = e.id
          LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id AND ep.effective_to IS NULL
          LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id AND pa.effective_to IS NULL AND pa.is_primary = true
          LEFT JOIN app.positions p ON pa.position_id = p.id
          LEFT JOIN app.reporting_lines rl ON rl.employee_id = e.id AND rl.effective_to IS NULL AND rl.is_primary = true
          WHERE c.level < 20
        )
        SELECT * FROM chain ORDER BY level
      `;
    });

    return {
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        employee_id: row.id,
        name: `${row.first_name || ""} ${row.last_name || ""}`.trim(),
        title: row.position_title || undefined,
        level: row.level,
      })),
    };
  }
}
