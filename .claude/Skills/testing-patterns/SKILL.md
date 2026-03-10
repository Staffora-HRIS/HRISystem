---
name: testing-patterns
description: Write integration tests for HRIS. Use when creating tests for RLS, idempotency, effective dating, outbox, or state machines in packages/api/src/test/.
---

# Testing Patterns

## Commands
```bash
bun test                              # All tests
bun run test:api                      # API tests
bun run test:web                      # Frontend tests
bun test --watch                      # Watch mode
bun test path/to/file.test.ts         # Single file
```

## Required Integration Tests

### 1. RLS Tests (Critical)
```typescript
describe('RLS', () => {
  test('tenant B cannot read tenant A data', async () => {
    const db = getTestDb();
    await setTenantContext(db, tenantB.id);
    const result = await db`SELECT * FROM employees`;
    expect(result.find(e => e.tenantId === tenantA.id)).toBeUndefined();
  });

  test('tenant B cannot update tenant A data', async () => {
    const db = getTestDb();
    await setTenantContext(db, tenantB.id);
    const result = await db`
      UPDATE employees SET first_name = 'Hacked'
      WHERE id = ${tenantAEmployee.id}
      RETURNING *
    `;
    expect(result).toHaveLength(0);
  });
});
```

### 2. Idempotency Tests
```typescript
test('duplicate request returns cached result', async () => {
  const key = crypto.randomUUID();
  const res1 = await postWithKey('/api/v1/hr/employees', data, key);
  const res2 = await postWithKey('/api/v1/hr/employees', data, key);
  expect(res2.id).toBe(res1.id);
});
```

### 3. Effective Dating Tests
```typescript
test('prevents overlapping records', async () => {
  await service.createPosition(empId, { effectiveFrom: '2024-01-01' });
  await expect(
    service.createPosition(empId, { effectiveFrom: '2024-06-01' })
  ).rejects.toThrow(/overlap/i);
});
```

### 4. Outbox Tests
```typescript
test('event written atomically', async () => {
  const db = getTestDb();
  const emp = await service.create(validData, ctx);
  const [event] = await withSystemContext(db, async (tx) => {
    return await tx`
      SELECT * FROM domain_outbox
      WHERE aggregate_id = ${emp.id}
    `;
  });
  expect(event.eventType).toBe('hr.employee.created');
});
```

### 5. State Machine Tests
```typescript
test('valid transitions', () => {
  expect(lifecycle.canTransition('pending', 'active')).toBe(true);
  expect(lifecycle.canTransition('terminated', 'active')).toBe(false);
});
```

## Test Setup
```typescript
import { getTestDb, setTenantContext, withSystemContext, createTestTenant, createTestUser, closeTestConnections } from '../setup';

// setTenantContext requires db as first param
export async function setTenantContext(
  db: ReturnType<typeof postgres>,
  tenantId: string,
  userId?: string
) {
  await db`SELECT set_config('app.current_tenant', ${tenantId}, false)`;
  await db`SELECT set_config('app.current_user', ${userId ?? ''}, false)`;
}

// Bypass RLS for admin operations in tests
export async function withSystemContext<T>(
  db: ReturnType<typeof postgres>,
  fn: (tx: TransactionSql) => Promise<T>
): Promise<T> {
  return await db.begin(async (tx) => {
    await tx`SELECT app.enable_system_context()`;
    try { return await fn(tx); }
    finally { await tx`SELECT app.disable_system_context()`; }
  });
}
```
