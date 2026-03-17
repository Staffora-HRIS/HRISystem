/* eslint-disable no-redeclare */
/**
 * Field Permission Schemas
 *
 * TypeBox schemas for field-level security management.
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
// Field Permission Route Param Schemas
// =============================================================================

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
