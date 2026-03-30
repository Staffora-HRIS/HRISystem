# Data Fetching Patterns

*Last updated: 2026-03-17*

This document describes how the Staffora frontend communicates with the API, manages server state, handles authentication, and deals with errors.

**Related documentation:**

- [Frontend Architecture Overview](./README.md)
- [Component Library](./components.md)
- [API Reference](../04-api/API_REFERENCE.md)
- [Error Codes](../04-api/ERROR_CODES.md)

---

## API Client

**File:** `packages/web/app/lib/api-client.ts`

The `ApiClient` class is the sole HTTP client for all API communication. A singleton instance is exported as `api`.

### Configuration

```typescript
import { api } from "~/lib/api-client";
```

The API base URL is resolved in this order:

1. **Server-side (SSR):** `process.env.INTERNAL_API_URL` -- Docker-internal hostname (e.g., `http://staffora-api:3000`). Used when `typeof window === "undefined"`.
2. **Client-side:** `import.meta.env.VITE_API_URL` -- from Vite environment.
3. **Fallback:** `http://localhost:3000/api/v1`

The base URL always includes `/api/v1`. The client normalises endpoints to prevent double-prefixing -- if an endpoint starts with `/api/v1/`, that prefix is stripped before appending to the base URL.

### Request Methods

All mutating methods (POST, PUT, PATCH, DELETE) automatically inject an `Idempotency-Key` header with a `crypto.randomUUID()` to prevent duplicate writes.

```typescript
// GET - no idempotency key
const employees = await api.get<Employee[]>("/employees", {
  params: { status: "active", limit: 20 },
});

// POST - auto-generates Idempotency-Key header
const employee = await api.post<Employee>("/employees", {
  firstName: "John",
  lastName: "Smith",
});

// PUT - auto-generates Idempotency-Key header
await api.put<Employee>(`/employees/${id}`, updatedData);

// PATCH - auto-generates Idempotency-Key header
await api.patch<Employee>(`/employees/${id}`, { status: "active" });

// DELETE - auto-generates Idempotency-Key header
await api.delete(`/employees/${id}`);

// Paginated GET - returns { data: T[], meta: { cursor, hasMore, total? } }
const page = await api.getPaginated<Employee>("/employees", {
  params: { limit: 20, cursor: lastCursor },
});
```

### Tenant Header Injection

The client automatically injects `X-Tenant-ID` on every request once a tenant is set:

```typescript
api.setTenantId("tenant-uuid-here");
// All subsequent requests include X-Tenant-ID header

api.getTenantId(); // Returns current tenant ID or null
```

The tenant ID is set during the authentication flow and cleared on logout or tenant switch.

### Credentials

All requests include `credentials: "include"` to send cookies cross-origin (the API runs on port 3000 while the frontend runs on port 5173 in development).

### Default Headers

```typescript
{
  "Content-Type": "application/json",
  "Accept": "application/json"
}
```

### Request Timeout

Default timeout is 30 seconds. Override per-request:

```typescript
const report = await api.get("/reports/heavy-report", { timeout: 120000 });
```

Timed-out requests throw an `ApiError` with code `"TIMEOUT"` and status `408`.

### Query Parameters

Pass query parameters via the `params` option. `null` and `undefined` values are automatically excluded:

```typescript
const result = await api.get("/employees", {
  params: {
    status: "active",
    department: selectedDept || undefined, // excluded if falsy
    limit: 20,
  },
});
```

### Interceptors

The client supports request, response, and error interceptors for cross-cutting concerns. Each `add*Interceptor` method returns an unsubscribe function.

```typescript
// Add auth token or custom headers
const removeInterceptor = api.addRequestInterceptor(async (url, config) => {
  // Modify url or config
  return { url, config };
});

// Handle 401 responses globally
api.addResponseInterceptor(async (response) => {
  if (response.status === 401) {
    // Redirect to login
  }
  return response;
});

// Transform error shapes
api.addErrorInterceptor(async (error) => {
  if (error.isUnauthorized) {
    window.location.href = "/login";
  }
  return error;
});

// Later: remove the interceptor
removeInterceptor();
```

