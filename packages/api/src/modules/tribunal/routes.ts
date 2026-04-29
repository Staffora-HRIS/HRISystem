/**
 * Tribunal Module - Elysia Routes
 *
 * Defines the API endpoints for Employment Tribunal Preparation.
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 *   GET    /tribunal                          - List tribunal cases
 *   GET    /tribunal/:id                      - Get tribunal case by ID
 *   POST   /tribunal                          - Create a new tribunal case
 *   PATCH  /tribunal/:id                      - Update a tribunal case
 *   DELETE /tribunal/:id                      - Delete a tribunal case (preparation only)
 *   POST   /tribunal/:id/documents            - Add document to bundle
 *   PATCH  /tribunal/:id/documents/:documentId - Update document in bundle
 *   DELETE /tribunal/:id/documents/:documentId - Remove document from bundle
 *
 * Permission model:
 *   - tribunal: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { TribunalRepository } from "./repository";
import { TribunalService } from "./service";
import {
  CreateTribunalCaseSchema,
  UpdateTribunalCaseSchema,
  AddTribunalDocumentSchema,
  UpdateTribunalDocumentSchema,
  TribunalCaseListResponseSchema,
  TribunalCaseFiltersSchema,
  IdParamsSchema,
  DocumentIdParamsSchema,
  PaginationQuerySchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type CreateTribunalCase,
  type UpdateTribunalCase,
  type AddTribunalDocument,
  type UpdateTribunalDocument,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 */
interface TribunalPluginContext {
  tribunalService: TribunalService;
  tribunalRepository: TribunalRepository;
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

// =============================================================================
// Error Code Mapping
// =============================================================================

const tribunalErrorStatusMap: Record<string, number> = {
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  DELETE_FAILED: 500,
  STATE_MACHINE_VIOLATION: 409,
};

// =============================================================================
// Routes
// =============================================================================

export const tribunalRoutes = new Elysia({ prefix: "/tribunal", name: "tribunal-routes" })

  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new TribunalRepository(db);
    const service = new TribunalService(repository, db);

