/**
 * Diversity Monitoring Module - Elysia Routes
 *
 * Defines the API endpoints for voluntary diversity data collection.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - /me endpoints: any authenticated employee (self-service)
 * - /aggregate, /completion-rate: admin read access (diversity:read)
 *
 * Legal basis: Equality Act 2010 (UK)
 * All diversity fields are voluntary with explicit consent.
 */

import { Elysia } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { DiversityRepository } from "./repository";
import { DiversityService } from "./service";
import {
  UpsertDiversityDataSchema,
  DiversityDataResponseSchema,
  AggregateStatsResponseSchema,
  CompletionRateResponseSchema,
  OptionalIdempotencyHeaderSchema,
  type UpsertDiversityData,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface DiversityPluginContext {
  diversityService: DiversityService;
  diversityRepository: DiversityRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  request: Request;
  error: (status: number, body: unknown) => never;
}

interface DiversityRouteContext extends DiversityPluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

/**
 * Diversity module-specific error codes beyond the shared base set
 */
const diversityErrorStatusMap: Record<string, number> = {
  CONSENT_REQUIRED: 400,
};

/**
 * Create Diversity routes plugin
 */
export const diversityRoutes = new Elysia({ prefix: "/diversity", name: "diversity-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new DiversityRepository(db);
    const service = new DiversityService(repository, db);
    return { diversityService: service, diversityRepository: repository };
  })

  // ===========================================================================
  // Self-Service Routes (/me)
  // ===========================================================================

  // GET /diversity/me - Employee views their own diversity data
  .get(
    "/me",
    async (ctx) => {
      const { diversityService, tenantContext, set } = ctx as unknown as DiversityRouteContext;

      const result = await diversityService.getMyData(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", diversityErrorStatusMap);
        set.status = status;
        return { error: result.error };
      }

      return result.data;
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      response: {
        200: DiversityDataResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Diversity"],
        summary: "Get my diversity data",
        description:
          "Get the currently authenticated employee's voluntary diversity monitoring data",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /diversity/me - Employee submits or updates their own diversity data
  .put(
    "/me",
    async (ctx) => {
      const { diversityService, body, tenantContext, audit, requestId, request, set } =
        ctx as unknown as DiversityRouteContext;

      // Capture client IP for consent audit trail
      const clientIp =
        request?.headers?.get?.("x-forwarded-for") ||
        request?.headers?.get?.("x-real-ip") ||
        null;

      const result = await diversityService.upsertMyData(
        tenantContext,
        body as unknown as UpsertDiversityData,
        clientIp
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          diversityErrorStatusMap
        );
        set.status = status;
        return { error: result.error };
      }

      // Audit log the submission (do not log actual diversity values)
      if (audit) {
        await audit.log({
          action: "diversity.data.submitted",
          resourceType: "diversity_data",
          resourceId: result.data!.id,
          metadata: { requestId, action: "upsert" },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      body: UpsertDiversityDataSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DiversityDataResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Diversity"],
        summary: "Submit or update my diversity data",
        description:
          "Submit or update voluntary diversity monitoring data. " +
          "consent_given must be true. All other fields are optional.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /diversity/me - Employee withdraws their diversity data
  .delete(
    "/me",
    async (ctx) => {
      const { diversityService, tenantContext, audit, requestId, set } =
        ctx as unknown as DiversityRouteContext;

      const result = await diversityService.withdrawMyData(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          diversityErrorStatusMap
        );
        set.status = status;
        return { error: result.error };
      }

      // Audit log the withdrawal
      if (audit) {
        await audit.log({
          action: "diversity.data.withdrawn",
          resourceType: "diversity_data",
          metadata: { requestId, action: "withdrawn" },
        });
      }

      return { success: true as const, message: result.data!.message };
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Diversity"],
        summary: "Withdraw my diversity data",
        description:
          "Delete all diversity monitoring data for the current employee. " +
          "This exercises the right to withdraw voluntarily provided data.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Admin Reporting Routes (aggregate only)
  // ===========================================================================

  // GET /diversity/aggregate - Aggregate diversity stats (counts per category)
  .get(
    "/aggregate",
    async (ctx) => {
      const { diversityService, tenantContext, set } = ctx as unknown as DiversityRouteContext;

      const result = await diversityService.getAggregateStats(tenantContext);

      if (!result.success) {
        set.status = 500;
        return { error: result.error };
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("diversity", "read")],
      response: {
        200: AggregateStatsResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Diversity"],
        summary: "Get aggregate diversity statistics",
        description:
          "Get aggregate diversity statistics (counts per category). " +
          "Never returns individual-level data. Admin access only.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /diversity/completion-rate - Percentage of employees who have submitted data
  .get(
    "/completion-rate",
    async (ctx) => {
      const { diversityService, tenantContext, set } = ctx as unknown as DiversityRouteContext;

      const result = await diversityService.getCompletionRate(tenantContext);

      if (!result.success) {
        set.status = 500;
        return { error: result.error };
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("diversity", "read")],
      response: {
        200: CompletionRateResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Diversity"],
        summary: "Get diversity data completion rate",
        description:
          "Get the percentage of active employees who have submitted " +
          "diversity monitoring data. Admin access only.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type DiversityRoutes = typeof diversityRoutes;
