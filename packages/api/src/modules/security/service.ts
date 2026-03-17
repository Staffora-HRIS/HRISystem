/**
 * Security Module - Service Re-exports
 *
 * Backwards-compatible shim that re-exports from rbac.service.ts.
 * New code should import directly from ./rbac.service.
 *
 * @deprecated Import from ./rbac.service instead.
 */

export {
  RbacSecurityService as SecurityService,
  type AuditLogEntry,
  type UserEntry,
  type RoleEntry,
  type PermissionEntry,
  type RolePermissionEntry,
  type RoleAssignmentEntry,
} from "./rbac.service";
