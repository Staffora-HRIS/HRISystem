/**
 * Data Breach Module - Elysia Routes
 *
 * Defines the API endpoints for UK GDPR Data Breach notification workflow.
 * All routes require authentication and appropriate permissions.
 *
 * UK GDPR Articles 33-34:
 * - Report personal data breaches to ICO within 72 hours
 * - Notify affected individuals when high risk to rights and freedoms
 *
 * Routes:
 * POST   /incidents              - Report new breach
 * GET    /incidents              - List breaches
 * GET    /incidents/:id          - Get breach detail
 * PATCH  /incidents/:id/assess   - Risk assessment
 * POST   /incidents/:id/notify-ico      - Record ICO notification
 * POST   /incidents/:id/notify-subjects - Record subject notifications
 * POST   /incidents/:id/timeline        - Add timeline entry
 * PATCH  /incidents/:id/close           - Close breach
 * GET    /dashboard              - Dashboard with overdue alerts
 *
 * Permission model:
 * - data_breaches: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { DataBreachRepository } from "./repository";
import { DataBreachService } from "./service";
import {
  ReportBreachSchema,
  AssessBreachSchema,
  NotifyIcoSchema,
  NotifySubjectsSchema,
  CloseBreachSchema,
  CreateTimelineEntrySchema,
  BreachFiltersSchema,
  BreachResponseSchema,
  BreachListResponseSchema,
  BreachDashboardResponseSchema,
  TimelineEntryResponseSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type ReportBreach,
  type AssessBreach,
  type NotifyIco,
  type NotifySubjects,
  type CloseBreach,
  type CreateTimelineEntry,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & DataBreachPluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface DataBreachPluginContext {
  dataBreachService: DataBreachService;
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

// Module-specific error codes beyond the shared base set
const breachErrorStatusMap: Record<string, number> = {
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
};

/**
 * Create Data Breach routes plugin.
 *
 * Prefix: /data-breach (mounted under /api/v1 in app.ts)
 * Effective paths: /api/v1/data-breach/incidents, /api/v1/data-breach/dashboard
 */
