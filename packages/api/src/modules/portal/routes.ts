/**
 * Portal Routes - Self-service aggregations
 *
 * Provides /me, /my-team, /tasks, /approvals endpoints.
 * All routes delegate to PortalService/PortalRepository for data access.
 */

import { Elysia } from "elysia";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import { ErrorCodes } from "../../plugins/errors";
import { PortalRepository } from "./repository";
import { PortalService } from "./service";

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
      console.error("Portal /me error:", error);
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get profile", requestId: "" } };
    }
  }, { beforeHandle: [requireAuthContext, requireTenantContext], detail: { tags: ["Portal"], summary: "Get my profile" } })

  // My team (direct reports)
  .get("/my-team", async (ctx) => {
    const { user, tenant, portalService, tenantContext, set } = ctx as any;

    try {
      return await portalService.getMyTeam(tenantContext);
    } catch (error) {
      console.error("Portal /my-team error:", error);
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get team", requestId: "" } };
    }
  }, { beforeHandle: [requireAuthContext, requireTenantContext], detail: { tags: ["Portal"], summary: "Get my direct reports" } })

  // My pending tasks
  .get("/tasks", async (ctx) => {
    const { user, tenant, portalService, tenantContext, set } = ctx as any;

    try {
      return await portalService.getMyTasks(tenantContext);
    } catch (error) {
      console.error("Portal /tasks error:", error);
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get tasks", requestId: "" } };
    }
  }, { beforeHandle: [requireAuthContext, requireTenantContext], detail: { tags: ["Portal"], summary: "Get my pending tasks" } })

  // My pending approvals
  .get("/approvals", async (ctx) => {
    const { user, tenant, portalService, tenantContext, set } = ctx as any;

    try {
      return await portalService.getMyApprovals(tenantContext);
    } catch (error) {
      console.error("Portal /approvals error:", error);
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get approvals", requestId: "" } };
    }
  }, { beforeHandle: [requireAuthContext, requireTenantContext], detail: { tags: ["Portal"], summary: "Get my pending approvals" } })

  // Dashboard summary
  .get("/dashboard", async (ctx) => {
    const { user, tenant, portalService, tenantContext, set } = ctx as any;

    try {
      return await portalService.getDashboardSummary(tenantContext);
    } catch (error) {
      console.error("Portal /dashboard error:", error);
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to get dashboard", requestId: "" } };
    }
  }, { beforeHandle: [requireAuthContext, requireTenantContext], detail: { tags: ["Portal"], summary: "Get dashboard summary" } });

export type PortalRoutes = typeof portalRoutes;
