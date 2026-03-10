import { Elysia } from "elysia";
import { t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";

export const securityRoutes = new Elysia({ prefix: "/security" })
  .get("/my-permissions", async (ctx) => {
    const { user, session, rbacService, authService, tenant, set, requestId } =
      ctx as any;

    if (!user || !session) {
      set.status = 401;
      return {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
          requestId: requestId || "",
        },
      };
    }

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
      const effective = await rbacService.getEffectivePermissions(tenantId, user.id);

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
          code: "INTERNAL_ERROR",
          message: "Failed to load permissions",
          requestId: requestId || "",
        },
      };
    }
  })

  .get(
    "/audit-log",
    async (ctx) => {
      const { tenant, user, db, query } = ctx as any;

      const limitRaw = query?.limit;
      const cursorRaw = query?.cursor;
      const limit = Math.min(Math.max(Number(limitRaw ?? 50) || 50, 1), 200);
      const cursor = typeof cursorRaw === "string" && cursorRaw.length > 0 ? cursorRaw : null;

      const rows = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          return await tx<
            Array<{
              id: string;
              action: string;
              resourceType: string;
              resourceId: string | null;
              actorName: string | null;
              actorEmail: string | null;
              createdAt: Date;
              requestId: string | null;
            }>
          >`
            SELECT
              al.id,
              al.action,
              al.resource_type,
              al.resource_id::text as resource_id,
              u.name as actor_name,
              u.email as actor_email,
              al.created_at,
              al.request_id
            FROM app.audit_log al
            LEFT JOIN app.users u ON u.id = al.user_id
            ${
              cursor
                ? tx`
                    WHERE (al.created_at, al.id) < (
                      SELECT created_at, id FROM app.audit_log WHERE id = ${cursor}::uuid
                    )
                  `
                : tx``
            }
            ORDER BY al.created_at DESC, al.id DESC
            LIMIT ${limit}
          `;
        }
      );

      // Handle both camelCase (TypeScript) and snake_case (PostgreSQL) column names
      return rows.map((r) => {
        const raw = r as Record<string, unknown>;
        const actorName = raw.actorName ?? raw.actor_name;
        const actorEmail = raw.actorEmail ?? raw.actor_email;
        const resourceId = raw.resourceId ?? raw.resource_id;
        const resourceType = raw.resourceType ?? raw.resource_type;
        const createdAt = raw.createdAt ?? raw.created_at;
        const requestId = raw.requestId ?? raw.request_id;

        const actor = actorName || actorEmail || "System";
        const resource = resourceId ? `${resourceType} ${resourceId}` : String(resourceType);

        const toISOString = (value: unknown): string => {
          if (value instanceof Date) return value.toISOString();
          if (typeof value === "string") return value;
          return new Date().toISOString();
        };

        return {
          id: r.id,
          action: r.action,
          resource,
          actor: String(actor),
          timestamp: toISOString(createdAt),
          details: requestId ? `request:${requestId}` : undefined,
        };
      });
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
      const { tenant, user, db, query } = ctx as any;

      const limitRaw = query?.limit;
      const cursorRaw = query?.cursor;
      const searchRaw = query?.search;
      const includeInactiveRaw = query?.includeInactive;

      const limit = Math.min(Math.max(Number(limitRaw ?? 50) || 50, 1), 200);
      const cursor = typeof cursorRaw === "string" && cursorRaw.length > 0 ? cursorRaw : null;
      const search = typeof searchRaw === "string" && searchRaw.trim().length > 0 ? searchRaw.trim() : null;
      const includeInactive = includeInactiveRaw === "true" || includeInactiveRaw === "1";

      const rows = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          return await tx<
            Array<{
              id: string;
              email: string;
              name: string | null;
              status: string;
              emailVerified: boolean;
              mfaEnabled: boolean;
              joinedAt: Date;
              isPrimary: boolean;
              roles: string[] | null;
              createdAt: Date;
            }>
          >`
            SELECT
              u.id::text as id,
              u.email,
              u.name,
              u.status,
              u.email_verified,
              u.mfa_enabled,
              ut.joined_at,
              ut.is_primary,
              COALESCE(roles.roles, '{}'::text[]) as roles,
              u.created_at
            FROM app.user_tenants ut
            JOIN app.users u ON u.id = ut.user_id
            LEFT JOIN LATERAL (
              SELECT array_agg(r.role_name ORDER BY r.is_system DESC, r.role_name ASC) as roles
              FROM app.get_user_roles(${tenant.id}::uuid, u.id::uuid) r
            ) roles ON true
            WHERE ut.tenant_id = ${tenant.id}::uuid
              AND (${includeInactive} OR ut.status = 'active')
              ${
                search
                  ? tx`AND (u.email ILIKE ${`%${search}%`} OR u.name ILIKE ${`%${search}%`})`
                  : tx``
              }
              ${
                cursor
                  ? tx`
                      AND (u.created_at, u.id) < (
                        SELECT created_at, id FROM app.users WHERE id = ${cursor}::uuid
                      )
                    `
                  : tx``
              }
            ORDER BY u.created_at DESC, u.id DESC
            LIMIT ${limit}
          `;
        }
      );

      // Handle both camelCase (TypeScript) and snake_case (PostgreSQL) column names
      return rows.map((r) => {
        const raw = r as Record<string, unknown>;
        const emailVerified = raw.emailVerified ?? raw.email_verified;
        const mfaEnabled = raw.mfaEnabled ?? raw.mfa_enabled;
        const joinedAt = raw.joinedAt ?? raw.joined_at;
        const isPrimary = raw.isPrimary ?? raw.is_primary;
        const createdAt = raw.createdAt ?? raw.created_at;

        const toISOString = (value: unknown): string => {
          if (value instanceof Date) return value.toISOString();
          if (typeof value === "string") return value;
          return new Date().toISOString();
        };

        return {
          id: r.id,
          email: r.email,
          name: r.name,
          status: r.status,
          emailVerified: Boolean(emailVerified),
          mfaEnabled: Boolean(mfaEnabled),
          joinedAt: toISOString(joinedAt),
          isPrimary: Boolean(isPrimary),
          roles: r.roles ?? [],
          createdAt: toISOString(createdAt),
        };
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
      const { tenant, user, db } = ctx as any;

      const rows = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          return await tx<
            Array<{
              id: string;
              name: string;
              description: string | null;
              isSystem: boolean;
              tenantId: string | null;
              permissionsCount: number;
            }>
          >`
            SELECT
              r.id::text as id,
              r.name,
              r.description,
              r.is_system,
              r.tenant_id::text as tenant_id,
              COALESCE(jsonb_object_length(r.permissions), 0)::int as permissions_count
            FROM app.roles r
            WHERE r.tenant_id = ${tenant.id}::uuid OR r.tenant_id IS NULL
            ORDER BY r.is_system DESC, r.name ASC
          `;
        }
      );

      // Handle both camelCase (TypeScript) and snake_case (PostgreSQL) column names
      return rows.map((r) => {
        const raw = r as Record<string, unknown>;
        const isSystem = raw.isSystem ?? raw.is_system;
        const tenantId = raw.tenantId ?? raw.tenant_id;
        const permissionsCount = raw.permissionsCount ?? raw.permissions_count;

        return {
          id: r.id,
          name: r.name,
          description: r.description,
          isSystem: Boolean(isSystem),
          tenantId: tenantId ? String(tenantId) : null,
          permissionsCount: Number(permissionsCount ?? 0),
        };
      });
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
      const { db } = ctx as any;
      const rows = await db.withSystemContext(async (tx: any) => {
        return await tx<
          Array<{
            id: string;
            resource: string;
            action: string;
            description: string | null;
            module: string | null;
            requiresMfa: boolean;
          }>
        >`
          SELECT
            id::text as id,
            resource,
            action,
            description,
            module,
            requires_mfa
          FROM app.permissions
          ORDER BY module NULLS LAST, resource ASC, action ASC
        `;
      });

      return rows.map((r) => ({
        id: r.id,
        resource: r.resource,
        action: r.action,
        key: `${r.resource}:${r.action}`,
        description: r.description,
        module: r.module,
        requiresMfa: r.requiresMfa,
      }));
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
      const { db, tenant, user, params } = ctx as any;

      const rows = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          return await tx<
            Array<{
              permissionId: string;
              resource: string;
              action: string;
              permissionKey: string;
              description: string | null;
              requiresMfa: boolean;
              module: string | null;
            }>
          >`
            SELECT
              permission_id::text as permission_id,
              resource,
              action,
              permission_key,
              description,
              requires_mfa,
              module
            FROM app.get_role_permissions(${params.id}::uuid)
          `;
        }
      );

      return rows.map((r) => ({
        id: r.permissionId,
        resource: r.resource,
        action: r.action,
        key: r.permissionKey,
        description: r.description,
        requiresMfa: r.requiresMfa,
        module: r.module,
      }));
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

