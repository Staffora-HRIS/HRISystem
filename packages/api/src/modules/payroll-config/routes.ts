/**
 * Payroll Config Module - Elysia Routes
 *
 * Defines the API endpoints for payroll configuration:
 * - Pay Schedules (CRUD)
 * - Employee Pay Assignments (effective-dated)
 * - NI Categories (effective-dated)
 *
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - payroll:schedules: read, write
 * - payroll:assignments: read, write
 * - payroll:ni_categories: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { PayrollConfigRepository } from "./repository";
import { PayrollConfigService } from "./service";
import {
  // Schemas
  CreatePayScheduleSchema,
  UpdatePayScheduleSchema,
  PayScheduleResponseSchema,
  CreatePayAssignmentSchema,
  UpdatePayAssignmentSchema,
  PayAssignmentResponseSchema,
  CreateNiCategorySchema,
  UpdateNiCategorySchema,
  NiCategoryResponseSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type CreatePaySchedule,
  type UpdatePaySchedule,
  type CreatePayAssignment,
  type UpdatePayAssignment,
  type CreateNiCategory,
  type UpdateNiCategory,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & PayrollConfigPluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface PayrollConfigPluginContext {
  payrollService: PayrollConfigService;
  payrollRepository: PayrollConfigRepository;
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

/**
 * Payroll-config module-specific error codes beyond the shared base set
 */
const payrollErrorStatusMap: Record<string, number> = {
  EFFECTIVE_DATE_OVERLAP: 409,
};

/**
 * Create Payroll Config routes plugin
 */
