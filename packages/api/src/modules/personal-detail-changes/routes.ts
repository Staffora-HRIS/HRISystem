/**
 * Personal Detail Changes Module - Elysia Routes
 *
 * Two route groups (TODO-150):
 * 1. /portal/personal-detail-changes -- Employee self-service (submit, list own, cancel)
 * 2. /hr/personal-detail-changes     -- HR/Manager review (list pending, get, approve/reject, count)
 *
 * Permission model:
 * - Portal routes: requireAuth + requireTenant (employee self-service)
 * - Admin routes: requirePermission("employees", "read"|"write") (HR/manager)
 *
 * Endpoints:
 * Portal:
 * - POST   /portal/personal-detail-changes           - Submit a change request
 * - GET    /portal/personal-detail-changes           - List my change requests
 * - GET    /portal/personal-detail-changes/pending-count - Count my pending requests
 * - PATCH  /portal/personal-detail-changes/:id/cancel - Cancel my pending request
 *
 * Admin:
 * - GET    /hr/personal-detail-changes               - List pending requests for review
 * - GET    /hr/personal-detail-changes/count          - Count pending requests for review
 * - GET    /hr/personal-detail-changes/:id            - Get a single change request
 * - PATCH  /hr/personal-detail-changes/:id/review     - Approve or reject a change request
 */

import { Elysia, t } from "elysia";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import { logger } from "../../lib/logger";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { PersonalDetailChangeRepository } from "./repository";
import { PersonalDetailChangeService } from "./service";
import {
  SubmitChangeRequestSchema,
  ReviewChangeRequestSchema,
  ChangeRequestResponseSchema,
  ChangeRequestListResponseSchema,
  IdParamsSchema,
  IdempotencyHeaderSchema,
  PaginationQuerySchema,
  PersonalDetailChangeStatusSchema,
  UuidSchema,
} from "./schemas";

// =============================================================================
// Error status map
// =============================================================================

const personalDetailChangeErrorStatusMap: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  FORBIDDEN: 403,
};

// =============================================================================
// Helper to format response row (camelCase -> snake_case for API contract)
// =============================================================================

function formatChangeRequest(row: any) {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    field_name: row.fieldName,
    old_value: row.oldValue ?? null,
    new_value: row.newValue,
    status: row.status,
    reviewed_by: row.reviewedBy ?? null,
    reviewed_at: row.reviewedAt instanceof Date
      ? row.reviewedAt.toISOString()
      : row.reviewedAt
        ? String(row.reviewedAt)
        : null,
    reviewer_notes: row.reviewerNotes ?? null,
    created_at: row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : String(row.updatedAt),
    employee_name: row.employeeName ?? undefined,
    reviewer_name: row.reviewerName ?? undefined,
  };
}

// =============================================================================
// Portal Routes (Employee Self-Service)
// =============================================================================

