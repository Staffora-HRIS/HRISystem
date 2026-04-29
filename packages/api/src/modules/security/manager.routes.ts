/**
 * Manager Routes
 *
 * API endpoints for the Manager Portal.
 * Provides team management, approvals, and subordinate access.
 */

import { Elysia, t } from "elysia";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import { ErrorCodes } from "../../plugins/errors";
import { ManagerService } from "./manager.service";
import { ApprovalTypeSchema, TeamTrainingQuerySchema } from "./manager.schemas";

export const managerRoutes = new Elysia({ prefix: "/manager" })
  // Get team overview/dashboard
  .get(
    "/overview",
    async (ctx) => {
      const { tenant, user, db } = ctx as any;


      const service = new ManagerService(db);
      const overview = await service.getTeamOverview({
        tenantId: tenant.id,
        userId: user.id,
      });

      return overview;
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
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
      const { tenant, user, db } = ctx as any;


      const service = new ManagerService(db);
      const isManager = await service.isManager({
        tenantId: tenant.id,
        userId: user.id,
      });

      return { isManager };
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
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
      const { tenant, user, db } = ctx as any;


      const service = new ManagerService(db);
      const team = await service.getDirectReports({
        tenantId: tenant.id,
        userId: user.id,
      });

      return { team };
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
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
      const { tenant, user, db, query } = ctx as any;


      const maxDepth = parseInt(query?.maxDepth ?? "10", 10);

      const service = new ManagerService(db);
      const team = await service.getAllSubordinates(
        { tenantId: tenant.id, userId: user.id },
        maxDepth
      );

      return { team };
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
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


      const service = new ManagerService(db);
      const member = await service.getTeamMember(
        { tenantId: tenant.id, userId: user.id },
        params.employeeId
      );

      if (!member) {
        set.status = 404;
        return {
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Team member not found or not authorized",
            requestId,
          },
        };
      }

      return member;
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
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
      const { tenant, user, db, query } = ctx as any;


      const service = new ManagerService(db);
      const approvals = await service.getPendingApprovals(
        { tenantId: tenant.id, userId: user.id },
        query?.type as any
      );

      return { approvals };
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
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
              code: ErrorCodes.FORBIDDEN,
              message: error.message,
              requestId,
            },
          };
        }
        throw error;
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
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
              code: ErrorCodes.FORBIDDEN,
              message: error.message,
              requestId,
            },
          };
        }
        throw error;
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
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

  // Bulk approve/reject requests
  .post(
    "/approvals/bulk",
    async (ctx) => {
      const { tenant, user, db, body, set, requestId } = ctx as any;

      try {
        const service = new ManagerService(db);
        const result = await service.bulkApproveRequests(
          { tenantId: tenant.id, userId: user.id },
          body.items
        );

        return result;
      } catch (error: any) {
        if (error.name === "ManagerAccessError") {
          set.status = 403;
          return {
            error: {
              code: ErrorCodes.FORBIDDEN,
              message: error.message,
              requestId,
            },
          };
        }
        throw error;
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      body: t.Object({
        items: t.Array(
          t.Object({
            type: t.Union([t.Literal("leave_request"), t.Literal("timesheet")]),
            id: t.String({ format: "uuid" }),
            action: t.Union([t.Literal("approve"), t.Literal("reject")]),
            notes: t.Optional(t.String({ maxLength: 1000 })),
          }),
          { minItems: 1, maxItems: 50 }
        ),
      }),
      detail: {
        tags: ["Manager"],
        summary: "Bulk approve or reject requests",
        description:
          "Process multiple leave requests and timesheets in a single call. Each item is processed independently; partial success is possible.",
      },
    }
  )

  // Get team absence calendar
  .get(
    "/absence/calendar",
    async (ctx) => {
      const { tenant, user, db, query } = ctx as any;


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
      beforeHandle: [requireAuthContext, requireTenantContext],
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
      const { tenant, user, db, params } = ctx as any;


      const service = new ManagerService(db);
      const isSubordinate = await service.isSubordinateOf(
        { tenantId: tenant.id, userId: user.id },
        params.employeeId
      );

      return { isSubordinate };
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      params: t.Object({ employeeId: t.String() }),
      detail: {
        tags: ["Manager"],
        summary: "Check if employee is a subordinate",
      },
    }
  )

  // =========================================================================
  // Team Training (TODO-207)
  // =========================================================================

  // Get team training overview for direct reports
  .get(
    "/team-training",
    async (ctx) => {
      const { tenant, user, db, query, set, requestId } = ctx as any;

      try {
        const service = new ManagerService(db);
        const filter = query?.filter || "all";
        const result = await service.getTeamTrainingOverview(
          { tenantId: tenant.id, userId: user.id },
          filter
        );

        return result;
      } catch (error: any) {
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to fetch team training overview",
            requestId,
          },
        };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      query: TeamTrainingQuerySchema,
      detail: {
        tags: ["Manager"],
        summary: "Get team training overview",
        description:
          "Returns training status for each direct report: completed courses, " +
          "in-progress courses, overdue mandatory training, and total training hours. " +
          "Supports filtering by all, overdue, or in_progress.",
      },
    }
  )

  // Get detailed training for a specific team member
  .get(
    "/team-training/:employeeId",
    async (ctx) => {
      const { tenant, user, db, params, set, requestId } = ctx as any;

      try {
        const service = new ManagerService(db);
        const result = await service.getTeamMemberTraining(
          { tenantId: tenant.id, userId: user.id },
          params.employeeId
        );

        if (!result) {
          set.status = 404;
          return {
            error: {
              code: ErrorCodes.NOT_FOUND,
              message: "Employee not found or not a direct report",
              requestId,
            },
          };
        }

        return result;
      } catch (error: any) {
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to fetch team member training details",
            requestId,
          },
        };
      }
    },
    {
      beforeHandle: [requireAuthContext, requireTenantContext],
      params: t.Object({ employeeId: t.String({ format: "uuid" }) }),
      detail: {
        tags: ["Manager"],
        summary: "Get detailed training for a team member",
        description:
          "Returns full training details for a specific direct report including " +
          "all enrollments, completion status, overdue mandatory training, and total hours.",
      },
    }
  );

export type ManagerRoutes = typeof managerRoutes;
