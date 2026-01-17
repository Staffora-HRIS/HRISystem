/**
 * Manager Routes
 *
 * API endpoints for the Manager Portal.
 * Provides team management, approvals, and subordinate access.
 */

import { Elysia, t } from "elysia";
import { ManagerService } from "./manager.service";
import { ApprovalTypeSchema, ApprovalActionSchema } from "./schemas";

export const managerRoutes = new Elysia({ prefix: "/manager" })
  // Get team overview/dashboard
  .get(
    "/overview",
    async (ctx) => {
      const { tenant, user, db, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const service = new ManagerService(db);
      const overview = await service.getTeamOverview({
        tenantId: tenant.id,
        userId: user.id,
      });

      return overview;
    },
    {
      detail: {
        tags: ["Manager"],
        summary: "Get team overview for dashboard",
      },
    }
  )

  // Check if current user is a manager
  .get(
    "/is-manager",
    async (ctx) => {
      const { tenant, user, db, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const service = new ManagerService(db);
      const isManager = await service.isManager({
        tenantId: tenant.id,
        userId: user.id,
      });

      return { isManager };
    },
    {
      detail: {
        tags: ["Manager"],
        summary: "Check if user is a manager",
      },
    }
  )

  // Get direct reports only
  .get(
    "/team",
    async (ctx) => {
      const { tenant, user, db, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const service = new ManagerService(db);
      const team = await service.getDirectReports({
        tenantId: tenant.id,
        userId: user.id,
      });

      return { team };
    },
    {
      detail: {
        tags: ["Manager"],
        summary: "Get direct reports",
      },
    }
  )

  // Get all subordinates (direct and indirect)
  .get(
    "/team/all",
    async (ctx) => {
      const { tenant, user, db, query, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const maxDepth = parseInt(query?.maxDepth ?? "10", 10);

      const service = new ManagerService(db);
      const team = await service.getAllSubordinates(
        { tenantId: tenant.id, userId: user.id },
        maxDepth
      );

      return { team };
    },
    {
      query: t.Object({
        maxDepth: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Manager"],
        summary: "Get all subordinates",
      },
    }
  )

  // Get a specific team member
  .get(
    "/team/:employeeId",
    async (ctx) => {
      const { tenant, user, db, params, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const service = new ManagerService(db);
      const member = await service.getTeamMember(
        { tenantId: tenant.id, userId: user.id },
        params.employeeId
      );

      if (!member) {
        set.status = 404;
        return {
          error: {
            code: "NOT_FOUND",
            message: "Team member not found or not authorized",
            requestId,
          },
        };
      }

      return member;
    },
    {
      params: t.Object({ employeeId: t.String() }),
      detail: {
        tags: ["Manager"],
        summary: "Get team member details",
      },
    }
  )

  // Get pending approvals
  .get(
    "/approvals",
    async (ctx) => {
      const { tenant, user, db, query, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const service = new ManagerService(db);
      const approvals = await service.getPendingApprovals(
        { tenantId: tenant.id, userId: user.id },
        query?.type as any
      );

      return { approvals };
    },
    {
      query: t.Object({
        type: t.Optional(ApprovalTypeSchema),
      }),
      detail: {
        tags: ["Manager"],
        summary: "Get pending approvals",
      },
    }
  )

  // Approve a request
  .post(
    "/approvals/:id/approve",
    async (ctx) => {
      const { tenant, user, db, params, body, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      try {
        const service = new ManagerService(db);
        await service.approveRequest(
          { tenantId: tenant.id, userId: user.id },
          params.id,
          body.type,
          body.comment
        );

        return { success: true };
      } catch (error: any) {
        if (error.name === "ManagerAccessError") {
          set.status = 403;
          return {
            error: {
              code: "FORBIDDEN",
              message: error.message,
              requestId,
            },
          };
        }
        throw error;
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        type: ApprovalTypeSchema,
        comment: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Manager"],
        summary: "Approve a request",
      },
    }
  )

  // Reject a request
  .post(
    "/approvals/:id/reject",
    async (ctx) => {
      const { tenant, user, db, params, body, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      try {
        const service = new ManagerService(db);
        await service.rejectRequest(
          { tenantId: tenant.id, userId: user.id },
          params.id,
          body.type,
          body.comment
        );

        return { success: true };
      } catch (error: any) {
        if (error.name === "ManagerAccessError") {
          set.status = 403;
          return {
            error: {
              code: "FORBIDDEN",
              message: error.message,
              requestId,
            },
          };
        }
        throw error;
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        type: ApprovalTypeSchema,
        comment: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Manager"],
        summary: "Reject a request",
      },
    }
  )

  // Get team absence calendar
  .get(
    "/absence/calendar",
    async (ctx) => {
      const { tenant, user, db, query, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      // Default to current month if not specified
      const now = new Date();
      const startDate =
        query?.startDate ??
        new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const endDate =
        query?.endDate ??
        new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

      const service = new ManagerService(db);
      const entries = await service.getTeamAbsenceCalendar(
        { tenantId: tenant.id, userId: user.id },
        startDate,
        endDate
      );

      return { entries };
    },
    {
      query: t.Object({
        startDate: t.Optional(t.String()),
        endDate: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Manager"],
        summary: "Get team absence calendar",
      },
    }
  )

  // Check if employee is a subordinate
  .get(
    "/team/:employeeId/is-subordinate",
    async (ctx) => {
      const { tenant, user, db, params, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const service = new ManagerService(db);
      const isSubordinate = await service.isSubordinateOf(
        { tenantId: tenant.id, userId: user.id },
        params.employeeId
      );

      return { isSubordinate };
    },
    {
      params: t.Object({ employeeId: t.String() }),
      detail: {
        tags: ["Manager"],
        summary: "Check if employee is a subordinate",
      },
    }
  );

export type ManagerRoutes = typeof managerRoutes;