securityRoutes
  .post(
    "/roles",
    async (ctx) => {
      const { tenant, user, db, body, audit, requestId, error } = ctx as any;

      const roleName = String(body?.name ?? "").trim();
      const description = body?.description ? String(body.description) : null;
      if (!roleName) {
        return error(400, {
          error: { code: "VALIDATION_ERROR", message: "Role name is required", requestId },
        });
      }

      const [created] = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          return await tx<{ id: string }[]>`
            INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
            VALUES (gen_random_uuid(), ${tenant.id}::uuid, ${roleName}, ${description}, false, '{}'::jsonb)
            RETURNING id::text as id
          `;
        }
      );

      if (!created?.id) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: "Failed to create role", requestId },
        });
      }

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_CREATED,
          resourceType: "role",
          resourceId: created.id,
          newValues: { id: created.id, name: roleName, description },
          metadata: { requestId },
        });
      }

      return { id: created.id, name: roleName, description, isSystem: false, tenantId: tenant.id };
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
      const { tenant, user, db, params, body, audit, requestId, error } = ctx as any;

      const roleId = params.id;
      const name = body?.name ? String(body.name).trim() : null;
      const description = body?.description !== undefined ? String(body.description ?? "").trim() : null;

      const [oldRole] = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          return await tx<
            Array<{ id: string; name: string; description: string | null; isSystem: boolean }>
          >`
            SELECT id::text as id, name, description, is_system
            FROM app.roles
            WHERE id = ${roleId}::uuid
              AND (tenant_id = ${tenant.id}::uuid OR tenant_id IS NULL)
            LIMIT 1
          `;
        }
      );

      if (!oldRole?.id) {
        return error(404, {
          error: { code: "NOT_FOUND", message: "Role not found", requestId },
        });
      }

      if (oldRole.isSystem) {
        return error(403, {
          error: { code: "FORBIDDEN", message: "System roles cannot be modified", requestId },
        });
      }

      const [updated] = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          return await tx<{ id: string; name: string; description: string | null }[]>`
            UPDATE app.roles
            SET
              name = COALESCE(${name}, name),
              description = ${description},
              updated_at = now()
            WHERE id = ${roleId}::uuid
              AND tenant_id = ${tenant.id}::uuid
            RETURNING id::text as id, name, description
          `;
        }
      );

      if (!updated?.id) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: "Failed to update role", requestId },
        });
      }

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_UPDATED,
          resourceType: "role",
          resourceId: updated.id,
          oldValues: oldRole,
          newValues: updated,
          metadata: { requestId },
        });
      }

      return { id: updated.id, name: updated.name, description: updated.description };
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
      const { tenant, user, db, params, audit, requestId, error } = ctx as any;
      const roleId = params.id;

      const [oldRole] = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          return await tx<
            Array<{ id: string; name: string; description: string | null; isSystem: boolean }>
          >`
            SELECT id::text as id, name, description, is_system
            FROM app.roles
            WHERE id = ${roleId}::uuid
              AND (tenant_id = ${tenant.id}::uuid OR tenant_id IS NULL)
            LIMIT 1
          `;
        }
      );

      if (!oldRole?.id) {
        return error(404, {
          error: { code: "NOT_FOUND", message: "Role not found", requestId },
        });
      }

      if (oldRole.isSystem) {
        return error(403, {
          error: { code: "FORBIDDEN", message: "System roles cannot be deleted", requestId },
        });
      }

      const result = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          await tx`DELETE FROM app.role_permissions WHERE role_id = ${roleId}::uuid`;
          const deleted = await tx<{ id: string }[]>`
            DELETE FROM app.roles
            WHERE id = ${roleId}::uuid
              AND tenant_id = ${tenant.id}::uuid
            RETURNING id::text as id
          `;
          return deleted.length > 0;
        }
      );

      if (!result) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: "Failed to delete role", requestId },
        });
      }

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_DELETED,
          resourceType: "role",
          resourceId: oldRole.id,
          oldValues: oldRole,
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
      const { tenant, user, db, params, body, audit, requestId, error } = ctx as any;

      const roleId = params.id;
      const resource = String(body.resource).trim();
      const action = String(body.action).trim();

      const [oldRole] = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          return await tx<
            Array<{ id: string; name: string; isSystem: boolean; tenantId: string | null }>
          >`
            SELECT id::text as id, name, is_system, tenant_id::text as tenant_id
            FROM app.roles
            WHERE id = ${roleId}::uuid
              AND (tenant_id = ${tenant.id}::uuid OR tenant_id IS NULL)
            LIMIT 1
          `;
        }
      );

      if (!oldRole?.id) {
        return error(404, {
          error: { code: "NOT_FOUND", message: "Role not found", requestId },
        });
      }

      // Only allow modification of tenant-owned roles, not system roles
      if (!oldRole.tenantId) {
        return error(403, {
          error: { code: "FORBIDDEN", message: "Cannot modify system roles", requestId },
        });
      }

      if (oldRole.tenantId !== tenant.id) {
        return error(404, {
          error: { code: "NOT_FOUND", message: "Role not found", requestId },
        });
      }

      const granted = await db.withSystemContext(async (tx: any) => {
        const rows = await tx<{ id: string }[]>`
          SELECT app.grant_permission_to_role(
            ${tenant.id}::uuid,
            ${roleId}::uuid,
            ${resource},
            ${action},
            ${user.id}::uuid
          )::text as id
        `;
        return rows[0]?.id ?? null;
      });

      if (!granted) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: "Failed to grant permission", requestId },
        });
      }

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_UPDATED,
          resourceType: "role",
          resourceId: roleId,
          newValues: { granted: `${resource}:${action}`, role: oldRole.name },
          metadata: { requestId },
        });
      }

      return { success: true, id: granted };
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
      const { tenant, user, db, params, query, audit, requestId, error } = ctx as any;
      const roleId = params.id;
      const resource = String(query.resource ?? "").trim();
      const action = String(query.action ?? "").trim();

      if (!resource || !action) {
        return error(400, {
          error: { code: "VALIDATION_ERROR", message: "resource and action are required", requestId },
        });
      }

      // Verify role belongs to current tenant before modifying with system context
      const [targetRole] = await db.withTransaction(
        { tenantId: tenant.id, userId: user.id },
        async (tx: any) => {
          return await tx<
            Array<{ id: string; name: string; isSystem: boolean; tenantId: string | null }>
          >`
            SELECT id::text as id, name, is_system, tenant_id::text as tenant_id
            FROM app.roles
            WHERE id = ${roleId}::uuid
              AND (tenant_id = ${tenant.id}::uuid OR tenant_id IS NULL)
            LIMIT 1
          `;
        }
      );

      if (!targetRole?.id) {
        return error(404, {
          error: { code: "NOT_FOUND", message: "Role not found", requestId },
        });
      }

      // Only allow modification of tenant-owned roles, not system roles
      if (!targetRole.tenantId) {
        return error(403, {
          error: { code: "FORBIDDEN", message: "Cannot modify system roles", requestId },
        });
      }

      if (targetRole.tenantId !== tenant.id) {
        return error(404, {
          error: { code: "NOT_FOUND", message: "Role not found", requestId },
        });
      }

      const revoked = await db.withSystemContext(async (tx: any) => {
        const rows = await tx<{ revoked: boolean }[]>`
          SELECT app.revoke_permission_from_role(
            ${roleId}::uuid,
            ${resource},
            ${action}
          ) as revoked
        `;
        return rows[0]?.revoked === true;
      });

      if (!revoked) {
        return error(404, {
          error: { code: "NOT_FOUND", message: "Permission not found on role", requestId },
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
      const { tenant, user, db, params, body, audit, requestId, error } = ctx as any;

      const targetUserId = params.id;
      const roleId = String(body.roleId);
      const constraints = body.constraints ?? {};

      const assignmentId = await db.withSystemContext(async (tx: any) => {
        const rows = await tx<{ id: string }[]>`
          SELECT app.assign_role_to_user(
            ${tenant.id}::uuid,
            ${targetUserId}::uuid,
            ${roleId}::uuid,
            ${user.id}::uuid,
            ${JSON.stringify(constraints)}::jsonb
          )::text as id
        `;
        return rows[0]?.id ?? null;
      });

      if (!assignmentId) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: "Failed to assign role", requestId },
        });
      }

      if (audit) {
        await audit.log({
          action: AuditActions.ROLE_ASSIGNED,
          resourceType: "role_assignment",
          resourceId: assignmentId,
          newValues: { userId: targetUserId, roleId, constraints },
          metadata: { requestId },
        });
      }

      return { id: assignmentId };
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
      const { db, params, audit, requestId, error } = ctx as any;
      const assignmentId = params.id;

      const revoked = await db.withSystemContext(async (tx: any) => {
        const rows = await tx<{ revoked: boolean }[]>`
          SELECT app.revoke_role_from_user(${assignmentId}::uuid) as revoked
        `;
        return rows[0]?.revoked === true;
      });

      if (!revoked) {
        return error(404, {
          error: { code: "NOT_FOUND", message: "Role assignment not found", requestId },
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

securityRoutes.get(
  "/users/:id/role-assignments",
  async (ctx) => {
    const { tenant, user, db, params, query } = ctx as any;

    const includeInactiveRaw = query?.includeInactive;
    const includeInactive = includeInactiveRaw === "true" || includeInactiveRaw === "1";

    const rows = await db.withTransaction(
      { tenantId: tenant.id, userId: user.id },
      async (tx: any) => {
        return await tx<
          Array<{
            id: string;
            roleId: string;
            roleName: string;
            isSystem: boolean;
            constraints: unknown;
            effectiveFrom: Date;
            effectiveTo: Date | null;
            assignedAt: Date;
            assignedBy: string | null;
          }>
        >`
          SELECT
            ra.id::text as id,
            ra.role_id::text as role_id,
            r.name as role_name,
            r.is_system,
            ra.constraints,
            ra.effective_from,
            ra.effective_to,
            ra.assigned_at,
            ra.assigned_by::text as assigned_by
          FROM app.role_assignments ra
          JOIN app.roles r ON r.id = ra.role_id
          WHERE ra.tenant_id = ${tenant.id}::uuid
            AND ra.user_id = ${params.id}::uuid
            AND (${includeInactive} OR ra.effective_to IS NULL OR ra.effective_to > now())
          ORDER BY ra.assigned_at DESC, ra.created_at DESC
        `;
      }
    );

    return rows.map((r) => ({
      id: r.id,
      roleId: r.roleId,
      roleName: r.roleName,
      isSystem: r.isSystem,
      constraints: r.constraints,
      effectiveFrom: r.effectiveFrom.toISOString(),
      effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
      assignedAt: r.assignedAt.toISOString(),
      assignedBy: r.assignedBy,
    }));
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
