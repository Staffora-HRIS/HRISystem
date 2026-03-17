/**
 * Security Module Routes
 *
 * Core security management endpoints: audit log, users, roles,
 * permissions, role-permissions, and role assignments.
 * All routes delegate to RbacSecurityService for business logic.
 */

import { Elysia } from "elysia";
import { t } from "elysia";
import { requireAuthContext } from "../../plugins";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";
import { ErrorCodes } from "../../plugins/errors";
import { RbacRepository } from "./rbac.repository";
import { RbacSecurityService } from "./rbac.service";
import type { TenantContext } from "../../types/service-result";

export const securityRoutes = new Elysia({ prefix: "/security" })

  // ===========================================================================
  // Plugin Setup - Derive tenant context, service, and repository
  // ===========================================================================
  .derive((ctx) => {
    const { db, tenant, user, rbacService } = ctx as any;
    const repository = new RbacRepository(db);
    const service = new RbacSecurityService(repository, db);
    if (rbacService) {
      service.setRbacService(rbacService);
    }
    const tenantContext: TenantContext = {
      tenantId: (tenant as any)?.id || "",
      userId: (user as any)?.id,
    };
    return { securityService: service, securityRepository: repository, tenantContext };
  })

  // ===========================================================================
  // Read-Only Routes
  // ===========================================================================

  .get("/my-permissions", async (ctx) => {
    const { user, session, securityService, authService, tenant, set, requestId } =
      ctx as any;

    const tenantId = tenant?.id ?? (await authService.getSessionTenant(session.id, user.id));

    if (!tenantId) {
      set.status = 400;
      return {
        error: {
          code: "MISSING_TENANT",
          message: "Tenant context required",
          requestId: requestId || "",
        },
      };
    }

    try {
      const effective = await securityService.getEffectivePermissions(tenantId, user.id);

      const permissions = new Set<string>(Array.from(effective.permissions));
      // Frontend expects super-admin wildcard to be "*" (it does not check for "*:*")
      if (effective.isSuperAdmin || permissions.has("*:*")) {
        permissions.add("*");
      }

      const roles = new Set<string>((effective.roles ?? []).map((r: any) => r.roleName));

      return {
        permissions: Array.from(permissions),
        roles: Array.from(roles),
      };
    } catch (error) {
      console.error("Security /my-permissions error:", error);
      set.status = 500;
      return {
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to load permissions",
          requestId: requestId || "",
        },
      };
    }
  }, {
    beforeHandle: [requireAuthContext],
    detail: {
      tags: ["Security"],
      summary: "Get my permissions",
    },
  })

  .get(
    "/audit-log",
    async (ctx) => {
      const { securityService, tenantContext, query } = ctx as any;

      const limitRaw = query?.limit;
      const cursorRaw = query?.cursor;
      const limit = Math.min(Math.max(Number(limitRaw ?? 50) || 50, 1), 200);
      const cursor = typeof cursorRaw === "string" && cursorRaw.length > 0 ? cursorRaw : null;

      return await securityService.getAuditLog(tenantContext, { limit, cursor });
    },
    {
      beforeHandle: [requirePermission("audit", "read")],
      query: t.Object({
        limit: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Security"],
        summary: "List audit log entries",
      },
    }
  )

  .get(
    "/users",
    async (ctx) => {
      const { securityService, tenantContext, query } = ctx as any;

      const limitRaw = query?.limit;
      const cursorRaw = query?.cursor;
      const searchRaw = query?.search;
      const includeInactiveRaw = query?.includeInactive;

      const limit = Math.min(Math.max(Number(limitRaw ?? 50) || 50, 1), 200);
      const cursor = typeof cursorRaw === "string" && cursorRaw.length > 0 ? cursorRaw : null;
      const search = typeof searchRaw === "string" && searchRaw.trim().length > 0 ? searchRaw.trim() : null;
      const includeInactive = includeInactiveRaw === "true" || includeInactiveRaw === "1";

      return await securityService.listUsers(tenantContext, {
        limit,
        cursor,
        search,
        includeInactive,
      });
    },
    {
      beforeHandle: [requirePermission("users", "read")],
      query: t.Object({
        limit: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        search: t.Optional(t.String()),
        includeInactive: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Security"],
        summary: "List tenant users",
      },
    }
  )

  .get(
    "/roles",
    async (ctx) => {
      const { securityService, tenantContext } = ctx as any;
      return await securityService.listRoles(tenantContext);
    },
    {
      beforeHandle: [requirePermission("roles", "read")],
      detail: {
        tags: ["Security"],
        summary: "List roles",
      },
    }
  )

  .get(
    "/permissions",
    async (ctx) => {
      const { securityService } = ctx as any;
      return await securityService.listPermissions();
    },
    {
      beforeHandle: [requirePermission("roles", "read")],
      detail: {
        tags: ["Security"],
        summary: "List permission catalog",
      },
    }
  )

  .get(
    "/roles/:id/permissions",
    async (ctx) => {
      const { securityService, tenantContext, params } = ctx as any;
      return await securityService.getRolePermissions(tenantContext, params.id);
    },
    {
      beforeHandle: [requirePermission("roles", "read")],
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Security"],
        summary: "Get role permissions",
      },
    }
  );

// ===========================================================================
// Mutating Routes
// ===========================================================================

securityRoutes
  .post(
    "/roles",
    async (ctx) => {
      const { securityService, tenantContext, body, audit, requestId, error } = ctx as any;

      const roleName = String(body?.name ?? "").trim();
      const description = body?.description ? String(body.description) : null;
      if (!roleName) {
        return error(400, {
          error: { code: ErrorCodes.VALIDATION_ERROR, message: "Role name is required", requestId },
        });
      }

      const result = await securityService.createRole(tenantContext, {
        name: roleName,
        description,
      });

      if (!result.success) {
        return error(500, {
          error: { code: result.error.code, message: result.error.message, requestId },
        });
      }

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_CREATED,
          resourceType: "role",
          resourceId: result.data.id,
          newValues: { id: result.data.id, name: roleName, description },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("roles", "write")],
      body: t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Security"],
        summary: "Create role",
      },
    }
  )

  .put(
    "/roles/:id",
    async (ctx) => {
      const { securityService, tenantContext, params, body, audit, requestId, error } = ctx as any;

      const roleId = params.id;
      const name = body?.name ? String(body.name).trim() : null;
      const description = body?.description !== undefined ? String(body.description ?? "").trim() : null;

      const result = await securityService.updateRole(tenantContext, roleId, {
        name,
        description,
      });

      if (!result.success) {
        const statusMap: Record<string, number> = {
          [ErrorCodes.NOT_FOUND]: 404,
          [ErrorCodes.FORBIDDEN]: 403,
          [ErrorCodes.INTERNAL_ERROR]: 500,
        };
        const status = statusMap[result.error.code] ?? 500;
        return error(status, {
          error: { code: result.error.code, message: result.error.message, requestId },
        });
      }

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_UPDATED,
          resourceType: "role",
          resourceId: result.data.id,
          oldValues: result.data.oldRole,
          newValues: { id: result.data.id, name: result.data.name, description: result.data.description },
          metadata: { requestId },
        });
      }

      return { id: result.data.id, name: result.data.name, description: result.data.description };
    },
    {
      beforeHandle: [requirePermission("roles", "write")],
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Security"],
        summary: "Update role",
      },
    }
  )

  .delete(
    "/roles/:id",
    async (ctx) => {
      const { securityService, tenantContext, params, audit, requestId, error } = ctx as any;
      const roleId = params.id;

      const result = await securityService.deleteRole(tenantContext, roleId);

      if (!result.success) {
        const statusMap: Record<string, number> = {
          [ErrorCodes.NOT_FOUND]: 404,
          [ErrorCodes.FORBIDDEN]: 403,
          [ErrorCodes.INTERNAL_ERROR]: 500,
        };
        const status = statusMap[result.error.code] ?? 500;
        return error(status, {
          error: { code: result.error.code, message: result.error.message, requestId },
        });
      }

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_DELETED,
          resourceType: "role",
          resourceId: result.data.oldRole.id,
          oldValues: result.data.oldRole,
          metadata: { requestId },
        });
      }

      return { success: true };
    },
    {
      beforeHandle: [requirePermission("roles", "delete")],
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Security"],
        summary: "Delete role",
      },
    }
  )

  .post(
    "/roles/:id/permissions",
    async (ctx) => {
      const { securityService, tenantContext, params, body, audit, requestId, error } = ctx as any;

      const roleId = params.id;
      const resource = String(body.resource).trim();
      const action = String(body.action).trim();

      const result = await securityService.grantPermissionToRole(
        tenantContext,
        roleId,
        resource,
        action
      );

      if (!result.success) {
        const statusMap: Record<string, number> = {
          [ErrorCodes.NOT_FOUND]: 404,
          [ErrorCodes.FORBIDDEN]: 403,
          [ErrorCodes.INTERNAL_ERROR]: 500,
        };
        const status = statusMap[result.error.code] ?? 500;
        return error(status, {
          error: { code: result.error.code, message: result.error.message, requestId },
        });
      }

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_UPDATED,
          resourceType: "role",
          resourceId: roleId,
          newValues: { granted: `${resource}:${action}`, role: result.data.roleName },
          metadata: { requestId },
        });
      }

      return { success: true, id: result.data.id };
    },
    {
      beforeHandle: [requirePermission("roles", "write")],
      params: t.Object({ id: t.String() }),
      body: t.Object({
        resource: t.String(),
        action: t.String(),
      }),
      detail: {
        tags: ["Security"],
        summary: "Grant permission to role",
      },
    }
  )

  .delete(
    "/roles/:id/permissions",
    async (ctx) => {
      const { securityService, tenantContext, params, query, audit, requestId, error } = ctx as any;
      const roleId = params.id;
      const resource = String(query.resource ?? "").trim();
      const action = String(query.action ?? "").trim();

      if (!resource || !action) {
        return error(400, {
          error: { code: ErrorCodes.VALIDATION_ERROR, message: "resource and action are required", requestId },
        });
      }

      const result = await securityService.revokePermissionFromRole(
        tenantContext,
        roleId,
        resource,
        action
      );

      if (!result.success) {
        const statusMap: Record<string, number> = {
          [ErrorCodes.NOT_FOUND]: 404,
          [ErrorCodes.FORBIDDEN]: 403,
        };
        const status = statusMap[result.error.code] ?? 500;
        return error(status, {
          error: { code: result.error.code, message: result.error.message, requestId },
        });
      }

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_UPDATED,
          resourceType: "role",
          resourceId: roleId,
          newValues: { revoked: `${resource}:${action}` },
          metadata: { requestId },
        });
      }

      return { success: true };
    },
    {
      beforeHandle: [requirePermission("roles", "write")],
      params: t.Object({ id: t.String() }),
      query: t.Object({
        resource: t.String(),
        action: t.String(),
      }),
      detail: {
        tags: ["Security"],
        summary: "Revoke permission from role",
      },
    }
  )

  .post(
    "/users/:id/roles",
    async (ctx) => {
      const { securityService, tenantContext, params, body, audit, requestId, error } = ctx as any;

      const targetUserId = params.id;
      const roleId = String(body.roleId);
      const constraints = body.constraints ?? {};

      const result = await securityService.assignRoleToUser(
        tenantContext,
        targetUserId,
        roleId,
        constraints
      );

      if (!result.success) {
        return error(500, {
          error: { code: result.error.code, message: result.error.message, requestId },
        });
      }

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_ASSIGNED,
          resourceType: "role_assignment",
          resourceId: result.data.id,
          newValues: { userId: targetUserId, roleId, constraints },
          metadata: { requestId },
        });
      }

      return { id: result.data.id };
    },
    {
      beforeHandle: [requirePermission("roles", "assign")],
      params: t.Object({ id: t.String() }),
      body: t.Object({
        roleId: t.String(),
        constraints: t.Optional(t.Any()),
      }),
      detail: {
        tags: ["Security"],
        summary: "Assign role to user",
      },
    }
  )

  .delete(
    "/role-assignments/:id",
    async (ctx) => {
      const { securityService, params, audit, requestId, error } = ctx as any;
      const assignmentId = params.id;

      const result = await securityService.revokeRoleAssignment(assignmentId);

      if (!result.success) {
        return error(404, {
          error: { code: result.error.code, message: result.error.message, requestId },
        });
      }

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_REVOKED,
          resourceType: "role_assignment",
          resourceId: assignmentId,
          metadata: { requestId },
        });
      }

      return { success: true };
    },
    {
      beforeHandle: [requirePermission("roles", "assign")],
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Security"],
        summary: "Revoke role assignment",
      },
    }
  );

