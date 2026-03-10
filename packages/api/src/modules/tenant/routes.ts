/**
 * Tenant Routes
 *
 * Provides /current and /settings endpoints for resolving the active tenant.
 * All routes delegate to TenantService/TenantRepository for data access.
 */

import { Elysia } from "elysia";
import { requireAuthContext } from "../../plugins";
import { TenantRepository } from "./repository";
import { TenantService } from "./service";

export const tenantRoutes = new Elysia({ prefix: "/tenant" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db, authService } = ctx as any;
    const repository = new TenantRepository(db);
    const tenantService = new TenantService(repository);
    if (authService) {
      tenantService.setAuthService(authService);
    }

    return { tenantService };
  })

  .get("/current", async (ctx) => {
    const { user, session, tenant, set, requestId, tenantService } = ctx as any;

    const tenantId = tenant?.id ?? (await tenantService.getSessionTenant(session.id, user.id));

    if (!tenantId) {
      set.status = 404;
      return {
        error: {
          code: "TENANT_NOT_FOUND",
          message: "No tenant selected for current session",
          requestId: requestId || "",
        },
      };
    }

    const result = await tenantService.getCurrentTenant(tenantId);

    if (!result) {
      set.status = 404;
      return {
        error: {
          code: "TENANT_NOT_FOUND",
          message: "Tenant not found",
          requestId: requestId || "",
        },
      };
    }

    return result;
  }, {
    beforeHandle: [requireAuthContext],
    detail: {
      tags: ["Tenant"],
      summary: "Get current tenant",
    },
  })

  .get("/settings", async (ctx) => {
    const { user, session, tenant, set, requestId, tenantService } = ctx as any;

    const tenantId = tenant?.id ?? (await tenantService.getSessionTenant(session.id, user.id));

    if (!tenantId) {
      set.status = 404;
      return {
        error: {
          code: "TENANT_NOT_FOUND",
          message: "No tenant selected for current session",
          requestId: requestId || "",
        },
      };
    }

    const settings = await tenantService.getTenantSettings(tenantId);

    if (settings === null) {
      set.status = 404;
      return {
        error: {
          code: "TENANT_NOT_FOUND",
          message: "Tenant not found",
          requestId: requestId || "",
        },
      };
    }

    return settings;
  }, {
    beforeHandle: [requireAuthContext],
    detail: {
      tags: ["Tenant"],
      summary: "Get tenant settings",
    },
  });

export type TenantRoutes = typeof tenantRoutes;
