/**
 * Portal Routes
 *
 * API endpoints for multi-portal management.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";
import { PortalService } from "./portal.service";
import {
  PortalTypeSchema,
  SwitchPortalSchema,
  GrantPortalAccessSchema,
  RevokePortalAccessSchema,
} from "./schemas";

export const portalRoutes = new Elysia({ prefix: "/portal" })
  // Get all available portals
  .get(
    "/",
    async (ctx) => {
      const { db } = ctx as any;
      const service = new PortalService(db);
      const portals = await service.getActivePortals();
      return { portals };
    },
    {
      detail: {
        tags: ["Portal"],
        summary: "List all active portals",
      },
    }
  )

  // Get current user's available portals
  .get(
    "/available",
    async (ctx) => {
      const { tenant, user, db, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const service = new PortalService(db);
      const portals = await service.getUserPortals({
        tenantId: tenant.id,
        userId: user.id,
      });

      return { portals };
    },
    {
      detail: {
        tags: ["Portal"],
        summary: "Get user's available portals",
      },
    }
  )

  // Get portal by code
  .get(
    "/:code",
    async (ctx) => {
      const { db, params, set, requestId } = ctx as any;

      const service = new PortalService(db);
      const portal = await service.getPortalByCode(params.code);

      if (!portal) {
        set.status = 404;
        return {
          error: {
            code: "NOT_FOUND",
            message: "Portal not found",
            requestId,
          },
        };
      }

      return portal;
    },
    {
      params: t.Object({ code: PortalTypeSchema }),
      detail: {
        tags: ["Portal"],
        summary: "Get portal by code",
      },
    }
  )

  // Get navigation for a portal
  .get(
    "/:code/navigation",
    async (ctx) => {
      const { tenant, user, db, params, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const service = new PortalService(db);

      // Check if user has access to this portal
      const hasAccess = await service.hasPortalAccess(
        { tenantId: tenant.id, userId: user.id },
        params.code
      );

      if (!hasAccess) {
        set.status = 403;
        return {
          error: {
            code: "FORBIDDEN",
            message: "No access to this portal",
            requestId,
          },
        };
      }

      const navigation = await service.getPortalNavigation(
        { tenantId: tenant.id, userId: user.id },
        params.code
      );

      return { navigation };
    },
    {
      params: t.Object({ code: PortalTypeSchema }),
      detail: {
        tags: ["Portal"],
        summary: "Get portal navigation menu",
      },
    }
  )

  // Switch current portal (set default)
  .post(
    "/switch",
    async (ctx) => {
      const { tenant, user, db, body, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      try {
        const service = new PortalService(db);
        await service.setDefaultPortal(
          { tenantId: tenant.id, userId: user.id },
          body.portalCode
        );

        const portal = await service.getPortalByCode(body.portalCode);

        return {
          success: true,
          portal: portal
            ? {
                code: portal.code,
                name: portal.name,
                basePath: portal.basePath,
              }
            : null,
        };
      } catch (error: any) {
        if (error.name === "PortalAccessError") {
          set.status = 403;
          return {
            error: {
              code: "FORBIDDEN",
              message: error.message,
              requestId,
            },
          };
        }
        throw error;
      }
    },
    {
      body: SwitchPortalSchema,
      detail: {
        tags: ["Portal"],
        summary: "Switch current portal",
      },
    }
  )

  // Grant portal access to a user (admin only)
  .post(
    "/access",
    async (ctx) => {
      const { tenant, user, db, body, audit, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const service = new PortalService(db);
      const accessId = await service.grantPortalAccess(
        { tenantId: tenant.id, userId: user.id },
        body.userId,
        body.portalCode,
        body.isDefault ?? false
      );

      if (audit) {
        await audit.log({
          action: "portal.access.granted",
          resourceType: "user_portal_access",
          resourceId: accessId,
          newValues: {
            userId: body.userId,
            portalCode: body.portalCode,
            isDefault: body.isDefault,
          },
          metadata: { requestId },
        });
      }

      return { success: true, accessId };
    },
    {
      beforeHandle: [requirePermission("users", "write")],
      body: GrantPortalAccessSchema,
      detail: {
        tags: ["Portal"],
        summary: "Grant portal access to user",
      },
    }
  )

  // Revoke portal access from a user (admin only)
  .delete(
    "/access",
    async (ctx) => {
      const { tenant, user, db, body, audit, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const service = new PortalService(db);
      const revoked = await service.revokePortalAccess(
        { tenantId: tenant.id, userId: user.id },
        body.userId,
        body.portalCode
      );

      if (!revoked) {
        set.status = 404;
        return {
          error: {
            code: "NOT_FOUND",
            message: "Portal access not found",
            requestId,
          },
        };
      }

      if (audit) {
        await audit.log({
          action: "portal.access.revoked",
          resourceType: "user_portal_access",
          resourceId: `${body.userId}:${body.portalCode}`,
          oldValues: {
            userId: body.userId,
            portalCode: body.portalCode,
          },
          metadata: { requestId },
        });
      }

      return { success: true };
    },
    {
      beforeHandle: [requirePermission("users", "write")],
      body: RevokePortalAccessSchema,
      detail: {
        tags: ["Portal"],
        summary: "Revoke portal access from user",
      },
    }
  )

  // Get user's portal access (admin only)
  .get(
    "/users/:userId/access",
    async (ctx) => {
      const { tenant, user, db, params, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const service = new PortalService(db);
      const portals = await service.getUserPortals({
        tenantId: tenant.id,
        userId: params.userId,
      });

      return { userId: params.userId, portals };
    },
    {
      beforeHandle: [requirePermission("users", "read")],
      params: t.Object({ userId: t.String() }),
      detail: {
        tags: ["Portal"],
        summary: "Get user's portal access",
      },
    }
  )

  // Sync portal access from roles
  .post(
    "/users/:userId/sync-access",
    async (ctx) => {
      const { tenant, user, db, params, audit, set, requestId } = ctx as any;

      if (!tenant?.id) {
        set.status = 400;
        return {
          error: {
            code: "MISSING_TENANT",
            message: "Tenant context required",
            requestId,
          },
        };
      }

      const service = new PortalService(db);
      await service.syncPortalAccessFromRoles(
        { tenantId: tenant.id, userId: user.id },
        params.userId
      );

      if (audit) {
        await audit.log({
          action: "portal.access.synced",
          resourceType: "user_portal_access",
          resourceId: params.userId,
          metadata: { requestId },
        });
      }

      // Return updated access
      const portals = await service.getUserPortals({
        tenantId: tenant.id,
        userId: params.userId,
      });

      return { success: true, portals };
    },
    {
      beforeHandle: [requirePermission("users", "write")],
      params: t.Object({ userId: t.String() }),
      detail: {
        tags: ["Portal"],
        summary: "Sync portal access from roles",
      },
    }
  );

export type PortalRoutes = typeof portalRoutes;
