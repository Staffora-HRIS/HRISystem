/**
 * Benefits Module - Elysia Routes
 *
 * Defines the API endpoints for Benefits Administration.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - benefits:carriers: read, write
 * - benefits:plans: read, write
 * - benefits:enrollments: read, write
 * - benefits:dependents: read, write
 * - benefits:life_events: read, write, approve
 * - benefits:open_enrollment: read, write, admin
 */

import { Elysia, t } from "elysia";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { ErrorCodes } from "../../plugins/errors";
import { BenefitsRepository, type TenantContext } from "./repository";
import { BenefitsService } from "./service";
import {
  // Carrier schemas
  CreateCarrier,
  UpdateCarrier,
  CarrierResponse,
  // Plan schemas
  CreatePlan,
  UpdatePlan,
  PlanResponse,
  PlanFilters,
  // Dependent schemas
  CreateDependent,
  UpdateDependent,
  DependentResponse,
  // Enrollment schemas
  CreateEnrollment,
  UpdateEnrollment,
  WaiveEnrollment,
  EnrollmentResponse,
  EnrollmentFilters,
  // Life event schemas
  CreateLifeEvent,
  ReviewLifeEvent,
  LifeEventResponse,
  // Open enrollment schemas
  CreateOpenEnrollment,
  OpenEnrollmentResponse,
  SubmitElections,
  // Cost summary
  BenefitCostSummary,
  // Pagination
  PaginationQuery,
} from "./schemas";

/**
 * Success response for delete/action operations
 */
const SuccessSchema = t.Object({
  success: t.Literal(true),
  message: t.String(),
});

/**
 * UUID schema
 */
const UuidSchema = t.String({ format: "uuid" });

/**
 * ID params schema
 */
const IdParamsSchema = t.Object({
  id: UuidSchema,
});

/**
 * Idempotency header schema
 */
const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

/**
 * Benefits module-specific error codes beyond the shared base set
 */
const benefitsErrorStatusMap: Record<string, number> = {
  CARRIER_NOT_FOUND: 404,
  PLAN_NOT_FOUND: 404,
  DEPENDENT_NOT_FOUND: 404,
  ENROLLMENT_NOT_FOUND: 404,
  LIFE_EVENT_NOT_FOUND: 404,
  OPEN_ENROLLMENT_NOT_FOUND: 404,
  EMPLOYEE_NOT_FOUND: 404,
  ALREADY_ENROLLED: 409,
  ENROLLMENT_CONFLICT: 409,
  LIFE_EVENT_ALREADY_REVIEWED: 409,
  LIFE_EVENT_EXPIRED: 400,
  OPEN_ENROLLMENT_NOT_ACTIVE: 400,
  WAITING_PERIOD_NOT_MET: 400,
  PLAN_NOT_ELIGIBLE: 400,
  INVALID_COVERAGE_LEVEL: 400,
  INVALID_DEPENDENTS: 400,
};

/**
 * Create Benefits routes plugin
 */
