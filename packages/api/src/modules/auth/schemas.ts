/**
 * Authentication Module - TypeBox Schemas
 *
 * Defines validation schemas for all Auth API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Switch tenant request body
 */
export const SwitchTenantBodySchema = t.Object({
  tenantId: t.String({ format: "uuid" }),
});

export type SwitchTenantBody = Static<typeof SwitchTenantBodySchema>;

/**
 * Unlock account request body
 */
export const UnlockAccountBodySchema = t.Object({
  userId: t.String({ format: "uuid" }),
});

export type UnlockAccountBody = Static<typeof UnlockAccountBodySchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * User info in responses
 */
export const UserResponseSchema = t.Object({
  id: t.String(),
  email: t.String(),
  name: t.Union([t.String(), t.Null()]),
  emailVerified: t.Boolean(),
  status: t.Optional(t.String()),
  mfaEnabled: t.Optional(t.Boolean()),
});

export type UserResponse = Static<typeof UserResponseSchema>;

/**
 * Session info in responses
 */
export const SessionResponseSchema = t.Object({
  id: t.String(),
  userId: t.String(),
  expiresAt: t.String(),
});

export type SessionResponse = Static<typeof SessionResponseSchema>;

/**
 * Tenant info in responses
 */
export const TenantResponseSchema = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.String(),
  isPrimary: t.Boolean(),
});

export type TenantResponse = Static<typeof TenantResponseSchema>;

/**
 * Tenant list item (with role)
 */
export const TenantListItemSchema = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.String(),
  isPrimary: t.Boolean(),
  role: t.String(),
});

export type TenantListItem = Static<typeof TenantListItemSchema>;

/**
 * GET /auth/me response
 */
export const MeResponseSchema = t.Object({
  user: UserResponseSchema,
  session: SessionResponseSchema,
  currentTenant: t.Union([TenantResponseSchema, t.Null()]),
  tenants: t.Array(TenantResponseSchema),
});

export type MeResponse = Static<typeof MeResponseSchema>;

/**
 * CSRF token response
 */
export const CsrfTokenResponseSchema = t.Object({
  csrfToken: t.String(),
});

export type CsrfTokenResponse = Static<typeof CsrfTokenResponseSchema>;

/**
 * Switch tenant success response
 */
export const SwitchTenantResponseSchema = t.Object({
  success: t.Literal(true),
  tenantId: t.String(),
});

export type SwitchTenantResponse = Static<typeof SwitchTenantResponseSchema>;

/**
 * Unlock account success response
 */
export const UnlockAccountResponseSchema = t.Object({
  success: t.Literal(true),
  userId: t.String(),
  message: t.String(),
});

export type UnlockAccountResponse = Static<typeof UnlockAccountResponseSchema>;