    return { tribunalService: service, tribunalRepository: repository };
  })

  // ===========================================================================
  // List Tribunal Cases
  // ===========================================================================

  // GET /tribunal - List tribunal cases with filters and pagination
  .get(
    "/",
    async (ctx) => {
      const { tribunalService, query, tenantContext } = ctx as typeof ctx & TribunalPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await tribunalService.listTribunalCases(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items as any[],
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("tribunal", "read")],
      query: t.Composite([
        t.Partial(TribunalCaseFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: TribunalCaseListResponseSchema,
      detail: {
        tags: ["Tribunal"],
        summary: "List tribunal cases",
        description:
          "List employment tribunal cases with optional filters (status, claim_type, employee_id, search) and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Get Tribunal Case by ID
  // ===========================================================================

  // GET /tribunal/:id - Get tribunal case by ID
  .get(
    "/:id",
    async (ctx) => {
      const { tribunalService, params, tenantContext, error } = ctx as typeof ctx & TribunalPluginContext;

      const result = await tribunalService.getTribunalCase(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tribunalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("tribunal", "read")],
      params: IdParamsSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Tribunal"],
        summary: "Get tribunal case by ID",
        description: "Get a single tribunal case with full details including documents and employee name",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Create Tribunal Case
  // ===========================================================================

  // POST /tribunal - Create a new tribunal case
  .post(
    "/",
    async (ctx) => {
      const { tribunalService, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & TribunalPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await tribunalService.createTribunalCase(
        tenantContext,
        body as unknown as CreateTribunalCase,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tribunalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log (sensitive legal operation)
      if (audit) {
        await audit.log({
          action: "TRIBUNAL_CASE_CREATED",
          resourceType: "tribunal_case",
          resourceId: result.data!.id as string,
          newValues: {
            employee_id: result.data!.employee_id,
            claim_type: result.data!.claim_type,
            status: result.data!.status,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      ctx.set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("tribunal", "write")],
      body: CreateTribunalCaseSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Tribunal"],
        summary: "Create a new tribunal case",
        description:
          "Create a new employment tribunal case for preparation. " +
          "Links to an employee and optionally to an existing HR case.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Update Tribunal Case
  // ===========================================================================

  // PATCH /tribunal/:id - Update a tribunal case
  .patch(
    "/:id",
    async (ctx) => {
      const { tribunalService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & TribunalPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as UpdateTribunalCase;
      const result = await tribunalService.updateTribunalCase(
        tenantContext,
        params.id,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tribunalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "TRIBUNAL_CASE_UPDATED",
          resourceType: "tribunal_case",
          resourceId: params.id,
          newValues: typedBody,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("tribunal", "write")],
      params: IdParamsSchema,
      body: UpdateTribunalCaseSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Tribunal"],
        summary: "Update a tribunal case",
        description:
          "Update tribunal case details including status transitions. " +
          "Valid transitions: preparation->submitted->hearing->decided. " +
          "Cases can also go directly from preparation to decided (settlement/withdrawal).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Delete Tribunal Case
  // ===========================================================================

  // DELETE /tribunal/:id - Delete a tribunal case (preparation status only)
  .delete(
    "/:id",
    async (ctx) => {
      const { tribunalService, params, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & TribunalPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await tribunalService.deleteTribunalCase(
        tenantContext,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tribunalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "TRIBUNAL_CASE_DELETED",
          resourceType: "tribunal_case",
          resourceId: params.id,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("tribunal", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Tribunal"],
        summary: "Delete a tribunal case",
        description:
          "Delete a tribunal case. Only cases in 'preparation' status can be deleted.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Document Bundle Management
  // ===========================================================================

  // POST /tribunal/:id/documents - Add a document to the bundle
  .post(
    "/:id/documents",
    async (ctx) => {
      const { tribunalService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & TribunalPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as AddTribunalDocument;
      const result = await tribunalService.addDocument(
        tenantContext,
        params.id,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tribunalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "TRIBUNAL_DOCUMENT_ADDED",
          resourceType: "tribunal_case",
          resourceId: params.id,
          newValues: { document_name: typedBody.name, document_type: typedBody.type },
          metadata: { idempotencyKey, requestId },
        });
      }

      ctx.set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("tribunal", "write")],
      params: IdParamsSchema,
      body: AddTribunalDocumentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Tribunal"],
        summary: "Add document to tribunal case",
        description:
          "Add a document reference to the tribunal case's document bundle. " +
          "Documents are tracked with name, type, optional URL, and provenance.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /tribunal/:id/documents/:documentId - Update a document in the bundle
  .patch(
    "/:id/documents/:documentId",
    async (ctx) => {
      const { tribunalService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & TribunalPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as UpdateTribunalDocument;
      const result = await tribunalService.updateDocument(
        tenantContext,
        params.id,
        params.documentId,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tribunalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "TRIBUNAL_DOCUMENT_UPDATED",
          resourceType: "tribunal_case",
          resourceId: params.id,
          newValues: { documentId: params.documentId, changes: typedBody },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("tribunal", "write")],
      params: DocumentIdParamsSchema,
      body: UpdateTribunalDocumentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Tribunal"],
        summary: "Update document in tribunal case",
        description: "Update a specific document's metadata in the tribunal case bundle",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /tribunal/:id/documents/:documentId - Remove a document from the bundle
  .delete(
    "/:id/documents/:documentId",
    async (ctx) => {
      const { tribunalService, params, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & TribunalPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await tribunalService.removeDocument(
        tenantContext,
        params.id,
        params.documentId,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tribunalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "TRIBUNAL_DOCUMENT_REMOVED",
          resourceType: "tribunal_case",
          resourceId: params.id,
          newValues: { documentId: params.documentId },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("tribunal", "write")],
      params: DocumentIdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Tribunal"],
        summary: "Remove document from tribunal case",
        description: "Remove a specific document from the tribunal case's document bundle",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type TribunalRoutes = typeof tribunalRoutes;
