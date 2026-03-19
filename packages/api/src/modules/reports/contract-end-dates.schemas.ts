/**
 * Contract End Date Report - TypeBox Schemas
 *
 * Validation schemas for the contract end date reporting endpoint.
 * Used by GET /api/v1/reports/contract-end-dates
 */

import { t, type Static } from "elysia";

// =============================================================================
// Query Parameters
// =============================================================================

export const ContractEndDateQuerySchema = t.Object({
  days_ahead: t.Optional(t.String()),
  contract_type: t.Optional(
    t.Union([
      t.Literal("fixed_term"),
      t.Literal("contractor"),
      t.Literal("intern"),
      t.Literal("temporary"),
    ])
  ),
  department_id: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.String()),
});
export type ContractEndDateQuery = Static<typeof ContractEndDateQuerySchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const ContractEndDateItemSchema = t.Object({
  employeeId: t.String(),
  employeeNumber: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  departmentId: t.Union([t.String(), t.Null()]),
  departmentName: t.Union([t.String(), t.Null()]),
  contractType: t.String(),
  contractEndDate: t.String(),
  daysRemaining: t.Number(),
  contractId: t.String(),
});
export type ContractEndDateItem = Static<typeof ContractEndDateItemSchema>;

export const ContractEndDateResponseSchema = t.Object({
  data: t.Array(ContractEndDateItemSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
  total: t.Number(),
});
export type ContractEndDateResponse = Static<typeof ContractEndDateResponseSchema>;
