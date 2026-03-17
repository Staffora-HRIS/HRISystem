/**
 * Core HR Module
 *
 * Provides the complete API layer for Core HR operations including:
 * - Organizational Units (org_units)
 * - Positions
 * - Employees with effective-dated records
 * - Employee Addresses with effective dating and UK postcode validation
 * - History tracking
 *
 * Usage:
 * ```typescript
 * import { hrRoutes } from './modules/hr';
 *
 * const app = new Elysia()
 *   .use(hrRoutes);
 * ```
 */

// Export routes
export { hrRoutes, type HRRoutes } from "./routes";

// Export service
export { HRService } from "./service";
export { AddressService, isValidUkPostcode } from "./address.service";
export type { AddressResponse } from "./address.service";
export type { ServiceResult, PaginatedServiceResult, TenantContext as ServiceTenantContext } from "../../types/service-result";

// Export repository
export {
  HRRepository,
  type TenantContext,
  type PaginatedResult,
  type OrgUnitRow,
  type PositionRow,
  type EmployeeRow,
  type EmployeePersonalRow,
  type EmployeeContractRow,
  type PositionAssignmentRow,
  type ReportingLineRow,
  type CompensationRow,
  type StatusHistoryRow,
  type EmploymentRecordRow,
} from "./repository";

// Export address repository
export { AddressRepository, type EmployeeAddressRow } from "./address.repository";

// Export schemas
export {
  // Enums
  EmployeeStatusSchema,
  ContractTypeSchema,
  EmploymentTypeSchema,
  GenderSchema,
  MaritalStatusSchema,
  AddressTypeSchema,
  ContactTypeSchema,
  PayFrequencySchema,
  RelationshipTypeSchema,
  HistoryDimensionSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  UkPostcodeSchema,
  // Org Unit
  CreateOrgUnitSchema,
  UpdateOrgUnitSchema,
  OrgUnitResponseSchema,
  OrgUnitFiltersSchema,
  // Position
  CreatePositionSchema,
  UpdatePositionSchema,
  PositionResponseSchema,
  PositionFiltersSchema,
  // Employee
  EmployeePersonalInputSchema,
  EmployeeContractInputSchema,
  EmployeePositionInputSchema,
  EmployeeCompensationInputSchema,
  EmployeeContactInputSchema,
  EmployeeAddressInputSchema,
  CreateEmployeeSchema,
  UpdateEmployeePersonalSchema,
  UpdateEmployeeContractSchema,
  UpdateEmployeePositionSchema,
  UpdateEmployeeCompensationSchema,
  UpdateEmployeeManagerSchema,
  EmployeeStatusTransitionSchema,
  EmployeeTerminationSchema,
  RehireEmployeeSchema,
  EmploymentRecordResponseSchema,
  RehireResponseSchema,
  EmployeeResponseSchema,
  EmployeeListItemSchema,
  EmployeeListResponseSchema,
  EmployeeFiltersSchema,
  // Address CRUD
  CreateEmployeeAddressSchema,
  UpdateEmployeeAddressSchema,
  CloseEmployeeAddressSchema,
  EmployeeAddressResponseSchema,
  EmployeeAddressListResponseSchema,
  EmployeeAddressIdParamsSchema,
  AddressHistoryQuerySchema,
  // History
  EmployeeHistoryQuerySchema,
  HistoryRecordSchema,
  EmployeeHistoryResponseSchema,
  // Params
  IdParamsSchema,
  EmployeeNumberParamsSchema,
  HistoryDimensionParamsSchema,
  // Headers
  IdempotencyHeaderSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type EmployeeStatus,
  type ContractType,
  type EmploymentType,
  type Gender,
  type MaritalStatus,
  type AddressType,
  type ContactType,
  type PayFrequency,
  type RelationshipType,
  type HistoryDimension,
  type PaginationQuery,
  type CreateOrgUnit,
  type UpdateOrgUnit,
  type OrgUnitResponse,
  type OrgUnitFilters,
  type CreatePosition,
  type UpdatePosition,
  type PositionResponse,
  type PositionFilters,
  type EmployeePersonalInput,
  type EmployeeContractInput,
  type EmployeePositionInput,
  type EmployeeCompensationInput,
  type EmployeeContactInput,
  type EmployeeAddressInput,
  type CreateEmployee,
  type UpdateEmployeePersonal,
  type UpdateEmployeeContract,
  type UpdateEmployeePosition,
  type UpdateEmployeeCompensation,
  type UpdateEmployeeManager,
  type EmployeeStatusTransition,
  type EmployeeTermination,
  type RehireEmployee,
  type EmploymentRecordResponse,
  type RehireResponse,
  type EmployeeResponse,
  type EmployeeListItem,
  type EmployeeListResponse,
  type EmployeeFilters,
  type CreateEmployeeAddress,
  type UpdateEmployeeAddress,
  type CloseEmployeeAddress,
  type EmployeeAddressResponse,
  type EmployeeAddressListResponse,
  type EmployeeAddressIdParams,
  type AddressHistoryQuery,
  type EmployeeHistoryQuery,
  type HistoryRecord,
  type EmployeeHistoryResponse,
  type IdParams,
  type EmployeeNumberParams,
  type HistoryDimensionParams,
  type IdempotencyHeader,
  type OptionalIdempotencyHeader,
} from "./schemas";
