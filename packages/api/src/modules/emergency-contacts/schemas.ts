/**
 * Emergency Contacts Module - TypeBox Schemas
 *
 * Defines validation schemas for all Emergency Contact API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common
// =============================================================================

/**
 * UUID validation schema
 */
export const UuidSchema = t.String({ format: "uuid" });

/**
 * Pagination query parameters (cursor-based)
 */
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.String({ pattern: "^[0-9]+$" })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Params
// =============================================================================

/**
 * Generic ID params for single resource routes
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

/**
 * Employee ID params for employee-scoped routes
 */
export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

// =============================================================================
// Headers
// =============================================================================

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create emergency contact request body
 */
export const CreateEmergencyContactSchema = t.Object({
  contact_name: t.String({ minLength: 1, maxLength: 255 }),
  relationship: t.String({ minLength: 1, maxLength: 100 }),
  phone_primary: t.String({ minLength: 1, maxLength: 50 }),
  phone_secondary: t.Optional(t.Union([t.String({ maxLength: 50 }), t.Null()])),
  email: t.Optional(t.Union([t.String({ format: "email", maxLength: 255 }), t.Null()])),
  address: t.Optional(t.Union([t.String(), t.Null()])),
  is_primary: t.Optional(t.Boolean()),
  priority: t.Optional(t.Integer({ minimum: 1 })),
  notes: t.Optional(t.Union([t.String(), t.Null()])),
});

export type CreateEmergencyContact = Static<typeof CreateEmergencyContactSchema>;

/**
 * Update emergency contact request body (all fields optional)
 */
export const UpdateEmergencyContactSchema = t.Partial(
  t.Object({
    contact_name: t.String({ minLength: 1, maxLength: 255 }),
    relationship: t.String({ minLength: 1, maxLength: 100 }),
    phone_primary: t.String({ minLength: 1, maxLength: 50 }),
    phone_secondary: t.Union([t.String({ maxLength: 50 }), t.Null()]),
    email: t.Union([t.String({ format: "email", maxLength: 255 }), t.Null()]),
    address: t.Union([t.String(), t.Null()]),
    is_primary: t.Boolean(),
    priority: t.Integer({ minimum: 1 }),
    notes: t.Union([t.String(), t.Null()]),
  })
);

export type UpdateEmergencyContact = Static<typeof UpdateEmergencyContactSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Emergency contact response schema
 */
export const EmergencyContactResponseSchema = t.Object({
  id: t.String(),
  employeeId: t.String(),
  contactName: t.String(),
  relationship: t.String(),
  phonePrimary: t.String(),
  phoneSecondary: t.Union([t.String(), t.Null()]),
  email: t.Union([t.String(), t.Null()]),
  address: t.Union([t.String(), t.Null()]),
  isPrimary: t.Boolean(),
  priority: t.Integer(),
  notes: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type EmergencyContactResponse = Static<typeof EmergencyContactResponseSchema>;

/**
 * List response schema with cursor-based pagination
 */
export const EmergencyContactListResponseSchema = t.Object({
  items: t.Array(EmergencyContactResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type EmergencyContactListResponse = Static<typeof EmergencyContactListResponseSchema>;
