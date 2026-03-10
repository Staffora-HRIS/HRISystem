---
name: database-migrations-rls
description: Create PostgreSQL migrations with Row-Level Security for multi-tenant isolation. Use when creating database tables, adding RLS policies, or writing migrations in the migrations/ folder.
---

# Database Migrations & Row-Level Security

## Migration Naming
Migrations are numbered sequentially: `NNNN_description.sql`
Check existing migrations in `migrations/` to determine next number.

## Commands
```bash
bun run migrate:create <name>  # Create new migration
bun run migrate:up             # Run pending migrations
bun run migrate:down           # Rollback last migration
```

## Basic Table Template
```sql
CREATE TABLE IF NOT EXISTS app.training_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES app.tenants(id),
    employee_id UUID NOT NULL REFERENCES app.employees(id),
    status VARCHAR(50) NOT NULL DEFAULT 'enrolled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (MANDATORY)
ALTER TABLE app.training_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies (MANDATORY)
CREATE POLICY tenant_isolation ON app.training_records
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON app.training_records
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Indexes
CREATE INDEX idx_training_records_tenant ON app.training_records(tenant_id);
```

## RLS Policies (Non-Negotiable)

Every tenant-owned table MUST have:
1. `tenant_id UUID NOT NULL` column
2. RLS enabled: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
3. Two isolation policies (SELECT/UPDATE/DELETE and INSERT)

## Effective Dating Tables
```sql
CREATE TABLE IF NOT EXISTS app.employee_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES app.tenants(id),
    employee_id UUID NOT NULL REFERENCES app.employees(id),
    effective_from DATE NOT NULL,
    effective_to DATE, -- NULL means current
    
    CONSTRAINT no_overlap EXCLUDE USING gist (
        employee_id WITH =,
        daterange(effective_from, effective_to, '[)') WITH &&
    )
);
```

## Enum Types
```sql
CREATE TYPE app.status_enum AS ENUM ('active', 'inactive', 'pending');
```