---

## Error Handling

### ApiError Class

All API errors are wrapped in the `ApiError` class with typed properties:

```typescript
import { ApiError } from "~/lib/api-client";

try {
  await api.post("/employees", data);
} catch (error) {
  if (error instanceof ApiError) {
    console.log(error.code);    // "VALIDATION_ERROR"
    console.log(error.message); // "Email is required"
    console.log(error.status);  // 422
    console.log(error.details); // { field: "email", reason: "required" }

    // Convenience getters
    error.isUnauthorized;     // status === 401
    error.isForbidden;        // status === 403
    error.isNotFound;         // status === 404
    error.isValidationError;  // status === 422 or code === "VALIDATION_ERROR"
    error.isConflict;         // status === 409
    error.isRateLimited;      // status === 429
  }
}
```

### Backend Error Shape

The API returns errors in this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "requestId": "req_abc123",
    "details": { "field": "email" }
  }
}
```

The `ApiClient` automatically unwraps this nested `error` envelope. It also handles the flat format (`{ code, message }`) for backwards compatibility.

### Special Error Types

| Code | Status | Description |
|---|---|---|
| `TIMEOUT` | 408 | Request timed out (client-side, via `AbortController`) |
| `NETWORK_ERROR` | 0 | Network unreachable, DNS failure, or CORS error |
| `UNKNOWN_ERROR` | varies | Unparseable error response |

### Response Types

```typescript
// Standard response
interface ApiResponse<T> {
  data: T;
  meta?: {
    cursor?: string;
    hasMore?: boolean;
    total?: number;
  };
}

// Paginated response
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    cursor: string | null;
    hasMore: boolean;
    total?: number;
  };
}
```

---

## React Query Configuration

**File:** `packages/web/app/lib/query-client.ts`

### Default Options

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 minutes
      gcTime: 10 * 60 * 1000,         // 10 minutes garbage collection
      retry: (failureCount, error) => {
        // Never retry 4xx errors (client errors)
        if (status >= 400 && status < 500) return false;
        // Retry up to 3 times for 5xx/network errors
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) =>
        Math.min(1000 * 2 ** attemptIndex, 30000), // 1s, 2s, 4s... max 30s
      refetchOnWindowFocus: "always",
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,  // Never retry mutations
    },
  },
});
```

### Stale Time Constants

```typescript
import { STALE_TIMES } from "~/lib/query-client";

STALE_TIMES.short;   // 30 seconds  -- for frequently changing data (approvals)
STALE_TIMES.medium;  // 5 minutes   -- default for most queries
STALE_TIMES.long;    // 30 minutes  -- for rarely changing data (tenant settings)
```

---

## Query Key Factory

**File:** `packages/web/app/lib/query-client.ts`

All query keys are generated through the `queryKeys` factory. Every key includes the current tenant ID (via `api.getTenantId()`) to prevent cross-tenant cache pollution.

### Key Structure

Keys follow the pattern: `[domain, tenantId, ...specifics]`

```typescript
import { queryKeys } from "~/lib/query-client";

// Examples:
queryKeys.employees.all()           // ["employees", "tenant-uuid"]
queryKeys.employees.list({ status: "active" })
  // ["employees", "tenant-uuid", "list", { status: "active" }]
queryKeys.employees.detail("emp-1") // ["employees", "tenant-uuid", "detail", "emp-1"]
```

### Available Key Namespaces

