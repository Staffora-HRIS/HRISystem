# Frontend Development Guide

Last updated: 2026-03-28

This guide covers frontend development patterns for the Staffora HRIS web application built with React 18, React Router v7 (framework mode), React Query, and Tailwind CSS.

---

## Architecture Overview

The frontend lives in `packages/web/` and uses React Router v7 in **framework mode** (file-based routing with SSR support):

```
packages/web/
  app/
    routes/           -- File-based routes (three route groups)
    components/       -- Reusable UI components
    hooks/            -- Custom React hooks
    lib/              -- Utilities (API client, auth, query, theme)
    styles/           -- Global CSS (Tailwind)
    root.tsx          -- Application root (providers, document, error boundary)
    routes.ts         -- Route configuration
    entry.client.tsx  -- Client entry point
    entry.server.tsx  -- SSR entry point
```

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `react-router` v7 | Framework mode routing with SSR, loaders, file-based routes |
| `@tanstack/react-query` v5 | Server state management, caching, mutations |
| `better-auth` | Authentication client (sessions, MFA, sign-in/sign-up) |
| `tailwindcss` v3 | Utility-first CSS framework |
| `react-hook-form` | Form handling with validation |
| `lucide-react` | Icon library |
| `recharts` v3 | Charts and data visualisation |
| `clsx` + `tailwind-merge` | Conditional className composition |
| `zod` | Runtime validation (shared schemas) |

---

## Route Groups

Routes are organised into three groups under `app/routes/`:

### `(auth)/` -- Authentication Pages

Unauthenticated routes for login, registration, password reset, and MFA verification.

```
routes/(auth)/
  layout.tsx           -- Auth layout (no sidebar, centred card)
  login/               -- Login page
  forgot-password/     -- Password reset request
  reset-password/      -- Password reset confirmation
  mfa/                 -- MFA verification
```

### `(app)/` -- Employee Self-Service

Authenticated routes for the employee portal (dashboard, profile, time, leave, etc.):

```
routes/(app)/
  layout.tsx           -- App layout with sidebar and auth check
  dashboard/           -- Employee dashboard
  me/                  -- Self-service routes (profile, time, leave, benefits, etc.)
  manager/             -- Manager portal (team, approvals, schedules)
```

The `(app)/layout.tsx` loader performs a server-side authentication check by inspecting the session cookie:

```typescript
export async function loader({ request }: Route.LoaderArgs) {
  const cookies = /* extract cookie header */;
  const hasBetterAuthSession =
    cookies.includes("staffora.session_token=") ||
    cookies.includes("__Secure-staffora.session_token=");

  if (!hasBetterAuthSession) {
    throw redirect(`/login?redirect=${encodeURIComponent(url.pathname)}`);
  }
  return null;
}
```

### `(admin)/` -- HR Administration

Admin routes requiring specific RBAC permissions:

```
routes/(admin)/
  layout.tsx           -- Admin layout with permission checks
  dashboard/           -- Admin dashboard
  hr/                  -- Core HR (employees, departments, positions, contracts)
  absence/             -- Leave management (requests, types, policies, balances)
  leave/               -- Leave administration
  benefits/            -- Benefits plans and enrollments
  cases/               -- Case management
  compliance/          -- GDPR, DSAR, data breach
  documents/           -- Document management
  lms/                 -- Learning management
  onboarding/          -- Onboarding templates and instances
  payroll/             -- Payroll runs, tax, pension, payslips
  analytics/           -- Workforce analytics
  reports/             -- Report builder and execution
  privacy/             -- Privacy and data retention
```

---

## Root Application (`root.tsx`)

The root component wraps the entire application with providers:

```tsx
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <Document>
            <Outlet />
            <ToastViewport />
            {import.meta.env.DEV ? (
              <ClientOnly>
                <ReactQueryDevtools initialIsOpen={false} />
              </ClientOnly>
            ) : null}
          </Document>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

The provider order is:
1. **QueryClientProvider** -- React Query for server state
2. **ThemeProvider** -- Light/dark theme management
3. **ToastProvider** -- Toast notifications
4. **Document** -- HTML document wrapper with theme class

A `HydrateFallback` component shows a loading spinner during SSR hydration.

---

## API Client (`app/lib/api-client.ts`)

The `api` singleton handles all communication with the backend:

```typescript
import { api } from "~/lib/api-client";

// GET request
const data = await api.get<LeaveType[]>("/absence/leave-types");

// POST with automatic Idempotency-Key header
const result = await api.post<LeaveType>("/absence/leave-types", {
  code: "ANNUAL",
  name: "Annual Leave",
});

// PUT, PATCH, DELETE also add Idempotency-Key automatically
await api.put<LeaveType>("/absence/leave-types/123", updatedData);
await api.delete("/absence/leave-types/123");

