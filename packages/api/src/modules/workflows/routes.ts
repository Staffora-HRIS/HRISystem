/**
 * Workflows Routes
 */

import { Elysia } from "elysia";
import { requireAuthContext, requireTenantContext } from "../../plugins";
import { ErrorCodes } from "../../plugins/errors";
import { WorkflowService } from "./service";
import { WorkflowRepository } from "./repository";
import * as schemas from "./schemas";

export const workflowRoutes = new Elysia({ prefix: "/workflows" })
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new WorkflowRepository(db);
    const workflowService = new WorkflowService(repository);
    return { workflowService };
  })

  // Definition Routes
  .get("/definitions", async (ctx) => {
    const { tenant, user, workflowService, query, set } = ctx as any;

    try {
      const result = await workflowService.getDefinitions(
        { tenantId: tenant.id, userId: user.id },
        {
          category: query.category,
          status: query.status,
          cursor: query.cursor,
          limit: query.limit !== undefined && query.limit !== null ? Number(query.limit) : undefined,
        }
      );
      return result;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    query: schemas.PaginationQuerySchema,
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "List workflow definitions" }
  })

  .post("/definitions", async (ctx) => {
    const { tenant, user, workflowService, body, set } = ctx as any;

    try {
      const definition = await workflowService.createDefinition(
        { tenantId: tenant.id, userId: user.id },
        body as any
      );
      set.status = 201;
      return definition;
    } catch (error: any) {
      if (error.message.startsWith("VALIDATION_ERROR:")) {
        set.status = 400;
        return { error: { code: "VALIDATION_ERROR", message: error.message.replace("VALIDATION_ERROR: ", "") } };
      }
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    body: schemas.CreateWorkflowDefinitionSchema,
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "Create workflow definition" }
  })

  .get("/definitions/:id", async (ctx) => {
    const { tenant, user, workflowService, params, set } = ctx as any;

    try {
      return await workflowService.getDefinitionById({ tenantId: tenant.id, userId: user.id }, params.id);
    } catch (error: any) {
      if (error.message.startsWith("NOT_FOUND:")) {
        set.status = 404;
        return { error: { code: ErrorCodes.NOT_FOUND, message: error.message.replace("NOT_FOUND: ", "") } };
      }
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    params: schemas.IdParamsSchema,
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "Get workflow definition by ID" }
  })

  .patch("/definitions/:id", async (ctx) => {
    const { tenant, user, workflowService, params, body, set } = ctx as any;

    try {
      return await workflowService.updateDefinition(
        { tenantId: tenant.id, userId: user.id },
        params.id,
        body as any
      );
    } catch (error: any) {
      if (error.message.startsWith("NOT_FOUND:")) {
        set.status = 404;
        return { error: { code: ErrorCodes.NOT_FOUND, message: error.message.replace("NOT_FOUND: ", "") } };
      }
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    params: schemas.IdParamsSchema,
    body: schemas.UpdateWorkflowDefinitionSchema,
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "Update workflow definition" }
  })

  .post("/definitions/:id/activate", async (ctx) => {
    const { tenant, user, workflowService, params, set } = ctx as any;

    try {
      return await workflowService.activateDefinition({ tenantId: tenant.id, userId: user.id }, params.id);
    } catch (error: any) {
      if (error.message.startsWith("NOT_FOUND:")) {
        set.status = 404;
        return { error: { code: ErrorCodes.NOT_FOUND, message: error.message.replace("NOT_FOUND: ", "") } };
      }
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    params: schemas.IdParamsSchema,
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "Activate workflow definition" }
  })

  // Instance Routes
  .get("/instances", async (ctx) => {
    const { tenant, user, workflowService, query, set } = ctx as any;

    try {
      return await workflowService.getInstances({ tenantId: tenant.id, userId: user.id }, query);
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    query: schemas.WorkflowInstanceFiltersSchema,
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "List workflow instances" }
  })

  .post("/instances", async (ctx) => {
    const { tenant, user, workflowService, body, set } = ctx as any;

    try {
      const instance = await workflowService.startWorkflow(
        { tenantId: tenant.id, userId: user.id },
        body as any
      );
      set.status = 201;
      return instance;
    } catch (error: any) {
      if (error.message.startsWith("NOT_FOUND:")) {
        set.status = 404;
        return { error: { code: ErrorCodes.NOT_FOUND, message: error.message.replace("NOT_FOUND: ", "") } };
      }
      if (error.message.startsWith("VALIDATION_ERROR:")) {
        set.status = 400;
        return { error: { code: "VALIDATION_ERROR", message: error.message.replace("VALIDATION_ERROR: ", "") } };
      }
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    body: schemas.CreateWorkflowInstanceSchema,
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "Start workflow instance" }
  })

  .get("/instances/:id", async (ctx) => {
    const { tenant, user, workflowService, params, set } = ctx as any;

    try {
      return await workflowService.getInstanceById({ tenantId: tenant.id, userId: user.id }, params.id);
    } catch (error: any) {
      if (error.message.startsWith("NOT_FOUND:")) {
        set.status = 404;
        return { error: { code: ErrorCodes.NOT_FOUND, message: error.message.replace("NOT_FOUND: ", "") } };
      }
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    params: schemas.IdParamsSchema,
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "Get workflow instance by ID" }
  })

  .get("/instances/:id/steps", async (ctx) => {
    const { tenant, user, workflowService, params, set } = ctx as any;

    try {
      const steps = await workflowService.getInstanceSteps({ tenantId: tenant.id, userId: user.id }, params.id);
      return { steps };
    } catch (error: any) {
      if (error.message.startsWith("NOT_FOUND:")) {
        set.status = 404;
        return { error: { code: ErrorCodes.NOT_FOUND, message: error.message.replace("NOT_FOUND: ", "") } };
      }
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    params: schemas.IdParamsSchema,
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "Get workflow instance steps" }
  })

  .post("/instances/:id/cancel", async (ctx) => {
    const { tenant, user, workflowService, params, body, set } = ctx as any;

    try {
      return await workflowService.cancelInstance(
        { tenantId: tenant.id, userId: user.id },
        params.id,
        (body as any)?.reason
      );
    } catch (error: any) {
      if (error.message.startsWith("NOT_FOUND:")) {
        set.status = 404;
        return { error: { code: ErrorCodes.NOT_FOUND, message: error.message.replace("NOT_FOUND: ", "") } };
      }
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    params: schemas.IdParamsSchema,
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "Cancel workflow instance" }
  })

  // Step Actions
  .post("/steps/:stepId/process", async (ctx) => {
    const { tenant, user, workflowService, params, body, set } = ctx as any;

    try {
      return await workflowService.processStep(
        { tenantId: tenant.id, userId: user.id },
        params.stepId,
        body as any,
        user.id
      );
    } catch (error: any) {
      if (error.message.startsWith("NOT_FOUND:")) {
        set.status = 404;
        return { error: { code: ErrorCodes.NOT_FOUND, message: error.message.replace("NOT_FOUND: ", "") } };
      }
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    body: schemas.ProcessStepActionSchema,
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "Process workflow step (approve/reject)" }
  })

  .post("/steps/:stepId/reassign", async (ctx) => {
    const { tenant, user, workflowService, params, body, set } = ctx as any;

    try {
      return await workflowService.reassignStep(
        { tenantId: tenant.id, userId: user.id },
        params.stepId,
        body as any
      );
    } catch (error: any) {
      if (error.message.startsWith("NOT_FOUND:")) {
        set.status = 404;
        return { error: { code: ErrorCodes.NOT_FOUND, message: error.message.replace("NOT_FOUND: ", "") } };
      }
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    body: schemas.ReassignStepSchema,
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "Reassign workflow step" }
  })

  // My Approvals
  .get("/my-approvals", async (ctx) => {
    const { tenant, user, workflowService, set } = ctx as any;

    try {
      const approvals = await workflowService.getMyPendingApprovals({ tenantId: tenant.id, userId: user.id }, user.id);
      return { approvals, count: approvals.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    beforeHandle: [requireAuthContext, requireTenantContext],
    detail: { tags: ["Workflows"], summary: "Get my pending approvals" }
  });

export type WorkflowRoutes = typeof workflowRoutes;
