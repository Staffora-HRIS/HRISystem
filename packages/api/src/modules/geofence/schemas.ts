/**
 * Geofence Module - TypeBox Schemas
 *
 * Defines validation schemas for all Geofence API endpoints.
 * Tables: app.geofence_locations, app.geofence_violations
 *
 * Migration reference: 0109_geofence.sql
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums
// =============================================================================

/**
 * Geofence violation status — maps to varchar(20) in DB:
 *   pending | approved | rejected
 */
export const ViolationStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("rejected"),
]);

export type ViolationStatus = Static<typeof ViolationStatusSchema>;

/**
 * Location source for time events — maps to varchar(50):
 *   gps | wifi | cell | ip
 */
export const LocationSourceSchema = t.Union([
  t.Literal("gps"),
  t.Literal("wifi"),
  t.Literal("cell"),
  t.Literal("ip"),
]);

export type LocationSource = Static<typeof LocationSourceSchema>;

// =============================================================================
// Geofence Location Schemas
// =============================================================================

/**
 * Create geofence location request
 *
 * Maps to INSERT INTO app.geofence_locations.
 */
export const CreateGeofenceLocationSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  code: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
  description: t.Optional(t.String({ maxLength: 5000 })),
  latitude: t.Number({ minimum: -90, maximum: 90 }),
  longitude: t.Number({ minimum: -180, maximum: 180 }),
  radius_meters: t.Optional(t.Number({ minimum: 1, maximum: 100000, default: 100 })),
  address: t.Optional(t.Record(t.String(), t.Unknown())),
  timezone: t.Optional(t.String({ maxLength: 50 })),
  time_device_id: t.Optional(UuidSchema),
});

export type CreateGeofenceLocation = Static<typeof CreateGeofenceLocationSchema>;

/**
 * Update geofence location request (all fields optional)
 */
export const UpdateGeofenceLocationSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    code: t.Union([t.String({ minLength: 1, maxLength: 50 }), t.Null()]),
    description: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    latitude: t.Number({ minimum: -90, maximum: 90 }),
    longitude: t.Number({ minimum: -180, maximum: 180 }),
    radius_meters: t.Number({ minimum: 1, maximum: 100000 }),
    address: t.Record(t.String(), t.Unknown()),
    timezone: t.String({ maxLength: 50 }),
    time_device_id: t.Union([UuidSchema, t.Null()]),
    is_active: t.Boolean(),
  })
);

export type UpdateGeofenceLocation = Static<typeof UpdateGeofenceLocationSchema>;

/**
 * Geofence location response — all columns from geofence_locations
 */
export const GeofenceLocationResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  code: t.Union([t.String(), t.Null()]),
  description: t.Union([t.String(), t.Null()]),
  latitude: t.Number(),
  longitude: t.Number(),
  radius_meters: t.Number(),
  address: t.Record(t.String(), t.Unknown()),
  timezone: t.String(),
  time_device_id: t.Union([UuidSchema, t.Null()]),
  is_active: t.Boolean(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type GeofenceLocationResponse = Static<typeof GeofenceLocationResponseSchema>;

/**
 * Geofence location filters for list endpoint
 */
export const GeofenceLocationFiltersSchema = t.Object({
  is_active: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type GeofenceLocationFilters = Static<typeof GeofenceLocationFiltersSchema>;

// =============================================================================
// Nearby Geofences
// =============================================================================

/**
 * Nearby geofences query parameters
 */
export const NearbyGeofencesQuerySchema = t.Object({
  latitude: t.Number({ minimum: -90, maximum: 90 }),
  longitude: t.Number({ minimum: -180, maximum: 180 }),
  max_distance_meters: t.Optional(t.Number({ minimum: 1, maximum: 100000, default: 5000 })),
});

export type NearbyGeofencesQuery = Static<typeof NearbyGeofencesQuerySchema>;

/**
 * Nearby geofence item in response
 */
export const NearbyGeofenceSchema = t.Object({
  geofence_id: UuidSchema,
  name: t.String(),
  distance_meters: t.Number(),
  is_within_radius: t.Boolean(),
});

export type NearbyGeofence = Static<typeof NearbyGeofenceSchema>;

// =============================================================================
// Location Check (POST /geofence/check)
// =============================================================================

/**
 * Location check request body
 */
export const LocationCheckSchema = t.Object({
  latitude: t.Number({ minimum: -90, maximum: 90 }),
  longitude: t.Number({ minimum: -180, maximum: 180 }),
  geofence_id: t.Optional(UuidSchema),
});

export type LocationCheck = Static<typeof LocationCheckSchema>;

/**
 * Location check response
 */
export const LocationCheckResponseSchema = t.Object({
  is_within_zone: t.Boolean(),
  nearest_geofence: t.Union([
    t.Object({
      id: UuidSchema,
      name: t.String(),
      distance_meters: t.Number(),
      radius_meters: t.Number(),
    }),
    t.Null(),
  ]),
});

export type LocationCheckResponse = Static<typeof LocationCheckResponseSchema>;

// =============================================================================
// Geofence Violation Schemas
// =============================================================================

/**
 * Geofence violation response — all columns from geofence_violations
 */
export const GeofenceViolationResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  time_event_id: UuidSchema,
  employee_id: UuidSchema,
  expected_geofence_id: t.Union([UuidSchema, t.Null()]),
  expected_location_name: t.Union([t.String(), t.Null()]),
  actual_latitude: t.Union([t.Number(), t.Null()]),
  actual_longitude: t.Union([t.Number(), t.Null()]),
  distance_meters: t.Union([t.Number(), t.Null()]),
  status: ViolationStatusSchema,
  resolution_notes: t.Union([t.String(), t.Null()]),
  resolved_by: t.Union([UuidSchema, t.Null()]),
  resolved_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type GeofenceViolationResponse = Static<typeof GeofenceViolationResponseSchema>;

/**
 * Violation list filters
 */
export const ViolationFiltersSchema = t.Object({
  status: t.Optional(ViolationStatusSchema),
  employee_id: t.Optional(UuidSchema),
});

export type ViolationFilters = Static<typeof ViolationFiltersSchema>;

/**
 * Record a geofence violation manually (POST /geofence/violations)
 */
export const RecordViolationSchema = t.Object({
  time_event_id: UuidSchema,
  employee_id: UuidSchema,
  expected_geofence_id: t.Optional(UuidSchema),
  expected_location_name: t.Optional(t.String({ maxLength: 100 })),
  actual_latitude: t.Optional(t.Number({ minimum: -90, maximum: 90 })),
  actual_longitude: t.Optional(t.Number({ minimum: -180, maximum: 180 })),
  distance_meters: t.Optional(t.Number({ minimum: 0 })),
});

export type RecordViolation = Static<typeof RecordViolationSchema>;

/**
 * Resolve a violation (approve or reject)
 */
export const ResolveViolationSchema = t.Object({
  status: t.Union([t.Literal("approved"), t.Literal("rejected")]),
  resolution_notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type ResolveViolation = Static<typeof ResolveViolationSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
