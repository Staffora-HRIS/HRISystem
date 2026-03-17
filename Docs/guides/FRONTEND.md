# Frontend Guide

*Last updated: 2026-03-17*

## Overview

The frontend is a React 18 application using React Router v7 in **framework mode** with file-based routing.

| Technology | Purpose |
|-----------|---------|
| React 18 | UI framework |
| React Router v7 | File-based routing (framework mode) |
| React Query | Server state management and caching |
| Tailwind CSS | Utility-first styling |
| Vitest | Unit testing (not bun test) |

## Project Structure

```
packages/web/
├── app/
│   ├── routes/              # File-based routing
│   │   ├── (auth)/          # Public auth pages
│   │   │   ├── login.tsx
│   │   │   └── forgot-password.tsx
│   │   ├── (app)/           # Authenticated pages
│   │   │   ├── dashboard.tsx
│   │   │   ├── employees/
│   │   │   ├── time/
│   │   │   ├── leave/
│   │   │   ├── talent/
│   │   │   ├── learning/
│   │   │   ├── cases/
│   │   │   └── ...
│   │   └── (admin)/         # Admin-only pages
│   │       ├── settings/
│   │       ├── roles/
│   │       └── audit-log/
│   ├── components/
│   │   ├── ui/              # Reusable UI components
│   │   └── layouts/         # Page layouts
│   ├── hooks/
│   │   ├── use-permissions.ts
│   │   └── use-tenant.ts
│   └── lib/
│       ├── api-client.ts    # HTTP client for API calls
│       ├── query-client.ts  # React Query configuration
│       ├── auth.ts          # Auth utilities
│       ├── theme.ts         # Theme configuration
│       └── utils.ts         # General utilities
├── public/                  # Static assets
├── vite.config.ts           # Vite configuration
└── Dockerfile
```

## Route Groups

Routes are organized into three groups using React Router v7 route groups:

### `(auth)/` - Public Authentication

No authentication required. Login, registration, password reset.

### `(app)/` - Authenticated Application

Requires valid session. All main Staffora functionality:
- Dashboard
- Employee management
- Time & Attendance
- Leave management
- Talent management
- Learning
- Cases
- Documents
- etc.

### `(admin)/` - Administration

Requires admin-level permissions. System configuration:
- Tenant settings
- Role management
- Audit log viewer

## API Client

The API client in `app/lib/api-client.ts` handles:
- Base URL configuration via `VITE_API_URL`
- Cookie-based authentication (credentials: include)
- CSRF token attachment
- Error response parsing
- Idempotency key generation for mutating requests

## React Query Patterns

### Query Hooks

```typescript
// Example: Employee list query hook
export function useEmployees(params?: EmployeeListParams) {
  return useQuery({
    queryKey: ['employees', params],
    queryFn: () => apiClient.get('/api/v1/hr/employees', { params }),
  });
}
```

### Mutation Hooks

```typescript
// Example: Create employee mutation
export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEmployeeInput) =>
      apiClient.post('/api/v1/hr/employees', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}
```

## Permission-Based Rendering

The `use-permissions` hook provides permission checking:

```typescript
import { usePermissions } from '~/hooks/use-permissions';

function EmployeeActions({ employee }) {
  const { hasPermission } = usePermissions();

  return (
    <div>
      {hasPermission('hr.employees.write') && (
        <button>Edit</button>
      )}
      {hasPermission('hr.employees.terminate') && (
        <button>Terminate</button>
      )}
    </div>
  );
}
```

## Tenant Context

The `use-tenant` hook provides current tenant information:

```typescript
import { useTenant } from '~/hooks/use-tenant';

function Header() {
  const { tenant, switchTenant } = useTenant();

  return (
    <header>
      <span>{tenant.name}</span>
    </header>
  );
}
```

## Testing

Frontend tests use **Vitest** (not bun test):

```bash
bun run test:web              # Run all frontend tests
bun run test:web -- --watch   # Watch mode
```

## Development

```bash
bun run dev:web   # Start on http://localhost:5173
```

The frontend proxies API requests to `http://localhost:3000` (configurable via `VITE_API_URL`).

## Related Documentation

- [Getting Started](GETTING_STARTED.md) — First-time setup
- [Architecture Overview](../architecture/ARCHITECTURE.md) — Frontend architecture diagrams
- [API Reference](../api/API_REFERENCE.md) — Backend endpoints to consume
- [Permissions System](../architecture/PERMISSIONS_SYSTEM.md) — RBAC and permission hooks

---

## Related Documents

- [Getting Started](GETTING_STARTED.md) — Initial setup and development environment
- [Architecture Overview](../architecture/ARCHITECTURE.md) — System architecture and data flow
- [API Reference](../api/API_REFERENCE.md) — Backend endpoints consumed by the frontend
- [Error Codes](../api/ERROR_CODES.md) — Error codes and messages for API responses
- [Permissions System](../architecture/PERMISSIONS_SYSTEM.md) — RBAC and permission model used in UI guards
- [State Machines](../patterns/STATE_MACHINES.md) — Entity lifecycle states rendered in the UI
