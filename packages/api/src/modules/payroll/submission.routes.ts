/**
 * Payroll Submission Routes (TODO-064)
 *
 * API endpoints for PAYE/RTI/FPS submission to HMRC.
 *
 * Endpoints:
 *   POST /submissions/fps       - Create Full Payment Submission
 *   POST /submissions/eps       - Create Employer Payment Summary
 *   GET  /submissions           - List submissions
 *   GET  /submissions/:id       - Get submission details
 *   POST /submissions/:id/validate - Validate before submission
 *   POST /submissions/:id/submit   - Submit to HMRC (queue for processing)
 *
 * Permission model:
 *   - payroll:submissions: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { mapServiceError } from "../../lib/route-errors";
import { ErrorResponseSchema } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { PayrollRepository } from "./repository";
import { SubmissionRepository } from "./submission.repository";
import { SubmissionService } from "./submission.service";
import {
  CreateFpsSubmissionSchema,
  CreateEpsSubmissionSchema,
  SubmissionListQuerySchema,
  SubmissionResponseSchema,
  SubmissionDetailResponseSchema,
  SubmissionValidationResponseSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateFpsSubmission,
  type CreateEpsSubmission,
  type SubmissionListQuery,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface SubmissionPluginContext {
  submissionService: SubmissionService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number; headers: Record<string, string> };
  error: (status: number, body: unknown) => never;
}

/**
 * Module-specific error code to HTTP status overrides
 */
const submissionErrorOverrides: Record<string, number> = {
  STATE_MACHINE_VIOLATION: 409,
  CONFLICT: 409,
};

/**
 * Create Payroll Submission routes plugin.
 * Mounted under /payroll/submissions by the parent payroll module.
 */
