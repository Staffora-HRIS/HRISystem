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
  // New schemas for TODO-225
  CreateArchivePolicySchema,
  UpdateArchivePolicySchema,
  ArchivePolicyResponseSchema,
  ArchivePolicyListResponseSchema,
  ArchiveLogListResponseSchema,
  ArchiveLogQuerySchema,
  RunPolicyArchivalSchema,
  PolicyArchivalRunResultSchema,
  RestoreFromArchiveSchema,
  PolicyRestoreResultSchema,
  DeleteSuccessResponseSchema,
  type ArchiveRecordRequest,
  type RestoreRecordRequest,
  type RunArchivalRequest,
  type ArchivedRecordsQuery,
  type CreateArchivePolicy,
  type UpdateArchivePolicy,
  type RunPolicyArchivalRequest,
  type RestoreFromArchiveRequest,
  type ArchiveLogQuery,
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
  )

  // ===========================================================================
  // Archive Policies CRUD (TODO-225: /policies)
  // ===========================================================================

  // POST /policies - Create archive policy
  .post(
    "/policies",
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

      const typedBody = body as CreateArchivePolicy;
      const result = await archivalService.createArchivePolicy(tenantContext, {
        sourceTable: typedBody.source_table,
        archiveAfterDays: typedBody.archive_after_days,
        statusFilter: typedBody.status_filter,
        enabled: typedBody.enabled,
        description: typedBody.description,
      });

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          archivalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "data_archival.policy_created",
          resourceType: "archive_policy",
          resourceId: result.data!.id,
          newValues: result.data,
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
      body: CreateArchivePolicySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: ArchivePolicyResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "Create archive policy",
        description:
          "Create a new archive policy for a source table. Only one policy per " +
          "source table per tenant is allowed.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /policies - List archive policies
  .get(
    "/policies",
    async (ctx) => {
      const { archivalService, query, tenantContext } =
        ctx as typeof ctx & DataArchivalPluginContext;
      const { cursor, limit } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await archivalService.listArchivePolicies(tenantContext, {
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
        200: ArchivePolicyListResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "List archive policies",
        description:
          "List all archive policies with cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /policies/:id - Get archive policy
  .get(
    "/policies/:id",
    async (ctx) => {
      const { archivalService, params, tenantContext, error } =
        ctx as typeof ctx & DataArchivalPluginContext;

      const result = await archivalService.getArchivePolicy(
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
        200: ArchivePolicyResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "Get archive policy",
        description: "Get a single archive policy by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /policies/:id - Update archive policy
  .patch(
    "/policies/:id",
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

      const typedBody = body as UpdateArchivePolicy;
      const result = await archivalService.updateArchivePolicy(
        tenantContext,
        params.id,
        {
          sourceTable: typedBody.source_table,
          archiveAfterDays: typedBody.archive_after_days,
          statusFilter: typedBody.status_filter,
          enabled: typedBody.enabled,
          description: typedBody.description,
        }
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          archivalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "data_archival.policy_updated",
          resourceType: "archive_policy",
          resourceId: params.id,
          newValues: result.data,
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
      body: UpdateArchivePolicySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ArchivePolicyResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "Update archive policy",
        description:
          "Update an archive policy. Can change source_table, archive_after_days, " +
          "status_filter, enabled, and description.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /policies/:id - Delete archive policy
  .delete(
    "/policies/:id",
    async (ctx) => {
      const {
        archivalService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & DataArchivalPluginContext;

      const result = await archivalService.deleteArchivePolicy(
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

      if (audit) {
        await audit.log({
          action: "data_archival.policy_deleted",
          resourceType: "archive_policy",
          resourceId: params.id,
          newValues: { deleted: true },
          metadata: {
            idempotencyKey: headers["idempotency-key"],
            requestId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_archival", "delete")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DeleteSuccessResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "Delete archive policy",
        description:
          "Delete an archive policy. This does not affect already-archived records.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Archive Log (TODO-225: /log)
  // ===========================================================================

  // GET /log - List archive log entries
  .get(
    "/log",
    async (ctx) => {
      const { archivalService, query, tenantContext } =
        ctx as typeof ctx & DataArchivalPluginContext;

      const typedQuery = query as unknown as ArchiveLogQuery;
      const { cursor, limit, policy_id, source_table } = typedQuery;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await archivalService.listArchiveLog(tenantContext, {
        cursor,
        limit: parsedLimit,
        policy_id,
        source_table,
      });

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("data_archival", "read")],
      query: t.Partial(ArchiveLogQuerySchema),
      response: {
        200: ArchiveLogListResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "List archive log",
        description:
          "List archive execution history with optional filters for policy_id " +
          "and source_table. Supports cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Policy-Based Archival Run (TODO-225: /archival/run)
  // ===========================================================================

  // POST /archival/run - Trigger policy-based archival
  .post(
    "/archival/run",
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

      const typedBody = body as RunPolicyArchivalRequest;
      const result = await archivalService.runPolicyArchival(tenantContext, {
        policyId: typedBody.policy_id,
        dryRun: typedBody.dry_run,
      });

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          archivalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "data_archival.policy_run_executed",
          resourceType: "archival_run",
          resourceId: tenantContext.tenantId,
          newValues: {
            policyId: typedBody.policy_id || "all",
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
      body: RunPolicyArchivalSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PolicyArchivalRunResultSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "Run policy-based archival",
        description:
          "Trigger a policy-based archival run that moves eligible records to " +
          "archive.{table_name} tables preserving their structure. " +
          "Optionally specify a policy_id to run a single policy. " +
          "Set dry_run=true to preview what would be archived.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Policy-Based Restore (TODO-225: /archival/:id/restore)
  // ===========================================================================

  // POST /archival/:id/restore - Restore archived records
  .post(
    "/archival/:id/restore",
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

      const typedBody = body as RestoreFromArchiveRequest;
      const result = await archivalService.restoreFromArchive(tenantContext, {
        sourceTable: typedBody.source_table,
        sourceId: typedBody.source_id,
        reason: typedBody.reason,
      });

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          archivalErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "data_archival.policy_restore_executed",
          resourceType: "archived_record",
          resourceId: typedBody.source_id,
          newValues: {
            sourceTable: typedBody.source_table,
            sourceId: typedBody.source_id,
            reason: typedBody.reason,
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
      body: RestoreFromArchiveSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PolicyRestoreResultSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Archival"],
        summary: "Restore from archive",
        description:
          "Restore a record from archive.{table_name} back to its source table. " +
          "Requires the source_table, source_id, and a reason for the restoration.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type DataArchivalRoutes = typeof dataArchivalRoutes;
