/**
 * Tenant Provisioning Module Routes
 *
 * Admin endpoints for automated tenant provisioning.
 * All routes require super_admin or tenant_admin permissions.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { DatabaseClient } from "../../plugins/db";
import { TenantProvisioningRepository } from "./repository";
import { TenantProvisioningService } from "./service";
import {
  ProvisionTenantSchema,
  ListProvisioningLogsQuerySchema,
  type ProvisionTenant,
  type ListProvisioningLogsQuery,
} from "./schemas";
import { getHttpStatus } from "../../lib/route-errors";

// =============================================================================
// Types
// =============================================================================

interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string } | null;
  user: { id: string };
}

interface DerivedContext {
  provisioningService: TenantProvisioningService;
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: unknown;
  set: { status: number };
  requestId: string;
  db: DatabaseClient;
  tenant: { id: string } | null;
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

export const tenantProvisioningRoutes = new Elysia({
  prefix: "/admin/tenants",
})

  .derive((ctx) => {
    const { db } = ctx as unknown as PluginContext;
    const repository = new TenantProvisioningRepository(db);
    const service = new TenantProvisioningService(repository, db);
    return { provisioningService: service };
  })

  // ===========================================================================
  // POST /admin/tenants/provision - Provision a new tenant
  // ===========================================================================
  .post(
    "/provision",
    async (ctx) => {
      const { provisioningService, body, set, requestId, user } =
        ctx as unknown as DerivedContext;

      const result = await provisioningService.provisionTenant(
        { userId: user?.id },
        body as ProvisionTenant
      );

      if (!result.success) {
        return errorResponse(result, set, requestId);
      }

      set.status = 201;
      return result.data;
    },
    {
      body: ProvisionTenantSchema,
      beforeHandle: [requirePermission("tenants", "write")],
      detail: {
        tags: ["Admin", "Tenant Provisioning"],
        summary: "Provision a new tenant with automated setup",
        description:
          "Creates a new tenant with default roles, admin user, seed data, and optional welcome email.",
      },
    }
  )

  // ===========================================================================
  // GET /admin/tenants/provisioning-logs - List provisioning logs
  // ===========================================================================
  .get(
    "/provisioning-logs",
    async (ctx) => {
      const { provisioningService, query, set, requestId } =
        ctx as unknown as DerivedContext;
      const q = query as unknown as ListProvisioningLogsQuery;

      const result = await provisioningService.listProvisioningLogs({
        status: q.status,
        cursor: q.cursor,
        limit: q.limit ? Number(q.limit) : undefined,
      });

      if (!result.success) {
        return errorResponse(result, set, requestId);
      }

      return result.data;
    },
    {
      query: ListProvisioningLogsQuerySchema,
      beforeHandle: [requirePermission("tenants", "read")],
      detail: {
        tags: ["Admin", "Tenant Provisioning"],
        summary: "List tenant provisioning logs",
      },
    }
  )

  // ===========================================================================
  // GET /admin/tenants/provisioning-logs/:id - Get a provisioning log
  // ===========================================================================
  .get(
    "/provisioning-logs/:id",
    async (ctx) => {
      const { provisioningService, params, set, requestId } =
        ctx as unknown as DerivedContext;

      const result = await provisioningService.getProvisioningLog(params.id);

      if (!result.success) {
        return errorResponse(result, set, requestId);
      }

      return result.data;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      beforeHandle: [requirePermission("tenants", "read")],
      detail: {
        tags: ["Admin", "Tenant Provisioning"],
        summary: "Get a specific provisioning log by ID",
      },
    }
  );

export type TenantProvisioningRoutes = typeof tenantProvisioningRoutes;
