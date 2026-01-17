-- Migration: 0104_geofence
-- Created: 2026-01-16
-- Description: Geofencing for Time & Attendance

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Geofence locations
CREATE TABLE IF NOT EXISTS app.geofence_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Location details
    name varchar(100) NOT NULL,
    code varchar(50),
    description text,

    -- Coordinates
    latitude decimal(10, 8) NOT NULL,
    longitude decimal(11, 8) NOT NULL,
    radius_meters integer NOT NULL DEFAULT 100,

    -- Address
    address jsonb DEFAULT '{}',

    -- Timezone
    timezone varchar(50) DEFAULT 'UTC',

    -- Linked to time device if applicable
    time_device_id uuid REFERENCES app.time_devices(id),

    -- Status
    is_active boolean NOT NULL DEFAULT true,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_geofence_code UNIQUE (tenant_id, code)
);

-- Add geofence columns to time_events
ALTER TABLE app.time_events
    ADD COLUMN IF NOT EXISTS latitude decimal(10, 8),
    ADD COLUMN IF NOT EXISTS longitude decimal(11, 8),
    ADD COLUMN IF NOT EXISTS location_accuracy_meters integer,
    ADD COLUMN IF NOT EXISTS geofence_id uuid REFERENCES app.geofence_locations(id),
    ADD COLUMN IF NOT EXISTS geofence_validated boolean,
    ADD COLUMN IF NOT EXISTS distance_from_geofence_meters integer,
    ADD COLUMN IF NOT EXISTS location_source varchar(50); -- gps, wifi, cell, ip

