/**
 * Offer Letters Module - Elysia Routes
 *
 * API endpoints for offer letter operations.
 * Mounted under /recruitment/offers within the recruitment module group.
 *
 * Endpoints:
 *   POST   /recruitment/offers           - Create offer letter (from template or raw)
 *   GET    /recruitment/offers            - List offer letters
 *   GET    /recruitment/offers/:id        - Get offer letter by ID
 *   PUT    /recruitment/offers/:id        - Update draft offer letter
 *   POST   /recruitment/offers/:id/send   - Send offer letter to candidate
 *   POST   /recruitment/offers/:id/accept - Candidate accepts
 *   POST   /recruitment/offers/:id/decline- Candidate declines
 *
 * Permission model:
 *   - recruitment: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import type { AuditHelper } from "../../plugins/audit";
import { OfferLetterRepository } from "./repository";
import { OfferLetterService } from "./service";
import {
  CreateOfferLetterSchema,
  UpdateOfferLetterSchema,
  DeclineOfferLetterSchema,
  OfferLetterResponseSchema,
  OfferLetterFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
} from "./schemas";

// =============================================================================
// Plugin context type helpers
// =============================================================================

interface OfferLetterPluginContext {
  offerLetterService: OfferLetterService;
  tenantContext: { tenantId: string; userId?: string } | null;
  tenant: { id: string } | null;
  user: { id: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  set: { status: number };
  error: (status: number, body: unknown) => never;
}

/**
 * Module-specific error code -> HTTP status mapping.
 */
const offerLetterErrorStatusMap: Record<string, number> = {
  STATE_MACHINE_VIOLATION: 409,
  TEMPLATE_INACTIVE: 400,
};

// =============================================================================
// Routes
// =============================================================================

