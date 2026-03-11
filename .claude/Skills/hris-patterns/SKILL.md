---
name: staffora-patterns
description: Coding patterns extracted from Staffora repository
version: 1.0.0
source: local-git-analysis
analyzed_commits: 9
---

# Staffora Coding Patterns

## Commit Conventions

This project uses **conventional commits** with `type: description` format:
- `fix:` — Bug fixes (e.g., `fix: add tenant null checking to prevent 500 errors`)
- `docs:` — Documentation updates (e.g., `docs: update CLAUDE.md with expanded module list`)
- `feat:` — New features
- `refactor:` — Code restructuring
- `test:` — Test additions/changes

Commit messages should describe the *why* not just the *what*.
Some commits use triple-backtick prefix `` ``` `` — avoid this pattern.

## Code Architecture

### Monorepo Layout (Bun workspaces)

```
packages/
├── api/          # @staffora/api — Elysia.js backend
├── web/          # @staffora/web — React Router v7 frontend
└── shared/       # @staffora/shared — Shared types, schemas, state machines
migrations/       # Numbered SQL migration files (0001–0115+)
docker/           # Docker Compose config
```

### Backend Module Structure

Every backend module follows an identical 5-file convention in `packages/api/src/modules/{module}/`:

```
{module}/
├── index.ts        # Re-exports the Elysia plugin
├── routes.ts       # Elysia route definitions (HTTP endpoints)
├── service.ts      # Business logic, invariant enforcement, outbox events
├── repository.ts   # Data access, SQL queries, cursor pagination
└── schemas.ts      # TypeBox validation schemas
```

**20 modules:** absence, analytics, auth, benefits, cases, competencies, dashboard, documents, hr, lms, onboarding, portal, recruitment, security, succession, system, talent, tenant, time, workflows.

### Backend Plugin Architecture

Cross-cutting concerns live in `packages/api/src/plugins/`:

| Plugin | Purpose |
|--------|---------|
| `db.ts` | PostgreSQL connection via postgres.js |
| `cache.ts` | Redis client for caching |
| `auth-better.ts` | BetterAuth session authentication |
| `tenant.ts` | Multi-tenant context (sets `app.current_tenant`) |
| `rbac.ts` | Role-based access control |
| `audit.ts` | Audit trail logging |
| `errors.ts` | Typed error classes (AppError, NotFoundError, ConflictError) |
| `idempotency.ts` | Idempotency-Key header enforcement |
| `rate-limit.ts` | Rate limiting |
| `security-headers.ts` | Security response headers |

### Background Worker Jobs

Workers in `packages/api/src/jobs/` process async tasks via Redis Streams:

| Worker | Purpose |
|--------|---------|
| `outbox-processor.ts` | Polls `domain_outbox`, publishes to Redis Streams |
| `notification-worker.ts` | Email (nodemailer) and push (Firebase) |
| `export-worker.ts` | Excel/CSV generation, S3 upload |
| `pdf-worker.ts` | Certificate/letter generation (pdf-lib) |
| `analytics-worker.ts` | Analytics aggregation |
| `domain-event-handlers.ts` | Reacts to domain events |

### Frontend Structure

```
packages/web/app/
├── routes/
│   ├── (auth)/         # Login, registration pages
│   ├── (app)/          # Employee self-service (me/, manager/)
│   └── (admin)/        # Admin pages (hr/, talent/, time/, etc.)
├── components/
│   ├── ui/             # Base components (Button, Card, Modal, etc.)
│   ├── layouts/        # App/admin shell layouts
│   └── {feature}/      # Feature components (analytics/, benefits/, etc.)
├── hooks/              # Custom hooks (use-permissions, use-tenant, etc.)
└── lib/                # api-client, query-client, auth, theme, utils
```

### Shared Package

```
packages/shared/src/
├── types/              # TypeScript interfaces for all modules
├── constants/          # Shared constants
├── errors/             # Error codes organized by module
├── schemas/            # Shared TypeBox/Zod schemas
├── state-machines/     # Employee lifecycle, leave, case, workflow, perf cycle
└── utils/              # Date helpers, crypto, validation, effective-dating
```

## Workflows

### Adding a New Backend Module

1. Create `packages/api/src/modules/{module}/` with all 5 files:
   - `schemas.ts` — Define TypeBox validation schemas first
   - `repository.ts` — Data access with RLS-aware queries
   - `service.ts` — Business logic, outbox events in transactions
   - `routes.ts` — Elysia routes with permission guards
   - `index.ts` — Re-export as Elysia plugin
2. Register module in `packages/api/src/app.ts`
3. Create migration(s) in `migrations/NNNN_description.sql`

### Database Migration Workflow

1. Create `migrations/NNNN_description.sql` (next sequential number)
2. Include standardized header:
   ```sql
   -- Migration: NNNN_description
   -- Created: YYYY-MM-DD
   -- Description: What this migration does
   ```
3. Always include `-- UP Migration` and `-- DOWN Migration` sections
4. For tenant-owned tables, ALWAYS add:
   - `tenant_id uuid NOT NULL`
   - `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`
   - Tenant isolation + insert policies
5. Run `bun run migrate:up` to apply

### Adding a Frontend Feature

1. Create route file in `packages/web/app/routes/(admin)/{module}/route.tsx` or `index.tsx`
2. Create feature components in `packages/web/app/components/{module}/`
3. Export components from `{module}/index.ts`
4. Use `api` client from `~/lib/api-client` with React Query
5. Guard with `useHasPermission()` hook from `~/hooks/use-permissions`
6. Follow existing import patterns: lucide-react for icons, `~/components/ui` for base components

### Adding Integration Tests

1. Create test in `packages/api/src/test/integration/`
2. Import test helpers from `../setup` (createTestTenant, createTestUser, etc.)
3. Always test RLS isolation between tenants
4. Verify idempotency prevents duplicates
5. Verify outbox writes atomically with business writes

## Key Patterns

### Route File Pattern

```typescript
import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AppError, NotFoundError, ConflictError } from "../../plugins/errors";
import { AuditActions } from "../../plugins/audit";
import { MyRepository, type TenantContext } from "./repository";
import { MyService } from "./service";
import { /* schemas */ } from "./schemas";

