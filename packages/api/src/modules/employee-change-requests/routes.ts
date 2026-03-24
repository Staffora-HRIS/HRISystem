/**
 * Employee Change Requests Module - Elysia Routes
 *
 * Two route groups:
 * 1. /portal/change-requests — Employee self-service (submit, list own, cancel)
 * 2. /hr/change-requests — HR/Manager review (list pending, approve/reject)
 */

import { Elysia, t } from "elysia";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import { logger } from "../../lib/logger";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { ChangeRequestRepository } from "./repository";
import { ChangeRequestService } from "./service";
import {
  CreateChangeRequestSchema,
  CreateBulkChangeRequestSchema,
  ReviewChangeRequestSchema,
  ChangeRequestResponseSchema,
  ChangeRequestListResponseSchema,
  ChangeRequestFiltersSchema,
  IdParamsSchema,
  IdempotencyHeaderSchema,
  PaginationQuerySchema,
  ChangeRequestStatusSchema,
  FieldCategorySchema,
  UuidSchema,
} from "./schemas";

// =============================================================================
// Error status map
// =============================================================================

const changeRequestErrorStatusMap: Record<string, number> = {
  EMPLOYEE_NOT_FOUND: 404,
  INVALID_FIELD: 400,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
};

// =============================================================================
// Helper to format response row
// =============================================================================

function formatChangeRequest(row: any) {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    field_category: row.fieldCategory,
    field_name: row.fieldName,
    old_value: row.oldValue ?? null,
    new_value: row.newValue,
    requires_approval: row.requiresApproval,
    status: row.status,
    reviewer_id: row.reviewerId ?? null,
    reviewer_notes: row.reviewerNotes ?? null,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    reviewed_at: row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : row.reviewedAt ? String(row.reviewedAt) : null,
    employee_name: row.employeeName ?? undefined,
    reviewer_name: row.reviewerName ?? undefined,
  };
}

// =============================================================================
// Portal Routes (Employee Self-Service)
// =============================================================================

