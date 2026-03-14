/**
 * Geofence Module - Service Layer
 *
 * Business logic for geofence location management, proximity checks,
 * and violation resolution.
 *
 * All mutations write domain events to domain_outbox in the same
 * transaction as the business write (outbox pattern).
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  GeofenceRepository,
  type GeofenceLocationRow,
  type GeofenceViolationRow,
  type NearbyGeofenceRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateGeofenceLocation,
  UpdateGeofenceLocation,
  GeofenceLocationFilters,
  GeofenceLocationResponse,
  NearbyGeofence,
  LocationCheckResponse,
  GeofenceViolationResponse,
  ViolationFilters,
  RecordViolation,
  ResolveViolation,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Mappers (DB row -> API response)
// =============================================================================

function mapLocationToResponse(row: GeofenceLocationRow): GeofenceLocationResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    name: row.name,
    code: row.code,
    description: row.description,
    latitude: parseFloat(row.latitude),
    longitude: parseFloat(row.longitude),
    radius_meters: row.radiusMeters,
    address: row.address ?? {},
    timezone: row.timezone,
    time_device_id: row.timeDeviceId,
    is_active: row.isActive,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function mapViolationToResponse(row: GeofenceViolationRow): GeofenceViolationResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    time_event_id: row.timeEventId,
    employee_id: row.employeeId,
    expected_geofence_id: row.expectedGeofenceId,
    expected_location_name: row.expectedLocationName,
    actual_latitude: row.actualLatitude !== null ? parseFloat(row.actualLatitude) : null,
    actual_longitude: row.actualLongitude !== null ? parseFloat(row.actualLongitude) : null,
    distance_meters: row.distanceMeters,
    status: row.status as GeofenceViolationResponse["status"],
    resolution_notes: row.resolutionNotes,
    resolved_by: row.resolvedBy,
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

function mapNearbyToResponse(row: NearbyGeofenceRow): NearbyGeofence {
  return {
    geofence_id: row.geofenceId,
    name: row.name,
    distance_meters: row.distanceMeters,
    is_within_radius: row.isWithinRadius,
  };
}

// =============================================================================
// Service
// =============================================================================

export class GeofenceService {
  constructor(
    private repository: GeofenceRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Location Operations
  // ===========================================================================

  /**
   * List geofence locations with cursor-based pagination.
   */
  async listLocations(
    ctx: TenantContext,
    filters: GeofenceLocationFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<GeofenceLocationResponse>> {
    const result = await this.repository.listLocations(ctx, filters, pagination);
    return {
      items: result.items.map(mapLocationToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single geofence location by ID.
   */
  async getLocation(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<GeofenceLocationResponse>> {
    const location = await this.repository.getLocationById(ctx, id);
    if (!location) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Geofence location not found" },
      };
    }
    return { success: true, data: mapLocationToResponse(location) };
  }

  /**
   * Create a geofence location.
   *
   * Writes outbox event in the same transaction.
   */
  async createLocation(
    ctx: TenantContext,
    data: CreateGeofenceLocation
  ): Promise<ServiceResult<GeofenceLocationResponse>> {
    // Validate coordinates are real numbers
    if (!isFiniteCoord(data.latitude) || !isFiniteCoord(data.longitude)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Latitude and longitude must be finite numbers",
        },
      };
    }

    const location = await this.db.withTransaction(ctx, async (tx) => {
      const created = await this.repository.createLocation(ctx, data, tx);

      // Domain outbox event — same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'geofence_location',
          ${created.id},
          'geofence.location.created',
          ${JSON.stringify({
            locationId: created.id,
            name: data.name,
            latitude: data.latitude,
            longitude: data.longitude,
            radiusMeters: data.radius_meters ?? 100,
            actor: ctx.userId,
          })}::jsonb,
          now()
        )
      `;

      return created;
    });

    return { success: true, data: mapLocationToResponse(location) };
  }

  /**
   * Update a geofence location.
   *
   * Validates existence first, then writes update + outbox in one transaction.
   */
  async updateLocation(
    ctx: TenantContext,
    id: string,
    data: UpdateGeofenceLocation
  ): Promise<ServiceResult<GeofenceLocationResponse>> {
    // Validate coordinates if provided
    if (data.latitude !== undefined && !isFiniteCoord(data.latitude)) {
      return {
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: "Latitude must be a finite number" },
      };
    }
    if (data.longitude !== undefined && !isFiniteCoord(data.longitude)) {
      return {
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: "Longitude must be a finite number" },
      };
    }

    const existing = await this.repository.getLocationById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Geofence location not found" },
      };
    }

    const updated = await this.db.withTransaction(ctx, async (tx) => {
      const location = await this.repository.updateLocation(ctx, id, data, tx);

      if (location) {
        await tx`
          INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
          VALUES (
            ${crypto.randomUUID()},
            ${ctx.tenantId},
            'geofence_location',
            ${id},
            'geofence.location.updated',
            ${JSON.stringify({ locationId: id, changes: data, actor: ctx.userId })}::jsonb,
            now()
          )
        `;
      }

      return location;
    });

    if (!updated) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Geofence location not found" },
      };
    }

    return { success: true, data: mapLocationToResponse(updated) };
  }

  /**
   * Delete (deactivate) a geofence location.
   */
  async deleteLocation(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    const existing = await this.repository.getLocationById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Geofence location not found" },
      };
    }

    await this.db.withTransaction(ctx, async (tx) => {
      await this.repository.deleteLocation(ctx, id, tx);

      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'geofence_location',
          ${id},
          'geofence.location.deleted',
          ${JSON.stringify({ locationId: id, name: existing.name, actor: ctx.userId })}::jsonb,
          now()
        )
      `;
    });

    return { success: true, data: { deleted: true } };
  }

  // ===========================================================================
  // Proximity Operations
  // ===========================================================================

  /**
   * Find nearby geofences for a given coordinate.
   */
  async findNearby(
    ctx: TenantContext,
    latitude: number,
    longitude: number,
    maxDistanceMeters?: number
  ): Promise<NearbyGeofence[]> {
    const rows = await this.repository.findNearby(
      ctx,
      latitude,
      longitude,
      maxDistanceMeters ?? 5000
    );
    return rows.map(mapNearbyToResponse);
  }

  /**
   * Check if a location is within any (or a specific) geofence.
   *
   * This is the main endpoint used by the time-event clock-in flow to
   * validate that an employee is at an approved location.
   */
  async checkLocation(
    ctx: TenantContext,
    latitude: number,
    longitude: number,
    geofenceId?: string
  ): Promise<ServiceResult<LocationCheckResponse>> {
    if (!isFiniteCoord(latitude) || !isFiniteCoord(longitude)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Latitude and longitude must be finite numbers",
        },
      };
    }

    const result = await this.repository.checkLocation(
      ctx,
      latitude,
      longitude,
      geofenceId
    );

    return {
      success: true,
      data: {
        is_within_zone: result.isWithinZone,
        nearest_geofence: result.nearestGeofence
          ? {
              id: result.nearestGeofence.id,
              name: result.nearestGeofence.name,
              distance_meters: result.nearestGeofence.distanceMeters,
              radius_meters: result.nearestGeofence.radiusMeters,
            }
          : null,
      },
    };
  }

  // ===========================================================================
  // Violation Operations
  // ===========================================================================

  /**
   * List geofence violations with cursor-based pagination.
   */
  async listViolations(
    ctx: TenantContext,
    filters: ViolationFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<GeofenceViolationResponse>> {
    const result = await this.repository.listViolations(ctx, filters, pagination);
    return {
      items: result.items.map(mapViolationToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single violation by ID.
   */
  async getViolation(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<GeofenceViolationResponse>> {
    const violation = await this.repository.getViolationById(ctx, id);
    if (!violation) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Geofence violation not found" },
      };
    }
    return { success: true, data: mapViolationToResponse(violation) };
  }

  /**
   * Record a new geofence violation.
   *
   * Typically called by the time-event processing pipeline when a clock
   * event falls outside the expected geofence radius. Can also be
   * recorded manually by an administrator.
   */
  async recordViolation(
    ctx: TenantContext,
    data: RecordViolation
  ): Promise<ServiceResult<GeofenceViolationResponse>> {
    const violation = await this.db.withTransaction(ctx, async (tx) => {
      const created = await this.repository.recordViolation(ctx, data, tx);

      // Outbox event
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'geofence_violation',
          ${created.id},
          'geofence.violation.recorded',
          ${JSON.stringify({
            violationId: created.id,
            employeeId: data.employee_id,
            timeEventId: data.time_event_id,
            expectedGeofenceId: data.expected_geofence_id,
            distanceMeters: data.distance_meters,
            actor: ctx.userId,
          })}::jsonb,
          now()
        )
      `;

      return created;
    });

    return { success: true, data: mapViolationToResponse(violation) };
  }

  /**
   * Resolve a geofence violation (approve or reject).
   *
   * Only pending violations can be resolved. Resolving a non-pending
   * violation returns STATE_MACHINE_VIOLATION.
   */
  async resolveViolation(
    ctx: TenantContext,
    id: string,
    data: ResolveViolation
  ): Promise<ServiceResult<GeofenceViolationResponse>> {
    const existing = await this.repository.getViolationById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Geofence violation not found" },
      };
    }

    if (existing.status !== "pending") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Violation is already '${existing.status}'; only pending violations can be resolved`,
        },
      };
    }

    const resolved = await this.db.withTransaction(ctx, async (tx) => {
      const violation = await this.repository.resolveViolation(
        ctx,
        id,
        data.status,
        data.resolution_notes ?? null,
        tx
      );

      if (violation) {
        await tx`
          INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
          VALUES (
            ${crypto.randomUUID()},
            ${ctx.tenantId},
            'geofence_violation',
            ${id},
            'geofence.violation.resolved',
            ${JSON.stringify({
              violationId: id,
              employeeId: existing.employeeId,
              resolution: data.status,
              resolutionNotes: data.resolution_notes,
              actor: ctx.userId,
            })}::jsonb,
            now()
          )
        `;
      }

      return violation;
    });

    if (!resolved) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Violation not found or already resolved" },
      };
    }

    return { success: true, data: mapViolationToResponse(resolved) };
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Ensure a coordinate value is a real finite number (not NaN/Infinity).
 */
function isFiniteCoord(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}
