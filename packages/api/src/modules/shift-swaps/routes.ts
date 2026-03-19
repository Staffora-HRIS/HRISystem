/**
 * Shift Swap Routes
 *
 * Elysia routes for the shift swap two-phase approval workflow.
 *
 * Endpoints:
 *   POST   /shift-swaps            - Request a swap (creates pending_target)
 *   GET    /shift-swaps            - List swap requests (own + incoming)
 *   GET    /shift-swaps/:id        - Get a single swap request
 *   POST   /shift-swaps/:id/accept - Target employee accepts (-> pending_manager)
 *   POST   /shift-swaps/:id/reject - Target employee rejects (-> rejected)
 *   POST   /shift-swaps/:id/approve - Manager approves (-> approved, shifts swapped)
 *   POST   /shift-swaps/:id/manager-reject - Manager rejects (-> rejected)
 *   POST   /shift-swaps/:id/cancel - Requester cancels (-> cancelled)
 */

import { Elysia } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ShiftSwapRepository } from "./repository";
import { ShiftSwapService, ShiftSwapErrorCodes } from "./service";
import {
  CreateShiftSwapRequestSchema,
  RespondToSwapSchema,
  ManagerApprovalSchema,
  ShiftSwapFiltersSchema,
  IdParamsSchema,
  IdempotencyHeaderSchema,
} from "./schemas";

/** Map error codes to HTTP status codes */
function errorStatus(code?: string): number {
  switch (code) {
    case ShiftSwapErrorCodes.SWAP_REQUEST_NOT_FOUND:
    case ShiftSwapErrorCodes.ASSIGNMENT_NOT_FOUND:
    case ShiftSwapErrorCodes.EMPLOYEE_NOT_FOUND:
      return 404;
    case ShiftSwapErrorCodes.CANNOT_SWAP_OWN_SHIFT:
    case ShiftSwapErrorCodes.ASSIGNMENT_OWNER_MISMATCH:
    case ShiftSwapErrorCodes.PENDING_SWAP_EXISTS:
    case ShiftSwapErrorCodes.NOT_TARGET_EMPLOYEE:
    case ShiftSwapErrorCodes.NOT_REQUESTER:
    case ShiftSwapErrorCodes.STATE_MACHINE_VIOLATION:
    case ShiftSwapErrorCodes.INVALID_STATUS_FOR_ACCEPT:
    case ShiftSwapErrorCodes.INVALID_STATUS_FOR_REJECT:
    case ShiftSwapErrorCodes.INVALID_STATUS_FOR_APPROVE:
    case ShiftSwapErrorCodes.INVALID_STATUS_FOR_CANCEL:
      return 400;
    default:
      return 500;
  }
}

