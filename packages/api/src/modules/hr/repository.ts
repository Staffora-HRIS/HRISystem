/**
 * Core HR Module - Repository Layer (Facade)
 *
 * Composes the focused sub-repositories (OrgUnit, Position, Employee)
 * into a single HRRepository class for backwards compatibility.
 *
 * Sub-repositories:
 * - OrgUnitRepository  (org-unit.repository.ts)
 * - PositionRepository (position.repository.ts)
 * - EmployeeRepository (employee.repository.ts)
 *
 * All types are defined in repository.types.ts and re-exported here.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import { OrgUnitRepository } from "./org-unit.repository";
import { PositionRepository } from "./position.repository";
import { EmployeeRepository } from "./employee.repository";

// Re-export all types from the shared types file
export type {
  OrgUnitRow,
  PositionRow,
  EmployeeRow,
  EmployeePersonalRow,
  EmployeeContractRow,
  PositionAssignmentRow,
  ReportingLineRow,
  CompensationRow,
  StatusHistoryRow,
  EmploymentRecordRow,
  PaginatedResult,
  TenantContext,
} from "./repository.types";

// Re-export sub-repositories for direct use
export { OrgUnitRepository } from "./org-unit.repository";
export { PositionRepository } from "./position.repository";
export { EmployeeRepository } from "./employee.repository";

// Re-export types module for re-export from index.ts
export type { Row } from "../../plugins/db";

// Import types needed for the facade class
import type {
  OrgUnitRow,
  PositionRow,
  EmployeeRow,
  EmployeePersonalRow,
  EmployeeContractRow,
  PositionAssignmentRow,
  CompensationRow,
  ReportingLineRow,
  StatusHistoryRow,
  EmploymentRecordRow,
  PaginatedResult,
  TenantContext,
} from "./repository.types";

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
// HR Repository (Facade)
// =============================================================================

/**
 * Facade that delegates to focused sub-repositories.
 * Maintains backwards compatibility with existing consumers.
 */
export class HRRepository {
  private orgUnitRepo: OrgUnitRepository;
  private positionRepo: PositionRepository;
  private employeeRepo: EmployeeRepository;

  constructor(private db: DatabaseClient) {
    this.orgUnitRepo = new OrgUnitRepository(db);
    this.positionRepo = new PositionRepository(db);
    this.employeeRepo = new EmployeeRepository(db);
  }

  // ===========================================================================
  // Stats (delegated to EmployeeRepository)
  // ===========================================================================

  getStats(context: TenantContext) {
    return this.employeeRepo.getStats(context);
  }

  // ===========================================================================
  // Org Unit Methods (delegated to OrgUnitRepository)
  // ===========================================================================

  findOrgUnits(context: TenantContext, filters?: OrgUnitFilters, pagination?: PaginationQuery) {
    return this.orgUnitRepo.findOrgUnits(context, filters, pagination);
  }

  findOrgUnitById(context: TenantContext, id: string) {
    return this.orgUnitRepo.findOrgUnitById(context, id);
  }

  findOrgUnitByCode(context: TenantContext, code: string) {
    return this.orgUnitRepo.findOrgUnitByCode(context, code);
  }

  createOrgUnit(tx: TransactionSql, context: TenantContext, data: CreateOrgUnit, createdBy: string) {
    return this.orgUnitRepo.createOrgUnit(tx, context, data, createdBy);
  }

  updateOrgUnit(tx: TransactionSql, context: TenantContext, id: string, data: UpdateOrgUnit, updatedBy: string) {
    return this.orgUnitRepo.updateOrgUnit(tx, context, id, data, updatedBy);
  }

  deleteOrgUnit(tx: TransactionSql, context: TenantContext, id: string) {
    return this.orgUnitRepo.deleteOrgUnit(tx, context, id);
  }

  orgUnitHasChildren(context: TenantContext, id: string) {
    return this.orgUnitRepo.orgUnitHasChildren(context, id);
  }

  orgUnitHasEmployees(context: TenantContext, id: string) {
    return this.orgUnitRepo.orgUnitHasEmployees(context, id);
  }

  getOrgUnitHierarchy(context: TenantContext, rootId?: string) {
    return this.orgUnitRepo.getOrgUnitHierarchy(context, rootId);
  }

  // ===========================================================================
  // Position Methods (delegated to PositionRepository)
  // ===========================================================================

  findPositions(context: TenantContext, filters?: PositionFilters, pagination?: PaginationQuery) {
    return this.positionRepo.findPositions(context, filters, pagination);
  }

  findPositionById(context: TenantContext, id: string) {
    return this.positionRepo.findPositionById(context, id);
  }

  createPosition(tx: TransactionSql, context: TenantContext, data: CreatePosition, createdBy: string) {
    return this.positionRepo.createPosition(tx, context, data, createdBy);
  }

  updatePosition(tx: TransactionSql, context: TenantContext, id: string, data: UpdatePosition, updatedBy: string) {
    return this.positionRepo.updatePosition(tx, context, id, data, updatedBy);
  }