export const benefitsRoutes = new Elysia({ prefix: "/benefits", name: "benefits-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new BenefitsRepository(db);
    const service = new BenefitsService(repository, db);

    return { benefitsService: service, benefitsRepository: repository };
  })

  // ===========================================================================
  // Carrier Routes
  // ===========================================================================

  // GET /carriers - List carriers
  .get(
    "/carriers",
    async (ctx) => {
      const { benefitsService, query, tenantContext } = ctx as any;
      const { cursor, limit } = query;
      const parsedLimit = limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await benefitsService.listCarriers(
        tenantContext,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("benefits:carriers", "read")],
      query: t.Partial(PaginationQuery),
      response: t.Object({
        items: t.Array(CarrierResponse),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Benefits - Carriers"],
        summary: "List carriers",
        description: "List benefit carriers with pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /carriers/:id - Get carrier by ID
  .get(
    "/carriers/:id",
    async (ctx) => {
      const { benefitsService, params, tenantContext, error } = ctx as any;
      const result = await benefitsService.getCarrier(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:carriers", "read")],
      params: IdParamsSchema,
      response: {
        200: CarrierResponse,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Carriers"],
        summary: "Get carrier by ID",
        description: "Get a single carrier by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /carriers - Create carrier
  .post(
    "/carriers",
    async (ctx) => {
      const { benefitsService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsService.createCarrier(
        tenantContext,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "CARRIER_CREATED",
          resourceType: "benefit_carrier",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:carriers", "write")],
      body: CreateCarrier,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: CarrierResponse,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Carriers"],
        summary: "Create carrier",
        description: "Create a new benefit carrier",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /carriers/:id - Update carrier
  .put(
    "/carriers/:id",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getCarrier(tenantContext, params.id);

      const result = await benefitsService.updateCarrier(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "CARRIER_UPDATED",
          resourceType: "benefit_carrier",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:carriers", "write")],
      params: IdParamsSchema,
      body: UpdateCarrier,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: CarrierResponse,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Carriers"],
        summary: "Update carrier",
        description: "Update an existing carrier",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /carriers/:id - Deactivate carrier
  .delete(
    "/carriers/:id",
    async (ctx) => {
      const { benefitsService, params, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getCarrier(tenantContext, params.id);

      const result = await benefitsService.deleteCarrier(
        tenantContext,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "CARRIER_DEACTIVATED",
          resourceType: "benefit_carrier",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return { success: true as const, message: "Carrier deactivated successfully" };
    },
    {
      beforeHandle: [requirePermission("benefits:carriers", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Carriers"],
        summary: "Deactivate carrier",
        description: "Soft delete (deactivate) a carrier",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Plan Routes
  // ===========================================================================

  // GET /plans - List plans
  .get(
    "/plans",
    async (ctx) => {
      const { benefitsService, query, tenantContext } = ctx as any;
      const { cursor, limit, ...filters } = query;
      const parsedLimit = limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await benefitsService.listPlans(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("benefits:plans", "read")],
      query: t.Composite([t.Partial(PlanFilters), t.Partial(PaginationQuery)]),
      response: t.Object({
        items: t.Array(PlanResponse),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Benefits - Plans"],
        summary: "List plans",
        description: "List benefit plans with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /plans/:id - Get plan by ID
  .get(
    "/plans/:id",
    async (ctx) => {
      const { benefitsService, params, tenantContext, error } = ctx as any;
      const result = await benefitsService.getPlan(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:plans", "read")],
      params: IdParamsSchema,
      response: {
        200: PlanResponse,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Plans"],
        summary: "Get plan by ID",
        description: "Get a single benefit plan with cost details",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /plans - Create plan
  .post(
    "/plans",
    async (ctx) => {
      const { benefitsService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsService.createPlan(
        tenantContext,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "PLAN_CREATED",
          resourceType: "benefit_plan",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:plans", "write")],
      body: CreatePlan,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PlanResponse,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Plans"],
        summary: "Create plan",
        description: "Create a new benefit plan with costs by coverage level",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /plans/:id - Update plan
  .put(
    "/plans/:id",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getPlan(tenantContext, params.id);

      const result = await benefitsService.updatePlan(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "PLAN_UPDATED",
          resourceType: "benefit_plan",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:plans", "write")],
      params: IdParamsSchema,
      body: UpdatePlan,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PlanResponse,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Plans"],
        summary: "Update plan",
        description: "Update an existing benefit plan",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /plans/:id - Deactivate plan
  .delete(
    "/plans/:id",
    async (ctx) => {
      const { benefitsService, params, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getPlan(tenantContext, params.id);

      const result = await benefitsService.deletePlan(
        tenantContext,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "PLAN_DEACTIVATED",
          resourceType: "benefit_plan",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return { success: true as const, message: "Plan deactivated successfully" };
    },
    {
      beforeHandle: [requirePermission("benefits:plans", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Plans"],
        summary: "Deactivate plan",
        description: "Soft delete (deactivate) a benefit plan",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Dependent Routes
  // ===========================================================================

  // GET /employees/:employeeId/dependents - List employee dependents
  .get(
    "/employees/:employeeId/dependents",
    async (ctx) => {
      const { benefitsService, params, tenantContext, error } = ctx as any;
      const result = await benefitsService.listDependents(tenantContext, params.employeeId);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("benefits:dependents", "read")],
      params: t.Object({ employeeId: UuidSchema }),
      response: {
        200: t.Object({ items: t.Array(DependentResponse) }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Dependents"],
        summary: "List employee dependents",
        description: "List all dependents for an employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /employees/:employeeId/dependents - Add dependent
  .post(
    "/employees/:employeeId/dependents",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsService.createDependent(
        tenantContext,
        params.employeeId,
        body as any
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "DEPENDENT_ADDED",
          resourceType: "benefit_dependent",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, employeeId: params.employeeId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:dependents", "write")],
      params: t.Object({ employeeId: UuidSchema }),
      body: CreateDependent,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: DependentResponse,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Dependents"],
        summary: "Add dependent",
        description: "Add a new dependent for an employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /dependents/:id - Update dependent
  .put(
    "/dependents/:id",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getDependent(tenantContext, params.id);

      const result = await benefitsService.updateDependent(
        tenantContext,
        params.id,
        body as any
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "DEPENDENT_UPDATED",
          resourceType: "benefit_dependent",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:dependents", "write")],
      params: IdParamsSchema,
      body: UpdateDependent,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DependentResponse,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Dependents"],
        summary: "Update dependent",
        description: "Update an existing dependent",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /dependents/:id - Remove dependent
  .delete(
    "/dependents/:id",
    async (ctx) => {
      const { benefitsService, params, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getDependent(tenantContext, params.id);

      const result = await benefitsService.deleteDependent(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "DEPENDENT_REMOVED",
          resourceType: "benefit_dependent",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return { success: true as const, message: "Dependent removed successfully" };
    },
    {
      beforeHandle: [requirePermission("benefits:dependents", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Dependents"],
        summary: "Remove dependent",
        description: "Soft delete (deactivate) a dependent",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Enrollment Routes
  // ===========================================================================

  // GET /enrollments - List enrollments
  .get(
    "/enrollments",
    async (ctx) => {
      const { benefitsService, query, tenantContext } = ctx as any;
      const { cursor, limit, ...filters } = query;
      const parsedLimit = limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await benefitsService.listEnrollments(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("benefits:enrollments", "read")],
      query: t.Composite([t.Partial(EnrollmentFilters), t.Partial(PaginationQuery)]),
      response: t.Object({
        items: t.Array(EnrollmentResponse),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Benefits - Enrollments"],
        summary: "List enrollments",
        description: "List benefit enrollments with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /employees/:employeeId/enrollments - Get employee enrollments
  .get(
    "/employees/:employeeId/enrollments",
    async (ctx) => {
      const { benefitsService, params, tenantContext, error } = ctx as any;
      const result = await benefitsService.getEmployeeEnrollments(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("benefits:enrollments", "read")],
      params: t.Object({ employeeId: UuidSchema }),
      response: {
        200: t.Object({ items: t.Array(EnrollmentResponse) }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Enrollments"],
        summary: "Get employee enrollments",
        description: "Get all active enrollments for an employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /employees/:employeeId/costs - Get employee benefit costs
  .get(
    "/employees/:employeeId/costs",
    async (ctx) => {
      const { benefitsService, params, tenantContext, error } = ctx as any;
      const result = await benefitsService.getEmployeeBenefitCosts(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      const byCategory = result.data as any[];
      const totalEmployee = byCategory.reduce((sum: number, c: any) => sum + c.employee_total, 0);
      const totalEmployer = byCategory.reduce((sum: number, c: any) => sum + c.employer_total, 0);

      return {
        employee_id: params.employeeId,
        by_category: byCategory,
        total_employee: totalEmployee,
        total_employer: totalEmployer,
        grand_total: totalEmployee + totalEmployer,
      };
    },
    {
      beforeHandle: [requirePermission("benefits:enrollments", "read")],
      params: t.Object({ employeeId: UuidSchema }),
      response: {
        200: t.Object({
          employee_id: t.String(),
          by_category: t.Array(BenefitCostSummary),
          total_employee: t.Number(),
          total_employer: t.Number(),
          grand_total: t.Number(),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Enrollments"],
        summary: "Get employee benefit costs",
        description: "Get cost summary for all employee enrollments",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /enrollments - Enroll employee in plan
  .post(
    "/enrollments",
    async (ctx) => {
      const { benefitsService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsService.enrollEmployee(
        tenantContext,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "ENROLLMENT_CREATED",
          resourceType: "benefit_enrollment",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:enrollments", "write")],
      body: CreateEnrollment,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: EnrollmentResponse,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Enrollments"],
        summary: "Enroll employee",
        description: "Enroll an employee in a benefit plan",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /enrollments/:id - Update enrollment
  .put(
    "/enrollments/:id",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getEnrollment(tenantContext, params.id);

      const result = await benefitsService.updateEnrollment(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "ENROLLMENT_UPDATED",
          resourceType: "benefit_enrollment",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:enrollments", "write")],
      params: IdParamsSchema,
      body: UpdateEnrollment,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EnrollmentResponse,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Enrollments"],
        summary: "Update enrollment",
        description: "Update an existing enrollment (coverage level, dependents)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /enrollments/:id/terminate - Terminate enrollment
  .post(
    "/enrollments/:id/terminate",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const effectiveDate = body?.effective_date || new Date().toISOString().split("T")[0]!;

      const result = await benefitsService.terminateEnrollment(
        tenantContext,
        params.id,
        effectiveDate
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "ENROLLMENT_TERMINATED",
          resourceType: "benefit_enrollment",
          resourceId: params.id,
          newValues: { effective_date: effectiveDate },
          metadata: { idempotencyKey, requestId },
        });
      }

      return { success: true as const, message: "Enrollment terminated successfully" };
    },
    {
      beforeHandle: [requirePermission("benefits:enrollments", "write")],
      params: IdParamsSchema,
      body: t.Object({
        effective_date: t.Optional(t.String({ format: "date" })),
      }),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SuccessSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Enrollments"],
        summary: "Terminate enrollment",
        description: "Terminate a benefit enrollment",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /enrollments/waive - Waive coverage
  .post(
    "/enrollments/waive",
    async (ctx) => {
      const { benefitsService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsService.waiveCoverage(
        tenantContext,
        body as any
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "COVERAGE_WAIVED",
          resourceType: "benefit_enrollment",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:enrollments", "write")],
      body: t.Composite([
        WaiveEnrollment,
        t.Object({ employee_id: UuidSchema }),
      ]),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: EnrollmentResponse,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Enrollments"],
        summary: "Waive coverage",
        description: "Record waiver of benefit coverage",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Life Event Routes
  // ===========================================================================

  // GET /life-events - List life events
  .get(
    "/life-events",
    async (ctx) => {
      const { benefitsService, query, tenantContext } = ctx as any;
      const { cursor, limit, status } = query;
      const parsedLimit = limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await benefitsService.listLifeEvents(
        tenantContext,
        status,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("benefits:life_events", "read")],
      query: t.Composite([
        t.Object({ status: t.Optional(t.String()) }),
        t.Partial(PaginationQuery),
      ]),
      response: t.Object({
        items: t.Array(LifeEventResponse),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Benefits - Life Events"],
        summary: "List life events",
        description: "List life events with optional status filter and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /employees/:employeeId/life-events - Report life event
  .post(
    "/employees/:employeeId/life-events",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsService.createLifeEvent(
        tenantContext,
        params.employeeId,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "LIFE_EVENT_REPORTED",
          resourceType: "life_event",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, employeeId: params.employeeId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:life_events", "write")],
      params: t.Object({ employeeId: UuidSchema }),
      body: CreateLifeEvent,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: LifeEventResponse,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Life Events"],
        summary: "Report life event",
        description: "Report a qualifying life event for special enrollment",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /life-events/:id/review - Review life event
  .post(
    "/life-events/:id/review",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await benefitsService.getLifeEvent(tenantContext, params.id);

      const result = await benefitsService.reviewLifeEvent(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "LIFE_EVENT_REVIEWED",
          resourceType: "life_event",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, decision: (body as any).status },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:life_events", "approve")],
      params: IdParamsSchema,
      body: ReviewLifeEvent,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: LifeEventResponse,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Life Events"],
        summary: "Review life event",
        description: "Approve or reject a life event request",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Open Enrollment Routes
  // ===========================================================================

  // GET /open-enrollment - List open enrollment periods
  .get(
    "/open-enrollment",
    async (ctx) => {
      const { benefitsService, tenantContext } = ctx as any;
      const result = await benefitsService.listOpenEnrollmentPeriods(tenantContext);

      return {
        items: result.success ? result.data : [],
        nextCursor: null,
        hasMore: false,
      };
    },
    {
      beforeHandle: [requirePermission("benefits:open_enrollment", "read")],
      query: t.Partial(PaginationQuery),
      response: t.Object({
        items: t.Array(OpenEnrollmentResponse),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Benefits - Open Enrollment"],
        summary: "List open enrollment periods",
        description: "List all open enrollment periods with pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /open-enrollment/current - Get current open enrollment
  .get(
    "/open-enrollment/current",
    async (ctx) => {
      const { benefitsService, tenantContext, error } = ctx as any;
      const result = await benefitsService.getCurrentOpenEnrollment(tenantContext);

      if (!result.success) {
        if (result.error?.code === "NOT_FOUND") {
          return { active: false, period: null };
        }
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      return { active: true, period: result.data };
    },
    {
      beforeHandle: [requirePermission("benefits:open_enrollment", "read")],
      response: {
        200: t.Object({
          active: t.Boolean(),
          period: t.Union([OpenEnrollmentResponse, t.Null()]),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Open Enrollment"],
        summary: "Get current open enrollment",
        description: "Get the currently active open enrollment period, if any",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /open-enrollment - Create open enrollment period
  .post(
    "/open-enrollment",
    async (ctx) => {
      const { benefitsService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsService.createOpenEnrollment(
        tenantContext,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "OPEN_ENROLLMENT_CREATED",
          resourceType: "open_enrollment_period",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:open_enrollment", "admin")],
      body: CreateOpenEnrollment,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: OpenEnrollmentResponse,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Open Enrollment"],
        summary: "Create open enrollment period",
        description: "Create a new open enrollment period",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /open-enrollment/:id/elections - Submit employee elections
  .post(
    "/open-enrollment/:id/elections",
    async (ctx) => {
      const { benefitsService, params, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await benefitsService.submitElections(
        tenantContext,
        params.id,
        (body as any).employee_id,
        body as any
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", benefitsErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "ELECTIONS_SUBMITTED",
          resourceType: "open_enrollment_election",
          resourceId: params.id,
          newValues: { employee_id: (body as any).employee_id, elections: (body as any).elections },
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return { success: true as const, enrollments: result.data };
    },
    {
      beforeHandle: [requirePermission("benefits:open_enrollment", "write")],
      params: IdParamsSchema,
      body: t.Composite([
        SubmitElections,
        t.Object({ employee_id: UuidSchema }),
      ]),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: t.Object({
          success: t.Literal(true),
          enrollments: t.Array(EnrollmentResponse),
        }),
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Open Enrollment"],
        summary: "Submit elections",
        description: "Submit benefit elections for an open enrollment period",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Self-Service Portal Routes (My Benefits)
  // ===========================================================================

  // GET /my-enrollments - Get current user's benefit enrollments
  .get(
    "/my-enrollments",
    async (ctx) => {
      const { benefitsService, user, tenant, db, set } = ctx as any;

      try {
        // Get employee ID for current user
        const [employee] = await db.withTransaction(
          { tenantId: tenant.id, userId: user.id },
          async (tx: any) => {
            return tx`
              SELECT id FROM app.employees
              WHERE user_id = ${user.id}::uuid AND tenant_id = ${tenant.id}::uuid
              LIMIT 1
            `;
          }
        );

        if (!employee) {
          return { items: [], message: "No employee record found" };
        }

        const tenantContext = { tenantId: tenant.id, userId: user.id };
        const result = await benefitsService.getEmployeeEnrollments(tenantContext, employee.id);

        if (!result.success) {
          set.status = 500;
          return { error: result.error };
        }

        return { items: result.data };
      } catch (error) {
        console.error("Benefits /my-enrollments error:", error);
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get enrollments" } };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      response: {
        200: t.Object({
          items: t.Array(EnrollmentResponse),
          message: t.Optional(t.String()),
        }),
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Self Service"],
        summary: "Get my enrollments",
        description: "Get current user's benefit enrollments",
      },
    }
  )

  // GET /my-life-events - Get current user's life events
  .get(
    "/my-life-events",
    async (ctx) => {
      const { benefitsService, user, tenant, db, set } = ctx as any;

      try {
        // Get employee ID for current user
        const [employee] = await db.withTransaction(
          { tenantId: tenant.id, userId: user.id },
          async (tx: any) => {
            return tx`
              SELECT id FROM app.employees
              WHERE user_id = ${user.id}::uuid AND tenant_id = ${tenant.id}::uuid
              LIMIT 1
            `;
          }
        );

        if (!employee) {
          return { items: [], message: "No employee record found" };
        }

        // Query life events for this employee
        const lifeEvents = await db.withTransaction(
          { tenantId: tenant.id, userId: user.id },
          async (tx: any) => {
            return tx`
              SELECT 
                id, employee_id, event_type, event_date, 
                enrollment_deadline, status, notes,
                created_at, updated_at
              FROM app.life_events
              WHERE employee_id = ${employee.id}::uuid 
                AND tenant_id = ${tenant.id}::uuid
              ORDER BY event_date DESC
              LIMIT 50
            `;
          }
        );

        return {
          items: lifeEvents.map((e: any) => ({
            id: e.id,
            employeeId: e.employeeId,
            eventType: e.eventType,
            eventDate: e.eventDate,
            enrollmentDeadline: e.enrollmentDeadline,
            status: e.status,
            notes: e.notes,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
          })),
        };
      } catch (error) {
        console.error("Benefits /my-life-events error:", error);
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get life events" } };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      response: {
        200: t.Object({
          items: t.Array(t.Object({
            id: t.String(),
            employeeId: t.String(),
            eventType: t.String(),
            eventDate: t.String(),
            enrollmentDeadline: t.Union([t.String(), t.Null()]),
            status: t.String(),
            notes: t.Union([t.String(), t.Null()]),
            createdAt: t.String(),
            updatedAt: t.String(),
          })),
          message: t.Optional(t.String()),
        }),
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits - Self Service"],
        summary: "Get my life events",
        description: "Get current user's benefit life events",
      },
    }
  )

  // ===========================================================================
  // Stats Route - Enrollment Statistics
  // ===========================================================================

  // GET /stats - Get enrollment statistics
  .get(
    "/stats",
    async (ctx) => {
      const { benefitsService, tenantContext, set } = ctx as any;

      try {
        const result = await benefitsService.getEnrollmentStats(tenantContext);

        if (!result.success) {
          set.status = 500;
          return { error: { code: result.error.code, message: result.error.message } };
        }

        const { totalEmployees, enrolledEmployees, pendingEnrollments, pendingLifeEvents } = result.data;

        return {
          total_employees: totalEmployees,
          enrolled_employees: enrolledEmployees,
          pending_enrollments: pendingEnrollments,
          pending_life_events: pendingLifeEvents,
        };
      } catch (err) {
        console.error("Benefits /stats error:", err);
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get benefits stats" } };
      }
    },
    {
      beforeHandle: [requirePermission("benefits:enrollments", "read")],
      response: {
        200: t.Object({
          total_employees: t.Number(),
          enrolled_employees: t.Number(),
          pending_enrollments: t.Number(),
          pending_life_events: t.Number(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits"],
        summary: "Get enrollment statistics",
        description: "Get overall benefits enrollment statistics",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type BenefitsRoutes = typeof benefitsRoutes;
