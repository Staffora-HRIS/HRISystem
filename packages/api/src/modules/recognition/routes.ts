/**
 * Recognition Module Routes
 *
 * Endpoints for peer recognition.
 * All routes delegate to RecognitionService for business logic.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import type { DatabaseClient } from "../../plugins/db";
import { RecognitionRepository } from "./repository";
import { RecognitionService } from "./service";
import {
  CreateRecognitionSchema,
  ListRecognitionsQuerySchema,
  type CreateRecognition,
  type ListRecognitionsQuery,
} from "./schemas";
import { getHttpStatus } from "../../lib/route-errors";

// =============================================================================
// Types
// =============================================================================

interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
}

interface DerivedContext {
  recognitionService: RecognitionService;
  tenantContext: { tenantId: string; userId: string | undefined };
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
  requestId: string;
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
}

function errorResponse(
  result: unknown,
  set: { status: number },
  requestId: string
) {
  const err = (
    result as { error: { code: string; message: string; details?: unknown } }
  ).error;
  set.status = getHttpStatus(err.code);
  return {
    error: {
      code: err.code,
      message: err.message,
      details: err.details,
      requestId,
    },
  };
}

// =============================================================================
// Routes
// =============================================================================

export const recognitionRoutes = new Elysia({ prefix: "/recognition" })

  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new RecognitionRepository(db);
    const service = new RecognitionService(repository, db);
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };
    return { recognitionService: service, tenantContext };
  })

  // ===========================================================================
  // POST /recognition - Give recognition to a colleague
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const { recognitionService, tenantContext, body, set, requestId, db, tenant, user } =
        ctx as unknown as DerivedContext;

      // Resolve the employee ID for the current user
      const [employee] = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          return tx`
            SELECT id FROM app.employees
            WHERE user_id = ${user.id}::uuid AND tenant_id = ${tenant.id}::uuid
            LIMIT 1
          `;
        }
      );

      if (!employee) {
        set.status = 404;
        return {
          error: {
            code: ErrorCodes.NO_EMPLOYEE_RECORD,
            message: "No employee record found for the current user",
            requestId,
          },
        };
      }

      const result = await recognitionService.create(
        tenantContext,
        employee.id,
        body as CreateRecognition
      );

      if (!result.success) {
        return errorResponse(result, set, requestId);
      }

      set.status = 201;
      return result.data;
    },
    {
      body: CreateRecognitionSchema,
      beforeHandle: [requirePermission("recognition", "write")],
      detail: {
        tags: ["Recognition"],
        summary: "Give recognition to a colleague",
      },
    }
  )

  // ===========================================================================
  // GET /recognition - List recognitions with filters
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { recognitionService, tenantContext, query, set, requestId } =
        ctx as unknown as DerivedContext;
      const q = query as unknown as ListRecognitionsQuery;

      const result = await recognitionService.list(tenantContext, {
        category: q.category,
        visibility: q.visibility,
        toEmployeeId: q.toEmployeeId,
        fromEmployeeId: q.fromEmployeeId,
        cursor: q.cursor,
        limit: q.limit ? Number(q.limit) : undefined,
      });

      if (!result.success) {
        return errorResponse(result, set, requestId);
      }

      return result.data;
    },
    {
      query: ListRecognitionsQuerySchema,
      beforeHandle: [requirePermission("recognition", "read")],
      detail: {
        tags: ["Recognition"],
        summary: "List recognitions with optional filters",
      },
    }
  )

  // ===========================================================================
  // GET /recognition/leaderboard - Top recognised employees
  // ===========================================================================
  .get(
    "/leaderboard",
    async (ctx) => {
      const { recognitionService, tenantContext, query, set, requestId } =
        ctx as unknown as DerivedContext;

      const days = (query as any).days ? Number((query as any).days) : 30;
      const limit = (query as any).limit ? Number((query as any).limit) : 10;

      const result = await recognitionService.getLeaderboard(
        tenantContext,
        days,
        limit
      );

      if (!result.success) {
        return errorResponse(result, set, requestId);
      }

      return result.data;
    },
    {
      query: t.Object({
        days: t.Optional(t.String({ pattern: "^[0-9]+$" })),
        limit: t.Optional(t.String({ pattern: "^[0-9]+$" })),
      }),
      beforeHandle: [requirePermission("recognition", "read")],
      detail: {
        tags: ["Recognition"],
        summary: "Get recognition leaderboard",
      },
    }
  );

export type RecognitionRoutes = typeof recognitionRoutes;
