/**
 * RBAC Repository
 *
 * Database operations for role-based access control:
 * audit log, users, roles, permissions, role-permissions, role assignments.
 * All tenant-scoped queries respect RLS via tenant context.
 */

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Row Types
// =============================================================================

export interface AuditLogRow {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: Date;
  requestId: string | null;
}

export interface UserRow {
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
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  tenantId: string | null;
  permissionsCount: number;
}

export interface PermissionRow {
  id: string;
  resource: string;
  action: string;
  description: string | null;
  module: string | null;
  requiresMfa: boolean;
}

export interface RolePermissionRow {
  permissionId: string;
  resource: string;
  action: string;
  permissionKey: string;
  description: string | null;
  requiresMfa: boolean;
  module: string | null;
}

export interface RoleDetailRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  tenantId: string | null;
}

export interface RoleAssignmentRow {
  id: string;
  roleId: string;
  roleName: string;
  isSystem: boolean;
  constraints: unknown;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  assignedAt: Date;
  assignedBy: string | null;
}

// =============================================================================
// RBAC Repository
// =============================================================================

export class RbacRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Audit Log
  // ===========================================================================

  async getAuditLog(
    ctx: TenantContext,
    options: { limit: number; cursor: string | null }
  ): Promise<AuditLogRow[]> {
    const { limit, cursor } = options;

    return await this.db.withTransaction(ctx, async (tx: any) => {
      return await tx<AuditLogRow[]>`
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
    });
  }

  // ===========================================================================
  // Users
  // ===========================================================================

  async listUsers(
    ctx: TenantContext,
    options: {
      limit: number;
      cursor: string | null;
      search: string | null;
      includeInactive: boolean;
    }
  ): Promise<UserRow[]> {
    const { limit, cursor, search, includeInactive } = options;

    return await this.db.withTransaction(ctx, async (tx: any) => {
      return await tx<UserRow[]>`
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
          FROM app.get_user_roles(${ctx.tenantId}::uuid, u.id::uuid) r
        ) roles ON true
        WHERE ut.tenant_id = ${ctx.tenantId}::uuid
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
    });
  }

  // ===========================================================================
  // Roles
  // ===========================================================================

  async listRoles(ctx: TenantContext): Promise<RoleRow[]> {
    return await this.db.withTransaction(ctx, async (tx: any) => {
      return await tx<RoleRow[]>`
        SELECT
          r.id::text as id,
          r.name,
          r.description,
          r.is_system,
          r.tenant_id::text as tenant_id,
          COALESCE((SELECT COUNT(*)::int FROM app.role_permissions rp WHERE rp.role_id = r.id), 0) as permissions_count
        FROM app.roles r
        WHERE r.tenant_id = ${ctx.tenantId}::uuid OR r.tenant_id IS NULL
        ORDER BY r.is_system DESC, r.name ASC
      `;
    });
  }

  async getRoleById(
    ctx: TenantContext,
    roleId: string
  ): Promise<RoleDetailRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: any) => {
      return await tx<RoleDetailRow[]>`
        SELECT id::text as id, name, description, is_system, tenant_id::text as tenant_id
        FROM app.roles
        WHERE id = ${roleId}::uuid
          AND (tenant_id = ${ctx.tenantId}::uuid OR tenant_id IS NULL)
        LIMIT 1
      `;
    });

    return rows[0] ?? null;
  }

  async createRole(
    ctx: TenantContext,
    data: { name: string; description: string | null }
  ): Promise<{ id: string; error?: string } | null> {
    try {
      // Use withSystemContext to bypass RLS for INSERT — the tenant_id is set
      // explicitly in the VALUES clause, so tenant isolation is still enforced.
      // This matches the pattern used by grantPermissionToRole, assignRoleToUser,
      // and other mutating operations in this repository.
      const rows = await this.db.withSystemContext(async (tx: any) => {
        return await tx<{ id: string }[]>`
          INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
          VALUES (gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.name}, ${data.description}, false, '{}'::jsonb)
          RETURNING id::text as id
        `;
      });

      return rows[0] ?? null;
    } catch (err: any) {
      // Handle unique constraint violation (duplicate role name for this tenant)
      const message = typeof err?.message === "string" ? err.message : String(err);
      if (message.includes("roles_name_unique") || message.includes("unique") || message.includes("duplicate key")) {
        return { id: "", error: "DUPLICATE_ROLE_NAME" };
      }
      throw err;
    }
  }

  async updateRole(
    ctx: TenantContext,
    roleId: string,
    data: { name: string | null; description: string | null }
  ): Promise<{ id: string; name: string; description: string | null } | null> {
    // Use withSystemContext to bypass RLS — tenant_id is enforced in the WHERE clause.
    const rows = await this.db.withSystemContext(async (tx: any) => {
      return await tx<{ id: string; name: string; description: string | null }[]>`
        UPDATE app.roles
        SET
          name = COALESCE(${data.name}, name),
          description = ${data.description},
          updated_at = now()
        WHERE id = ${roleId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND is_system = false
        RETURNING id::text as id, name, description
      `;
    });

    return rows[0] ?? null;
  }

  async deleteRole(ctx: TenantContext, roleId: string): Promise<boolean> {
    // Use withSystemContext to bypass RLS — tenant_id is enforced in the WHERE clause.
    return await this.db.withSystemContext(async (tx: any) => {
      await tx`DELETE FROM app.role_permissions WHERE role_id = ${roleId}::uuid`;
      const deleted = await tx<{ id: string }[]>`
        DELETE FROM app.roles
        WHERE id = ${roleId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
          AND is_system = false
        RETURNING id::text as id
      `;
      return deleted.length > 0;
    });
  }

  // ===========================================================================
  // Permissions
  // ===========================================================================

  async listPermissions(): Promise<PermissionRow[]> {
    return await this.db.withSystemContext(async (tx: any) => {
      return await tx<PermissionRow[]>`
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
  }

  // ===========================================================================
  // Role Permissions
  // ===========================================================================

  async getRolePermissions(
    ctx: TenantContext,
    roleId: string
  ): Promise<RolePermissionRow[]> {
    return await this.db.withTransaction(ctx, async (tx: any) => {
      return await tx<RolePermissionRow[]>`
        SELECT
          permission_id::text as permission_id,
          resource,
          action,
          permission_key,
          description,
          requires_mfa,
          module
        FROM app.get_role_permissions(${roleId}::uuid)
      `;
    });
  }

  async grantPermissionToRole(
    tenantId: string,
    roleId: string,
    resource: string,
    action: string,
    grantedBy: string
  ): Promise<string | null> {
    return await this.db.withSystemContext(async (tx: any) => {
      const rows = await tx<{ id: string }[]>`
        SELECT app.grant_permission_to_role(
          ${tenantId}::uuid,
          ${roleId}::uuid,
          ${resource},
          ${action},
          ${grantedBy}::uuid
        )::text as id
      `;
      return rows[0]?.id ?? null;
    });
  }

  async revokePermissionFromRole(
    roleId: string,
    resource: string,
    action: string
  ): Promise<boolean> {
    return await this.db.withSystemContext(async (tx: any) => {
      const rows = await tx<{ revoked: boolean }[]>`
        SELECT app.revoke_permission_from_role(
          ${roleId}::uuid,
          ${resource},
          ${action}
        ) as revoked
      `;
      return rows[0]?.revoked === true;
    });
  }

  // ===========================================================================
  // Role Assignments
  // ===========================================================================

  async getUserRoleAssignments(
    ctx: TenantContext,
    targetUserId: string,
    options: { includeInactive: boolean }
  ): Promise<RoleAssignmentRow[]> {
    const { includeInactive } = options;

    return await this.db.withTransaction(ctx, async (tx: any) => {
      return await tx<RoleAssignmentRow[]>`
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
        WHERE ra.tenant_id = ${ctx.tenantId}::uuid
          AND ra.user_id = ${targetUserId}::uuid
          AND (${includeInactive} OR ra.effective_to IS NULL OR ra.effective_to > now())
        ORDER BY ra.assigned_at DESC, ra.created_at DESC
      `;
    });
  }

  async assignRoleToUser(
    tenantId: string,
    targetUserId: string,
    roleId: string,
    assignedBy: string,
    constraints: Record<string, unknown>
  ): Promise<string | null> {
    return await this.db.withSystemContext(async (tx: any) => {
      const rows = await tx<{ id: string }[]>`
        SELECT app.assign_role_to_user(
          ${tenantId}::uuid,
          ${targetUserId}::uuid,
          ${roleId}::uuid,
          ${assignedBy}::uuid,
          ${JSON.stringify(constraints)}::jsonb
        )::text as id
      `;
      return rows[0]?.id ?? null;
    });
  }

  async revokeRoleAssignment(assignmentId: string): Promise<boolean> {
    return await this.db.withSystemContext(async (tx: any) => {
      const rows = await tx<{ revoked: boolean }[]>`
        SELECT app.revoke_role_from_user(${assignmentId}::uuid) as revoked
      `;
      return rows[0]?.revoked === true;
    });
  }
}
