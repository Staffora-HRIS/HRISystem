/**
 * Assessments Module Routes
 *
 * API endpoints for assessment templates and candidate assessments
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import { handleServiceError } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import type { AuditHelper } from "../../plugins/audit";
import { AssessmentService } from "./service";
import {
  IdParamsSchema,
  PaginationQuerySchema,
  CreateAssessmentTemplateSchema,
  UpdateAssessmentTemplateSchema,
  AssessmentTemplateFiltersSchema,
  ScheduleCandidateAssessmentSchema,
  RecordAssessmentResultSchema,
  CandidateAssessmentFiltersSchema,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string } | null;
  user: { id: string } | null;
}

interface AssessmentPluginContext {
  assessmentService: AssessmentService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

// =============================================================================
// Routes
// =============================================================================

export const assessmentRoutes = new Elysia({ prefix: "/assessments", name: "assessment-routes" })

  // Derive services
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const service = new AssessmentService(db);
    const tenantContext = tenant
      ? { tenantId: tenant.id, userId: user?.id }
      : null;
    return { assessmentService: service, tenantContext };
  })

  // ===========================================================================
  // Template Routes
  // ===========================================================================

  // GET /templates - List assessment templates
  .get(
    "/templates",
    async (ctx) => {
      const { assessmentService, query, tenantContext, error } = ctx as typeof ctx & AssessmentPluginContext;

      try {
        const result = await assessmentService.listTemplates(tenantContext, {
          cursor: query.cursor as string | undefined,
          limit: Number(query.limit) || undefined,
          type: query.type as string | undefined,
          active: query.active as string | undefined,
          search: query.search as string | undefined,
        });

        return {
          templates: result.items,
          count: result.items.length,
          ...result,
        };
      } catch (err: unknown) {
        return handleServiceError(error, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      query: t.Composite([
        t.Partial(AssessmentTemplateFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      detail: {
        tags: ["Recruitment - Assessments"],
        summary: "List assessment templates",
        description: "List assessment templates with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /templates/:id - Get assessment template by ID
  .get(
    "/templates/:id",
    async (ctx) => {
      const { assessmentService, params, tenantContext, error } = ctx as typeof ctx & AssessmentPluginContext;

      const result = await assessmentService.getTemplate(tenantContext, params.id);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      params: IdParamsSchema,
      detail: {
        tags: ["Recruitment - Assessments"],
        summary: "Get assessment template by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /templates - Create assessment template
  .post(
    "/templates",
    async (ctx) => {
      const { assessmentService, body, tenantContext, audit, error } = ctx as typeof ctx & AssessmentPluginContext;

      const result = await assessmentService.createTemplate(
        tenantContext,
        body as Parameters<typeof assessmentService.createTemplate>[1]
      );

      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.assessment_template.created",
          resourceType: "assessment_template",
          resourceId: result.data.id,
          newValues: result.data as unknown as Record<string, unknown>,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      body: CreateAssessmentTemplateSchema,
      detail: {
        tags: ["Recruitment - Assessments"],
        summary: "Create assessment template",
        description: "Create a new assessment template",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /templates/:id - Update assessment template
  .patch(
    "/templates/:id",
    async (ctx) => {
      const { assessmentService, params, body, tenantContext, audit, error } = ctx as typeof ctx & AssessmentPluginContext;

      const result = await assessmentService.updateTemplate(tenantContext, params.id, body);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.assessment_template.updated",
          resourceType: "assessment_template",
          resourceId: result.data.id,
          newValues: result.data as unknown as Record<string, unknown>,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      body: UpdateAssessmentTemplateSchema,
      detail: {
        tags: ["Recruitment - Assessments"],
        summary: "Update assessment template",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Candidate Assessment Routes
  // ===========================================================================

  // GET /candidate-assessments - List candidate assessments
  .get(
    "/candidate-assessments",
    async (ctx) => {
      const { assessmentService, query, tenantContext, error } = ctx as typeof ctx & AssessmentPluginContext;

      try {
        const result = await assessmentService.listCandidateAssessments(tenantContext, {
          cursor: query.cursor as string | undefined,
          limit: Number(query.limit) || undefined,
          candidateId: query.candidateId as string | undefined,
          templateId: query.templateId as string | undefined,
          status: query.status as string | undefined,
          search: query.search as string | undefined,
        });

        return {
          assessments: result.items,
          count: result.items.length,
          ...result,
        };
      } catch (err: unknown) {
        return handleServiceError(error, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      query: t.Composite([
        t.Partial(CandidateAssessmentFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      detail: {
        tags: ["Recruitment - Assessments"],
        summary: "List candidate assessments",
        description: "List candidate assessments with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /candidate-assessments/:id - Get candidate assessment by ID
  .get(
    "/candidate-assessments/:id",
    async (ctx) => {
      const { assessmentService, params, tenantContext, error } = ctx as typeof ctx & AssessmentPluginContext;

      const result = await assessmentService.getCandidateAssessment(tenantContext, params.id);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      params: IdParamsSchema,
      detail: {
        tags: ["Recruitment - Assessments"],
        summary: "Get candidate assessment by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /candidate-assessments - Schedule candidate assessment
  .post(
    "/candidate-assessments",
    async (ctx) => {
      const { assessmentService, body, tenantContext, audit, error } = ctx as typeof ctx & AssessmentPluginContext;

      const result = await assessmentService.scheduleCandidateAssessment(
        tenantContext,
        body as Parameters<typeof assessmentService.scheduleCandidateAssessment>[1]
      );

      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.candidate_assessment.scheduled",
          resourceType: "candidate_assessment",
          resourceId: result.data.id,
          newValues: result.data as unknown as Record<string, unknown>,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      body: ScheduleCandidateAssessmentSchema,
      detail: {
        tags: ["Recruitment - Assessments"],
        summary: "Schedule candidate assessment",
        description: "Schedule an assessment for a candidate",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /candidate-assessments/:id/record-result - Record assessment result
  .post(
    "/candidate-assessments/:id/record-result",
    async (ctx) => {
      const { assessmentService, params, body, tenantContext, audit, error } = ctx as typeof ctx & AssessmentPluginContext;

      const typedBody = body as {
        score: number;
        passed: boolean;
        feedback?: string;
        answers?: Record<string, unknown>;
      };
      const result = await assessmentService.recordAssessmentResult(tenantContext, params.id, typedBody);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.candidate_assessment.completed",
          resourceType: "candidate_assessment",
          resourceId: result.data.id,
          newValues: {
            score: typedBody.score,
            passed: typedBody.passed,
            status: "completed",
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      body: RecordAssessmentResultSchema,
      detail: {
        tags: ["Recruitment - Assessments"],
        summary: "Record assessment result",
        description: "Record the result of a candidate assessment",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /candidate-assessments/:id/cancel - Cancel candidate assessment
  .post(
    "/candidate-assessments/:id/cancel",
    async (ctx) => {
      const { assessmentService, params, tenantContext, audit, error } = ctx as typeof ctx & AssessmentPluginContext;

      const result = await assessmentService.cancelCandidateAssessment(tenantContext, params.id);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.candidate_assessment.cancelled",
          resourceType: "candidate_assessment",
          resourceId: result.data.id,
          newValues: { status: "cancelled" },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      detail: {
        tags: ["Recruitment - Assessments"],
        summary: "Cancel candidate assessment",
        description: "Cancel a scheduled or in-progress assessment",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type AssessmentRoutes = typeof assessmentRoutes;
