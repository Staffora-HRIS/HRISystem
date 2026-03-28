# [ARCHITECTURE] Tenant Cache Not Invalidated on Suspension (5-Minute Race Window)

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** HIGH
**Labels:** bug, security
**Effort:** SMALL

## Description
The `TenantService.getById()` method caches tenant data for 300 seconds (5 minutes). When a tenant is suspended, the cache is only invalidated when `validateTenant()` detects the suspended status. During the 5-minute window, a suspended tenant's users can continue making authenticated, tenant-scoped requests. For an enterprise HRIS handling payroll and PII, this is a significant security gap.

## Current State
- `packages/api/src/plugins/tenant.ts` (lines 91-118): 300-second cache TTL
- Cache invalidation only on validation check (lines 177-183)
- 5-minute window where suspended tenants remain active

## Expected State
- Tenant cache TTL reduced to 30-60 seconds
- Event-driven cache invalidation on tenant status changes
- Immediate effect when tenant is suspended

## Acceptance Criteria
- [ ] Tenant cache TTL reduced to 60 seconds or less
- [ ] Tenant status change triggers immediate cache invalidation
- [ ] Integration test verifies suspended tenant is blocked within 60 seconds
- [ ] Cache invalidation logged for audit trail

## Implementation Notes
Short-term: reduce TTL to 60 seconds. Medium-term: add an event-driven invalidation via Redis pub/sub when tenant status changes in the database.

## Affected Files
- `packages/api/src/plugins/tenant.ts`
- `packages/api/src/modules/tenant/service.ts`

## Related Issues
- None
