# Coding Patterns

Last updated: 2026-03-28

This document covers the critical coding patterns used throughout the Staffora HRIS platform. These patterns are non-negotiable and must be followed in all new code.

---

## 1. Multi-Tenant Row-Level Security (RLS)

Every tenant-owned table uses PostgreSQL RLS to guarantee data isolation between tenants at the database level. No application-level filtering is sufficient -- RLS provides a defence-in-depth guarantee.

### How It Works

1. Each table has a `tenant_id` column
2. RLS is enabled on every tenant-owned table
3. Two policies enforce isolation: one for reads/updates/deletes, one for inserts
4. The `hris_app` database role has `NOBYPASSRLS` -- there is no way to skip RLS
5. Before each transaction, `app.set_tenant_context()` sets the current tenant

### Migration Pattern

```sql
-- 1. Table must have tenant_id
CREATE TABLE app.my_table (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
    -- ... other columns ...
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE app.my_table ENABLE ROW LEVEL SECURITY;

-- 3. Isolation policy (SELECT, UPDATE, DELETE)
CREATE POLICY tenant_isolation ON app.my_table
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

-- 4. Insert policy
CREATE POLICY tenant_isolation_insert ON app.my_table
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );
```

### Application Code

```typescript
// All queries go through withTransaction, which sets RLS context
const rows = await db.withTransaction(ctx, async (tx) => {
  // ctx = { tenantId: "uuid-of-tenant", userId: "uuid-of-user" }
  // Before your callback, withTransaction executes:
  //   SELECT app.set_tenant_context(tenantId::uuid, userId::uuid)
  return tx`SELECT * FROM employees WHERE is_active = true`;
  // RLS automatically filters to only this tenant's rows
});
```

### System Context for Administrative Operations

```typescript
// Bypasses RLS -- use only for migrations, seeds, cross-tenant admin operations
const allTenants = await db.withSystemContext(async (tx) => {
  return tx`SELECT * FROM tenants WHERE is_active = true`;
});
```

### What Integration Tests Must Verify

```typescript
// Test that Tenant A cannot see Tenant B's data
const tenantACtx = { tenantId: tenantA.id, userId: userA.id };
const tenantBCtx = { tenantId: tenantB.id, userId: userB.id };

// Create employee in Tenant A
await db.withTransaction(tenantACtx, async (tx) => {
  await tx`INSERT INTO employees (id, tenant_id, ...) VALUES (...)`;
});

// Verify Tenant B cannot see it
const rows = await db.withTransaction(tenantBCtx, async (tx) => {
  return tx`SELECT * FROM employees`;
});
expect(rows.length).toBe(0);  // Must be zero
```

---

## 2. Effective Dating

HR data that changes over time (positions, salaries, managers, contracts) uses `effective_from` / `effective_to` date ranges instead of overwriting values.

### Schema Pattern

