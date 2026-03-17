/**
 * Security Module - Repository Re-exports
 *
 * Backwards-compatible shim that re-exports from rbac.repository.ts.
 * New code should import directly from ./rbac.repository.
 *
 * @deprecated Import from ./rbac.repository instead.
 */

export {
  RbacRepository as SecurityRepository,
  type AuditLogRow,
  type UserRow,
  type RoleRow,
  type PermissionRow,
  type RolePermissionRow,
  type RoleDetailRow,
  type RoleAssignmentRow,
  type TenantContext,
} from "./rbac.repository";