// Paginated GET
const page = await api.getPaginated<Employee>("/hr/employees", {
  params: { limit: 20, cursor: lastCursor },
});
```

### Key Features

- **Base URL resolution**: Uses `VITE_API_URL` (default `http://localhost:3000/api/v1`)
- **Automatic tenant header**: Injects `X-Tenant-ID` on every request
- **Idempotency keys**: POST/PUT/PATCH/DELETE requests include `Idempotency-Key`
- **Retry with backoff**: Retries on 429, 502, 503 with exponential backoff and jitter
- **401 redirect**: Auto-redirects to `/login` on authentication failure
- **Typed errors**: Throws `ApiError` with `code`, `status`, `message`, `details`
- **Request/response interceptors**: Extensible middleware chain
- **SSR support**: Uses `INTERNAL_API_URL` for Docker networking on the server

---

## React Query (`app/lib/query-client.ts`)

### Query Key Factory

All query keys are tenant-scoped to ensure proper cache isolation in multi-tenant environments:

```typescript
import { queryKeys } from "~/lib/query-client";

// Examples of query keys:
queryKeys.employees.list({ status: "active" })
// => ["employees", "<tenantId>", "list", { status: "active" }]

queryKeys.leave.requests({ status: "pending" })
// => ["leave", "<tenantId>", "requests", { status: "pending" }]

queryKeys.auth.me()
// => ["auth", "me", "<tenantId>"]
```

Available key namespaces: `auth`, `me`, `manager`, `employees`, `organization`, `time`, `leave`, `benefits`, `workflows`, `security`, `reports`, `lms`, `tenant`, `portal`, `analytics`, `payroll`, `directory`, `dashboard`.

### Default Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // 5 minutes
      gcTime: 10 * 60 * 1000,        // 10 minutes garbage collection
      retry: (failureCount, error) => {
        // Don't retry 4xx errors
        if (error.status >= 400 && error.status < 500) return false;
        return failureCount < 3;
      },
      refetchOnWindowFocus: "always",
      refetchOnReconnect: true,
    },
    mutations: { retry: false },
  },
});
```

### Invalidation Patterns

Pre-defined invalidation patterns for common mutations:

```typescript
import { invalidationPatterns, invalidateQueries } from "~/lib/query-client";

// After creating/updating an employee:
await invalidateQueries(invalidationPatterns.employee(employeeId));

// After a leave request mutation:
await invalidateQueries(invalidationPatterns.leaveRequest());

// After a security change:
await invalidateQueries(invalidationPatterns.security());
```

### Using Queries in Components

```tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "~/lib/api-client";
import { queryKeys, invalidationPatterns, invalidateQueries } from "~/lib/query-client";

function LeaveTypesList() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.leave.types(),
    queryFn: () => api.get("/absence/leave-types"),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <ul>
      {data.items.map(type => (
        <li key={type.id}>{type.name}</li>
      ))}
    </ul>
  );
}
```

---

## Authentication (`app/lib/auth.ts`)

Authentication uses Better Auth with React Query for session state management (not Better Auth's own React hooks, to avoid SSR hydration issues).

### `useAuth()` Hook

The primary auth hook provides login, logout, session state, and tenant switching:

```tsx
import { useAuth } from "~/lib/auth";

function MyComponent() {
  const {
    user,                  // Current user object
    session,               // Current session
    isAuthenticated,       // Boolean
    isLoading,             // Loading state
    currentTenant,         // Current tenant { id, name, slug }
    tenants,               // All available tenants

    login,                 // (credentials) => Promise
    logout,                // () => Promise
    switchTenant,          // (tenantId) => Promise

    isLoggingIn,           // Mutation pending states
    loginError,            // Mutation errors
  } = useAuth();
}
```

### `useSession()` Hook

Lightweight hook for session-only checks:

```tsx
import { useSession } from "~/lib/auth";

const { session, user, isAuthenticated, isLoading } = useSession();
```

### `useMfa()` Hook

MFA operations (enable, verify TOTP, verify backup code, disable):

```tsx
import { useMfa } from "~/lib/auth";

const { enableMfa, verifyMfa, verifyBackupCode, disableMfa } = useMfa();
```

### Better Auth Client (`app/lib/better-auth.ts`)

The Better Auth client is configured for cross-origin cookie handling:

```typescript
import { createAuthClient } from "better-auth/react";
import { twoFactorClient, organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",  // API server URL (from VITE_API_URL)
  plugins: [twoFactorClient(), organizationClient()],
  fetchOptions: { credentials: "include" },  // Required for cross-origin cookies
});
```

---

## Permission Guards

### `usePermissions()` Hook

Fetches and caches the current user's permissions and roles:

```tsx
import { usePermissions, useHasPermission, PermissionGate } from "~/hooks/use-permissions";

