---
name: api-conventions
description: Follow Staffora API conventions. Use when designing API endpoints, error handling, pagination, or TypeBox schemas.
---

# API Conventions

## URL Structure
- Base: `/api/v1/`
- Module routes: `/api/v1/{module}/{resource}`
- Examples: `/api/v1/hr/employees`, `/api/v1/time/timesheets`

## Required Headers
```
Content-Type: application/json
Idempotency-Key: {uuid}  # Required for POST/PUT/PATCH/DELETE
```

## Pagination (Cursor-based)
```typescript
// Request
GET /api/v1/hr/employees?cursor=eyJpZCI6...&limit=20

// Response
{
  "items": [...],
  "pagination": { "cursor": "...", "hasMore": true, "total": 150 }
}
```

## Error Response
```typescript
{
  "error": {
    "code": "HR_EMPLOYEE_NOT_FOUND",
    "message": "Employee not found",
    "details": { "employeeId": "..." },
    "requestId": "req_abc123"
  }
}
```

## Error Codes
```typescript
import { ErrorCodes } from '@staffora/shared/errors';
ErrorCodes.HR.EMPLOYEE_NOT_FOUND
ErrorCodes.TIME.TIMESHEET_ALREADY_SUBMITTED
```

## TypeBox Schemas
```typescript
import { t } from 'elysia';

const CreateSchema = t.Object({
  name: t.String({ minLength: 1 }),
  email: t.String({ format: 'email' }),
});

const ParamsSchema = t.Object({
  id: t.String({ format: 'uuid' }),
});

const QuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
```

## Route Definition
```typescript
export const routes = new Elysia({ prefix: '/resources' })
  .get('/', handler, { query: QuerySchema, response: ResponseSchema })
  .get('/:id', handler, { params: ParamsSchema })
  .post('/', handler, { body: CreateSchema });
```
