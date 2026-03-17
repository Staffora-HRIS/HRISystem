/**
 * Core HR Module - Repository Layer
 *
 * Provides data access methods for Core HR entities.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  CreateOrgUnit,
  UpdateOrgUnit,
  OrgUnitFilters,
  CreatePosition,
  UpdatePosition,
  PositionFilters,
  CreateEmployee,
  UpdateEmployeePersonal,
  UpdateEmployeeContract,
  UpdateEmployeePosition,
  UpdateEmployeeCompensation,
  UpdateEmployeeManager,
  EmployeeFilters,
  EmployeeStatus,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

/**
 * Database row types
 */
export interface OrgUnitRow extends Row {
  id: string;
  tenantId: string;
  parentId: string | null;
  code: string;
  name: string;
  description: string | null;
  level: number;
  path: string | null;
  managerPositionId: string | null;
  costCenterId: string | null;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PositionRow extends Row {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  description: string | null;
  orgUnitId: string | null;
  orgUnitName?: string;
  jobGrade: string | null;
  minSalary: string | null;
  maxSalary: string | null;
  currency: string;
  isManager: boolean;
  headcount: number;
  currentHeadcount?: number;
  reportsToPositionId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployeeRow extends Row {
  id: string;
  tenantId: string;
  employeeNumber: string;
  userId: string | null;
  status: EmployeeStatus;
  hireDate: Date;
  terminationDate: Date | null;
  terminationReason: string | null;
  niCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployeePersonalRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  createdAt: Date;
  createdBy: string | null;
}

export interface EmployeeContractRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  contractType: string;
  employmentType: string;
  fte: string;
  workingHoursPerWeek: string | null;
  probationEndDate: Date | null;
  noticePeriodDays: number | null;
  createdAt: Date;
  createdBy: string | null;
}

export interface PositionAssignmentRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  positionId: string;
  positionCode?: string;
  positionTitle?: string;
  orgUnitId: string;
  orgUnitName?: string;
  jobGrade?: string | null;
  isPrimary: boolean;
  assignmentReason: string | null;
  createdAt: Date;
  createdBy: string | null;
}

export interface ReportingLineRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  managerId: string;
  managerNumber?: string;
  managerName?: string;
  isPrimary: boolean;
  relationshipType: string;
  createdAt: Date;
  createdBy: string | null;
}

export interface CompensationRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  baseSalary: string;
  currency: string;
  payFrequency: string;
  changeReason: string | null;
  changePercentage: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
}

export interface StatusHistoryRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  fromStatus: string | null;
  toStatus: string;
  effectiveDate: Date;
  reason: string | null;
  createdAt: Date;
  createdBy: string | null;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// HR Repository
// =============================================================================

