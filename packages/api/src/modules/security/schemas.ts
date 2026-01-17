/**
 * Security Module - TypeBox Schemas
 *
 * Defines request/response schemas for field-level security and portal management.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Field Permission Schemas
// =============================================================================

/**
 * Permission level enum
 */
export const FieldPermissionLevel = t.Union([
  t.Literal("edit"),
  t.Literal("view"),
  t.Literal("hidden"),
]);
export type FieldPermissionLevel = Static<typeof FieldPermissionLevel>;

/**
 * Field registry entry
 */
export const FieldRegistrySchema = t.Object({
  id: t.String({ format: "uuid" }),
  entityName: t.String(),
  fieldName: t.String(),
  fieldLabel: t.String(),
  fieldGroup: t.Union([t.String(), t.Null()]),
  dataType: t.String(),
  isSensitive: t.Boolean(),
  isSystemField: t.Boolean(),
  defaultPermission: FieldPermissionLevel,
  displayOrder: t.Number(),
});
export type FieldRegistry = Static<typeof FieldRegistrySchema>;

/**
 * Field with permission for a role
 */
export const FieldWithPermissionSchema = t.Object({
  id: t.String({ format: "uuid" }),
  entityName: t.String(),
  fieldName: t.String(),
  fieldLabel: t.String(),
  fieldGroup: t.Union([t.String(), t.Null()]),
  dataType: t.String(),
  isSensitive: t.Boolean(),
  isSystemField: t.Boolean(),
  permission: FieldPermissionLevel,
  displayOrder: t.Number(),
});
export type FieldWithPermission = Static<typeof FieldWithPermissionSchema>;

/**
 * User's effective field permission
 */
export const EffectiveFieldPermissionSchema = t.Object({
  entityName: t.String(),
  fieldName: t.String(),
  permission: FieldPermissionLevel,
});
export type EffectiveFieldPermission = Static<typeof EffectiveFieldPermissionSchema>;

/**
 * Bulk field permission update request
 */
export const BulkFieldPermissionUpdateSchema = t.Object({
  permissions: t.Array(
    t.Object({
      fieldId: t.String({ format: "uuid" }),
      permission: FieldPermissionLevel,
    })
  ),
});
export type BulkFieldPermissionUpdate = Static<typeof BulkFieldPermissionUpdateSchema>;

/**
 * Single field permission update
 */
export const SetFieldPermissionSchema = t.Object({
  permission: FieldPermissionLevel,
});
export type SetFieldPermission = Static<typeof SetFieldPermissionSchema>;

/**
 * Field metadata for UI rendering
 */
export const FieldMetadataSchema = t.Object({
  entityName: t.String(),
  fieldName: t.String(),
  fieldLabel: t.String(),
  fieldGroup: t.Union([t.String(), t.Null()]),
  dataType: t.String(),
  isSensitive: t.Boolean(),
  canView: t.Boolean(),
  canEdit: t.Boolean(),
  isHidden: t.Boolean(),
});
export type FieldMetadata = Static<typeof FieldMetadataSchema>;

/**
 * Entity fields grouped by group name
 */
export const EntityFieldGroupSchema = t.Object({
  groupName: t.String(),
  fields: t.Array(FieldMetadataSchema),
});
export type EntityFieldGroup = Static<typeof EntityFieldGroupSchema>;

// =============================================================================
// Portal Schemas
// =============================================================================

/**
 * Portal type enum
 */
export const PortalTypeSchema = t.Union([
  t.Literal("admin"),
  t.Literal("manager"),
  t.Literal("employee"),
]);
export type PortalType = Static<typeof PortalTypeSchema>;

/**
 * Portal definition
 */
export const PortalSchema = t.Object({
  id: t.String({ format: "uuid" }),
  code: PortalTypeSchema,
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  basePath: t.String(),
  isActive: t.Boolean(),
  icon: t.Union([t.String(), t.Null()]),
});
export type Portal = Static<typeof PortalSchema>;

/**
 * User's portal access
 */
export const UserPortalAccessSchema = t.Object({
  portalId: t.String({ format: "uuid" }),
  portalCode: PortalTypeSchema,
  portalName: t.String(),
  basePath: t.String(),
  isDefault: t.Boolean(),
  icon: t.Union([t.String(), t.Null()]),
});
export type UserPortalAccess = Static<typeof UserPortalAccessSchema>;

/**
 * Switch portal request
 */
export const SwitchPortalSchema = t.Object({
  portalCode: PortalTypeSchema,
});
export type SwitchPortal = Static<typeof SwitchPortalSchema>;

/**
 * Grant portal access request
 */
