---
name: postgres-js-patterns
description: Use postgres.js tagged template queries for database operations. Use when writing queries, transactions, or data access in packages/api/src/modules/*/repository.ts.
---

# postgres.js Patterns

## Connection & Types
```typescript
import postgres from 'postgres';
import type { DatabaseClient, TransactionSql, Row } from '../../plugins/db';
```
The `DatabaseClient` class wraps a `postgres` connection pool. Repositories receive it via constructor injection. Column names are auto-transformed between snake_case (DB) and camelCase (JS) by the client config.

## Tagged Template Queries
All queries use tagged template literals -- parameters are automatically escaped:
```typescript
const rows = await tx<EmployeeRow[]>`
  SELECT id, employee_number, status, hire_date
  FROM app.employees
  WHERE id = ${id}::uuid
`;
return rows[0] || null;
```

## Repository Class Pattern
```typescript
export class HRRepository {
  constructor(private db: DatabaseClient) {}

  async findById(context: TenantContext, id: string): Promise<EmployeeRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      return await tx<EmployeeRow[]>`SELECT * FROM app.employees WHERE id = ${id}::uuid`;
    });
    return result[0] || null;
  }
}
```
- `TenantContext` carries `tenantId` and optional `userId`
- `withTransaction` sets RLS context automatically before running the callback

## Transactions
```typescript
const employee = await this.db.withTransaction(context, async (tx) => {
  const [emp] = await tx<EmployeeRow[]>`
    INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
    VALUES (${context.tenantId}::uuid, ${data.employeeNumber}, 'pending', ${data.hireDate}::date)
    RETURNING *
  `;
  await tx`
    INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
    VALUES (${crypto.randomUUID()}::uuid, ${context.tenantId}::uuid, 'employee', ${emp.id}, 'hr.employee.created', ${JSON.stringify({ employee: emp })}::jsonb)
  `;
  return emp;
}, { isolationLevel: 'serializable' });
```
Write mutations accept `tx: TransactionSql` directly when called from service-layer transactions.

## RLS Context
The `db` plugin sets `app.current_tenant` automatically inside `withTransaction`. Repositories just query normally -- RLS policies enforce isolation. Never set tenant context manually in repository code.

## Cursor-Based Pagination
```typescript
const fetchLimit = limit + 1;
const rows = await tx<OrgUnitRow[]>`
  SELECT id, code, name, is_active
  FROM app.org_units
  WHERE 1=1
    ${filters.search ? tx`AND name ILIKE ${'%' + filters.search + '%'}` : tx``}
    ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
  ORDER BY name, id
  LIMIT ${fetchLimit}
`;
const hasMore = rows.length > limit;
const items = hasMore ? rows.slice(0, limit) : rows;
const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;
return { items, nextCursor, hasMore };
```

## Conditional Filters
Use ternary with empty tagged template for optional WHERE clauses:
```typescript
${filters.status ? tx`AND status = ${filters.status}` : tx``}
${filters.is_active !== undefined ? tx`AND is_active = ${filters.is_active}` : tx``}
```

## Insert with RETURNING
```typescript
const [row] = await tx<OrgUnitRow[]>`
  INSERT INTO app.org_units (tenant_id, code, name, effective_from)
  VALUES (${context.tenantId}::uuid, ${data.code}, ${data.name}, ${data.effective_from}::date)
  RETURNING *
`;
```

## Parameterized IN Queries
Use `ANY` with an array parameter instead of `IN`:
```typescript
const rows = await tx<EmployeeRow[]>`
  SELECT * FROM app.employees WHERE id = ANY(${ids}::uuid[])
`;
```

## System Context (Bypass RLS)
For migrations, seeds, and cross-tenant system operations:
```typescript
await this.db.withSystemContext(async (tx) => {
  const rows = await tx`SELECT * FROM app.tenants`;
  return rows;
});
```
This calls `app.enable_system_context()` / `app.disable_system_context()` automatically.

## Raw SQL via unsafe
For DDL or dynamic SQL that cannot use tagged templates:
```typescript
await tx.unsafe(`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
```
