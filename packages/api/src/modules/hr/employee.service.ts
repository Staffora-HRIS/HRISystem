/**
 * Core HR Module - Employee Service (Facade)
 *
 * Composes the focused sub-services (Lifecycle, Changes, OrgChart, Positions)
 * into a single EmployeeService class for backwards compatibility with
 * HRService and existing consumers.
 *
 * Sub-services:
 * - EmployeeLifecycleService   (employee-lifecycle.service.ts)  — Hire, terminate, rehire, status transitions, NI, statutory notice
 * - EmployeeChangesService     (employee-changes.service.ts)    — Personal, contract, position, compensation, manager changes
 * - EmployeeOrgChartService    (employee-org-chart.service.ts)  — Org chart, direct reports, reporting chain, history
 * - EmployeePositionsService   (employee-positions.service.ts)  — Concurrent employment / multi-position management
 *
 * This file retains: Stats, CRUD (list/get/getByNumber), and the
 * mapEmployeeToResponse helper. All other business logic lives in sub-services.
 */

import type { DatabaseClient } from "../../plugins/db";
import type {
  HRRepository,
  EmployeeRow,
} from "./repository";
import type {
  EmployeePersonalRow,
  EmployeeContractRow,
  PositionAssignmentRow,
  CompensationRow,
  ReportingLineRow,
} from "./repository.types";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { EmployeeLifecycleService } from "./employee-lifecycle.service";
import { EmployeeChangesService } from "./employee-changes.service";
import { EmployeeOrgChartService } from "./employee-org-chart.service";
import { EmployeePositionsService } from "./employee-positions.service";
import type {
  CreateEmployee,
  UpdateEmployeePersonal,
  UpdateEmployeeContract,
  UpdateEmployeePosition,
  UpdateEmployeeCompensation,
  UpdateEmployeeManager,
  EmployeeFilters,
  EmployeeStatusTransition,
  EmployeeTermination,
  PaginationQuery,
  EmployeeResponse,
  EmployeeListItem,
  HistoryDimension,
  HistoryRecord,
  AssignEmployeePosition,
  EmployeePositionAssignmentResponse,
  EmployeePositionsListResponse,
  RehireEmployee,
  EmploymentRecordResponse,
} from "./schemas";

// =============================================================================
// Employee Service (Facade)
// =============================================================================

export class EmployeeService {
  private lifecycleService: EmployeeLifecycleService;
  private changesService: EmployeeChangesService;
  private orgChartService: EmployeeOrgChartService;
  private positionsService: EmployeePositionsService;

  constructor(
    private repository: HRRepository,
    private db: DatabaseClient
  ) {
    this.lifecycleService = new EmployeeLifecycleService(repository, db);
    this.changesService = new EmployeeChangesService(repository, db);
    this.orgChartService = new EmployeeOrgChartService(repository, db);
    this.positionsService = new EmployeePositionsService(repository, db);
  }

  // ===========================================================================
  // Stats
  // ===========================================================================

  async getStats(context: TenantContext) {
    return this.repository.getStats(context);
  }

  // ===========================================================================
  // Employee CRUD
  // ===========================================================================

