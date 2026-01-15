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
CREATE TABLE app.employee_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES app.tenant(id),
    employee_id UUID NOT NULL REFERENCES app.employee(id),
    position_id UUID NOT NULL REFERENCES app.position(id),
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

## Query Patterns

### Current Record
```typescript
async getCurrentPosition(employeeId: string) {
  return db.query.employeePositions.findFirst({
    where: and(
      eq(employeePositions.employeeId, employeeId),
      isNull(employeePositions.effectiveTo)
    ),
  });
}
```

### As-Of Date
```typescript
async getPositionAsOf(employeeId: string, asOfDate: Date) {
  return db.query.employeePositions.findFirst({
    where: and(
      eq(employeePositions.employeeId, employeeId),
      lte(employeePositions.effectiveFrom, asOfDate),
      or(isNull(employeePositions.effectiveTo), gt(employeePositions.effectiveTo, asOfDate))
    ),
  });
}
```

## Service Layer Validation
```typescript
async updatePosition(employeeId: string, data: Input, ctx: Context) {
  return db.transaction(async (tx) => {
    // Validate no overlapping records
    await validateNoOverlap(tx, {
      tableName: 'employee_positions',
      employeeId,
      newRange: { from: data.effectiveFrom, to: data.effectiveTo },
      excludeId: data.id,
    });

    // Close out current record if needed
    const current = await this.repo.getCurrentPosition(employeeId);
    if (current && current.id !== data.id) {
      const dayBefore = new Date(data.effectiveFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      await tx.update(employeePositions)
        .set({ effectiveTo: dayBefore })
        .where(eq(employeePositions.id, current.id));
    }

    return tx.insert(employeePositions).values({ ...data, tenantId: ctx.tenantId }).returning();
  });
}
```

## Common Effective-Dated Entities
- `employee_positions` - Job assignments
- `employee_salaries` - Compensation
- `employee_managers` - Reporting relationships
- `employee_contracts` - Employment contracts