export const myModule = new Elysia({ prefix: "/my-module" })
  .get("/", handler, { /* TypeBox schema validation */ })
  .post("/", handler, { beforeHandle: [requirePermission("module:write")] });
```

### Service File Pattern

```typescript
import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { MyRepository, TenantContext } from "./repository";

export class MyService {
  constructor(private repo: MyRepository) {}

  async create(ctx: TenantContext, data: CreateInput, tx?: TransactionSql) {
    // Business logic + validation
    // Outbox event in same transaction
  }
}
```

### Repository File Pattern

```typescript
import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";

export interface TenantContext {
  tenantId: string;
  userId: string;
}

export class MyRepository {
  constructor(private db: DatabaseClient) {}

  async findById(ctx: TenantContext, id: string) {
    // RLS-aware query (tenant_id set via session variable)
  }
}
```

### Migration File Pattern

```sql
-- Migration: NNNN_name
-- Created: YYYY-MM-DD
-- Description: Purpose

-- =============================================================================
-- UP Migration
-- =============================================================================

CREATE TABLE IF NOT EXISTS app.table_name (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    -- columns...
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.table_name
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_insert ON app.table_name
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- =============================================================================
-- DOWN Migration
-- =============================================================================

DROP TABLE IF EXISTS app.table_name;
```

### Frontend Route Pattern

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Icon1, Icon2 } from "lucide-react";
import { Card, Button, Badge, DataTable } from "~/components/ui";
import { api } from "~/lib/api-client";

export default function MyPage() {
  const { data, isLoading } = useQuery({ queryKey: [...], queryFn: () => api.get(...) });
  // Render with UI components
}
```

### Test File Pattern

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  getTestDb, ensureTestInfra, createTestTenant, createTestUser,
  setTenantContext, clearTenantContext, cleanupTestTenant,
  type TestTenant, type TestUser,
} from "../setup";

describe("Feature - Description", () => {
  let db, tenantA, tenantB, userA;

  beforeAll(async () => { /* setup tenants/users */ });
  afterAll(async () => { /* cleanup */ });

  it("should isolate data by tenant", async () => { /* RLS test */ });
});
```

## Non-Negotiable Rules

1. **Every tenant-owned table**: `tenant_id` + RLS policies
2. **Effective dating**: `effective_from`/`effective_to` with overlap validation
3. **Outbox pattern**: Domain events in same transaction as writes
4. **Idempotency**: All mutations require `Idempotency-Key` header
5. **State machines**: Defined in `@staffora/shared`, transitions stored immutably
6. **Cursor pagination**: Not offset-based
7. **Error shape**: `{ error: { code, message, details?, requestId } }`
8. **URL versioning**: `/api/v1/...`
