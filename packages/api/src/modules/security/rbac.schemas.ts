/* eslint-disable no-redeclare */
/**
 * RBAC Schemas
 *
 * TypeBox schemas for role and permission management endpoints.
 */

import { t, type Static } from "elysia";
import { PortalTypeSchema } from "./portal.schemas";

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

export const PaginationQuerySchema = t.Object({
  limit: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;
