/**
 * CPD Module Routes
 *
 * CRUD + verification endpoints for CPD records.
 * All routes delegate to CpdService for business logic.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import type { DatabaseClient } from "../../plugins/db";
import { CpdRepository } from "./repository";
import { CpdService } from "./service";
import {
  CreateCpdRecordSchema,
  UpdateCpdRecordSchema,
  CpdActivityTypeSchema,
  type CreateCpdRecord,
  type UpdateCpdRecord,
} from "./schemas";
import { getHttpStatus } from "../../lib/route-errors";

const UuidSchema = t.String({ format: "uuid" });

interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string };
  user: { id: string };
}

interface DerivedContext {
  cpdService: CpdService;
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

export const cpdRoutes = new Elysia({ prefix: "/cpd" })

  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const repository = new CpdRepository(db);
    const service = new CpdService(repository, db);
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };
    return { cpdService: service, tenantContext };
  })

  // ===========================================================================
  // CPD Record Endpoints
  // ===========================================================================

  .get("/records", async (ctx) => {
    const { cpdService, tenantContext, query, set } = ctx as unknown as DerivedContext;

    try {
      const { cursor, limit, ...filters } = query;
      const result = await cpdService.listRecords(
        tenantContext,
        filters as { employeeId?: string; activityType?: string; verified?: boolean },
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
      employeeId: t.Optional(UuidSchema),
      activityType: t.Optional(CpdActivityTypeSchema),
      verified: t.Optional(t.Boolean()),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
    }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["CPD"], summary: "List CPD records" },
  })

  .get("/records/:id", async (ctx) => {
    const { cpdService, tenantContext, params, set, requestId } = ctx as unknown as DerivedContext;

    const result = await cpdService.getRecord(tenantContext, params.id);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: { tags: ["CPD"], summary: "Get CPD record by ID" },
  })

  .post("/records", async (ctx) => {
    const { cpdService, tenantContext, body, set, requestId } = ctx as unknown as DerivedContext;

    const result = await cpdService.createRecord(tenantContext, body as CreateCpdRecord);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    set.status = 201;
    return result.data;
  }, {
    body: CreateCpdRecordSchema,
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["CPD"], summary: "Create CPD record" },
  })

  .patch("/records/:id", async (ctx) => {
    const { cpdService, tenantContext, params, body, set, requestId } = ctx as unknown as DerivedContext;

    const result = await cpdService.updateRecord(tenantContext, params.id, body as UpdateCpdRecord);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: UpdateCpdRecordSchema,
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["CPD"], summary: "Update CPD record" },
  })

  .post("/records/:id/verify", async (ctx) => {
    const { cpdService, tenantContext, params, set, requestId } = ctx as unknown as DerivedContext;

    const result = await cpdService.verifyRecord(tenantContext, params.id);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("lms", "write")],
    detail: { tags: ["CPD"], summary: "Verify CPD record" },
  })

  .delete("/records/:id", async (ctx) => {
    const { cpdService, tenantContext, params, set, requestId } = ctx as unknown as DerivedContext;

    const result = await cpdService.deleteRecord(tenantContext, params.id);
    if (!result.success) {
      return errorResponse(result, set, requestId);
    }
    return { success: true, message: "CPD record deleted" };
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("lms", "delete")],
    detail: { tags: ["CPD"], summary: "Delete CPD record" },
  });

export type CpdRoutes = typeof cpdRoutes;
