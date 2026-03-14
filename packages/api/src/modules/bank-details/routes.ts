/**
 * Bank Details Module - Elysia Routes
 *
 * Defines the API endpoints for employee bank detail operations.
 * All routes require authentication and appropriate permissions.
 *
 * Bank details are sensitive data -- access is restricted to HR admin
 * and payroll roles via the "employees:bank_details" permission.
 *
 * Permission model:
 * - employees:bank_details: read  (for listing/viewing bank details)
 * - employees:bank_details: write (for creating/updating/deleting bank details)
 *
 * Routes (employee sub-resource pattern):
 * - GET    /employees/:employeeId/bank-details       - List bank details for employee
 * - GET    /employees/:employeeId/bank-details/:id   - Get single bank detail
 * - POST   /employees/:employeeId/bank-details       - Create bank detail for employee
 * - PUT    /employees/:employeeId/bank-details/:id   - Update a bank detail
 * - DELETE /employees/:employeeId/bank-details/:id   - Delete a bank detail
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { BankDetailRepository } from "./repository";
import { BankDetailService } from "./service";
import {
  CreateBankDetailSchema,
  UpdateBankDetailSchema,
  BankDetailResponseSchema,
  PaginationQuerySchema,
  EmployeeIdParamsSchema,
  EmployeeBankDetailParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateBankDetail,
  type UpdateBankDetail,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface BankDetailPluginContext {
  bankDetailService: BankDetailService;
  bankDetailRepository: BankDetailRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface BankDetailRouteContext extends BankDetailPluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

/**
 * Create Bank Detail routes plugin
 */
export const bankDetailRoutes = new Elysia({ name: "bank-detail-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new BankDetailRepository(db);
    const service = new BankDetailService(repository, db);

    return { bankDetailService: service, bankDetailRepository: repository };
  })

  // ===========================================================================
  // Employee-Scoped Routes
  // ===========================================================================

  // GET /employees/:employeeId/bank-details - List bank details for employee
  .get(
    "/employees/:employeeId/bank-details",
    async (ctx) => {
      const { bankDetailService, params, query, tenantContext } = ctx as unknown as BankDetailRouteContext;
      const { cursor, limit } = query;

      const result = await bankDetailService.listByEmployee(
        tenantContext,
        params.employeeId,
        { cursor, limit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("employees:bank_details", "read")],
      params: EmployeeIdParamsSchema,
      query: t.Partial(PaginationQuerySchema),
      response: t.Object({
        items: t.Array(BankDetailResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["HR", "Bank Details"],
        summary: "List bank details for an employee",
        description:
          "Returns all bank details for the specified employee with cursor-based pagination. " +
          "Ordered by effective_from descending (most recent first). " +
          "Requires employees:bank_details read permission.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /employees/:employeeId/bank-details/:id - Get single bank detail
  .get(
    "/employees/:employeeId/bank-details/:id",
    async (ctx) => {
      const { bankDetailService, params, tenantContext, error } = ctx as unknown as BankDetailRouteContext;

      const result = await bankDetailService.getById(
        tenantContext,
        params.employeeId,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees:bank_details", "read")],
      params: EmployeeBankDetailParamsSchema,
      response: {
        200: BankDetailResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR", "Bank Details"],
        summary: "Get a bank detail by ID",
        description:
          "Returns a single bank detail record for the specified employee. " +
          "Requires employees:bank_details read permission.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /employees/:employeeId/bank-details - Create bank detail
  .post(
    "/employees/:employeeId/bank-details",
    async (ctx) => {
      const { bankDetailService, params, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as unknown as BankDetailRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await bankDetailService.create(
        tenantContext,
        params.employeeId,
        body as unknown as CreateBankDetail,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "bank_detail",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, employeeId: params.employeeId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees:bank_details", "write")],
      params: EmployeeIdParamsSchema,
      body: CreateBankDetailSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: BankDetailResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR", "Bank Details"],
        summary: "Create a bank detail for an employee",
        description:
          "Create a new bank detail record for the specified employee. " +
          "Sort code must be 6 digits (no hyphens). Account number must be 8 digits. " +
          "If is_primary is true, the primary flag on any existing bank detail is cleared. " +
          "Effective date overlap with existing records is rejected. " +
          "Requires employees:bank_details write permission.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /employees/:employeeId/bank-details/:id - Update bank detail
  .put(
    "/employees/:employeeId/bank-details/:id",
    async (ctx) => {
      const { bankDetailService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as unknown as BankDetailRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit diff
      const oldResult = await bankDetailService.getById(
        tenantContext,
        params.employeeId,
        params.id
      );

      const result = await bankDetailService.update(
        tenantContext,
        params.employeeId,
        params.id,
        body as unknown as UpdateBankDetail,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "bank_detail",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            employeeId: params.employeeId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees:bank_details", "write")],
      params: EmployeeBankDetailParamsSchema,
      body: UpdateBankDetailSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: BankDetailResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR", "Bank Details"],
        summary: "Update a bank detail",
        description:
          "Update fields on an existing bank detail record. " +
          "If is_primary is set to true, the primary flag on other bank details for the same employee is cleared. " +
          "Effective date changes are validated for overlap. " +
          "Requires employees:bank_details write permission.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /employees/:employeeId/bank-details/:id - Delete bank detail
  .delete(
    "/employees/:employeeId/bank-details/:id",
    async (ctx) => {
      const { bankDetailService, params, headers, tenantContext, audit, requestId, error } =
        ctx as unknown as BankDetailRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await bankDetailService.getById(
        tenantContext,
        params.employeeId,
        params.id
      );

      const result = await bankDetailService.delete(
        tenantContext,
        params.employeeId,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "bank_detail",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: {
            idempotencyKey,
            requestId,
            employeeId: params.employeeId,
          },
        });
      }

      return { success: true as const, message: "Bank detail deleted successfully" };
    },
    {
      beforeHandle: [requirePermission("employees:bank_details", "write")],
      params: EmployeeBankDetailParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR", "Bank Details"],
        summary: "Delete a bank detail",
        description:
          "Permanently delete a bank detail record. " +
          "Requires employees:bank_details write permission.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type BankDetailRoutes = typeof bankDetailRoutes;