export const shiftSwapRoutes = new Elysia({ prefix: "/shift-swaps" })
  .derive((ctx) => {
    const { db } = ctx as any;
    const repo = new ShiftSwapRepository(db);
    const service = new ShiftSwapService(repo);
    return { shiftSwapService: service };
  })

  // ===========================================================================
  // POST /shift-swaps - Create a swap request
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const { shiftSwapService, tenant, user, body, set } = ctx as any;

      const result = await shiftSwapService.createSwapRequest(
        { tenantId: tenant.id, userId: user.id },
        body
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      set.status = 201;
      return result.data;
    },
    {
      body: CreateShiftSwapRequestSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("time:shifts", "write")],
      detail: {
        tags: ["Time"],
        summary: "Request a shift swap",
        description:
          "Creates a new shift swap request in pending_target status. " +
          "The target employee must then accept before manager approval.",
      },
    }
  )

  // ===========================================================================
  // GET /shift-swaps - List swap requests
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { shiftSwapService, tenant, user, query, set } = ctx as any;

      const result = await shiftSwapService.listSwapRequests(
        { tenantId: tenant.id, userId: user.id },
        query || {}
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      query: ShiftSwapFiltersSchema,
      beforeHandle: [requirePermission("time:shifts", "read")],
      detail: {
        tags: ["Time"],
        summary: "List shift swap requests",
        description:
          "Lists swap requests where the current user is the requester or target. " +
          "Use asRequester/asTarget query params to filter.",
      },
    }
  )

  // ===========================================================================
  // GET /shift-swaps/:id - Get a single swap request
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { shiftSwapService, tenant, user, params, set } = ctx as any;

      const result = await shiftSwapService.getSwapRequestById(
        { tenantId: tenant.id, userId: user.id },
        params.id
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("time:shifts", "read")],
      detail: {
        tags: ["Time"],
        summary: "Get shift swap request by ID",
      },
    }
  )

  // ===========================================================================
  // POST /shift-swaps/:id/accept - Target employee accepts
  // ===========================================================================
  .post(
    "/:id/accept",
    async (ctx) => {
      const { shiftSwapService, tenant, user, params, body, set } = ctx as any;

      const result = await shiftSwapService.acceptSwapRequest(
        { tenantId: tenant.id, userId: user.id },
        params.id,
        body || {}
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      body: RespondToSwapSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("time:shifts", "write")],
      detail: {
        tags: ["Time"],
        summary: "Accept a shift swap request (target employee)",
        description:
          "Target employee accepts the swap request, moving it from pending_target to pending_manager.",
      },
    }
  )

  // ===========================================================================
  // POST /shift-swaps/:id/reject - Target employee rejects
  // ===========================================================================
  .post(
    "/:id/reject",
    async (ctx) => {
      const { shiftSwapService, tenant, user, params, body, set } = ctx as any;

      const result = await shiftSwapService.rejectSwapByTarget(
        { tenantId: tenant.id, userId: user.id },
        params.id,
        body || {}
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      body: RespondToSwapSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("time:shifts", "write")],
      detail: {
        tags: ["Time"],
        summary: "Reject a shift swap request (target employee)",
        description:
          "Target employee rejects the swap request, moving it to rejected status.",
      },
    }
  )

  // ===========================================================================
  // POST /shift-swaps/:id/approve - Manager approves
  // ===========================================================================
  .post(
    "/:id/approve",
    async (ctx) => {
      const { shiftSwapService, tenant, user, params, body, set } = ctx as any;

      const result = await shiftSwapService.approveSwapByManager(
        { tenantId: tenant.id, userId: user.id },
        params.id,
        body || {}
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      body: ManagerApprovalSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("time:shifts", "write")],
      detail: {
        tags: ["Time"],
        summary: "Approve a shift swap request (manager)",
        description:
          "Manager approves the swap request after target accepted. " +
          "Moves to approved status and executes the actual shift assignment swap.",
      },
    }
  )

  // ===========================================================================
  // POST /shift-swaps/:id/manager-reject - Manager rejects
  // ===========================================================================
  .post(
    "/:id/manager-reject",
    async (ctx) => {
      const { shiftSwapService, tenant, user, params, body, set } = ctx as any;

      const result = await shiftSwapService.rejectSwapByManager(
        { tenantId: tenant.id, userId: user.id },
        params.id,
        body || {}
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      body: ManagerApprovalSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("time:shifts", "write")],
      detail: {
        tags: ["Time"],
        summary: "Reject a shift swap request (manager)",
        description:
          "Manager rejects the swap request after target accepted. Moves to rejected status.",
      },
    }
  )

  // ===========================================================================
  // POST /shift-swaps/:id/cancel - Requester cancels
  // ===========================================================================
  .post(
    "/:id/cancel",
    async (ctx) => {
      const { shiftSwapService, tenant, user, params, set } = ctx as any;

      const result = await shiftSwapService.cancelSwapRequest(
        { tenantId: tenant.id, userId: user.id },
        params.id
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("time:shifts", "write")],
      detail: {
        tags: ["Time"],
        summary: "Cancel a shift swap request (requester)",
        description:
          "Requester cancels their swap request. Only works when status is pending_target or pending_manager.",
      },
    }
  );

export type ShiftSwapRoutes = typeof shiftSwapRoutes;