export const GrantPortalAccessSchema = t.Object({
  userId: t.String({ format: "uuid" }),
  portalCode: PortalTypeSchema,
  isDefault: t.Optional(t.Boolean()),
});
export type GrantPortalAccess = Static<typeof GrantPortalAccessSchema>;

/**
 * Revoke portal access request
 */
export const RevokePortalAccessSchema = t.Object({
  userId: t.String({ format: "uuid" }),
  portalCode: PortalTypeSchema,
});
export type RevokePortalAccess = Static<typeof RevokePortalAccessSchema>;

// =============================================================================
// Manager Team Schemas
// =============================================================================

/**
 * Team member summary
 */
export const TeamMemberSummarySchema = t.Object({
  id: t.String({ format: "uuid" }),
  employeeNumber: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  preferredName: t.Union([t.String(), t.Null()]),
  photoUrl: t.Union([t.String(), t.Null()]),
  jobTitle: t.Union([t.String(), t.Null()]),
  department: t.Union([t.String(), t.Null()]),
  status: t.String(),
  email: t.Union([t.String(), t.Null()]),
  hireDate: t.String(),
  depth: t.Number(), // 1 = direct, 2+ = indirect
});
export type TeamMemberSummary = Static<typeof TeamMemberSummarySchema>;

/**
 * Team overview
 */
export const TeamOverviewSchema = t.Object({
  directReportsCount: t.Number(),
  totalSubordinatesCount: t.Number(),
  pendingApprovalsCount: t.Number(),
  teamOnLeaveCount: t.Number(),
});
export type TeamOverview = Static<typeof TeamOverviewSchema>;

// =============================================================================
// Approval Schemas
// =============================================================================

/**
 * Pending approval types
 */
export const ApprovalTypeSchema = t.Union([
  t.Literal("leave_request"),
  t.Literal("timesheet"),
  t.Literal("expense"),
  t.Literal("training"),
  t.Literal("document"),
]);
export type ApprovalType = Static<typeof ApprovalTypeSchema>;

/**
 * Pending approval item
 */
export const PendingApprovalSchema = t.Object({
  id: t.String({ format: "uuid" }),
  type: ApprovalTypeSchema,
  employeeId: t.String({ format: "uuid" }),
  employeeName: t.String(),
  employeeNumber: t.String(),
  summary: t.String(),
  submittedAt: t.String(),
  dueDate: t.Union([t.String(), t.Null()]),
  priority: t.Union([t.Literal("high"), t.Literal("medium"), t.Literal("low")]),
  metadata: t.Optional(t.Record(t.String(), t.Unknown())),
});
export type PendingApproval = Static<typeof PendingApprovalSchema>;

/**
 * Approval action
 */
export const ApprovalActionSchema = t.Object({
  action: t.Union([t.Literal("approve"), t.Literal("reject")]),
  comment: t.Optional(t.String()),
});
export type ApprovalAction = Static<typeof ApprovalActionSchema>;

// =============================================================================
// Role Schemas (Enhanced)
// =============================================================================

/**
 * Role with portal type
 */
export const RoleWithPortalSchema = t.Object({
  id: t.String({ format: "uuid" }),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  portalType: t.Union([PortalTypeSchema, t.Null()]),
  isSystem: t.Boolean(),
  permissions: t.Record(t.String(), t.Boolean()),
});
export type RoleWithPortal = Static<typeof RoleWithPortalSchema>;

/**
 * Create role request (enhanced with portal type)
 */
export const CreateRoleSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String()),
  portalType: t.Optional(PortalTypeSchema),
  permissions: t.Optional(t.Record(t.String(), t.Boolean())),
});
export type CreateRole = Static<typeof CreateRoleSchema>;

/**
 * Update role request
 */
export const UpdateRoleSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  description: t.Optional(t.String()),
  portalType: t.Optional(PortalTypeSchema),
  permissions: t.Optional(t.Record(t.String(), t.Boolean())),
});
export type UpdateRole = Static<typeof UpdateRoleSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
});
export type IdParams = Static<typeof IdParamsSchema>;

export const EntityParamsSchema = t.Object({
  entity: t.String(),
});
export type EntityParams = Static<typeof EntityParamsSchema>;

export const RoleIdParamsSchema = t.Object({
  roleId: t.String({ format: "uuid" }),
});
export type RoleIdParams = Static<typeof RoleIdParamsSchema>;

export const FieldIdParamsSchema = t.Object({
  roleId: t.String({ format: "uuid" }),
  fieldId: t.String({ format: "uuid" }),
});
export type FieldIdParams = Static<typeof FieldIdParamsSchema>;

export const PaginationQuerySchema = t.Object({
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;