| Namespace | Description | Key Examples |
|---|---|---|
| `queryKeys.auth` | Authentication state | `.me()`, `.session()`, `.permissions()`, `.mfaStatus()` |
| `queryKeys.me` | Employee self-service | `.profile()`, `.time()`, `.timeEntries(filters?)`, `.leave()`, `.leaveRequests(filters?)`, `.leaveBalances()`, `.benefits()`, `.documents()`, `.learning()`, `.cases()` |
| `queryKeys.manager` | Manager portal | `.isManager()`, `.overview()`, `.team()`, `.directReports()`, `.allSubordinates(maxDepth?)`, `.teamMember(id)`, `.isSubordinate(id)`, `.pendingApprovals(type?)`, `.teamAbsence(start, end)`, `.schedules()`, `.performance()` |
| `queryKeys.employees` | Employee administration | `.all()`, `.list(filters?)`, `.detail(id)`, `.employment(id)`, `.compensation(id)`, `.documents(id)` |
| `queryKeys.organization` | Org structure | `.departments()`, `.departmentList(filters?)`, `.department(id)`, `.positions()`, `.positionList(filters?)`, `.position(id)`, `.tree()`, `.locations()` |
| `queryKeys.time` | Time and attendance | `.entries(filters?)`, `.entry(id)`, `.schedules()`, `.policies()` |
| `queryKeys.leave` | Leave management | `.requests(filters?)`, `.request(id)`, `.types()`, `.policies()`, `.balances(employeeId?)` |
| `queryKeys.benefits` | Benefits | `.plans()`, `.enrollments(filters?)`, `.enrollment(id)` |
| `queryKeys.workflows` | Workflows | `.definitions()`, `.definition(id)`, `.instances(filters?)`, `.instance(id)`, `.templates()` |
| `queryKeys.security` | Security admin | `.users(filters?)`, `.user(id)`, `.roles()`, `.role(id)`, `.permissions()`, `.fieldPermissions()`, `.entityFieldPermissions(entity)`, `.auditLog(filters?)` |
| `queryKeys.reports` | Reports | `.list()`, `.report(id)`, `.execute(id, params?)`, `.fieldCatalog()`, `.fieldCategories()`, `.fieldValues(fieldKey)`, `.templates()`, `.favourites()`, `.executions(id)`, `.scheduled()` |
| `queryKeys.lms` | Learning management | `.courses(filters?)`, `.course(id)`, `.assignments(filters?)`, `.progress(employeeId?)` |
| `queryKeys.tenant` | Tenant settings | `.current()`, `.settings()`, `.list()` |
| `queryKeys.portal` | Portal navigation | `.available()`, `.navigation(portalCode)` |
| `queryKeys.analytics` | Analytics | `.headcount(filters?)`, `.turnover(filters?)`, `.diversity(filters?)`, `.compensation(filters?)`, `.executive()`, `.manager()` |
| `queryKeys.payroll` | Payroll | `.runs(filters?)`, `.run(id)`, `.taxDetails(employeeId)`, `.pension()` |
| `queryKeys.directory` | Directory | `.search(filters?)`, `.departments()` |
| `queryKeys.dashboard` | Dashboard | `.employee()`, `.manager()`, `.admin()`, `.stats(type)` |

---

## Query Patterns

### Basic Query

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

function EmployeeList() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.employees.list({ status: "active" }),
    queryFn: () => api.get<Employee[]>("/employees", {
      params: { status: "active" },
    }),
  });

  if (isLoading) return <Spinner />;
  if (error) return <Alert variant="error">{error.message}</Alert>;

  return <DataTable columns={columns} data={data ?? []} />;
}
```

### Paginated Query (Cursor-Based)

```tsx
import { useInfiniteQuery } from "@tanstack/react-query";

function EmployeeList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.employees.list(filters),
    queryFn: ({ pageParam }) =>
      api.getPaginated<Employee>("/employees", {
        params: { ...filters, cursor: pageParam, limit: 20 },
      }),
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.cursor : undefined,
    initialPageParam: null as string | null,
  });

  const employees = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <>
      <DataTable columns={columns} data={employees} />
      {hasNextPage && (
        <Button onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
          Load More
        </Button>
      )}
    </>
  );
}
```

### Dependent Query

```tsx
function EmployeeCompensation({ employeeId }: { employeeId: string }) {
  // Only fetch compensation after employee data is loaded
  const { data: employee } = useQuery({
    queryKey: queryKeys.employees.detail(employeeId),
    queryFn: () => api.get<Employee>(`/employees/${employeeId}`),
  });

  const { data: compensation } = useQuery({
    queryKey: queryKeys.employees.compensation(employeeId),
    queryFn: () => api.get<Compensation>(`/employees/${employeeId}/compensation`),
    enabled: !!employee, // Only fetch when employee exists
  });
}
```

### Conditional Query (Permission-Gated)

```tsx
function SalaryWidget({ employeeId }: { employeeId: string }) {
  const { can } = usePermissions();

  const { data } = useQuery({
    queryKey: queryKeys.employees.compensation(employeeId),
    queryFn: () => api.get(`/employees/${employeeId}/compensation`),
    enabled: can("employees", "view_salary"), // Only fetch if permitted
  });
}
```

### Query with Custom Stale Time

```tsx
import { STALE_TIMES } from "~/lib/query-client";