export const personalDetailChangePortalRoutes = new Elysia({
  prefix: "/portal/personal-detail-changes",
  name: "personal-detail-change-portal-routes",
})
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new PersonalDetailChangeRepository(db);
    const service = new PersonalDetailChangeService(repository);

    const { tenant, user } = ctx as any;
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { pdcService: service, tenantContext };
  })

  // POST /portal/personal-detail-changes -- Submit a change request
  .post(
    "/",
    async (ctx) => {
      const { pdcService, tenantContext, body, set } = ctx as any;

      try {
        const result = await pdcService.submitChangeRequest(tenantContext, body);

        if (!result.success) {
          set.status = mapErrorToStatus(
            result.error?.code || "INTERNAL_ERROR",
            personalDetailChangeErrorStatusMap
          );
          return { error: result.error };
        }

        set.status = 201;
        return formatChangeRequest(result.data);
      } catch (error: any) {
        logger.error({ err: error, module: "personal-detail-changes" }, "Portal personal-detail-changes POST error");
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to submit personal detail change request",
            requestId: "",
          },
        };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      body: SubmitChangeRequestSchema,
      headers: IdempotencyHeaderSchema,
      response: {
        201: ChangeRequestResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Portal"],
        summary: "Submit a personal detail change request",
        description:
          "Employee submits a change to a personal detail field. Non-sensitive fields (phone, mobile, personal_email) are auto-approved and applied immediately. Sensitive fields (name, address, bank details, emergency contacts) require HR/manager approval.",
      },
    }
  )

  // GET /portal/personal-detail-changes -- List my change requests
  .get(
    "/",
    async (ctx) => {
      const { pdcService, tenantContext, query, set } = ctx as any;

      try {
        const { cursor, limit, status } = query || {};
        const result = await pdcService.listMyChangeRequests(
          tenantContext,
          { status },
          { cursor, limit: limit ? Number(limit) : undefined }
        );

        if (!result.success) {
          set.status = mapErrorToStatus(
            result.error?.code || "INTERNAL_ERROR",
            personalDetailChangeErrorStatusMap
          );
          return { error: result.error };
        }

        return {
          items: result.data!.items.map(formatChangeRequest),
          nextCursor: result.data!.nextCursor,
          hasMore: result.data!.hasMore,
        };
      } catch (error: any) {
        logger.error({ err: error, module: "personal-detail-changes" }, "Portal personal-detail-changes GET error");
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to list personal detail change requests",
            requestId: "",
          },
        };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      query: t.Composite([
        t.Partial(PaginationQuerySchema),
        t.Object({ status: t.Optional(PersonalDetailChangeStatusSchema) }),
      ]),
      response: {
        200: ChangeRequestListResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Portal"],
        summary: "List my personal detail change requests",
        description:
          "List change requests submitted by the authenticated employee with optional status filter and cursor-based pagination.",
      },
    }
  )

  // GET /portal/personal-detail-changes/pending-count -- Count my pending
  .get(
    "/pending-count",
    async (ctx) => {
      const { pdcService, tenantContext, set } = ctx as any;

      try {
        const employee = await (pdcService as any).repository.getEmployeeByUserId(tenantContext);
        if (!employee) {
          return { count: 0 };
        }
        const count = await (pdcService as any).repository.countPendingByEmployee(
          tenantContext,
          employee.id
        );
        return { count };
      } catch (error: any) {
        logger.error({ err: error, module: "personal-detail-changes" }, "Portal personal-detail-changes pending-count error");
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to get pending count",
            requestId: "",
          },
        };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      response: {
        200: t.Object({ count: t.Number() }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Portal"],
        summary: "Get count of my pending personal detail change requests",
      },
    }
  )

  // PATCH /portal/personal-detail-changes/:id/cancel -- Cancel a pending request
  .patch(
    "/:id/cancel",
    async (ctx) => {
      const { pdcService, tenantContext, params, set } = ctx as any;

      try {
        const result = await pdcService.cancelMyChangeRequest(tenantContext, params.id);

        if (!result.success) {
          set.status = mapErrorToStatus(
            result.error?.code || "INTERNAL_ERROR",
            personalDetailChangeErrorStatusMap
          );
          return { error: result.error };
        }

        return formatChangeRequest(result.data);
      } catch (error: any) {
        logger.error({ err: error, module: "personal-detail-changes" }, "Portal personal-detail-changes PATCH cancel error");
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to cancel change request",
            requestId: "",
          },
        };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      params: IdParamsSchema,
      headers: IdempotencyHeaderSchema,
      response: {
        200: ChangeRequestResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Portal"],
        summary: "Cancel a pending personal detail change request",
        description:
          "Employee cancels their own pending change request. Only requests in 'pending' status owned by the authenticated employee can be cancelled.",
      },
    }
  );

// =============================================================================
// Admin Routes (HR / Manager Review)
// =============================================================================

