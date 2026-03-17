/**
 * E-Signatures Module - Elysia Routes
 *
 * Defines the API endpoints for e-signature request management.
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 *   GET    /e-signatures              List signature requests (paginated, filterable)
 *   POST   /e-signatures              Create a new signature request
 *   GET    /e-signatures/:id          Get a single signature request
 *   GET    /e-signatures/:id/events   Get audit trail for a signature request
 *   POST   /e-signatures/:id/send     Mark request as sent (external providers)
 *   POST   /e-signatures/:id/view     Mark request as viewed
 *   POST   /e-signatures/:id/sign     Internal sign ("I agree" with IP + timestamp)
 *   POST   /e-signatures/:id/decline  Decline the signature request
 *   POST   /e-signatures/:id/cancel   Cancel the signature request
 *   POST   /e-signatures/:id/void     Void the signature request (admin)
 *   POST   /e-signatures/:id/remind   Send a reminder to the signer
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { ESignaturesRepository } from "./repository";
import { ESignaturesService } from "./service";
import {
  CreateSignatureRequestSchema,
  SignInternalSchema,
  DeclineSignatureSchema,
  CancelSignatureSchema,
  SendReminderSchema,
  SignatureRequestFiltersSchema,
  SignatureRequestResponseSchema,
  SignatureEventResponseSchema,
  PaginationQuerySchema,
} from "./schemas";

// =============================================================================
// Shared Schemas
// =============================================================================

const SuccessSchema = t.Object({
  success: t.Literal(true),
  message: t.String(),
});

const IdParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

const ESIG_ERROR_CODES: Record<string, number> = {
  STATE_MACHINE_VIOLATION: 409,
  INVALID_PROVIDER: 400,
  DUPLICATE: 409,
};

// =============================================================================
// Routes
// =============================================================================

export const eSignaturesRoutes = new Elysia({
  prefix: "/e-signatures",
  name: "e-signatures-routes",
})
  // Plugin Setup — derive service instances from db plugin
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new ESignaturesRepository(db);
    const service = new ESignaturesService(repository, db);
    return { eSignaturesService: service };
  })

  // =========================================================================
  // GET /e-signatures — List signature requests
  // =========================================================================
  .get(
    "/",
    async (ctx) => {
      const { eSignaturesService, query, tenantContext } = ctx as any;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await eSignaturesService.listSignatureRequests(
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
      beforeHandle: [requirePermission("e-signatures", "read")],
      query: t.Composite([
        t.Partial(SignatureRequestFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(SignatureRequestResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["E-Signatures"],
        summary: "List signature requests",
        description:
          "List signature requests with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // =========================================================================
  // POST /e-signatures — Create signature request
  // =========================================================================
  .post(
    "/",
    async (ctx) => {
      const {
        eSignaturesService,
        body,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as any;

      const result = await eSignaturesService.createSignatureRequest(
        tenantContext,
        body
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          ESIG_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SIGNATURE_REQUEST_CREATED",
          resourceType: "signature_request",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("e-signatures", "write")],
      body: CreateSignatureRequestSchema,
      response: {
        201: SignatureRequestResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["E-Signatures"],
        summary: "Create signature request",
        description:
          "Create a new signature request for a document. Defaults to internal provider.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // =========================================================================
  // GET /e-signatures/:id — Get signature request by ID
  // =========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { eSignaturesService, params, tenantContext, error } = ctx as any;
      const result = await eSignaturesService.getSignatureRequest(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          ESIG_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("e-signatures", "read")],
      params: IdParamsSchema,
      response: {
        200: SignatureRequestResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["E-Signatures"],
        summary: "Get signature request",
        description: "Get a single signature request by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // =========================================================================
  // GET /e-signatures/:id/events — Get audit trail
  // =========================================================================
  .get(
    "/:id/events",
    async (ctx) => {
      const { eSignaturesService, params, tenantContext, error } = ctx as any;
      const result = await eSignaturesService.getSignatureEvents(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          ESIG_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("e-signatures", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({ items: t.Array(SignatureEventResponseSchema) }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["E-Signatures"],
        summary: "Get signature request events",
        description:
          "Get the full audit trail of status transitions for a signature request",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // =========================================================================
  // POST /e-signatures/:id/send — Mark as sent
  // =========================================================================
  .post(
    "/:id/send",
    async (ctx) => {
      const {
        eSignaturesService,
        params,
        body,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as any;

      const result = await eSignaturesService.sendSignatureRequest(
        tenantContext,
        params.id,
        body?.provider_reference
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          ESIG_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SIGNATURE_REQUEST_SENT",
          resourceType: "signature_request",
          resourceId: params.id,
          newValues: { status: "sent" },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("e-signatures", "write")],
      params: IdParamsSchema,
      body: t.Optional(
        t.Object({
          provider_reference: t.Optional(t.String({ maxLength: 500 })),
        })
      ),
      response: {
        200: SignatureRequestResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["E-Signatures"],
        summary: "Send signature request",
        description:
          "Mark a signature request as sent. For external providers, include the provider_reference.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // =========================================================================
  // POST /e-signatures/:id/view — Mark as viewed
  // =========================================================================
  .post(
    "/:id/view",
    async (ctx) => {
      const { eSignaturesService, params, tenantContext, error } = ctx as any;

      const result = await eSignaturesService.markViewed(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          ESIG_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("e-signatures", "read")],
      params: IdParamsSchema,
      response: {
        200: SignatureRequestResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["E-Signatures"],
        summary: "Mark signature request as viewed",
        description:
          "Record that the signer has opened/viewed the document",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // =========================================================================
  // POST /e-signatures/:id/sign — Internal sign ("I agree")
  // =========================================================================
  .post(
    "/:id/sign",
    async (ctx) => {
      const {
        eSignaturesService,
        params,
        body,
        tenantContext,
        request,
        audit,
        requestId,
        error,
      } = ctx as any;

      // Extract IP and user-agent for audit
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        null;
      const userAgent = request.headers.get("user-agent") || null;

      const result = await eSignaturesService.signInternal(
        tenantContext,
        params.id,
        ip,
        userAgent
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          ESIG_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SIGNATURE_REQUEST_SIGNED",
          resourceType: "signature_request",
          resourceId: params.id,
          newValues: {
            status: "signed",
            signedAt: result.data!.signed_at,
            ip,
          },
          metadata: { requestId, signerIp: ip },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("e-signatures", "write")],
      params: IdParamsSchema,
      body: SignInternalSchema,
      response: {
        200: SignatureRequestResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["E-Signatures"],
        summary: "Sign internally",
        description:
          'Internal "I agree" signature. Records timestamp, IP address, and user agent for audit.',
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // =========================================================================
  // POST /e-signatures/:id/decline — Decline signature
  // =========================================================================
  .post(
    "/:id/decline",
    async (ctx) => {
      const {
        eSignaturesService,
        params,
        body,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as any;

      const result = await eSignaturesService.declineSignature(
        tenantContext,
        params.id,
        body?.reason
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          ESIG_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SIGNATURE_REQUEST_DECLINED",
          resourceType: "signature_request",
          resourceId: params.id,
          newValues: { status: "declined", reason: body?.reason },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("e-signatures", "write")],
      params: IdParamsSchema,
      body: t.Optional(DeclineSignatureSchema),
      response: {
        200: SignatureRequestResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["E-Signatures"],
        summary: "Decline signature request",
        description: "Decline a signature request with an optional reason",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // =========================================================================
  // POST /e-signatures/:id/cancel — Cancel signature request
  // =========================================================================
  .post(
    "/:id/cancel",
    async (ctx) => {
      const {
        eSignaturesService,
        params,
        body,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as any;

      const result = await eSignaturesService.cancelSignatureRequest(
        tenantContext,
        params.id,
        body?.reason
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          ESIG_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SIGNATURE_REQUEST_CANCELLED",
          resourceType: "signature_request",
          resourceId: params.id,
          newValues: { status: "cancelled" },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("e-signatures", "write")],
      params: IdParamsSchema,
      body: t.Optional(CancelSignatureSchema),
      response: {
        200: SignatureRequestResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["E-Signatures"],
        summary: "Cancel signature request",
        description:
          "Cancel a pending or in-progress signature request",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // =========================================================================
  // POST /e-signatures/:id/void — Void signature request (admin)
  // =========================================================================
  .post(
    "/:id/void",
    async (ctx) => {
      const {
        eSignaturesService,
        params,
        body,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as any;

      const result = await eSignaturesService.voidSignatureRequest(
        tenantContext,
        params.id,
        body?.reason
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          ESIG_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SIGNATURE_REQUEST_VOIDED",
          resourceType: "signature_request",
          resourceId: params.id,
          newValues: { status: "voided" },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("e-signatures", "admin")],
      params: IdParamsSchema,
      body: t.Optional(
        t.Object({
          reason: t.Optional(t.String({ maxLength: 2000 })),
        })
      ),
      response: {
        200: SignatureRequestResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["E-Signatures"],
        summary: "Void signature request",
        description:
          "Void a signature request (admin-level). Can void sent or viewed requests.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // =========================================================================
  // POST /e-signatures/:id/remind — Send reminder
  // =========================================================================
  .post(
    "/:id/remind",
    async (ctx) => {
      const {
        eSignaturesService,
        params,
        body,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as any;

      const result = await eSignaturesService.sendReminder(
        tenantContext,
        params.id,
        body?.message
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          ESIG_ERROR_CODES
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SIGNATURE_REMINDER_SENT",
          resourceType: "signature_request",
          resourceId: params.id,
          newValues: { reminderCount: result.data!.reminder_count },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("e-signatures", "write")],
      params: IdParamsSchema,
      body: t.Optional(SendReminderSchema),
      response: {
        200: SignatureRequestResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["E-Signatures"],
        summary: "Send reminder",
        description:
          "Send a reminder to the signer. Only for active (non-terminal) requests.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type ESignaturesRoutes = typeof eSignaturesRoutes;