export const changeRequestPortalRoutes = new Elysia({ prefix: "/portal/change-requests" })
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new ChangeRequestRepository(db);
    const service = new ChangeRequestService(repository);

    const { tenant, user } = ctx as any;
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { changeRequestService: service, tenantContext };
  })

  // POST /portal/change-requests — Submit a single change request
  .post(
    "/",
    async (ctx) => {
      const { changeRequestService, tenantContext, body, set } = ctx as any;

      try {
        const result = await changeRequestService.submitChangeRequest(tenantContext, body);

        if (!result.success) {
          set.status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", changeRequestErrorStatusMap);
          return { error: result.error };
        }

        set.status = 201;
        return formatChangeRequest(result.data);
      } catch (error: any) {
        logger.error({ err: error, module: "employee-change-requests" }, "Portal change-requests POST error");
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to submit change request", requestId: "" } };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      body: CreateChangeRequestSchema,
      headers: IdempotencyHeaderSchema,
      detail: {
        tags: ["Portal"],
        summary: "Submit a personal details change request",
        description: "Employee submits a change request. Non-sensitive fields are auto-approved. Sensitive fields require HR/manager approval.",
      },
    }
  )

  // POST /portal/change-requests/bulk — Submit multiple change requests
  .post(
    "/bulk",
    async (ctx) => {
      const { changeRequestService, tenantContext, body, set } = ctx as any;

      try {
        const result = await changeRequestService.submitBulkChangeRequests(tenantContext, body.changes);

        if (!result.success) {
          set.status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", changeRequestErrorStatusMap);
          return { error: result.error };
        }

        set.status = 201;
        return { items: result.data!.map(formatChangeRequest) };
      } catch (error: any) {
        logger.error({ err: error, module: "employee-change-requests" }, "Portal change-requests bulk POST error");
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to submit change requests", requestId: "" } };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      body: CreateBulkChangeRequestSchema,
      headers: IdempotencyHeaderSchema,
      detail: {
        tags: ["Portal"],
        summary: "Submit multiple change requests at once",
        description: "Submit a batch of field change requests (e.g., name change with first_name + last_name).",
      },
    }
  )

  // GET /portal/change-requests — List my change requests
  .get(
    "/",
    async (ctx) => {
      const { changeRequestService, tenantContext, query, set } = ctx as any;

      try {
        const { cursor, limit, status } = query || {};
        const result = await changeRequestService.listMyChangeRequests(
          tenantContext,
          { status },
          { cursor, limit: limit ? Number(limit) : undefined }
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", changeRequestErrorStatusMap);
          return { error: result.error };
        }

        return {
          items: result.data!.items.map(formatChangeRequest),
          nextCursor: result.data!.nextCursor,
          hasMore: result.data!.hasMore,
        };
      } catch (error: any) {
        logger.error({ err: error, module: "employee-change-requests" }, "Portal change-requests GET error");
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to list change requests", requestId: "" } };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      query: t.Composite([
        t.Partial(PaginationQuerySchema),
        t.Object({ status: t.Optional(ChangeRequestStatusSchema) }),
      ]),
      detail: {
        tags: ["Portal"],
        summary: "List my change requests",
        description: "List change requests submitted by the current employee with optional status filter.",
      },
    }
  )

  // GET /portal/change-requests/pending-count — Count pending
  .get(
    "/pending-count",
    async (ctx) => {
      const { changeRequestService, tenantContext, set } = ctx as any;

      try {
        const result = await changeRequestService.getMyPendingCount(tenantContext);
        return { count: result.data ?? 0 };
      } catch (error: any) {
        logger.error({ err: error, module: "employee-change-requests" }, "Portal change-requests pending-count error");
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get pending count", requestId: "" } };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      detail: {
        tags: ["Portal"],
        summary: "Get count of my pending change requests",
      },
    }
  )

  // DELETE /portal/change-requests/:id — Cancel a pending change request
  .delete(
    "/:id",
    async (ctx) => {
      const { changeRequestService, tenantContext, params, set } = ctx as any;

      try {
        const result = await changeRequestService.cancelMyChangeRequest(tenantContext, params.id);

        if (!result.success) {
          set.status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", changeRequestErrorStatusMap);
          return { error: result.error };
        }

        return { success: true, message: "Change request cancelled" };
      } catch (error: any) {
        logger.error({ err: error, module: "employee-change-requests" }, "Portal change-requests DELETE error");
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to cancel change request", requestId: "" } };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      params: IdParamsSchema,
      headers: IdempotencyHeaderSchema,
      detail: {
        tags: ["Portal"],
        summary: "Cancel a pending change request",
        description: "Employee cancels their own pending change request.",
      },
    }
  );

// =============================================================================
// HR/Manager Review Routes
// =============================================================================

export const changeRequestAdminRoutes = new Elysia({ prefix: "/hr/change-requests" })
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new ChangeRequestRepository(db);
    const service = new ChangeRequestService(repository);

    const { tenant, user } = ctx as any;
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { changeRequestService: service, tenantContext };
  })

  // GET /hr/change-requests — List pending change requests for review
  .get(
    "/",
    async (ctx) => {
      const { changeRequestService, tenantContext, query, set } = ctx as any;

      try {
        const { cursor, limit, employee_id, field_category } = query || {};
        const result = await changeRequestService.listPendingForReview(
          tenantContext,
          { employeeId: employee_id, fieldCategory: field_category },
          { cursor, limit: limit ? Number(limit) : undefined }
        );

        return {
          items: result.items.map(formatChangeRequest),
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        };
      } catch (error: any) {
        logger.error({ err: error, module: "employee-change-requests" }, "HR change-requests GET error");
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to list change requests", requestId: "" } };
      }
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      query: t.Composite([
        t.Partial(PaginationQuerySchema),
        t.Object({
          employee_id: t.Optional(UuidSchema),
          field_category: t.Optional(FieldCategorySchema),
        }),
      ]),
      detail: {
        tags: ["HR"],
        summary: "List pending change requests for review",
        description: "HR/Manager lists pending employee change requests that require approval.",
      },
    }
  )

  // GET /hr/change-requests/count — Count pending for review
  .get(
    "/count",
    async (ctx) => {
      const { changeRequestService, tenantContext, set } = ctx as any;

      try {
        const count = await changeRequestService.getPendingReviewCount(tenantContext);
        return { count };
      } catch (error: any) {
        logger.error({ err: error, module: "employee-change-requests" }, "HR change-requests count error");
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get pending count", requestId: "" } };
      }
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["HR"],
        summary: "Get count of pending change requests for review",
      },
    }
  )

  // GET /hr/change-requests/:id — Get a single change request
  .get(
    "/:id",
    async (ctx) => {
      const { changeRequestService, tenantContext, params, set } = ctx as any;

      try {
        const result = await changeRequestService.getChangeRequest(tenantContext, params.id);

        if (!result.success) {
          set.status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", changeRequestErrorStatusMap);
          return { error: result.error };
        }

        return formatChangeRequest(result.data);
      } catch (error: any) {
        logger.error({ err: error, module: "employee-change-requests" }, "HR change-requests GET/:id error");
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get change request", requestId: "" } };
      }
    },
    {
      beforeHandle: [requirePermission("employees", "read")],
      params: IdParamsSchema,
      detail: {
        tags: ["HR"],
        summary: "Get a change request by ID",
      },
    }
  )

  // PATCH /hr/change-requests/:id/review — Approve or reject a change request
  .patch(
    "/:id/review",
    async (ctx) => {
      const { changeRequestService, tenantContext, params, body, set } = ctx as any;

      try {
        const result = await changeRequestService.reviewChangeRequest(
          tenantContext,
          params.id,
          body
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", changeRequestErrorStatusMap);
          return { error: result.error };
        }

        return formatChangeRequest(result.data);
      } catch (error: any) {
        logger.error({ err: error, module: "employee-change-requests" }, "HR change-requests PATCH review error");
        set.status = 500;
        return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to review change request", requestId: "" } };
      }
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: IdParamsSchema,
      body: ReviewChangeRequestSchema,
      headers: IdempotencyHeaderSchema,
      detail: {
        tags: ["HR"],
        summary: "Review (approve/reject) a change request",
        description: "HR/Manager approves or rejects an employee's pending change request.",
      },
    }
  );
