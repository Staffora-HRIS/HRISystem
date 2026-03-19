/**
 * Total Reward Statement Module - Elysia Routes
 *
 * Defines the API endpoints for generating and retrieving total reward
 * statements that show the complete employee compensation package.
 *
 * Endpoints:
 * - GET  /total-reward/:employeeId        -- Generate/retrieve total reward statement
 * - GET  /total-reward/:employeeId/pdf    -- Request PDF generation
 * - GET  /total-reward/statements/:id     -- Get a specific statement by ID
 *
 * Permission model:
 * - total_reward:statements: read
 * - total_reward:pdf: read
 *
 * All routes require authentication, tenant context, and appropriate RBAC.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { mapServiceError } from "../../lib/route-errors";
import { ErrorResponseSchema } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { TotalRewardRepository } from "./repository";
import { TotalRewardService } from "./service";
import {
  TotalRewardStatementResponseSchema,
  PdfRequestResponseSchema,
  TotalRewardQuerySchema,
  EmployeeIdParamsSchema,
  StatementIdParamsSchema,
  type TotalRewardQuery,
  type EmployeeIdParams,
  type StatementIdParams,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface TotalRewardPluginContext {
  totalRewardService: TotalRewardService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  set: { status: number; headers: Record<string, string> };
}

// =============================================================================
// Routes
// =============================================================================

/**
 * Create Total Reward routes plugin
 */
export const totalRewardRoutes = new Elysia({
  prefix: "/total-reward",
  name: "total-reward-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new TotalRewardRepository(db);
    const service = new TotalRewardService(repository, db);
    return { totalRewardService: service };
  })

  // ===========================================================================
  // GET /total-reward/statements/:id -- Get a specific statement by ID
  // (registered before /:employeeId to avoid route shadowing)
  // ===========================================================================
  .get(
    "/statements/:id",
    async (ctx) => {
      const {
        totalRewardService,
        params,
        tenantContext,
        requestId,
        set,
      } = ctx as typeof ctx & TotalRewardPluginContext;

      const result = await totalRewardService.getStatementById(
        tenantContext!,
        params.id
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("total_reward:statements", "read")],
      params: StatementIdParamsSchema,
      response: {
        200: TotalRewardStatementResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Total Reward"],
        summary: "Get total reward statement by ID",
        description:
          "Retrieve a previously generated total reward statement by its unique ID. " +
          "Includes the full compensation breakdown and status.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /total-reward/:employeeId/pdf -- Request PDF generation
  // (registered before /:employeeId to avoid route shadowing)
  // ===========================================================================
  .get(
    "/:employeeId/pdf",
    async (ctx) => {
      const {
        totalRewardService,
        params,
        query,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & TotalRewardPluginContext;

      const result = await totalRewardService.requestPdfGeneration(
        tenantContext!,
        params.employeeId,
        {
          periodStart: query.period_start,
          periodEnd: query.period_end,
        }
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }

      if (audit) {
        await audit.log({
          action: "total_reward.pdf.requested",
          resourceType: "total_reward_statement",
          resourceId: result.data!.statement_id,
          metadata: {
            employeeId: params.employeeId,
            requestId,
          },
        });
      }

      set.status = 202;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("total_reward:pdf", "read")],
      params: EmployeeIdParamsSchema,
      query: t.Partial(TotalRewardQuerySchema),
      response: {
        202: PdfRequestResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Total Reward"],
        summary: "Request PDF total reward statement",
        description:
          "Request PDF generation for an employee's total reward statement. If no statement " +
          "exists yet, one is generated first. The PDF is created asynchronously by the pdf-worker " +
          "and will be available via the documents module once complete. Returns 202 Accepted " +
          "with the statement ID to check status.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /total-reward/:employeeId -- Generate/retrieve total reward statement
  // ===========================================================================
  .get(
    "/:employeeId",
    async (ctx) => {
      const {
        totalRewardService,
        params,
        query,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & TotalRewardPluginContext;

      const result = await totalRewardService.generateStatement(
        tenantContext!,
        params.employeeId,
        {
          periodStart: query.period_start,
          periodEnd: query.period_end,
          useCache: query.use_cache === "true",
        }
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }

      if (audit) {
        await audit.log({
          action: "total_reward.statement.generated",
          resourceType: "total_reward_statement",
          resourceId: result.data!.id,
          metadata: {
            employeeId: params.employeeId,
            periodStart: query.period_start,
            periodEnd: query.period_end,
            requestId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("total_reward:statements", "read")],
      params: EmployeeIdParamsSchema,
      query: t.Partial(TotalRewardQuerySchema),
      response: {
        200: TotalRewardStatementResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Total Reward"],
        summary: "Generate total reward statement",
        description:
          "Generate a total reward statement for an employee showing their complete compensation package " +
          "including base salary, bonus/variable pay, pension contributions, benefit values, and holiday " +
          "entitlement value. Defaults to the current UK tax year (6 Apr - 5 Apr) if no period is specified. " +
          "Set use_cache=true to return a previously generated statement if one exists.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type TotalRewardRoutes = typeof totalRewardRoutes;
