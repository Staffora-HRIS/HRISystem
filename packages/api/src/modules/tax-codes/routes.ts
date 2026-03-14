/**
 * Tax Codes Module - Elysia Routes
 *
 * API endpoints for employee tax code management:
 * - GET /tax-codes/employee/:employeeId - List tax codes for an employee
 * - GET /tax-codes/:id - Get a single tax code
 * - POST /tax-codes - Create a new tax code
 * - PUT /tax-codes/:id - Update an existing tax code
 *
 * Permission model:
 * - payroll:tax_codes: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { TaxCodeRepository } from "./repository";
import { TaxCodeService } from "./service";
import {
  CreateTaxCodeSchema,
  UpdateTaxCodeSchema,
  TaxCodeResponseSchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateTaxCode,
  type UpdateTaxCode,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface TaxCodePluginContext {
  taxCodeService: TaxCodeService;
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

const taxCodeErrorStatusMap: Record<string, number> = {
  EFFECTIVE_DATE_OVERLAP: 409,
};

/**
 * Tax Codes routes plugin
 */
export const taxCodeRoutes = new Elysia({
  prefix: "/tax-codes",
  name: "tax-codes-routes",
})
  // ===========================================================================
  // Plugin Setup
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new TaxCodeRepository(db);
    const service = new TaxCodeService(repository, db);
    return { taxCodeService: service };
  })

  // ===========================================================================
  // GET /employee/:employeeId - List tax codes for an employee
  // ===========================================================================
  .get(
    "/employee/:employeeId",
    async (ctx) => {
      const { taxCodeService, params, tenantContext, error } = ctx as typeof ctx & TaxCodePluginContext;
      const result = await taxCodeService.getTaxCodesByEmployee(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          taxCodeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("payroll:tax_codes", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: t.Object({
          items: t.Array(TaxCodeResponseSchema),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "List employee tax codes",
        description: "Get all current and historical tax code records for an employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /:id - Get a single tax code
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { taxCodeService, params, tenantContext, error } = ctx as typeof ctx & TaxCodePluginContext;
      const result = await taxCodeService.getTaxCodeById(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          taxCodeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:tax_codes", "read")],
      params: IdParamsSchema,
      response: {
        200: TaxCodeResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get tax code by ID",
        description: "Get a single tax code record by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST / - Create a new tax code
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const {
        taxCodeService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & TaxCodePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await taxCodeService.createTaxCode(
        tenantContext,
        body as unknown as CreateTaxCode,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          taxCodeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.tax_code.created",
          resourceType: "employee_tax_code",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:tax_codes", "write")],
      body: CreateTaxCodeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: TaxCodeResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Create employee tax code",
        description:
          "Create a new HMRC tax code record for an employee with effective dating. Prevents overlapping records.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PUT /:id - Update an existing tax code
  // ===========================================================================
  .put(
    "/:id",
    async (ctx) => {
      const {
        taxCodeService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & TaxCodePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await taxCodeService.updateTaxCode(
        tenantContext,
        params.id,
        body as unknown as UpdateTaxCode,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          taxCodeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.tax_code.updated",
          resourceType: "employee_tax_code",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:tax_codes", "write")],
      params: IdParamsSchema,
      body: UpdateTaxCodeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: TaxCodeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Update employee tax code",
        description: "Update an existing tax code record. Validates cumulative/week1 consistency.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type TaxCodeRoutes = typeof taxCodeRoutes;