export const dataBreachRoutes = new Elysia({
  prefix: "/data-breach",
  name: "data-breach-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new DataBreachRepository(db);
    const service = new DataBreachService(repository, db);
    return { dataBreachService: service };
  })

  // ===========================================================================
  // POST /incidents - Report a new data breach
  // ===========================================================================
  .post(
    "/incidents",
    async (ctx) => {
      const { dataBreachService, body, tenantContext, audit, error } =
        ctx as typeof ctx & DataBreachPluginContext;

      const result = await dataBreachService.reportBreach(
        tenantContext,
        body as ReportBreach,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          breachErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "compliance.data_breach.reported",
          resourceType: "data_breach",
          resourceId: result.data.id,
          newValues: {
            title: result.data.title,
            severity: result.data.severity,
            breach_category: result.data.breach_category,
            ico_deadline: result.data.ico_deadline,
          },
        });
      }

      ctx.set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_breaches", "write")],
      body: ReportBreachSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: BreachResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Breach"],
        summary: "Report a new data breach",
        description:
          "Create a new data breach report with breach type, discovery date, nature of breach, " +
          "and likely consequences. Automatically calculates the 72-hour ICO notification deadline.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /incidents - List data breaches
  // ===========================================================================
  .get(
    "/incidents",
    async (ctx) => {
      const { dataBreachService, query, tenantContext } =
        ctx as typeof ctx & DataBreachPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await dataBreachService.listBreaches(tenantContext, filters, {
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
      beforeHandle: [requirePermission("data_breaches", "read")],
      query: t.Composite([
        t.Partial(BreachFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: BreachListResponseSchema,
      detail: {
        tags: ["Data Breach"],
        summary: "List data breaches",
        description:
          "List data breaches with optional filters (status, severity, category, overdue) and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /dashboard - Breach dashboard with overdue alerts
  // ===========================================================================
  .get(
    "/dashboard",
    async (ctx) => {
      const { dataBreachService, tenantContext, error } =
        ctx as typeof ctx & DataBreachPluginContext;

      const result = await dataBreachService.getBreachDashboard(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          breachErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_breaches", "read")],
      response: {
        200: BreachDashboardResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Breach"],
        summary: "Get breach dashboard",
        description:
          "Dashboard showing open breaches, overdue ICO notifications, statistics by severity/status, " +
          "and average time to ICO notification.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /incidents/:id - Get a single data breach by ID
  // ===========================================================================
  .get(
    "/incidents/:id",
    async (ctx) => {
      const { dataBreachService, params, tenantContext, error } =
        ctx as typeof ctx & DataBreachPluginContext;

      const result = await dataBreachService.getBreach(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          breachErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_breaches", "read")],
      params: IdParamsSchema,
      response: {
        200: BreachResponseSchema,
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Breach"],
        summary: "Get data breach by ID",
        description:
          "Get a single data breach record with full details including ICO deadline status, " +
          "risk assessment, and notification tracking.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /incidents/:id/assess - Risk assessment
  // ===========================================================================
  .patch(
    "/incidents/:id/assess",
    async (ctx) => {
      const { dataBreachService, body, params, tenantContext, audit, error } =
        ctx as typeof ctx & DataBreachPluginContext;

      const typedBody = body as AssessBreach;
      const result = await dataBreachService.assessBreach(
        tenantContext,
        params.id,
        typedBody,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          breachErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "compliance.data_breach.assessed",
          resourceType: "data_breach",
          resourceId: params.id,
          newValues: {
            severity: typedBody.severity,
            risk_to_individuals: typedBody.risk_to_individuals,
            high_risk_to_individuals: typedBody.high_risk_to_individuals,
            ico_notification_required: typedBody.ico_notification_required,
            subject_notification_required: typedBody.subject_notification_required,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_breaches", "write")],
      params: IdParamsSchema,
      body: AssessBreachSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: BreachResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Breach"],
        summary: "Assess breach risk",
        description:
          "Perform risk assessment on a reported breach. Determines whether ICO notification " +
          "is required (likely risk to individuals) and whether data subject notification is " +
          "required (likely HIGH risk). Transitions breach from 'reported' to 'assessing'.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /incidents/:id/notify-ico - Record ICO notification
  // ===========================================================================
  .post(
    "/incidents/:id/notify-ico",
    async (ctx) => {
      const { dataBreachService, body, params, tenantContext, audit, error } =
        ctx as typeof ctx & DataBreachPluginContext;

      const typedBody = body as NotifyIco;
      const result = await dataBreachService.notifyICO(
        tenantContext,
        params.id,
        typedBody,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          breachErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "compliance.data_breach.ico_notified",
          resourceType: "data_breach",
          resourceId: params.id,
          newValues: {
            ico_reference: typedBody.ico_reference,
            ico_notification_date: typedBody.ico_notification_date,
            dpo_name: typedBody.dpo_name,
            ico_notified_within_72h: result.data.ico_notified_within_72h,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_breaches", "write")],
      params: IdParamsSchema,
      body: NotifyIcoSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: BreachResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Breach"],
        summary: "Record ICO notification",
        description:
          "Record that the ICO has been notified about this breach. Requires DPO details, " +
          "ICO reference number, and notification date/time. Automatically calculates " +
          "whether notification was within the 72-hour deadline. " +
          "Transitions breach from 'assessing' to 'ico_notified'.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /incidents/:id/notify-subjects - Record data subject notifications
  // ===========================================================================
  .post(
    "/incidents/:id/notify-subjects",
    async (ctx) => {
      const { dataBreachService, body, params, tenantContext, audit, error } =
        ctx as typeof ctx & DataBreachPluginContext;

      const typedBody = body as NotifySubjects;
      const result = await dataBreachService.notifyDataSubjects(
        tenantContext,
        params.id,
        typedBody,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          breachErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "compliance.data_breach.subjects_notified",
          resourceType: "data_breach",
          resourceId: params.id,
          newValues: {
            method: typedBody.subject_notification_method,
            subjects_notified_count: typedBody.subjects_notified_count,
            notification_date: typedBody.notification_date,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_breaches", "write")],
      params: IdParamsSchema,
      body: NotifySubjectsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: BreachResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Breach"],
        summary: "Record data subject notifications",
        description:
          "Record that affected data subjects have been notified about the breach " +
          "(UK GDPR Article 34). Includes communication method, number of subjects " +
          "notified, and notification content. " +
          "Transitions breach from 'ico_notified' to 'subjects_notified'.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /incidents/:id/timeline - Add timeline entry
  // ===========================================================================
  .post(
    "/incidents/:id/timeline",
    async (ctx) => {
      const { dataBreachService, body, params, tenantContext, audit, error } =
        ctx as typeof ctx & DataBreachPluginContext;

      const typedBody = body as CreateTimelineEntry;
      const result = await dataBreachService.addTimelineEntry(
        tenantContext,
        params.id,
        typedBody,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          breachErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "compliance.data_breach.timeline_entry_added",
          resourceType: "data_breach_timeline",
          resourceId: result.data.id,
          newValues: {
            breach_id: params.id,
            action: typedBody.action,
          },
        });
      }

      ctx.set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_breaches", "write")],
      params: IdParamsSchema,
      body: CreateTimelineEntrySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: TimelineEntryResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Breach"],
        summary: "Add timeline entry",
        description:
          "Add a new investigation/remediation action to a data breach timeline. " +
          "Cannot add entries to closed breaches.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /incidents/:id/timeline - Get breach timeline
  // ===========================================================================
  .get(
    "/incidents/:id/timeline",
    async (ctx) => {
      const { dataBreachService, params, tenantContext, error } =
        ctx as typeof ctx & DataBreachPluginContext;

      const result = await dataBreachService.getTimeline(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          breachErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_breaches", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Array(TimelineEntryResponseSchema),
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Breach"],
        summary: "Get breach timeline",
        description:
          "Get the full audit trail / timeline for a data breach, " +
          "including all investigation and remediation actions.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /incidents/:id/close - Close breach with lessons learned
  // ===========================================================================
  .patch(
    "/incidents/:id/close",
    async (ctx) => {
      const { dataBreachService, body, params, tenantContext, audit, error } =
        ctx as typeof ctx & DataBreachPluginContext;

      const typedBody = body as CloseBreach;
      const result = await dataBreachService.closeBreach(
        tenantContext,
        params.id,
        typedBody,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          breachErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "compliance.data_breach.closed",
          resourceType: "data_breach",
          resourceId: params.id,
          newValues: {
            status: "closed",
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_breaches", "write")],
      params: IdParamsSchema,
      body: CloseBreachSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: BreachResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Breach"],
        summary: "Close breach",
        description:
          "Close a data breach with documented lessons learned and remediation plan. " +
          "Can only close breaches that are in 'subjects_notified' or 'remediation_only' state.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type DataBreachRoutes = typeof dataBreachRoutes;
