/**
 * Onboarding Module Routes
 *
 * Onboarding checklists and tasks management.
 * All routes delegate to OnboardingService for business logic.
 */

import { Elysia, t } from "elysia";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import { OnboardingRepository } from "./repository";
import { OnboardingService } from "./service";
import { mapErrorToStatus } from "../../lib/route-helpers";

const UuidSchema = t.String({ format: "uuid" });

/** Module-specific error code overrides */
const ONBOARDING_ERROR_CODES: Record<string, number> = {
  TEMPLATE_NOT_FOUND: 404,
  TEMPLATE_INACTIVE: 409,
  ALREADY_ONBOARDING: 409,
  INSTANCE_CLOSED: 409,
  TASK_NOT_FOUND: 404,
  ALREADY_COMPLETED: 409,
  CANNOT_SKIP_REQUIRED: 409,
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  START_FAILED: 500,
  COMPLETE_FAILED: 500,
  SKIP_FAILED: 500,
};

export const onboardingRoutes = new Elysia({ prefix: "/onboarding" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new OnboardingRepository(db);
    const service = new OnboardingService(repository, db);

    const { tenant, user } = ctx as any;
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { onboardingService: service, onboardingRepository: repository, tenantContext };
  })

  // Checklists (Templates)
  .get("/checklists", async (ctx) => {
    const { onboardingService, tenantContext, set } = ctx as any;

    try {
      const result = await onboardingService.listTemplates(
        tenantContext,
        {},
        { limit: 100 }
      );

      return { checklists: result.items, count: result.items.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Onboarding"], summary: "List onboarding checklists" }
  })

  .post("/checklists", async (ctx) => {
    const { onboardingService, tenantContext, body, set } = ctx as any;

    const result = await onboardingService.createTemplate(tenantContext, {
      name: body.name,
      description: body.description,
      departmentId: body.departmentId,
      positionId: body.positionId,
      tasks: body.tasks,
    });

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, ONBOARDING_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 100 }),
      description: t.Optional(t.String({ maxLength: 1000 })),
      departmentId: t.Optional(UuidSchema),
      positionId: t.Optional(UuidSchema),
      tasks: t.Optional(t.Array(t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
        assigneeType: t.Optional(t.String()),
        daysFromStart: t.Optional(t.Number()),
        required: t.Optional(t.Boolean()),
      }))),
    }),
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Onboarding"], summary: "Create onboarding checklist" }
  })

  // Employee Onboarding Instances
  .get("/instances", async (ctx) => {
    const { onboardingService, tenantContext, query, set } = ctx as any;

    try {
      const { cursor, limit, ...filters } = query;
      const result = await onboardingService.listInstances(
        tenantContext,
        filters,
        { cursor, limit: limit !== undefined && limit !== null ? Number(limit) : undefined }
      );

      return {
        instances: result.items,
        count: result.items.length,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    query: t.Object({
      status: t.Optional(t.String()),
      employeeId: t.Optional(UuidSchema),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
    }),
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Onboarding"], summary: "List onboarding instances" }
  })

  .post("/instances", async (ctx) => {
    const { onboardingService, tenantContext, body, set } = ctx as any;

    const result = await onboardingService.startOnboarding(tenantContext, {
      employeeId: body.employeeId,
      templateId: body.checklistId,
      startDate: body.startDate,
      buddyId: body.buddyId,
    });

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, ONBOARDING_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    body: t.Object({
      employeeId: UuidSchema,
      checklistId: UuidSchema,
      startDate: t.String({ format: "date" }),
      buddyId: t.Optional(UuidSchema),
    }),
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Onboarding"], summary: "Start onboarding for employee" }
  })

  .get("/instances/:id", async (ctx) => {
    const { onboardingService, tenantContext, params, set } = ctx as any;

    const result = await onboardingService.getInstance(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, ONBOARDING_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Onboarding"], summary: "Get onboarding instance" }
  })

  .post("/instances/:id/tasks/:taskId/complete", async (ctx) => {
    const { onboardingService, tenantContext, params, set } = ctx as any;

    const result = await onboardingService.completeTask(tenantContext, params.id, params.taskId);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, ONBOARDING_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema, taskId: t.String() }),
    detail: { tags: ["Onboarding"], summary: "Complete onboarding task" }
  })

  // My Onboarding
  .get("/my-onboarding", async (ctx) => {
    const { tenant, user, onboardingService, onboardingRepository, tenantContext, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const employeeId = await onboardingRepository.getEmployeeIdByUserId(tenantContext);

      if (!employeeId) {
        return { instance: null };
      }

      const result = await onboardingService.getMyOnboarding(tenantContext, employeeId);
      return { instance: result.data || null };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    detail: { tags: ["Onboarding"], summary: "Get my onboarding" }
  });

export type OnboardingRoutes = typeof onboardingRoutes;
