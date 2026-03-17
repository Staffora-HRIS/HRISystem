/**
 * Core HR Module - Repository Types
 *
 * Shared database row types and interfaces used across
 * all HR sub-repositories.
 */

import type { Row } from "../../plugins/db";
import type { EmployeeStatus } from "./schemas";

// =============================================================================
// Database Row Types
// =============================================================================

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
  ftePercentage: string;
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

export interface EmploymentRecordRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  employmentNumber: number;
  startDate: Date;
  endDate: Date | null;
  terminationReason: string | null;
  isCurrent: boolean;
  previousEmploymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
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

export type { TenantContext } from "../../types/service-result";