```sql
CREATE TABLE app.employee_positions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    employee_id uuid NOT NULL REFERENCES app.employees(id),
    position_id uuid NOT NULL REFERENCES app.positions(id),
    effective_from date NOT NULL,
    effective_to date,           -- NULL means currently effective
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Rules

- `effective_to = NULL` means the record is the current/active record
- **No overlapping records** per employee per dimension (e.g., one active position at a time)
- Overlaps must be validated inside a transaction (serializable or with advisory locks) to prevent race conditions
- Historical records are never deleted -- they form an audit trail

### Querying Current Records

```sql
-- Get current position for an employee
SELECT * FROM app.employee_positions
WHERE employee_id = $1
  AND effective_from <= CURRENT_DATE
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE);
```

### Creating New Records with Overlap Prevention

```typescript
await db.withTransaction(ctx, async (tx) => {
  // 1. Close the current record
  await tx`
    UPDATE employee_positions SET
      effective_to = ${newRecord.effectiveFrom}::date - interval '1 day',
      updated_at = now()
    WHERE employee_id = ${employeeId}::uuid
      AND effective_to IS NULL
  `;

  // 2. Insert the new record
  const [row] = await tx`
    INSERT INTO employee_positions (id, tenant_id, employee_id, position_id, effective_from)
    VALUES (${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid,
            ${employeeId}::uuid, ${positionId}::uuid, ${effectiveFrom})
    RETURNING *
  `;

  return row;
}, { isolationLevel: "serializable" });
```

---

## 3. Outbox Pattern

All domain events are written to the `domain_outbox` table in the **same transaction** as the business write. This guarantees at-least-once delivery -- either both the business data and the event are committed, or neither is.

### Why

- Avoids dual-write problems (writing to the database and a message queue separately)
- The outbox processor polls the table and publishes events to Redis Streams
- Workers consume from Redis Streams to handle async side effects

### Database Table

```sql
CREATE TABLE app.domain_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    aggregate_type varchar(100) NOT NULL,  -- e.g., 'employee', 'leave_request'
    aggregate_id uuid NOT NULL,
    event_type varchar(200) NOT NULL,      -- e.g., 'hr.employee.created'
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,              -- NULL until processed
    error_count int NOT NULL DEFAULT 0
);
```

### Application Code

Always write the outbox entry inside the same transaction as the business write:

```typescript
async createLeaveType(ctx: TenantContext, data: CreateLeaveType): Promise<LeaveTypeRow> {
  return this.db.withTransaction(ctx, async (tx) => {
    // 1. Business write
    const id = crypto.randomUUID();
    const [row] = await tx`
      INSERT INTO app.leave_types (id, tenant_id, code, name, is_active)
      VALUES (${id}::uuid, ${ctx.tenantId}::uuid, ${data.code}, ${data.name}, true)
      RETURNING *
    `;

    // 2. Outbox event (SAME transaction)
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload
      ) VALUES (
        ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid,
        'leave_type', ${id}::uuid, 'absence.leave_type.created',
        ${JSON.stringify({ leaveTypeId: id, actor: ctx.userId })}::jsonb
      )
    `;

    return row;
  });
}
```

### Event Naming Convention

```
{module}.{aggregate}.{action}
```

Examples:
- `hr.employee.created`
- `absence.request.submitted`
- `absence.request.approved`
- `talent.review.completed`
- `cases.case.escalated`

### Processing Flow

```
[Business Write + Outbox] --> [Outbox Processor polls] --> [Redis Stream]
                                                              |
                              [Notification Worker] <---------+
                              [Export Worker]       <---------+
                              [Analytics Worker]   <---------+
```

---

## 4. Idempotency

All mutating API endpoints (POST, PUT, PATCH, DELETE) require an `Idempotency-Key` header. This prevents duplicate operations caused by network retries, client bugs, or load balancer replays.

### How It Works

1. Client sends `Idempotency-Key: <unique-uuid>` header with every mutation
2. The idempotency plugin checks if this key has been seen before (scoped to tenant + user + route)
3. If duplicate: returns the cached response from the first execution
4. If new: executes the request, caches the response, returns it
5. Keys expire after 24-72 hours

### Client-Side (API Client)

The frontend `api` client generates idempotency keys automatically:

```typescript
// From packages/web/app/lib/api-client.ts
async post<T>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<T> {
  const headers = new Headers(config?.headers);
  headers.set("Idempotency-Key", crypto.randomUUID());  // Auto-generated
  return this.request<T>(endpoint, { ...config, method: "POST", headers, body: ... });
}
```

### Server-Side (Plugin)

The `idempotencyPlugin` in `packages/api/src/plugins/idempotency.ts` handles deduplication:

```typescript
// Key scope: (tenant_id, user_id, route_key)
// This means the same user re-sending the same request to the same endpoint
// with the same idempotency key will get a cached response
```

### Backend Route Usage

```typescript
.post("/leave-types", handler, {
  beforeHandle: [requirePermission("absence", "write")],
  body: CreateLeaveTypeSchema,
  // Idempotency is enforced globally by the plugin -- no per-route config needed
})
```

---

## 5. State Machines

All entities with lifecycle states use explicitly defined state machines from `packages/shared/src/state-machines/`. This ensures state transitions are validated consistently across the API and frontend.

### Defined State Machines

| Entity | States | File |
|--------|--------|------|
| **Employee lifecycle** | `pending -> active -> on_leave <-> active -> terminated` | `employee.ts` |
| **Leave request** | `draft -> pending -> approved/rejected/cancelled` | `leave-request.ts` |
| **Case management** | `open -> in_progress -> resolved -> closed` (with escalation, reopening) | `case.ts` |
| **Workflow** | `draft -> pending -> in_progress -> completed/cancelled/failed` | `workflow.ts` |
| **Performance cycle** | `draft -> active -> review -> calibration -> completed` | `performance-cycle.ts` |
| **Flexible working** | `submitted -> under_consultation -> approved/rejected/withdrawn` | `flexible-working.ts` |
| **Data breach** | `detected -> assessed -> contained -> notified -> resolved` | `data-breach.ts` |
| **Onboarding** | Template, instance, and task state machines | `onboarding.ts` |
| **Recruitment** | Requisition, candidate stage, and offer state machines | `recruitment.ts` |

### Usage Pattern

```typescript
import {
  canTransitionLeaveRequest,
  validateLeaveRequestTransition,
  getValidLeaveRequestTransitions,
} from "@staffora/shared/state-machines";

// Check if a transition is valid
if (!canTransitionLeaveRequest("draft", "pending")) {
  throw new Error("Invalid state transition");
}

// Validate with error details
const result = validateLeaveRequestTransition("approved", "pending");
// result = { valid: false, error: "Cannot transition from approved to pending" }

// Get valid next states
const nextStates = getValidLeaveRequestTransitions("draft");
// nextStates = ["pending", "cancelled"]
```

### Database Enforcement

State transitions are enforced in the repository layer using SQL WHERE clauses:

```typescript
// Only allow submission of draft requests
const [row] = await tx`
  UPDATE app.leave_requests SET
    status = 'pending',
    submitted_at = now(),
    updated_at = now()
  WHERE id = ${id}::uuid
    AND tenant_id = ${ctx.tenantId}::uuid
    AND status = 'draft'                     -- Enforce valid source state
  RETURNING *
`;

if (!row) {
  // Either not found or not in the right state
  return null;
}
```

### Immutable Transition Audit

State transitions should be recorded immutably for audit:

```typescript
// After a leave request approval
await tx`
  INSERT INTO app.leave_request_approvals (
    id, tenant_id, request_id, actor_id, action, comment
  ) VALUES (
    ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid,
    ${requestId}::uuid, ${approverId}::uuid, 'approve', ${comments || null}
  )
`;
```

---

## 6. Error Handling Pattern

### Service Layer

Services return `ServiceResult<T>` objects:

```typescript
interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
```

```typescript
async createLeaveType(ctx: TenantContext, input: CreateLeaveType): Promise<ServiceResult<unknown>> {
  try {
    // Validation
    if (!isValid(input.code)) {
      return { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid code" } };
    }
    // Business logic
    const result = await this.repo.createLeaveType(ctx, input);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to create" } };
  }
}
```

### Route Layer

Routes translate `ServiceResult` to HTTP responses:

```typescript
const result = await service.createLeaveType(tenantContext, body);
if (!result.success) {
  const statusCode = result.error?.code === "NOT_FOUND" ? 404
    : result.error?.code === "VALIDATION_ERROR" ? 400
    : result.error?.code === "BELOW_STATUTORY_MINIMUM" ? 422
    : 500;
  return error(statusCode, { error: result.error });
}
return result.data;
```

### API Error Shape

All error responses follow a consistent shape:

```json
{
  "error": {
    "code": "LEAVE_TYPE_NOT_FOUND",
    "message": "Leave type not found",
    "details": {},
    "requestId": "req_abc123"
  }
}
```

---

## 7. Cursor-Based Pagination

All list endpoints use cursor-based pagination (not offset-based):

```typescript
// Repository
async getLeaveRequests(ctx: TenantContext, filters: Filters): Promise<PaginatedResult<Row>> {
  const limit = filters.limit || 20;
  const rows = await this.db.withTransaction(ctx, async (tx) => {
    return tx`
      SELECT * FROM app.leave_requests
      WHERE tenant_id = ${ctx.tenantId}::uuid
      ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit + 1}
    `;
  });

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;
  return { data, cursor, hasMore };
}
```

```typescript
// Route response shape
return {
  items: result.data.map(formatItem),
  nextCursor: result.cursor,
  hasMore: result.hasMore,
};
```

---

## 8. UK Compliance Validation

As a UK-only HRIS, business rules enforce UK employment law:

```typescript
// UK statutory minimum annual leave (Working Time Regulations 1998)
export const UK_STATUTORY = {
  STATUTORY_MINIMUM_DAYS: 28,  // 5.6 weeks for full-time
  WEEKS_ENTITLEMENT: 5.6,
} as const;

// Pro-rata calculation for part-time workers
export function calculateMinimumEntitlement(daysPerWeek: number): number {
  const raw = (daysPerWeek / 5) * 28;
  return Math.min(Math.ceil(raw), 28);
}

// Enforce in service layer
if (input.annualAllowance < minimumEntitlement) {
  return {
    success: false,
    error: {
      code: "BELOW_STATUTORY_MINIMUM",
      message: `Entitlement of ${input.annualAllowance} days is below the UK statutory minimum of ${minimumEntitlement} days`,
    },
  };
}
```

---

## Summary Checklist

When implementing a new feature, ensure you follow all critical patterns:

- [ ] **RLS**: Table has `tenant_id`, RLS enabled, both policies created
- [ ] **Transactions**: All queries use `db.withTransaction(ctx, ...)` for tenant-scoped access
- [ ] **Outbox**: Domain events written in the same transaction as business writes
- [ ] **Idempotency**: Mutations accept and respect `Idempotency-Key` header
- [ ] **State machines**: State transitions validated before execution, recorded immutably
- [ ] **Effective dating**: Time-versioned records use `effective_from`/`effective_to`, overlaps prevented
- [ ] **Cursor pagination**: List endpoints use cursor-based pagination
- [ ] **Error handling**: Services return `ServiceResult<T>`, routes map to HTTP status codes
- [ ] **UK compliance**: Business rules enforce relevant UK employment law
- [ ] **Permissions**: Routes guarded with `requirePermission(resource, action)`

---

## Related Documents

- [Architecture Overview](../02-architecture/ARCHITECTURE.md) — System architecture, plugin chain, and request flow
- [Database Guide](./database-guide.md) — Database queries, migrations, RLS, and connection management
- [Backend Development](./backend-development.md) — Module structure, service layer, and route conventions
- [State Machine Patterns](../02-architecture/state-machines.md) — Employee lifecycle, leave request, and case state machines
- [RLS and Multi-Tenancy](../07-security/rls-multi-tenancy.md) — Row-Level Security policies and tenant isolation
- [Worker System](../02-architecture/WORKER_SYSTEM.md) — Outbox processor and background job architecture
- [API Reference](../04-api/api-reference.md) — Endpoint specifications showing pagination and error patterns
- [Testing Guide](../08-testing/testing-guide.md) — Integration test patterns for all critical coding patterns
