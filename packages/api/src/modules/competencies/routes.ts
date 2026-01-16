/**
 * Competencies Module - API Routes
 *
 * Elysia routes for competency management.
 */

import { Elysia, t } from "elysia";
import { CompetenciesService } from "./service";
import { CompetenciesRepository } from "./repository";
import {
  CreateCompetencySchema,
  UpdateCompetencySchema,
  CreateJobCompetencySchema,
  UpdateJobCompetencySchema,
  CreateEmployeeCompetencySchema,
  UpdateEmployeeCompetencySchema,
} from "./schemas";

// =============================================================================
// Routes
// =============================================================================

export const competenciesRoutes = new Elysia({ prefix: "/competencies" })
  // Derive service
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new CompetenciesRepository(db);
    const service = new CompetenciesService(db);

    return { competenciesService: service, competenciesRepository: repository };
  })

  // ===========================================================================
  // Competency Library Routes
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { competenciesService, query, tenantContext } = ctx as any;
      const result = await competenciesService.listCompetencies(
        tenantContext,
        {
          category: query.category,
          is_active: query.is_active === "true" ? true : query.is_active === "false" ? false : undefined,
          search: query.search,
        },
        {
          cursor: query.cursor,
          limit: query.limit ? Number(query.limit) : undefined,
        }
      );

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return result.data;
    },
    {
      query: t.Object({
        category: t.Optional(t.String()),
        is_active: t.Optional(t.String()),
        search: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/:id",
    async (ctx) => {
      const { competenciesService, params, tenantContext } = ctx as any;
      const result = await competenciesService.getCompetency(tenantContext, params.id);

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return result.data;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  .post(
    "/",
    async (ctx) => {
      const { competenciesService, body, tenantContext } = ctx as any;
      const result = await competenciesService.createCompetency(tenantContext, body);

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return result.data;
    },
    {
      body: CreateCompetencySchema,
    }
  )
  .patch(
    "/:id",
    async (ctx) => {
      const { competenciesService, params, body, tenantContext } = ctx as any;
      const result = await competenciesService.updateCompetency(tenantContext, params.id, body);

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return result.data;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: UpdateCompetencySchema,
    }
  )
  .delete(
    "/:id",
    async (ctx) => {
      const { competenciesService, params, tenantContext } = ctx as any;
      const result = await competenciesService.deleteCompetency(tenantContext, params.id);

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return { success: true };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  // ===========================================================================
  // Job Competency Routes
  // ===========================================================================
  .get(
    "/jobs/:jobId",
    async (ctx) => {
      const { competenciesService, params, tenantContext } = ctx as any;
      const result = await competenciesService.listJobCompetencies(tenantContext, params.jobId);

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return result.data;
    },
    {
      params: t.Object({
        jobId: t.String(),
      }),
    }
  )
  .post(
    "/jobs",
    async (ctx) => {
      const { competenciesService, body, tenantContext } = ctx as any;
      const result = await competenciesService.addJobCompetency(tenantContext, body);

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return result.data;
    },
    {
      body: CreateJobCompetencySchema,
    }
  )
  .patch(
    "/jobs/:id",
    async (ctx) => {
      const { competenciesService, params, body, tenantContext } = ctx as any;
      const result = await competenciesService.updateJobCompetency(tenantContext, params.id, body);

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return { success: true };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: UpdateJobCompetencySchema,
    }
  )
  .delete(
    "/jobs/:id",
    async (ctx) => {
      const { competenciesService, params, tenantContext } = ctx as any;
      const result = await competenciesService.removeJobCompetency(tenantContext, params.id);

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return { success: true };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  // ===========================================================================
  // Employee Competency Routes
  // ===========================================================================
  .get(
    "/employees/:employeeId",
    async (ctx) => {
      const { competenciesService, params, tenantContext } = ctx as any;
      const result = await competenciesService.listEmployeeCompetencies(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return result.data;
    },
    {
      params: t.Object({
        employeeId: t.String(),
      }),
    }
  )
  .get(
    "/employees/:employeeId/gaps",
    async (ctx) => {
      const { competenciesService, params, tenantContext } = ctx as any;
      const result = await competenciesService.getCompetencyGaps(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return result.data;
    },
    {
      params: t.Object({
        employeeId: t.String(),
      }),
    }
  )
  .post(
    "/employees",
    async (ctx) => {
      const { competenciesService, body, tenantContext } = ctx as any;
      const result = await competenciesService.assessEmployeeCompetency(tenantContext, body);

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return result.data;
    },
    {
      body: CreateEmployeeCompetencySchema,
    }
  )
  .patch(
    "/employees/assessments/:id",
    async (ctx) => {
      const { competenciesService, params, body, tenantContext } = ctx as any;
      const result = await competenciesService.updateEmployeeCompetency(
        tenantContext,
        params.id,
        body
      );

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return result.data;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: UpdateEmployeeCompetencySchema,
    }
  )

  // ===========================================================================
  // Analytics Routes
  // ===========================================================================
  .get(
    "/due-assessments",
    async (ctx) => {
      const { competenciesService, query, tenantContext } = ctx as any;
      const daysAhead = query.days_ahead ? Number(query.days_ahead) : 30;
      const result = await competenciesService.getAssessmentsDue(
        tenantContext,
        daysAhead
      );

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return result.data;
    },
    {
      query: t.Object({
        days_ahead: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/team/:managerId",
    async (ctx) => {
      const { competenciesService, params, tenantContext } = ctx as any;
      const result = await competenciesService.getTeamOverview(tenantContext, params.managerId);

      if (!result.success) {
        throw new Error(result.error?.message);
      }

      return result.data;
    },
    {
      params: t.Object({
        managerId: t.String(),
      }),
    }
  );
