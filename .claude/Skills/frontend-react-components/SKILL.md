---
name: frontend-react-components
description: Build React components for HRIS frontend. Use when creating routes, components, React Query hooks, or pages in packages/web/app/.
---

# Frontend React Components

## Tech Stack
- React 18 + React Router v7 (framework mode)
- React Query (TanStack Query)
- Tailwind CSS + Lucide icons

## Directory Structure
```
packages/web/app/
├── routes/(auth)/     # Auth routes (login, register)
├── routes/(app)/      # Authenticated app routes
├── routes/(admin)/    # Admin routes
├── components/ui/     # Base UI components
├── hooks/             # Custom React hooks
├── lib/               # Utilities (api-client, query-client)
```

## Creating a Route
```tsx
// app/routes/(app)/employees/index.tsx
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '~/lib/api-client';
import { Button } from '~/components/ui/button';
import { Plus } from 'lucide-react';
import { Link } from 'react-router';

export default function EmployeesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiClient.get('/api/v1/hr/employees'),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Employees</h1>
        <Button asChild>
          <Link to="/employees/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Employee
          </Link>
        </Button>
      </div>
      <DataTable columns={columns} data={data?.items ?? []} />
    </div>
  );
}
```

## React Query Hooks
```typescript
// hooks/use-employees.ts
export function useEmployees(params?: QueryParams) {
  return useQuery({
    queryKey: ['employees', params],
    queryFn: () => apiClient.get('/api/v1/hr/employees', { params }),
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => apiClient.post('/api/v1/hr/employees', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });
}
```

## Permission Guard
```tsx
<PermissionGuard permission="hr:employees:create">
  <Button>Add Employee</Button>
</PermissionGuard>
```

## Auth Hook
```typescript
import { useAuth } from '~/hooks/use-auth';
const { user, isAuthenticated, isLoading } = useAuth();
```
