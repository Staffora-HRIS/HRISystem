/**
 * Recruitment Module Routes
 *
 * API endpoints for recruitment operations (requisitions and candidates)
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { RecruitmentRepository } from "./repository";
import { RecruitmentService } from "./service";
import {
  IdParamsSchema,
  PaginationQuerySchema,
  UuidSchema,
  CreateRequisitionSchema,
  UpdateRequisitionSchema,
  RequisitionFiltersSchema,
  RequisitionStatusSchema,
  CreateCandidateSchema,
  UpdateCandidateSchema,
  AdvanceCandidateSchema,
  CandidateFiltersSchema,
  CandidateStageSchema,
  CandidateSourceSchema,
} from "./schemas";

// =============================================================================
// Response Schemas
// =============================================================================

const ErrorResponseSchema = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Optional(t.Record(t.String(), t.Unknown())),
  }),
});

const RequisitionResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  code: t.String(),
  title: t.String(),
  position_id: t.Union([UuidSchema, t.Null()]),
  org_unit_id: t.Union([UuidSchema, t.Null()]),
  hiring_manager_id: t.Union([UuidSchema, t.Null()]),
  status: RequisitionStatusSchema,
  openings: t.Number(),
  filled: t.Number(),
  priority: t.Number(),
  job_description: t.Union([t.String(), t.Null()]),
  requirements: t.Union([t.Any(), t.Null()]),
  target_start_date: t.Union([t.String(), t.Null()]),
  deadline: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  hiring_manager_name: t.Optional(t.String()),
  position_title: t.Optional(t.String()),
  org_unit_name: t.Optional(t.String()),
  department: t.Optional(t.String()),
  candidate_count: t.Optional(t.Number()),
});

const CandidateResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  requisition_id: UuidSchema,
  email: t.String(),
  first_name: t.String(),
  last_name: t.String(),
  phone: t.Union([t.String(), t.Null()]),
  current_stage: CandidateStageSchema,
  source: t.String(),
  resume_url: t.Union([t.String(), t.Null()]),
  linkedin_url: t.Union([t.String(), t.Null()]),
  rating: t.Union([t.Number(), t.Null()]),
  notes: t.Union([t.Any(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  requisition_title: t.Optional(t.String()),
});

const PipelineStageSchema = t.Object({
  stage: t.String(),
  count: t.Number(),
});

// =============================================================================
// Routes
// =============================================================================

export const recruitmentRoutes = new Elysia({ prefix: "/recruitment", name: "recruitment-routes" })

  // Derive services
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new RecruitmentRepository(db);
    const service = new RecruitmentService(db);
    return { recruitmentService: service, recruitmentRepository: repository };
  })

  // ===========================================================================
  // Requisition Routes
  // ===========================================================================

  // GET /requisitions - List requisitions
  .get(
    "/requisitions",
    async (ctx) => {
      const { recruitmentService, query, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const result = await recruitmentService.listRequisitions(tenantContext, {
          cursor: query.cursor,
          limit: query.limit,
          status: query.status,
          hiringManagerId: query.hiringManagerId,
          orgUnitId: query.orgUnitId,
          search: query.search,
        });

        // Also return in the format the frontend expects
        return {
          requisitions: result.items,
          count: result.items.length,
          ...result,
        };
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      query: t.Composite([
        t.Partial(RequisitionFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      detail: {
        tags: ["Recruitment - Requisitions"],
        summary: "List requisitions",
        description: "List job requisitions with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /requisitions/stats - Get requisition statistics
  .get(
    "/requisitions/stats",
    async (ctx) => {
      const { recruitmentService, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        return await recruitmentService.getRequisitionStats(tenantContext);
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      detail: {
        tags: ["Recruitment - Requisitions"],
        summary: "Get requisition statistics",
        description: "Get aggregate statistics for requisitions",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /requisitions/:id - Get requisition by ID
  .get(
    "/requisitions/:id",
    async (ctx) => {
      const { recruitmentService, params, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const requisition = await recruitmentService.getRequisition(tenantContext, params.id);
        if (!requisition) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Requisition not found" },
          });
        }
        return requisition;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      params: IdParamsSchema,
      response: {
        200: RequisitionResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Requisitions"],
        summary: "Get requisition by ID",
        description: "Get a single requisition by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /requisitions/:id/pipeline - Get candidate pipeline for requisition
  .get(
    "/requisitions/:id/pipeline",
    async (ctx) => {
      const { recruitmentService, params, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const pipeline = await recruitmentService.getRequisitionPipeline(tenantContext, params.id);
        return { stages: pipeline };
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({ stages: t.Array(PipelineStageSchema) }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Requisitions"],
        summary: "Get candidate pipeline",
        description: "Get the candidate pipeline stages for a requisition",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /requisitions - Create requisition
  .post(
    "/requisitions",
    async (ctx) => {
      const { recruitmentService, body, tenant, audit, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const requisition = await recruitmentService.createRequisition(tenantContext, body);

        // Audit log
        if (audit) {
          await audit.log({
            action: "recruitment.requisition.created",
            resourceType: "requisition",
            resourceId: requisition.id,
            newValues: requisition,
          });
        }

        return requisition;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      body: CreateRequisitionSchema,
      response: {
        200: RequisitionResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Requisitions"],
        summary: "Create requisition",
        description: "Create a new job requisition",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /requisitions/:id - Update requisition
  .patch(
    "/requisitions/:id",
    async (ctx) => {
      const { recruitmentService, params, body, tenant, audit, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const requisition = await recruitmentService.updateRequisition(tenantContext, params.id, body);
        if (!requisition) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Requisition not found" },
          });
        }

        // Audit log
        if (audit) {
          await audit.log({
            action: "recruitment.requisition.updated",
            resourceType: "requisition",
            resourceId: requisition.id,
            newValues: requisition,
          });
        }

        return requisition;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      body: UpdateRequisitionSchema,
      response: {
        200: RequisitionResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Requisitions"],
        summary: "Update requisition",
        description: "Update an existing requisition",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /requisitions/:id/open - Open requisition
  .post(
    "/requisitions/:id/open",
    async (ctx) => {
      const { recruitmentService, params, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const requisition = await recruitmentService.openRequisition(tenantContext, params.id);
        if (!requisition) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Requisition not found" },
          });
        }
        return requisition;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      response: {
        200: RequisitionResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Requisitions"],
        summary: "Open requisition",
        description: "Transition requisition to open status",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /requisitions/:id/close - Close requisition
  .post(
    "/requisitions/:id/close",
    async (ctx) => {
      const { recruitmentService, params, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const requisition = await recruitmentService.closeRequisition(tenantContext, params.id);
        if (!requisition) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Requisition not found" },
          });
        }
        return requisition;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      response: {
        200: RequisitionResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Requisitions"],
        summary: "Close requisition",
        description: "Transition requisition to filled status",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /requisitions/:id/cancel - Cancel requisition
  .post(
    "/requisitions/:id/cancel",
    async (ctx) => {
      const { recruitmentService, params, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const requisition = await recruitmentService.cancelRequisition(tenantContext, params.id);
        if (!requisition) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Requisition not found" },
          });
        }
        return requisition;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      response: {
        200: RequisitionResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Requisitions"],
        summary: "Cancel requisition",
        description: "Cancel a requisition",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Candidate Routes
  // ===========================================================================

  // GET /candidates - List candidates
  .get(
    "/candidates",
    async (ctx) => {
      const { recruitmentService, query, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const result = await recruitmentService.listCandidates(tenantContext, {
          cursor: query.cursor,
          limit: query.limit,
          requisitionId: query.requisitionId,
          stage: query.stage,
          source: query.source,
          search: query.search,
        });

        return {
          candidates: result.items,
          count: result.items.length,
          ...result,
        };
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      query: t.Composite([
        t.Partial(CandidateFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      detail: {
        tags: ["Recruitment - Candidates"],
        summary: "List candidates",
        description: "List candidates with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /candidates/stats - Get candidate statistics
  .get(
    "/candidates/stats",
    async (ctx) => {
      const { recruitmentService, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        return await recruitmentService.getCandidateStats(tenantContext);
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      detail: {
        tags: ["Recruitment - Candidates"],
        summary: "Get candidate statistics",
        description: "Get aggregate statistics for candidates",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /candidates/:id - Get candidate by ID
  .get(
    "/candidates/:id",
    async (ctx) => {
      const { recruitmentService, params, tenant, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const candidate = await recruitmentService.getCandidate(tenantContext, params.id);
        if (!candidate) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Candidate not found" },
          });
        }
        return candidate;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      params: IdParamsSchema,
      response: {
        200: CandidateResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Candidates"],
        summary: "Get candidate by ID",
        description: "Get a single candidate by their ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /candidates - Create candidate
  .post(
    "/candidates",
    async (ctx) => {
      const { recruitmentService, body, tenant, audit, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const candidate = await recruitmentService.createCandidate(tenantContext, body);

        // Audit log
        if (audit) {
          await audit.log({
            action: "recruitment.candidate.created",
            resourceType: "candidate",
            resourceId: candidate.id,
            newValues: candidate,
          });
        }

        return candidate;
      } catch (err: any) {
        if (err.message.includes("not found") || err.message.includes("not open")) {
          return error(400, {
            error: { code: "VALIDATION_ERROR", message: err.message },
          });
        }
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      body: CreateCandidateSchema,
      response: {
        200: CandidateResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Candidates"],
        summary: "Create candidate",
        description: "Create a new candidate application",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /candidates/:id - Update candidate
  .patch(
    "/candidates/:id",
    async (ctx) => {
      const { recruitmentService, params, body, tenant, audit, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const candidate = await recruitmentService.updateCandidate(tenantContext, params.id, body);
        if (!candidate) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Candidate not found" },
          });
        }

        // Audit log
        if (audit) {
          await audit.log({
            action: "recruitment.candidate.updated",
            resourceType: "candidate",
            resourceId: candidate.id,
            newValues: candidate,
          });
        }

        return candidate;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      body: UpdateCandidateSchema,
      response: {
        200: CandidateResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Candidates"],
        summary: "Update candidate",
        description: "Update an existing candidate",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /candidates/:id/advance - Advance candidate stage
  .post(
    "/candidates/:id/advance",
    async (ctx) => {
      const { recruitmentService, params, body, tenant, audit, error } = ctx as any;
      const tenantContext = { tenantId: tenant?.id, userId: (ctx as any).user?.id };

      try {
        const candidate = await recruitmentService.advanceCandidateStage(
          tenantContext,
          params.id,
          body.newStage,
          body.reason
        );
        if (!candidate) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Candidate not found" },
          });
        }

        // Audit log
        if (audit) {
          await audit.log({
            action: "recruitment.candidate.stage_advanced",
            resourceType: "candidate",
            resourceId: candidate.id,
            newValues: { stage: body.newStage, reason: body.reason },
          });
        }

        return candidate;
      } catch (err: any) {
        if (err.message.includes("terminal state") || err.message.includes("Cannot transition")) {
          return error(400, {
            error: { code: "INVALID_TRANSITION", message: err.message },
          });
        }
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      body: AdvanceCandidateSchema,
      response: {
        200: CandidateResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Recruitment - Candidates"],
        summary: "Advance candidate stage",
        description: "Move a candidate to a new stage in the pipeline",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type RecruitmentRoutes = typeof recruitmentRoutes;
