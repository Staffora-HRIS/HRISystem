/**
 * Beneficiary Nominations Module - Elysia Routes
 *
 * Defines the API endpoints for beneficiary nomination operations.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - benefits: read  (for listing/viewing nominations)
 * - benefits: write (for creating/updating/deleting nominations)
 *
 * Routes:
 * - GET    /employees/:employeeId/beneficiary-nominations           - List nominations for employee
 * - GET    /employees/:employeeId/beneficiary-nominations/summary   - Percentage summary per benefit type
 * - POST   /employees/:employeeId/beneficiary-nominations           - Create nomination for employee
 * - GET    /beneficiary-nominations/:id                             - Get a single nomination
 * - PATCH  /beneficiary-nominations/:id                             - Update a nomination
 * - DELETE /beneficiary-nominations/:id                             - Delete a nomination
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { BeneficiaryNominationRepository } from "./repository";
import { BeneficiaryNominationService } from "./service";
import {
  CreateBeneficiaryNominationSchema,
  UpdateBeneficiaryNominationSchema,
  BeneficiaryNominationResponseSchema,
  PercentageSummarySchema,
  NominationFiltersSchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateBeneficiaryNomination,
  type UpdateBeneficiaryNomination,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface BeneficiaryNominationPluginContext {
  bnService: BeneficiaryNominationService;
  bnRepository: BeneficiaryNominationRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface BeneficiaryNominationRouteContext extends BeneficiaryNominationPluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

/**
 * Create Beneficiary Nomination routes plugin
 */
export const beneficiaryNominationRoutes = new Elysia({ name: "beneficiary-nomination-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new BeneficiaryNominationRepository(db);
    const service = new BeneficiaryNominationService(repository, db);

    return { bnService: service, bnRepository: repository };
  })

  // ===========================================================================
  // Employee-Scoped Routes
  // ===========================================================================

  // GET /employees/:employeeId/beneficiary-nominations - List nominations for employee
  .get(
    "/employees/:employeeId/beneficiary-nominations",
    async (ctx) => {
      const { bnService, params, query, tenantContext } = ctx as unknown as BeneficiaryNominationRouteContext;
      const { cursor, limit, benefit_type } = query;

      const result = await bnService.listByEmployee(
        tenantContext,
        params.employeeId,
        { cursor, limit, benefit_type }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("benefits", "read")],
      params: EmployeeIdParamsSchema,
      query: t.Partial(NominationFiltersSchema),
      response: t.Object({
        items: t.Array(BeneficiaryNominationResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["HR"],
        summary: "List beneficiary nominations for an employee",
        description:
          "Returns all beneficiary nominations for the specified employee with cursor-based pagination. " +
          "Optionally filter by benefit_type.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /employees/:employeeId/beneficiary-nominations/summary - Percentage summary
  .get(
    "/employees/:employeeId/beneficiary-nominations/summary",
    async (ctx) => {
      const { bnService, params, tenantContext, error } = ctx as unknown as BeneficiaryNominationRouteContext;

      const result = await bnService.getPercentageSummary(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      return { items: result.data! };
    },
    {
      beforeHandle: [requirePermission("benefits", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: t.Object({
          items: t.Array(PercentageSummarySchema),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Get beneficiary nomination percentage summary",
        description:
          "Returns a summary of total allocation percentages per benefit type for the employee. " +
          "Each item indicates whether the total is exactly 100% (isComplete).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /employees/:employeeId/beneficiary-nominations - Create nomination
  .post(
    "/employees/:employeeId/beneficiary-nominations",
    async (ctx) => {
      const { bnService, params, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as unknown as BeneficiaryNominationRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await bnService.create(
        tenantContext,
        params.employeeId,
        body as unknown as CreateBeneficiaryNomination,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "beneficiary_nomination",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, employeeId: params.employeeId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits", "write")],
      params: EmployeeIdParamsSchema,
      body: CreateBeneficiaryNominationSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: BeneficiaryNominationResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Create a beneficiary nomination",
        description:
          "Create a new beneficiary nomination for the specified employee. " +
          "The total percentage for all nominations of the same benefit_type must not exceed 100.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Nomination-Scoped Routes
  // ===========================================================================

  // GET /beneficiary-nominations/:id - Get a single nomination
  .get(
    "/beneficiary-nominations/:id",
    async (ctx) => {
      const { bnService, params, tenantContext, error } = ctx as unknown as BeneficiaryNominationRouteContext;

      const result = await bnService.getById(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits", "read")],
      params: IdParamsSchema,
      response: {
        200: BeneficiaryNominationResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Get a beneficiary nomination",
        description: "Get a single beneficiary nomination by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /beneficiary-nominations/:id - Update a nomination
  .patch(
    "/beneficiary-nominations/:id",
    async (ctx) => {
      const { bnService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as unknown as BeneficiaryNominationRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit diff
      const oldResult = await bnService.getById(tenantContext, params.id);

      const result = await bnService.update(
        tenantContext,
        params.id,
        body as unknown as UpdateBeneficiaryNomination,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "beneficiary_nomination",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            employeeId: result.data?.employeeId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits", "write")],
      params: IdParamsSchema,
      body: UpdateBeneficiaryNominationSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: BeneficiaryNominationResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Update a beneficiary nomination",
        description:
          "Update fields on an existing beneficiary nomination. " +
          "If percentage is changed, the total for that benefit_type must not exceed 100.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /beneficiary-nominations/:id - Delete a nomination
  .delete(
    "/beneficiary-nominations/:id",
    async (ctx) => {
      const { bnService, params, headers, tenantContext, audit, requestId, error } =
        ctx as unknown as BeneficiaryNominationRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await bnService.getById(tenantContext, params.id);

      const result = await bnService.delete(tenantContext, params.id, idempotencyKey);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "beneficiary_nomination",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: {
            idempotencyKey,
            requestId,
            employeeId: oldResult.data?.employeeId,
          },
        });
      }

      return { success: true as const, message: "Beneficiary nomination deleted successfully" };
    },
    {
      beforeHandle: [requirePermission("benefits", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Delete a beneficiary nomination",
        description: "Permanently delete a beneficiary nomination record",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type BeneficiaryNominationRoutes = typeof beneficiaryNominationRoutes;
