/* eslint-disable no-redeclare */
/**
 * Portal Schemas
 *
 * TypeBox schemas for multi-portal management.
 */

import { t, type Static } from "elysia";

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
