/**
 * Payslips Module - Elysia Routes
 *
 * API endpoints for payslip template and payslip management:
 *
 * Templates:
 * - GET /payslips/templates - List payslip templates
 * - GET /payslips/templates/:id - Get template by ID
 * - POST /payslips/templates - Create template
 * - PUT /payslips/templates/:id - Update template
 *
 * Payslips:
 * - GET /payslips/employee/:employeeId - List payslips for an employee
 * - GET /payslips/:id - Get a single payslip
 * - POST /payslips - Generate/create a payslip
 * - PATCH /payslips/:id/status - Update payslip status
 *
 * Permission model:
 * - payroll:payslip_templates: read, write
 * - payroll:payslips: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { PayslipRepository } from "./repository";
import { PayslipService } from "./service";
import {
  CreatePayslipTemplateSchema,
  UpdatePayslipTemplateSchema,
  PayslipTemplateResponseSchema,
  CreatePayslipSchema,
  UpdatePayslipStatusSchema,
  PayslipResponseSchema,
  PayslipFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreatePayslipTemplate,
  type UpdatePayslipTemplate,
  type CreatePayslip,
  type UpdatePayslipStatus,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PayslipPluginContext {
  payslipService: PayslipService;
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

const payslipErrorStatusMap: Record<string, number> = {
  INVALID_TRANSITION: 409,
};

/**
 * Payslips routes plugin
 */
export const payslipRoutes = new Elysia({
  prefix: "/payslips",
  name: "payslips-routes",
})
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new PayslipRepository(db);
    const service = new PayslipService(repository, db);
    return { payslipService: service };
  })

  // ===========================================================================
  // Payslip Template Routes
  // ===========================================================================

  // GET /templates - List payslip templates
  .get(
    "/templates",
    async (ctx) => {
      const { payslipService, query, tenantContext } = ctx as typeof ctx & PayslipPluginContext;
      const { cursor, limit } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await payslipService.listTemplates(tenantContext, {
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
      beforeHandle: [requirePermission("payroll:payslip_templates", "read")],
      query: t.Partial(PaginationQuerySchema),
      response: {
        200: t.Object({
          items: t.Array(PayslipTemplateResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "List payslip templates",
        description: "List all payslip templates for the tenant",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /templates/:id - Get template by ID
  .get(
    "/templates/:id",
    async (ctx) => {
      const { payslipService, params, tenantContext, error } = ctx as typeof ctx & PayslipPluginContext;
      const result = await payslipService.getTemplateById(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payslipErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:payslip_templates", "read")],
      params: IdParamsSchema,
      response: {
        200: PayslipTemplateResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get payslip template",
        description: "Get a single payslip template by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /templates - Create template
  .post(
    "/templates",
    async (ctx) => {
      const {
        payslipService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & PayslipPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payslipService.createTemplate(
        tenantContext,
        body as unknown as CreatePayslipTemplate,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payslipErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.payslip_template.created",
          resourceType: "payslip_template",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:payslip_templates", "write")],
      body: CreatePayslipTemplateSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PayslipTemplateResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Create payslip template",
        description: "Create a new payslip layout template",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /templates/:id - Update template
  .put(
    "/templates/:id",
    async (ctx) => {
      const {
        payslipService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & PayslipPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payslipService.updateTemplate(
        tenantContext,
        params.id,
        body as unknown as UpdatePayslipTemplate,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payslipErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.payslip_template.updated",
          resourceType: "payslip_template",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:payslip_templates", "write")],
      params: IdParamsSchema,
      body: UpdatePayslipTemplateSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PayslipTemplateResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Update payslip template",
        description: "Update an existing payslip layout template",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Payslip Routes
  // ===========================================================================

  // GET /employee/:employeeId - List payslips for an employee
  .get(
    "/employee/:employeeId",
    async (ctx) => {
      const { payslipService, params, query, tenantContext } = ctx as typeof ctx & PayslipPluginContext;
      const result = await payslipService.getPayslipsByEmployee(
        tenantContext,
        params.employeeId,
        {
          status: query.status as "draft" | "approved" | "issued" | undefined,
          payment_date_from: query.payment_date_from,
          payment_date_to: query.payment_date_to,
          cursor: query.cursor,
          limit: query.limit ? Number(query.limit) : undefined,
        }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("payroll:payslips", "read")],
      params: EmployeeIdParamsSchema,
      query: t.Partial(PayslipFiltersSchema),
      response: {
        200: t.Object({
          items: t.Array(PayslipResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "List employee payslips",
        description: "Get payslips for an employee with optional status and date filters",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /:id - Get a single payslip
  .get(
    "/:id",
    async (ctx) => {
      const { payslipService, params, tenantContext, error } = ctx as typeof ctx & PayslipPluginContext;
      const result = await payslipService.getPayslipById(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payslipErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:payslips", "read")],
      params: IdParamsSchema,
      response: {
        200: PayslipResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get payslip",
        description: "Get a single payslip by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST / - Generate/create a payslip
  .post(
    "/",
    async (ctx) => {
      const {
        payslipService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & PayslipPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as CreatePayslip;
      const result = await payslipService.createPayslip(
        tenantContext,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payslipErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.payslip.created",
          resourceType: "payslip",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            employeeId: typedBody.employee_id,
            payPeriodId: typedBody.pay_period_id,
            idempotencyKey,
            requestId,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:payslips", "write")],
      body: CreatePayslipSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PayslipResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Create payslip",
        description:
          "Generate a new payslip for an employee. Prevents duplicate payslips per employee per pay period.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /:id/status - Update payslip status
  .patch(
    "/:id/status",
    async (ctx) => {
      const {
        payslipService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & PayslipPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payslipService.updatePayslipStatus(
        tenantContext,
        params.id,
        body as unknown as UpdatePayslipStatus,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payslipErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "payroll.payslip.status_changed",
          resourceType: "payslip",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:payslips", "write")],
      params: IdParamsSchema,
      body: UpdatePayslipStatusSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PayslipResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Update payslip status",
        description:
          "Transition payslip status: draft -> approved -> issued. Validates the state machine.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type PayslipRoutes = typeof payslipRoutes;
