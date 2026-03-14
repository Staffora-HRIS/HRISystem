/**
 * Geofence Module
 *
 * Provides the API layer for geofence location management,
 * proximity checks, and violation resolution for Time & Attendance.
 *
 * Usage:
 * ```typescript
 * import { geofenceRoutes } from './modules/geofence';
 *
 * const app = new Elysia()
 *   .use(geofenceRoutes);
 * ```
 */

// Export routes
export { geofenceRoutes, type GeofenceRoutes } from "./routes";

// Export service
export { GeofenceService } from "./service";

// Export repository
export {
  GeofenceRepository,
  type TenantContext,
  type PaginatedResult,
  type GeofenceLocationRow,
  type GeofenceViolationRow,
  type NearbyGeofenceRow,
} from "./repository";

// Export schemas
export {
  UuidSchema,
  PaginationQuerySchema,
  ViolationStatusSchema,
  LocationSourceSchema,
  CreateGeofenceLocationSchema,
  UpdateGeofenceLocationSchema,
  GeofenceLocationResponseSchema,
  GeofenceLocationFiltersSchema,
  NearbyGeofencesQuerySchema,
  NearbyGeofenceSchema,
  LocationCheckSchema,
  LocationCheckResponseSchema,
  GeofenceViolationResponseSchema,
  ViolationFiltersSchema,
  ResolveViolationSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type ViolationStatus,
  type LocationSource,
  type CreateGeofenceLocation,
  type UpdateGeofenceLocation,
  type GeofenceLocationResponse,
  type GeofenceLocationFilters,
  type NearbyGeofencesQuery,
  type NearbyGeofence,
  type LocationCheck,
  type LocationCheckResponse,
  type GeofenceViolationResponse,
  type ViolationFilters,
  type ResolveViolation,
  type IdParams,
  type OptionalIdempotencyHeader,
  type PaginationQuery,
} from "./schemas";
