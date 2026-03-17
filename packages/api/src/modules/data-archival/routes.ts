/**
 * Data Archival Module - Elysia Routes
 *
 * Endpoints for archiving old completed records and restoring from archive.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - data_archival: read, write, delete
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { DataArchivalRepository } from "./repository";
import { DataArchivalService } from "./service";
import {
  ArchivedRecordResponseSchema,
  ArchivedRecordListResponseSchema,
  ArchivedRecordsQuerySchema,
  ArchiveRecordSchema,
  RestoreRecordSchema,
  RunArchivalSchema,
  RestoreResultSchema,
  ArchivalRunResultSchema,
  ArchivalDashboardResponseSchema,
  ArchivalRuleListResponseSchema,
  SeedDefaultsResponseSchema,
  IdParamsSchema,
  PaginationQuerySchema,
  OptionalIdempotencyHeaderSchema,
  type ArchiveRecordRequest,
  type RestoreRecordRequest,
  type RunArchivalRequest,
  type ArchivedRecordsQuery,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface DataArchivalPluginContext {
  archivalService: DataArchivalService;
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

// Module-specific error code to HTTP status mapping
const archivalErrorStatusMap: Record<string, number> = {
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
};

/**
 * Data Archival routes plugin
 */
export const dataArchivalRoutes = new Elysia({
  prefix: "/data-archival",
  name: "data-archival-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new DataArchivalRepository(db);
    const service = new DataArchivalService(repository, db);

    return { archivalService: service };
  })

  // ===========================================================================
  // GET /records - List archived records
  // ===========================================================================
  .get(
    "/records",
    async (ctx) => {
      const { archivalService, query, tenantContext } =
        ctx as typeof ctx & DataArchivalPluginContext;

      const typedQuery = query as unknown as ArchivedRecordsQuery;
      const { cursor, limit, source_table, source_category, status } =
        typedQuery;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await archivalService.listArchivedRecords(
        tenantContext,
        {
          sourceTable: source_table,
          sourceCategory: source_category,
          status,
        },
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("data_archival", "read")],
      query: t.Partial(ArchivedRecordsQuerySchema),
      response: {
        200: ArchivedRecordListResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "List archived records",
        description:
          "List all archived records with optional filters for source_table, " +
          "source_category, and status. Supports cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /records/:id - Get archived record
  // ===========================================================================
  .get(
    "/records/:id",
    async (ctx) => {
      const { archivalService, params, tenantContext, error } =
        ctx as typeof ctx & DataArchivalPluginContext;

      const result = await archivalService.getArchivedRecord(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          archivalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_archival", "read")],
      params: IdParamsSchema,
      response: {
        200: ArchivedRecordResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "Get archived record",
        description: "Get a single archived record by ID, including the full archived data payload",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /records - Manually archive a record
  // ===========================================================================
  .post(
    "/records",
    async (ctx) => {
      const {
        archivalService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & DataArchivalPluginContext;

      const typedBody = body as ArchiveRecordRequest;
      const result = await archivalService.archiveRecord(tenantContext, {
        sourceTable: typedBody.source_table,
        sourceId: typedBody.source_id,
        sourceCategory: typedBody.source_category,
        retentionUntil: typedBody.retention_until,
      });

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          archivalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "data_archival.record_archived",
          resourceType: "archived_record",
          resourceId: result.data!.id,
          newValues: {
            sourceTable: typedBody.source_table,
            sourceId: typedBody.source_id,
            sourceCategory: typedBody.source_category,
          },
          metadata: {
            idempotencyKey: headers["idempotency-key"],
            requestId,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_archival", "write")],
      body: ArchiveRecordSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: ArchivedRecordResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "Manually archive a record",
        description:
          "Archive a specific record by providing its source_table, source_id, and source_category. " +
          "The record data is captured as JSONB and the source record is deleted.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /records/:id/restore - Restore from archive
  // ===========================================================================
  .post(
    "/records/:id/restore",
    async (ctx) => {
      const {
        archivalService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & DataArchivalPluginContext;

      const typedBody = body as RestoreRecordRequest;
      const result = await archivalService.restoreRecord(
        tenantContext,
        params.id,
        typedBody.reason
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          archivalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "data_archival.record_restored",
          resourceType: "archived_record",
          resourceId: params.id,
          newValues: {
            reason: typedBody.reason,
            sourceTable: result.data!.archivedRecord.sourceTable,
            sourceId: result.data!.archivedRecord.sourceId,
          },
          metadata: {
            idempotencyKey: headers["idempotency-key"],
            requestId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_archival", "write")],
      params: IdParamsSchema,
      body: RestoreRecordSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: RestoreResultSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "Restore record from archive",
        description:
          "Restore a previously archived record back to its source table. " +
          "Requires a reason for the restoration which is logged for audit trail.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /run - Trigger automated archival run
  // ===========================================================================
  .post(
    "/run",
    async (ctx) => {
      const {
        archivalService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & DataArchivalPluginContext;

      const typedBody = body as RunArchivalRequest;
      const result = await archivalService.runArchival(tenantContext, {
        sourceCategory: typedBody.source_category,
        dryRun: typedBody.dry_run,
      });

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          archivalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "data_archival.run_executed",
          resourceType: "archival_run",
          resourceId: tenantContext.tenantId,
          newValues: {
            category: typedBody.source_category || "all",
            dryRun: typedBody.dry_run || false,
            recordsArchived: result.data!.recordsArchived,
            recordsSkipped: result.data!.recordsSkipped,
          },
          metadata: {
            idempotencyKey: headers["idempotency-key"],
            requestId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_archival", "write")],
      body: RunArchivalSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ArchivalRunResultSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "Run automated archival",
        description:
          "Trigger an automated archival run based on configured rules. " +
          "Optionally filter by source_category. Set dry_run=true to preview " +
          "what would be archived without actually archiving.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /dashboard - Archival dashboard
  // ===========================================================================
  .get(
    "/dashboard",
    async (ctx) => {
      const { archivalService, tenantContext, error } =
        ctx as typeof ctx & DataArchivalPluginContext;

      const result = await archivalService.getDashboard(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          archivalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_archival", "read")],
      response: {
        200: ArchivalDashboardResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "Archival dashboard",
        description:
          "Get an overview of archived records, category breakdown, " +
          "and recent archival activity.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /rules - List archival rules
  // ===========================================================================
  .get(
    "/rules",
    async (ctx) => {
      const { archivalService, query, tenantContext } =
        ctx as typeof ctx & DataArchivalPluginContext;
      const { cursor, limit } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await archivalService.listRules(tenantContext, {
        cursor,
        limit: parsedLimit,
      });

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("data_archival", "read")],
      query: t.Partial(PaginationQuerySchema),
      response: {
        200: ArchivalRuleListResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "List archival rules",
        description:
          "List all configured archival rules with cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /rules/seed-defaults - Seed UK default archival rules
  // ===========================================================================
  .post(
    "/rules/seed-defaults",
    async (ctx) => {
      const {
        archivalService,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & DataArchivalPluginContext;

      const result =
        await archivalService.seedDefaultRules(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          archivalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "data_archival.defaults_seeded",
          resourceType: "archival_rule",
          resourceId: tenantContext.tenantId,
          newValues: {
            created: result.data!.created,
            skipped: result.data!.skipped,
          },
          metadata: {
            idempotencyKey: headers["idempotency-key"],
            requestId,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_archival", "write")],
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: SeedDefaultsResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "Seed UK default archival rules",
        description:
          "Create UK-compliant default archival rules for all data categories. " +
          "Includes terminated employees (7 years), closed cases (5 years), " +
          "old leave/time records (3 years), and more. " +
          "Skips categories that already have an enabled rule.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type DataArchivalRoutes = typeof dataArchivalRoutes;