// Short stale time for rapidly changing data
const { data } = useQuery({
  queryKey: queryKeys.manager.pendingApprovals(),
  queryFn: () => api.get("/manager/approvals"),
  staleTime: STALE_TIMES.short, // 30 seconds
});

// Long stale time for rarely changing data
const { data: settings } = useQuery({
  queryKey: queryKeys.tenant.settings(),
  queryFn: () => api.get("/tenant/settings"),
  staleTime: STALE_TIMES.long, // 30 minutes
});
```

---

## Mutation Patterns

### Basic Mutation with Cache Invalidation

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/api-client";
import { invalidationPatterns, invalidateQueries } from "~/lib/query-client";

function CreateEmployee() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: CreateEmployeeInput) =>
      api.post<Employee>("/employees", data),
    onSuccess: (newEmployee) => {
      // Invalidate employee list and admin dashboard
      invalidateQueries(invalidationPatterns.employee());

      // Optionally, prime the cache with the new employee
      queryClient.setQueryData(
        queryKeys.employees.detail(newEmployee.id),
        newEmployee
      );
    },
  });
}
```

### Invalidation Patterns

The `invalidationPatterns` factory in `query-client.ts` defines which queries to invalidate after common mutations:

| Pattern | Keys Invalidated |
|---|---|
| `invalidationPatterns.employee(employeeId?)` | Employee list, employee detail (if ID given), admin dashboard |
| `invalidationPatterns.leaveRequest()` | Leave queries, self-service leave, manager approvals, dashboard |
| `invalidationPatterns.timeEntry()` | Time queries, self-service time, manager approvals |
| `invalidationPatterns.workflow()` | Workflow queries, manager approvals |
| `invalidationPatterns.organization()` | Organisation queries, employee list |
| `invalidationPatterns.security()` | Security queries, auth permissions |
| `invalidationPatterns.report()` | All report queries |
| `invalidationPatterns.analytics()` | All analytics queries, dashboard |

Usage:

```tsx
onSuccess: () => {
  invalidateQueries(invalidationPatterns.leaveRequest());
}
```

### Optimistic Updates

```tsx
const mutation = useMutation({
  mutationFn: (data) => api.patch(`/employees/${id}`, data),
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({
      queryKey: queryKeys.employees.detail(id),
    });

    // Snapshot previous value
    const previous = queryClient.getQueryData(
      queryKeys.employees.detail(id)
    );

    // Optimistically update
    queryClient.setQueryData(
      queryKeys.employees.detail(id),
      (old) => ({ ...old, ...newData })
    );

    return { previous };
  },
  onError: (err, newData, context) => {
    // Roll back on error
    queryClient.setQueryData(
      queryKeys.employees.detail(id),
      context?.previous
    );
  },
  onSettled: () => {
    // Always refetch to ensure consistency
    queryClient.invalidateQueries({
      queryKey: queryKeys.employees.detail(id),
    });
  },
});
```

---

## Authentication Flow

### Better Auth Client

**Files:** `app/lib/better-auth.ts`, `app/lib/auth-client.ts`, `app/lib/auth.ts`

