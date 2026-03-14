/**
 * Training Budgets Module Routes
 *
 * CRUD endpoints for training budgets and expense tracking.
 * All routes delegate to TrainingBudgetService for business logic.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import type { DatabaseClient } from "../../plugins/db";
import { TrainingBudgetRepository } from "./repository";
import { TrainingBudgetService } from "./service";
import {
  CreateBudgetSchema,
  UpdateBudgetSchema,
  CreateExpenseSchema,
  UpdateExpenseStatusSchema,
  type CreateBudget,
  type CreateExpense,
  type UpdateBudget,
  type UpdateExpenseStatus,
} from "./schemas";
import { getHttpStatus } from "../../lib/route-errors";

const UuidSchema = t.String({ format: "uuid" });

interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
}

interface DerivedContext {
  budgetService: TrainingBudgetService;
  tenantContext: { tenantId: string; userId: string | undefined };
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
  requestId: string;
}

function errorResponse(result: unknown, set: { status: number }, requestId: string) {
  const err = (result as { error: { code: string; message: string; details?: unknown } }).error;
  set.status = getHttpStatus(err.code);
  return { error: { code: err.code, message: err.message, details: err.details, requestId } };
}

export const trainingBudgetRoutes = new Elysia({ prefix: "/training-budgets" })

  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new TrainingBudgetRepository(db);
    const service = new TrainingBudgetService(repository, db);
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };
    return { budgetService: service, tenantContext };
  })

  // ===========================================================================
  // Budget Endpoints
  // ===========================================================================

  .get("/budgets", async (ctx) => {
    const { budgetService, tenantContext, query, set } = ctx as unknown as DerivedContext;

    try {
      const { cursor, limit, ...filters } = query;
      const result = await budgetService.listBudgets(
        tenantContext,
        filters as { financialYear?: string; departmentId?: string },
        { cursor: cursor as string | undefined, limit: limit ? Number(limit) : undefined }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    } catch (error: unknown) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error instanceof Error ? error.message : String(error) } };
    }
  }, {
    query: t.Object({
      financialYear: t.Optional(t.String()),
      departmentId: t.Optional(UuidSchema),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
    }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["Training Budgets"], summary: "List training budgets" },
  })

  .get("/budgets/:id", async (ctx) => {
    const { budgetService, tenantContext, params, set, requestId } = ctx as unknown as DerivedContext;

    const result = await budgetService.getBudget(tenantContext, params.id);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["Training Budgets"], summary: "Get training budget by ID" },
  })

  .post("/budgets", async (ctx) => {
    const { budgetService, tenantContext, body, set, requestId } = ctx as unknown as DerivedContext;

    const result = await budgetService.createBudget(tenantContext, body as CreateBudget);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    set.status = 201;
    return result.data;
  }, {
    body: CreateBudgetSchema,
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["Training Budgets"], summary: "Create training budget" },
  })

  .patch("/budgets/:id", async (ctx) => {
    const { budgetService, tenantContext, params, body, set, requestId } = ctx as unknown as DerivedContext;

    const result = await budgetService.updateBudget(tenantContext, params.id, body as UpdateBudget);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: UpdateBudgetSchema,
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["Training Budgets"], summary: "Update training budget" },
  })

  // ===========================================================================
  // Expense Endpoints
  // ===========================================================================

  .get("/expenses", async (ctx) => {
    const { budgetService, tenantContext, query, set } = ctx as unknown as DerivedContext;

    try {
      const { cursor, limit, ...filters } = query;
      const result = await budgetService.listExpenses(
        tenantContext,
        filters as { budgetId?: string; employeeId?: string; status?: string },
        { cursor: cursor as string | undefined, limit: limit ? Number(limit) : undefined }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    } catch (error: unknown) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error instanceof Error ? error.message : String(error) } };
    }
  }, {
    query: t.Object({
      budgetId: t.Optional(UuidSchema),
      employeeId: t.Optional(UuidSchema),
      status: t.Optional(t.String()),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
    }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["Training Budgets"], summary: "List training expenses" },
  })

  .get("/expenses/:id", async (ctx) => {
    const { budgetService, tenantContext, params, set, requestId } = ctx as unknown as DerivedContext;

    const result = await budgetService.getExpense(tenantContext, params.id);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["Training Budgets"], summary: "Get training expense by ID" },
  })

  .post("/expenses", async (ctx) => {
    const { budgetService, tenantContext, body, set, requestId } = ctx as unknown as DerivedContext;

    const result = await budgetService.createExpense(tenantContext, body as CreateExpense);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    set.status = 201;
    return result.data;
  }, {
    body: CreateExpenseSchema,
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["Training Budgets"], summary: "Create training expense" },
  })

  .patch("/expenses/:id/status", async (ctx) => {
    const { budgetService, tenantContext, params, body, set, requestId } = ctx as unknown as DerivedContext;

    const typedBody = body as UpdateExpenseStatus;
    const result = await budgetService.updateExpenseStatus(tenantContext, params.id, typedBody.status);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: UpdateExpenseStatusSchema,
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["Training Budgets"], summary: "Update expense status" },
  });

export type TrainingBudgetRoutes = typeof trainingBudgetRoutes;
