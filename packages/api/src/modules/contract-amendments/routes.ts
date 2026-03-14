/**
 * Contract Amendments Module - Elysia Routes
 *
 * Defines the API endpoints for contract amendment operations.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - contracts: read, write
 *
 * Endpoints:
 * - GET    /contract-amendments           List amendments (cursor-paginated)
 * - GET    /contract-amendments/:id       Get amendment by ID
 * - POST   /contract-amendments           Create amendment
 * - PUT    /contract-amendments/:id       Update amendment
 * - PATCH  /contract-amendments/:id/status  Transition status (send_notification / acknowledge)
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { ContractAmendmentRepository } from "./repository";
import { ContractAmendmentService } from "./service";
import {
  CreateContractAmendmentSchema,
  UpdateContractAmendmentSchema,
  AmendmentStatusTransitionSchema,
  ContractAmendmentResponseSchema,
  ContractAmendmentListResponseSchema,
  ContractAmendmentFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateContractAmendment,
  type UpdateContractAmendment,
  type AmendmentStatusTransition,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface AmendmentPluginContext {
  amendmentService: ContractAmendmentService;
  amendmentRepository: ContractAmendmentRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface AmendmentRouteContext extends AmendmentPluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

// Module-specific error code to HTTP status mappings beyond the shared base set
const amendmentErrorStatusMap: Record<string, number> = {
  EMPLOYEE_NOT_FOUND: 404,
  CONTRACT_NOT_FOUND: 404,
  ALREADY_ACKNOWLEDGED: 409,
  NOTIFICATION_ALREADY_SENT: 409,
};

/**
 * Contract amendment routes plugin
 */
export const contractAmendmentRoutes = new Elysia({
  prefix: "/contract-amendments",
  name: "contract-amendment-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new ContractAmendmentRepository(db);
    const service = new ContractAmendmentService(repository, db);

    return { amendmentService: service, amendmentRepository: repository };
  })

  // ===========================================================================
  // GET / - List contract amendments
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { amendmentService, query, tenantContext } = ctx as unknown as AmendmentRouteContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await amendmentService.listAmendments(
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
      beforeHandle: [requirePermission("contracts", "read")],
      query: t.Composite([
        t.Partial(ContractAmendmentFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: ContractAmendmentListResponseSchema,
      detail: {
        tags: ["Contract Amendments"],
        summary: "List contract amendments",
        description:
          "List contract amendments with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /:id - Get contract amendment by ID
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { amendmentService, params, tenantContext, error } = ctx as unknown as AmendmentRouteContext;
      const result = await amendmentService.getAmendment(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          amendmentErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("contracts", "read")],
      params: IdParamsSchema,
      response: {
        200: ContractAmendmentResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Contract Amendments"],
        summary: "Get contract amendment by ID",
        description: "Get a single contract amendment record by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST / - Create contract amendment
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const {
        amendmentService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as unknown as AmendmentRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await amendmentService.createAmendment(
        tenantContext,
        body as unknown as CreateContractAmendment,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          amendmentErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: "hr.contract_amendment.created",
          resourceType: "contract_amendment",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("contracts", "write")],
      body: CreateContractAmendmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: ContractAmendmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Contract Amendments"],
        summary: "Create contract amendment",
        description:
          "Create a new contract amendment record. " +
          "The notification_date must be at least 1 month before the effective_date " +
          "(Employment Rights Act 1996, s.4).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PUT /:id - Update contract amendment
  // ===========================================================================
  .put(
    "/:id",
    async (ctx) => {
      const {
        amendmentService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as unknown as AmendmentRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit diff
      const oldResult = await amendmentService.getAmendment(
        tenantContext,
        params.id
      );

      const result = await amendmentService.updateAmendment(
        tenantContext,
        params.id,
        body as unknown as UpdateContractAmendment,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          amendmentErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the update
      if (audit) {
        await audit.log({
          action: "hr.contract_amendment.updated",
          resourceType: "contract_amendment",
          resourceId: result.data!.id,
          oldValues: oldResult.success ? oldResult.data : undefined,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("contracts", "write")],
      params: IdParamsSchema,
      body: UpdateContractAmendmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ContractAmendmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Contract Amendments"],
        summary: "Update contract amendment",
        description:
          "Update an existing contract amendment. " +
          "Cannot update an amendment that has already been acknowledged.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /:id/status - Transition amendment status
  // ===========================================================================
  .patch(
    "/:id/status",
    async (ctx) => {
      const {
        amendmentService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as unknown as AmendmentRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as AmendmentStatusTransition;
      const result = await amendmentService.transitionStatus(
        tenantContext,
        params.id,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          amendmentErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the transition
      if (audit) {
        const action =
          typedBody.action === "send_notification"
            ? "hr.contract_amendment.notification_sent"
            : "hr.contract_amendment.acknowledged";

        await audit.log({
          action,
          resourceType: "contract_amendment",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { transition: typedBody.action, idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("contracts", "write")],
      params: IdParamsSchema,
      body: AmendmentStatusTransitionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ContractAmendmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Contract Amendments"],
        summary: "Transition amendment status",
        description:
          "Transition a contract amendment's status. " +
          "Actions: 'send_notification' marks notification as sent; " +
          "'acknowledge' records employee acknowledgement (requires notification to have been sent first).",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type ContractAmendmentRoutes = typeof contractAmendmentRoutes;
