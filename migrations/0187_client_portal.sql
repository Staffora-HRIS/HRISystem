-- Migration: 0187_client_portal
-- Created: 2026-03-16
-- Description: Create all tables for the Staffora client portal including
--              portal users, sessions, tickets, licensing, invoicing,
--              documents, and news/announcements.

-- =============================================================================
-- UP Migration
-- =============================================================================

-- =============================================================================
-- 1. SEQUENCES (for auto-generated ticket and invoice numbers)
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS app.portal_ticket_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS app.portal_invoice_number_seq START WITH 1 INCREMENT BY 1;

-- =============================================================================
-- 2. TABLE: portal_users
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    avatar_url text,
    role text NOT NULL DEFAULT 'client'
        CHECK (role IN ('super_admin', 'admin', 'support_agent', 'client')),
    is_active boolean DEFAULT true,
    email_verified boolean DEFAULT false,
    email_verified_at timestamptz,
    last_login_at timestamptz,
    failed_login_attempts int DEFAULT 0,
    locked_until timestamptz,
    password_changed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_users_tenant_id
    ON app.portal_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_users_email
    ON app.portal_users(email);
CREATE INDEX IF NOT EXISTS idx_portal_users_tenant_role
    ON app.portal_users(tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_portal_users_tenant_active
    ON app.portal_users(tenant_id, is_active) WHERE is_active = true;

-- RLS
ALTER TABLE app.portal_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_users
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_users
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Trigger: updated_at
CREATE TRIGGER update_portal_users_updated_at
    BEFORE UPDATE ON app.portal_users
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- 3. TABLE: portal_sessions
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES app.portal_users(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    token_hash text NOT NULL UNIQUE,
    ip_address inet,
    user_agent text,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_sessions_user_id
    ON app.portal_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_tenant_id
    ON app.portal_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_token_hash
    ON app.portal_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_expires_at
    ON app.portal_sessions(expires_at);

-- RLS
ALTER TABLE app.portal_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_sessions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_sessions
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 4. TABLE: portal_password_resets
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_password_resets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES app.portal_users(id) ON DELETE CASCADE,
    token_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_password_resets_user_id
    ON app.portal_password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_portal_password_resets_token_hash
    ON app.portal_password_resets(token_hash);

-- Note: portal_password_resets is NOT tenant-scoped (no tenant_id column).
-- Access is controlled by the user_id FK to portal_users which is tenant-scoped.

-- =============================================================================
-- 5. TABLE: portal_tickets
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    ticket_number text NOT NULL UNIQUE,
    subject text NOT NULL,
    description text NOT NULL,
    category text NOT NULL
        CHECK (category IN (
            'bug_report', 'feature_request', 'billing_inquiry',
            'account_issue', 'data_request', 'integration_help',
            'general_question', 'urgent_issue'
        )),
    priority text NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status text NOT NULL DEFAULT 'open'
        CHECK (status IN (
            'open', 'in_progress', 'awaiting_client', 'awaiting_internal',
            'on_hold', 'resolved', 'closed', 'reopened'
        )),
    created_by uuid REFERENCES app.portal_users(id),
    assigned_to uuid REFERENCES app.portal_users(id),
    resolved_at timestamptz,
    closed_at timestamptz,
    sla_due_at timestamptz,
    first_response_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_tickets_tenant_id
    ON app.portal_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_ticket_number
    ON app.portal_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_created_by
    ON app.portal_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_assigned_to
    ON app.portal_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_tenant_status
    ON app.portal_tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_tenant_priority
    ON app.portal_tickets(tenant_id, priority);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_tenant_category
    ON app.portal_tickets(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_sla_due_at
    ON app.portal_tickets(sla_due_at) WHERE sla_due_at IS NOT NULL;

-- RLS
ALTER TABLE app.portal_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_tickets
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_tickets
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Trigger: updated_at
CREATE TRIGGER update_portal_tickets_updated_at
    BEFORE UPDATE ON app.portal_tickets
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- 6. TABLE: portal_ticket_messages
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_ticket_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    ticket_id uuid NOT NULL REFERENCES app.portal_tickets(id) ON DELETE CASCADE,
    author_id uuid REFERENCES app.portal_users(id),
    message text NOT NULL,
    is_internal_note boolean DEFAULT false,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_ticket_messages_tenant_id
    ON app.portal_ticket_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_ticket_messages_ticket_id
    ON app.portal_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_portal_ticket_messages_author_id
    ON app.portal_ticket_messages(author_id);

-- RLS
ALTER TABLE app.portal_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_ticket_messages
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_ticket_messages
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 7. TABLE: portal_ticket_attachments
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_ticket_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    ticket_id uuid NOT NULL REFERENCES app.portal_tickets(id) ON DELETE CASCADE,
    message_id uuid REFERENCES app.portal_ticket_messages(id) ON DELETE SET NULL,
    file_name text NOT NULL,
    file_size bigint NOT NULL,
    mime_type text NOT NULL,
    storage_path text NOT NULL,
    uploaded_by uuid REFERENCES app.portal_users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_ticket_attachments_tenant_id
    ON app.portal_ticket_attachments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_ticket_attachments_ticket_id
    ON app.portal_ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_portal_ticket_attachments_message_id
    ON app.portal_ticket_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_portal_ticket_attachments_uploaded_by
    ON app.portal_ticket_attachments(uploaded_by);

-- RLS
ALTER TABLE app.portal_ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_ticket_attachments
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_ticket_attachments
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 8. TABLE: portal_ticket_activity_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_ticket_activity_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    ticket_id uuid NOT NULL REFERENCES app.portal_tickets(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES app.portal_users(id),
    action text NOT NULL,
    old_value text,
    new_value text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_ticket_activity_log_tenant_id
    ON app.portal_ticket_activity_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_ticket_activity_log_ticket_id
    ON app.portal_ticket_activity_log(ticket_id);
CREATE INDEX IF NOT EXISTS idx_portal_ticket_activity_log_actor_id
    ON app.portal_ticket_activity_log(actor_id);

-- RLS
ALTER TABLE app.portal_ticket_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_ticket_activity_log
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_ticket_activity_log
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 9. TABLE: portal_licenses
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_licenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    plan_tier text NOT NULL
        CHECK (plan_tier IN ('starter', 'professional', 'business', 'enterprise', 'custom')),
    employee_limit int,  -- NULL = unlimited
    storage_limit_gb int,
    admin_limit int,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'trial', 'suspended', 'cancelled', 'expired')),
    trial_ends_at timestamptz,
    current_period_start timestamptz,
    current_period_end timestamptz,
    auto_renew boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_licenses_tenant_id
    ON app.portal_licenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_licenses_tenant_status
    ON app.portal_licenses(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_portal_licenses_current_period_end
    ON app.portal_licenses(current_period_end);

-- RLS
ALTER TABLE app.portal_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_licenses
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_licenses
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Trigger: updated_at
CREATE TRIGGER update_portal_licenses_updated_at
    BEFORE UPDATE ON app.portal_licenses
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- 10. TABLE: portal_license_modules
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_license_modules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    license_id uuid NOT NULL REFERENCES app.portal_licenses(id) ON DELETE CASCADE,
    module_key text NOT NULL,
    is_enabled boolean DEFAULT true,
    price_per_month decimal(10,2) NOT NULL,
    price_per_year decimal(10,2) NOT NULL,
    added_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT portal_license_modules_unique UNIQUE (license_id, module_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_license_modules_tenant_id
    ON app.portal_license_modules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_license_modules_license_id
    ON app.portal_license_modules(license_id);

-- RLS
ALTER TABLE app.portal_license_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_license_modules
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_license_modules
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 11. TABLE: portal_invoices
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    invoice_number text NOT NULL UNIQUE,
    license_id uuid REFERENCES app.portal_licenses(id) ON DELETE SET NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    subtotal decimal(10,2) NOT NULL,
    tax_rate decimal(5,4) DEFAULT 0.2000,
    tax_amount decimal(10,2) NOT NULL,
    total decimal(10,2) NOT NULL,
    currency text DEFAULT 'GBP',
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'void', 'refunded')),
    due_date date NOT NULL,
    paid_at timestamptz,
    payment_method text,
    payment_reference text,
    pdf_url text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_invoices_tenant_id
    ON app.portal_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_invoices_invoice_number
    ON app.portal_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_portal_invoices_license_id
    ON app.portal_invoices(license_id);
CREATE INDEX IF NOT EXISTS idx_portal_invoices_tenant_status
    ON app.portal_invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_portal_invoices_due_date
    ON app.portal_invoices(due_date);

-- RLS
ALTER TABLE app.portal_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_invoices
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_invoices
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 12. TABLE: portal_invoice_lines
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_invoice_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    invoice_id uuid NOT NULL REFERENCES app.portal_invoices(id) ON DELETE CASCADE,
    description text NOT NULL,
    module_key text,
    quantity int DEFAULT 1,
    unit_price decimal(10,2) NOT NULL,
    line_total decimal(10,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_invoice_lines_tenant_id
    ON app.portal_invoice_lines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_invoice_lines_invoice_id
    ON app.portal_invoice_lines(invoice_id);

-- RLS
ALTER TABLE app.portal_invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_invoice_lines
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_invoice_lines
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 13. TABLE: portal_payment_methods
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_payment_methods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    type text NOT NULL
        CHECK (type IN ('card', 'direct_debit', 'bank_transfer', 'invoice')),
    is_default boolean DEFAULT false,
    card_last_four text,
    card_brand text,
    card_exp_month int,
    card_exp_year int,
    bank_name text,
    account_last_four text,
    billing_email text,
    billing_address jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_payment_methods_tenant_id
    ON app.portal_payment_methods(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_payment_methods_tenant_default
    ON app.portal_payment_methods(tenant_id, is_default) WHERE is_default = true;

-- RLS
ALTER TABLE app.portal_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_payment_methods
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_payment_methods
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Trigger: updated_at
CREATE TRIGGER update_portal_payment_methods_updated_at
    BEFORE UPDATE ON app.portal_payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- 14. TABLE: portal_documents
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    title text NOT NULL,
    description text,
    category text NOT NULL
        CHECK (category IN (
            'contract', 'sla', 'policy', 'guide',
            'release_notes', 'training', 'compliance', 'other'
        )),
    file_name text NOT NULL,
    file_size bigint NOT NULL,
    mime_type text NOT NULL,
    storage_path text NOT NULL,
    version int DEFAULT 1,
    previous_version_id uuid REFERENCES app.portal_documents(id) ON DELETE SET NULL,
    is_published boolean DEFAULT false,
    published_at timestamptz,
    published_by uuid REFERENCES app.portal_users(id),
    visibility text DEFAULT 'all_clients'
        CHECK (visibility IN ('all_clients', 'specific_tenants', 'admins_only')),
    download_count int DEFAULT 0,
    requires_acknowledgement boolean DEFAULT false,
    created_by uuid REFERENCES app.portal_users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_documents_tenant_id
    ON app.portal_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_documents_category
    ON app.portal_documents(category);
CREATE INDEX IF NOT EXISTS idx_portal_documents_tenant_published
    ON app.portal_documents(tenant_id, is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_portal_documents_previous_version_id
    ON app.portal_documents(previous_version_id);
CREATE INDEX IF NOT EXISTS idx_portal_documents_created_by
    ON app.portal_documents(created_by);

-- RLS
ALTER TABLE app.portal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_documents
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_documents
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Trigger: updated_at
CREATE TRIGGER update_portal_documents_updated_at
    BEFORE UPDATE ON app.portal_documents
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- 15. TABLE: portal_document_acknowledgements
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_document_acknowledgements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    document_id uuid NOT NULL REFERENCES app.portal_documents(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app.portal_users(id) ON DELETE CASCADE,
    acknowledged_at timestamptz NOT NULL DEFAULT now(),
    ip_address inet,

    CONSTRAINT portal_doc_ack_unique UNIQUE (document_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_document_ack_tenant_id
    ON app.portal_document_acknowledgements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_document_ack_document_id
    ON app.portal_document_acknowledgements(document_id);
CREATE INDEX IF NOT EXISTS idx_portal_document_ack_user_id
    ON app.portal_document_acknowledgements(user_id);

-- RLS
ALTER TABLE app.portal_document_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_document_acknowledgements
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_document_acknowledgements
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 16. TABLE: portal_document_tenant_access
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_document_tenant_access (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES app.portal_documents(id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),

    CONSTRAINT portal_doc_tenant_access_unique UNIQUE (document_id, tenant_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_doc_tenant_access_document_id
    ON app.portal_document_tenant_access(document_id);
CREATE INDEX IF NOT EXISTS idx_portal_doc_tenant_access_tenant_id
    ON app.portal_document_tenant_access(tenant_id);

-- RLS
ALTER TABLE app.portal_document_tenant_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_document_tenant_access
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_document_tenant_access
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- =============================================================================
-- 17. TABLE: portal_news
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_news (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES app.tenants(id),  -- NULL = global, visible to all tenants
    title text NOT NULL,
    slug text NOT NULL UNIQUE,
    summary text NOT NULL,
    content text NOT NULL,
    category text NOT NULL
        CHECK (category IN (
            'announcement', 'maintenance', 'incident', 'feature_update',
            'security_advisory', 'policy_change', 'tip'
        )),
    severity text
        CHECK (severity IN ('info', 'warning', 'critical')),
    is_pinned boolean DEFAULT false,
    is_published boolean DEFAULT false,
    published_at timestamptz,
    published_by uuid REFERENCES app.portal_users(id),
    cover_image_url text,
    tags text[] DEFAULT '{}',
    view_count int DEFAULT 0,
    created_by uuid REFERENCES app.portal_users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_news_tenant_id
    ON app.portal_news(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_news_slug
    ON app.portal_news(slug);
CREATE INDEX IF NOT EXISTS idx_portal_news_category
    ON app.portal_news(category);
CREATE INDEX IF NOT EXISTS idx_portal_news_published
    ON app.portal_news(is_published, published_at DESC) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_portal_news_pinned
    ON app.portal_news(is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_portal_news_created_by
    ON app.portal_news(created_by);
CREATE INDEX IF NOT EXISTS idx_portal_news_tags
    ON app.portal_news USING gin(tags);

-- RLS: tenant_id IS NULL = visible to all; otherwise tenant-isolated
ALTER TABLE app.portal_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.portal_news
    FOR ALL
    USING (
        tenant_id IS NULL
        OR tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.portal_news
    FOR INSERT
    WITH CHECK (
        tenant_id IS NULL
        OR tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- Trigger: updated_at
CREATE TRIGGER update_portal_news_updated_at
    BEFORE UPDATE ON app.portal_news
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- =============================================================================
-- 18. TABLE: portal_news_read_status
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.portal_news_read_status (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    news_id uuid NOT NULL REFERENCES app.portal_news(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app.portal_users(id) ON DELETE CASCADE,
    read_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT portal_news_read_status_unique UNIQUE (news_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_news_read_status_news_id
    ON app.portal_news_read_status(news_id);
CREATE INDEX IF NOT EXISTS idx_portal_news_read_status_user_id
    ON app.portal_news_read_status(user_id);

-- Note: portal_news_read_status is NOT tenant-scoped (no tenant_id column).
-- Access is controlled by the user_id FK to portal_users which is tenant-scoped.

-- =============================================================================
-- 19. TRIGGER FUNCTIONS
-- =============================================================================

-- Trigger function: Auto-generate ticket_number in TKT-YYYYMMDD-XXXX format
CREATE OR REPLACE FUNCTION app.generate_portal_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = app, public
AS $$
DECLARE
    seq_val int;
BEGIN
    seq_val := nextval('app.portal_ticket_number_seq');
    NEW.ticket_number := 'TKT-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(seq_val::text, 4, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER generate_portal_ticket_number
    BEFORE INSERT ON app.portal_tickets
    FOR EACH ROW
    WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
    EXECUTE FUNCTION app.generate_portal_ticket_number();

-- Trigger function: Auto-generate invoice_number in INV-YYYYMM-XXXX format
CREATE OR REPLACE FUNCTION app.generate_portal_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = app, public
AS $$
DECLARE
    seq_val int;
BEGIN
    seq_val := nextval('app.portal_invoice_number_seq');
    NEW.invoice_number := 'INV-' || to_char(now(), 'YYYYMM') || '-' || lpad(seq_val::text, 4, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER generate_portal_invoice_number
    BEFORE INSERT ON app.portal_invoices
    FOR EACH ROW
    WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
    EXECUTE FUNCTION app.generate_portal_invoice_number();

-- =============================================================================
-- 20. GRANT PERMISSIONS TO hris_app ROLE
-- =============================================================================

-- Tables
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_users TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_sessions TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_password_resets TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_tickets TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_ticket_messages TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_ticket_attachments TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_ticket_activity_log TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_licenses TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_license_modules TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_invoices TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_invoice_lines TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_payment_methods TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_documents TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_document_acknowledgements TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_document_tenant_access TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_news TO hris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.portal_news_read_status TO hris_app;

-- Sequences
GRANT USAGE, SELECT ON SEQUENCE app.portal_ticket_number_seq TO hris_app;
GRANT USAGE, SELECT ON SEQUENCE app.portal_invoice_number_seq TO hris_app;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE app.portal_users IS 'Client portal user accounts with role-based access (super_admin, admin, support_agent, client)';
COMMENT ON TABLE app.portal_sessions IS 'Portal user sessions with token hashes for stateless auth';
COMMENT ON TABLE app.portal_password_resets IS 'Portal password reset tokens with expiry';
COMMENT ON TABLE app.portal_tickets IS 'Support tickets raised by portal users with SLA tracking';
COMMENT ON TABLE app.portal_ticket_messages IS 'Messages/replies on support tickets, including internal notes';
COMMENT ON TABLE app.portal_ticket_attachments IS 'File attachments on support tickets and messages';
COMMENT ON TABLE app.portal_ticket_activity_log IS 'Immutable audit log of all changes to support tickets';
COMMENT ON TABLE app.portal_licenses IS 'Tenant license/subscription records with plan tiers and limits';
COMMENT ON TABLE app.portal_license_modules IS 'Per-module pricing and enablement within a license';
COMMENT ON TABLE app.portal_invoices IS 'Invoices generated for tenant subscriptions';
COMMENT ON TABLE app.portal_invoice_lines IS 'Line items within an invoice';
COMMENT ON TABLE app.portal_payment_methods IS 'Stored payment methods per tenant (card, direct debit, etc.)';
COMMENT ON TABLE app.portal_documents IS 'Shared documents (contracts, SLAs, guides) with versioning and visibility controls';
COMMENT ON TABLE app.portal_document_acknowledgements IS 'User acknowledgements of portal documents';
COMMENT ON TABLE app.portal_document_tenant_access IS 'Tenant-specific access control for documents with specific_tenants visibility';
COMMENT ON TABLE app.portal_news IS 'News articles and announcements. NULL tenant_id = global visibility';
COMMENT ON TABLE app.portal_news_read_status IS 'Tracks which users have read which news articles';

-- =============================================================================
-- DOWN Migration (for rollback)
-- =============================================================================

-- DROP TABLE IF EXISTS app.portal_news_read_status;
-- DROP TABLE IF EXISTS app.portal_news;
-- DROP TABLE IF EXISTS app.portal_document_tenant_access;
-- DROP TABLE IF EXISTS app.portal_document_acknowledgements;
-- DROP TABLE IF EXISTS app.portal_documents;
-- DROP TABLE IF EXISTS app.portal_payment_methods;
-- DROP TABLE IF EXISTS app.portal_invoice_lines;
-- DROP TABLE IF EXISTS app.portal_invoices;
-- DROP TABLE IF EXISTS app.portal_license_modules;
-- DROP TABLE IF EXISTS app.portal_licenses;
-- DROP TABLE IF EXISTS app.portal_ticket_activity_log;
-- DROP TABLE IF EXISTS app.portal_ticket_attachments;
-- DROP TABLE IF EXISTS app.portal_ticket_messages;
-- DROP TABLE IF EXISTS app.portal_tickets;
-- DROP TABLE IF EXISTS app.portal_password_resets;
-- DROP TABLE IF EXISTS app.portal_sessions;
-- DROP TABLE IF EXISTS app.portal_users;
-- DROP FUNCTION IF EXISTS app.generate_portal_invoice_number();
-- DROP FUNCTION IF EXISTS app.generate_portal_ticket_number();
-- DROP SEQUENCE IF EXISTS app.portal_invoice_number_seq;
-- DROP SEQUENCE IF EXISTS app.portal_ticket_number_seq;
