/**
 * Geofence Module - Repository Layer
 *
 * Database operations for geofence locations and violations.
 * All queries respect RLS through db.withTransaction which sets tenant context.
 * Uses cursor-based pagination for list operations.
 *
 * IMPORTANT: All dynamic filtering uses parameterised postgres.js tagged
 * templates.  No raw string interpolation / tx.unsafe() for user-supplied
 * values to prevent SQL injection.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateGeofenceLocation,
  UpdateGeofenceLocation,
  GeofenceLocationFilters,
  ViolationFilters,
  PaginationQuery,
  RecordViolation,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Raw DB row for geofence_locations (camelCase via postgres.js transform) */
export interface GeofenceLocationRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  code: string | null;
  description: string | null;
  latitude: string; // decimal comes back as string from postgres.js
  longitude: string;
  radiusMeters: number;
  address: Record<string, unknown>;
  timezone: string;
  timeDeviceId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Raw DB row for geofence_violations */
export interface GeofenceViolationRow extends Row {
  id: string;
  tenantId: string;
  timeEventId: string;
  employeeId: string;
  expectedGeofenceId: string | null;
  expectedLocationName: string | null;
  actualLatitude: string | null;
  actualLongitude: string | null;
  distanceMeters: number | null;
  status: string;
  resolutionNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

/** Nearby geofence result row from app.haversine_distance() */
export interface NearbyGeofenceRow extends Row {
  geofenceId: string;
  name: string;
  distanceMeters: number;
  isWithinRadius: boolean;
}

// =============================================================================
// Column lists (DRY — reused by every SELECT on the same table)
// =============================================================================

const LOCATION_COLUMNS = `
  id, tenant_id, name, code, description,
  latitude, longitude, radius_meters,
  address, timezone, time_device_id,
  is_active, created_at, updated_at
`;

const VIOLATION_COLUMNS = `
  id, tenant_id, time_event_id, employee_id,
  expected_geofence_id, expected_location_name,
  actual_latitude, actual_longitude, distance_meters,
  status, resolution_notes, resolved_by, resolved_at,
  created_at
`;

// =============================================================================
// Repository
// =============================================================================

export class GeofenceRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Geofence Location Operations
  // ===========================================================================

