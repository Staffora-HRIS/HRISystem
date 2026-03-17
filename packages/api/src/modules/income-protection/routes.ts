/**
 * Income Protection Module - Elysia Routes
 *
 * API endpoints for income protection policy and enrollment management:
 *
 * Policies:
 * - GET    /income-protection/policies           - List policies
 * - GET    /income-protection/policies/:id        - Get policy by ID
 * - POST   /income-protection/policies            - Create policy
 * - PUT    /income-protection/policies/:id        - Update policy
 *
 * Enrollments:
 * - GET    /income-protection/enrollments         - List enrollments
 * - GET    /income-protection/enrollments/:id     - Get enrollment by ID
 * - POST   /income-protection/enrollments         - Create enrollment
 * - PUT    /income-protection/enrollments/:id     - Update enrollment
 *
 * Permission model:
 * - benefits:income_protection_policies: read, write
 * - benefits:income_protection_enrollments: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { IncomeProtectionRepository } from "./repository";
import { IncomeProtectionService } from "./service";
import {
  CreatePolicySchema,
  UpdatePolicySchema,
  PolicyResponseSchema,
  PolicyFiltersSchema,
  CreateEnrollmentSchema,
  UpdateEnrollmentSchema,
  EnrollmentResponseSchema,
  EnrollmentFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreatePolicy,
  type UpdatePolicy,
  type CreateEnrollment,
  type UpdateEnrollment,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface IncomeProtectionPluginContext {
  incomeProtectionService: IncomeProtectionService;
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

const incomeProtectionErrorStatusMap: Record<string, number> = {
  EFFECTIVE_DATE_OVERLAP: 409,
  STATE_MACHINE_VIOLATION: 409,
  POLICY_NOT_ACTIVE: 422,
};

/**
 * Income Protection routes plugin
 */
export const incomeProtectionRoutes = new Elysia({
  prefix: "/income-protection",
  name: "income-protection-routes",
})
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new IncomeProtectionRepository(db);
    const service = new IncomeProtectionService(repository, db);
    return { incomeProtectionService: service };
  })

  // ===========================================================================
  // Policy Routes
  // ===========================================================================

  // GET /policies - List income protection policies
  .get(
    "/policies",
    async (ctx) => {
      const { incomeProtectionService, query, tenantContext } = ctx as typeof ctx & IncomeProtectionPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await incomeProtectionService.listPolicies(
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
      beforeHandle: [requirePermission("benefits:income_protection_policies", "read")],
      query: t.Intersect([t.Partial(PaginationQuerySchema), t.Partial(PolicyFiltersSchema)]),
      response: {
        200: t.Object({
          items: t.Array(PolicyResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits"],
        summary: "List income protection policies",
        description: "List all income protection insurance policies for the tenant",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /policies/:id - Get policy by ID
  .get(
    "/policies/:id",
    async (ctx) => {
      const { incomeProtectionService, params, tenantContext, error } = ctx as typeof ctx & IncomeProtectionPluginContext;
      const result = await incomeProtectionService.getPolicyById(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          incomeProtectionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:income_protection_policies", "read")],
      params: IdParamsSchema,
      response: {
        200: PolicyResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits"],
        summary: "Get income protection policy",
        description: "Get a single income protection policy by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /policies - Create policy
  .post(
    "/policies",
    async (ctx) => {
      const {
        incomeProtectionService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & IncomeProtectionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await incomeProtectionService.createPolicy(
        tenantContext,
        body as unknown as CreatePolicy,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          incomeProtectionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "benefits.income_protection.policy.created",
          resourceType: "income_protection_policy",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:income_protection_policies", "write")],
      body: CreatePolicySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PolicyResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits"],
        summary: "Create income protection policy",
        description: "Create a new income protection insurance policy",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /policies/:id - Update policy
  .put(
    "/policies/:id",
    async (ctx) => {
      const {
        incomeProtectionService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & IncomeProtectionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await incomeProtectionService.updatePolicy(
        tenantContext,
        params.id,
        body as unknown as UpdatePolicy,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          incomeProtectionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "benefits.income_protection.policy.updated",
          resourceType: "income_protection_policy",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:income_protection_policies", "write")],
      params: IdParamsSchema,
      body: UpdatePolicySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PolicyResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits"],
        summary: "Update income protection policy",
        description: "Update an existing income protection policy. Status transitions are validated.",
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
      const { incomeProtectionService, query, tenantContext } = ctx as typeof ctx & IncomeProtectionPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await incomeProtectionService.listEnrollments(
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
      beforeHandle: [requirePermission("benefits:income_protection_enrollments", "read")],
      query: t.Intersect([t.Partial(PaginationQuerySchema), t.Partial(EnrollmentFiltersSchema)]),
      response: {
        200: t.Object({
          items: t.Array(EnrollmentResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits"],
        summary: "List income protection enrollments",
        description: "List all income protection enrollments with optional filters",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /enrollments/:id - Get enrollment by ID
  .get(
    "/enrollments/:id",
    async (ctx) => {
      const { incomeProtectionService, params, tenantContext, error } = ctx as typeof ctx & IncomeProtectionPluginContext;
      const result = await incomeProtectionService.getEnrollmentById(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          incomeProtectionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:income_protection_enrollments", "read")],
      params: IdParamsSchema,
      response: {
        200: EnrollmentResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits"],
        summary: "Get income protection enrollment",
        description: "Get a single income protection enrollment by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /enrollments - Create enrollment
  .post(
    "/enrollments",
    async (ctx) => {
      const {
        incomeProtectionService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & IncomeProtectionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as CreateEnrollment;
      const result = await incomeProtectionService.createEnrollment(
        tenantContext,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          incomeProtectionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "benefits.income_protection.enrollment.created",
          resourceType: "income_protection_enrollment",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            employeeId: typedBody.employee_id,
            policyId: typedBody.policy_id,
            idempotencyKey,
            requestId,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:income_protection_enrollments", "write")],
      body: CreateEnrollmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: EnrollmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        422: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits"],
        summary: "Create income protection enrollment",
        description: "Enroll an employee in an income protection policy. Prevents overlapping enrollments.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /enrollments/:id - Update enrollment
  .put(
    "/enrollments/:id",
    async (ctx) => {
      const {
        incomeProtectionService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & IncomeProtectionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await incomeProtectionService.updateEnrollment(
        tenantContext,
        params.id,
        body as unknown as UpdateEnrollment,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          incomeProtectionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "benefits.income_protection.enrollment.updated",
          resourceType: "income_protection_enrollment",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("benefits:income_protection_enrollments", "write")],
      params: IdParamsSchema,
      body: UpdateEnrollmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EnrollmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        422: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Benefits"],
        summary: "Update income protection enrollment",
        description: "Update an existing income protection enrollment (status, premiums, claim details)",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type IncomeProtectionRoutes = typeof incomeProtectionRoutes;
