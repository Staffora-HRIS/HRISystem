/**
 * Deductions Module - Elysia Routes
 *
 * API endpoints for deduction type catalogue and employee deduction assignments:
 *
 * Deduction Types:
 * - GET /deductions/types - List deduction types
 * - GET /deductions/types/:id - Get deduction type by ID
 * - POST /deductions/types - Create deduction type
 * - PUT /deductions/types/:id - Update deduction type
 *
 * Employee Deductions:
 * - GET /deductions/employee/:employeeId - List deductions for an employee
 * - GET /deductions/:id - Get a single employee deduction
 * - POST /deductions - Create an employee deduction
 * - PUT /deductions/:id - Update an employee deduction
 *
 * Permission model:
 * - payroll:deduction_types: read, write
 * - payroll:deductions: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { DeductionRepository } from "./repository";
import { DeductionService } from "./service";
import {
  CreateDeductionTypeSchema,
  UpdateDeductionTypeSchema,
  DeductionTypeResponseSchema,
  CreateEmployeeDeductionSchema,
  UpdateEmployeeDeductionSchema,
  EmployeeDeductionResponseSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateDeductionType,
  type UpdateDeductionType,
  type CreateEmployeeDeduction,
  type UpdateEmployeeDeduction,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface DeductionPluginContext {
  deductionService: DeductionService;
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

const deductionErrorStatusMap: Record<string, number> = {
  EFFECTIVE_DATE_OVERLAP: 409,
};

/**
 * Deductions routes plugin
 */
export const deductionRoutes = new Elysia({
  prefix: "/deductions",
  name: "deductions-routes",
})
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new DeductionRepository(db);
    const service = new DeductionService(repository, db);
    return { deductionService: service };
  })

  // ===========================================================================
  // Deduction Type Routes
  // ===========================================================================

  // GET /types - List deduction types
  .get(
    "/types",
    async (ctx) => {
      const { deductionService, query, tenantContext } = ctx as typeof ctx & DeductionPluginContext;
      const { cursor, limit } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await deductionService.listDeductionTypes(tenantContext, {
        cursor,
        limit: parsedLimit,
      });

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("payroll:deduction_types", "read")],
      query: t.Partial(PaginationQuerySchema),
      response: {
        200: t.Object({
          items: t.Array(DeductionTypeResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "List deduction types",
        description: "List all deduction types for the tenant",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /types/:id - Get deduction type by ID
  .get(
    "/types/:id",
    async (ctx) => {
      const { deductionService, params, tenantContext, error } = ctx as typeof ctx & DeductionPluginContext;
      const result = await deductionService.getDeductionTypeById(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          deductionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:deduction_types", "read")],
      params: IdParamsSchema,
      response: {
        200: DeductionTypeResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get deduction type",
        description: "Get a single deduction type by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /types - Create deduction type
  .post(
    "/types",
    async (ctx) => {
      const {
        deductionService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & DeductionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await deductionService.createDeductionType(
        tenantContext,
        body as unknown as CreateDeductionType,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          deductionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.deduction_type.created",
          resourceType: "deduction_type",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:deduction_types", "write")],
      body: CreateDeductionTypeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: DeductionTypeResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Create deduction type",
        description: "Create a new deduction type in the catalogue",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /types/:id - Update deduction type
  .put(
    "/types/:id",
    async (ctx) => {
      const {
        deductionService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & DeductionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await deductionService.updateDeductionType(
        tenantContext,
        params.id,
        body as unknown as UpdateDeductionType,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          deductionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.deduction_type.updated",
          resourceType: "deduction_type",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:deduction_types", "write")],
      params: IdParamsSchema,
      body: UpdateDeductionTypeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DeductionTypeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Update deduction type",
        description: "Update an existing deduction type",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Employee Deduction Routes
  // ===========================================================================

  // GET /employee/:employeeId - List deductions for an employee
  .get(
    "/employee/:employeeId",
    async (ctx) => {
      const { deductionService, params, tenantContext, error } = ctx as typeof ctx & DeductionPluginContext;
      const result = await deductionService.getEmployeeDeductionsByEmployee(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          deductionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("payroll:deductions", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: t.Object({
          items: t.Array(EmployeeDeductionResponseSchema),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "List employee deductions",
        description: "Get all current and historical deductions for an employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /:id - Get a single employee deduction
  .get(
    "/:id",
    async (ctx) => {
      const { deductionService, params, tenantContext, error } = ctx as typeof ctx & DeductionPluginContext;
      const result = await deductionService.getEmployeeDeductionById(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          deductionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:deductions", "read")],
      params: IdParamsSchema,
      response: {
        200: EmployeeDeductionResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get employee deduction",
        description: "Get a single employee deduction by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST / - Create an employee deduction
  .post(
    "/",
    async (ctx) => {
      const {
        deductionService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & DeductionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as CreateEmployeeDeduction;
      const result = await deductionService.createEmployeeDeduction(
        tenantContext,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          deductionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.employee_deduction.created",
          resourceType: "employee_deduction",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            employeeId: typedBody.employee_id,
            deductionTypeId: typedBody.deduction_type_id,
            idempotencyKey,
            requestId,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:deductions", "write")],
      body: CreateEmployeeDeductionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: EmployeeDeductionResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Create employee deduction",
        description:
          "Assign a deduction to an employee with effective dating. Prevents overlapping deductions of the same type.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /:id - Update an employee deduction
  .put(
    "/:id",
    async (ctx) => {
      const {
        deductionService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & DeductionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await deductionService.updateEmployeeDeduction(
        tenantContext,
        params.id,
        body as unknown as UpdateEmployeeDeduction,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          deductionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.employee_deduction.updated",
          resourceType: "employee_deduction",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:deductions", "write")],
      params: IdParamsSchema,
      body: UpdateEmployeeDeductionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EmployeeDeductionResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Update employee deduction",
        description: "Update an existing employee deduction record",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type DeductionRoutes = typeof deductionRoutes;
