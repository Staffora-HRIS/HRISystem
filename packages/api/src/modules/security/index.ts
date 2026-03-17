/**
 * Security Module
 *
 * Split into focused sub-modules for reduced cognitive complexity:
 *
 * - rbac.repository.ts / rbac.service.ts / routes.ts
 *     Core RBAC: roles, permissions, users, audit log, role assignments
 *
 * - field-permission.service.ts / field-permission.routes.ts
 *     Field-level access control per role
 *
 * - portal.service.ts / portal.routes.ts
 *     Multi-portal access management (admin, manager, employee)
 *
 * - manager.service.ts / manager.routes.ts
 *     Manager hierarchy, team queries, and approval workflows
 *
 * - permission-resolution.service.ts / permission-guard.middleware.ts
 *     Enhanced 7-layer permission resolution engine (v2)
 *
 * Schemas are split into domain-focused files:
 *   rbac.schemas.ts, field-permission.schemas.ts,
 *   portal.schemas.ts, manager.schemas.ts
 *
 * The barrel schemas.ts re-exports all schema files for backwards compatibility.
 */

// Routes
export { securityRoutes, type SecurityRoutes } from "./routes";
export { fieldPermissionRoutes, type FieldPermissionRoutes } from "./field-permission.routes";
export { portalRoutes, type PortalRoutes } from "./portal.routes";
export { managerRoutes, type ManagerRoutes } from "./manager.routes";

// RBAC Service & Repository (new canonical names)
export { RbacSecurityService } from "./rbac.service";
export type {
  AuditLogEntry,
  UserEntry,
  RoleEntry,
  PermissionEntry,
  RolePermissionEntry,
  RoleAssignmentEntry,
} from "./rbac.service";
export { RbacRepository } from "./rbac.repository";
export type {
  AuditLogRow,
  UserRow,
  RoleRow,
  PermissionRow,
  RolePermissionRow,
  RoleDetailRow,
  RoleAssignmentRow,
} from "./rbac.repository";

// Backwards-compatible aliases (deprecated)
export { SecurityService } from "./service";
export { SecurityRepository } from "./repository";

// Field Permission Service
export { FieldPermissionService, FieldPermissionError } from "./field-permission.service";

// Portal Service
export { PortalService, PortalAccessError } from "./portal.service";
export type { PortalNavigationItem } from "./portal.service";

// Manager Service
export { ManagerService, ManagerAccessError } from "./manager.service";
export type { TeamAbsenceEntry } from "./manager.service";

// Enhanced Permission System (v2)
export { PermissionResolutionService } from "./permission-resolution.service";
export type {
  ScopeType,
  DataScope,
  PermissionCondition,
  SoDViolation,
  PermissionCheckContext,
  PermissionCheckResult,
} from "./permission-resolution.service";
export {
  requirePermissionV2,
  requireAnyPermissionV2,
  requireSensitivityTier,
  requireSelfOrPermission,
} from "./permission-guard.middleware";
export type { EnhancedPermissionOptions } from "./permission-guard.middleware";

// Schemas (all domains via barrel)
export * from "./schemas";
