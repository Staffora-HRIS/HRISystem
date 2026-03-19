/**
 * API Keys Module - Elysia Routes
 *
 * API key management for machine-to-machine authentication.
 * All routes require authentication and the api-keys:manage permission.
 *
 * Permission model:
 * - api-keys: read, write, delete
 *
 * Endpoints:
 * - GET    /api-keys           -- List API keys (prefix only, never full key)
 * - POST   /api-keys           -- Generate new API key (returns full key once)
 * - GET    /api-keys/:id       -- Get API key details (prefix only)
 * - PATCH  /api-keys/:id       -- Update name/scopes/expiry
 * - DELETE /api-keys/:id       -- Revoke API key
 * - POST   /api-keys/:id/rotate -- Rotate API key (revoke old, create new)
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { ApiKeyRepository } from "./repository";
import { ApiKeyService } from "./service";
import {
  ApiKeyResponseSchema,
  ApiKeyCreatedResponseSchema,
  ApiKeyFiltersSchema,
  CreateApiKeySchema,
  UpdateApiKeySchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateApiKey,
  type UpdateApiKey,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface ApiKeyPluginContext {
  apiKeyService: ApiKeyService;
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

/**
 * API Keys routes plugin
 */
export const apiKeyRoutes = new Elysia({ prefix: "/api-keys", name: "api-keys-routes" })

  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new ApiKeyRepository(db);
    const service = new ApiKeyService(repository, db);
    return { apiKeyService: service };
  })

  // GET /api-keys
  .get("/", async (ctx) => {
    const { apiKeyService, query, tenantContext } = ctx as typeof ctx & ApiKeyPluginContext;
    const { cursor, limit, ...filters } = query;
    const parsedLimit = limit !== undefined && limit !== null ? Number(limit) : undefined;
    const result = await apiKeyService.listApiKeys(tenantContext, filters, { cursor, limit: parsedLimit });
    return { items: result.items, nextCursor: result.nextCursor, hasMore: result.hasMore };
  }, {
    beforeHandle: [requirePermission("api-keys", "read")],
    query: t.Composite([t.Partial(ApiKeyFiltersSchema), t.Partial(PaginationQuerySchema)]),
    response: t.Object({ items: t.Array(ApiKeyResponseSchema), nextCursor: t.Union([t.String(), t.Null()]), hasMore: t.Boolean() }),
    detail: { tags: ["API Keys"], summary: "List API keys", description: "List API keys for the current tenant. Shows key prefix only, never the full key.", security: [{ bearerAuth: [] }] },
  })

  // POST /api-keys
  .post("/", async (ctx) => {
    const { apiKeyService, body, tenantContext, audit, requestId, set, error } = ctx as typeof ctx & ApiKeyPluginContext;
    const result = await apiKeyService.createApiKey(tenantContext, body as CreateApiKey);
    if (!result.success) { return error(mapErrorToStatus(result.error?.code || "INTERNAL_ERROR"), { error: result.error }); }
    if (audit) {
      await audit.log({ action: "api-key.created", resourceType: "api_key", resourceId: result.data!.id, newValues: { id: result.data!.id, name: result.data!.name, scopes: result.data!.scopes, expires_at: result.data!.expires_at }, metadata: { requestId } });
    }
    set.status = 201;
    return result.data;
  }, {
    beforeHandle: [requirePermission("api-keys", "write")],
    body: CreateApiKeySchema, headers: OptionalIdempotencyHeaderSchema,
    response: { 201: ApiKeyCreatedResponseSchema, 400: ErrorResponseSchema, 401: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["API Keys"], summary: "Generate new API key", description: "Generate a new API key. The full key is returned ONLY in this response. Store it securely - it cannot be retrieved again.", security: [{ bearerAuth: [] }] },
  })

  // GET /api-keys/:id
  .get("/:id", async (ctx) => {
    const { apiKeyService, params, tenantContext, error } = ctx as typeof ctx & ApiKeyPluginContext;
    const result = await apiKeyService.getApiKey(tenantContext, params.id);
    if (!result.success) { return error(mapErrorToStatus(result.error?.code || "INTERNAL_ERROR"), { error: result.error }); }
    return result.data;
  }, {
    beforeHandle: [requirePermission("api-keys", "read")],
    params: IdParamsSchema,
    response: { 200: ApiKeyResponseSchema, 404: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["API Keys"], summary: "Get API key by ID", description: "Get API key details. Shows key prefix only, never the full key.", security: [{ bearerAuth: [] }] },
  })

  // PATCH /api-keys/:id
  .patch("/:id", async (ctx) => {
    const { apiKeyService, params, body, tenantContext, audit, requestId, error } = ctx as typeof ctx & ApiKeyPluginContext;
    const result = await apiKeyService.updateApiKey(tenantContext, params.id, body as UpdateApiKey);
    if (!result.success) { return error(mapErrorToStatus(result.error?.code || "INTERNAL_ERROR"), { error: result.error }); }
    if (audit) { await audit.log({ action: "api-key.updated", resourceType: "api_key", resourceId: params.id, newValues: body as Record<string, unknown>, metadata: { requestId } }); }
    return result.data;
  }, {
    beforeHandle: [requirePermission("api-keys", "write")],
    params: IdParamsSchema, body: UpdateApiKeySchema, headers: OptionalIdempotencyHeaderSchema,
    response: { 200: ApiKeyResponseSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["API Keys"], summary: "Update API key", description: "Update an API key's name, scopes, or expiry. Cannot update a revoked key.", security: [{ bearerAuth: [] }] },
  })

  // DELETE /api-keys/:id
  .delete("/:id", async (ctx) => {
    const { apiKeyService, params, tenantContext, audit, requestId, error } = ctx as typeof ctx & ApiKeyPluginContext;
    const result = await apiKeyService.revokeApiKey(tenantContext, params.id);
    if (!result.success) { return error(mapErrorToStatus(result.error?.code || "INTERNAL_ERROR"), { error: result.error }); }
    if (audit) { await audit.log({ action: "api-key.revoked", resourceType: "api_key", resourceId: params.id, metadata: { requestId } }); }
    return { success: true as const, message: "API key revoked" };
  }, {
    beforeHandle: [requirePermission("api-keys", "delete")],
    params: IdParamsSchema,
    response: { 200: DeleteSuccessSchema, 404: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["API Keys"], summary: "Revoke API key", description: "Revoke an API key. The key can no longer be used for authentication.", security: [{ bearerAuth: [] }] },
  })

  // POST /api-keys/:id/rotate
  .post("/:id/rotate", async (ctx) => {
    const { apiKeyService, params, tenantContext, audit, requestId, set, error } = ctx as typeof ctx & ApiKeyPluginContext;
    const result = await apiKeyService.rotateApiKey(tenantContext, params.id);
    if (!result.success) { return error(mapErrorToStatus(result.error?.code || "INTERNAL_ERROR"), { error: result.error }); }
    if (audit) {
      await audit.log({ action: "api-key.rotated", resourceType: "api_key", resourceId: result.data!.id, newValues: { id: result.data!.id, name: result.data!.name, scopes: result.data!.scopes, previousKeyId: params.id }, metadata: { requestId, previousKeyId: params.id } });
    }
    set.status = 201;
    return result.data;
  }, {
    beforeHandle: [requirePermission("api-keys", "write")],
    params: IdParamsSchema, headers: OptionalIdempotencyHeaderSchema,
    response: { 201: ApiKeyCreatedResponseSchema, 404: ErrorResponseSchema, 409: ErrorResponseSchema, 500: ErrorResponseSchema },
    detail: { tags: ["API Keys"], summary: "Rotate API key", description: "Rotate an API key by revoking the existing key and generating a new one with the same name, scopes, and expiry. The new full key is returned ONLY in this response. This is an atomic operation.", security: [{ bearerAuth: [] }] },
  });

export type ApiKeyRoutes = typeof apiKeyRoutes;