  deletePosition(tx: TransactionSql, context: TenantContext, id: string) {
    return this.positionRepo.deletePosition(tx, context, id);
  }

  positionHasActiveAssignments(context: TenantContext, id: string) {
    return this.positionRepo.positionHasActiveAssignments(context, id);
  }

  getPositionHeadcount(context: TenantContext, positionId: string) {
    return this.positionRepo.getPositionHeadcount(context, positionId);
  }

  // ===========================================================================
  // Employee Methods (delegated to EmployeeRepository)
  // ===========================================================================

  findEmployees(context: TenantContext, filters?: EmployeeFilters, pagination?: PaginationQuery) {
    return this.employeeRepo.findEmployees(context, filters, pagination);
  }

  findEmployeeById(context: TenantContext, id: string) {
    return this.employeeRepo.findEmployeeById(context, id);
  }

  findEmployeeByNumber(context: TenantContext, employeeNumber: string) {
    return this.employeeRepo.findEmployeeByNumber(context, employeeNumber);
  }

  generateEmployeeNumber(context: TenantContext, prefix?: string) {
    return this.employeeRepo.generateEmployeeNumber(context, prefix);
  }

  createEmployee(tx: TransactionSql, context: TenantContext, data: CreateEmployee, employeeNumber: string, createdBy: string) {
    return this.employeeRepo.createEmployee(tx, context, data, employeeNumber, createdBy);
  }

  updateEmployeePersonal(tx: TransactionSql, context: TenantContext, employeeId: string, data: UpdateEmployeePersonal, updatedBy: string) {
    return this.employeeRepo.updateEmployeePersonal(tx, context, employeeId, data, updatedBy);
  }

  updateEmployeeContract(tx: TransactionSql, context: TenantContext, employeeId: string, data: UpdateEmployeeContract, updatedBy: string) {
    return this.employeeRepo.updateEmployeeContract(tx, context, employeeId, data, updatedBy);
  }

  updateEmployeePosition(tx: TransactionSql, context: TenantContext, employeeId: string, data: UpdateEmployeePosition, updatedBy: string) {
    return this.employeeRepo.updateEmployeePosition(tx, context, employeeId, data, updatedBy);
  }

  updateEmployeeCompensation(tx: TransactionSql, context: TenantContext, employeeId: string, data: UpdateEmployeeCompensation, updatedBy: string) {
    return this.employeeRepo.updateEmployeeCompensation(tx, context, employeeId, data, updatedBy);
  }

  updateEmployeeManager(tx: TransactionSql, context: TenantContext, employeeId: string, data: UpdateEmployeeManager, updatedBy: string) {
    return this.employeeRepo.updateEmployeeManager(tx, context, employeeId, data, updatedBy);
  }

  transitionEmployeeStatus(tx: TransactionSql, context: TenantContext, employeeId: string, toStatus: EmployeeStatus, effectiveDate: string, reason: string | null, updatedBy: string) {
    return this.employeeRepo.transitionEmployeeStatus(tx, context, employeeId, toStatus, effectiveDate, reason, updatedBy);
  }

  updateNiCategory(tx: TransactionSql, context: TenantContext, employeeId: string, niCategory: string) {
    return this.employeeRepo.updateNiCategory(tx, context, employeeId, niCategory);
  }

  terminateEmployee(tx: TransactionSql, context: TenantContext, employeeId: string, terminationDate: string, reason: string, updatedBy: string) {
    return this.employeeRepo.terminateEmployee(tx, context, employeeId, terminationDate, reason, updatedBy);
  }

  // ===========================================================================
  // History Methods (delegated to EmployeeRepository)
  // ===========================================================================

  getEmployeePersonalHistory(context: TenantContext, employeeId: string, dateRange?: { from?: string; to?: string }) {
    return this.employeeRepo.getEmployeePersonalHistory(context, employeeId, dateRange);
  }

  getEmployeeContractHistory(context: TenantContext, employeeId: string, dateRange?: { from?: string; to?: string }) {
    return this.employeeRepo.getEmployeeContractHistory(context, employeeId, dateRange);
  }

  getEmployeePositionHistory(context: TenantContext, employeeId: string, dateRange?: { from?: string; to?: string }) {
    return this.employeeRepo.getEmployeePositionHistory(context, employeeId, dateRange);
  }

  getEmployeeCompensationHistory(context: TenantContext, employeeId: string, dateRange?: { from?: string; to?: string }) {
    return this.employeeRepo.getEmployeeCompensationHistory(context, employeeId, dateRange);
  }

  getEmployeeManagerHistory(context: TenantContext, employeeId: string, dateRange?: { from?: string; to?: string }) {
    return this.employeeRepo.getEmployeeManagerHistory(context, employeeId, dateRange);
  }

  getEmployeeStatusHistory(context: TenantContext, employeeId: string, dateRange?: { from?: string; to?: string }) {
    return this.employeeRepo.getEmployeeStatusHistory(context, employeeId, dateRange);
  }

