/**
 * Security Module - Service Layer
 *
 * Business logic for core security management:
 * audit log, users, roles, permissions, role-permissions, role assignments.
 * Handles validation, authorization checks, and response formatting.
 */

import {
  SecurityRepository,
  type TenantContext,
  type AuditLogRow,
  type UserRow,
  type RoleRow,
  type PermissionRow,
  type RolePermissionRow,
  type RoleAssignmentRow,
} from "./repository";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type { RbacService, EffectivePermissions } from "../../plugins/rbac";

// =============================================================================
// Response Types
// =============================================================================

export interface AuditLogEntry {
  id: string;
  action: string;
  resource: string;
  actor: string;
  timestamp: string;
  details?: string;
}

export interface UserEntry {
  id: string;
  email: string;
  name: string | null;
  status: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  joinedAt: string;
  isPrimary: boolean;
  roles: string[];
  createdAt: string;
}

export interface RoleEntry {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  tenantId: string | null;
  permissionsCount: number;
}

export interface PermissionEntry {
  id: string;
  resource: string;
  action: string;
  key: string;
  description: string | null;
  module: string | null;
  requiresMfa: boolean;
}

export interface RolePermissionEntry {
  id: string;
  resource: string;
  action: string;
  key: string;
  description: string | null;
  requiresMfa: boolean;
  module: string | null;
}

export interface RoleAssignmentEntry {
  id: string;
  roleId: string;
  roleName: string;
  isSystem: boolean;
  constraints: unknown;
  effectiveFrom: string;
  effectiveTo: string | null;
  assignedAt: string;
  assignedBy: string | null;
}

// =============================================================================
// Helper
// =============================================================================

function toISOString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

// =============================================================================
// Security Service
// =============================================================================

export class SecurityService {
  private rbacService: RbacService | null = null;

  constructor(
    private repository: SecurityRepository,
    private db: any
  ) {}

  /**
   * Attach the RBAC service so this module can resolve effective permissions
   * without routes reaching into the plugin-level service directly.
   */
  setRbacService(rbacService: RbacService): void {
    this.rbacService = rbacService;
  }

  // ===========================================================================
  // Effective Permissions
  // ===========================================================================

  /**
   * Get effective permissions for a user within a tenant.
   * Delegates to the RBAC plugin service which handles caching and
   * role/permission aggregation.
   */
  async getEffectivePermissions(
    tenantId: string,
    userId: string
  ): Promise<EffectivePermissions> {
    if (!this.rbacService) {
      throw new Error(
        "SecurityService: rbacService not set. Call setRbacService() during setup."
      );
    }
    return this.rbacService.getEffectivePermissions(tenantId, userId);
  }

  // ===========================================================================
  // Audit Log
  // ===========================================================================

  async getAuditLog(
    ctx: TenantContext,
    options: { limit: number; cursor: string | null }
  ): Promise<AuditLogEntry[]> {
    const rows = await this.repository.getAuditLog(ctx, options);

    return rows.map((r) => {
      const raw = r as unknown as Record<string, unknown>;
      const actorName = raw.actorName ?? raw.actor_name;
      const actorEmail = raw.actorEmail ?? raw.actor_email;
      const resourceId = raw.resourceId ?? raw.resource_id;
      const resourceType = raw.resourceType ?? raw.resource_type;
      const createdAt = raw.createdAt ?? raw.created_at;
      const requestId = raw.requestId ?? raw.request_id;

      const actor = actorName || actorEmail || "System";
      const resource = resourceId
        ? `${resourceType} ${resourceId}`
        : String(resourceType);

      return {
        id: r.id,
        action: r.action,
        resource,
        actor: String(actor),
        timestamp: toISOString(createdAt),
        details: requestId ? `request:${requestId}` : undefined,
      };
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
  ): Promise<UserEntry[]> {
    const rows = await this.repository.listUsers(ctx, options);

    return rows.map((r) => {
      const raw = r as unknown as Record<string, unknown>;
      const emailVerified = raw.emailVerified ?? raw.email_verified;
      const mfaEnabled = raw.mfaEnabled ?? raw.mfa_enabled;
      const joinedAt = raw.joinedAt ?? raw.joined_at;
      const isPrimary = raw.isPrimary ?? raw.is_primary;
      const createdAt = raw.createdAt ?? raw.created_at;

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
  }

  // ===========================================================================
  // Roles
  // ===========================================================================

  async listRoles(ctx: TenantContext): Promise<RoleEntry[]> {
    const rows = await this.repository.listRoles(ctx);

    return rows.map((r) => {
      const raw = r as unknown as Record<string, unknown>;
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
  }

  async createRole(
    ctx: TenantContext,
    data: { name: string; description: string | null }
  ): Promise<ServiceResult<{ id: string; name: string; description: string | null; isSystem: boolean; tenantId: string }>> {
    const created = await this.repository.createRole(ctx, data);

    if (!created?.id) {
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to create role" },
      };
    }

    return {
      success: true,
      data: {
        id: created.id,
        name: data.name,
        description: data.description,
        isSystem: false,
        tenantId: ctx.tenantId,
      },
    };
  }

  async updateRole(
    ctx: TenantContext,
    roleId: string,
    data: { name: string | null; description: string | null }
  ): Promise<ServiceResult<{ id: string; name: string; description: string | null; oldRole: any }>> {
    const oldRole = await this.repository.getRoleById(ctx, roleId);

    if (!oldRole?.id) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Role not found" },
      };
    }

    const raw = oldRole as unknown as Record<string, unknown>;
    const isSystem = raw.isSystem ?? raw.is_system;

    if (isSystem) {
      return {
        success: false,
        error: { code: ErrorCodes.FORBIDDEN, message: "System roles cannot be modified" },
      };
    }

    const updated = await this.repository.updateRole(ctx, roleId, data);

    if (!updated?.id) {
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to update role" },
      };
    }

    return {
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        oldRole,
      },
    };
  }

  async deleteRole(
    ctx: TenantContext,
    roleId: string
  ): Promise<ServiceResult<{ oldRole: any }>> {
    const oldRole = await this.repository.getRoleById(ctx, roleId);

    if (!oldRole?.id) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Role not found" },
      };
    }

