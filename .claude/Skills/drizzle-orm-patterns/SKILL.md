---
name: drizzle-orm-patterns
description: Use Drizzle ORM for database operations. Use when writing queries, schema definitions, transactions, or migrations in packages/api/src/db/.
---

# Drizzle ORM Patterns

## Schema Definition
```typescript
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const employees = pgTable('employee', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('idx_employee_tenant').on(table.tenantId),
}));

export const employeeRelations = relations(employees, ({ one, many }) => ({
  tenant: one(tenants, { fields: [employees.tenantId], references: [tenants.id] }),
  positions: many(employeePositions),
}));
```

## Query Patterns

### Find One
```typescript
const employee = await db.query.employees.findFirst({
  where: eq(employees.id, id),
  with: { positions: true },
});
```

### Find Many
```typescript
const results = await db.query.employees.findMany({
  where: and(eq(employees.tenantId, tenantId), eq(employees.status, 'active')),
  orderBy: [asc(employees.lastName)],
  limit: 20,
});
```

### Insert
```typescript
const [employee] = await db.insert(employees).values({ ... }).returning();
```

### Update
```typescript
const [updated] = await db.update(employees)
  .set({ status: 'active' })
  .where(eq(employees.id, id))
  .returning();
```

## Transactions
```typescript
await db.transaction(async (tx) => {
  const [emp] = await tx.insert(employees).values(data).returning();
  await tx.insert(domainOutbox).values({ aggregateId: emp.id });
  return emp;
});
```

## Raw SQL
```typescript
import { sql } from 'drizzle-orm';
await db.execute(sql`SET app.current_tenant = ${tenantId}`);
```

## Cursor Pagination
```typescript
const items = await db.query.employees.findMany({
  where: cursor ? gt(employees.id, cursor) : undefined,
  orderBy: [asc(employees.id)],
  limit: limit + 1,
});
const hasMore = items.length > limit;
const nextCursor = hasMore ? items.at(-1)!.id : null;
```