-- Geofence violation log
CREATE TABLE IF NOT EXISTS app.geofence_violations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    time_event_id uuid NOT NULL, -- No FK due to partitioned time_events table
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,

    -- Expected location
    expected_geofence_id uuid REFERENCES app.geofence_locations(id),
    expected_location_name varchar(100),

    -- Actual location
    actual_latitude decimal(10, 8),
    actual_longitude decimal(11, 8),
    distance_meters integer,

    -- Resolution
    status varchar(20) DEFAULT 'pending', -- pending, approved, rejected
    resolution_notes text,
    resolved_by uuid REFERENCES app.users(id),
    resolved_at timestamptz,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_geofence_locations_tenant
    ON app.geofence_locations(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_geofence_locations_coords
    ON app.geofence_locations(latitude, longitude)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_time_events_location
    ON app.time_events(geofence_validated)
    WHERE latitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_geofence_violations_pending
    ON app.geofence_violations(tenant_id, status, created_at)
    WHERE status = 'pending';

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.geofence_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.geofence_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.geofence_locations
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.geofence_violations
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_geofence_locations_updated_at
    BEFORE UPDATE ON app.geofence_locations
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Calculate Haversine distance between two points
CREATE OR REPLACE FUNCTION app.haversine_distance(
    lat1 decimal,
    lon1 decimal,
    lat2 decimal,
    lon2 decimal
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    R constant integer := 6371000; -- Earth's radius in meters
    dlat decimal;
    dlon decimal;
    a decimal;
    c decimal;
BEGIN
    dlat := radians(lat2 - lat1);
    dlon := radians(lon2 - lon1);

    a := sin(dlat/2) * sin(dlat/2) +
         cos(radians(lat1)) * cos(radians(lat2)) *
         sin(dlon/2) * sin(dlon/2);

    c := 2 * atan2(sqrt(a), sqrt(1-a));

    RETURN (R * c)::integer;
END;
$$;

-- Validate time event against geofence
CREATE OR REPLACE FUNCTION app.validate_geofence(
    p_time_event_id uuid,
    p_latitude decimal,
    p_longitude decimal
)
RETURNS TABLE (
    is_valid boolean,
    geofence_id uuid,
    geofence_name varchar,
    distance_meters integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_tenant_id uuid;
    v_employee_id uuid;
    v_device_id uuid;
    v_nearest_geofence record;
BEGIN
    -- Get event details
    SELECT te.tenant_id, te.employee_id, te.device_id
    INTO v_tenant_id, v_employee_id, v_device_id
    FROM app.time_events te
    WHERE te.id = p_time_event_id;

    -- Find nearest active geofence for this tenant
    SELECT
        gf.id,
        gf.name,
        gf.radius_meters,
        app.haversine_distance(p_latitude, p_longitude, gf.latitude, gf.longitude) as distance
    INTO v_nearest_geofence
    FROM app.geofence_locations gf
    WHERE gf.tenant_id = v_tenant_id
      AND gf.is_active = true
      AND (gf.time_device_id IS NULL OR gf.time_device_id = v_device_id)
    ORDER BY app.haversine_distance(p_latitude, p_longitude, gf.latitude, gf.longitude)
    LIMIT 1;

    IF v_nearest_geofence IS NULL THEN
        -- No geofences configured, consider valid
        RETURN QUERY SELECT true, NULL::uuid, NULL::varchar, NULL::integer;
        RETURN;
    END IF;

    -- Update time event with location data
    UPDATE app.time_events
    SET
        latitude = p_latitude,
        longitude = p_longitude,
        geofence_id = v_nearest_geofence.id,
        geofence_validated = (v_nearest_geofence.distance <= v_nearest_geofence.radius_meters),
        distance_from_geofence_meters = v_nearest_geofence.distance
    WHERE id = p_time_event_id;

    -- If violation, log it
    IF v_nearest_geofence.distance > v_nearest_geofence.radius_meters THEN
        INSERT INTO app.geofence_violations (
            tenant_id, time_event_id, employee_id,
            expected_geofence_id, expected_location_name,
            actual_latitude, actual_longitude, distance_meters
        )
        VALUES (
            v_tenant_id, p_time_event_id, v_employee_id,
            v_nearest_geofence.id, v_nearest_geofence.name,
            p_latitude, p_longitude, v_nearest_geofence.distance
        );
    END IF;

    RETURN QUERY SELECT
        (v_nearest_geofence.distance <= v_nearest_geofence.radius_meters),
        v_nearest_geofence.id,
        v_nearest_geofence.name,
        v_nearest_geofence.distance::integer;
END;
$$;

-- Get geofence violations for review
CREATE OR REPLACE FUNCTION app.get_pending_geofence_violations(
    p_tenant_id uuid
)
RETURNS TABLE (
    violation_id uuid,
    employee_name text,
    event_time timestamptz,
    event_type varchar,
    expected_location varchar,
    distance_meters integer,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        gv.id as violation_id,
        app.get_employee_display_name(gv.employee_id) as employee_name,
        te.event_time,
        te.event_type::varchar,
        gv.expected_location_name as expected_location,
        gv.distance_meters,
        gv.created_at
    FROM app.geofence_violations gv
    INNER JOIN app.time_events te ON gv.time_event_id = te.id
    WHERE gv.tenant_id = p_tenant_id
      AND gv.status = 'pending'
    ORDER BY gv.created_at DESC;
END;
$$;

-- Get nearby geofences
CREATE OR REPLACE FUNCTION app.get_nearby_geofences(
    p_tenant_id uuid,
    p_latitude decimal,
    p_longitude decimal,
    p_max_distance_meters integer DEFAULT 5000
)
RETURNS TABLE (
    geofence_id uuid,
    name varchar,
    distance_meters integer,
    is_within_radius boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        gf.id as geofence_id,
        gf.name,
        app.haversine_distance(p_latitude, p_longitude, gf.latitude, gf.longitude) as distance_meters,
        app.haversine_distance(p_latitude, p_longitude, gf.latitude, gf.longitude) <= gf.radius_meters as is_within_radius
    FROM app.geofence_locations gf
    WHERE gf.tenant_id = p_tenant_id
      AND gf.is_active = true
      AND app.haversine_distance(p_latitude, p_longitude, gf.latitude, gf.longitude) <= p_max_distance_meters
    ORDER BY distance_meters;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.geofence_locations IS 'Geofence definitions for location-based time tracking';
COMMENT ON TABLE app.geofence_violations IS 'Log of clock events outside expected geofence';

COMMENT ON FUNCTION app.haversine_distance IS 'Calculate distance in meters between two coordinates';
COMMENT ON FUNCTION app.validate_geofence IS 'Validate a time event against configured geofences';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_nearby_geofences(uuid, decimal, decimal, integer);
-- DROP FUNCTION IF EXISTS app.get_pending_geofence_violations(uuid);
-- DROP FUNCTION IF EXISTS app.validate_geofence(uuid, decimal, decimal);
-- DROP FUNCTION IF EXISTS app.haversine_distance(decimal, decimal, decimal, decimal);
-- DROP TRIGGER IF EXISTS trg_geofence_locations_updated_at ON app.geofence_locations;
-- DROP POLICY IF EXISTS tenant_isolation ON app.geofence_violations;
-- DROP POLICY IF EXISTS tenant_isolation ON app.geofence_locations;
-- DROP TABLE IF EXISTS app.geofence_violations;
-- ALTER TABLE app.time_events DROP COLUMN IF EXISTS latitude;
-- ALTER TABLE app.time_events DROP COLUMN IF EXISTS longitude;
-- (etc for other added columns)
-- DROP TABLE IF EXISTS app.geofence_locations;
