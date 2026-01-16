-- Migration: 0103_equipment
-- Created: 2026-01-16
-- Description: Equipment provisioning for onboarding

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Equipment type enum
DO $$ BEGIN
    CREATE TYPE app.equipment_type AS ENUM (
        'laptop',
        'desktop',
        'monitor',
        'keyboard',
        'mouse',
        'headset',
        'phone',
        'mobile_device',
        'badge',
        'furniture',
        'software_license',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Equipment request status
DO $$ BEGIN
    CREATE TYPE app.equipment_request_status AS ENUM (
        'pending',
        'approved',
        'ordered',
        'received',
        'assigned',
        'rejected',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Equipment catalog
CREATE TABLE IF NOT EXISTS app.equipment_catalog (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Equipment details
    name varchar(100) NOT NULL,
    equipment_type app.equipment_type NOT NULL,
    description text,
    specifications jsonb DEFAULT '{}',

    -- Vendor/procurement
    vendor varchar(100),
    vendor_sku varchar(100),
    unit_cost decimal(10,2),

    -- Availability
    is_standard_issue boolean DEFAULT false,
    requires_approval boolean DEFAULT true,
    lead_time_days integer DEFAULT 7,

    -- Status
    is_active boolean NOT NULL DEFAULT true,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Equipment requests
CREATE TABLE IF NOT EXISTS app.equipment_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
    onboarding_id uuid REFERENCES app.onboarding_instances(id),

    -- Request details
    catalog_item_id uuid REFERENCES app.equipment_catalog(id),
    equipment_type app.equipment_type NOT NULL,
    custom_description text, -- If not from catalog
    specifications jsonb DEFAULT '{}',
    quantity integer DEFAULT 1,

    -- Priority and timing
    priority varchar(20) DEFAULT 'normal', -- low, normal, high, urgent
    needed_by date,

    -- Status
    status app.equipment_request_status NOT NULL DEFAULT 'pending',

    -- Approval
    approved_by uuid REFERENCES app.users(id),
    approved_at timestamptz,
    rejection_reason text,

    -- Fulfillment
    ordered_at timestamptz,
    order_reference varchar(100),
    expected_delivery date,
    received_at timestamptz,
    assigned_at timestamptz,

    -- Asset tracking
    asset_tag varchar(100),
    serial_number varchar(100),

    -- Notes
    notes text,

    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Equipment request history
CREATE TABLE IF NOT EXISTS app.equipment_request_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    request_id uuid NOT NULL REFERENCES app.equipment_requests(id) ON DELETE CASCADE,
    from_status app.equipment_request_status,
    to_status app.equipment_request_status NOT NULL,
    notes text,
    changed_by uuid REFERENCES app.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_equipment_catalog_tenant
    ON app.equipment_catalog(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_equipment_requests_employee
    ON app.equipment_requests(employee_id, status);

CREATE INDEX IF NOT EXISTS idx_equipment_requests_onboarding
    ON app.equipment_requests(onboarding_id)
    WHERE onboarding_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_requests_pending
    ON app.equipment_requests(tenant_id, status, created_at)
    WHERE status IN ('pending', 'approved', 'ordered');

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE app.equipment_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.equipment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.equipment_request_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.equipment_catalog
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.equipment_requests
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation ON app.equipment_request_history
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_equipment_catalog_updated_at
    BEFORE UPDATE ON app.equipment_catalog
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER trg_equipment_requests_updated_at
    BEFORE UPDATE ON app.equipment_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Record status changes
CREATE OR REPLACE FUNCTION app.record_equipment_request_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO app.equipment_request_history (
            tenant_id, request_id, to_status
        )
        VALUES (
            NEW.tenant_id, NEW.id, NEW.status
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        INSERT INTO app.equipment_request_history (
            tenant_id, request_id, from_status, to_status
        )
        VALUES (
            NEW.tenant_id, NEW.id, OLD.status, NEW.status
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_equipment_requests_history
    AFTER INSERT OR UPDATE ON app.equipment_requests
    FOR EACH ROW
    EXECUTE FUNCTION app.record_equipment_request_change();

-- =============================================================================
-- Functions
-- =============================================================================

-- Get equipment requests for onboarding
CREATE OR REPLACE FUNCTION app.get_onboarding_equipment(
    p_onboarding_id uuid
)
RETURNS TABLE (
    request_id uuid,
    equipment_type app.equipment_type,
    item_name varchar,
    status app.equipment_request_status,
    needed_by date,
    assigned_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        er.id as request_id,
        er.equipment_type,
        COALESCE(ec.name, er.custom_description) as item_name,
        er.status,
        er.needed_by,
        er.assigned_at
    FROM app.equipment_requests er
    LEFT JOIN app.equipment_catalog ec ON er.catalog_item_id = ec.id
    WHERE er.onboarding_id = p_onboarding_id
    ORDER BY er.created_at;
END;
$$;

-- Get pending equipment requests
CREATE OR REPLACE FUNCTION app.get_pending_equipment_requests(
    p_tenant_id uuid
)
RETURNS TABLE (
    request_id uuid,
    employee_name text,
    equipment_type app.equipment_type,
    item_name varchar,
    status app.equipment_request_status,
    priority varchar,
    needed_by date,
    days_overdue integer,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        er.id as request_id,
        app.get_employee_display_name(er.employee_id) as employee_name,
        er.equipment_type,
        COALESCE(ec.name, er.custom_description) as item_name,
        er.status,
        er.priority,
        er.needed_by,
        CASE
            WHEN er.needed_by < CURRENT_DATE THEN
                EXTRACT(DAY FROM CURRENT_DATE - er.needed_by)::integer
            ELSE 0
        END as days_overdue,
        er.created_at
    FROM app.equipment_requests er
    LEFT JOIN app.equipment_catalog ec ON er.catalog_item_id = ec.id
    WHERE er.tenant_id = p_tenant_id
      AND er.status IN ('pending', 'approved', 'ordered')
    ORDER BY
        CASE er.priority
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            ELSE 4
        END,
        er.needed_by NULLS LAST,
        er.created_at;
END;
$$;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE app.equipment_catalog IS 'Catalog of equipment available for provisioning';
COMMENT ON TABLE app.equipment_requests IS 'Equipment requests for employees';
COMMENT ON TABLE app.equipment_request_history IS 'Status change history for equipment requests';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP FUNCTION IF EXISTS app.get_pending_equipment_requests(uuid);
-- DROP FUNCTION IF EXISTS app.get_onboarding_equipment(uuid);
-- DROP TRIGGER IF EXISTS trg_equipment_requests_history ON app.equipment_requests;
-- DROP FUNCTION IF EXISTS app.record_equipment_request_change();
-- DROP TRIGGER IF EXISTS trg_equipment_requests_updated_at ON app.equipment_requests;
-- DROP TRIGGER IF EXISTS trg_equipment_catalog_updated_at ON app.equipment_catalog;
-- DROP POLICY IF EXISTS tenant_isolation ON app.equipment_request_history;
-- DROP POLICY IF EXISTS tenant_isolation ON app.equipment_requests;
-- DROP POLICY IF EXISTS tenant_isolation ON app.equipment_catalog;
-- DROP TABLE IF EXISTS app.equipment_request_history;
-- DROP TABLE IF EXISTS app.equipment_requests;
-- DROP TABLE IF EXISTS app.equipment_catalog;
-- DROP TYPE IF EXISTS app.equipment_request_status;
-- DROP TYPE IF EXISTS app.equipment_type;