export class HRRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Stats
  // ===========================================================================

  async getStats(context: TenantContext): Promise<{
    total_employees: number;
    active_employees: number;
    departments: number;
    positions: number;
    pending_hires: number;
  }> {
    const [result] = await this.db.withTransaction(context, async (tx) => {
      return tx<any[]>`
        SELECT
          (SELECT COUNT(*) FROM app.employees WHERE tenant_id = ${context.tenantId}::uuid)::int as total_employees,
          (SELECT COUNT(*) FROM app.employees WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active')::int as active_employees,
          (SELECT COUNT(*) FROM app.org_units WHERE tenant_id = ${context.tenantId}::uuid AND is_active = true)::int as departments,
          (SELECT COUNT(*) FROM app.positions WHERE tenant_id = ${context.tenantId}::uuid AND is_active = true)::int as positions,
          (SELECT COUNT(*) FROM app.employees WHERE tenant_id = ${context.tenantId}::uuid AND status = 'pending')::int as pending_hires
      `;
    });

    return {
      total_employees: Number(result?.totalEmployees ?? 0),
      active_employees: Number(result?.activeEmployees ?? 0),
      departments: Number(result?.departments ?? 0),
      positions: Number(result?.positions ?? 0),
      pending_hires: Number(result?.pendingHires ?? 0),
    };
  }

  // ===========================================================================
  // Org Unit Methods
  // ===========================================================================

  /**
   * Find org units with filters and pagination
   */
  async findOrgUnits(
    context: TenantContext,
    filters: OrgUnitFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<OrgUnitRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1; // Fetch one extra to check hasMore

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<OrgUnitRow[]>`
        SELECT
          id, tenant_id, parent_id, code, name, description,
          level, path::text, manager_position_id, cost_center_id,
          is_active, effective_from, effective_to, created_at, updated_at
        FROM app.org_units
        WHERE 1=1
          ${filters.parent_id !== undefined ? tx`AND parent_id = ${filters.parent_id}::uuid` : tx``}
          ${filters.parent_id === null ? tx`AND parent_id IS NULL` : tx``}
          ${filters.is_active !== undefined ? tx`AND is_active = ${filters.is_active}` : tx``}
          ${filters.level !== undefined ? tx`AND level = ${filters.level}` : tx``}
          ${filters.search ? tx`AND (name ILIKE ${'%' + filters.search + '%'} OR code ILIKE ${'%' + filters.search + '%'})` : tx``}
          ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY level, name, id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find org unit by ID
   */
  async findOrgUnitById(
    context: TenantContext,
    id: string
  ): Promise<OrgUnitRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<OrgUnitRow[]>`
        SELECT
          id, tenant_id, parent_id, code, name, description,
          level, path::text, manager_position_id, cost_center_id,
          is_active, effective_from, effective_to, created_at, updated_at
        FROM app.org_units
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Find org unit by code
   */
  async findOrgUnitByCode(
    context: TenantContext,
    code: string
  ): Promise<OrgUnitRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<OrgUnitRow[]>`
        SELECT
          id, tenant_id, parent_id, code, name, description,
          level, path::text, manager_position_id, cost_center_id,
          is_active, effective_from, effective_to, created_at, updated_at
        FROM app.org_units
        WHERE code = ${code}
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Create org unit
   */
  async createOrgUnit(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateOrgUnit,
    createdBy: string
  ): Promise<OrgUnitRow> {
    const rows = await tx<OrgUnitRow[]>`
      INSERT INTO app.org_units (
        tenant_id, parent_id, code, name, description,
        manager_position_id, cost_center_id, effective_from
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.parent_id || null}::uuid,
        ${data.code},
        ${data.name},
        ${data.description || null},
        ${data.manager_position_id || null}::uuid,
        ${data.cost_center_id || null}::uuid,
        ${data.effective_from}::date
      )
      RETURNING
        id, tenant_id, parent_id, code, name, description,
        level, path::text, manager_position_id, cost_center_id,
        is_active, effective_from, effective_to, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update org unit
   */
  async updateOrgUnit(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateOrgUnit,
    updatedBy: string
  ): Promise<OrgUnitRow | null> {
    const rows = await tx<OrgUnitRow[]>`
      UPDATE app.org_units
      SET
        parent_id = COALESCE(${data.parent_id}::uuid, parent_id),
        code = COALESCE(${data.code}, code),
        name = COALESCE(${data.name}, name),
        description = COALESCE(${data.description}, description),
        manager_position_id = COALESCE(${data.manager_position_id}::uuid, manager_position_id),
        cost_center_id = COALESCE(${data.cost_center_id}::uuid, cost_center_id),
        is_active = COALESCE(${data.is_active}, is_active),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, parent_id, code, name, description,
        level, path::text, manager_position_id, cost_center_id,
        is_active, effective_from, effective_to, created_at, updated_at
    `;

    return rows[0] || null;
  }

  /**
   * Soft delete org unit
   */
  async deleteOrgUnit(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.org_units
      SET is_active = false, updated_at = now()
      WHERE id = ${id}::uuid
    `;

    return result.count > 0;
  }

  /**
   * Check if org unit has children
   */
  async orgUnitHasChildren(
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.org_units
          WHERE parent_id = ${id}::uuid AND is_active = true
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Check if org unit has employees
   */
  async orgUnitHasEmployees(
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.position_assignments pa
          INNER JOIN app.employees e ON pa.employee_id = e.id
          WHERE pa.org_unit_id = ${id}::uuid
            AND pa.effective_to IS NULL
            AND e.status IN ('active', 'on_leave')
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Get org unit hierarchy
   */
  async getOrgUnitHierarchy(
    context: TenantContext,
    rootId?: string
  ): Promise<OrgUnitRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      if (rootId) {
        const rows = await tx<OrgUnitRow[]>`
          SELECT
            id, tenant_id, parent_id, code, name, description,
            level, path::text, manager_position_id, cost_center_id,
            is_active, effective_from, effective_to, created_at, updated_at
          FROM app.get_org_unit_descendants(${rootId}::uuid)
          JOIN app.org_units USING (id)
        `;
        return rows;
      } else {
        const rows = await tx<OrgUnitRow[]>`
          SELECT
            id, tenant_id, parent_id, code, name, description,
            level, path::text, manager_position_id, cost_center_id,
            is_active, effective_from, effective_to, created_at, updated_at
          FROM app.org_units
          WHERE is_active = true
          ORDER BY level, name
        `;
        return rows;
      }
    });

    return result;
  }

  // ===========================================================================
  // Position Methods
  // ===========================================================================

  /**
   * Find positions with filters and pagination
   */
  async findPositions(
    context: TenantContext,
    filters: PositionFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<PositionRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<PositionRow[]>`
        SELECT
          p.id, p.tenant_id, p.code, p.title, p.description,
          p.org_unit_id, ou.name as org_unit_name, p.job_grade,
          p.min_salary::text, p.max_salary::text, p.currency,
          p.is_manager, p.headcount, p.reports_to_position_id,
          p.is_active, p.created_at, p.updated_at,
          (
            SELECT COUNT(*)
            FROM app.position_assignments pa
            INNER JOIN app.employees e ON pa.employee_id = e.id
            WHERE pa.position_id = p.id
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
          )::integer as current_headcount
        FROM app.positions p
        LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
        WHERE 1=1
          ${filters.org_unit_id ? tx`AND p.org_unit_id = ${filters.org_unit_id}::uuid` : tx``}
          ${filters.is_active !== undefined ? tx`AND p.is_active = ${filters.is_active}` : tx``}
          ${filters.is_manager !== undefined ? tx`AND p.is_manager = ${filters.is_manager}` : tx``}
          ${filters.job_grade ? tx`AND p.job_grade = ${filters.job_grade}` : tx``}
          ${filters.search ? tx`AND (p.title ILIKE ${'%' + filters.search + '%'} OR p.code ILIKE ${'%' + filters.search + '%'})` : tx``}
          ${cursor ? tx`AND p.id > ${cursor}::uuid` : tx``}
        ORDER BY p.title, p.id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find position by ID
   */
  async findPositionById(
    context: TenantContext,
    id: string
  ): Promise<PositionRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<PositionRow[]>`
        SELECT
          p.id, p.tenant_id, p.code, p.title, p.description,
          p.org_unit_id, ou.name as org_unit_name, p.job_grade,
          p.min_salary::text, p.max_salary::text, p.currency,
          p.is_manager, p.headcount, p.reports_to_position_id,
          p.is_active, p.created_at, p.updated_at,
          (
            SELECT COUNT(*)
            FROM app.position_assignments pa
            INNER JOIN app.employees e ON pa.employee_id = e.id
            WHERE pa.position_id = p.id
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
          )::integer as current_headcount
        FROM app.positions p
        LEFT JOIN app.org_units ou ON p.org_unit_id = ou.id
        WHERE p.id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Create position
   */
  async createPosition(
    tx: TransactionSql,
    context: TenantContext,
    data: CreatePosition,
    createdBy: string
  ): Promise<PositionRow> {
    const rows = await tx<PositionRow[]>`
      INSERT INTO app.positions (
        tenant_id, code, title, description, org_unit_id,
        job_grade, min_salary, max_salary, currency,
        is_manager, headcount, reports_to_position_id
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.code},
        ${data.title},
        ${data.description || null},
        ${data.org_unit_id}::uuid,
        ${data.job_grade || null},
        ${data.min_salary || null},
        ${data.max_salary || null},
        ${data.currency || 'GBP'},
        ${data.is_manager || false},
        ${data.headcount || 1},
        ${data.reports_to_position_id || null}::uuid
      )
      RETURNING
        id, tenant_id, code, title, description, org_unit_id,
        job_grade, min_salary::text, max_salary::text, currency,
        is_manager, headcount, reports_to_position_id,
        is_active, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update position
   */
  async updatePosition(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdatePosition,
    updatedBy: string
  ): Promise<PositionRow | null> {
    const rows = await tx<PositionRow[]>`
      UPDATE app.positions
      SET
        code = COALESCE(${data.code}, code),
        title = COALESCE(${data.title}, title),
        description = COALESCE(${data.description}, description),
        org_unit_id = COALESCE(${data.org_unit_id}::uuid, org_unit_id),
        job_grade = COALESCE(${data.job_grade}, job_grade),
        min_salary = COALESCE(${data.min_salary}, min_salary),
        max_salary = COALESCE(${data.max_salary}, max_salary),
        currency = COALESCE(${data.currency}, currency),
        is_manager = COALESCE(${data.is_manager}, is_manager),
        headcount = COALESCE(${data.headcount}, headcount),
        reports_to_position_id = COALESCE(${data.reports_to_position_id}::uuid, reports_to_position_id),
        is_active = COALESCE(${data.is_active}, is_active),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, code, title, description, org_unit_id,
        job_grade, min_salary::text, max_salary::text, currency,
        is_manager, headcount, reports_to_position_id,
        is_active, created_at, updated_at
    `;

    return rows[0] || null;
  }

  /**
   * Soft delete position
   */
  async deletePosition(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.positions
      SET is_active = false, updated_at = now()
      WHERE id = ${id}::uuid
    `;

    return result.count > 0;
  }

  /**
   * Check if position has active assignments
   */
  async positionHasActiveAssignments(
    context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.position_assignments pa
          INNER JOIN app.employees e ON pa.employee_id = e.id
          WHERE pa.position_id = ${id}::uuid
            AND pa.effective_to IS NULL
            AND e.status IN ('active', 'on_leave')
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Get position headcount
   */
  async getPositionHeadcount(
    context: TenantContext,
    positionId: string
  ): Promise<{ headcount: number; currentCount: number }> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ headcount: number; currentCount: string }[]>`
        SELECT
          p.headcount,
          (
            SELECT COUNT(*)
            FROM app.position_assignments pa
            INNER JOIN app.employees e ON pa.employee_id = e.id
            WHERE pa.position_id = p.id
              AND pa.effective_to IS NULL
              AND e.status IN ('active', 'on_leave')
          )::text as current_count
        FROM app.positions p
        WHERE p.id = ${positionId}::uuid
      `;
      return rows;
    });

    const row = result[0];
    return {
      headcount: row?.headcount || 0,
      currentCount: parseInt(row?.currentCount || "0", 10),
    };
  }

  // ===========================================================================
  // Employee Methods
  // ===========================================================================

  /**
   * Find employees with filters and pagination
   */
  async findEmployees(
    context: TenantContext,
    filters: EmployeeFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<EmployeeRow & { fullName: string; displayName: string; positionTitle: string | null; orgUnitName: string | null; managerName: string | null }>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<(EmployeeRow & { fullName: string; displayName: string; positionTitle: string | null; orgUnitName: string | null; managerName: string | null })[]>`
        SELECT
          e.id, e.tenant_id, e.employee_number, e.user_id,
          e.status, e.hire_date, e.termination_date, e.termination_reason,
          e.created_at, e.updated_at,
          app.get_employee_full_name(e.id) as full_name,
          app.get_employee_display_name(e.id) as display_name,
          (SELECT p.title FROM app.position_assignments pa
           JOIN app.positions p ON pa.position_id = p.id
           WHERE pa.employee_id = e.id AND pa.is_primary = true AND pa.effective_to IS NULL
           LIMIT 1) as position_title,
          (SELECT ou.name FROM app.position_assignments pa
           JOIN app.org_units ou ON pa.org_unit_id = ou.id
           WHERE pa.employee_id = e.id AND pa.is_primary = true AND pa.effective_to IS NULL
           LIMIT 1) as org_unit_name,
          (SELECT app.get_employee_display_name(rl.manager_id) FROM app.reporting_lines rl
           WHERE rl.employee_id = e.id AND rl.is_primary = true AND rl.effective_to IS NULL
           LIMIT 1) as manager_name
        FROM app.employees e
        WHERE 1=1
          ${filters.status ? tx`AND e.status = ${filters.status}::app.employee_status` : tx``}
          ${filters.org_unit_id ? tx`AND EXISTS (
            SELECT 1 FROM app.position_assignments pa
            WHERE pa.employee_id = e.id AND pa.org_unit_id = ${filters.org_unit_id}::uuid AND pa.effective_to IS NULL
          )` : tx``}
          ${filters.manager_id ? tx`AND EXISTS (
            SELECT 1 FROM app.reporting_lines rl
            WHERE rl.employee_id = e.id AND rl.manager_id = ${filters.manager_id}::uuid AND rl.effective_to IS NULL
          )` : tx``}
          ${filters.position_id ? tx`AND EXISTS (
            SELECT 1 FROM app.position_assignments pa
            WHERE pa.employee_id = e.id AND pa.position_id = ${filters.position_id}::uuid AND pa.effective_to IS NULL
          )` : tx``}
          ${filters.search ? tx`AND (
            e.employee_number ILIKE ${'%' + filters.search + '%'}
            OR EXISTS (
              SELECT 1 FROM app.employee_personal ep
              WHERE ep.employee_id = e.id AND ep.effective_to IS NULL
              AND (ep.first_name ILIKE ${'%' + filters.search + '%'} OR ep.last_name ILIKE ${'%' + filters.search + '%'})
            )
          )` : tx``}
          ${filters.hire_date_from ? tx`AND e.hire_date >= ${filters.hire_date_from}::date` : tx``}
          ${filters.hire_date_to ? tx`AND e.hire_date <= ${filters.hire_date_to}::date` : tx``}
          ${cursor ? tx`AND e.id > ${cursor}::uuid` : tx``}
        ORDER BY e.employee_number, e.id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find employee by ID with all current effective records
   */
  async findEmployeeById(
    context: TenantContext,
    id: string
  ): Promise<{
    employee: EmployeeRow | null;
    personal: EmployeePersonalRow | null;
    contract: EmployeeContractRow | null;
    position: PositionAssignmentRow | null;
    compensation: CompensationRow | null;
    manager: ReportingLineRow | null;
  }> {
    const result = await this.db.withTransaction(context, async (tx) => {
      // Get employee base record
      const employees = await tx<EmployeeRow[]>`
        SELECT id, tenant_id, employee_number, user_id,
               status, hire_date, termination_date, termination_reason,
               created_at, updated_at
        FROM app.employees
        WHERE id = ${id}::uuid
      `;

      if (employees.length === 0) {
        return { employee: null, personal: null, contract: null, position: null, compensation: null, manager: null };
      }

      const employee = employees[0]!;

      // Get current personal info
      const personalRows = await tx<EmployeePersonalRow[]>`
        SELECT id, tenant_id, employee_id, effective_from, effective_to,
               first_name, middle_name, last_name, preferred_name,
               date_of_birth, gender, marital_status, nationality,
               created_at, created_by
        FROM app.employee_personal
        WHERE employee_id = ${id}::uuid AND effective_to IS NULL
      `;

      // Get current contract
      const contractRows = await tx<EmployeeContractRow[]>`
        SELECT id, tenant_id, employee_id, effective_from, effective_to,
               contract_type, employment_type, fte::text, working_hours_per_week::text,
               probation_end_date, notice_period_days, created_at, created_by
        FROM app.employment_contracts
        WHERE employee_id = ${id}::uuid AND effective_to IS NULL
      `;

      // Get primary position assignment
      const positionRows = await tx<PositionAssignmentRow[]>`
        SELECT pa.id, pa.tenant_id, pa.employee_id, pa.effective_from, pa.effective_to,
               pa.position_id, p.code as position_code, p.title as position_title,
               pa.org_unit_id, ou.name as org_unit_name, p.job_grade,
               pa.is_primary, pa.assignment_reason, pa.created_at, pa.created_by
        FROM app.position_assignments pa
        JOIN app.positions p ON pa.position_id = p.id
        JOIN app.org_units ou ON pa.org_unit_id = ou.id
        WHERE pa.employee_id = ${id}::uuid AND pa.is_primary = true AND pa.effective_to IS NULL
      `;

      // Get current compensation
      const compensationRows = await tx<CompensationRow[]>`
        SELECT id, tenant_id, employee_id, effective_from, effective_to,
               base_salary::text, currency, pay_frequency,
               change_reason, change_percentage::text, approved_by, approved_at,
               created_at, created_by
        FROM app.compensation_history
        WHERE employee_id = ${id}::uuid AND effective_to IS NULL
      `;

      // Get primary manager
      const managerRows = await tx<ReportingLineRow[]>`
        SELECT rl.id, rl.tenant_id, rl.employee_id, rl.effective_from, rl.effective_to,
               rl.manager_id, e.employee_number as manager_number,
               app.get_employee_display_name(rl.manager_id) as manager_name,
               rl.is_primary, rl.relationship_type, rl.created_at, rl.created_by
        FROM app.reporting_lines rl
        JOIN app.employees e ON rl.manager_id = e.id
        WHERE rl.employee_id = ${id}::uuid AND rl.is_primary = true AND rl.effective_to IS NULL
      `;

      return {
        employee,
        personal: personalRows[0] || null,
        contract: contractRows[0] || null,
        position: positionRows[0] || null,
        compensation: compensationRows[0] || null,
        manager: managerRows[0] || null,
      };
    });

    return result;
  }

  /**
   * Find employee by employee number
   */
  async findEmployeeByNumber(
    context: TenantContext,
    employeeNumber: string
  ): Promise<EmployeeRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EmployeeRow[]>`
        SELECT id, tenant_id, employee_number, user_id,
               status, hire_date, termination_date, termination_reason,
               created_at, updated_at
        FROM app.employees
        WHERE employee_number = ${employeeNumber}
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Generate next employee number
   */
  async generateEmployeeNumber(
    context: TenantContext,
    prefix: string = "EMP"
  ): Promise<string> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ generateEmployeeNumber: string }[]>`
        SELECT app.generate_employee_number(${context.tenantId}::uuid, ${prefix}) as generate_employee_number
      `;
      return rows;
    });

    return result[0]?.generateEmployeeNumber || `${prefix}-00001`;
  }

  /**
   * Create employee with all related records
   */
  async createEmployee(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateEmployee,
    employeeNumber: string,
    createdBy: string
  ): Promise<{
    employee: EmployeeRow;
    personalId: string;
    contractId: string;
    positionAssignmentId: string;
    compensationId: string;
    reportingLineId?: string;
  }> {
    // Create employee record
    const employeeRows = await tx<EmployeeRow[]>`
      INSERT INTO app.employees (tenant_id, employee_number, hire_date)
      VALUES (${context.tenantId}::uuid, ${employeeNumber}, ${data.contract.hire_date}::date)
      RETURNING id, tenant_id, employee_number, user_id, status, hire_date,
                termination_date, termination_reason, created_at, updated_at
    `;
    const employee = employeeRows[0]!;

    // Create personal info
    const personalRows = await tx<{ id: string }[]>`
      INSERT INTO app.employee_personal (
        tenant_id, employee_id, effective_from,
        first_name, middle_name, last_name, preferred_name,
        date_of_birth, gender, marital_status, nationality, created_by
      )
      VALUES (
        ${context.tenantId}::uuid, ${employee.id}::uuid, ${data.contract.hire_date}::date,
        ${data.personal.first_name}, ${data.personal.middle_name || null}, ${data.personal.last_name},
        ${data.personal.preferred_name || null}, ${data.personal.date_of_birth || null}::date,
        ${data.personal.gender || null}::app.gender, ${data.personal.marital_status || null}::app.marital_status,
        ${data.personal.nationality || null}, ${createdBy}::uuid
      )
      RETURNING id
    `;

    // Create contract
    const contractRows = await tx<{ id: string }[]>`
      INSERT INTO app.employment_contracts (
        tenant_id, employee_id, effective_from,
        contract_type, employment_type, fte, working_hours_per_week,
        probation_end_date, notice_period_days, created_by
      )
      VALUES (
        ${context.tenantId}::uuid, ${employee.id}::uuid, ${data.contract.hire_date}::date,
        ${data.contract.contract_type}::app.contract_type,
        ${data.contract.employment_type}::app.employment_type,
        ${data.contract.fte}, ${data.contract.working_hours_per_week || null},
        ${data.contract.probation_end_date || null}::date,
        ${data.contract.notice_period_days || null},
        ${createdBy}::uuid
      )
      RETURNING id
    `;

    // Create position assignment
    const positionRows = await tx<{ id: string }[]>`
      INSERT INTO app.position_assignments (
        tenant_id, employee_id, effective_from,
        position_id, org_unit_id, is_primary, assignment_reason, created_by
      )
      VALUES (
        ${context.tenantId}::uuid, ${employee.id}::uuid, ${data.contract.hire_date}::date,
        ${data.position.position_id}::uuid, ${data.position.org_unit_id}::uuid,
        ${data.position.is_primary !== false}, 'hire', ${createdBy}::uuid
      )
      RETURNING id
    `;

    // Create compensation
    const compensationRows = await tx<{ id: string }[]>`
      INSERT INTO app.compensation_history (
        tenant_id, employee_id, effective_from,
        base_salary, currency, pay_frequency, change_reason, created_by
      )
      VALUES (
        ${context.tenantId}::uuid, ${employee.id}::uuid, ${data.contract.hire_date}::date,
        ${data.compensation.base_salary}, ${data.compensation.currency || 'GBP'},
        ${data.compensation.pay_frequency || 'monthly'}, 'hire', ${createdBy}::uuid
      )
      RETURNING id
    `;

    // Create reporting line if manager specified
    let reportingLineId: string | undefined;
    if (data.manager_id) {
      const reportingRows = await tx<{ id: string }[]>`
        INSERT INTO app.reporting_lines (
          tenant_id, employee_id, effective_from,
          manager_id, is_primary, relationship_type, created_by
        )
        VALUES (
          ${context.tenantId}::uuid, ${employee.id}::uuid, ${data.contract.hire_date}::date,
          ${data.manager_id}::uuid, true, 'direct', ${createdBy}::uuid
        )
        RETURNING id
      `;
      reportingLineId = reportingRows[0]?.id;
    }

    // Create contacts if provided (batch insert)
    if (data.contacts && data.contacts.length > 0) {
      await tx`
        INSERT INTO app.employee_contacts ${(tx as any)(
          data.contacts.map(contact => ({
            tenant_id: context.tenantId,
            employee_id: employee.id,
            effective_from: data.contract.hire_date,
            contact_type: contact.contact_type,
            value: contact.value,
            is_primary: contact.is_primary || false,
            created_by: createdBy,
          }))
        )}
      `;
    }

    // Create addresses if provided (batch insert)
    if (data.addresses && data.addresses.length > 0) {
      await tx`
        INSERT INTO app.employee_addresses ${(tx as any)(
          data.addresses.map(address => ({
            tenant_id: context.tenantId,
            employee_id: employee.id,
            effective_from: data.contract.hire_date,
            address_type: address.address_type,
            street_line1: address.street_line1,
            street_line2: address.street_line2 || null,
            city: address.city,
            state_province: address.state_province || null,
            postal_code: address.postal_code,
            country: address.country,
            is_primary: address.is_primary || false,
            created_by: createdBy,
          }))
        )}
      `;
    }

    return {
      employee,
      personalId: personalRows[0]!.id,
      contractId: contractRows[0]!.id,
      positionAssignmentId: positionRows[0]!.id,
      compensationId: compensationRows[0]!.id,
      reportingLineId,
    };
  }

  /**
   * Update employee personal info (effective-dated)
   */
  async updateEmployeePersonal(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePersonal,
    updatedBy: string
  ): Promise<string> {
    // Close current record
    await tx`
      UPDATE app.employee_personal
      SET effective_to = ${data.effective_from}::date, updated_at = now()
      WHERE employee_id = ${employeeId}::uuid
        AND effective_to IS NULL
        AND effective_from < ${data.effective_from}::date
    `;

    // Get current values for merge
    const currentRows = await tx<EmployeePersonalRow[]>`
      SELECT first_name, middle_name, last_name, preferred_name,
             date_of_birth, gender, marital_status, nationality
      FROM app.employee_personal
      WHERE employee_id = ${employeeId}::uuid
      ORDER BY effective_from DESC
      LIMIT 1
    `;
    const current = currentRows[0];

    // Insert new record with merged values
    const newRows = await tx<{ id: string }[]>`
      INSERT INTO app.employee_personal (
        tenant_id, employee_id, effective_from,
        first_name, middle_name, last_name, preferred_name,
        date_of_birth, gender, marital_status, nationality, created_by
      )
      VALUES (
        ${context.tenantId}::uuid, ${employeeId}::uuid, ${data.effective_from}::date,
        COALESCE(${data.first_name}, ${current?.firstName}),
        COALESCE(${data.middle_name}, ${current?.middleName}),
        COALESCE(${data.last_name}, ${current?.lastName}),
        COALESCE(${data.preferred_name}, ${current?.preferredName}),
        COALESCE(${data.date_of_birth}::date, ${current?.dateOfBirth}::date),
        COALESCE(${data.gender}::app.gender, ${current?.gender}::app.gender),
        COALESCE(${data.marital_status}::app.marital_status, ${current?.maritalStatus}::app.marital_status),
        COALESCE(${data.nationality}, ${current?.nationality}),
        ${updatedBy}::uuid
      )
      RETURNING id
    `;

    return newRows[0]!.id;
  }

  /**
   * Update employee contract (effective-dated)
   */
  async updateEmployeeContract(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeContract,
    updatedBy: string
  ): Promise<string> {
    // Close current record
    await tx`
      UPDATE app.employment_contracts
      SET effective_to = ${data.effective_from}::date, updated_at = now()
      WHERE employee_id = ${employeeId}::uuid
        AND effective_to IS NULL
        AND effective_from < ${data.effective_from}::date
    `;

    // Get current values
    const currentRows = await tx<EmployeeContractRow[]>`
      SELECT contract_type, employment_type, fte, working_hours_per_week,
             probation_end_date, notice_period_days
      FROM app.employment_contracts
      WHERE employee_id = ${employeeId}::uuid
      ORDER BY effective_from DESC
      LIMIT 1
    `;
    const current = currentRows[0];

    // Insert new record
    const newRows = await tx<{ id: string }[]>`
      INSERT INTO app.employment_contracts (
        tenant_id, employee_id, effective_from,
        contract_type, employment_type, fte, working_hours_per_week,
        probation_end_date, notice_period_days, created_by
      )
      VALUES (
        ${context.tenantId}::uuid, ${employeeId}::uuid, ${data.effective_from}::date,
        COALESCE(${data.contract_type}::app.contract_type, ${current?.contractType}::app.contract_type),
        COALESCE(${data.employment_type}::app.employment_type, ${current?.employmentType}::app.employment_type),
        COALESCE(${data.fte}, ${current?.fte}::numeric),
        COALESCE(${data.working_hours_per_week}, ${current?.workingHoursPerWeek}::numeric),
        COALESCE(${data.probation_end_date}::date, ${current?.probationEndDate}::date),
        COALESCE(${data.notice_period_days}, ${current?.noticePeriodDays}),
        ${updatedBy}::uuid
      )
      RETURNING id
    `;

    return newRows[0]!.id;
  }

  /**
   * Update employee position (effective-dated)
   */
  async updateEmployeePosition(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePosition,
    updatedBy: string
  ): Promise<string> {
    const isPrimary = data.is_primary !== false;

    // Close current primary position if this is a primary assignment
    if (isPrimary) {
      await tx`
        UPDATE app.position_assignments
        SET effective_to = ${data.effective_from}::date, updated_at = now()
        WHERE employee_id = ${employeeId}::uuid
          AND is_primary = true
          AND effective_to IS NULL
          AND effective_from < ${data.effective_from}::date
      `;
    }

    // Insert new assignment
    const newRows = await tx<{ id: string }[]>`
      INSERT INTO app.position_assignments (
        tenant_id, employee_id, effective_from,
        position_id, org_unit_id, is_primary, assignment_reason, created_by
      )
      VALUES (
        ${context.tenantId}::uuid, ${employeeId}::uuid, ${data.effective_from}::date,
        ${data.position_id}::uuid, ${data.org_unit_id}::uuid,
        ${isPrimary}, ${data.assignment_reason || null}, ${updatedBy}::uuid
      )
      RETURNING id
    `;

    return newRows[0]!.id;
  }

  /**
   * Update employee compensation (effective-dated)
   */
  async updateEmployeeCompensation(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeCompensation,
    updatedBy: string
  ): Promise<string> {
    // Close current record
    await tx`
      UPDATE app.compensation_history
      SET effective_to = ${data.effective_from}::date, updated_at = now()
      WHERE employee_id = ${employeeId}::uuid
        AND effective_to IS NULL
        AND effective_from < ${data.effective_from}::date
    `;

    // Insert new record
    const newRows = await tx<{ id: string }[]>`
      INSERT INTO app.compensation_history (
        tenant_id, employee_id, effective_from,
        base_salary, currency, pay_frequency, change_reason, created_by
      )
      VALUES (
        ${context.tenantId}::uuid, ${employeeId}::uuid, ${data.effective_from}::date,
        ${data.base_salary}, ${data.currency || 'GBP'},
        ${data.pay_frequency || 'monthly'}, ${data.change_reason || null}, ${updatedBy}::uuid
      )
      RETURNING id
    `;

    return newRows[0]!.id;
  }

  /**
   * Update employee manager (effective-dated)
   */
  async updateEmployeeManager(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeManager,
    updatedBy: string
  ): Promise<string> {
    const isPrimary = data.is_primary !== false;

    // Close current primary manager if this is a primary relationship
    if (isPrimary) {
      await tx`
        UPDATE app.reporting_lines
        SET effective_to = ${data.effective_from}::date, updated_at = now()
        WHERE employee_id = ${employeeId}::uuid
          AND is_primary = true
          AND effective_to IS NULL
          AND effective_from < ${data.effective_from}::date
      `;
    }

    // Insert new reporting line
    const newRows = await tx<{ id: string }[]>`
      INSERT INTO app.reporting_lines (
        tenant_id, employee_id, effective_from,
        manager_id, is_primary, relationship_type, created_by
      )
      VALUES (
        ${context.tenantId}::uuid, ${employeeId}::uuid, ${data.effective_from}::date,
        ${data.manager_id}::uuid, ${isPrimary},
        ${data.relationship_type || 'direct'}, ${updatedBy}::uuid
      )
      RETURNING id
    `;

    return newRows[0]!.id;
  }

  /**
   * Transition employee status
   */
  async transitionEmployeeStatus(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    toStatus: EmployeeStatus,
    effectiveDate: string,
    reason: string | null,
    updatedBy: string
  ): Promise<boolean> {
    // Get current status
    const currentRows = await tx<{ status: string }[]>`
      SELECT status FROM app.employees WHERE id = ${employeeId}::uuid
    `;
    const fromStatus = currentRows[0]?.status;

    // Update employee status
    const result = await tx`
      UPDATE app.employees
      SET status = ${toStatus}::app.employee_status, updated_at = now()
      WHERE id = ${employeeId}::uuid
    `;

    // Record status history
    await tx`
      INSERT INTO app.employee_status_history (
        tenant_id, employee_id, from_status, to_status,
        effective_date, reason, created_by
      )
      VALUES (
        ${context.tenantId}::uuid, ${employeeId}::uuid,
        ${fromStatus}::app.employee_status, ${toStatus}::app.employee_status,
        ${effectiveDate}::date, ${reason}, ${updatedBy}::uuid
      )
    `;

    return result.count > 0;
  }

  /**
   * Update employee NI category
   */
  async updateNiCategory(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    niCategory: string
  ): Promise<boolean> {
    const result = await tx`
      UPDATE app.employees
      SET
        ni_category = ${niCategory}::app.ni_category,
        updated_at = now()
      WHERE id = ${employeeId}::uuid
        AND tenant_id = ${context.tenantId}::uuid
    `;

    return result.count > 0;
  }

  /**
   * Terminate employee
   */
  async terminateEmployee(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    terminationDate: string,
    reason: string,
    updatedBy: string
  ): Promise<boolean> {
    // Update employee record
    const result = await tx`
      UPDATE app.employees
      SET
        status = 'terminated'::app.employee_status,
        termination_date = ${terminationDate}::date,
        termination_reason = ${reason},
        updated_at = now()
      WHERE id = ${employeeId}::uuid
    `;

    // Close all open position assignments
    await tx`
      UPDATE app.position_assignments
      SET effective_to = ${terminationDate}::date, updated_at = now()
      WHERE employee_id = ${employeeId}::uuid AND effective_to IS NULL
    `;

    // Close all open reporting lines
    await tx`
      UPDATE app.reporting_lines
      SET effective_to = ${terminationDate}::date, updated_at = now()
      WHERE employee_id = ${employeeId}::uuid AND effective_to IS NULL
    `;

    // Close current compensation
    await tx`
      UPDATE app.compensation_history
      SET effective_to = ${terminationDate}::date, updated_at = now()
      WHERE employee_id = ${employeeId}::uuid AND effective_to IS NULL
    `;

    // Record status history
    await tx`
      INSERT INTO app.employee_status_history (
        tenant_id, employee_id, from_status, to_status,
        effective_date, reason, created_by
      )
      SELECT
        ${context.tenantId}::uuid, ${employeeId}::uuid,
        status, 'terminated'::app.employee_status,
        ${terminationDate}::date, ${reason}, ${updatedBy}::uuid
      FROM app.employees WHERE id = ${employeeId}::uuid
    `;

    return result.count > 0;
  }

  // ===========================================================================
  // History Methods
  // ===========================================================================

  /**
   * Get employee personal history
   */
  async getEmployeePersonalHistory(
    context: TenantContext,
    employeeId: string,
    dateRange?: { from?: string; to?: string }
  ): Promise<EmployeePersonalRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EmployeePersonalRow[]>`
        SELECT id, tenant_id, employee_id, effective_from, effective_to,
               first_name, middle_name, last_name, preferred_name,
               date_of_birth, gender, marital_status, nationality,
               created_at, created_by
        FROM app.employee_personal
        WHERE employee_id = ${employeeId}::uuid
          ${dateRange?.from ? tx`AND effective_from >= ${dateRange.from}::date` : tx``}
          ${dateRange?.to ? tx`AND (effective_to IS NULL OR effective_to <= ${dateRange.to}::date)` : tx``}
        ORDER BY effective_from DESC
      `;
      return rows;
    });

    return result;
  }

  /**
   * Get employee contract history
   */
  async getEmployeeContractHistory(
    context: TenantContext,
    employeeId: string,
    dateRange?: { from?: string; to?: string }
  ): Promise<EmployeeContractRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EmployeeContractRow[]>`
        SELECT id, tenant_id, employee_id, effective_from, effective_to,
               contract_type, employment_type, fte::text, working_hours_per_week::text,
               probation_end_date, notice_period_days, created_at, created_by
        FROM app.employment_contracts
        WHERE employee_id = ${employeeId}::uuid
          ${dateRange?.from ? tx`AND effective_from >= ${dateRange.from}::date` : tx``}
          ${dateRange?.to ? tx`AND (effective_to IS NULL OR effective_to <= ${dateRange.to}::date)` : tx``}
        ORDER BY effective_from DESC
      `;
      return rows;
    });

    return result;
  }

  /**
   * Get employee position history
   */
  async getEmployeePositionHistory(
    context: TenantContext,
    employeeId: string,
    dateRange?: { from?: string; to?: string }
  ): Promise<PositionAssignmentRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<PositionAssignmentRow[]>`
        SELECT pa.id, pa.tenant_id, pa.employee_id, pa.effective_from, pa.effective_to,
               pa.position_id, p.code as position_code, p.title as position_title,
               pa.org_unit_id, ou.name as org_unit_name, p.job_grade,
               pa.is_primary, pa.assignment_reason, pa.created_at, pa.created_by
        FROM app.position_assignments pa
        JOIN app.positions p ON pa.position_id = p.id
        JOIN app.org_units ou ON pa.org_unit_id = ou.id
        WHERE pa.employee_id = ${employeeId}::uuid
          ${dateRange?.from ? tx`AND pa.effective_from >= ${dateRange.from}::date` : tx``}
          ${dateRange?.to ? tx`AND (pa.effective_to IS NULL OR pa.effective_to <= ${dateRange.to}::date)` : tx``}
        ORDER BY pa.effective_from DESC
      `;
      return rows;
    });

    return result;
  }

  /**
   * Get employee compensation history
   */
  async getEmployeeCompensationHistory(
    context: TenantContext,
    employeeId: string,
    dateRange?: { from?: string; to?: string }
  ): Promise<CompensationRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<CompensationRow[]>`
        SELECT id, tenant_id, employee_id, effective_from, effective_to,
               base_salary::text, currency, pay_frequency,
               change_reason, change_percentage::text, approved_by, approved_at,
               created_at, created_by
        FROM app.compensation_history
        WHERE employee_id = ${employeeId}::uuid
          ${dateRange?.from ? tx`AND effective_from >= ${dateRange.from}::date` : tx``}
          ${dateRange?.to ? tx`AND (effective_to IS NULL OR effective_to <= ${dateRange.to}::date)` : tx``}
        ORDER BY effective_from DESC
      `;
      return rows;
    });

    return result;
  }

  /**
   * Get employee manager history
   */
  async getEmployeeManagerHistory(
    context: TenantContext,
    employeeId: string,
    dateRange?: { from?: string; to?: string }
  ): Promise<ReportingLineRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<ReportingLineRow[]>`
        SELECT rl.id, rl.tenant_id, rl.employee_id, rl.effective_from, rl.effective_to,
               rl.manager_id, e.employee_number as manager_number,
               app.get_employee_display_name(rl.manager_id) as manager_name,
               rl.is_primary, rl.relationship_type, rl.created_at, rl.created_by
        FROM app.reporting_lines rl
        JOIN app.employees e ON rl.manager_id = e.id
        WHERE rl.employee_id = ${employeeId}::uuid
          ${dateRange?.from ? tx`AND rl.effective_from >= ${dateRange.from}::date` : tx``}
          ${dateRange?.to ? tx`AND (rl.effective_to IS NULL OR rl.effective_to <= ${dateRange.to}::date)` : tx``}
        ORDER BY rl.effective_from DESC
      `;
      return rows;
    });

    return result;
  }

  /**
   * Get employee status history
   */
  async getEmployeeStatusHistory(
    context: TenantContext,
    employeeId: string,
    dateRange?: { from?: string; to?: string }
  ): Promise<StatusHistoryRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<StatusHistoryRow[]>`
        SELECT id, tenant_id, employee_id, from_status, to_status,
               effective_date, reason, created_at, created_by
        FROM app.employee_status_history
        WHERE employee_id = ${employeeId}::uuid
          ${dateRange?.from ? tx`AND effective_date >= ${dateRange.from}::date` : tx``}
          ${dateRange?.to ? tx`AND effective_date <= ${dateRange.to}::date` : tx``}
        ORDER BY effective_date DESC, created_at DESC
      `;
      return rows;
    });

    return result;
  }

  // ===========================================================================
  // Overlap Checking
  // ===========================================================================

  /**
   * Check for effective date overlap in employee personal records
   */
  async checkPersonalOverlap(
    context: TenantContext,
    employeeId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
    excludeId?: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.employee_personal
          WHERE employee_id = ${employeeId}::uuid
            ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
            AND effective_from < ${effectiveTo || '9999-12-31'}::date
            AND (effective_to IS NULL OR effective_to > ${effectiveFrom}::date)
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Check for effective date overlap in employee contracts
   */
  async checkContractOverlap(
    context: TenantContext,
    employeeId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
    excludeId?: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.employment_contracts
          WHERE employee_id = ${employeeId}::uuid
            ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
            AND effective_from < ${effectiveTo || '9999-12-31'}::date
            AND (effective_to IS NULL OR effective_to > ${effectiveFrom}::date)
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Check for effective date overlap in position assignments (primary only)
   */
  async checkPositionOverlap(
    context: TenantContext,
    employeeId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
    isPrimary: boolean,
    excludeId?: string
  ): Promise<boolean> {
    if (!isPrimary) return false;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.position_assignments
          WHERE employee_id = ${employeeId}::uuid
            AND is_primary = true
            ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
            AND effective_from < ${effectiveTo || '9999-12-31'}::date
            AND (effective_to IS NULL OR effective_to > ${effectiveFrom}::date)
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Check for effective date overlap in compensation
   */
  async checkCompensationOverlap(
    context: TenantContext,
    employeeId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
    excludeId?: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.compensation_history
          WHERE employee_id = ${employeeId}::uuid
            ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
            AND effective_from < ${effectiveTo || '9999-12-31'}::date
            AND (effective_to IS NULL OR effective_to > ${effectiveFrom}::date)
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Check for effective date overlap in reporting lines (primary only)
   */
  async checkReportingLineOverlap(
    context: TenantContext,
    employeeId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
    isPrimary: boolean,
    excludeId?: string
  ): Promise<boolean> {
    if (!isPrimary) return false;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM app.reporting_lines
          WHERE employee_id = ${employeeId}::uuid
            AND is_primary = true
            ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
            AND effective_from < ${effectiveTo || '9999-12-31'}::date
            AND (effective_to IS NULL OR effective_to > ${effectiveFrom}::date)
        ) as exists
      `;
      return rows;
    });

    return result[0]?.exists ?? false;
  }

  /**
   * Check for circular reporting
   */
  async checkCircularReporting(
    context: TenantContext,
    employeeId: string,
    managerId: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(context, async (tx) => {
      // Check if the proposed manager is a direct or indirect report of the employee
      const rows = await tx<{ isCircular: boolean }[]>`
        WITH RECURSIVE report_chain AS (
          SELECT manager_id, employee_id, 1 as depth
          FROM app.reporting_lines
          WHERE manager_id = ${employeeId}::uuid
            AND is_primary = true
            AND effective_to IS NULL

          UNION ALL

          SELECT rl.manager_id, rl.employee_id, rc.depth + 1
          FROM app.reporting_lines rl
          INNER JOIN report_chain rc ON rl.manager_id = rc.employee_id
          WHERE rl.is_primary = true
            AND rl.effective_to IS NULL
            AND rc.depth < 50
        )
        SELECT EXISTS (
          SELECT 1 FROM report_chain WHERE employee_id = ${managerId}::uuid
        ) as is_circular
      `;
      return rows;
    });

    return result[0]?.isCircular || false;
  }

  /**
   * Get employee tenure in years
   */
  async getEmployeeTenure(
    context: TenantContext,
    employeeId: string
  ): Promise<number | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ tenure: string | null }[]>`
        SELECT app.get_employee_tenure_years(${employeeId}::uuid)::text as tenure
      `;
      return rows;
    });

    const tenure = result[0]?.tenure;
    return tenure ? parseFloat(tenure) : null;
  }

  /**
   * Get annual salary for an employee
   */
  async getEmployeeAnnualSalary(
    context: TenantContext,
    employeeId: string
  ): Promise<number | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{ annualSalary: string | null }[]>`
        SELECT app.get_employee_annual_salary(${employeeId}::uuid)::text as annual_salary
      `;
      return rows;
    });

    const salary = result[0]?.annualSalary;
    return salary ? parseFloat(salary) : null;
  }
}
