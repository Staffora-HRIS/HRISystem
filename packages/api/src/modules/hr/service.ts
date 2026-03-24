/**
 * Core HR Module - Service Layer (Facade)
 *
 * Composes the focused sub-services (Employee, OrgUnit, Position) into a
 * single HRService class for backwards compatibility with routes.ts and
 * existing consumers.
 *
 * Sub-services:
 * - EmployeeService  (employee.service.ts) — Employee CRUD, status changes, history, org chart
 * - OrgUnitService   (org-unit.service.ts)  — Org unit/department operations
 * - PositionService  (position.service.ts)  — Position management
 *
 * All business logic lives in the sub-services. This file is a thin
 * delegation layer that maintains the original HRService API surface.
 */

import type { DatabaseClient } from "../../plugins/db";
import type { CacheClient } from "../../plugins/cache";
import type { HRRepository } from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { EmployeeService } from "./employee.service";
import { OrgUnitService } from "./org-unit.service";
import { PositionService } from "./position.service";
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
  EmployeeStatusTransition,
  EmployeeTermination,
  PaginationQuery,
  OrgUnitResponse,
  PositionResponse,
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
// HR Service (Facade)
// =============================================================================

/**
 * Facade that delegates to focused sub-services.
 * Maintains backwards compatibility with existing consumers (routes.ts, tests).
 */
export class HRService {
  private employeeService: EmployeeService;
  private orgUnitService: OrgUnitService;
  private positionService: PositionService;

  constructor(
    private repository: HRRepository,
    private db: DatabaseClient,
    private cache: CacheClient | null = null
  ) {
    this.employeeService = new EmployeeService(repository, db);
    this.orgUnitService = new OrgUnitService(repository, db, cache);
    this.positionService = new PositionService(repository, db, cache);
  }

  // ===========================================================================
  // Stats (delegated to EmployeeService)
  // ===========================================================================

  async getStats(context: TenantContext) {
    return this.employeeService.getStats(context);
  }

  // ===========================================================================
  // Org Unit Business Logic (delegated to OrgUnitService)
  // ===========================================================================