  /**
   * List employees with filters
   */
  async listEmployees(
    context: TenantContext,
    filters: EmployeeFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<EmployeeListItem>> {
    const result = await this.repository.findEmployees(context, filters, pagination);

    return {
      items: result.items.map((emp) => {
        // Handle both camelCase (TypeScript interface) and snake_case (PostgreSQL columns)
        const rawEmp = emp as Record<string, unknown>;

        const employeeNumber = rawEmp.employeeNumber ?? rawEmp.employee_number;
        const hireDate = rawEmp.hireDate ?? rawEmp.hire_date;
        const fullName = rawEmp.fullName ?? rawEmp.full_name;
        const displayName = rawEmp.displayName ?? rawEmp.display_name;
        const positionTitle = rawEmp.positionTitle ?? rawEmp.position_title;
        const orgUnitName = rawEmp.orgUnitName ?? rawEmp.org_unit_name;
        const managerName = rawEmp.managerName ?? rawEmp.manager_name;

        // Helper to safely convert date to YYYY-MM-DD string
        const toDateString = (value: unknown): string => {
          if (value instanceof Date) {
            return value.toISOString().split("T")[0]!;
          }
          if (typeof value === "string") {
            return value.includes("T") ? value.split("T")[0]! : value;
          }
          return "";
        };

        return {
          id: emp.id,
          employee_number: String(employeeNumber || ""),
          status: emp.status,
          hire_date: toDateString(hireDate),
          full_name: fullName ? String(fullName) : "",
          display_name: displayName ? String(displayName) : "",
          position_title: positionTitle ? String(positionTitle) : null,
          org_unit_name: orgUnitName ? String(orgUnitName) : null,
          manager_name: managerName ? String(managerName) : null,
        };
      }),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get employee by ID with full details
   */
  async getEmployee(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const result = await this.repository.findEmployeeById(context, id);

    if (!result.employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { id },
        },
      };
    }

    const tenure = await this.repository.getEmployeeTenure(context, id);
    const annualSalary = result.compensation
      ? await this.repository.getEmployeeAnnualSalary(context, id)
      : null;

    return {
      success: true,
      data: this.mapEmployeeToResponse(result, tenure, annualSalary),
    };
  }

  /**
   * Get employee by employee number
   */
  async getEmployeeByNumber(
    context: TenantContext,
    employeeNumber: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const employee = await this.repository.findEmployeeByNumber(context, employeeNumber);

    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employee_number: employeeNumber },
        },
      };
    }

    return this.getEmployee(context, employee.id);
  }

  // ===========================================================================
  // Lifecycle (delegated to EmployeeLifecycleService)
  // ===========================================================================

  async hireEmployee(
    context: TenantContext,
    data: CreateEmployee,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const result = await this.lifecycleService.hireEmployee(context, data, idempotencyKey);
    if (!result.success) return { success: false, error: result.error };
    return this.getEmployee(context, result.data!.employeeId);
  }

  async transitionStatus(
    context: TenantContext,
    employeeId: string,
    data: EmployeeStatusTransition,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const result = await this.lifecycleService.transitionStatus(context, employeeId, data, idempotencyKey);
    if (!result.success) return { success: false, error: result.error };
    return this.getEmployee(context, employeeId);
  }

  async terminateEmployee(
    context: TenantContext,
    employeeId: string,
    data: EmployeeTermination,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const result = await this.lifecycleService.terminateEmployee(context, employeeId, data, idempotencyKey);
    if (!result.success) return { success: false, error: result.error };
    return this.getEmployee(context, employeeId);
  }

  async rehireEmployee(
    context: TenantContext,
    employeeId: string,
    data: RehireEmployee,
    idempotencyKey?: string
  ): Promise<ServiceResult<{ employee: EmployeeResponse; employment_records: EmploymentRecordResponse[] }>> {
    const result = await this.lifecycleService.rehireEmployee(context, employeeId, data, idempotencyKey);
    if (!result.success) return { success: false, error: result.error };

    const employeeResponse = await this.getEmployee(context, employeeId);
    if (!employeeResponse.success) return { success: false, error: employeeResponse.error };

    return {
      success: true,
      data: {
        employee: employeeResponse.data!,
        employment_records: result.data!.employment_records,
      },
    };
  }

  async updateNiCategory(
    context: TenantContext,
    employeeId: string,
    niCategory: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const result = await this.lifecycleService.updateNiCategory(context, employeeId, niCategory, idempotencyKey);
    if (!result.success) return { success: false, error: result.error };
    return this.getEmployee(context, employeeId);
  }

  async getStatutoryNoticePeriod(context: TenantContext, employeeId: string) {
    return this.lifecycleService.getStatutoryNoticePeriod(context, employeeId);
  }

  // ===========================================================================
  // Changes (delegated to EmployeeChangesService)
  // ===========================================================================

  async updateEmployeePersonal(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePersonal,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const result = await this.changesService.updateEmployeePersonal(context, employeeId, data, idempotencyKey);
    if (!result.success) return { success: false, error: result.error };
    return this.getEmployee(context, employeeId);
  }

  async updateEmployeeContract(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeContract,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const result = await this.changesService.updateEmployeeContract(context, employeeId, data, idempotencyKey);
    if (!result.success) return { success: false, error: result.error };
    return this.getEmployee(context, employeeId);
  }

  async transferEmployee(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const result = await this.changesService.transferEmployee(context, employeeId, data, idempotencyKey);
    if (!result.success) return { success: false, error: result.error };
    return this.getEmployee(context, employeeId);
  }

  async promoteEmployee(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const result = await this.changesService.promoteEmployee(context, employeeId, data, idempotencyKey);
    if (!result.success) return { success: false, error: result.error };
    return this.getEmployee(context, employeeId);
  }

  async changeCompensation(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeCompensation,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const result = await this.changesService.changeCompensation(context, employeeId, data, idempotencyKey);
    if (!result.success) return { success: false, error: result.error };
    return this.getEmployee(context, employeeId);
  }

  async changeManager(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeManager,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    const result = await this.changesService.changeManager(context, employeeId, data, idempotencyKey);
    if (!result.success) return { success: false, error: result.error };
    return this.getEmployee(context, employeeId);
  }

  // ===========================================================================
  // History (delegated to EmployeeOrgChartService)
  // ===========================================================================

  async getEmployeeHistory(
    context: TenantContext,
    employeeId: string,
    dimension: HistoryDimension,
    dateRange?: { from?: string; to?: string }
  ): Promise<ServiceResult<HistoryRecord[]>> {
    return this.orgChartService.getEmployeeHistory(context, employeeId, dimension, dateRange);
  }

  // ===========================================================================
  // Org Chart (delegated to EmployeeOrgChartService)
  // ===========================================================================

  async getOrgChart(context: TenantContext, rootEmployeeId?: string) {
    return this.orgChartService.getOrgChart(context, rootEmployeeId);
  }

  async getDirectReports(context: TenantContext, employeeId: string) {
    return this.orgChartService.getDirectReports(context, employeeId);
  }

  async getReportingChain(context: TenantContext, employeeId: string) {
    return this.orgChartService.getReportingChain(context, employeeId);
  }

  // ===========================================================================
  // Concurrent Employment / Multi-Position (delegated to EmployeePositionsService)
  // ===========================================================================

  async getEmployeePositions(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<EmployeePositionsListResponse>> {
    return this.positionsService.getEmployeePositions(context, employeeId);
  }

  async assignAdditionalPosition(
    context: TenantContext,
    employeeId: string,
    data: AssignEmployeePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeePositionAssignmentResponse>> {
    return this.positionsService.assignAdditionalPosition(context, employeeId, data, idempotencyKey);
  }

  async endEmployeePositionAssignment(
    context: TenantContext,
    employeeId: string,
    assignmentId: string,
    effectiveTo: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    return this.positionsService.endEmployeePositionAssignment(context, employeeId, assignmentId, effectiveTo, idempotencyKey);
  }

  // ===========================================================================
  // Mapping Helper
  // ===========================================================================

  mapEmployeeToResponse(
    result: {
      employee: EmployeeRow | null;
      personal: EmployeePersonalRow | null;
      contract: EmployeeContractRow | null;
      position: PositionAssignmentRow | null;
      compensation: CompensationRow | null;
      manager: ReportingLineRow | null;
    },
    tenure: number | null,
    annualSalary: number | null
  ): EmployeeResponse {
    const emp = result.employee!;
    const personal = result.personal;
    const contract = result.contract;
    const position = result.position;
    const compensation = result.compensation;
    const manager = result.manager;

    // Helper to safely convert date to YYYY-MM-DD string
    const toDateString = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString().split("T")[0]!;
      }
      if (typeof value === "string") {
        return value.includes("T") ? value.split("T")[0]! : value;
      }
      return "";
    };

    // Helper to safely convert to ISO string
    const toISOString = (value: unknown): string => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === "string") {
        return value;
      }
      return new Date().toISOString();
    };

    // Handle both camelCase (TypeScript interface) and snake_case (PostgreSQL columns) for employee
    const rawEmp = emp as Record<string, unknown>;
    const tenantId = rawEmp.tenantId ?? rawEmp.tenant_id;
    const employeeNumber = rawEmp.employeeNumber ?? rawEmp.employee_number;
    const userId = rawEmp.userId ?? rawEmp.user_id;
    const hireDate = rawEmp.hireDate ?? rawEmp.hire_date;
    const terminationDate = rawEmp.terminationDate ?? rawEmp.termination_date;
    const terminationReason = rawEmp.terminationReason ?? rawEmp.termination_reason;
    const createdAt = rawEmp.createdAt ?? rawEmp.created_at;
    const updatedAt = rawEmp.updatedAt ?? rawEmp.updated_at;

    // Map personal data with snake_case fallbacks
    const mapPersonal = () => {
      if (!personal) return undefined;
      const rawPersonal = personal as Record<string, unknown>;
      const firstName = rawPersonal.firstName ?? rawPersonal.first_name ?? "";
      const lastName = rawPersonal.lastName ?? rawPersonal.last_name ?? "";
      const middleName = rawPersonal.middleName ?? rawPersonal.middle_name;
      const preferredName = rawPersonal.preferredName ?? rawPersonal.preferred_name;
      const dateOfBirth = rawPersonal.dateOfBirth ?? rawPersonal.date_of_birth;
      const maritalStatus = rawPersonal.maritalStatus ?? rawPersonal.marital_status;
      const effectiveFrom = rawPersonal.effectiveFrom ?? rawPersonal.effective_from;

      return {
        first_name: String(firstName),
        last_name: String(lastName),
        middle_name: middleName ? String(middleName) : null,
        preferred_name: preferredName ? String(preferredName) : null,
        full_name: middleName
          ? `${firstName} ${middleName} ${lastName}`
          : `${firstName} ${lastName}`,
        display_name: `${preferredName || firstName} ${lastName}`,
        date_of_birth: dateOfBirth ? toDateString(dateOfBirth) : null,
        gender: (rawPersonal.gender ?? null) as EmployeeResponse["personal"] extends { gender: infer G } ? G : never,
        marital_status: (maritalStatus ?? null) as EmployeeResponse["personal"] extends { marital_status: infer M } ? M : never,
        nationality: (rawPersonal.nationality ?? null) as string | null,
        effective_from: toDateString(effectiveFrom),
      };
    };

    // Map contract data with snake_case fallbacks
    const mapContract = () => {
      if (!contract) return undefined;
      const rawContract = contract as Record<string, unknown>;
      const contractType = rawContract.contractType ?? rawContract.contract_type;
      const employmentType = rawContract.employmentType ?? rawContract.employment_type;
      const workingHoursPerWeek = rawContract.workingHoursPerWeek ?? rawContract.working_hours_per_week;
      const probationEndDate = rawContract.probationEndDate ?? rawContract.probation_end_date;
      const noticePeriodDays = rawContract.noticePeriodDays ?? rawContract.notice_period_days;
      const effectiveFrom = rawContract.effectiveFrom ?? rawContract.effective_from;

      return {
        contract_type: String(contractType) as import("./schemas").ContractType,
        employment_type: String(employmentType) as import("./schemas").EmploymentType,
        fte: parseFloat(String(rawContract.fte)),
        working_hours_per_week: workingHoursPerWeek
          ? parseFloat(String(workingHoursPerWeek))
          : null,
        probation_end_date: probationEndDate ? toDateString(probationEndDate) : null,
        notice_period_days: noticePeriodDays ? Number(noticePeriodDays) : null,
        effective_from: toDateString(effectiveFrom),
      };
    };

    // Map position data with snake_case fallbacks
    const mapPosition = () => {
      if (!position) return undefined;
      const rawPosition = position as Record<string, unknown>;
      const positionId = rawPosition.positionId ?? rawPosition.position_id;
      const positionCode = rawPosition.positionCode ?? rawPosition.position_code;
      const positionTitle = rawPosition.positionTitle ?? rawPosition.position_title;
      const orgUnitId = rawPosition.orgUnitId ?? rawPosition.org_unit_id;
      const orgUnitName = rawPosition.orgUnitName ?? rawPosition.org_unit_name;
      const jobGrade = rawPosition.jobGrade ?? rawPosition.job_grade;
      const isPrimary = rawPosition.isPrimary ?? rawPosition.is_primary;
      const effectiveFrom = rawPosition.effectiveFrom ?? rawPosition.effective_from;

      return {
        position_id: String(positionId),
        position_code: positionCode ? String(positionCode) : "",
        position_title: positionTitle ? String(positionTitle) : "",
        org_unit_id: String(orgUnitId),
        org_unit_name: orgUnitName ? String(orgUnitName) : "",
        job_grade: jobGrade ? String(jobGrade) : null,
        is_primary: Boolean(isPrimary),
        effective_from: toDateString(effectiveFrom),
      };
    };

    // Map compensation data with snake_case fallbacks
    const mapCompensation = () => {
      if (!compensation) return undefined;
      const rawComp = compensation as Record<string, unknown>;
      const baseSalary = rawComp.baseSalary ?? rawComp.base_salary;
      const payFrequency = rawComp.payFrequency ?? rawComp.pay_frequency;
      const effectiveFrom = rawComp.effectiveFrom ?? rawComp.effective_from;

      return {
        base_salary: parseFloat(String(baseSalary)),
        currency: String(rawComp.currency),
        pay_frequency: String(payFrequency),
        annual_salary: annualSalary || parseFloat(String(baseSalary)) * 12,
        effective_from: toDateString(effectiveFrom),
      };
    };

    // Map manager data with snake_case fallbacks
    const mapManager = () => {
      if (!manager) return null;
      const rawManager = manager as Record<string, unknown>;
      const managerId = rawManager.managerId ?? rawManager.manager_id;
      const managerNumber = rawManager.managerNumber ?? rawManager.manager_number;
      const managerName = rawManager.managerName ?? rawManager.manager_name;
      const relationshipType = rawManager.relationshipType ?? rawManager.relationship_type;
      const isPrimary = rawManager.isPrimary ?? rawManager.is_primary;
      const effectiveFrom = rawManager.effectiveFrom ?? rawManager.effective_from;

      return {
        manager_id: String(managerId),
        manager_number: managerNumber ? String(managerNumber) : "",
        manager_name: managerName ? String(managerName) : "",
        relationship_type: String(relationshipType),
        is_primary: Boolean(isPrimary),
        effective_from: toDateString(effectiveFrom),
      };
    };

    return {
      id: emp.id,
      tenant_id: String(tenantId),
      employee_number: String(employeeNumber),
      user_id: userId ? String(userId) : null,
      status: emp.status,
      hire_date: toDateString(hireDate),
      termination_date: terminationDate ? toDateString(terminationDate) : null,
      termination_reason: terminationReason ? String(terminationReason) : null,
      tenure_years: tenure,
      personal: mapPersonal(),
      contract: mapContract(),
      position: mapPosition(),
      compensation: mapCompensation(),
      manager: mapManager(),
      created_at: toISOString(createdAt),
      updated_at: toISOString(updatedAt),
    };
  }
}
