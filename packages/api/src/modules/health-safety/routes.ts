/**
 * Health & Safety Module - Elysia Routes
 *
 * Defines the API endpoints for Health & Safety operations.
 * All routes require authentication and appropriate permissions.
 *
 * UK statutory compliance:
 * - Accident book (hs_incidents)
 * - RIDDOR reporting
 * - Risk assessments
 * - DSE assessments
 *
 * Permission model:
 * - health_safety:incidents: read, write
 * - health_safety:risk_assessments: read, write
 * - health_safety:dse_assessments: read, write
 * - health_safety:dashboard: read
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { HealthSafetyRepository } from "./repository";
import { HealthSafetyService } from "./service";
import {
  CreateIncidentSchema,
  UpdateIncidentSchema,
  IncidentFiltersSchema,
  IncidentResponseSchema,
  CreateRiskAssessmentSchema,
  UpdateRiskAssessmentSchema,
  RiskAssessmentFiltersSchema,
  RiskAssessmentResponseSchema,
  CreateDSEAssessmentSchema,
  DSEAssessmentFiltersSchema,
  DSEAssessmentResponseSchema,
  DashboardResponseSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateIncident,
  type UpdateIncident,
  type CreateRiskAssessment,
  type UpdateRiskAssessment,
  type CreateDSEAssessment,
  type UpdateDSEAssessment,
  type IncidentFilters,
  type RiskAssessmentFilters,
  type DSEAssessmentFilters,
} from "./schemas";

const UuidSchema = t.String({ format: "uuid" });

// =============================================================================
// Context types (injected by plugins + derive)
// =============================================================================

interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
}

interface DerivedContext {
  hsService: HealthSafetyService;
  tenantContext: { tenantId: string; userId: string | undefined };
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
}

// =============================================================================
// Module-specific error code overrides
// =============================================================================

const HS_ERROR_CODES: Record<string, number> = {
  RIDDOR_REFERENCE_REQUIRED: 400,
  INVALID_TRANSITION: 409,
};

// =============================================================================
// Routes
// =============================================================================

export const healthSafetyRoutes = new Elysia({ prefix: "/health-safety" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new HealthSafetyRepository(db);
    const service = new HealthSafetyService(repository, db);

    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { hsService: service, tenantContext };
  })

  // ===========================================================================
  // Dashboard
  // ===========================================================================

  .get("/dashboard", async (ctx) => {
    const { hsService, tenantContext, set } = ctx as unknown as DerivedContext;

    const result = await hsService.getDashboard(tenantContext);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, HS_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    response: {
      200: DashboardResponseSchema,
      500: ErrorResponseSchema,
    },
    beforeHandle: [requirePermission("health_safety", "read")],
    detail: {
      tags: ["Health & Safety"],
      summary: "Get H&S dashboard statistics",
      description: "Returns aggregated counts of open incidents, overdue risk reviews, RIDDOR reports, etc.",
    },
  })

  // ===========================================================================
  // RIDDOR Reports
  // ===========================================================================

  .get("/riddor-reports", async (ctx) => {
    const { hsService, tenantContext, query } = ctx as unknown as DerivedContext;
    const { cursor, limit } = query;

    const result = await hsService.getRIDDORReports(
      tenantContext,
      { cursor: cursor as string | undefined, limit: limit !== undefined ? Number(limit) : undefined }
    );

    return {
      items: result.items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }, {
    query: PaginationQuerySchema,
    response: {
      200: t.Object({
        items: t.Array(IncidentResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
    },
    beforeHandle: [requirePermission("health_safety", "read")],
    detail: {
      tags: ["Health & Safety"],
      summary: "List RIDDOR-reportable incidents",
      description: "Returns all incidents flagged as RIDDOR-reportable under the Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013.",
    },
  })

  // ===========================================================================
  // Incidents
  // ===========================================================================

  .get("/incidents", async (ctx) => {
    const { hsService, tenantContext, query } = ctx as unknown as DerivedContext;
    const { cursor, limit, ...filters } = query;

    const result = await hsService.listIncidents(
      tenantContext,
      filters as unknown as IncidentFilters,
      { cursor: cursor as string | undefined, limit: limit !== undefined ? Number(limit) : undefined }
    );

    return {
      items: result.items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }, {
    query: t.Intersect([
      PaginationQuerySchema,
      IncidentFiltersSchema,
    ]),
    response: {
      200: t.Object({
        items: t.Array(IncidentResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
    },
    beforeHandle: [requirePermission("health_safety", "read")],
    detail: {
      tags: ["Health & Safety"],
      summary: "List incidents",
      description: "List workplace incidents (accident book). Supports filtering by status, severity, RIDDOR flag, date range, and search.",
    },
  })

  .post("/incidents", async (ctx) => {
    const { hsService, tenantContext, body, set } = ctx as unknown as DerivedContext;

    const result = await hsService.reportIncident(
      tenantContext,
      body as CreateIncident
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, HS_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    body: CreateIncidentSchema,
    headers: OptionalIdempotencyHeaderSchema,
    response: {
      201: IncidentResponseSchema,
      400: ErrorResponseSchema,
      409: ErrorResponseSchema,
    },
    beforeHandle: [requirePermission("health_safety", "write")],
    detail: {
      tags: ["Health & Safety"],
      summary: "Report a new incident",
      description: "Record a workplace accident, injury, near-miss, or dangerous occurrence. Fatal and major severity incidents are automatically flagged as RIDDOR-reportable.",
    },
  })

  .get("/incidents/:id", async (ctx) => {
    const { hsService, tenantContext, params, set } = ctx as unknown as DerivedContext;

    const result = await hsService.getIncident(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, HS_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: IdParamsSchema,
    response: {
      200: IncidentResponseSchema,
      404: ErrorResponseSchema,
    },
    beforeHandle: [requirePermission("health_safety", "read")],
    detail: {
      tags: ["Health & Safety"],
      summary: "Get incident details",
      description: "Retrieve a single incident record by ID.",
    },
  })

  .patch("/incidents/:id", async (ctx) => {
    const { hsService, tenantContext, params, body, set } = ctx as unknown as DerivedContext;

    const result = await hsService.updateIncident(
      tenantContext,
      params.id,
      body as UpdateIncident
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, HS_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: IdParamsSchema,
    body: UpdateIncidentSchema,
    headers: OptionalIdempotencyHeaderSchema,
    response: {
      200: IncidentResponseSchema,
      400: ErrorResponseSchema,
      404: ErrorResponseSchema,
      409: ErrorResponseSchema,
    },
    beforeHandle: [requirePermission("health_safety", "write")],
    detail: {
      tags: ["Health & Safety"],
      summary: "Update an incident",
      description: "Update incident details, investigation findings, corrective actions, status, or RIDDOR reporting details. Enforces state machine transitions.",
    },
  })

  .post("/incidents/:id/close", async (ctx) => {
    const { hsService, tenantContext, params, set } = ctx as unknown as DerivedContext;

    const result = await hsService.closeIncident(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, HS_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: IdParamsSchema,
    headers: OptionalIdempotencyHeaderSchema,
    response: {
      200: IncidentResponseSchema,
      404: ErrorResponseSchema,
      409: ErrorResponseSchema,
    },
    beforeHandle: [requirePermission("health_safety", "write")],
    detail: {
      tags: ["Health & Safety"],
      summary: "Close an incident",
      description: "Close a resolved incident. Only incidents in 'resolved' status can be closed.",
    },
  })

  // ===========================================================================
  // Risk Assessments
  // ===========================================================================

  .get("/risk-assessments", async (ctx) => {
    const { hsService, tenantContext, query } = ctx as unknown as DerivedContext;
    const { cursor, limit, ...filters } = query;

    const result = await hsService.listRiskAssessments(
      tenantContext,
      filters as unknown as RiskAssessmentFilters,
      { cursor: cursor as string | undefined, limit: limit !== undefined ? Number(limit) : undefined }
    );

    return {
      items: result.items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }, {
    query: t.Intersect([
      PaginationQuerySchema,
      RiskAssessmentFiltersSchema,
    ]),
    response: {
      200: t.Object({
        items: t.Array(RiskAssessmentResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
    },
    beforeHandle: [requirePermission("health_safety", "read")],
    detail: {
      tags: ["Health & Safety"],
      summary: "List risk assessments",
      description: "List risk assessments. Supports filtering by status, risk level, assessor, overdue flag, and search.",
    },
  })

  .post("/risk-assessments", async (ctx) => {
    const { hsService, tenantContext, body, set } = ctx as unknown as DerivedContext;

    const result = await hsService.createRiskAssessment(
      tenantContext,
      body as CreateRiskAssessment
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, HS_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    body: CreateRiskAssessmentSchema,
    headers: OptionalIdempotencyHeaderSchema,
    response: {
      201: RiskAssessmentResponseSchema,
      400: ErrorResponseSchema,
    },
    beforeHandle: [requirePermission("health_safety", "write")],
    detail: {
      tags: ["Health & Safety"],
      summary: "Create a risk assessment",
      description: "Create a new risk assessment with hazard matrix. Required for employers with 5+ employees under UK law.",
    },
  })

  .get("/risk-assessments/:id", async (ctx) => {
    const { hsService, tenantContext, params, set } = ctx as unknown as DerivedContext;

    const result = await hsService.getRiskAssessment(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, HS_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: IdParamsSchema,
    response: {
      200: RiskAssessmentResponseSchema,
      404: ErrorResponseSchema,
    },
    beforeHandle: [requirePermission("health_safety", "read")],
    detail: {
      tags: ["Health & Safety"],
      summary: "Get risk assessment details",
      description: "Retrieve a single risk assessment by ID, including hazard matrix.",
    },
  })

  .patch("/risk-assessments/:id", async (ctx) => {
    const { hsService, tenantContext, params, body, set } = ctx as unknown as DerivedContext;

    const result = await hsService.updateRiskAssessment(
      tenantContext,
      params.id,
      body as UpdateRiskAssessment
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, HS_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: IdParamsSchema,
    body: UpdateRiskAssessmentSchema,
    headers: OptionalIdempotencyHeaderSchema,
    response: {
      200: RiskAssessmentResponseSchema,
      400: ErrorResponseSchema,
      404: ErrorResponseSchema,
      409: ErrorResponseSchema,
    },
    beforeHandle: [requirePermission("health_safety", "write")],
    detail: {
      tags: ["Health & Safety"],
      summary: "Update a risk assessment",
      description: "Update risk assessment details, hazard matrix, status, or risk level. Enforces state machine transitions.",
    },
  })

  .post("/risk-assessments/:id/approve", async (ctx) => {
    const { hsService, tenantContext, params, body, set } = ctx as unknown as DerivedContext;
    const { approver_employee_id } = body as { approver_employee_id: string };

    const result = await hsService.approveRiskAssessment(
      tenantContext,
      params.id,
      approver_employee_id
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, HS_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: IdParamsSchema,
    body: t.Object({
      approver_employee_id: UuidSchema,
    }),
    headers: OptionalIdempotencyHeaderSchema,
    response: {
      200: RiskAssessmentResponseSchema,
      404: ErrorResponseSchema,
      409: ErrorResponseSchema,
    },
    beforeHandle: [requirePermission("health_safety", "write")],
    detail: {
      tags: ["Health & Safety"],
      summary: "Approve a risk assessment",
      description: "Approve a draft or review_due risk assessment. Sets status to 'active' and records the approver.",
    },
  })

  // ===========================================================================
  // DSE Assessments
  // ===========================================================================

  .get("/dse-assessments", async (ctx) => {
    const { hsService, tenantContext, query } = ctx as unknown as DerivedContext;
    const { cursor, limit, ...filters } = query;

    const result = await hsService.listDSEAssessments(
      tenantContext,
      filters as unknown as DSEAssessmentFilters,
      { cursor: cursor as string | undefined, limit: limit !== undefined ? Number(limit) : undefined }
    );

    return {
      items: result.items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }, {
    query: t.Intersect([
      PaginationQuerySchema,
      DSEAssessmentFiltersSchema,
    ]),
    response: {
      200: t.Object({
        items: t.Array(DSEAssessmentResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
    },
    beforeHandle: [requirePermission("health_safety", "read")],
    detail: {
      tags: ["Health & Safety"],
      summary: "List DSE assessments",
      description: "List Display Screen Equipment assessments. Supports filtering by employee, status, and overdue reviews.",
    },
  })

  .post("/dse-assessments", async (ctx) => {
    const { hsService, tenantContext, body, set } = ctx as unknown as DerivedContext;

    const result = await hsService.createDSEAssessment(
      tenantContext,
      body as CreateDSEAssessment
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, HS_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    body: CreateDSEAssessmentSchema,
    headers: OptionalIdempotencyHeaderSchema,
    response: {
      201: DSEAssessmentResponseSchema,
      400: ErrorResponseSchema,
    },
    beforeHandle: [requirePermission("health_safety", "write")],
    detail: {
      tags: ["Health & Safety"],
      summary: "Create a DSE assessment",
      description: "Create a Display Screen Equipment assessment for an employee. Required under the Health and Safety (DSE) Regulations 1992 for habitual VDU users.",
    },
  })

  .get("/dse-assessments/:id", async (ctx) => {
    const { hsService, tenantContext, params, set } = ctx as unknown as DerivedContext;

    const result = await hsService.getDSEAssessment(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error!.code, HS_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: IdParamsSchema,
    response: {
      200: DSEAssessmentResponseSchema,
      404: ErrorResponseSchema,
    },
    beforeHandle: [requirePermission("health_safety", "read")],
    detail: {
      tags: ["Health & Safety"],
      summary: "Get DSE assessment details",
      description: "Retrieve a single DSE assessment by ID.",
    },
  })

  .get("/dse-assessments/employee/:employeeId", async (ctx) => {
    const { hsService, tenantContext, params, query } = ctx as unknown as DerivedContext & { params: { employeeId: string } };
    const { cursor, limit } = query;

    const result = await hsService.getDSEAssessmentsByEmployee(
      tenantContext,
      params.employeeId,
      { cursor: cursor as string | undefined, limit: limit !== undefined ? Number(limit) : undefined }
    );

    return {
      items: result.items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }, {
    params: t.Object({
      employeeId: UuidSchema,
    }),
    query: PaginationQuerySchema,
    response: {
      200: t.Object({
        items: t.Array(DSEAssessmentResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
    },
    beforeHandle: [requirePermission("health_safety", "read")],
    detail: {
      tags: ["Health & Safety"],
      summary: "Get DSE assessments for an employee",
      description: "Retrieve all DSE assessments for a specific employee, ordered by assessment date.",
    },
  });

export type HealthSafetyRoutes = typeof healthSafetyRoutes;