export const payrollConfigRoutes = new Elysia({
  prefix: "/payroll-config",
  name: "payroll-config-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new PayrollConfigRepository(db);
    const service = new PayrollConfigService(repository, db);

    return { payrollService: service, payrollRepository: repository };
  })

  // ===========================================================================
  // Pay Schedule Routes
  // ===========================================================================

  // GET /pay-schedules - List pay schedules
  .get(
    "/pay-schedules",
    async (ctx) => {
      const { payrollService, query, tenantContext } = ctx as typeof ctx & PayrollConfigPluginContext;
      const { cursor, limit } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await payrollService.listPaySchedules(tenantContext, {
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
      beforeHandle: [requirePermission("payroll:schedules", "read")],
      query: t.Partial(PaginationQuerySchema),
      response: {
        200: t.Object({
          items: t.Array(PayScheduleResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "List pay schedules",
        description:
          "List all pay schedules for the tenant with cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /pay-schedules/:id - Get pay schedule by ID
  .get(
    "/pay-schedules/:id",
    async (ctx) => {
      const { payrollService, params, tenantContext, error } = ctx as typeof ctx & PayrollConfigPluginContext;
      const result = await payrollService.getPayScheduleById(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:schedules", "read")],
      params: IdParamsSchema,
      response: {
        200: PayScheduleResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Get pay schedule by ID",
        description: "Get a single pay schedule by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /pay-schedules - Create pay schedule
  .post(
    "/pay-schedules",
    async (ctx) => {
      const {
        payrollService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & PayrollConfigPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payrollService.createPaySchedule(
        tenantContext,
        body as unknown as CreatePaySchedule,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: "payroll.schedule.created",
          resourceType: "pay_schedule",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:schedules", "write")],
      body: CreatePayScheduleSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PayScheduleResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Create pay schedule",
        description:
          "Create a new pay schedule. Weekly/fortnightly/four_weekly require pay_day_of_week; monthly/annually require pay_day_of_month.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /pay-schedules/:id - Update pay schedule
  .put(
    "/pay-schedules/:id",
    async (ctx) => {
      const {
        payrollService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & PayrollConfigPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payrollService.updatePaySchedule(
        tenantContext,
        params.id,
        body as unknown as UpdatePaySchedule,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the update
      if (audit) {
        await audit.log({
          action: "payroll.schedule.updated",
          resourceType: "pay_schedule",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:schedules", "write")],
      params: IdParamsSchema,
      body: UpdatePayScheduleSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PayScheduleResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Update pay schedule",
        description:
          "Update an existing pay schedule. Validates pay day consistency with frequency.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Employee Pay Assignment Routes
  // ===========================================================================

  // GET /employees/:employeeId/pay-assignments - List pay assignments for an employee
  .get(
    "/employees/:employeeId/pay-assignments",
    async (ctx) => {
      const { payrollService, params, tenantContext, error } = ctx as typeof ctx & PayrollConfigPluginContext;
      const result = await payrollService.getPayAssignmentsByEmployee(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("payroll:assignments", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: t.Object({
          items: t.Array(PayAssignmentResponseSchema),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "List employee pay assignments",
        description:
          "Get all current and historical pay schedule assignments for an employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /pay-assignments - Create employee pay assignment
  .post(
    "/pay-assignments",
    async (ctx) => {
      const {
        payrollService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & PayrollConfigPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as CreatePayAssignment;
      const result = await payrollService.createPayAssignment(
        tenantContext,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the assignment
      if (audit) {
        await audit.log({
          action: "payroll.assignment.created",
          resourceType: "employee_pay_assignment",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            employeeId: typedBody.employee_id,
            payScheduleId: typedBody.pay_schedule_id,
            idempotencyKey,
            requestId,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:assignments", "write")],
      body: CreatePayAssignmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PayAssignmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Create employee pay assignment",
        description:
          "Assign an employee to a pay schedule with effective dating. Prevents overlapping assignments.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /pay-assignments/:id - Get pay assignment by ID
  .get(
    "/pay-assignments/:id",
    async (ctx) => {
      const { payrollService, params, tenantContext, error } = ctx as typeof ctx & PayrollConfigPluginContext;
      const result = await payrollService.getPayAssignmentById(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:assignments", "read")],
      params: IdParamsSchema,
      response: {
        200: PayAssignmentResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Get pay assignment by ID",
        description: "Get a single pay schedule assignment by its ID, including schedule name and frequency",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /employees/:employeeId/pay-assignments/current - Get current pay assignment
  .get(
    "/employees/:employeeId/pay-assignments/current",
    async (ctx) => {
      const { payrollService, params, tenantContext, error } = ctx as typeof ctx & PayrollConfigPluginContext;
      const result = await payrollService.getCurrentPayAssignment(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("payroll:assignments", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: t.Object({
          data: t.Union([PayAssignmentResponseSchema, t.Null()]),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Get current pay assignment for an employee",
        description:
          "Get the currently active pay schedule assignment for an employee (effective_from <= today, effective_to is null or >= today). Returns null if no current assignment exists.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /pay-assignments/:id - Update pay assignment
  .put(
    "/pay-assignments/:id",
    async (ctx) => {
      const {
        payrollService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & PayrollConfigPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payrollService.updatePayAssignment(
        tenantContext,
        params.id,
        body as unknown as UpdatePayAssignment,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the update
      if (audit) {
        await audit.log({
          action: "payroll.assignment.updated",
          resourceType: "employee_pay_assignment",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:assignments", "write")],
      params: IdParamsSchema,
      body: UpdatePayAssignmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PayAssignmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Update pay assignment",
        description:
          "Update an existing pay schedule assignment. Common use cases: end an assignment by setting effective_to, reassign to a different schedule, or adjust effective dates. Validates date consistency and prevents overlapping assignments.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /pay-assignments/:id - Delete pay assignment
  .delete(
    "/pay-assignments/:id",
    async (ctx) => {
      const {
        payrollService,
        params,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & PayrollConfigPluginContext;

      const result = await payrollService.deletePayAssignment(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the deletion
      if (audit) {
        await audit.log({
          action: "payroll.assignment.deleted",
          resourceType: "employee_pay_assignment",
          resourceId: params.id,
          metadata: { requestId },
        });
      }

      return { success: true, message: "Pay assignment deleted" };
    },
    {
      beforeHandle: [requirePermission("payroll:assignments", "write")],
      params: IdParamsSchema,
      response: {
        200: t.Object({
          success: t.Literal(true),
          message: t.String(),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Delete pay assignment",
        description:
          "Delete a pay schedule assignment. Prefer ending an assignment by setting effective_to via PUT rather than deleting. A domain event is emitted for audit trail.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // NI Category Routes
  // ===========================================================================

  // GET /employees/:employeeId/ni-categories - List NI categories for an employee
  .get(
    "/employees/:employeeId/ni-categories",
    async (ctx) => {
      const { payrollService, params, tenantContext, error } = ctx as typeof ctx & PayrollConfigPluginContext;
      const result = await payrollService.getNiCategoriesByEmployee(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("payroll:ni_categories", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: t.Object({
          items: t.Array(NiCategoryResponseSchema),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "List employee NI categories",
        description:
          "Get all current and historical NI category records for an employee. Returns records ordered by effective_from descending.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /employees/:employeeId/ni-categories/current - Get current NI category for an employee
  .get(
    "/employees/:employeeId/ni-categories/current",
    async (ctx) => {
      const { payrollService, params, tenantContext, error } = ctx as typeof ctx & PayrollConfigPluginContext;
      const result = await payrollService.getCurrentNiCategory(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("payroll:ni_categories", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: t.Object({
          data: t.Union([NiCategoryResponseSchema, t.Null()]),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Get current NI category for an employee",
        description:
          "Get the currently active NI category record for an employee (effective_from <= today, effective_to is null or >= today). Returns null if no current record exists.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /ni-categories/:id - Get NI category by ID
  .get(
    "/ni-categories/:id",
    async (ctx) => {
      const { payrollService, params, tenantContext, error } = ctx as typeof ctx & PayrollConfigPluginContext;
      const result = await payrollService.getNiCategoryById(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:ni_categories", "read")],
      params: IdParamsSchema,
      response: {
        200: NiCategoryResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Get NI category by ID",
        description: "Get a single NI category record by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /ni-categories - Create NI category record
  .post(
    "/ni-categories",
    async (ctx) => {
      const {
        payrollService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & PayrollConfigPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as CreateNiCategory;
      const result = await payrollService.createNiCategory(
        tenantContext,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the NI category creation
      if (audit) {
        await audit.log({
          action: "payroll.ni_category.created",
          resourceType: "ni_category",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            employeeId: typedBody.employee_id,
            categoryLetter: typedBody.category_letter,
            idempotencyKey,
            requestId,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:ni_categories", "write")],
      body: CreateNiCategorySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: NiCategoryResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Create NI category record",
        description:
          "Set an NI category for an employee with effective dating. Valid HMRC categories: A (standard), B (married women reduced rate), C (over state pension age), F (freeport), H (apprentice under 25), I (married women freeport), J (deferment), L (deferment freeport), M (under 21), S (state pension age freeport), V (veteran), Z (under 21 deferment). Prevents overlapping records.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /ni-categories/:id - Update NI category record
  .put(
    "/ni-categories/:id",
    async (ctx) => {
      const {
        payrollService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & PayrollConfigPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payrollService.updateNiCategory(
        tenantContext,
        params.id,
        body as unknown as UpdateNiCategory,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the update
      if (audit) {
        await audit.log({
          action: "payroll.ni_category.updated",
          resourceType: "ni_category",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:ni_categories", "write")],
      params: IdParamsSchema,
      body: UpdateNiCategorySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: NiCategoryResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Update NI category record",
        description:
          "Update an existing NI category record. Validates effective dates and prevents overlapping records. Only the provided fields are updated.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /ni-categories/:id - Delete NI category record
  .delete(
    "/ni-categories/:id",
    async (ctx) => {
      const {
        payrollService,
        params,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & PayrollConfigPluginContext;

      const result = await payrollService.deleteNiCategory(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          payrollErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the deletion
      if (audit) {
        await audit.log({
          action: "payroll.ni_category.deleted",
          resourceType: "ni_category",
          resourceId: params.id,
          metadata: { requestId },
        });
      }

      return { success: true, message: "NI category record deleted" };
    },
    {
      beforeHandle: [requirePermission("payroll:ni_categories", "write")],
      params: IdParamsSchema,
      response: {
        200: t.Object({
          success: t.Literal(true),
          message: t.String(),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Config"],
        summary: "Delete NI category record",
        description:
          "Delete an NI category record. This permanently removes the record. For audit purposes, a domain event is emitted before deletion.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type PayrollConfigRoutes = typeof payrollConfigRoutes;