export const submissionRoutes = new Elysia({
  prefix: "/submissions",
  name: "payroll-submission-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const payrollRepo = new PayrollRepository(db);
    const submissionRepo = new SubmissionRepository(db);
    const service = new SubmissionService(submissionRepo, payrollRepo, db);
    return { submissionService: service };
  })

  // ===========================================================================
  // POST /submissions/fps - Create Full Payment Submission
  // ===========================================================================
  .post(
    "/fps",
    async (ctx) => {
      const {
        submissionService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & SubmissionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await submissionService.createFpsSubmission(
        tenantContext!,
        body as unknown as CreateFpsSubmission,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, submissionErrorOverrides);
      }

      if (audit) {
        await audit.log({
          action: "payroll.submission.fps_created",
          resourceType: "payroll_submission",
          resourceId: result.data!.id,
          newValues: {
            submissionType: "fps",
            taxYear: result.data!.tax_year,
            period: result.data!.period,
            payrollRunId: result.data!.payroll_run_id,
            employeeCount: result.data!.items.length,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:submissions", "write")],
      body: CreateFpsSubmissionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: SubmissionDetailResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Submissions"],
        summary: "Create Full Payment Submission (FPS)",
        description:
          "Create an FPS submission from a payroll run. The submission is created in 'draft' status " +
          "with all employee payroll data populated. FPS includes: employee NI number, tax code, " +
          "gross pay, tax deducted, NI contributions, student loan deductions, and pension contributions. " +
          "Year-to-date figures are calculated automatically. " +
          "Use POST /submissions/:id/validate to validate before submission.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /submissions/eps - Create Employer Payment Summary
  // ===========================================================================
  .post(
    "/eps",
    async (ctx) => {
      const {
        submissionService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & SubmissionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await submissionService.createEpsSubmission(
        tenantContext!,
        body as unknown as CreateEpsSubmission,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, submissionErrorOverrides);
      }

      if (audit) {
        await audit.log({
          action: "payroll.submission.eps_created",
          resourceType: "payroll_submission",
          resourceId: result.data!.id,
          newValues: {
            submissionType: "eps",
            taxYear: result.data!.tax_year,
            period: result.data!.period,
            payrollRunId: result.data!.payroll_run_id,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:submissions", "write")],
      body: CreateEpsSubmissionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: SubmissionResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Submissions"],
        summary: "Create Employer Payment Summary (EPS)",
        description:
          "Create an EPS submission. An EPS can be linked to a payroll run or created standalone " +
          "for employer-level adjustments (recoverable statutory payments, CIS deductions, " +
          "no-payment periods, final submission for year). Created in 'draft' status.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /submissions - List submissions
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { submissionService, query, tenantContext } =
        ctx as typeof ctx & SubmissionPluginContext;

      const filters: SubmissionListQuery = {
        submission_type: query.submission_type as SubmissionListQuery["submission_type"],
        tax_year: query.tax_year,
        status: query.status as SubmissionListQuery["status"],
        payroll_run_id: query.payroll_run_id,
        cursor: query.cursor,
        limit: query.limit !== undefined ? Number(query.limit) : undefined,
      };

      const result = await submissionService.listSubmissions(tenantContext!, filters);

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("payroll:submissions", "read")],
      query: t.Partial(SubmissionListQuerySchema),
      response: {
        200: t.Object({
          items: t.Array(SubmissionResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Submissions"],
        summary: "List payroll submissions",
        description:
          "List payroll submissions with optional filters for submission_type, tax_year, " +
          "status, and payroll_run_id. Supports cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /submissions/:id - Get submission details
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { submissionService, params, tenantContext, requestId, set } =
        ctx as typeof ctx & SubmissionPluginContext;

      const result = await submissionService.getSubmissionDetail(
        tenantContext!,
        params.id
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, submissionErrorOverrides);
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:submissions", "read")],
      params: IdParamsSchema,
      response: {
        200: SubmissionDetailResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Submissions"],
        summary: "Get submission details",
        description:
          "Get a payroll submission with all per-employee line items. " +
          "Includes the full submission payload, validation errors, HMRC response, " +
          "and all employee-level data (NI number, tax code, pay breakdown, YTD figures).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /submissions/:id/validate - Validate before submission
  // ===========================================================================
  .post(
    "/:id/validate",
    async (ctx) => {
      const {
        submissionService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & SubmissionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await submissionService.validateSubmission(
        tenantContext!,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, submissionErrorOverrides);
      }

      if (audit) {
        await audit.log({
          action: "payroll.submission.validated",
          resourceType: "payroll_submission",
          resourceId: params.id,
          newValues: {
            isValid: result.data!.is_valid,
            errorCount: result.data!.errors.length,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:submissions", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SubmissionValidationResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Submissions"],
        summary: "Validate submission before HMRC submission",
        description:
          "Run pre-submission validation checks against an FPS or EPS submission. " +
          "For FPS: validates employee NI numbers, tax codes, pay amounts. " +
          "For EPS: validates employer references and required fields. " +
          "If validation passes, the submission transitions from 'draft' to 'validated'. " +
          "If validation fails, the submission remains in 'draft' and errors are returned.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /submissions/:id/submit - Submit to HMRC (queue for processing)
  // ===========================================================================
  .post(
    "/:id/submit",
    async (ctx) => {
      const {
        submissionService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & SubmissionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await submissionService.submitToHmrc(
        tenantContext!,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, submissionErrorOverrides);
      }

      if (audit) {
        await audit.log({
          action: "payroll.submission.submitted_to_hmrc",
          resourceType: "payroll_submission",
          resourceId: params.id,
          newValues: {
            status: result.data!.status,
            submittedAt: result.data!.submitted_at,
            submittedBy: result.data!.submitted_by,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:submissions", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SubmissionResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll Submissions"],
        summary: "Submit to HMRC",
        description:
          "Queue a validated submission for processing to HMRC. The submission must be in " +
          "'validated' status. Transitions to 'submitted' status and emits a domain event " +
          "that a background worker will process to send the data to HMRC. " +
          "The HMRC response will update the status to 'accepted' or 'rejected' asynchronously.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type SubmissionRoutes = typeof submissionRoutes;
