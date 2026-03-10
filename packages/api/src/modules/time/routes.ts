/**
 * Time & Attendance Routes
 *
 * Elysia routes for time tracking endpoints.
 */

import { Elysia } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { TimeRepository } from "./repository";
import { TimeService } from "./service";
import {
  CreateTimeEventSchema,
  TimeEventFiltersSchema,
  CreateScheduleSchema,
  UpdateScheduleSchema,
  CreateShiftSchema,
  UpdateShiftSchema,
  CreateTimesheetSchema,
  UpdateTimesheetSchema,
  TimesheetFiltersSchema,
  TimesheetApprovalSchema,
  IdParamsSchema,
  IdempotencyHeaderSchema,
} from "./schemas";

export const timeRoutes = new Elysia({ prefix: "/time" })
  .derive((ctx) => {
    const { db } = ctx as any;
    const repo = new TimeRepository(db);
    const service = new TimeService(repo);
    return { timeService: service };
  })

  // ===========================================================================
  // Time Events
  // ===========================================================================

  .post(
    "/events",
    async (ctx) => {
      const { timeService, tenant, user, body, set } = ctx as any;

      const result = await timeService.createTimeEvent(
        { tenantId: tenant.id, userId: user.id },
        body as any
      );

      if (!result.success) {
        set.status = result.error?.code === "INVALID_TIME_SEQUENCE" ? 400 : 500;
        return { error: { ...result.error, requestId: "" } };
      }

      set.status = 201;
      return result.data;
    },
    {
      body: CreateTimeEventSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("time", "write")],
      detail: { tags: ["Time"], summary: "Record time event" },
    }
  )

  .get(
    "/events",
    async (ctx) => {
      const { timeService, tenant, user, query, set } = ctx as any;

      const result = await timeService.getTimeEvents(
        { tenantId: tenant.id, userId: user.id },
        query
      );

      if (!result.success) {
        set.status = 500;
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      query: TimeEventFiltersSchema,
      beforeHandle: [requirePermission("time", "read")],
      detail: { tags: ["Time"], summary: "List time events" },
    }
  )

  .get(
    "/events/:id",
    async (ctx) => {
      const { timeService, tenant, user, params, set } = ctx as any;

      const result = await timeService.getTimeEventById(
        { tenantId: tenant.id, userId: user.id },
        params.id
      );

      if (!result.success) {
        set.status = result.error?.code === "TIME_EVENT_NOT_FOUND" ? 404 : 500;
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("time", "read")],
      detail: { tags: ["Time"], summary: "Get time event by ID" },
    }
  )

  // ===========================================================================
  // Schedules
  // ===========================================================================

  .post(
    "/schedules",
    async (ctx) => {
      const { timeService, tenant, user, body, set } = ctx as any;

      const result = await timeService.createSchedule(
        { tenantId: tenant.id, userId: user.id },
        body as any
      );

      if (!result.success) {
        set.status = result.error?.code === "INVALID_DATE_RANGE" ? 400 : 500;
        return { error: { ...result.error, requestId: "" } };
      }

      set.status = 201;
      return result.data;
    },
    {
      body: CreateScheduleSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("time:schedules", "write")],
      detail: { tags: ["Time"], summary: "Create schedule" },
    }
  )

  .get(
    "/schedules",
    async (ctx) => {
      const { timeService, tenant, user, query, set } = ctx as any;

      const result = await timeService.getSchedules(
        { tenantId: tenant.id, userId: user.id },
        query
      );

      if (!result.success) {
        set.status = 500;
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("time:schedules", "read")],
      detail: { tags: ["Time"], summary: "List schedules" },
    }
  )

  .get(
    "/schedules/:id",
    async (ctx) => {
      const { timeService, tenant, user, params, set } = ctx as any;

      const result = await timeService.getScheduleById(
        { tenantId: tenant.id, userId: user.id },
        params.id
      );

      if (!result.success) {
        set.status = result.error?.code === "SCHEDULE_NOT_FOUND" ? 404 : 500;
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("time:schedules", "read")],
      detail: { tags: ["Time"], summary: "Get schedule by ID" },
    }
  )

  .put(
    "/schedules/:id",
    async (ctx) => {
      const { timeService, tenant, user, params, body, set } = ctx as any;

      const result = await timeService.updateSchedule(
        { tenantId: tenant.id, userId: user.id },
        params.id,
        body as any
      );

      if (!result.success) {
        set.status = result.error?.code === "SCHEDULE_NOT_FOUND" ? 404 : 500;
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      body: UpdateScheduleSchema,
      beforeHandle: [requirePermission("time:schedules", "write")],
      detail: { tags: ["Time"], summary: "Update schedule" },
    }
  )

  // ===========================================================================
  // Shifts
  // ===========================================================================

  .post(
    "/shifts",
    async (ctx) => {
      const { timeService, tenant, user, body, set } = ctx as any;

      const result = await timeService.createShift(
        { tenantId: tenant.id, userId: user.id },
        body as any
      );

      if (!result.success) {
        set.status = 500;
        return { error: { ...result.error, requestId: "" } };
      }

      set.status = 201;
      return result.data;
    },
    {
      body: CreateShiftSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("time:shifts", "write")],
      detail: { tags: ["Time"], summary: "Create shift" },
    }
  )

  .get(
    "/shifts/:id",
    async (ctx) => {
      const { timeService, tenant, user, params, set } = ctx as any;

      const result = await timeService.getShiftById(
        { tenantId: tenant.id, userId: user.id },
        params.id
      );

      if (!result.success) {
        set.status = result.error?.code === "SHIFT_NOT_FOUND" ? 404 : 500;
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("time:shifts", "read")],
      detail: { tags: ["Time"], summary: "Get shift by ID" },
    }
  )

  .put(
    "/shifts/:id",
    async (ctx) => {
      const { timeService, tenant, user, params, body, set } = ctx as any;

      const result = await timeService.updateShift(
        { tenantId: tenant.id, userId: user.id },
        params.id,
        body as any
      );

      if (!result.success) {
        set.status = result.error?.code === "SHIFT_NOT_FOUND" ? 404 : 500;
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      body: UpdateShiftSchema,
      beforeHandle: [requirePermission("time:shifts", "write")],
      detail: { tags: ["Time"], summary: "Update shift" },
    }
  )

  // ===========================================================================
  // Timesheets
  // ===========================================================================

  .post(
    "/timesheets",
    async (ctx) => {
      const { timeService, tenant, user, body, set } = ctx as any;

      const result = await timeService.createTimesheet(
        { tenantId: tenant.id, userId: user.id },
        body as any
      );

      if (!result.success) {
        set.status = 500;
        return { error: { ...result.error, requestId: "" } };
      }

      set.status = 201;
      return result.data;
    },
    {
      body: CreateTimesheetSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("time:timesheets", "write")],
      detail: { tags: ["Time"], summary: "Create timesheet" },
    }
  )

  .get(
    "/timesheets",
    async (ctx) => {
      const { timeService, tenant, user, query, set } = ctx as any;

      const result = await timeService.getTimesheets(
        { tenantId: tenant.id, userId: user.id },
        query
      );

      if (!result.success) {
        set.status = 500;
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      query: TimesheetFiltersSchema,
      beforeHandle: [requirePermission("time:timesheets", "read")],
      detail: { tags: ["Time"], summary: "List timesheets" },
    }
  )

  .get(
    "/timesheets/:id",
    async (ctx) => {
      const { timeService, tenant, user, params, set } = ctx as any;

      const result = await timeService.getTimesheetById(
        { tenantId: tenant.id, userId: user.id },
        params.id
      );

      if (!result.success) {
        set.status = result.error?.code === "TIMESHEET_NOT_FOUND" ? 404 : 500;
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("time:timesheets", "read")],
      detail: { tags: ["Time"], summary: "Get timesheet by ID" },
    }
  )

  .put(
    "/timesheets/:id",
    async (ctx) => {
      const { timeService, tenant, user, params, body, set } = ctx as any;

      const result = await timeService.updateTimesheetLines(
        { tenantId: tenant.id, userId: user.id },
        params.id,
        (body as any).lines
      );

      if (!result.success) {
        const code = result.error?.code;
        set.status = code === "TIMESHEET_NOT_FOUND" ? 404 : code === "TIMESHEET_ALREADY_SUBMITTED" ? 400 : 500;
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      body: UpdateTimesheetSchema,
      beforeHandle: [requirePermission("time:timesheets", "write")],
      detail: { tags: ["Time"], summary: "Update timesheet lines" },
    }
  )

  .post(
    "/timesheets/:id/submit",
    async (ctx) => {
      const { timeService, tenant, user, params, set } = ctx as any;

      const result = await timeService.submitTimesheet(
        { tenantId: tenant.id, userId: user.id },
        params.id
      );

      if (!result.success) {
        set.status = result.error?.code === "TIMESHEET_NOT_FOUND" ? 404 : 500;
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("time:timesheets", "write")],
      detail: { tags: ["Time"], summary: "Submit timesheet" },
    }
  )

  .post(
    "/timesheets/:id/approve",
    async (ctx) => {
      const { timeService, tenant, user, params, body, set } = ctx as any;

      let result;
      if ((body as any).action === "approve") {
        result = await timeService.approveTimesheet(
          { tenantId: tenant.id, userId: user.id },
          params.id,
          user.id,
          (body as any).comments
        );
      } else {
        result = await timeService.rejectTimesheet(
          { tenantId: tenant.id, userId: user.id },
          params.id,
          user.id,
          (body as any).comments
        );
      }

      if (!result.success) {
        set.status = result.error?.code === "TIMESHEET_NOT_SUBMITTED" ? 400 : 500;
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      body: TimesheetApprovalSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("time:timesheets", "write")],
      detail: { tags: ["Time"], summary: "Approve or reject timesheet" },
    }
  );

  // ===========================================================================
  // Schedule Assignments
  // ===========================================================================

  .get(
    "/schedule-assignments",
    async (ctx) => {
      const { timeService, tenant, user, set } = ctx as any;

      try {
        return await timeService.getScheduleAssignments({ tenantId: tenant.id, userId: user.id });
      } catch (err: any) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: err.message || "Failed to get schedule assignments" } };
      }
    },
    {
      beforeHandle: [requirePermission("time:schedules", "read")],
      detail: { tags: ["Time"], summary: "List schedule assignments" },
    }
  )

  // ===========================================================================
  // Stats
  // ===========================================================================

  .get(
    "/stats",
    async (ctx) => {
      const { timeService, tenant, user, set } = ctx as any;

      try {
        const stats = await timeService.getStats({ tenantId: tenant.id, userId: user.id });
        return stats;
      } catch (err: any) {
        set.status = 500;
        return { error: { code: "INTERNAL_ERROR", message: err.message || "Failed to get time stats" } };
      }
    },
    {
      beforeHandle: [requirePermission("time", "read")],
      detail: { tags: ["Time"], summary: "Get time statistics" },
    }
  );

export type TimeRoutes = typeof timeRoutes;