function AdminPanel() {
  const { can, canAny, hasRole, isAdmin, isManager } = usePermissions();

  // Check specific permission
  if (can("employees", "write")) {
    // Show edit button
  }

  // Check any of multiple permissions
  if (canAny(["leave_requests:approve", "time_entries:approve"])) {
    // Show approvals tab
  }
}
```

### `useHasPermission()` -- Single Permission Check

```tsx
const canEditEmployees = useHasPermission("employees", "write");
```

### `useCanAccessRoute()` -- Route-Level Check

```tsx
const { canAccess, isLoading } = useCanAccessRoute("/admin/hr/employees");
```

### `PermissionGate` Component

Conditionally renders children based on permissions:

```tsx
<PermissionGate resource="absence" action="write">
  <CreateLeaveTypeButton />
</PermissionGate>

<PermissionGate permissions={["employees:read", "hr:read"]} requireAll={false}>
  <EmployeeList />
</PermissionGate>

<PermissionGate permission="admin:settings:write" fallback={<AccessDenied />}>
  <SettingsPanel />
</PermissionGate>
```

---

## Tailwind CSS

The frontend uses Tailwind CSS v3 with these plugins:

- `@tailwindcss/forms` -- Form element styling
- `@tailwindcss/typography` -- Prose content styling

### Theme Support

Dark mode is class-based (`dark:` prefix). The `ThemeProvider` in `app/lib/theme.tsx` manages theme state with localStorage persistence and a cookie for SSR.

```tsx
// Inline script in root.tsx prevents flash of wrong theme
<html lang="en" className={resolvedTheme}>
  <body className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
```

### Fonts

Three font families are loaded from Google Fonts:
- **Plus Jakarta Sans** -- Headings and display text
- **Inter** -- Body text
- **JetBrains Mono** -- Monospace / code

---

## Component Patterns

### Layout Components

- `AppLayout` -- Main application shell (sidebar + header + content area)
- Auth layout -- Centred card for login/register pages
- Admin layout -- Extended sidebar with admin navigation

### UI Components

Located in `app/components/ui/`:
- Toast notifications
- Form elements
- Loading states
- Error boundaries

### Custom Hooks

| Hook | File | Purpose |
|------|------|---------|
| `usePermissions` | `use-permissions.tsx` | RBAC permission checks |
| `useEnhancedPermissions` | `use-enhanced-permissions.tsx` | Extended permission utilities |
| `useFieldPermissions` | `use-field-permissions.tsx` | Field-level access control |
| `useTenant` | `use-tenant.tsx` | Current tenant state |
| `useManager` | `use-manager.tsx` | Manager hierarchy checks |
| `usePortal` | `use-portal.tsx` | Portal navigation |
| `useFeatureFlag` | `use-feature-flag.ts` | Feature flag evaluation |
| `useFocusTrap` | `use-focus-trap.ts` | Accessibility focus management |

---

## Testing

Frontend tests use **vitest** (not bun test):

```bash
# Run all web tests
bun run test:web

# Watch mode
cd packages/web && vitest --watch

# Coverage
bun run --filter @staffora/web test:coverage
```

### E2E Tests

Playwright is configured for end-to-end testing:

```bash
bun run --filter @staffora/web test:e2e
bun run --filter @staffora/web test:e2e:ui       # Interactive UI mode
bun run --filter @staffora/web test:e2e:headed    # Headed browser
bun run --filter @staffora/web test:e2e:debug     # Debug mode
```

### Storybook

Component development and documentation:

```bash
cd packages/web
bun run storybook          # Dev server on port 6006
bun run build-storybook    # Static build
```

---

## Development Workflow

1. **Create route**: Add files under `app/routes/(admin)/my-feature/` or `(app)/my-feature/`
2. **Create components**: Add to `app/components/my-feature/`
3. **Add query keys**: Extend `queryKeys` in `app/lib/query-client.ts`
4. **Add permissions**: Update `ROUTE_PERMISSIONS` in `app/hooks/use-permissions.tsx`
5. **Guard routes**: Use `PermissionGate` or `useCanAccessRoute()` in layouts
6. **Test**: Write vitest unit tests and Playwright E2E tests

---

## Related Documents

- [Architecture Overview](../02-architecture/ARCHITECTURE.md) — System architecture, plugin chain, and request flow
- [Frontend Overview](./frontend-overview.md) — Frontend architecture summary and key decisions
- [Frontend Components](./frontend-components.md) — Reusable UI component library documentation
- [Frontend Data Fetching](./frontend-data-fetching.md) — React Query patterns and API client usage
- [Frontend Routes](./frontend-routes.md) — Complete route map for the web application
- [Authorization](../07-security/authorization.md) — RBAC permission model used by frontend permission guards
- [API Reference](../04-api/api-reference.md) — Backend endpoint specifications consumed by the frontend
- [Testing Guide](../08-testing/testing-guide.md) — Vitest and Playwright testing approaches
