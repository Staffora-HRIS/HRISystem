# Patterns

> Reusable design patterns and cross-cutting concerns enforced across the Staffora platform.

*Last updated: 2026-03-28*

## Contents

| File | When to Read |
|------|-------------|
| [STATE_MACHINES.md](STATE_MACHINES.md) | Implementing or modifying lifecycle transitions. Contains 5 state machines with Mermaid diagrams, transition tables, and metadata: **Employee Lifecycle**, **Leave Request**, **Case Management**, **Workflow/Approval**, **Performance Cycle** |
| [SECURITY.md](SECURITY.md) | Working with auth, permissions, or tenant isolation. Covers: multi-tenant RLS (how it works, migration template), BetterAuth (session flow, endpoints), RBAC (permission model, checking), audit logging (entry structure), security headers, idempotency, rate limiting, CORS |

## Pattern Summary

### 1. Multi-Tenant RLS (Non-Negotiable)

Every tenant-owned table must have:
- `tenant_id uuid NOT NULL` column
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- `tenant_isolation` policy (SELECT/UPDATE/DELETE)
- `tenant_isolation_insert` policy (INSERT)

The app connects as `hris_app` (NOBYPASSRLS) so RLS is always enforced.

**Source**: `packages/api/src/plugins/tenant.ts`, every migration file

### 2. Effective Dating

Time-versioned records use `effective_from` / `effective_to` (NULL = current):
- No overlapping records per employee per dimension
- Validate under transaction to prevent races
- Use `validateNoOverlap()` utility

**Source**: `packages/shared/src/utils/effective-dating.ts`

### 3. Outbox Pattern

Domain events written to `domain_outbox` in the same transaction as the business write. Worker polls and publishes to Redis Streams.

**Source**: `packages/api/src/jobs/outbox-processor.ts`

### 4. Idempotency

All mutating endpoints require `Idempotency-Key` header. Scoped to `(tenant_id, user_id, route_key)`. TTL: 24-72 hours.

**Source**: `packages/api/src/plugins/idempotency.ts`

### 5. State Machines

All defined in `packages/shared/src/state-machines/`:

| Machine | States | Terminal States | File |
|---------|:------:|:------:|------|
| Employee Lifecycle | 4 | terminated | `employee.ts` |
| Leave Request | 7 | rejected, cancelled, completed | `leave-request.ts` |
| Case Management | 7 | closed, cancelled | `case.ts` |
| Workflow/Approval | 12 | approved, rejected, cancelled, expired | `workflow.ts` |
| Performance Cycle | 5 | closed | `performance-cycle.ts` |

### 6. Audit Trail

All significant operations logged to `audit_log` (partitioned, append-only). Records: who, what, when, from where, what changed.

**Source**: `packages/api/src/plugins/audit.ts`

### 7. RBAC

Permission-based access: `permissions` → `role_permissions` → `roles` → `role_assignments` (tenant-scoped).

Check with: `requirePermission('hr.employees.read')`

**Source**: `packages/api/src/plugins/rbac.ts`
