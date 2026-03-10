/**
 * Documents Module - Elysia Routes
 *
 * Defines the API endpoints for document management.
 * All routes require authentication and appropriate permissions.
 */

import { Elysia, t } from "elysia";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { ErrorCodes } from "../../plugins/errors";
import { DocumentsRepository, type TenantContext } from "./repository";
import { DocumentsService } from "./service";
import {
  CreateDocumentSchema,
  UpdateDocumentSchema,
  DocumentFiltersSchema,
  DocumentResponseSchema,
  DocumentVersionResponseSchema,
  UploadUrlResponseSchema,
  PaginationQuerySchema,
} from "./schemas";

/**
 * Success response schema
 */
const SuccessSchema = t.Object({
  success: t.Literal(true),
  message: t.String(),
});

/**
 * UUID schema
 */
const UuidSchema = t.String({ format: "uuid" });

/**
 * ID params schema
 */
const IdParamsSchema = t.Object({
  id: UuidSchema,
});

/**
 * Module-specific error code overrides (merged into shared mapErrorToStatus)
 */
const DOCUMENTS_ERROR_CODES: Record<string, number> = {
  DUPLICATE: 409,
  INVALID_FILE: 400,
  FILE_TOO_LARGE: 413,
  INVALID_MIME_TYPE: 415,
};

/**
 * Create Documents routes plugin
 */
