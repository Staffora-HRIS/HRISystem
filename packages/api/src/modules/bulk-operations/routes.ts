/**
 * Bulk Operations Module - Elysia Routes
 *
 * Defines the API endpoints for bulk operations.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - POST   /bulk/employees       requires employees:write
 * - PATCH  /bulk/employees       requires employees:write
 * - POST   /bulk/leave-requests  requires absence:approvals:write
 *
 * All endpoints:
 * - Require Idempotency-Key header (enforced by the global idempotencyPlugin)
 * - Return a BulkResponse with per-item success/failure results
 * - Always return HTTP 200 even when individual items fail (partial success)
 * - Return HTTP 400 only for request-level validation errors
 * - Return HTTP 500 only for unexpected server errors
 */

import { Elysia } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { BulkOperationsRepository } from "./repository";
import { BulkOperationsService } from "./service";
import {
  BulkCreateEmployeesRequestSchema,
  BulkUpdateEmployeesRequestSchema,
  BulkLeaveRequestActionsRequestSchema,
  BulkResponseSchema,
  IdempotencyHeaderSchema,
} from "./schemas";

/**
 * Module-specific error code to HTTP status mapping
 */
const BULK_ERROR_MAP: Record<string, number> = {
  VALIDATION_ERROR: 400,
  INTERNAL_ERROR: 500,
};

/**
 * Create bulk operations routes plugin
 */
export const bulkOperationsRoutes = new Elysia({
  prefix: "/bulk",
  name: "bulk-operations-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new BulkOperationsRepository(db);
    const service = new BulkOperationsService(repository);
    return { bulkService: service };
  })

  // ===========================================================================
  // POST /bulk/employees - Bulk create employees
  // ===========================================================================
  .post(
    "/employees",
    async (ctx) => {
      const { bulkService, tenantContext, body, error: errorFn, requestId } = ctx as any;

      const result = await bulkService.bulkCreateEmployees(
        tenantContext,
        body.employees
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code, BULK_ERROR_MAP);
        return errorFn(status, {
          error: {
            code: result.error!.code,
            message: result.error!.message,
            details: result.error!.details,
            requestId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      body: BulkCreateEmployeesRequestSchema,
      response: {
        200: BulkResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      headers: IdempotencyHeaderSchema,
      detail: {
        tags: ["Bulk Operations"],
        summary: "Bulk create employees",
        description:
          "Create multiple employees in a single request. Each item is processed " +
          "within a shared transaction. The response includes per-item results with " +
          "success/failure status. Maximum batch size is 100 items.",
      },
    }
  )

  // ===========================================================================
  // PATCH /bulk/employees - Bulk update employee fields
  // ===========================================================================
  .patch(
    "/employees",
    async (ctx) => {
      const { bulkService, tenantContext, body, error: errorFn, requestId } = ctx as any;

      const result = await bulkService.bulkUpdateEmployees(
        tenantContext,
        body.employees
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code, BULK_ERROR_MAP);
        return errorFn(status, {
          error: {
            code: result.error!.code,
            message: result.error!.message,
            details: result.error!.details,
            requestId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      body: BulkUpdateEmployeesRequestSchema,
      response: {
        200: BulkResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      headers: IdempotencyHeaderSchema,
      detail: {
        tags: ["Bulk Operations"],
        summary: "Bulk update employee fields",
        description:
          "Update multiple employees in a single request. Supports effective-dated " +
          "changes for personal info, contract, and compensation. Each item is processed " +
          "within a shared transaction. Maximum batch size is 100 items.",
      },
    }
  )

  // ===========================================================================
  // POST /bulk/leave-requests - Bulk approve/reject leave requests
  // ===========================================================================
  .post(
    "/leave-requests",
    async (ctx) => {
      const { bulkService, tenantContext, body, error: errorFn, requestId } = ctx as any;

      const result = await bulkService.bulkLeaveRequestActions(
        tenantContext,
        body.actions
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code, BULK_ERROR_MAP);
        return errorFn(status, {
          error: {
            code: result.error!.code,
            message: result.error!.message,
            details: result.error!.details,
            requestId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence:approvals", "write")],
      body: BulkLeaveRequestActionsRequestSchema,
      response: {
        200: BulkResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      headers: IdempotencyHeaderSchema,
      detail: {
        tags: ["Bulk Operations"],
        summary: "Bulk approve/reject leave requests",
        description:
          "Approve or reject multiple leave requests in a single request. " +
          "Only pending leave requests can be actioned. Each item is processed " +
          "within a shared transaction. Maximum batch size is 100 items.",
      },
    }
  );

export type BulkOperationsRoutes = typeof bulkOperationsRoutes;
