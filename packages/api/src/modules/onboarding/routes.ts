/**
 * Onboarding Module Routes
 *
 * Onboarding checklists and tasks management.
 * All routes delegate to OnboardingService for business logic.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins";
import { ErrorCodes } from "../../plugins/errors";
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
  DEPENDENCY_NOT_MET: 409,
  CIRCULAR_DEPENDENCY: 409,
  COMPLIANCE_CHECKS_OUTSTANDING: 409,
  STATE_MACHINE_VIOLATION: 409,
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  DELETE_FAILED: 500,
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
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    beforeHandle: [requirePermission("onboarding", "read")],
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
    beforeHandle: [requirePermission("onboarding", "write")],
    detail: { tags: ["Onboarding"], summary: "Create onboarding checklist" }
  })

  .patch("/checklists/:id", async (ctx) => {
    const { onboardingService, tenantContext, params, body, set } = ctx as any;

    const result = await onboardingService.updateTemplate(tenantContext, params.id, body);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, ONBOARDING_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      description: t.Optional(t.String({ maxLength: 1000 })),
      isDefault: t.Optional(t.Boolean()),
      isActive: t.Optional(t.Boolean()),
    }),
    beforeHandle: [requirePermission("onboarding", "write")],
    detail: { tags: ["Onboarding"], summary: "Update onboarding checklist" }
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
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    query: t.Object({
      status: t.Optional(t.String()),
      employeeId: t.Optional(UuidSchema),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
    }),
    beforeHandle: [requirePermission("onboarding", "read")],
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
    beforeHandle: [requirePermission("onboarding", "write")],
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
    beforeHandle: [requirePermission("onboarding", "read")],
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
    beforeHandle: [requirePermission("onboarding", "write")],
    detail: { tags: ["Onboarding"], summary: "Complete onboarding task" }
  })

  // My Onboarding
  .get("/my-onboarding", async (ctx) => {
    const { onboardingService, onboardingRepository, tenantContext, set } = ctx as any;

    try {
      const employeeId = await onboardingRepository.getEmployeeIdByUserId(tenantContext);

      if (!employeeId) {
        return { instance: null };
      }

      const result = await onboardingService.getMyOnboarding(tenantContext, employeeId);
      return { instance: result.data || null };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    beforeHandle: [requirePermission("onboarding", "read")],
    detail: { tags: ["Onboarding"], summary: "Get my onboarding" }
  })

  // =========================================================================
  // Compliance Checks
  // =========================================================================

  // List all compliance checks for an onboarding instance
  .get("/instances/:id/compliance-checks", async (ctx) => {
    const { onboardingService, tenantContext, params, set } = ctx as any;

    const result = await onboardingService.listComplianceChecks(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, ONBOARDING_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("onboarding", "read")],
    detail: { tags: ["Onboarding"], summary: "List compliance checks for an onboarding instance" }
  })

  // Create a compliance check for an onboarding instance
  .post("/instances/:id/compliance-checks", async (ctx) => {
    const { onboardingService, tenantContext, params, body, set } = ctx as any;

    const result = await onboardingService.createComplianceCheck(tenantContext, params.id, {
      checkType: body.checkType,
      required: body.required,
      dueDate: body.dueDate,
      notes: body.notes,
    });

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, ONBOARDING_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: t.Object({
      checkType: t.Union([
        t.Literal("right_to_work"),
        t.Literal("dbs"),
        t.Literal("references"),
        t.Literal("medical"),
        t.Literal("qualifications"),
      ]),
      required: t.Optional(t.Boolean()),
      dueDate: t.Optional(t.String({ format: "date" })),
      notes: t.Optional(t.String({ maxLength: 2000 })),
    }),
    beforeHandle: [requirePermission("onboarding", "write")],
    detail: { tags: ["Onboarding"], summary: "Create a compliance check for an onboarding instance" }
  })

  // Update a compliance check (change status, add notes, waive, etc.)
  .patch("/instances/:id/compliance-checks/:checkId", async (ctx) => {
    const { onboardingService, tenantContext, params, body, set } = ctx as any;

    const result = await onboardingService.updateComplianceCheck(
      tenantContext,
      params.id,
      params.checkId,
      body
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, ONBOARDING_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema, checkId: UuidSchema }),
    body: t.Object({
      status: t.Optional(t.Union([
        t.Literal("pending"),
        t.Literal("in_progress"),
        t.Literal("passed"),
        t.Literal("failed"),
        t.Literal("waived"),
      ])),
      dueDate: t.Optional(t.String({ format: "date" })),
      notes: t.Optional(t.String({ maxLength: 2000 })),
      referenceNumber: t.Optional(t.String({ maxLength: 200 })),
      expiresAt: t.Optional(t.String({ format: "date" })),
      waiverReason: t.Optional(t.String({ minLength: 1, maxLength: 2000 })),
    }),
    beforeHandle: [requirePermission("onboarding", "write")],
    detail: { tags: ["Onboarding"], summary: "Update a compliance check" }
  })

  // Task Dependencies (Template-Level)
  .get("/templates/:templateId/dependencies", async (ctx) => {
    const { onboardingService, tenantContext, params, set } = ctx as any;

    const result = await onboardingService.listTemplateDependencies(tenantContext, params.templateId);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, ONBOARDING_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ templateId: UuidSchema }),
    beforeHandle: [requirePermission("onboarding", "read")],
    detail: { tags: ["Onboarding"], summary: "List all task dependencies for a template" }
  })

  .get("/tasks/:taskId/dependencies", async (ctx) => {
    const { onboardingService, tenantContext, params, set } = ctx as any;

    const result = await onboardingService.listTaskDependencies(tenantContext, params.taskId);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, ONBOARDING_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ taskId: UuidSchema }),
    beforeHandle: [requirePermission("onboarding", "read")],
    detail: { tags: ["Onboarding"], summary: "List dependencies for a specific task" }
  })

  .post("/tasks/dependencies", async (ctx) => {
    const { onboardingService, tenantContext, body, set } = ctx as any;

    const result = await onboardingService.addTaskDependency(tenantContext, {
      taskId: body.taskId,
      dependsOnTaskId: body.dependsOnTaskId,
    });

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, ONBOARDING_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    body: t.Object({
      taskId: UuidSchema,
      dependsOnTaskId: UuidSchema,
    }),
    beforeHandle: [requirePermission("onboarding", "write")],
    detail: { tags: ["Onboarding"], summary: "Add a dependency between two template tasks" }
  })

  .delete("/tasks/:taskId/dependencies/:dependsOnTaskId", async (ctx) => {
    const { onboardingService, tenantContext, params, set } = ctx as any;

    const result = await onboardingService.removeTaskDependency(
      tenantContext,
      params.taskId,
      params.dependsOnTaskId
    );

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, ONBOARDING_ERROR_CODES);
      return { error: result.error };
    }

    return { success: true, message: "Dependency removed" };
  }, {
    params: t.Object({ taskId: UuidSchema, dependsOnTaskId: UuidSchema }),
    beforeHandle: [requirePermission("onboarding", "write")],
    detail: { tags: ["Onboarding"], summary: "Remove a dependency between two template tasks" }
  });

export type OnboardingRoutes = typeof onboardingRoutes;
