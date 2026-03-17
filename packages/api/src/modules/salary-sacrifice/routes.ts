/**
 * Salary Sacrifice Module - Elysia Routes
 *
 * API endpoints for salary sacrifice management:
 *
 * - GET    /salary-sacrifices              - List salary sacrifices (with filters)
 * - GET    /salary-sacrifices/:id          - Get a single salary sacrifice
 * - GET    /salary-sacrifices/employee/:employeeId - List sacrifices for an employee
 * - POST   /salary-sacrifices              - Create a salary sacrifice
 * - PUT    /salary-sacrifices/:id          - Update a salary sacrifice
 * - DELETE /salary-sacrifices/:id          - End a salary sacrifice (soft delete)
 *
 * Permission model:
 * - payroll:salary_sacrifices: read, write
 *
 * NMW compliance:
 * - POST and PUT validate that the employee's post-sacrifice salary
 *   does not fall below the National Minimum Wage
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { SalarySacrificeRepository } from "./repository";
import { SalarySacrificeService } from "./service";
import {
  CreateSalarySacrificeSchema,
  UpdateSalarySacrificeSchema,
  SalarySacrificeResponseSchema,
  SalarySacrificeFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateSalarySacrifice,
  type UpdateSalarySacrifice,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface SalarySacrificePluginContext {
  salarySacrificeService: SalarySacrificeService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
  error: (status: number, body: unknown) => never;
}

const salarySacrificeErrorStatusMap: Record<string, number> = {
  STATE_MACHINE_VIOLATION: 409,
};

/**
 * Salary Sacrifice routes plugin
 */
export const salarySacrificeRoutes = new Elysia({
  prefix: "/salary-sacrifices",
  name: "salary-sacrifice-routes",
})
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new SalarySacrificeRepository(db);
    const service = new SalarySacrificeService(repository, db);
    return { salarySacrificeService: service };
  })

  // ===========================================================================
  // GET / - List salary sacrifices (with optional filters)
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { salarySacrificeService, query, tenantContext } =
        ctx as typeof ctx & SalarySacrificePluginContext;
      const { cursor, limit, employee_id, sacrifice_type, status } =
        query as Record<string, string | undefined>;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await salarySacrificeService.list(
        tenantContext,
        {
          employee_id,
          sacrifice_type: sacrifice_type as any,
          status: status as any,
        },
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("payroll:salary_sacrifices", "read")],
      query: t.Intersect([
        t.Partial(PaginationQuerySchema),
        t.Partial(SalarySacrificeFiltersSchema),
      ]),
      response: {
        200: t.Object({
          items: t.Array(SalarySacrificeResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "List salary sacrifices",
        description:
          "List salary sacrifice arrangements with optional employee, type, and status filters",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /employee/:employeeId - List sacrifices for an employee
  // ===========================================================================
  .get(
    "/employee/:employeeId",
    async (ctx) => {
      const { salarySacrificeService, params, tenantContext, error } =
        ctx as typeof ctx & SalarySacrificePluginContext;

      const result = await salarySacrificeService.listByEmployee(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          salarySacrificeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("payroll:salary_sacrifices", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: t.Object({
          items: t.Array(SalarySacrificeResponseSchema),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "List employee salary sacrifices",
        description:
          "Get all salary sacrifice arrangements for a specific employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /:id - Get a single salary sacrifice
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { salarySacrificeService, params, tenantContext, error } =
        ctx as typeof ctx & SalarySacrificePluginContext;

      const result = await salarySacrificeService.getById(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          salarySacrificeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:salary_sacrifices", "read")],
      params: IdParamsSchema,
      response: {
        200: SalarySacrificeResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get salary sacrifice",
        description: "Get a single salary sacrifice arrangement by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST / - Create a salary sacrifice
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const {
        salarySacrificeService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & SalarySacrificePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as CreateSalarySacrifice;
      const result = await salarySacrificeService.create(
        tenantContext,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          salarySacrificeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.salary_sacrifice.created",
          resourceType: "salary_sacrifice",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            employeeId: typedBody.employee_id,
            sacrificeType: typedBody.sacrifice_type,
            idempotencyKey,
            requestId,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:salary_sacrifices", "write")],
      body: CreateSalarySacrificeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: SalarySacrificeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Create salary sacrifice",
        description:
          "Create a new salary sacrifice arrangement. Validates that the employee's post-sacrifice salary does not fall below the National Minimum Wage.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PUT /:id - Update a salary sacrifice
  // ===========================================================================
  .put(
    "/:id",
    async (ctx) => {
      const {
        salarySacrificeService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & SalarySacrificePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await salarySacrificeService.update(
        tenantContext,
        params.id,
        body as unknown as UpdateSalarySacrifice,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          salarySacrificeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.salary_sacrifice.updated",
          resourceType: "salary_sacrifice",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:salary_sacrifices", "write")],
      params: IdParamsSchema,
      body: UpdateSalarySacrificeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SalarySacrificeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Update salary sacrifice",
        description:
          "Update an existing salary sacrifice arrangement. Validates NMW compliance on amount or frequency changes.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // DELETE /:id - End a salary sacrifice (soft delete)
  // ===========================================================================
  .delete(
    "/:id",
    async (ctx) => {
      const {
        salarySacrificeService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & SalarySacrificePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await salarySacrificeService.end(
        tenantContext,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          salarySacrificeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.salary_sacrifice.ended",
          resourceType: "salary_sacrifice",
          resourceId: params.id,
          metadata: { idempotencyKey, requestId },
        });
      }

      return { success: true, message: "Salary sacrifice ended" };
    },
    {
      beforeHandle: [requirePermission("payroll:salary_sacrifices", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: t.Object({
          success: t.Literal(true),
          message: t.String(),
        }),
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "End salary sacrifice",
        description:
          "End (soft delete) a salary sacrifice arrangement. Sets status to 'ended'.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type SalarySacrificeRoutes = typeof salarySacrificeRoutes;
