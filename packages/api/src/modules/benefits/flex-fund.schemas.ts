/**
 * Flexible Benefits Fund - TypeBox Schemas
 *
 * Defines request/response schemas for flex benefit fund allocation.
 * Part of the Benefits module.
 */

import { Type, type Static } from "@sinclair/typebox";

// =============================================================================
// Enums
// =============================================================================

export const FlexAllocationStatus = Type.Union([
  Type.Literal("pending"),
  Type.Literal("confirmed"),
  Type.Literal("cancelled"),
]);

export type FlexAllocationStatus = Static<typeof FlexAllocationStatus>;

// =============================================================================
// Fund Schemas
// =============================================================================

export const CreateFlexFund = Type.Object({
  employee_id: Type.String({ format: "uuid" }),
  annual_credits: Type.Number({ minimum: 0.01, description: "Total annual credit allowance" }),
  period_start: Type.String({ format: "date", description: "Start of the benefit period" }),
  period_end: Type.String({ format: "date", description: "End of the benefit period" }),
});

export type CreateFlexFund = Static<typeof CreateFlexFund>;

export const FlexFundResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  tenant_id: Type.String({ format: "uuid" }),
  employee_id: Type.String({ format: "uuid" }),
  annual_credits: Type.Number(),
  used_credits: Type.Number(),
  remaining_credits: Type.Number(),
  period_start: Type.String(),
  period_end: Type.String(),
  allocations: Type.Optional(Type.Array(Type.Object({
    id: Type.String({ format: "uuid" }),
    benefit_plan_id: Type.String({ format: "uuid" }),
    benefit_plan_name: Type.Union([Type.String(), Type.Null()]),
    credits_allocated: Type.Number(),
    status: FlexAllocationStatus,
    created_at: Type.String(),
    confirmed_at: Type.Union([Type.String(), Type.Null()]),
  }))),
  created_at: Type.String(),
  updated_at: Type.String(),
});

export type FlexFundResponse = Static<typeof FlexFundResponse>;

// =============================================================================
// Allocation Schemas
// =============================================================================

export const AllocateCredits = Type.Object({
  benefit_plan_id: Type.String({ format: "uuid" }),
  credits_allocated: Type.Number({
    minimum: 0.01,
    description: "Number of credits to allocate to this benefit",
  }),
});

export type AllocateCredits = Static<typeof AllocateCredits>;

export const FlexAllocationResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  tenant_id: Type.String({ format: "uuid" }),
  fund_id: Type.String({ format: "uuid" }),
  benefit_plan_id: Type.String({ format: "uuid" }),
  benefit_plan_name: Type.Union([Type.String(), Type.Null()]),
  credits_allocated: Type.Number(),
  status: FlexAllocationStatus,
  created_at: Type.String(),
  updated_at: Type.String(),
  confirmed_at: Type.Union([Type.String(), Type.Null()]),
  cancelled_at: Type.Union([Type.String(), Type.Null()]),
  cancelled_reason: Type.Union([Type.String(), Type.Null()]),
});

export type FlexAllocationResponse = Static<typeof FlexAllocationResponse>;

export const CancelAllocation = Type.Object({
  reason: Type.Optional(Type.String({ maxLength: 500 })),
});

export type CancelAllocation = Static<typeof CancelAllocation>;

// =============================================================================
// Flex Options (available plans with credit costs)
// =============================================================================

export const FlexBenefitOption = Type.Object({
  plan_id: Type.String({ format: "uuid" }),
  plan_name: Type.String(),
  category: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  credit_cost: Type.Number(),
  is_active: Type.Boolean(),
});

export type FlexBenefitOption = Static<typeof FlexBenefitOption>;

// =============================================================================
// Pagination
// =============================================================================

export const FlexFundPaginationQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  cursor: Type.Optional(Type.String()),
});

export type FlexFundPaginationQuery = Static<typeof FlexFundPaginationQuery>;
