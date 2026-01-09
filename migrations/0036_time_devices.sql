-- Migration: 0036_time_devices
-- Created: 2026-01-07
-- Description: Create the time_devices table for clock devices and time sources
--              Tracks physical time clocks, web portals, mobile apps, and kiosks
--              Supports geo-fencing and IP whitelisting for security

-- =============================================================================
-- UP Migration
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Time Devices Table
-- -----------------------------------------------------------------------------
-- Represents time clock devices and sources (physical terminals, web, mobile)
-- Each device can have geo-fencing configured for location validation
-- IP whitelisting can restrict which networks can clock from this device
CREATE TABLE IF NOT EXISTS app.time_devices (
    -- Primary identifier
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Tenant that owns this device
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Unique device code within tenant (e.g., 'KIOSK-01', 'WEB-MAIN', 'MOBILE')
    code varchar(50) NOT NULL,

    -- Display name (e.g., 'Main Office Kiosk', 'Employee Web Portal')
    name varchar(255) NOT NULL,

    -- Type of device
    device_type app.device_type NOT NULL,

    -- Optional reference to physical location (for future locations table)
    -- Will add FK constraint when locations table exists
    location_id uuid,

    -- Geo-fencing configuration
    -- When enabled, validates that clock events occur within configured radius
    geo_fence_enabled boolean NOT NULL DEFAULT false,

    -- Geographic coordinates for geo-fence center point
    -- Uses numeric(10,7) for ~1cm precision at equator
    geo_latitude numeric(10, 7),
    geo_longitude numeric(10, 7),

    -- Radius in meters for geo-fence validation
    -- Default 100m allows for GPS inaccuracy while preventing remote clocking
    geo_radius_meters integer NOT NULL DEFAULT 100,

    -- IP address whitelist for network-based access control
    -- Empty array means no IP restrictions (all IPs allowed)
    -- Use CIDR notation for ranges (e.g., '192.168.1.0/24')
    ip_whitelist text[] NOT NULL DEFAULT '{}',

    -- Whether this device is currently active and can accept time events
    is_active boolean NOT NULL DEFAULT true,

    -- Additional device metadata (firmware version, last heartbeat, etc.)
    metadata jsonb NOT NULL DEFAULT '{}',

    -- Standard timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Constraints
    -- Device code must be unique within tenant
    CONSTRAINT time_devices_code_unique UNIQUE (tenant_id, code),

    -- Geo-coordinates required when geo-fence is enabled
    CONSTRAINT time_devices_geo_coordinates CHECK (
        (NOT geo_fence_enabled) OR
        (geo_latitude IS NOT NULL AND geo_longitude IS NOT NULL)
    ),

    -- Latitude must be valid (-90 to 90)
    CONSTRAINT time_devices_latitude_range CHECK (
        geo_latitude IS NULL OR (geo_latitude >= -90 AND geo_latitude <= 90)
    ),

    -- Longitude must be valid (-180 to 180)
    CONSTRAINT time_devices_longitude_range CHECK (
        geo_longitude IS NULL OR (geo_longitude >= -180 AND geo_longitude <= 180)
    ),

    -- Geo-radius must be positive and reasonable (1m to 10km)
    CONSTRAINT time_devices_radius_range CHECK (
        geo_radius_meters >= 1 AND geo_radius_meters <= 10000
    )
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup: tenant + code
CREATE INDEX IF NOT EXISTS idx_time_devices_tenant_code
    ON app.time_devices(tenant_id, code);

-- Active devices filter (common query)
CREATE INDEX IF NOT EXISTS idx_time_devices_tenant_active
    ON app.time_devices(tenant_id, is_active)
    WHERE is_active = true;

-- Device type filtering
CREATE INDEX IF NOT EXISTS idx_time_devices_tenant_type
    ON app.time_devices(tenant_id, device_type);

-- Location lookup
CREATE INDEX IF NOT EXISTS idx_time_devices_location
    ON app.time_devices(location_id)
    WHERE location_id IS NOT NULL;

-- Geo-fence enabled devices (for location validation queries)
CREATE INDEX IF NOT EXISTS idx_time_devices_geo_enabled
    ON app.time_devices(tenant_id, geo_fence_enabled)
    WHERE geo_fence_enabled = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- Enable RLS
ALTER TABLE app.time_devices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see devices for their current tenant
CREATE POLICY tenant_isolation ON app.time_devices
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Policy for INSERT: Can only insert into current tenant
CREATE POLICY tenant_isolation_insert ON app.time_devices
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_time_devices_updated_at
    BEFORE UPDATE ON app.time_devices
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- Functions
-- =============================================================================

-- Function to calculate Haversine distance between two points
-- Returns distance in meters
-- Used for geo-fence validation
CREATE OR REPLACE FUNCTION app.haversine_distance(
    lat1 numeric,
    lng1 numeric,
    lat2 numeric,
    lng2 numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    R numeric := 6371000; -- Earth's radius in meters
    phi1 numeric;
    phi2 numeric;
    delta_phi numeric;
    delta_lambda numeric;
    a numeric;
    c numeric;
BEGIN
    -- Convert degrees to radians
    phi1 := lat1 * PI() / 180;
    phi2 := lat2 * PI() / 180;
    delta_phi := (lat2 - lat1) * PI() / 180;
    delta_lambda := (lng2 - lng1) * PI() / 180;

    -- Haversine formula
    a := SIN(delta_phi / 2) * SIN(delta_phi / 2) +
         COS(phi1) * COS(phi2) *
         SIN(delta_lambda / 2) * SIN(delta_lambda / 2);
    c := 2 * ATAN2(SQRT(a), SQRT(1 - a));

    RETURN R * c;
END;
$$;

COMMENT ON FUNCTION app.haversine_distance IS 'Calculates distance in meters between two lat/lng points using Haversine formula';

-- Function to validate if coordinates are within device geo-fence
-- Returns true if within radius, false if outside, NULL if geo-fence not enabled
CREATE OR REPLACE FUNCTION app.validate_geo_fence(
    p_device_id uuid,
    p_latitude numeric,
    p_longitude numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_device RECORD;
    v_distance numeric;
BEGIN
    -- Get device geo-fence settings
    SELECT geo_fence_enabled, geo_latitude, geo_longitude, geo_radius_meters
    INTO v_device
    FROM app.time_devices
    WHERE id = p_device_id;

    IF v_device IS NULL THEN
        RAISE EXCEPTION 'Device not found: %', p_device_id;
    END IF;

    -- If geo-fence not enabled, return NULL (no validation needed)
    IF NOT v_device.geo_fence_enabled THEN
        RETURN NULL;
    END IF;

    -- If no coordinates provided, fail validation
    IF p_latitude IS NULL OR p_longitude IS NULL THEN
        RETURN false;
    END IF;

    -- Calculate distance and compare to radius
    v_distance := app.haversine_distance(
        v_device.geo_latitude,
        v_device.geo_longitude,
        p_latitude,
        p_longitude
    );

    RETURN v_distance <= v_device.geo_radius_meters;
END;
$$;

COMMENT ON FUNCTION app.validate_geo_fence IS 'Validates if coordinates are within device geo-fence radius. Returns NULL if geo-fence not enabled.';

-- Function to validate if IP address is in device whitelist
-- Returns true if allowed, false if blocked
CREATE OR REPLACE FUNCTION app.validate_ip_whitelist(
    p_device_id uuid,
    p_ip_address varchar(45)
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
    v_ip_whitelist text[];
    v_ip inet;
    v_allowed_ip text;
BEGIN
    -- Get device IP whitelist
    SELECT ip_whitelist INTO v_ip_whitelist
    FROM app.time_devices
    WHERE id = p_device_id;

    IF v_ip_whitelist IS NULL THEN
        RAISE EXCEPTION 'Device not found: %', p_device_id;
    END IF;

    -- If whitelist is empty, all IPs are allowed
    IF array_length(v_ip_whitelist, 1) IS NULL OR array_length(v_ip_whitelist, 1) = 0 THEN
        RETURN true;
    END IF;

    -- Convert input IP to inet type
    BEGIN
        v_ip := p_ip_address::inet;
    EXCEPTION WHEN OTHERS THEN
        -- Invalid IP address format
        RETURN false;
    END;

    -- Check if IP is in any of the whitelisted ranges
    FOREACH v_allowed_ip IN ARRAY v_ip_whitelist LOOP
        BEGIN
            IF v_ip <<= v_allowed_ip::inet THEN
                RETURN true;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Invalid whitelist entry, skip it
            CONTINUE;
        END;
    END LOOP;

    RETURN false;
END;
$$;

COMMENT ON FUNCTION app.validate_ip_whitelist IS 'Validates if IP address is allowed by device whitelist. Empty whitelist allows all IPs.';

-- Function to get active devices by type
CREATE OR REPLACE FUNCTION app.get_active_devices_by_type(
    p_device_type app.device_type
)
RETURNS TABLE (
    id uuid,
    code varchar(50),
    name varchar(255),
    geo_fence_enabled boolean,
    geo_latitude numeric(10, 7),
    geo_longitude numeric(10, 7),
    geo_radius_meters integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        td.id,
        td.code,
        td.name,
        td.geo_fence_enabled,
        td.geo_latitude,
        td.geo_longitude,
        td.geo_radius_meters
    FROM app.time_devices td
    WHERE td.device_type = p_device_type
      AND td.is_active = true
    ORDER BY td.name;
END;
$$;

COMMENT ON FUNCTION app.get_active_devices_by_type IS 'Returns active devices of a specific type for the current tenant';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.time_devices IS 'Time clock devices and sources (kiosks, web, mobile, biometric). Supports geo-fencing and IP whitelisting.';
COMMENT ON COLUMN app.time_devices.id IS 'Primary UUID identifier for the device';
COMMENT ON COLUMN app.time_devices.tenant_id IS 'Tenant that owns this device';
COMMENT ON COLUMN app.time_devices.code IS 'Unique device code within tenant';
COMMENT ON COLUMN app.time_devices.name IS 'Display name of the device';
COMMENT ON COLUMN app.time_devices.device_type IS 'Type of device (web, mobile, kiosk, biometric, nfc, manual)';
COMMENT ON COLUMN app.time_devices.location_id IS 'Optional reference to physical location';
COMMENT ON COLUMN app.time_devices.geo_fence_enabled IS 'Whether geo-fence validation is enabled';
COMMENT ON COLUMN app.time_devices.geo_latitude IS 'Latitude of geo-fence center point';
COMMENT ON COLUMN app.time_devices.geo_longitude IS 'Longitude of geo-fence center point';
COMMENT ON COLUMN app.time_devices.geo_radius_meters IS 'Radius in meters for geo-fence validation';
COMMENT ON COLUMN app.time_devices.ip_whitelist IS 'Array of allowed IP addresses/CIDR ranges';
COMMENT ON COLUMN app.time_devices.is_active IS 'Whether device is active and accepting time events';
COMMENT ON COLUMN app.time_devices.metadata IS 'Additional device metadata (firmware, heartbeat, etc.)';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_active_devices_by_type(app.device_type);
-- DROP FUNCTION IF EXISTS app.validate_ip_whitelist(uuid, varchar);
-- DROP FUNCTION IF EXISTS app.validate_geo_fence(uuid, numeric, numeric);
-- DROP FUNCTION IF EXISTS app.haversine_distance(numeric, numeric, numeric, numeric);
-- DROP TRIGGER IF EXISTS update_time_devices_updated_at ON app.time_devices;
-- DROP POLICY IF EXISTS tenant_isolation_insert ON app.time_devices;
-- DROP POLICY IF EXISTS tenant_isolation ON app.time_devices;
-- DROP INDEX IF EXISTS app.idx_time_devices_geo_enabled;
-- DROP INDEX IF EXISTS app.idx_time_devices_location;
-- DROP INDEX IF EXISTS app.idx_time_devices_tenant_type;
-- DROP INDEX IF EXISTS app.idx_time_devices_tenant_active;
-- DROP INDEX IF EXISTS app.idx_time_devices_tenant_code;
-- DROP TABLE IF EXISTS app.time_devices;