  /**
   * List geofence locations with cursor-based pagination.
   *
   * Filtering is done with parameterised fragments to avoid SQL injection.
   * The cursor is the ISO timestamp of the last item (ordered by name, created_at).
   */
  async listLocations(
    ctx: TenantContext,
    filters: GeofenceLocationFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<GeofenceLocationRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1; // fetch one extra to detect hasMore

    return this.db.withTransaction(ctx, async (tx) => {
      // Build parameterised conditions — postgres.js tagged template fragments
      const fragments: ReturnType<typeof tx<Row[]>>[] = [];

      if (filters.is_active !== undefined) {
        fragments.push(tx`is_active = ${filters.is_active}`);
      }
      if (filters.search) {
        const pattern = `%${filters.search}%`;
        fragments.push(
          tx`(name ILIKE ${pattern} OR code ILIKE ${pattern} OR description ILIKE ${pattern})`
        );
      }
      if (pagination.cursor) {
        fragments.push(tx`created_at < ${pagination.cursor}::timestamptz`);
      }

      // Combine fragments with AND (or default to TRUE)
      const where =
        fragments.length > 0
          ? fragments.reduce((acc, frag) => tx`${acc} AND ${frag}`)
          : tx`true`;

      const rows = await tx<GeofenceLocationRow[]>`
        SELECT ${tx.unsafe(LOCATION_COLUMNS)}
        FROM geofence_locations
        WHERE ${where}
        ORDER BY name ASC, created_at DESC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].createdAt.toISOString()
          : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Get a single geofence location by ID
   */
  async getLocationById(
    ctx: TenantContext,
    id: string
  ): Promise<GeofenceLocationRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<GeofenceLocationRow[]>`
        SELECT ${tx.unsafe(LOCATION_COLUMNS)}
        FROM geofence_locations
        WHERE id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Create a geofence location.
   *
   * Caller provides the transaction handle so the outbox write can share it.
   */
  async createLocation(
    ctx: TenantContext,
    data: CreateGeofenceLocation,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<GeofenceLocationRow> {
    const rows = await tx<GeofenceLocationRow[]>`
      INSERT INTO geofence_locations (
        tenant_id, name, code, description,
        latitude, longitude, radius_meters,
        address, timezone, time_device_id
      ) VALUES (
        ${ctx.tenantId},
        ${data.name},
        ${data.code ?? null},
        ${data.description ?? null},
        ${data.latitude},
        ${data.longitude},
        ${data.radius_meters ?? 100},
        ${JSON.stringify(data.address ?? {})}::jsonb,
        ${data.timezone ?? "UTC"},
        ${data.time_device_id ?? null}
      )
      RETURNING ${tx.unsafe(LOCATION_COLUMNS)}
    `;
    return rows[0];
  }

  /**
   * Update a geofence location.
   *
   * Uses parameterised individual column updates to avoid injection.
   * Only columns present in `data` are updated.
   */
  async updateLocation(
    ctx: TenantContext,
    id: string,
    data: UpdateGeofenceLocation,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<GeofenceLocationRow | null> {
    // Build SET fragments — each is a parameterised tagged template
    const sets: ReturnType<typeof tx<Row[]>>[] = [];

    if (data.name !== undefined) sets.push(tx`name = ${data.name}`);
    if (data.code !== undefined) sets.push(tx`code = ${data.code}`);
    if (data.description !== undefined) sets.push(tx`description = ${data.description}`);
    if (data.latitude !== undefined) sets.push(tx`latitude = ${data.latitude}`);
    if (data.longitude !== undefined) sets.push(tx`longitude = ${data.longitude}`);
    if (data.radius_meters !== undefined) sets.push(tx`radius_meters = ${data.radius_meters}`);
    if (data.address !== undefined) sets.push(tx`address = ${JSON.stringify(data.address)}::jsonb`);
    if (data.timezone !== undefined) sets.push(tx`timezone = ${data.timezone}`);
    if (data.time_device_id !== undefined) sets.push(tx`time_device_id = ${data.time_device_id}`);
    if (data.is_active !== undefined) sets.push(tx`is_active = ${data.is_active}`);

    if (sets.length === 0) {
      // Nothing to update — return existing record
      return this.getLocationById(ctx, id);
    }

    // Combine SET clauses with commas
    const setClause = sets.reduce((acc, s) => tx`${acc}, ${s}`);

    const rows = await tx<GeofenceLocationRow[]>`
      UPDATE geofence_locations
      SET ${setClause}
      WHERE id = ${id}
      RETURNING ${tx.unsafe(LOCATION_COLUMNS)}
    `;
    return rows[0] ?? null;
  }

  /**
   * Soft-delete (deactivate) a geofence location.
   */
  async deleteLocation(
    _ctx: TenantContext,
    id: string,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const result = await tx`
      UPDATE geofence_locations
      SET is_active = false
      WHERE id = ${id}
    `;
    return result.count > 0;
  }

  // ===========================================================================
  // Proximity Operations
  // ===========================================================================

  /**
   * Find nearby active geofences using the DB haversine_distance function.
   */
  async findNearby(
    ctx: TenantContext,
    latitude: number,
    longitude: number,
    maxDistanceMeters: number = 5000
  ): Promise<NearbyGeofenceRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      return tx<NearbyGeofenceRow[]>`
        SELECT
          gf.id AS geofence_id,
          gf.name,
          app.haversine_distance(${latitude}, ${longitude}, gf.latitude, gf.longitude) AS distance_meters,
          (app.haversine_distance(${latitude}, ${longitude}, gf.latitude, gf.longitude) <= gf.radius_meters) AS is_within_radius
        FROM geofence_locations gf
        WHERE gf.is_active = true
          AND app.haversine_distance(${latitude}, ${longitude}, gf.latitude, gf.longitude) <= ${maxDistanceMeters}
        ORDER BY distance_meters ASC
      `;
    });
  }

  /**
   * Check if a point is within a specific geofence (or the nearest one).
   *
   * Returns structured result with nearest geofence metadata.
   */
  async checkLocation(
    ctx: TenantContext,
    latitude: number,
    longitude: number,
    geofenceId?: string
  ): Promise<{
    isWithinZone: boolean;
    nearestGeofence: {
      id: string;
      name: string;
      distanceMeters: number;
      radiusMeters: number;
    } | null;
  }> {
    return this.db.withTransaction(ctx, async (tx) => {
      if (geofenceId) {
        // Check against a specific geofence
        const rows = await tx<{
          id: string;
          name: string;
          radiusMeters: number;
          distanceMeters: number;
        }[]>`
          SELECT
            gf.id,
            gf.name,
            gf.radius_meters,
            app.haversine_distance(${latitude}, ${longitude}, gf.latitude, gf.longitude) AS distance_meters
          FROM geofence_locations gf
          WHERE gf.id = ${geofenceId}
            AND gf.is_active = true
        `;

        if (rows.length === 0) {
          return { isWithinZone: false, nearestGeofence: null };
        }

        const gf = rows[0];
        return {
          isWithinZone: gf.distanceMeters <= gf.radiusMeters,
          nearestGeofence: {
            id: gf.id,
            name: gf.name,
            distanceMeters: gf.distanceMeters,
            radiusMeters: gf.radiusMeters,
          },
        };
      }

      // Find the nearest active geofence
      const rows = await tx<{
        id: string;
        name: string;
        radiusMeters: number;
        distanceMeters: number;
      }[]>`
        SELECT
          gf.id,
          gf.name,
          gf.radius_meters,
          app.haversine_distance(${latitude}, ${longitude}, gf.latitude, gf.longitude) AS distance_meters
        FROM geofence_locations gf
        WHERE gf.is_active = true
        ORDER BY distance_meters ASC
        LIMIT 1
      `;

      if (rows.length === 0) {
        // No geofences configured — treat as allowed
        return { isWithinZone: true, nearestGeofence: null };
      }

      const gf = rows[0];
      return {
        isWithinZone: gf.distanceMeters <= gf.radiusMeters,
        nearestGeofence: {
          id: gf.id,
          name: gf.name,
          distanceMeters: gf.distanceMeters,
          radiusMeters: gf.radiusMeters,
        },
      };
    });
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
  ): Promise<PaginatedResult<GeofenceViolationRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const fragments: ReturnType<typeof tx<Row[]>>[] = [];

      if (filters.status) {
        fragments.push(tx`status = ${filters.status}`);
      }
      if (filters.employee_id) {
        fragments.push(tx`employee_id = ${filters.employee_id}`);
      }
      if (pagination.cursor) {
        fragments.push(tx`created_at < ${pagination.cursor}::timestamptz`);
      }

      const where =
        fragments.length > 0
          ? fragments.reduce((acc, frag) => tx`${acc} AND ${frag}`)
          : tx`true`;

      const rows = await tx<GeofenceViolationRow[]>`
        SELECT ${tx.unsafe(VIOLATION_COLUMNS)}
        FROM geofence_violations
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].createdAt.toISOString()
          : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Get a single violation by ID
   */
  async getViolationById(
    ctx: TenantContext,
    id: string
  ): Promise<GeofenceViolationRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<GeofenceViolationRow[]>`
        SELECT ${tx.unsafe(VIOLATION_COLUMNS)}
        FROM geofence_violations
        WHERE id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Record a new geofence violation.
   *
   * Caller provides the transaction handle so the outbox write can share it.
   */
  async recordViolation(
    ctx: TenantContext,
    data: RecordViolation,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<GeofenceViolationRow> {
    const rows = await tx<GeofenceViolationRow[]>`
      INSERT INTO geofence_violations (
        tenant_id, time_event_id, employee_id,
        expected_geofence_id, expected_location_name,
        actual_latitude, actual_longitude, distance_meters
      ) VALUES (
        ${ctx.tenantId},
        ${data.time_event_id},
        ${data.employee_id},
        ${data.expected_geofence_id ?? null},
        ${data.expected_location_name ?? null},
        ${data.actual_latitude ?? null},
        ${data.actual_longitude ?? null},
        ${data.distance_meters ?? null}
      )
      RETURNING ${tx.unsafe(VIOLATION_COLUMNS)}
    `;
    return rows[0];
  }

  /**
   * Resolve a geofence violation (approve or reject).
   *
   * Only pending violations can be resolved (enforced by WHERE status = 'pending').
   */
  async resolveViolation(
    ctx: TenantContext,
    id: string,
    status: "approved" | "rejected",
    resolutionNotes: string | null,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<GeofenceViolationRow | null> {
    const rows = await tx<GeofenceViolationRow[]>`
      UPDATE geofence_violations
      SET
        status = ${status},
        resolution_notes = ${resolutionNotes},
        resolved_by = ${ctx.userId ?? null},
        resolved_at = now()
      WHERE id = ${id}
        AND status = 'pending'
      RETURNING ${tx.unsafe(VIOLATION_COLUMNS)}
    `;
    return rows[0] ?? null;
  }
}
