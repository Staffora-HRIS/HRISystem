/**
 * Benefits Module - Flex Fund Routes
 *
 * CRUD endpoints for flexible benefit fund allocation.
 * Mounted under /benefits by the parent routes.ts.
 *
 * Routes:
 *   GET    /flex-fund/options                    - List available flex-eligible benefit plans
 *   GET    /flex-fund/:employeeId                - Get current fund balance for an employee
 *   POST   /flex-fund                            - Create a new flex fund for an employee (admin)
 *   POST   /flex-fund/:employeeId/allocate       - Allocate credits to a benefit
 *   DELETE /flex-fund/allocations/:id            - Cancel an allocation
 *
 * Permission model:
 *   - benefits:flex_fund: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { FlexFundRepository } from "./flex-fund.repository";
import { FlexFundService } from "./flex-fund.service";
import {
  CreateFlexFund,
  AllocateCredits,
  CancelAllocation,
  FlexFundResponse,
  FlexAllocationResponse,
  FlexBenefitOption,
} from "./flex-fund.schemas";
import {
  OptionalIdempotencyHeaderSchema,
  benefitsErrorStatusMap,
} from "./routes.shared";

// =============================================================================
// Flex Fund Error Status Map
// =============================================================================

const flexFundErrorStatusMap: Record<string, number> = {
  ...benefitsErrorStatusMap,
  FLEX_FUND_NOT_FOUND: 404,
  ALLOCATION_NOT_FOUND: 404,
  INSUFFICIENT_LEAVE_BALANCE: 400,
  EFFECTIVE_DATE_OVERLAP: 409,
  STATE_MACHINE_VIOLATION: 409,
  PLAN_NOT_ELIGIBLE: 400,
};

// =============================================================================
// Param Schemas
// =============================================================================

const EmployeeIdParamsSchema = t.Object({
  employeeId: t.String({ format: "uuid" }),
});

const AllocationIdParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

// =============================================================================
// Flex Fund Routes
// =============================================================================

export const flexFundRoutes = new Elysia({ name: "benefits-flex-fund-routes" })

  // Derive flex fund service (reuses db from parent derive)
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new FlexFundRepository(db);
    const service = new FlexFundService(repository, db);
    return { flexFundService: service };
  })

  // ===========================================================================
  // GET /flex-fund/options - List available flex-eligible benefit plans
  // ===========================================================================
  .get(
    "/flex-fund/options",
    async (ctx) => {
      const { flexFundService, tenantContext, error } = ctx as any;
      const result = await flexFundService.listFlexOptions(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", flexFundErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:flex_fund", "read")],
      response: {
        200: t.Array(FlexBenefitOption),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Flex Fund"],
        summary: "List flex-eligible benefit options",
        description: "List all benefit plans that have a credit cost set and are eligible for flex-fund allocation",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /flex-fund/:employeeId - Get current fund balance
  // ===========================================================================
  .get(
    "/flex-fund/:employeeId",
    async (ctx) => {
      const { flexFundService, params, tenantContext, error } = ctx as any;
      const result = await flexFundService.getEmployeeFund(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", flexFundErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:flex_fund", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: FlexFundResponse,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Flex Fund"],
        summary: "Get employee flex fund balance",
        description: "Get the current flex benefit fund balance and allocations for an employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /flex-fund - Create a new flex fund (admin)
  // ===========================================================================
  .post(
    "/flex-fund",
    async (ctx) => {
      const { flexFundService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await flexFundService.createFund(tenantContext, {
        employeeId: body.employee_id,
        annualCredits: body.annual_credits,
        periodStart: body.period_start,
        periodEnd: body.period_end,
      });

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", flexFundErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "FLEX_FUND_CREATED",
          resourceType: "flex_benefit_fund",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:flex_fund", "write")],
      body: CreateFlexFund,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: FlexFundResponse,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Flex Fund"],
        summary: "Create flex benefit fund",
        description: "Create a new flex benefit fund (credit pool) for an employee with annual credits and a period window",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /flex-fund/:employeeId/allocate - Allocate credits to a benefit
  // ===========================================================================
  .post(
    "/flex-fund/:employeeId/allocate",
    async (ctx) => {
      const { flexFundService, params, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await flexFundService.allocateCredits(
        tenantContext,
        params.employeeId,
        {
          benefitPlanId: body.benefit_plan_id,
          creditsAllocated: body.credits_allocated,
        }
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", flexFundErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "FLEX_FUND_ALLOCATION_CREATED",
          resourceType: "flex_benefit_allocation",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            employeeId: params.employeeId,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:flex_fund", "write")],
      params: EmployeeIdParamsSchema,
      body: AllocateCredits,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: FlexAllocationResponse,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Flex Fund"],
        summary: "Allocate flex credits to a benefit",
        description: "Allocate credits from the employee's flex fund to a specific benefit plan. Validates sufficient balance, plan eligibility, and enrollment window.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // DELETE /flex-fund/allocations/:id - Cancel an allocation
  // ===========================================================================
  .delete(
    "/flex-fund/allocations/:id",
    async (ctx) => {
      const { flexFundService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await flexFundService.cancelAllocation(
        tenantContext,
        params.id,
        body?.reason
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", flexFundErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "FLEX_FUND_ALLOCATION_CANCELLED",
          resourceType: "flex_benefit_allocation",
          resourceId: params.id,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            cancelledReason: body?.reason,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:flex_fund", "write")],
      params: AllocationIdParamsSchema,
      body: t.Optional(CancelAllocation),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: FlexAllocationResponse,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Flex Fund"],
        summary: "Cancel flex fund allocation",
        description: "Cancel an existing allocation, releasing credits back to the employee's flex fund",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type FlexFundRoutes = typeof flexFundRoutes;
