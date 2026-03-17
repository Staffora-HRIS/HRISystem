/**
 * Benefits Module - Enrollment Routes
 *
 * Enrollment management including dependents, costs, open enrollment,
 * self-service portal, and statistics.
 * Mounted under /benefits by the parent routes.ts.
 *
 * Routes:
 *   -- Dependent Management --
 *   GET    /employees/:employeeId/dependents  - List employee dependents
 *   POST   /employees/:employeeId/dependents  - Add dependent
 *   PUT    /dependents/:id                    - Update dependent
 *   DELETE /dependents/:id                    - Remove dependent
 *
 *   -- Enrollment Management --
 *   GET    /enrollments                       - List enrollments
 *   GET    /employees/:employeeId/enrollments - Get employee enrollments
 *   GET    /employees/:employeeId/costs       - Get employee benefit costs
 *   POST   /enrollments                       - Enroll employee in plan
 *   PUT    /enrollments/:id                   - Update enrollment
 *   POST   /enrollments/:id/terminate         - Terminate enrollment
 *   POST   /enrollments/waive                 - Waive coverage
 *
 *   -- Open Enrollment --
 *   GET    /open-enrollment                   - List open enrollment periods
 *   GET    /open-enrollment/current           - Get current open enrollment
 *   POST   /open-enrollment                   - Create open enrollment period
 *   POST   /open-enrollment/:id/elections     - Submit employee elections
 *
 *   -- Self Service --
 *   GET    /my-enrollments                    - Get current user's enrollments
 *
 *   -- Statistics --
 *   GET    /stats                             - Get enrollment statistics
 */

import { Elysia, t } from "elysia";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { ErrorCodes } from "../../plugins/errors";
import {
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
  // Open enrollment schemas
  CreateOpenEnrollment,
  OpenEnrollmentResponse,
  SubmitElections,
  // Cost summary
  BenefitCostSummary,
  // Pagination
  PaginationQuery,
} from "./schemas";
import {
  SuccessSchema,
  UuidSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  benefitsErrorStatusMap,
} from "./routes.shared";

export const enrollmentRoutes = new Elysia({ name: "benefits-enrollment-routes" })

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

export type EnrollmentRoutes = typeof enrollmentRoutes;
