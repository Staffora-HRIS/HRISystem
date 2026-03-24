/**
 * Absence Management Routes
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema } from "../../lib/route-helpers";
import { AbsenceRepository } from "./repository";
import { AbsenceService } from "./service";
import {
  CreateLeaveTypeSchema,
  CreateLeavePolicySchema,
  UpdateLeavePolicySchema,
  CreateLeaveRequestSchema,
  LeaveRequestFiltersSchema,
  LeaveApprovalSchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
} from "./schemas";

export const absenceRoutes = new Elysia({ prefix: "/absence", name: "absence-routes" })
  .derive((ctx) => {
    const { db, cache } = ctx as any;
    const repo = new AbsenceRepository(db);
    const service = new AbsenceService(repo);
    return { absenceService: service };
  })

  // Leave Types
  .get(
    "/leave-types",
    async (ctx) => {
      const { absenceService, tenantContext } = ctx as any;
      const result = await absenceService.getLeaveTypes(tenantContext);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to fetch leave types");
      }
      const items = result.data || [];
      return { items, nextCursor: null, hasMore: false };
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      detail: { tags: ["Absence"], summary: "List leave types" },
    }
  )

  .post(
    "/leave-types",
    async (ctx) => {
      const { absenceService, tenantContext, body } = ctx as any;
      const result = await absenceService.createLeaveType(tenantContext, body as any);
      if (!result.success) {
        ctx.set.status = 400;
        return { error: { code: result.error?.code || "VALIDATION_ERROR", message: result.error?.message || "Failed to create leave type" } };
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      body: CreateLeaveTypeSchema,
      detail: { tags: ["Absence"], summary: "Create leave type" },
    }
  )

  .get(
    "/leave-types/:id",
    async (ctx) => {
      const { absenceService, tenantContext, params, error } = ctx as any;
      const result = await absenceService.getLeaveTypeById(tenantContext, params.id);
      if (!result.success) {
        return error(result.error?.code === "LEAVE_TYPE_NOT_FOUND" ? 404 : 500, {
          error: result.error,
        });
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      params: IdParamsSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Get leave type by ID" },
    }
  )

  .delete(
    "/leave-types/:id",
    async (ctx) => {
      const { absenceService, tenantContext, params, error } = ctx as any;
      const result = await absenceService.deleteLeaveType(tenantContext, params.id);
      if (!result.success) {
        return error(result.error?.code === "LEAVE_TYPE_NOT_FOUND" ? 404 : 500, {
          error: result.error,
        });
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      params: IdParamsSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Delete (deactivate) leave type" },
    }
  )

  .put(
    "/leave-types/:id",
    async (ctx) => {
      const { absenceService, tenantContext, params, body, error } = ctx as any;
      const result = await absenceService.updateLeaveType(tenantContext, params.id, body as any);
      if (!result.success) {
        return error(result.error?.code === "LEAVE_TYPE_NOT_FOUND" ? 404 : 500, {
          error: result.error,
        });
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      params: IdParamsSchema,
      body: CreateLeaveTypeSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Update leave type" },
    }
  )

  // Leave Policies
  .get(
    "/policies",
    async (ctx) => {
      const { absenceService, tenantContext } = ctx as any;
      const result = await absenceService.getLeavePolicies(tenantContext);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to fetch policies");
      }
      const items = result.data || [];
      return { items, nextCursor: null, hasMore: false };
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      detail: { tags: ["Absence"], summary: "List leave policies" },
    }
  )

  .post(
    "/policies",
    async (ctx) => {
      const { absenceService, tenantContext, body } = ctx as any;
      const result = await absenceService.createLeavePolicy(tenantContext, body as any);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to create policy");
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      body: CreateLeavePolicySchema,
      detail: { tags: ["Absence"], summary: "Create leave policy" },
    }
  )

  .delete(
    "/policies/:id",
    async (ctx) => {
      const { absenceService, tenantContext, params, error } = ctx as any;
      const result = await absenceService.deleteLeavePolicy(tenantContext, params.id);
      if (!result.success) {
        return error(result.error?.code === "LEAVE_POLICY_NOT_FOUND" ? 404 : 500, {
          error: result.error,
        });
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      params: IdParamsSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Delete (deactivate) leave policy" },
    }
  )

  .put(
    "/policies/:id",
    async (ctx) => {
      const { absenceService, tenantContext, params, body, error } = ctx as any;
      const result = await absenceService.updateLeavePolicy(tenantContext, params.id, body as any);
      if (!result.success) {
        const statusCode = result.error?.code === "LEAVE_POLICY_NOT_FOUND" ? 404
          : result.error?.code === "LEAVE_TYPE_NOT_FOUND" ? 404
          : result.error?.code === "BELOW_STATUTORY_MINIMUM" ? 422
          : 500;
        return error(statusCode, {
          error: result.error,
        });
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      params: IdParamsSchema,
      body: UpdateLeavePolicySchema,
      response: {
        404: ErrorResponseSchema,
        422: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Update leave policy" },
    }
  )

  // Leave Requests
  .get(
    "/requests",
    async (ctx) => {
      const { absenceService, tenantContext, query } = ctx as any;
      const result = await absenceService.getLeaveRequests(tenantContext, query);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to fetch requests");
      }
      const { items, cursor, hasMore } = result.data!;
      return { items, nextCursor: cursor, hasMore };
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      query: t.Partial(LeaveRequestFiltersSchema),
      detail: { tags: ["Absence"], summary: "List leave requests" },
    }
  )

  .post(
    "/requests",
    async (ctx) => {
      const { absenceService, tenantContext, body } = ctx as any;
      const result = await absenceService.createLeaveRequest(tenantContext, body as any);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to create request");
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      body: CreateLeaveRequestSchema,
      detail: { tags: ["Absence"], summary: "Create leave request" },
    }
  )

  .get(
    "/requests/:id",
    async (ctx) => {
      const { absenceService, tenantContext, params, error } = ctx as any;
      const result = await absenceService.getLeaveRequestById(tenantContext, params.id);
      if (!result.success) {
        return error(result.error?.code === "LEAVE_REQUEST_NOT_FOUND" ? 404 : 500, {
          error: result.error,
        });
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      params: IdParamsSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Get leave request by ID" },
    }
  )

  .post(
    "/requests/:id/submit",
    async (ctx) => {
      const { absenceService, tenantContext, params, error } = ctx as any;
      const result = await absenceService.submitLeaveRequest(tenantContext, params.id);
      if (!result.success) {
        return error(result.error?.code === "LEAVE_REQUEST_NOT_FOUND" ? 404 : 400, {
          error: result.error,
        });
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      params: IdParamsSchema,
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Submit leave request" },
    }
  )

  .post(
    "/requests/:id/approve",
    async (ctx) => {
      const { absenceService, tenantContext, params, body, error } = ctx as any;
      let result;
      if ((body as any).action === "approve") {
        result = await absenceService.approveLeaveRequest(
          tenantContext,
          params.id,
          tenantContext.userId,
          (body as any).comments
        );
      } else {
        result = await absenceService.rejectLeaveRequest(
          tenantContext,
          params.id,
          tenantContext.userId,
          (body as any).comments
        );
      }
      if (!result.success) {
        return error(result.error?.code === "REQUEST_NOT_PENDING" ? 400 : 500, {
          error: result.error,
        });
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence:approvals", "write")],
      params: IdParamsSchema,
      body: LeaveApprovalSchema,
      response: {
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Approve or reject leave request" },
    }
  )

  .delete(
    "/requests/:id",
    async (ctx) => {
      const { absenceService, tenantContext, params, error } = ctx as any;
      const result = await absenceService.cancelLeaveRequest(tenantContext, params.id);
      if (!result.success) {
        return error(result.error?.code === "LEAVE_REQUEST_NOT_FOUND" ? 404 : 400, {
          error: result.error,
        });
      }
      return { success: true, message: "Leave request cancelled" };
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      params: IdParamsSchema,
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Cancel leave request" },
    }
  )

  // Leave Balances
  .get(
    "/balances/:employeeId",
    async (ctx) => {
      const { absenceService, tenantContext, params, query } = ctx as any;
      const year = query.year ? parseInt(query.year, 10) : undefined;
      const result = await absenceService.getLeaveBalances(
        tenantContext,
        params.employeeId,
        year
      );
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to fetch balances");
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      params: EmployeeIdParamsSchema,
      query: t.Object({
        year: t.Optional(t.String()),
      }),
      detail: { tags: ["Absence"], summary: "Get employee leave balances" },
    }
  )

  // Bradford Factor
  .get(
    "/bradford-factor/:employeeId",
    async (ctx) => {
      const { absenceService, tenantContext, params, query, error } = ctx as any;
      const months = query.months ? parseInt(query.months, 10) : 12;
      const result = await absenceService.getBradfordFactor(
        tenantContext,
        params.employeeId,
        months
      );
      if (!result.success) {
        return error(404, { error: result.error });
      }
      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      params: EmployeeIdParamsSchema,
      query: t.Object({
        months: t.Optional(t.String()),
      }),
      detail: { tags: ["Absence"], summary: "Get employee Bradford Factor score" },
    }
  );

export type AbsenceRoutes = typeof absenceRoutes;
