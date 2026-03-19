/**
 * Manager Hierarchy Service
 *
 * Handles hierarchy queries: employee lookup, subordinate traversal,
 * direct reports, and subordinate checks.
 *
 * Extracted from manager.service.ts for reduced cognitive complexity.
 */

import type { DatabaseClient } from "../../plugins/db";
import type { TeamMemberSummary } from "./manager.schemas";
import type { TenantContext } from "./manager.types";

// =============================================================================
// Row Types
// =============================================================================

interface TeamMemberRow {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  photo_url: string | null;
  job_title: string | null;
  department: string | null;
  status: string;
  email: string | null;
  hire_date: string;
  depth: number;
}

// =============================================================================
// Hierarchy Service
// =============================================================================

export class ManagerHierarchyService {
  constructor(private db: DatabaseClient) {}

  /**
   * Get the current user's employee ID
   */
  async getCurrentEmployeeId(ctx: TenantContext): Promise<string | null> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        SELECT id
        FROM app.employees
        WHERE user_id = ${ctx.userId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND status IN ('active', 'on_leave')
        LIMIT 1
      `;
      return rows[0]?.id ?? null;
    });

    return result;
  }

  /**
   * Check if the current user is a manager (has any subordinates)
   */
  async isManager(ctx: TenantContext): Promise<boolean> {
    const employeeId = await this.getCurrentEmployeeId(ctx);
    if (!employeeId) return false;

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.manager_subordinates
          WHERE manager_id = ${employeeId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
        ) as exists
      `;
      return rows[0]?.exists === true;
    });

    return result;
  }

  /**
   * Get direct reports only
   */
  async getDirectReports(ctx: TenantContext): Promise<TeamMemberSummary[]> {
    const employeeId = await this.getCurrentEmployeeId(ctx);
    if (!employeeId) return [];

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<TeamMemberRow[]>`
        SELECT
          e.id,
          e.employee_number,
          ep.first_name,
          ep.last_name,
          ep.preferred_name,
          ep.photo_url,
          p.title as job_title,
          ou.name as department,
          e.status,
          ec.email,
          e.hire_date::text,
          ms.depth
        FROM app.manager_subordinates ms
        JOIN app.employees e ON e.id = ms.subordinate_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id
          AND pa.is_primary = true
          AND (pa.effective_to IS NULL OR pa.effective_to > now())
        LEFT JOIN app.positions p ON p.id = pa.position_id
        LEFT JOIN app.org_units ou ON ou.id = p.org_unit_id
        LEFT JOIN app.employee_contacts ec ON ec.employee_id = e.id
          AND ec.is_primary = true
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND ms.depth = 1
          AND e.status IN ('active', 'on_leave')
        ORDER BY ep.last_name, ep.first_name
      `;
    });

    return rows.map(mapTeamMemberRow);
  }

  /**
   * Get all subordinates (direct and indirect)
   */
  async getAllSubordinates(
    ctx: TenantContext,
    maxDepth: number = 10
  ): Promise<TeamMemberSummary[]> {
    const employeeId = await this.getCurrentEmployeeId(ctx);
    if (!employeeId) return [];

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<TeamMemberRow[]>`
        SELECT
          e.id,
          e.employee_number,
          ep.first_name,
          ep.last_name,
          ep.preferred_name,
          ep.photo_url,
          p.title as job_title,
          ou.name as department,
          e.status,
          ec.email,
          e.hire_date::text,
          ms.depth
        FROM app.manager_subordinates ms
        JOIN app.employees e ON e.id = ms.subordinate_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id
          AND pa.is_primary = true
          AND (pa.effective_to IS NULL OR pa.effective_to > now())
        LEFT JOIN app.positions p ON p.id = pa.position_id
        LEFT JOIN app.org_units ou ON ou.id = p.org_unit_id
        LEFT JOIN app.employee_contacts ec ON ec.employee_id = e.id
          AND ec.is_primary = true
        WHERE ms.manager_id = ${employeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND ms.depth <= ${maxDepth}
          AND e.status IN ('active', 'on_leave')
        ORDER BY ms.depth, ep.last_name, ep.first_name
      `;
    });

    return rows.map(mapTeamMemberRow);
  }

  /**
   * Get a specific team member (must be a subordinate)
   */
  async getTeamMember(
    ctx: TenantContext,
    employeeId: string
  ): Promise<TeamMemberSummary | null> {
    const managerEmployeeId = await this.getCurrentEmployeeId(ctx);
    if (!managerEmployeeId) return null;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx<TeamMemberRow[]>`
        SELECT
          e.id,
          e.employee_number,
          ep.first_name,
          ep.last_name,
          ep.preferred_name,
          ep.photo_url,
          p.title as job_title,
          ou.name as department,
          e.status,
          ec.email,
          e.hire_date::text,
          ms.depth
        FROM app.manager_subordinates ms
        JOIN app.employees e ON e.id = ms.subordinate_id
        LEFT JOIN app.employee_personal ep ON ep.employee_id = e.id
        LEFT JOIN app.position_assignments pa ON pa.employee_id = e.id
          AND pa.is_primary = true
          AND (pa.effective_to IS NULL OR pa.effective_to > now())
        LEFT JOIN app.positions p ON p.id = pa.position_id
        LEFT JOIN app.org_units ou ON ou.id = p.org_unit_id
        LEFT JOIN app.employee_contacts ec ON ec.employee_id = e.id
          AND ec.is_primary = true
        WHERE ms.manager_id = ${managerEmployeeId}::uuid
          AND ms.tenant_id = ${ctx.tenantId}::uuid
          AND ms.subordinate_id = ${employeeId}::uuid
        LIMIT 1
      `;
    });

    return rows.length > 0 ? mapTeamMemberRow(rows[0]) : null;
  }

  /**
   * Check if an employee is a subordinate of the current user
   */
  async isSubordinateOf(
    ctx: TenantContext,
    employeeId: string
  ): Promise<boolean> {
    const managerEmployeeId = await this.getCurrentEmployeeId(ctx);
    if (!managerEmployeeId) return false;

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ result: boolean }[]>`
        SELECT app.is_subordinate_of(
          ${employeeId}::uuid,
          ${managerEmployeeId}::uuid
        ) as result
      `;
      return rows[0]?.result ?? false;
    });

    return result;
  }
}

// =============================================================================
// Shared Row Mapper
// =============================================================================

export function mapTeamMemberRow(row: TeamMemberRow): TeamMemberSummary {
  return {
    id: row.id,
    employeeNumber: row.employee_number,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredName: row.preferred_name,
    photoUrl: row.photo_url,
    jobTitle: row.job_title,
    department: row.department,
    status: row.status,
    email: row.email,
    hireDate: row.hire_date,
    depth: row.depth,
  };
}