export const offerLetterRoutes = new Elysia({
  prefix: "/recruitment/offers",
  name: "offer-letter-routes",
})
  // ---------------------------------------------------------------------------
  // Service derivation
  // ---------------------------------------------------------------------------
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new OfferLetterRepository(db);
    const service = new OfferLetterService(repository, db);
    return { offerLetterService: service };
  })

  // ---------------------------------------------------------------------------
  // POST /recruitment/offers - Create offer letter
  // ---------------------------------------------------------------------------
  .post(
    "/",
    async (ctx) => {
      const { offerLetterService, body, tenant, audit, set } = ctx as typeof ctx & OfferLetterPluginContext;
      const tenantContext = { tenantId: tenant?.id!, userId: (ctx as any).user?.id };

      try {
        const result = await offerLetterService.createOfferLetter(tenantContext, body as any);

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, offerLetterErrorStatusMap);
          return { error: result.error };
        }

        if (audit) {
          await audit.log({
            action: "recruitment.offer_letter.created",
            resourceType: "offer_letter",
            resourceId: result.data!.id,
            newValues: {
              candidateId: result.data!.candidateId,
              requisitionId: result.data!.requisitionId,
              salaryOffered: result.data!.salaryOffered,
              startDate: result.data!.startDate,
            },
          });
        }

        set.status = 201;
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      body: CreateOfferLetterSchema,
      response: {
        201: OfferLetterResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Offer Letters"],
        summary: "Create offer letter",
        description:
          "Create a new offer letter. If templateId is provided, the content is generated " +
          "from the letter template with automatic variable substitution ({{candidate_name}}, " +
          "{{salary}}, {{start_date}}, {{job_title}}, etc.). Otherwise, raw HTML content must be supplied.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ---------------------------------------------------------------------------
  // GET /recruitment/offers - List offer letters
  // ---------------------------------------------------------------------------
  .get(
    "/",
    async (ctx) => {
      const { offerLetterService, query, tenant, set } = ctx as typeof ctx & OfferLetterPluginContext;
      const tenantContext = { tenantId: tenant?.id!, userId: (ctx as any).user?.id };

      try {
        const { cursor, limit, ...filters } = query as any;
        const parsedLimit = limit !== undefined ? Number(limit) : undefined;
        const result = await offerLetterService.listOfferLetters(
          tenantContext,
          filters,
          { cursor, limit: parsedLimit }
        );

        return {
          offerLetters: result.items,
          count: result.items.length,
          ...result,
        };
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      query: t.Composite([
        t.Partial(OfferLetterFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      detail: {
        tags: ["Recruitment - Offer Letters"],
        summary: "List offer letters",
        description: "List offer letters with optional filters and cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ---------------------------------------------------------------------------
  // GET /recruitment/offers/:id - Get offer letter by ID
  // ---------------------------------------------------------------------------
  .get(
    "/:id",
    async (ctx) => {
      const { offerLetterService, params, tenant, set } = ctx as typeof ctx & OfferLetterPluginContext;
      const tenantContext = { tenantId: tenant?.id!, userId: (ctx as any).user?.id };

      try {
        const result = await offerLetterService.getOfferLetter(tenantContext, params.id);

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, offerLetterErrorStatusMap);
          return { error: result.error };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      params: IdParamsSchema,
      response: {
        200: OfferLetterResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Offer Letters"],
        summary: "Get offer letter",
        description: "Get a single offer letter by its ID, including generated content and status.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ---------------------------------------------------------------------------
  // PUT /recruitment/offers/:id - Update draft offer letter
  // ---------------------------------------------------------------------------
  .put(
    "/:id",
    async (ctx) => {
      const { offerLetterService, params, body, tenant, audit, set } = ctx as typeof ctx & OfferLetterPluginContext;
      const tenantContext = { tenantId: tenant?.id!, userId: (ctx as any).user?.id };

      try {
        const result = await offerLetterService.updateOfferLetter(tenantContext, params.id, body);

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, offerLetterErrorStatusMap);
          return { error: result.error };
        }

        if (audit) {
          await audit.log({
            action: "recruitment.offer_letter.updated",
            resourceType: "offer_letter",
            resourceId: result.data!.id,
            newValues: body as Record<string, unknown>,
          });
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      body: UpdateOfferLetterSchema,
      response: {
        200: OfferLetterResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Offer Letters"],
        summary: "Update draft offer letter",
        description: "Update an offer letter that is still in 'draft' status. Returns 409 if the letter has already been sent.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ---------------------------------------------------------------------------
  // POST /recruitment/offers/:id/send - Send offer letter
  // ---------------------------------------------------------------------------
  .post(
    "/:id/send",
    async (ctx) => {
      const { offerLetterService, params, tenant, audit, set } = ctx as typeof ctx & OfferLetterPluginContext;
      const tenantContext = { tenantId: tenant?.id!, userId: (ctx as any).user?.id };

      try {
        const result = await offerLetterService.sendOfferLetter(tenantContext, params.id);

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, offerLetterErrorStatusMap);
          return { error: result.error };
        }

        if (audit) {
          await audit.log({
            action: "recruitment.offer_letter.sent",
            resourceType: "offer_letter",
            resourceId: result.data!.id,
            newValues: { status: "sent", sentAt: result.data!.sentAt },
          });
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      response: {
        200: OfferLetterResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Offer Letters"],
        summary: "Send offer letter",
        description: "Transition a draft offer letter to 'sent' status. Emits a domain event that downstream workers can use to deliver the letter via email.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ---------------------------------------------------------------------------
  // POST /recruitment/offers/:id/accept - Accept offer letter
  // ---------------------------------------------------------------------------
  .post(
    "/:id/accept",
    async (ctx) => {
      const { offerLetterService, params, tenant, audit, set } = ctx as typeof ctx & OfferLetterPluginContext;
      const tenantContext = { tenantId: tenant?.id!, userId: (ctx as any).user?.id };

      try {
        const result = await offerLetterService.acceptOfferLetter(tenantContext, params.id);

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, offerLetterErrorStatusMap);
          return { error: result.error };
        }

        if (audit) {
          await audit.log({
            action: "recruitment.offer_letter.accepted",
            resourceType: "offer_letter",
            resourceId: result.data!.id,
            newValues: { status: "accepted", respondedAt: result.data!.respondedAt },
          });
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      response: {
        200: OfferLetterResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Offer Letters"],
        summary: "Accept offer letter",
        description: "Record that the candidate has accepted the offer. Only valid for offers in 'sent' status that have not expired.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ---------------------------------------------------------------------------
  // POST /recruitment/offers/:id/decline - Decline offer letter
  // ---------------------------------------------------------------------------
  .post(
    "/:id/decline",
    async (ctx) => {
      const { offerLetterService, params, body, tenant, audit, set } = ctx as typeof ctx & OfferLetterPluginContext;
      const tenantContext = { tenantId: tenant?.id!, userId: (ctx as any).user?.id };

      try {
        const result = await offerLetterService.declineOfferLetter(
          tenantContext,
          params.id,
          (body as any)?.reason
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, offerLetterErrorStatusMap);
          return { error: result.error };
        }

        if (audit) {
          await audit.log({
            action: "recruitment.offer_letter.declined",
            resourceType: "offer_letter",
            resourceId: result.data!.id,
            newValues: { status: "declined", reason: (body as any)?.reason, respondedAt: result.data!.respondedAt },
          });
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      body: DeclineOfferLetterSchema,
      response: {
        200: OfferLetterResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Offer Letters"],
        summary: "Decline offer letter",
        description: "Record that the candidate has declined the offer. An optional reason can be provided.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type OfferLetterRoutes = typeof offerLetterRoutes;
