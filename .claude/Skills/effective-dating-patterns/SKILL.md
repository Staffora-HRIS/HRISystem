---
name: effective-dating-patterns
description: Implement effective-dated records for HR data that changes over time. Use when working with positions, salaries, managers, contracts, or any time-versioned employee data.
---

# Effective Dating Patterns

## Concept
Effective dating tracks historical changes:
- `effective_from`: When record becomes active (inclusive)
- `effective_to`: When record ends (NULL = current/active)

## Database Schema
```sql
CREATE TABLE app.position_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES app.tenants(id),
    employee_id UUID NOT NULL REFERENCES app.employees(id),
    position_id UUID NOT NULL REFERENCES app.positions(id),
    effective_from DATE NOT NULL,
    effective_to DATE, -- NULL means current

    -- Prevent overlapping ranges
    CONSTRAINT no_overlap EXCLUDE USING gist (
        employee_id WITH =,
        daterange(effective_from, effective_to, '[)') WITH &&
    )
);

-- Requires: CREATE EXTENSION IF NOT EXISTS btree_gist;
```

## Query Patterns (postgres.js tagged templates)

### Current Record
```typescript
async getCurrentPosition(ctx: TenantContext, employeeId: string) {
  const rows = await this.db`
    SELECT * FROM app.position_assignments
    WHERE employee_id = ${employeeId}
      AND effective_to IS NULL
  `;
  return rows[0] ?? null;
}
```

### As-Of Date
```typescript
async getPositionAsOf(ctx: TenantContext, employeeId: string, asOfDate: string) {
  const rows = await this.db`
    SELECT * FROM app.position_assignments
    WHERE employee_id = ${employeeId}
      AND effective_from <= ${asOfDate}::date
      AND (effective_to IS NULL OR effective_to > ${asOfDate}::date)
  `;
  return rows[0] ?? null;
}
```

## Service Layer Validation
```typescript
async updatePosition(ctx: TenantContext, employeeId: string, data: Input) {
  return await this.db.begin(async (tx) => {
    // Validate no overlapping records
    const overlaps = await tx`
      SELECT id FROM app.position_assignments
      WHERE employee_id = ${employeeId}
        AND id != ${data.id ?? '00000000-0000-0000-0000-000000000000'}
        AND effective_from < ${data.effectiveTo ?? '9999-12-31'}::date
        AND (effective_to IS NULL OR effective_to > ${data.effectiveFrom}::date)
    `;
    if (overlaps.length > 0) throw new ConflictError('Overlapping effective date range');

    // Close out current record if needed
    const current = await tx`
      SELECT * FROM app.position_assignments
      WHERE employee_id = ${employeeId} AND effective_to IS NULL
    `;
    if (current[0] && current[0].id !== data.id) {
      await tx`
        UPDATE app.position_assignments
        SET effective_to = ${data.effectiveFrom}::date - INTERVAL '1 day'
        WHERE id = ${current[0].id}
      `;
    }

    const rows = await tx`
      INSERT INTO app.position_assignments (tenant_id, employee_id, position_id, effective_from, effective_to)
      VALUES (${ctx.tenantId}, ${employeeId}, ${data.positionId}, ${data.effectiveFrom}, ${data.effectiveTo})
      RETURNING *
    `;
    return rows[0];
  });
}
```

## Common Effective-Dated Entities
- `app.position_assignments` — Job assignments
- `app.compensation_history` — Salary records
- `app.reporting_lines` — Manager relationships
- `app.employment_contracts` — Contract details
- `app.employee_personal` — Personal information