Authentication uses [Better Auth](https://better-auth.com/) with these plugins:

- **twoFactorClient** -- TOTP-based multi-factor authentication
- **organizationClient** -- Multi-tenant organisation support
- **sentinelClient** -- Infrastructure monitoring

The Better Auth client is configured to point at the API server (not the frontend) and includes `credentials: "include"` for cross-origin cookie handling.

```typescript
// app/lib/better-auth.ts
import { createAuthClient } from "better-auth/react";
import { twoFactorClient, organizationClient } from "better-auth/client/plugins";
import { sentinelClient } from "@better-auth/infra/client";

export const authClient = createAuthClient({
  baseURL: getBaseURL(), // Resolves to VITE_API_URL or http://localhost:3000
  plugins: [twoFactorClient(), sentinelClient(), organizationClient()],
  fetchOptions: { credentials: "include" },
});
```

### Session Management

Session state is managed through React Query (not Better Auth's built-in React hooks) to avoid duplicate React instance issues with SSR:

```tsx
import { useSession } from "~/lib/auth";

function MyComponent() {
  const { user, session, isAuthenticated, isLoading } = useSession();

  if (isLoading) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/login" />;

  return <div>Welcome, {user.name}</div>;
}
```

The `useSession` hook in `auth.ts` queries the session with a 1-minute stale time and no retry on failure.

### Auth Hook (`useAuth`)

The main `useAuth()` hook in `app/lib/auth.ts` provides:

| Property | Type | Description |
|---|---|---|
| `user` | `User \| null` | Current user object (`id`, `email`, `name`, `emailVerified`, `image`, `status`, `mfaEnabled`) |
| `session` | `Session \| null` | Current session object (`id`, `userId`, `token`, `expiresAt`, `ipAddress`, `userAgent`) |
| `isAuthenticated` | `boolean` | Whether user is logged in |
| `isLoading` | `boolean` | Combined loading state (session + user data) |
| `currentTenant` | `Tenant \| null` | Active tenant (from Staffora-specific `/auth/me`) |
| `tenants` | `Tenant[]` | All accessible tenants |
| `login(credentials)` | `(LoginCredentials) => Promise` | Log in with email/password via `authClient.signIn.email()` |
| `signup(data)` | `(SignUpData) => Promise` | Register new account via `authClient.signUp.email()` |
| `logout()` | `() => Promise` | Log out, clear query cache, navigate to `/login` |
| `switchTenant(id)` | `(string) => Promise` | Switch to a different tenant, invalidate all queries |
| `refetchUser` | `() => void` | Refetch user data |
| `isLoggingIn` | `boolean` | Login in progress |
| `isSigningUp` | `boolean` | Signup in progress |
| `isLoggingOut` | `boolean` | Logout in progress |
| `isSwitchingTenant` | `boolean` | Tenant switch in progress |
| `loginError` | `Error \| null` | Last login error |
| `signupError` | `Error \| null` | Last signup error |

### Login Flow

```
1. User submits email + password
2. authClient.signIn.email() calls Better Auth on API server
3. API validates credentials and creates session
4. Session cookie set automatically (httpOnly, SameSite)
5. React Query invalidates auth.me() queries
6. User redirected to /dashboard (or ?redirect= target from URL)
```

### MFA Flow

```
1. After successful password auth, if MFA is enabled:
2. API returns challenge, user redirected to /mfa
3. User enters TOTP code
4. authClient.twoFactor.verifyTotp() validates code
5. Session elevated, user redirected to dashboard
```

The `useMfa()` hook provides:

| Method | Description |
|---|---|
| `enableMfa(password)` | Enable TOTP MFA. Invalidates auth.me() on success. |
| `verifyMfa(code)` | Verify TOTP code during login. |
| `disableMfa(password)` | Disable MFA. Invalidates auth.me() on success. |

### Route Protection

The `AuthGuard` component wraps authenticated route groups:

```tsx
import { AuthGuard } from "~/components/auth/AuthGuard";

<AuthGuard redirectTo="/login">
  <Outlet />
</AuthGuard>
```

Key details:
- Auth checking is **client-side only** because SSR does not have access to browser cookies.
- The `AuthGuard` uses `useEffect` for redirects to prevent server-side navigation attempts.
- During SSR and while loading, it shows a `Spinner` fallback (or a custom `fallback` prop).
- Unauthenticated users are redirected to `redirectTo` with a `?redirect=` parameter encoding the current path.

### Staffora-Specific Auth API

The `authApi` object in `auth.ts` provides Staffora-specific endpoints:

```typescript
import { authApi } from "~/lib/auth";

// Get current user with tenant information
const userData = await authApi.getMe();
// Returns: { user, session, currentTenant, tenants }

// Switch tenant
await authApi.switchTenant("new-tenant-id");

// Password reset
await authApi.requestPasswordReset({ email: "user@example.com" });
await authApi.confirmPasswordReset({ token: "...", password: "newpass" });
```

---

## Prefetching

For navigation performance, queries can be prefetched before the user navigates:

```tsx
import { prefetchQuery } from "~/lib/query-client";

function EmployeeRow({ employee }) {
  const handleMouseEnter = () => {
    // Prefetch employee detail when hovering over the row
    prefetchQuery(
      queryKeys.employees.detail(employee.id),
      () => api.get(`/employees/${employee.id}`)
    );
  };

  return <tr onMouseEnter={handleMouseEnter}>...</tr>;
}
```

The `prefetchQuery` helper uses the default `STALE_TIMES.medium` (5 minutes) unless overridden with a third argument.

---

## Loading and Error States

### Standard Loading Pattern

```tsx
import { RouteLoadingSkeleton } from "~/components/ui/RouteLoadingSkeleton";
import { Alert } from "~/components/ui/alert";
import { ApiError } from "~/lib/api-client";

function EmployeePage() {
  const { data, isLoading, error } = useQuery({...});

  if (isLoading) {
    return <RouteLoadingSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="error" title="Failed to load employees">
        {error instanceof ApiError ? error.message : "An unexpected error occurred"}
      </Alert>
    );
  }

  return <EmployeeList data={data} />;
}
```

### Mutation Loading Pattern

```tsx
function SaveButton() {
  const mutation = useMutation({...});

  return (
    <Button
      onClick={() => mutation.mutate(data)}
      loading={mutation.isPending}
      disabled={mutation.isPending}
    >
      Save Changes
    </Button>
  );
}
```

### Toast Notifications for Mutations

```tsx
import { useToast } from "~/components/ui/toast";

function CreateEmployeeForm() {
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: (data) => api.post("/employees", data),
    onSuccess: () => {
      toast.success("Employee created", {
        message: "The employee has been added to the system.",
      });
    },
    onError: (error) => {
      toast.error("Failed to create employee", {
        message: error instanceof ApiError ? error.message : "Please try again.",
      });
    },
  });
}
```

### Error Boundary Integration

Route-level errors are caught by `RouteErrorBoundary`:

```tsx
// In a route file
export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
```

Section-level errors are caught by `ErrorBoundary`:

```tsx
import { ErrorBoundary } from "~/components/ui/ErrorBoundary";

<ErrorBoundary sectionLabel="Compensation Details">
  <CompensationPanel employeeId={id} />
</ErrorBoundary>
```

---

## Multi-Tenant Data Isolation

### Query Key Scoping

All query keys include the tenant ID via `queryKeys._tenantScope()`. This calls `api.getTenantId()` and returns `"default"` when no tenant is set. This ensures that when a user switches tenants, all cached data is tenant-specific and queries do not return stale data from a different tenant.

### Tenant Switch Flow

```
1. User selects new tenant from tenant switcher
2. api.setTenantId(newTenantId) updates X-Tenant-ID header
3. queryClient.clear() purges all cached data
4. Auth and permission queries are refetched
5. Page reloads to /dashboard for clean state (via window.location.href)
```

### Feature Flags

Tenant settings include feature flags that control which modules are available:

```tsx
import { useTenantSettings, TenantFeatureGate } from "~/hooks/use-tenant";

// Imperative check
const { isFeatureEnabled } = useTenantSettings();
if (isFeatureEnabled("lms_enabled")) {
  // Show LMS navigation item
}

// Declarative gate
<TenantFeatureGate feature="lms_enabled" fallback={<p>LMS is not enabled for your organisation.</p>}>
  <LmsModule />
</TenantFeatureGate>
```

---

## Cache Invalidation Strategy

### Principles

1. **Invalidate, do not remove.** Use `queryClient.invalidateQueries()` rather than `queryClient.removeQueries()`. Invalidation marks data as stale and triggers a background refetch if the query is active, while the UI continues showing the previous data.

2. **Use the invalidation patterns factory.** The `invalidationPatterns` object defines which queries to invalidate for common mutation types. This prevents forgetting related queries.

3. **Prime the cache when possible.** After a create or update mutation, set the new data directly in the cache to avoid a loading flash:

```tsx
onSuccess: (newEmployee) => {
  queryClient.setQueryData(
    queryKeys.employees.detail(newEmployee.id),
    newEmployee
  );
}
```

4. **Invalidate broadly on tenant/role changes.** When the tenant or user permissions change, clear the entire cache to prevent data leakage between security contexts.

### Cache Key Conventions

- Keys are hierarchical: `["employees", tenantId, "detail", employeeId]`
- Invalidating `queryKeys.employees.all()` (`["employees", tenantId]`) invalidates all employee queries including lists, details, and sub-resources.
- Filter objects in keys use value equality: `queryKeys.employees.list({ status: "active" })` is a different key from `queryKeys.employees.list({ status: "terminated" })`.

---

## Summary of Key Files

| File | Exports | Purpose |
|---|---|---|
| `lib/api-client.ts` | `api`, `ApiClient`, `ApiError`, `PaginatedResponse`, `getApiBaseUrl` | HTTP client singleton with idempotency, tenant injection, and interceptors |
| `lib/query-client.ts` | `queryClient`, `queryKeys`, `invalidationPatterns`, `invalidateQueries`, `prefetchQuery`, `STALE_TIMES` | React Query configuration with tenant-scoped cache keys |
| `lib/auth.ts` | `useSession`, `useAuth`, `useMfa`, `authApi` | Authentication hooks with React Query session management |
| `lib/better-auth.ts` | `authClient`, `signInWithEmail`, `signUpWithEmail`, `signOutUser`, `getCurrentSession`, `twoFactor` | Better Auth client integration |
| `lib/auth-client.ts` | `authClient`, `signIn`, `signUp`, `signOut`, `useSession`, `getSession` | Better Auth client (alternative export surface) |
| `hooks/use-permissions.tsx` | `usePermissions`, `useHasPermission`, `useCanAccessRoute`, `PermissionGate` | RBAC permission system |
| `hooks/use-field-permissions.tsx` | `FieldPermissionProvider`, `useFieldPermissionContext`, `useEntityFieldPermissions`, `useCanEditField`, `useCanViewField`, `FieldPermissionGate` | Field-level security |
| `hooks/use-tenant.tsx` | `useTenant`, `useTenantSettings`, `useUserTenants`, `useSwitchTenant`, `TenantFeatureGate`, `useFormatDate`, `useFormatTime`, `useFormatCurrency` | Multi-tenant support with formatting utilities |
| `hooks/use-manager.tsx` | `useIsManager`, `useDirectReports`, `usePendingApprovals`, `useApprovalActions`, `useTeamAbsence` | Manager portal data |
| `hooks/use-portal.tsx` | `PortalProvider`, `usePortals`, `useCurrentPortal`, `useSwitchPortal`, `usePortalNavigation`, `PortalGate` | Multi-portal navigation |

---

## Related Documents

- [Frontend Architecture Overview](./README.md)
- [Component Library](./components.md)
- [Complete Route Map](./routes.md)
- [API Reference](../04-api/API_REFERENCE.md)
- [Error Codes](../04-api/ERROR_CODES.md)
- [Permissions System](../02-architecture/PERMISSIONS_SYSTEM.md)
- [Database Schema](../02-architecture/DATABASE.md)
