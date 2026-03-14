/**
 * Data Retention Module - Elysia Routes
 *
 * UK GDPR Article 5(1)(e) (Storage Limitation) API endpoints.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - data_retention: read, write, delete
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { DataRetentionRepository } from "./repository";
import { DataRetentionService } from "./service";
import {
  CreateRetentionPolicySchema,
  UpdateRetentionPolicySchema,
  CreateRetentionExceptionSchema,
  RetentionPolicyResponseSchema,
  RetentionPolicyListResponseSchema,
  RetentionReviewResponseSchema,
  RetentionReviewListResponseSchema,
  RetentionExceptionResponseSchema,
  RetentionDashboardResponseSchema,
  ExpiredRecordsResponseSchema,
  ReviewExecutionResponseSchema,
  SeedDefaultsResponseSchema,
  DeleteSuccessResponseSchema,
  IdParamsSchema,
  PolicyIdParamsSchema,
  PaginationQuerySchema,
  OptionalIdempotencyHeaderSchema,
  type CreateRetentionPolicy,
  type UpdateRetentionPolicy,
  type CreateRetentionException,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & DataRetentionPluginContext` to preserve Elysia's
 * native typing while adding plugin-derived properties.
 */
interface DataRetentionPluginContext {
  retentionService: DataRetentionService;
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
const retentionErrorStatusMap: Record<string, number> = {
  CONFLICT: 409,
  VALIDATION_ERROR: 400,
};

/**
 * Data Retention routes plugin
 */
export const dataRetentionRoutes = new Elysia({
  prefix: "/data-retention",
  name: "data-retention-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new DataRetentionRepository(db);
    const service = new DataRetentionService(repository, db);

    return { retentionService: service };
  })