    const raw = oldRole as unknown as Record<string, unknown>;
    const isSystem = raw.isSystem ?? raw.is_system;

    if (isSystem) {
      return {
        success: false,
        error: { code: ErrorCodes.FORBIDDEN, message: "System roles cannot be deleted" },
      };
    }

    const deleted = await this.repository.deleteRole(ctx, roleId);

    if (!deleted) {
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to delete role" },
      };
    }

    return { success: true, data: { oldRole } };
  }

  // ===========================================================================
  // Permissions
  // ===========================================================================

  async listPermissions(): Promise<PermissionEntry[]> {
    const rows = await this.repository.listPermissions();

    return rows.map((r) => ({
      id: r.id,
      resource: r.resource,
      action: r.action,
      key: `${r.resource}:${r.action}`,
      description: r.description,
      module: r.module,
      requiresMfa: r.requiresMfa,
    }));
  }

  // ===========================================================================
  // Role Permissions
  // ===========================================================================

  async getRolePermissions(
    ctx: TenantContext,
    roleId: string
  ): Promise<RolePermissionEntry[]> {
    const rows = await this.repository.getRolePermissions(ctx, roleId);

    return rows.map((r) => ({
      id: r.permissionId,
      resource: r.resource,
      action: r.action,
      key: r.permissionKey,
      description: r.description,
      requiresMfa: r.requiresMfa,
      module: r.module,
    }));
  }

  async grantPermissionToRole(
    ctx: TenantContext,
    roleId: string,
    resource: string,
    action: string
  ): Promise<ServiceResult<{ id: string; roleName: string }>> {
    const role = await this.repository.getRoleById(ctx, roleId);

    if (!role?.id) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Role not found" },
      };
    }

    const raw = role as unknown as Record<string, unknown>;
    const tenantId = raw.tenantId ?? raw.tenant_id;

    // Only allow modification of tenant-owned roles, not system roles
    if (!tenantId) {
      return {
        success: false,
        error: { code: ErrorCodes.FORBIDDEN, message: "Cannot modify system roles" },
      };
    }

    if (String(tenantId) !== ctx.tenantId) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Role not found" },
      };
    }

    const granted = await this.repository.grantPermissionToRole(
      ctx.tenantId,
      roleId,
      resource,
      action,
      ctx.userId!
    );

    if (!granted) {
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to grant permission" },
      };
    }

    return {
      success: true,
      data: { id: granted, roleName: role.name },
    };
  }

  async revokePermissionFromRole(
    ctx: TenantContext,
    roleId: string,
    resource: string,
    action: string
  ): Promise<ServiceResult<{ roleName: string }>> {
    const role = await this.repository.getRoleById(ctx, roleId);

    if (!role?.id) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Role not found" },
      };
    }

    const raw = role as unknown as Record<string, unknown>;
    const tenantId = raw.tenantId ?? raw.tenant_id;

    // Only allow modification of tenant-owned roles, not system roles
    if (!tenantId) {
      return {
        success: false,
        error: { code: ErrorCodes.FORBIDDEN, message: "Cannot modify system roles" },
      };
    }

    if (String(tenantId) !== ctx.tenantId) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Role not found" },
      };
    }

    const revoked = await this.repository.revokePermissionFromRole(
      roleId,
      resource,
      action
    );

    if (!revoked) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Permission not found on role" },
      };
    }

    return { success: true, data: { roleName: role.name } };
  }

  // ===========================================================================
  // Role Assignments
  // ===========================================================================

  async getUserRoleAssignments(
    ctx: TenantContext,
    targetUserId: string,
    options: { includeInactive: boolean }
  ): Promise<RoleAssignmentEntry[]> {
    const rows = await this.repository.getUserRoleAssignments(
      ctx,
      targetUserId,
      options
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
  }

  async assignRoleToUser(
    ctx: TenantContext,
    targetUserId: string,
    roleId: string,
    constraints: Record<string, unknown>
  ): Promise<ServiceResult<{ id: string }>> {
    const assignmentId = await this.repository.assignRoleToUser(
      ctx.tenantId,
      targetUserId,
      roleId,
      ctx.userId!,
      constraints
    );

    if (!assignmentId) {
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to assign role" },
      };
    }

    return { success: true, data: { id: assignmentId } };
  }

  async revokeRoleAssignment(
    assignmentId: string
  ): Promise<ServiceResult<void>> {
    const revoked = await this.repository.revokeRoleAssignment(assignmentId);

    if (!revoked) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Role assignment not found" },
      };
    }

    return { success: true };
  }
}