  async listOrgUnits(
    context: TenantContext,
    filters: OrgUnitFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<OrgUnitResponse>> {
    return this.orgUnitService.listOrgUnits(context, filters, pagination);
  }

  async getOrgUnit(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<OrgUnitResponse>> {
    return this.orgUnitService.getOrgUnit(context, id);
  }

  async getOrgUnitHierarchy(
    context: TenantContext,
    rootId?: string
  ): Promise<ServiceResult<OrgUnitResponse[]>> {
    return this.orgUnitService.getOrgUnitHierarchy(context, rootId);
  }

  async createOrgUnit(
    context: TenantContext,
    data: CreateOrgUnit,
    idempotencyKey?: string
  ): Promise<ServiceResult<OrgUnitResponse>> {
    return this.orgUnitService.createOrgUnit(context, data, idempotencyKey);
  }

  async updateOrgUnit(
    context: TenantContext,
    id: string,
    data: UpdateOrgUnit,
    idempotencyKey?: string
  ): Promise<ServiceResult<OrgUnitResponse>> {
    return this.orgUnitService.updateOrgUnit(context, id, data, idempotencyKey);
  }

  async deleteOrgUnit(
    context: TenantContext,
    id: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    return this.orgUnitService.deleteOrgUnit(context, id, idempotencyKey);
  }

  // ===========================================================================
  // Position Business Logic (delegated to PositionService)
  // ===========================================================================

  async listPositions(
    context: TenantContext,
    filters: PositionFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<PositionResponse>> {
    return this.positionService.listPositions(context, filters, pagination);
  }

  async getPosition(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<PositionResponse>> {
    return this.positionService.getPosition(context, id);
  }

  async createPosition(
    context: TenantContext,
    data: CreatePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<PositionResponse>> {
    return this.positionService.createPosition(context, data, idempotencyKey);
  }

  async updatePosition(
    context: TenantContext,
    id: string,
    data: UpdatePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<PositionResponse>> {
    return this.positionService.updatePosition(context, id, data, idempotencyKey);
  }

  async deletePosition(
    context: TenantContext,
    id: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    return this.positionService.deletePosition(context, id, idempotencyKey);
  }

  // ===========================================================================
  // Employee Business Logic (delegated to EmployeeService)
  // ===========================================================================

  async listEmployees(
    context: TenantContext,
    filters: EmployeeFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<EmployeeListItem>> {
    return this.employeeService.listEmployees(context, filters, pagination);
  }

  async getEmployee(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    return this.employeeService.getEmployee(context, id);
  }

  async getEmployeeByNumber(
    context: TenantContext,
    employeeNumber: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    return this.employeeService.getEmployeeByNumber(context, employeeNumber);
  }

  async hireEmployee(
    context: TenantContext,
    data: CreateEmployee,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    return this.employeeService.hireEmployee(context, data, idempotencyKey);
  }

  async updateEmployeePersonal(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePersonal,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    return this.employeeService.updateEmployeePersonal(context, employeeId, data, idempotencyKey);
  }

  async updateEmployeeContract(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeContract,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    return this.employeeService.updateEmployeeContract(context, employeeId, data, idempotencyKey);
  }

  async transferEmployee(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    return this.employeeService.transferEmployee(context, employeeId, data, idempotencyKey);
  }

  async promoteEmployee(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    return this.employeeService.promoteEmployee(context, employeeId, data, idempotencyKey);
  }

  async changeCompensation(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeCompensation,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    return this.employeeService.changeCompensation(context, employeeId, data, idempotencyKey);
  }

  async changeManager(
    context: TenantContext,
    employeeId: string,
    data: UpdateEmployeeManager,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    return this.employeeService.changeManager(context, employeeId, data, idempotencyKey);
  }

  async transitionStatus(
    context: TenantContext,
    employeeId: string,
    data: EmployeeStatusTransition,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    return this.employeeService.transitionStatus(context, employeeId, data, idempotencyKey);
  }

  async terminateEmployee(
    context: TenantContext,
    employeeId: string,
    data: EmployeeTermination,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    return this.employeeService.terminateEmployee(context, employeeId, data, idempotencyKey);
  }

  async rehireEmployee(
    context: TenantContext,
    employeeId: string,
    data: RehireEmployee,
    idempotencyKey?: string
  ): Promise<ServiceResult<{ employee: EmployeeResponse; employment_records: EmploymentRecordResponse[] }>> {
    return this.employeeService.rehireEmployee(context, employeeId, data, idempotencyKey);
  }

  async updateNiCategory(
    context: TenantContext,
    employeeId: string,
    niCategory: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeeResponse>> {
    return this.employeeService.updateNiCategory(context, employeeId, niCategory, idempotencyKey);
  }

  // ===========================================================================
  // Statutory Notice (delegated to EmployeeService)
  // ===========================================================================

  async getStatutoryNoticePeriod(
    context: TenantContext,
    employeeId: string
  ) {
    return this.employeeService.getStatutoryNoticePeriod(context, employeeId);
  }

  // ===========================================================================
  // History Methods (delegated to EmployeeService)
  // ===========================================================================

  async getEmployeeHistory(
    context: TenantContext,
    employeeId: string,
    dimension: HistoryDimension,
    dateRange?: { from?: string; to?: string }
  ): Promise<ServiceResult<HistoryRecord[]>> {
    return this.employeeService.getEmployeeHistory(context, employeeId, dimension, dateRange);
  }

  // ===========================================================================
  // Org Chart Methods (delegated to EmployeeService)
  // ===========================================================================

  async getOrgChart(
    context: TenantContext,
    rootEmployeeId?: string
  ) {
    return this.employeeService.getOrgChart(context, rootEmployeeId);
  }

  async getDirectReports(
    context: TenantContext,
    employeeId: string
  ) {
    return this.employeeService.getDirectReports(context, employeeId);
  }

  async getReportingChain(
    context: TenantContext,
    employeeId: string
  ) {
    return this.employeeService.getReportingChain(context, employeeId);
  }

  // ===========================================================================
  // Concurrent Employment / Multi-Position (delegated to EmployeeService)
  // ===========================================================================

  async getEmployeePositions(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<EmployeePositionsListResponse>> {
    return this.employeeService.getEmployeePositions(context, employeeId);
  }

  async assignAdditionalPosition(
    context: TenantContext,
    employeeId: string,
    data: AssignEmployeePosition,
    idempotencyKey?: string
  ): Promise<ServiceResult<EmployeePositionAssignmentResponse>> {
    return this.employeeService.assignAdditionalPosition(context, employeeId, data, idempotencyKey);
  }

  async endEmployeePositionAssignment(
    context: TenantContext,
    employeeId: string,
    assignmentId: string,
    effectiveTo: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<void>> {
    return this.employeeService.endEmployeePositionAssignment(context, employeeId, assignmentId, effectiveTo, idempotencyKey);
  }
}