export const documentsRoutes = new Elysia({ prefix: "/documents", name: "documents-routes" })
  // Plugin Setup
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new DocumentsRepository(db);
    const service = new DocumentsService(repository, db);

    return { documentsService: service, documentsRepository: repository };
  })

  // ===========================================================================
  // Document Routes
  // ===========================================================================

  // GET /documents - List documents
  .get(
    "/",
    async (ctx) => {
      const { documentsService, query, tenantContext } = ctx as any;
      const { cursor, limit, ...filters } = query;
      const parsedLimit = limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await documentsService.listDocuments(
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
      beforeHandle: [requirePermission("documents", "read")],
      query: t.Composite([t.Partial(DocumentFiltersSchema), t.Partial(PaginationQuerySchema)]),
      response: t.Object({
        items: t.Array(DocumentResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Documents"],
        summary: "List documents",
        description: "List documents with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /documents/expiring - Get expiring documents
  .get(
    "/expiring",
    async (ctx) => {
      const { documentsService, query, tenantContext, error } = ctx as any;
      const result = await documentsService.getExpiringDocuments(
        tenantContext,
        query.days_ahead || 30
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", DOCUMENTS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("documents", "read")],
      query: t.Object({
        days_ahead: t.Optional(t.Number({ minimum: 1, maximum: 365 })),
      }),
      response: {
        200: t.Object({ items: t.Array(DocumentResponseSchema) }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Documents"],
        summary: "Get expiring documents",
        description: "Get documents expiring within specified days",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /documents/upload-url - Get upload URL
  .get(
    "/upload-url",
    async (ctx) => {
      const { documentsService, query, tenantContext, error } = ctx as any;
      const result = await documentsService.getUploadUrl(
        tenantContext,
        query.file_name,
        query.mime_type
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", DOCUMENTS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("documents", "write")],
      query: t.Object({
        file_name: t.String({
          minLength: 1,
          maxLength: 255,
          pattern: "^[a-zA-Z0-9][a-zA-Z0-9._\\-\\s]*$"
        }),
        mime_type: t.String({
          minLength: 1,
          maxLength: 127,
          pattern: "^[a-z]+\\/[a-zA-Z0-9.+\\-]+$"
        }),
      }),
      response: {
        200: UploadUrlResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Documents"],
        summary: "Get upload URL",
        description: "Get a presigned URL for uploading a document",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Template Routes
  // ===========================================================================

  // GET /documents/templates - List document templates
  .get(
    "/templates",
    async (ctx) => {
      const { db, query, tenantContext, set } = ctx as any;
      try {
        const rows = await db.withTransaction(tenantContext, async (tx: any) => {
          return tx<any[]>`
            SELECT id, name, document_type, description, is_active, is_default,
                   created_at, updated_at
            FROM app.document_templates
            WHERE tenant_id = ${tenantContext.tenantId}::uuid
            ${query.category ? tx`AND document_type = ${query.category}` : tx``}
            ${query.search ? tx`AND name ILIKE ${"%" + query.search + "%"}` : tx``}
            ORDER BY name ASC
            LIMIT ${Number(query.limit) || 50}
          `;
        });

        return {
          items: rows.map((r: any) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            category: r.documentType,
            format: "pdf",
            is_active: r.isActive,
            version: 1,
            created_at: r.createdAt?.toISOString?.() || r.createdAt,
            updated_at: r.updatedAt?.toISOString?.() || r.updatedAt,
          })),
          nextCursor: null,
          hasMore: false,
        };
      } catch (error: any) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error.message } };
      }
    },
    {
      beforeHandle: [requirePermission("documents", "read")],
      query: t.Object({
        search: t.Optional(t.String()),
        category: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Documents"],
        summary: "List document templates",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /documents/templates - Create document template
  .post(
    "/templates",
    async (ctx) => {
      const { db, body, tenantContext, set } = ctx as any;
      try {
        const id = crypto.randomUUID();
        const [row] = await db.withTransaction(tenantContext, async (tx: any) => {
          return tx<any[]>`
            INSERT INTO app.document_templates (
              id, tenant_id, name, document_type, description, template_content, is_active
            ) VALUES (
              ${id}::uuid, ${tenantContext.tenantId}::uuid, ${body.name},
              ${body.category || 'custom'}, ${body.description || null},
              '', true
            )
            RETURNING *
          `;
        });

        set.status = 201;
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          category: row.documentType,
          format: body.format || "pdf",
          is_active: row.isActive,
          version: 1,
          created_at: row.createdAt?.toISOString?.() || row.createdAt,
          updated_at: row.updatedAt?.toISOString?.() || row.updatedAt,
        };
      } catch (error: any) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: error.message } };
      }
    },
    {
      beforeHandle: [requirePermission("documents", "write")],
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 255 }),
        description: t.Optional(t.String({ maxLength: 2000 })),
        category: t.Optional(t.String()),
        format: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Documents"],
        summary: "Create document template",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /documents/:id - Get document by ID
  .get(
    "/:id",
    async (ctx) => {
      const { documentsService, params, tenantContext, error } = ctx as any;
      const result = await documentsService.getDocument(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", DOCUMENTS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("documents", "read")],
      params: IdParamsSchema,
      response: {
        200: DocumentResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Documents"],
        summary: "Get document by ID",
        description: "Get a single document by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /documents/:id/download-url - Get download URL
  .get(
    "/:id/download-url",
    async (ctx) => {
      const { documentsService, params, tenantContext, error } = ctx as any;
      const result = await documentsService.getDownloadUrl(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", DOCUMENTS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return { download_url: result.data };
    },
    {
      beforeHandle: [requirePermission("documents", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({ download_url: t.String() }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Documents"],
        summary: "Get download URL",
        description: "Get a presigned URL for downloading a document",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /documents - Create document
  .post(
    "/",
    async (ctx) => {
      const { documentsService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as any;

      // file_key is required - should come from upload completion
      if (!body.file_key) {
        return error(400, {
          error: {
            code: "MISSING_FILE_KEY",
            message: "file_key is required after file upload",
          },
        });
      }

      const result = await documentsService.createDocument(
        tenantContext,
        body,
        body.file_key
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", DOCUMENTS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "DOCUMENT_CREATED",
          resourceType: "document",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("documents", "write")],
      body: t.Composite([CreateDocumentSchema, t.Object({ file_key: t.String() })]),
      response: {
        201: DocumentResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Documents"],
        summary: "Create document",
        description: "Create a new document record after file upload",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /documents/:id - Update document
  .put(
    "/:id",
    async (ctx) => {
      const { documentsService, params, body, tenantContext, audit, requestId, error } =
        ctx as any;

      const oldResult = await documentsService.getDocument(tenantContext, params.id);

      const result = await documentsService.updateDocument(
        tenantContext,
        params.id,
        body
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", DOCUMENTS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "DOCUMENT_UPDATED",
          resourceType: "document",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("documents", "write")],
      params: IdParamsSchema,
      body: UpdateDocumentSchema,
      response: {
        200: DocumentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Documents"],
        summary: "Update document",
        description: "Update document metadata",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /documents/:id - Delete document
  .delete(
    "/:id",
    async (ctx) => {
      const { documentsService, params, tenantContext, audit, requestId, error } =
        ctx as any;

      const oldResult = await documentsService.getDocument(tenantContext, params.id);

      const result = await documentsService.deleteDocument(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", DOCUMENTS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "DOCUMENT_DELETED",
          resourceType: "document",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: { requestId },
        });
      }

      return { success: true as const, message: "Document archived successfully" };
    },
    {
      beforeHandle: [requirePermission("documents", "write")],
      params: IdParamsSchema,
      response: {
        200: SuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Documents"],
        summary: "Delete document",
        description: "Archive (soft delete) a document",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Version Routes
  // ===========================================================================

  // GET /documents/:id/versions - List versions
  .get(
    "/:id/versions",
    async (ctx) => {
      const { documentsService, params, tenantContext, error } = ctx as any;
      const result = await documentsService.listVersions(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", DOCUMENTS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("documents", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({ items: t.Array(DocumentVersionResponseSchema) }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Documents"],
        summary: "List document versions",
        description: "List all versions of a document",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /documents/:id/versions - Create new version
  .post(
    "/:id/versions",
    async (ctx) => {
      const { documentsService, params, body, tenantContext, audit, requestId, error, set } =
        ctx as any;

      const result = await documentsService.createVersion(
        tenantContext,
        params.id,
        body.file_key,
        body.file_size
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", DOCUMENTS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "DOCUMENT_VERSION_CREATED",
          resourceType: "document_version",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { requestId, documentId: params.id },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("documents", "write")],
      params: IdParamsSchema,
      body: t.Object({
        file_key: t.String(),
        file_size: t.Number({ minimum: 1 }),
      }),
      response: {
        201: DocumentVersionResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Documents"],
        summary: "Create document version",
        description: "Upload a new version of a document",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Self-Service Portal Routes (My Documents)
  // ===========================================================================

  // GET /my-summary - Get current user's document summary
  .get(
    "/my-summary",
    async (ctx) => {
      const { documentsService, user, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant.id, userId: user.id };

      const result = await documentsService.getMyDocumentsSummary(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", DOCUMENTS_ERROR_CODES);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      response: {
        200: t.Object({
          totalDocuments: t.Number(),
          byCategory: t.Array(t.Object({
            category: t.String(),
            count: t.Number(),
          })),
          recentDocuments: t.Array(t.Object({
            id: t.String(),
            name: t.String(),
            category: t.String(),
            mimeType: t.Union([t.String(), t.Null()]),
            fileSize: t.Union([t.Number(), t.Null()]),
            createdAt: t.String(),
          })),
          expiringDocuments: t.Array(t.Object({
            id: t.String(),
            name: t.String(),
            category: t.String(),
            expiresAt: t.String(),
          })),
          message: t.Optional(t.String()),
        }),
        401: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Documents - Self Service"],
        summary: "Get my document summary",
        description: "Get summary of current user's documents including counts, recent, and expiring",
      },
    }
  );

export type DocumentsRoutes = typeof documentsRoutes;
