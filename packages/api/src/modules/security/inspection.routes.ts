/**
 * Permission Inspection Routes
 *
 * Advanced permission analysis endpoints: effective permissions for a user,
 * data scope resolution, permission simulation, and role comparison.
 *
 * Extracted from routes.ts for reduced cognitive complexity.
 * These are admin/debugging tools, not day-to-day operational endpoints.
 */

import { Elysia } from "elysia";
import { t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";

export const inspectionRoutes = new Elysia({ name: "security-inspection-routes" })

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
        // a dedicated simulation function -- for now, this returns the baseline)
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

export type InspectionRoutes = typeof inspectionRoutes;
