-- Migration: 0103_jobs
-- Created: 2026-01-17
-- Description: Create jobs table for job catalog/classification

-- =============================================================================
-- UP Migration
-- =============================================================================

-- Job status enum
DO $$ BEGIN
    CREATE TYPE app.job_status AS ENUM (
        'draft',
        'active',
        'frozen',
        'archived'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Jobs table (job catalog/classification)
CREATE TABLE IF NOT EXISTS app.jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,

    -- Job identification
    code varchar(50) NOT NULL,
    title varchar(200) NOT NULL,
    family varchar(100),
    subfamily varchar(100),
    
    -- Classification
    job_level integer,
    job_grade varchar(20),
    flsa_status varchar(20) DEFAULT 'exempt',
    eeo_category varchar(50),
    
    -- Description
    summary text,
    essential_functions text,
    qualifications text,
    physical_requirements text,
    working_conditions text,
    
    -- Compensation
    salary_grade_id uuid,
    min_salary numeric(15,2),
    max_salary numeric(15,2),
    currency varchar(3) DEFAULT 'USD',
    
    -- Status
    status app.job_status NOT NULL DEFAULT 'active',
    effective_date date NOT NULL DEFAULT CURRENT_DATE,
    
    -- Audit
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,

    -- Constraints
    CONSTRAINT jobs_tenant_code_unique UNIQUE (tenant_id, code),
    CONSTRAINT jobs_salary_range_valid CHECK (min_salary IS NULL OR max_salary IS NULL OR min_salary <= max_salary)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON app.jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_code ON app.jobs(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_jobs_family ON app.jobs(tenant_id, family);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON app.jobs(tenant_id, status);

-- RLS
ALTER TABLE app.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_tenant_isolation ON app.jobs
    USING (
        COALESCE(current_setting('app.system_context', true), 'false')::boolean = true
        OR tenant_id = COALESCE(current_setting('app.current_tenant', true), '')::uuid
    );

CREATE POLICY jobs_tenant_write ON app.jobs
    FOR ALL
    USING (
        COALESCE(current_setting('app.system_context', true), 'false')::boolean = true
        OR tenant_id = COALESCE(current_setting('app.current_tenant', true), '')::uuid
    );

-- Updated at trigger
CREATE TRIGGER jobs_updated_at
    BEFORE UPDATE ON app.jobs
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at();

COMMENT ON TABLE app.jobs IS 'Job catalog/classification for the organization';
