/**
 * Security Module
 *
 * Exports security-related routes, services, and types.
 * Includes:
 * - Core security routes (roles, permissions, users, audit)
 * - Field-level security (field permissions per role)
 * - Multi-portal system (admin, manager, employee)
 * - Manager portal features (team, approvals)
 */

// Routes
export { securityRoutes, type SecurityRoutes } from "./routes";
export { fieldPermissionRoutes, type FieldPermissionRoutes } from "./field-permission.routes";
export { portalRoutes, type PortalRoutes } from "./portal.routes";
export { managerRoutes, type ManagerRoutes } from "./manager.routes";

// Services
export { SecurityService } from "./service";
export { SecurityRepository } from "./repository";
export { FieldPermissionService, FieldPermissionError } from "./field-permission.service";
export { PortalService, PortalAccessError } from "./portal.service";
export type { PortalNavigationItem } from "./portal.service";
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

// Schemas
export * from "./schemas";
