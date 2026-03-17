/**
 * Bulk Document Generation Module - Elysia Routes
 *
 * Defines the API endpoints for bulk document generation:
 * - POST /documents/bulk-generate     Create a bulk generation batch
 * - GET  /documents/bulk-generate/:batchId  Get batch status with item details
 *
 * All routes require authentication and generated_letters:write permission.
 *
 * Permission model:
 * - generated_letters: write (to create bulk generations)
 * - generated_letters: read  (to check batch status)
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { BulkDocumentGenerationRepository } from "./repository";
import { BulkDocumentGenerationService } from "./service";
import {
  BulkGenerateRequestSchema,
  BulkGenerateResponseSchema,
  BatchIdParamsSchema,
  BatchStatusResponseSchema,
  OptionalIdempotencyHeaderSchema,
  type BulkGenerateRequest,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface BulkDocGenPluginContext {
  bulkDocGenService: BulkDocumentGenerationService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
  error: (status: number, body: unknown) => never;
}

/**
 * Module-specific error codes
 */
const bulkDocGenErrorStatusMap: Record<string, number> = {
  TEMPLATE_INACTIVE: 400,
  BATCH_SIZE_EXCEEDED: 400,
};

// =============================================================================
// Routes
// =============================================================================

export const bulkDocumentGenerationRoutes = new Elysia({
  prefix: "/documents",
  name: "bulk-document-generation-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new BulkDocumentGenerationRepository(db);
    const service = new BulkDocumentGenerationService(repository, db);

    return { bulkDocGenService: service };
  })

  // ===========================================================================
  // POST /documents/bulk-generate - Create bulk generation batch
  // ===========================================================================
  .post(
    "/bulk-generate",
    async (ctx) => {
      const { bulkDocGenService, tenantContext, body, set, audit, headers } =
        ctx as typeof ctx & BulkDocGenPluginContext;

      try {
        const idempotencyKey = headers?.["idempotency-key"];
        const result = await bulkDocGenService.createBulkGeneration(
          tenantContext!,
          body as BulkGenerateRequest,
          idempotencyKey
        );

        if (!result.success) {
          set.status = mapErrorToStatus(
            result.error!.code,
            bulkDocGenErrorStatusMap
          );
          return { error: result.error };
        }

        // Audit log
        if (audit) {
          await audit.log({
            action: "documents.bulk_generation.created",
            resourceType: "document_generation_batch",
            resourceId: result.data!.batch_id,
            newValues: {
              batch_id: result.data!.batch_id,
              total_items: result.data!.total_items,
              template_id: (body as BulkGenerateRequest).templateId,
            },
          });
        }

        set.status = 202;
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message =
          error instanceof Error ? error.message : "Internal error";
        return {
          error: { code: "INTERNAL_ERROR", message },
        };
      }
    },
    {
      beforeHandle: [requirePermission("generated_letters", "write")],
      body: BulkGenerateRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        202: BulkGenerateResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Documents"],
        summary: "Bulk generate documents",
        description:
          "Queue document generation for multiple employees from a letter template. " +
          "Returns a batch ID for tracking progress. Each employee document is generated " +
          "asynchronously by background workers.",
      },
    }
  )

  // ===========================================================================
  // GET /documents/bulk-generate/:batchId - Get batch status
  // ===========================================================================
  .get(
    "/bulk-generate/:batchId",
    async (ctx) => {
      const { bulkDocGenService, tenantContext, params, set } =
        ctx as typeof ctx & BulkDocGenPluginContext;

      try {
        const result = await bulkDocGenService.getBatchStatus(
          tenantContext!,
          params.batchId
        );

        if (!result.success) {
          set.status = mapErrorToStatus(
            result.error!.code,
            bulkDocGenErrorStatusMap
          );
          return { error: result.error };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message =
          error instanceof Error ? error.message : "Internal error";
        return {
          error: { code: "INTERNAL_ERROR", message },
        };
      }
    },
    {
      beforeHandle: [requirePermission("generated_letters", "read")],
      params: BatchIdParamsSchema,
      response: {
        200: BatchStatusResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Documents"],
        summary: "Get bulk generation batch status",
        description:
          "Returns the status of a bulk document generation batch including " +
          "per-employee item statuses. Use this to poll for completion.",
      },
    }
  );

export type BulkDocumentGenerationRoutes = typeof bulkDocumentGenerationRoutes;