export const personalDetailChangeAdminRoutes = new Elysia({
  prefix: "/hr/personal-detail-changes",
  name: "personal-detail-change-admin-routes",
})
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new PersonalDetailChangeRepository(db);
    const service = new PersonalDetailChangeService(repository);

    const { tenant, user } = ctx as any;
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { pdcService: service, tenantContext };
  })

  // GET /hr/personal-detail-changes -- List pending requests for review
  .get(
    "/",
    async (ctx) => {
      const { pdcService, tenantContext, query, set } = ctx as any;

      try {
        const { cursor, limit, employee_id } = query || {};
        const result = await pdcService.listPendingForReview(
          tenantContext,
          { employeeId: employee_id },
          { cursor, limit: limit ? Number(limit) : undefined }
        );

        return {
          items: result.items.map(formatChangeRequest),
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        };
      } catch (error: any) {
        logger.error({ err: error, module: "personal-detail-changes" }, "HR personal-detail-changes GET error");
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to list pending change requests",
            requestId: "",
          },
        };
      }
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      query: t.Composite([
        t.Partial(PaginationQuerySchema),
        t.Object({ employee_id: t.Optional(UuidSchema) }),
      ]),
      response: {
        200: ChangeRequestListResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "List pending personal detail change requests for review",
        description:
          "HR/Manager lists all pending personal detail change requests that require approval. Optionally filter by employee_id.",
      },
    }
  )

  // GET /hr/personal-detail-changes/count -- Count pending for review
  .get(
    "/count",
    async (ctx) => {
      const { pdcService, tenantContext, set } = ctx as any;

      try {
        const count = await pdcService.getPendingReviewCount(tenantContext);
        return { count };
      } catch (error: any) {
        logger.error({ err: error, module: "personal-detail-changes" }, "HR personal-detail-changes count error");
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to get pending count",
            requestId: "",
          },
        };
      }
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      response: {
        200: t.Object({ count: t.Number() }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Get count of pending personal detail change requests for review",
      },
    }
  )

  // GET /hr/personal-detail-changes/:id -- Get a single change request
  .get(
    "/:id",
    async (ctx) => {
      const { pdcService, tenantContext, params, set } = ctx as any;

      try {
        const result = await pdcService.getChangeRequest(tenantContext, params.id);

        if (!result.success) {
          set.status = mapErrorToStatus(
            result.error?.code || "INTERNAL_ERROR",
            personalDetailChangeErrorStatusMap
          );
          return { error: result.error };
        }

        return formatChangeRequest(result.data);
      } catch (error: any) {
        logger.error({ err: error, module: "personal-detail-changes" }, "HR personal-detail-changes GET/:id error");
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to get change request",
            requestId: "",
          },
        };
      }
    },
    {
      beforeHandle: [requirePermission("employees", "read")],
      params: IdParamsSchema,
      response: {
        200: ChangeRequestResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Get a personal detail change request by ID",
      },
    }
  )

  // PATCH /hr/personal-detail-changes/:id/review -- Approve or reject
  .patch(
    "/:id/review",
    async (ctx) => {
      const { pdcService, tenantContext, params, body, set } = ctx as any;

      try {
        const result = await pdcService.reviewChangeRequest(
          tenantContext,
          params.id,
          body
        );

        if (!result.success) {
          set.status = mapErrorToStatus(
            result.error?.code || "INTERNAL_ERROR",
            personalDetailChangeErrorStatusMap
          );
          return { error: result.error };
        }

        return formatChangeRequest(result.data);
      } catch (error: any) {
        logger.error({ err: error, module: "personal-detail-changes" }, "HR personal-detail-changes PATCH review error");
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to review change request",
            requestId: "",
          },
        };
      }
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: IdParamsSchema,
      body: ReviewChangeRequestSchema,
      headers: IdempotencyHeaderSchema,
      response: {
        200: ChangeRequestResponseSchema,
        400: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Review (approve/reject) a personal detail change request",
        description:
          "HR/Manager approves or rejects an employee's pending personal detail change request. Approved changes are applied to the employee record immediately.",
      },
    }
  );

export type PersonalDetailChangePortalRoutes = typeof personalDetailChangePortalRoutes;
export type PersonalDetailChangeAdminRoutes = typeof personalDetailChangeAdminRoutes;