  // ===========================================================================
  // POST /policies - Create retention policy
  // ===========================================================================
  .post(
    "/policies",
    async (ctx) => {
      const {
        retentionService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & DataRetentionPluginContext;

      const typedBody = body as CreateRetentionPolicy;
      const result = await retentionService.createPolicy(tenantContext, {
        name: typedBody.name,
        description: typedBody.description,
        dataCategory: typedBody.data_category,
        retentionPeriodMonths: typedBody.retention_period_months,
        legalBasis: typedBody.legal_basis,
        autoPurgeEnabled: typedBody.auto_purge_enabled,
        notificationBeforePurgeDays: typedBody.notification_before_purge_days,
      });

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          retentionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.retention.policy_created",
          resourceType: "retention_policy",
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
      beforeHandle: [requirePermission("data_retention", "write")],
      body: CreateRetentionPolicySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: RetentionPolicyResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Retention"],
        summary: "Create retention policy",
        description:
          "Create a new data retention policy for a specific data category. " +
          "Only one policy per data category per tenant is allowed.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /policies - List retention policies
  // ===========================================================================
  .get(
    "/policies",
    async (ctx) => {
      const { retentionService, query, tenantContext } =
        ctx as typeof ctx & DataRetentionPluginContext;
      const { cursor, limit } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await retentionService.listPolicies(tenantContext, {
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
      beforeHandle: [requirePermission("data_retention", "read")],
      query: t.Partial(PaginationQuerySchema),
      response: {
        200: RetentionPolicyListResponseSchema,
      },
      detail: {
        tags: ["Data Retention"],
        summary: "List retention policies",
        description:
          "List all data retention policies with cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /policies/:id - Get retention policy
  // ===========================================================================
  .get(
    "/policies/:id",
    async (ctx) => {
      const { retentionService, params, tenantContext, error } =
        ctx as typeof ctx & DataRetentionPluginContext;

      const result = await retentionService.getPolicy(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          retentionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_retention", "read")],
      params: IdParamsSchema,
      response: {
        200: RetentionPolicyResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Retention"],
        summary: "Get retention policy",
        description: "Get a single retention policy by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /policies/:id - Update retention policy
  // ===========================================================================
  .patch(
    "/policies/:id",
    async (ctx) => {
      const {
        retentionService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & DataRetentionPluginContext;

      const typedBody = body as UpdateRetentionPolicy;
      const result = await retentionService.updatePolicy(
        tenantContext,
        params.id,
        {
          name: typedBody.name,
          description: typedBody.description,
          retentionPeriodMonths: typedBody.retention_period_months,
          legalBasis: typedBody.legal_basis,
          autoPurgeEnabled: typedBody.auto_purge_enabled,
          notificationBeforePurgeDays:
            typedBody.notification_before_purge_days,
          status: typedBody.status,
        }
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          retentionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.retention.policy_updated",
          resourceType: "retention_policy",
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
      beforeHandle: [requirePermission("data_retention", "write")],
      params: IdParamsSchema,
      body: UpdateRetentionPolicySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: RetentionPolicyResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Retention"],
        summary: "Update retention policy",
        description:
          "Update a retention policy. Can change name, description, retention period, " +
          "legal basis, auto-purge setting, and status.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /policies/seed-defaults - Seed UK default policies
  // ===========================================================================
  .post(
    "/policies/seed-defaults",
    async (ctx) => {
      const {
        retentionService,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & DataRetentionPluginContext;

      const result =
        await retentionService.seedDefaultPolicies(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          retentionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.retention.defaults_seeded",
          resourceType: "retention_policy",
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
      beforeHandle: [requirePermission("data_retention", "write")],
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: SeedDefaultsResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Retention"],
        summary: "Seed UK default retention policies",
        description:
          "Create UK-compliant default retention policies for all data categories. " +
          "Skips categories that already have a policy. Includes statutory requirements " +
          "from HMRC, Working Time Regulations, Limitation Act, ICO guidance, and more.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /reviews/:policyId - Execute retention review
  // ===========================================================================
  .post(
    "/reviews/:policyId",
    async (ctx) => {
      const {
        retentionService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & DataRetentionPluginContext;

      const result = await retentionService.executeReview(
        tenantContext,
        params.policyId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          retentionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.retention.review_executed",
          resourceType: "retention_review",
          resourceId: result.data!.review.id,
          newValues: {
            policyId: params.policyId,
            policyName: result.data!.policyName,
            recordsReviewed: result.data!.review.recordsReviewed,
            recordsPurged: result.data!.review.recordsPurged,
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
      beforeHandle: [requirePermission("data_retention", "write")],
      params: PolicyIdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ReviewExecutionResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Retention"],
        summary: "Execute retention review",
        description:
          "Execute a retention review for a specific policy. Identifies expired records, " +
          "respects legal hold exceptions, and records the review for audit trail. " +
          "If auto-purge is enabled on the policy, eligible records will be purged.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /reviews - List retention reviews
  // ===========================================================================
  .get(
    "/reviews",
    async (ctx) => {
      const { retentionService, query, tenantContext } =
        ctx as typeof ctx & DataRetentionPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await retentionService.listReviews(
        tenantContext,
        (filters as Record<string, string | undefined>).policy_id,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("data_retention", "read")],
      query: t.Composite([
        t.Partial(PaginationQuerySchema),
        t.Partial(
          t.Object({
            policy_id: t.String({ minLength: 1 }),
          })
        ),
      ]),
      response: {
        200: RetentionReviewListResponseSchema,
      },
      detail: {
        tags: ["Data Retention"],
        summary: "List retention reviews",
        description:
          "List all retention review executions with optional policy filter and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /exceptions - Create retention exception
  // ===========================================================================
  .post(
    "/exceptions",
    async (ctx) => {
      const {
        retentionService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & DataRetentionPluginContext;

      const typedBody = body as CreateRetentionException;
      const result = await retentionService.createException(tenantContext, {
        policyId: typedBody.policy_id,
        recordType: typedBody.record_type,
        recordId: typedBody.record_id,
        reason: typedBody.reason,
        exceptionUntil: typedBody.exception_until,
      });

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          retentionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.retention.exception_created",
          resourceType: "retention_exception",
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
      beforeHandle: [requirePermission("data_retention", "write")],
      body: CreateRetentionExceptionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: RetentionExceptionResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Retention"],
        summary: "Create retention exception (legal hold)",
        description:
          "Create a retention exception to prevent a specific record from being purged. " +
          "Used for legal holds, active litigation, regulatory investigations, or employee requests.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // DELETE /exceptions/:id - Remove retention exception
  // ===========================================================================
  .delete(
    "/exceptions/:id",
    async (ctx) => {
      const {
        retentionService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & DataRetentionPluginContext;

      const result = await retentionService.removeException(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          retentionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.retention.exception_removed",
          resourceType: "retention_exception",
          resourceId: params.id,
          newValues: { removed: true },
          metadata: {
            idempotencyKey: headers["idempotency-key"],
            requestId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_retention", "delete")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DeleteSuccessResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Retention"],
        summary: "Remove retention exception",
        description:
          "Remove a retention exception (legal hold), allowing the record " +
          "to be purged in the next retention review.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /dashboard - Retention dashboard
  // ===========================================================================
  .get(
    "/dashboard",
    async (ctx) => {
      const { retentionService, tenantContext, error } =
        ctx as typeof ctx & DataRetentionPluginContext;

      const result =
        await retentionService.getRetentionDashboard(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          retentionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_retention", "read")],
      response: {
        200: RetentionDashboardResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Retention"],
        summary: "Retention dashboard",
        description:
          "Get an overview of all retention policies, upcoming reviews, " +
          "active exceptions, and last purge dates.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /policies/:id/expired-records - Identify expired records
  // ===========================================================================
  .get(
    "/policies/:id/expired-records",
    async (ctx) => {
      const { retentionService, params, tenantContext, error } =
        ctx as typeof ctx & DataRetentionPluginContext;

      const result = await retentionService.identifyExpiredRecords(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          retentionErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_retention", "read")],
      params: IdParamsSchema,
      response: {
        200: ExpiredRecordsResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Retention"],
        summary: "Identify expired records",
        description:
          "Identify records that have exceeded their retention period for a given policy. " +
          "Does not purge — only identifies and counts. Use POST /reviews/:policyId to execute a review.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type DataRetentionRoutes = typeof dataRetentionRoutes;
