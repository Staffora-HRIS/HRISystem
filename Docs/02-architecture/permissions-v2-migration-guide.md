# Permissions V2 — Migration Guide

*Last updated: 2026-03-28*

## Overview

The enhanced permission system (v2) adds 7-layer enforcement on top of the existing RBAC. It is **fully backwards-compatible** — all existing `requirePermission('resource', 'action')` calls continue to work unchanged.

## When to Use V2 Guards

Use `requirePermissionV2` when you need:
- **Data scope enforcement** — restrict access based on reporting lines, department, etc.
- **Contextual conditions** — time windows, workflow states, payroll lock periods
- **Separation of duties** — prevent same user from creating + approving
- **MFA step-up** — require MFA for sensitive actions
- **Audit on success** — log granted access (not just denials)

For simple permission checks without scope/conditions, the original `requirePermission` is still fine.

## Backend: Adopting V2 Guards

### Basic Usage (drop-in replacement)

```ts
import { requirePermissionV2 } from "../security";

// Before (v1):
app.get('/employees/:id', handler, {
  beforeHandle: [requirePermission('employees', 'read')],
});

// After (v2) — same behaviour, but now uses 7-layer engine:
app.get('/employees/:id', handler, {
  beforeHandle: [
    requirePermissionV2({ resource: 'employees', action: 'read' }),
  ],
});
```

### With Data Scope Enforcement

```ts
app.get('/employees/:id', handler, {
  beforeHandle: [
    requirePermissionV2({
      resource: 'employees',
      action: 'read',
      // Scope check: can user access this specific employee?
      getTargetOwnerId: async (ctx) => {
        const employee = await getEmployee(ctx.params.id);
        return employee?.userId ?? null;
      },
    }),
  ],
});
```

### With Workflow State Conditions

```ts
app.patch('/leave-requests/:id', handler, {
  beforeHandle: [
    requirePermissionV2({
      resource: 'leave_requests',
      action: 'update',
      getWorkflowState: async (ctx) => {
        const request = await getLeaveRequest(ctx.params.id);
        return request?.status ?? null;
      },
    }),
  ],
});
```

### With Payroll Lock & Audit

```ts
app.put('/time-entries/:id', handler, {
  beforeHandle: [
    requirePermissionV2({
      resource: 'time_entries',
      action: 'update',
      getMetadata: async (ctx) => ({
        payrollPeriodLocked: await isPayrollLocked(ctx.params.periodId),
      }),
      auditOnSuccess: true,
    }),
  ],
});
```

### Any-Of Permission Check

```ts
import { requireAnyPermissionV2 } from "../security";

app.get('/reports/turnover', handler, {
  beforeHandle: [
    requireAnyPermissionV2([
      { resource: 'analytics', action: 'view_turnover' },
      { resource: 'reports', action: 'view_standard' },
    ]),
  ],
});
```

### Self-or-Permission Guard

```ts
import { requireSelfOrPermission } from "../security";

// Employee can view own payslip; payroll_admin can view anyone's
app.get('/payslips/:userId', handler, {
  beforeHandle: [
    requireSelfOrPermission(
      'payslips', 'view_all',
      (ctx) => ctx.params.userId
    ),
  ],
});
```

### Sensitivity Tier Guard

```ts
import { requireSensitivityTier } from "../security";

// Only users with tier 3+ clearance can access bank details
app.get('/employees/:id/bank-details', handler, {
  beforeHandle: [
    requireSensitivityTier(3),
    requirePermissionV2({ resource: 'bank_details', action: 'read' }),
  ],
});
```

## Frontend: Enhanced Permission Hooks

### Provider Setup

Wrap your app (or admin layout) with the provider:

```tsx
import { EnhancedPermissionProvider } from "~/hooks/use-enhanced-permissions";

function AdminLayout({ children }) {
  // These values typically come from the session/API
  return (
    <EnhancedPermissionProvider maxScope="department" maxSensitivityTier={2}>
      {children}
    </EnhancedPermissionProvider>
  );
}
```

### Hook Usage

```tsx
import { useEnhancedPermissions } from "~/hooks/use-enhanced-permissions";

function EmployeeActions() {
  const {
    hasPermission,
    hasAnyPermission,
    canAccessScope,
    canAccessTier,
    explainPermission,
  } = useEnhancedPermissions();

  return (
    <>
      {hasPermission('employees:export') && <ExportButton />}
      {canAccessScope('department') && <DepartmentReport />}
      {canAccessTier(2) && <SalaryColumn />}
    </>
  );
}
```

### Permission Gate Component

```tsx
import { EnhancedPermissionGate } from "~/hooks/use-enhanced-permissions";

<EnhancedPermissionGate
  permission="employees:view_salary"
  minTier={2}
  scope="department"
  fallback={<p>Access restricted</p>}
>
  <SalaryTable />
</EnhancedPermissionGate>
```

### Sensitive Field Masking

```tsx
import { SensitiveField } from "~/hooks/use-enhanced-permissions";

<SensitiveField
  value={employee.niNumber}
  tier={3}
  maskPattern="****{last4}"
  permission="employees:view_sensitive"
/>
```

## Migration Strategy

1. **Phase 1 (current):** New modules and high-security routes adopt `requirePermissionV2`
2. **Phase 2:** Gradually migrate sensitive routes (payroll, compliance, recruitment)
3. **Phase 3:** Migrate remaining routes during normal maintenance

No existing routes need to change immediately — the v1 guards continue to work.

## Files Reference

| File | Purpose |
|------|---------|
| `migrations/0176_expanded_system_roles.sql` | 13 new system roles + hierarchy columns |
| `migrations/0177_expanded_permissions_catalog.sql` | 350+ permission keys |
| `migrations/0178_data_scopes_and_conditions.sql` | Scopes, conditions, SoD, access reviews |
| `migrations/0179_seed_expanded_role_permissions.sql` | Links new roles to permissions |
| `packages/api/src/modules/security/permission-resolution.service.ts` | 7-layer engine |
| `packages/api/src/modules/security/permission-guard.middleware.ts` | V2 guards |
| `packages/web/app/hooks/use-enhanced-permissions.tsx` | Frontend hooks & components |
| `packages/api/src/modules/security/__tests__/permission-resolution.test.ts` | Integration tests |

---

## Related Documents

- [Permissions System](PERMISSIONS_SYSTEM.md) — Full 7-layer permission architecture specification
- [Security Patterns](../patterns/SECURITY.md) — RLS, RBAC, and authorization enforcement
- [API Reference](../api/API_REFERENCE.md) — Endpoint permission requirements
- [Security Audit](../audit/security-audit.md) — Access control audit findings
- [Frontend Guide](../guides/FRONTEND.md) — UI permission guards and hooks