  // ===========================================================================
  // Overlap Checking (delegated to EmployeeRepository)
  // ===========================================================================

  checkPersonalOverlap(context: TenantContext, employeeId: string, effectiveFrom: string, effectiveTo: string | null, excludeId?: string) {
    return this.employeeRepo.checkPersonalOverlap(context, employeeId, effectiveFrom, effectiveTo, excludeId);
  }

  checkContractOverlap(context: TenantContext, employeeId: string, effectiveFrom: string, effectiveTo: string | null, excludeId?: string) {
    return this.employeeRepo.checkContractOverlap(context, employeeId, effectiveFrom, effectiveTo, excludeId);
  }

  checkPositionOverlap(context: TenantContext, employeeId: string, effectiveFrom: string, effectiveTo: string | null, isPrimary: boolean, excludeId?: string) {
    return this.employeeRepo.checkPositionOverlap(context, employeeId, effectiveFrom, effectiveTo, isPrimary, excludeId);
  }

  checkCompensationOverlap(context: TenantContext, employeeId: string, effectiveFrom: string, effectiveTo: string | null, excludeId?: string) {
    return this.employeeRepo.checkCompensationOverlap(context, employeeId, effectiveFrom, effectiveTo, excludeId);
  }

  checkReportingLineOverlap(context: TenantContext, employeeId: string, effectiveFrom: string, effectiveTo: string | null, isPrimary: boolean, excludeId?: string) {
    return this.employeeRepo.checkReportingLineOverlap(context, employeeId, effectiveFrom, effectiveTo, isPrimary, excludeId);
  }

  checkCircularReporting(context: TenantContext, employeeId: string, managerId: string) {
    return this.employeeRepo.checkCircularReporting(context, employeeId, managerId);
  }

  getEmployeeTenure(context: TenantContext, employeeId: string) {
    return this.employeeRepo.getEmployeeTenure(context, employeeId);
  }

  getEmployeeAnnualSalary(context: TenantContext, employeeId: string) {
    return this.employeeRepo.getEmployeeAnnualSalary(context, employeeId);
  }

  // ===========================================================================
  // Concurrent Employment / Multi-Position Methods
  // ===========================================================================

  findEmployeePositions(context: TenantContext, employeeId: string) {
    return this.employeeRepo.findEmployeePositions(context, employeeId);
  }

  findPositionAssignmentById(context: TenantContext, assignmentId: string) {
    return this.employeeRepo.findPositionAssignmentById(context, assignmentId);
  }

  getEmployeeTotalFte(context: TenantContext, employeeId: string, excludeAssignmentId?: string) {
    return this.employeeRepo.getEmployeeTotalFte(context, employeeId, excludeAssignmentId);
  }

  assignAdditionalPosition(
    tx: TransactionSql,
    context: TenantContext,
    employeeId: string,
    data: {
      position_id: string;
      org_unit_id: string;
      is_primary: boolean;
      fte_percentage: number;
      effective_from: string;
      assignment_reason?: string;
    },
    createdBy: string
  ) {
    return this.employeeRepo.assignAdditionalPosition(tx, context, employeeId, data, createdBy);
  }

  endPositionAssignment(tx: TransactionSql, assignmentId: string, effectiveTo: string) {
    return this.employeeRepo.endPositionAssignment(tx, assignmentId, effectiveTo);
  }

  getTenantMaxFte(context: TenantContext) {
    return this.employeeRepo.getTenantMaxFte(context);
  }

  // ===========================================================================
  // Employment Records / Rehire (delegated to EmployeeRepository)
  // ===========================================================================

  getEmploymentRecords(context: TenantContext, employeeId: string) {
    return this.employeeRepo.getEmploymentRecords(context, employeeId);
  }

  getCurrentEmploymentRecord(context: TenantContext, employeeId: string) {
    return this.employeeRepo.getCurrentEmploymentRecord(context, employeeId);
  }

  getMaxEmploymentNumber(tx: TransactionSql, employeeId: string) {
    return this.employeeRepo.getMaxEmploymentNumber(tx, employeeId);
  }

  closeCurrentEmploymentRecord(tx: TransactionSql, context: TenantContext, employeeId: string, endDate: string, terminationReason: string) {
    return this.employeeRepo.closeCurrentEmploymentRecord(tx, context, employeeId, endDate, terminationReason);
  }

  createEmploymentRecord(tx: TransactionSql, context: TenantContext, data: { employeeId: string; employmentNumber: number; startDate: string; previousEmploymentId: string | null }) {
    return this.employeeRepo.createEmploymentRecord(tx, context, data);
  }

  ensureInitialEmploymentRecord(tx: TransactionSql, context: TenantContext, employeeId: string, startDate: string) {
    return this.employeeRepo.ensureInitialEmploymentRecord(tx, context, employeeId, startDate);
  }

  rehireEmployee(tx: TransactionSql, context: TenantContext, employeeId: string, rehireDate: string, updatedBy: string) {
    return this.employeeRepo.rehireEmployee(tx, context, employeeId, rehireDate, updatedBy);
  }
}
