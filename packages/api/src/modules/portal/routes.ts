/**
 * Portal Routes - Self-service aggregations
 *
 * Provides /me, /my-team, /tasks, /approvals, /org-chart endpoints.
 * All routes delegate to PortalService/PortalRepository for data access.
 */

import { Elysia } from "elysia";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import { ErrorCodes } from "../../plugins/errors";
import { logger } from "../../lib/logger";
import { PortalRepository } from "./repository";
import { PortalService } from "./service";
import {
  OrgChartQuerySchema,
  OrgChartResponseSchema,
  OrgChartTeamParamsSchema,
  OrgChartTeamResponseSchema,
} from "./schemas";

export const portalRoutes = new Elysia({ prefix: "/portal" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new PortalRepository(db);
    const service = new PortalService(repository);

    const { tenant, user } = ctx as any;
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { portalService: service, tenantContext };
  })

  // My profile and dashboard
  .get("/me", async (ctx) => {
    const { user, tenant, portalService, tenantContext, set } = ctx as any;

    try {
      return await portalService.getMyProfile(tenantContext, user, tenant);
    } catch (error) {
      logger.error({ err: error, module: "portal", route: "/me" }, "Portal /me error");
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get profile", requestId: "" } };
    }
  }, { beforeHandle: [requireAuthContext, requireTenantContext], detail: { tags: ["Portal"], summary: "Get my profile" } })

  // My team (direct reports)
  .get("/my-team", async (ctx) => {
    const { portalService, tenantContext, set } = ctx as any;

    try {
      return await portalService.getMyTeam(tenantContext);
    } catch (error) {
      logger.error({ err: error, module: "portal", route: "/my-team" }, "Portal /my-team error");
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get team", requestId: "" } };
    }
  }, { beforeHandle: [requireAuthContext, requireTenantContext], detail: { tags: ["Portal"], summary: "Get my direct reports" } })

  // My pending tasks
  .get("/tasks", async (ctx) => {
    const { portalService, tenantContext, set } = ctx as any;

    try {
      return await portalService.getMyTasks(tenantContext);
    } catch (error) {
      logger.error({ err: error, module: "portal", route: "/tasks" }, "Portal /tasks error");
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get tasks", requestId: "" } };
    }
  }, { beforeHandle: [requireAuthContext, requireTenantContext], detail: { tags: ["Portal"], summary: "Get my pending tasks" } })

  // My pending approvals
  .get("/approvals", async (ctx) => {
    const { portalService, tenantContext, set } = ctx as any;

    try {
      return await portalService.getMyApprovals(tenantContext);
    } catch (error) {
      logger.error({ err: error, module: "portal", route: "/approvals" }, "Portal /approvals error");
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get approvals", requestId: "" } };
    }
  }, { beforeHandle: [requireAuthContext, requireTenantContext], detail: { tags: ["Portal"], summary: "Get my pending approvals" } })

  // Employee directory search
  .get("/directory", async (ctx) => {
    const { portalService, tenantContext, query, set } = ctx as any;

    try {
      const { cursor, limit, search, departmentId, locationId } = query || {};
      return await portalService.searchDirectory(
        tenantContext,
        { search, departmentId, locationId },
        { cursor, limit: limit ? Number(limit) : undefined }
      );
    } catch (error: any) {
      logger.error({ err: error, module: "portal", route: "/directory" }, "Portal /directory error");
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to search directory", requestId: "" } };
    }
  }, {
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: {
      tags: ["Portal"],
      summary: "Search employee directory",
      description: "Search and browse active employees by name, department, or position. Returns basic contact info visible to all authenticated users.",
    },
  })

  // Department list for directory filtering
  .get("/directory/departments", async (ctx) => {
    const { portalService, tenantContext, set } = ctx as any;

    try {
      return await portalService.getDepartments(tenantContext);
    } catch (error: any) {
      logger.error({ err: error, module: "portal", route: "/directory/departments" }, "Portal /directory/departments error");
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get departments", requestId: "" } };
    }
  }, {
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: {
      tags: ["Portal"],
      summary: "List departments for directory",
      description: "Get list of active departments with employee counts for directory filtering.",
    },
  })

  // Dashboard summary
  .get("/dashboard", async (ctx) => {
    const { portalService, tenantContext, set } = ctx as any;

    try {
      return await portalService.getDashboardSummary(tenantContext);
    } catch (error) {
      logger.error({ err: error, module: "portal", route: "/dashboard" }, "Portal /dashboard error");
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get dashboard", requestId: "" } };
    }
  }, { beforeHandle: [requireAuthContext, requireTenantContext], detail: { tags: ["Portal"], summary: "Get dashboard summary" } })

  // ==========================================================================
  // Org Chart (TODO-160)
  // ==========================================================================

  .get("/org-chart", async (ctx) => {
    const { portalService, tenantContext, query, set } = ctx as any;
    try {
      const rootEmployeeId = query?.rootEmployeeId || null;
      const depth = query?.depth ? Number(query.depth) : 3;
      return await portalService.getOrgChart(tenantContext, rootEmployeeId, depth);
    } catch (error: any) {
      logger.error({ err: error, module: "portal", route: "/org-chart" }, "Portal /org-chart error");
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get org chart", requestId: "" } };
    }
  }, {
    beforeHandle: [requireAuthContext, requireTenantContext],
    query: OrgChartQuerySchema,
    response: { 200: OrgChartResponseSchema },
    detail: {
      tags: ["Portal"],
      summary: "Get organisation chart",
      description: "Returns a hierarchical tree of employees based on reporting lines. Optionally specify a root employee to view a subtree, and a depth to limit levels (max 10, default 3). Only active employees are included.",
    },
  })

  .get("/org-chart/:employeeId/team", async (ctx) => {
    const { portalService, tenantContext, params, set } = ctx as any;
    try {
      const result = await portalService.getTeam(tenantContext, params.employeeId);
      if (!result) {
        set.status = 404;
        return { error: { code: ErrorCodes.NOT_FOUND, message: "Employee not found or is not active", requestId: "" } };
      }
      return result;
    } catch (error: any) {
      logger.error({ err: error, module: "portal", route: "/org-chart/team" }, "Portal org-chart team error");
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get team", requestId: "" } };
    }
  }, {
    beforeHandle: [requireAuthContext, requireTenantContext],
    params: OrgChartTeamParamsSchema,
    response: { 200: OrgChartTeamResponseSchema },
    detail: {
      tags: ["Portal"],
      summary: "Get direct reports for an employee",
      description: "Returns a specific employee (the manager) and their direct reports. Each direct report includes a count of their own reports. Only active employees are included.",
    },
  });

export type PortalRoutes = typeof portalRoutes;
