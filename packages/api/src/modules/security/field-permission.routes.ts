/**
 * Field Permission Routes
 *
 * API endpoints for field-level security management.
 */

import { Elysia, t } from "elysia";
import { requireTenantContext } from "../../plugins";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";
import { FieldPermissionService } from "./field-permission.service";
import {
  BulkFieldPermissionUpdateSchema,
  SetFieldPermissionSchema,
} from "./field-permission.schemas";

export const fieldPermissionRoutes = new Elysia({ prefix: "/fields" })
  // Get all field definitions
  .get(
    "/",
    async (ctx) => {
      const { tenant, user, db } = ctx as any;


      const service = new FieldPermissionService(db);
      const fields = await service.getAllFields({
        tenantId: tenant.id,
        userId: user.id,
      });

      return { fields };
    },
    {
      beforeHandle: [requireTenantContext, requirePermission("settings", "read")],
      detail: {
        tags: ["Field Security"],
        summary: "List all field definitions",
      },
    }
  )

  // Get fields for a specific entity
  .get(
    "/:entity",
    async (ctx) => {
      const { tenant, user, db, params } = ctx as any;


      const service = new FieldPermissionService(db);
      const fields = await service.getEntityFields(
        { tenantId: tenant.id, userId: user.id },
        params.entity
      );

      return { fields };
    },
    {
      beforeHandle: [requireTenantContext, requirePermission("settings", "read")],
      params: t.Object({ entity: t.String() }),
      detail: {
        tags: ["Field Security"],
        summary: "List fields for an entity",
      },
    }
  )

  // Get current user's effective field permissions
  .get(
    "/my-permissions",
    async (ctx) => {
      const { tenant, user, db, query } = ctx as any;


      const service = new FieldPermissionService(db);

      if (query?.entity) {
        // Get metadata for a specific entity
        const metadata = await service.getFieldMetadataGrouped(
          { tenantId: tenant.id, userId: user.id },
          query.entity
        );
        return { groups: metadata };
      }

      // Get all permissions as a map
      const permissions = await service.getUserFieldPermissions({
        tenantId: tenant.id,
        userId: user.id,
      });

      const permissionList = Array.from(permissions.values());
      return { permissions: permissionList };
    },
    {
      beforeHandle: [requireTenantContext],
      query: t.Object({
        entity: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Field Security"],
        summary: "Get current user's field permissions",
      },
    }
  )

  // Get field permissions for a specific role
  .get(
    "/roles/:roleId",
    async (ctx) => {
      const { tenant, user, db, params } = ctx as any;


      const service = new FieldPermissionService(db);
      const permissions = await service.getRoleFieldPermissions(
        { tenantId: tenant.id, userId: user.id },
        params.roleId
      );

      // Group by entity
      const grouped = new Map<string, typeof permissions>();
      for (const perm of permissions) {
        if (!grouped.has(perm.entityName)) {
          grouped.set(perm.entityName, []);
        }
        grouped.get(perm.entityName)!.push(perm);
      }

      return {
        roleId: params.roleId,
        entities: Array.from(grouped.entries()).map(([entityName, fields]) => ({
          entityName,
          fields,
        })),
      };
    },
    {
      beforeHandle: [requireTenantContext, requirePermission("roles", "read")],
      params: t.Object({ roleId: t.String() }),
      detail: {
        tags: ["Field Security"],
        summary: "Get role field permissions",
      },
    }
  )

  // Bulk update field permissions for a role
  .put(
    "/roles/:roleId",
    async (ctx) => {
      const { tenant, user, db, params, body, audit, requestId } =
        ctx as any;


      const service = new FieldPermissionService(db);
      const count = await service.bulkSetRoleFieldPermissions(
        { tenantId: tenant.id, userId: user.id },
        params.roleId,
        body.permissions
      );

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_UPDATED,
          resourceType: "role_field_permissions",
          resourceId: params.roleId,
          newValues: { updatedCount: count },
          metadata: { requestId },
        });
      }

      return { success: true, updatedCount: count };
    },
    {
      beforeHandle: [requireTenantContext, requirePermission("roles", "write")],
      params: t.Object({ roleId: t.String() }),
      body: BulkFieldPermissionUpdateSchema,
      detail: {
        tags: ["Field Security"],
        summary: "Bulk update role field permissions",
      },
    }
  )

  // Set single field permission for a role
  .put(
    "/roles/:roleId/fields/:fieldId",
    async (ctx) => {
      const { tenant, user, db, params, body, audit, requestId } =
        ctx as any;


      const service = new FieldPermissionService(db);
      await service.setRoleFieldPermission(
        { tenantId: tenant.id, userId: user.id },
        params.roleId,
        params.fieldId,
        body.permission
      );

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_UPDATED,
          resourceType: "role_field_permission",
          resourceId: `${params.roleId}:${params.fieldId}`,
          newValues: { permission: body.permission },
          metadata: { requestId },
        });
      }

      return { success: true };
    },
    {
      beforeHandle: [requireTenantContext, requirePermission("roles", "write")],
      params: t.Object({
        roleId: t.String(),
        fieldId: t.String(),
      }),
      body: SetFieldPermissionSchema,
      detail: {
        tags: ["Field Security"],
        summary: "Set field permission for a role",
      },
    }
  );

export type FieldPermissionRoutes = typeof fieldPermissionRoutes;