// ===========================================================================
// Permission Inspection & Data Scope Routes
// ===========================================================================

securityRoutes
  .get(
    "/users/:id/effective-permissions",
    async (ctx) => {
      const { securityService, tenantContext, params, set, requestId } = ctx as any;

      try {
        const effective = await securityService.getEffectivePermissions(
          tenantContext.tenantId,
          params.id
        );

        const permissions = Array.from(effective.permissions);
        const roles = (effective.roles ?? []).map((r: any) => ({
          name: r.roleName,
          isSystem: r.isSystem,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo,
          constraints: r.constraints,
        }));

        return {
          userId: params.id,
          tenantId: tenantContext.tenantId,
          permissions,
          roles,
          isSuperAdmin: effective.isSuperAdmin,
          isTenantAdmin: effective.isTenantAdmin,
        };
      } catch (error: any) {
        set.status = 500;
        return {
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to resolve permissions",
            requestId: requestId || "",
          },
        };
      }
    },
    {
      beforeHandle: [requirePermission("roles", "read")],
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Security"],
        summary: "Get user effective permissions (inspector)",
      },
    }
  )

  .get(
    "/users/:id/data-scope",
    async (ctx) => {
      const { rbacService, tenantContext, params, query, set, requestId } = ctx as any;

      if (!rbacService) {
        set.status = 500;
        return {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: "RBAC service not available", requestId },
        };
      }

      try {
        const resource = query?.resource || "employees";
        const employeeIds = await rbacService.resolveDataScope(
          tenantContext.tenantId,
          params.id,
          resource
        );

        return {
          userId: params.id,
          resource,
          employeeCount: employeeIds.length,
          employeeIds: employeeIds.slice(0, 100),
          truncated: employeeIds.length > 100,
        };
      } catch (error: any) {
        set.status = 500;
        return {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to resolve data scope", requestId },
        };
      }
    },
    {
      beforeHandle: [requirePermission("roles", "read")],
      params: t.Object({ id: t.String() }),
      query: t.Object({ resource: t.Optional(t.String()) }),
      detail: {
        tags: ["Security"],
        summary: "Get user data scope (which employees they can see)",
      },
    }
  )

  .post(
    "/permissions/simulate",
    async (ctx) => {
      const { securityService, rbacService, tenantContext, body, set, requestId } = ctx as any;

      if (!rbacService) {
        set.status = 500;
        return {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: "RBAC service not available", requestId },
        };
      }

      try {
        // Get current effective permissions for comparison
        const currentEffective = await securityService.getEffectivePermissions(
          tenantContext.tenantId,
          body.userId
        );

        // Return current permissions (simulation of add/remove would require
        // a dedicated simulation function — for now, this returns the baseline)
        return {
          userId: body.userId,
          currentPermissions: Array.from(currentEffective.permissions),
          currentRoles: (currentEffective.roles ?? []).map((r: any) => r.roleName),
          requestedChanges: {
            addRoles: body.addRoles ?? [],
            removeRoles: body.removeRoles ?? [],
          },
          note: "Full simulation with role add/remove requires the enhanced permission resolver",
        };
      } catch (error: any) {
        set.status = 500;
        return {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to simulate permissions", requestId },
        };
      }
    },
    {
      beforeHandle: [requirePermission("roles", "read")],
      body: t.Object({
        userId: t.String(),
        addRoles: t.Optional(t.Array(t.String())),
        removeRoles: t.Optional(t.Array(t.String())),
      }),
      detail: {
        tags: ["Security"],
        summary: "Simulate permission changes",
      },
    }
  )

  .get(
    "/roles/compare",
    async (ctx) => {
      const { securityService, tenantContext, query, set, requestId } = ctx as any;

      const roleIdA = query?.roleA;
      const roleIdB = query?.roleB;

      if (!roleIdA || !roleIdB) {
        set.status = 400;
        return {
          error: { code: "VALIDATION_ERROR", message: "roleA and roleB query params required", requestId },
        };
      }

      try {
        const [permsA, permsB] = await Promise.all([
          securityService.getRolePermissions(tenantContext, roleIdA),
          securityService.getRolePermissions(tenantContext, roleIdB),
        ]);

        const keysA = new Set(permsA.map((p: any) => p.key));
        const keysB = new Set(permsB.map((p: any) => p.key));

        const onlyInA = [...keysA].filter((k) => !keysB.has(k));
        const onlyInB = [...keysB].filter((k) => !keysA.has(k));
        const inBoth = [...keysA].filter((k) => keysB.has(k));

        return {
          roleA: roleIdA,
          roleB: roleIdB,
          onlyInA,
          onlyInB,
          inBoth,
          totalA: keysA.size,
          totalB: keysB.size,
        };
      } catch (error: any) {
        set.status = 500;
        return {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to compare roles", requestId },
        };
      }
    },
    {
      beforeHandle: [requirePermission("roles", "read")],
      query: t.Object({
        roleA: t.String(),
        roleB: t.String(),
      }),
      detail: {
        tags: ["Security"],
        summary: "Compare two roles side by side",
      },
    }
  );

securityRoutes.get(
  "/users/:id/role-assignments",
  async (ctx) => {
    const { securityService, tenantContext, params, query } = ctx as any;

    const includeInactiveRaw = query?.includeInactive;
    const includeInactive = includeInactiveRaw === "true" || includeInactiveRaw === "1";

    return await securityService.getUserRoleAssignments(
      tenantContext,
      params.id,
      { includeInactive }
    );
  },
  {
    beforeHandle: [requirePermission("roles", "read")],
    params: t.Object({ id: t.String() }),
    query: t.Object({
      includeInactive: t.Optional(t.String()),
    }),
    detail: {
      tags: ["Security"],
      summary: "List user role assignments",
    },
  }
);

export type SecurityRoutes = typeof securityRoutes;
