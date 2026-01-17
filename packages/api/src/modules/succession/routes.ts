/**
 * Succession Planning Module - Elysia Routes
 *
 * Defines the API endpoints for succession planning.
 * All routes require authentication and appropriate permissions.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { SuccessionRepository, type TenantContext } from "./repository";
import { SuccessionService } from "./service";
import {
  CreateSuccessionPlanSchema,
  UpdateSuccessionPlanSchema,
  CreateCandidateSchema,
  UpdateCandidateSchema,
  PlanFiltersSchema,
  SuccessionPlanResponseSchema,
  CandidateResponseSchema,
  SuccessionGapResponseSchema,
  SuccessionPipelineResponseSchema,
  PaginationQuerySchema,
} from "./schemas";

/**
 * Error response schema
 */
const ErrorResponseSchema = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Optional(t.Record(t.String(), t.Unknown())),
  }),
});

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
 * Map error codes to HTTP status
 */
function mapErrorToStatus(code: string): number {
  const statusMap: Record<string, number> = {
    NOT_FOUND: 404,
    PLAN_NOT_FOUND: 404,
    DUPLICATE_CANDIDATE: 409,
    POSITION_NOT_FOUND: 400,
  };
  return statusMap[code] || 500;
}

/**
 * Create Succession routes plugin
 */
export const successionRoutes = new Elysia({ prefix: "/succession", name: "succession-routes" })
  // Plugin Setup
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new SuccessionRepository(db);
    const service = new SuccessionService(repository, db);

    return { successionService: service, successionRepository: repository };
  })

  // ===========================================================================
  // Plan Routes
  // ===========================================================================

  // GET /succession/plans - List plans
  .get(
    "/plans",
    async (ctx) => {
      const { successionService, query, tenantContext } = ctx as any;
      const { cursor, limit, ...filters } = query;
      const parsedLimit = limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await successionService.listPlans(
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
      beforeHandle: [requirePermission("succession", "read")],
      query: t.Composite([t.Partial(PlanFiltersSchema), t.Partial(PaginationQuerySchema)]),
      response: t.Object({
        items: t.Array(SuccessionPlanResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Succession"],
        summary: "List succession plans",
        description: "List succession plans with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /succession/pipeline - Get pipeline overview
  .get(
    "/pipeline",
    async (ctx) => {
      const { successionService, tenantContext, error } = ctx as any;
      const result = await successionService.getPipeline(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("succession", "read")],
      response: {
        200: t.Object({ items: t.Array(SuccessionPipelineResponseSchema) }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Succession"],
        summary: "Get succession pipeline",
        description: "Get overview of succession pipeline across positions",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /succession/gaps - Get gap analysis
  .get(
    "/gaps",
    async (ctx) => {
      const { successionService, tenantContext, error } = ctx as any;
      const result = await successionService.getGaps(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("succession", "read")],
      response: {
        200: t.Object({ items: t.Array(SuccessionGapResponseSchema) }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Succession"],
        summary: "Get succession gaps",
        description: "Get analysis of critical positions without ready successors",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /succession/plans/:id - Get plan by ID
  .get(
    "/plans/:id",
    async (ctx) => {
      const { successionService, params, tenantContext, error } = ctx as any;
      const result = await successionService.getPlan(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("succession", "read")],
      params: IdParamsSchema,
      response: {
        200: SuccessionPlanResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Succession"],
        summary: "Get succession plan",
        description: "Get a succession plan by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /succession/plans - Create plan
  .post(
    "/plans",
    async (ctx) => {
      const { successionService, body, tenantContext, audit, requestId, error, set } =
        ctx as any;

      const result = await successionService.createPlan(tenantContext, body);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SUCCESSION_PLAN_CREATED",
          resourceType: "succession_plan",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("succession", "write")],
      body: CreateSuccessionPlanSchema,
      response: {
        201: SuccessionPlanResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Succession"],
        summary: "Create succession plan",
        description: "Create a new succession plan for a position",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /succession/plans/:id - Update plan
  .put(
    "/plans/:id",
    async (ctx) => {
      const { successionService, params, body, tenantContext, audit, requestId, error } =
        ctx as any;

      const oldResult = await successionService.getPlan(tenantContext, params.id);

      const result = await successionService.updatePlan(tenantContext, params.id, body);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SUCCESSION_PLAN_UPDATED",
          resourceType: "succession_plan",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("succession", "write")],
      params: IdParamsSchema,
      body: UpdateSuccessionPlanSchema,
      response: {
        200: SuccessionPlanResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Succession"],
        summary: "Update succession plan",
        description: "Update a succession plan",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /succession/plans/:id - Delete plan
  .delete(
    "/plans/:id",
    async (ctx) => {
      const { successionService, params, tenantContext, audit, requestId, error } =
        ctx as any;

      const oldResult = await successionService.getPlan(tenantContext, params.id);

      const result = await successionService.deletePlan(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SUCCESSION_PLAN_DELETED",
          resourceType: "succession_plan",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: { requestId },
        });
      }

      return { success: true as const, message: "Succession plan deleted successfully" };
    },
    {
      beforeHandle: [requirePermission("succession", "write")],
      params: IdParamsSchema,
      response: {
        200: SuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Succession"],
        summary: "Delete succession plan",
        description: "Deactivate a succession plan",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Candidate Routes
  // ===========================================================================

  // GET /succession/plans/:id/candidates - List candidates
  .get(
    "/plans/:id/candidates",
    async (ctx) => {
      const { successionService, params, tenantContext, error } = ctx as any;
      const result = await successionService.listCandidates(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("succession", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({ items: t.Array(CandidateResponseSchema) }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Succession"],
        summary: "List candidates",
        description: "List candidates for a succession plan",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /succession/candidates - Add candidate
  .post(
    "/candidates",
    async (ctx) => {
      const { successionService, body, tenantContext, audit, requestId, error, set } =
        ctx as any;

      const result = await successionService.addCandidate(tenantContext, body);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SUCCESSION_CANDIDATE_ADDED",
          resourceType: "succession_candidate",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("succession", "write")],
      body: CreateCandidateSchema,
      response: {
        201: CandidateResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Succession"],
        summary: "Add candidate",
        description: "Add a candidate to a succession plan",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /succession/candidates/:id - Get candidate
  .get(
    "/candidates/:id",
    async (ctx) => {
      const { successionService, params, tenantContext, error } = ctx as any;
      const result = await successionService.getCandidate(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("succession", "read")],
      params: IdParamsSchema,
      response: {
        200: CandidateResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Succession"],
        summary: "Get candidate",
        description: "Get a succession candidate by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /succession/candidates/:id - Update candidate
  .put(
    "/candidates/:id",
    async (ctx) => {
      const { successionService, params, body, tenantContext, audit, requestId, error } =
        ctx as any;

      const oldResult = await successionService.getCandidate(tenantContext, params.id);

      const result = await successionService.updateCandidate(
        tenantContext,
        params.id,
        body
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SUCCESSION_CANDIDATE_UPDATED",
          resourceType: "succession_candidate",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("succession", "write")],
      params: IdParamsSchema,
      body: UpdateCandidateSchema,
      response: {
        200: CandidateResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Succession"],
        summary: "Update candidate",
        description: "Update a succession candidate",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /succession/candidates/:id - Remove candidate
  .delete(
    "/candidates/:id",
    async (ctx) => {
      const { successionService, params, tenantContext, audit, requestId, error } =
        ctx as any;

      const oldResult = await successionService.getCandidate(tenantContext, params.id);

      const result = await successionService.removeCandidate(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "SUCCESSION_CANDIDATE_REMOVED",
          resourceType: "succession_candidate",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: { requestId },
        });
      }

      return { success: true as const, message: "Candidate removed successfully" };
    },
    {
      beforeHandle: [requirePermission("succession", "write")],
      params: IdParamsSchema,
      response: {
        200: SuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Succession"],
        summary: "Remove candidate",
        description: "Remove a candidate from a succession plan",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Pipeline Stats Route
  // ===========================================================================

  // GET /succession/pipeline/stats - Get pipeline statistics
  .get(
    "/pipeline/stats",
    async (ctx) => {
      const { db, tenantContext, error, set } = ctx as any;
      
      try {
        const stats = await db.withTransaction(tenantContext, async (tx: any) => {
          // Get total critical positions (positions marked as critical or with succession plans)
          const [criticalRow] = await tx`
            SELECT COUNT(DISTINCT sp.position_id)::int as count
            FROM app.succession_plans sp
            WHERE sp.is_active = true
          `;
          
          // Get covered positions (have at least one ready-now candidate)
          const [coveredRow] = await tx`
            SELECT COUNT(DISTINCT sp.position_id)::int as count
            FROM app.succession_plans sp
            JOIN app.succession_candidates sc ON sc.plan_id = sp.id
            WHERE sp.is_active = true
              AND sc.is_active = true
              AND sc.readiness_level = 'ready_now'
          `;
          
          // Get ready now candidates
          const [readyNowRow] = await tx`
            SELECT COUNT(*)::int as count
            FROM app.succession_candidates sc
            JOIN app.succession_plans sp ON sp.id = sc.plan_id
            WHERE sp.is_active = true
              AND sc.is_active = true
              AND sc.readiness_level = 'ready_now'
          `;
          
          // Get high risk positions (critical with no successors)
          const [highRiskRow] = await tx`
            SELECT COUNT(*)::int as count
            FROM app.succession_plans sp
            WHERE sp.is_active = true
              AND NOT EXISTS (
                SELECT 1 FROM app.succession_candidates sc 
                WHERE sc.plan_id = sp.id AND sc.is_active = true
              )
          `;
          
          const totalCritical = criticalRow?.count ?? 0;
          const covered = coveredRow?.count ?? 0;
          
          return {
            total_critical_positions: totalCritical,
            covered_positions: covered,
            uncovered_positions: totalCritical - covered,
            ready_now_candidates: readyNowRow?.count ?? 0,
            high_risk_positions: highRiskRow?.count ?? 0,
          };
        });
        
        return stats;
      } catch (err) {
        console.error("Succession /pipeline/stats error:", err);
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: "Failed to get pipeline stats" } };
      }
    },
    {
      beforeHandle: [requirePermission("succession", "read")],
      response: {
        200: t.Object({
          total_critical_positions: t.Number(),
          covered_positions: t.Number(),
          uncovered_positions: t.Number(),
          ready_now_candidates: t.Number(),
          high_risk_positions: t.Number(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Succession"],
        summary: "Get pipeline statistics",
        description: "Get succession pipeline summary statistics",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type SuccessionRoutes = typeof successionRoutes;
