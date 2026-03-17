# Frontend Architecture Overview

*Last updated: 2026-03-17*

This document describes the architecture of the Staffora HRIS web application (`packages/web`, package name `@staffora/web`).

**Related documentation:**

- [Complete Route Map](./routes.md)
- [Component Library](./components.md)
- [Data Fetching Patterns](./data-fetching.md)
- [Existing Frontend Guide](../guides/FRONTEND.md)
- [API Reference](../api/API_REFERENCE.md)
- [Permissions System](../architecture/PERMISSIONS_SYSTEM.md)

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3 | UI framework |
| React Router | v7.1 (framework mode) | File-based routing with SSR support |
| React Query (TanStack Query) | v5.62 | Server state management, caching, mutations |
| Tailwind CSS | 3.4 | Utility-first CSS styling |
| Better Auth | 1.5 | Authentication (sessions, MFA, organizations) |
| React Hook Form | 7.54 | Form state management and validation |
| Zod | 3.24 | Schema validation (used with React Hook Form) |
| Recharts | 3.8 | Chart and data visualization library |
| Lucide React | 0.469 | Icon library |
| Vite | 6.0 | Build tooling and dev server |
| Vitest | 2.1 | Unit and component testing (not bun test) |
| TypeScript | 5.7 | Type safety |

### Key Dependencies

- **@dnd-kit**: Drag-and-drop support (used in workflow builder, onboarding templates)
- **clsx + tailwind-merge**: Class name merging with Tailwind conflict resolution (via `cn()` utility)
- **isbot**: Bot detection for SSR optimization
- **@staffora/shared**: Shared types, schemas, error codes, state machines (peer dependency)

---

## Project Structure

```
packages/web/
├── app/
│   ├── root.tsx                  # Root layout: providers, theme, error boundary
│   ├── routes.ts                 # Centralized route configuration
│   ├── routes/
│   │   ├── home.tsx              # Root index (redirects to dashboard or login)
│   │   ├── not-found.tsx         # Catch-all 404 page
│   │   ├── (auth)/               # Authentication routes (no auth required)
│   │   │   ├── layout.tsx        # Auth layout wrapper
│   │   │   ├── login/
│   │   │   ├── mfa/
│   │   │   ├── forgot-password/
│   │   │   └── reset-password/
│   │   ├── (app)/                # Employee self-service routes (auth required)
│   │   │   ├── layout.tsx        # App layout wrapper with sidebar
│   │   │   ├── dashboard/
│   │   │   ├── me/               # Employee self-service (/me/*)
│   │   │   └── manager/          # Manager portal (/manager/*)
│   │   └── (admin)/              # Admin console routes (admin permission required)
│   │       ├── layout.tsx        # Admin layout with admin sidebar
│   │       ├── dashboard/
│   │       ├── hr/               # HR administration
│   │       ├── time/             # Time & attendance
│   │       ├── leave/            # Leave management
│   │       ├── talent/           # Talent management
│   │       ├── benefits/         # Benefits administration
│   │       ├── cases/            # Case management
│   │       ├── documents/        # Document management
│   │       ├── onboarding/       # Onboarding administration
│   │       ├── lms/              # Learning management
│   │       ├── analytics/        # Analytics & reporting
│   │       ├── workflows/        # Workflow builder
│   │       ├── security/         # Security & audit
│   │       ├── reports/          # Report builder
│   │       └── settings/         # System settings
│   ├── components/
│   │   ├── ui/                   # Reusable UI primitives (button, input, table, etc.)
│   │   ├── layouts/              # Layout components (admin, app, auth, manager)
│   │   ├── auth/                 # Authentication components (AuthGuard, LoginForm)
│   │   ├── analytics/            # Analytics widgets (KPICard, ExecutiveDashboard)
│   │   ├── benefits/             # Benefits components (PlanCard, EnrollmentWizard)
│   │   ├── competencies/         # Competency components (CompetencyCard, GapChart)
│   │   ├── documents/            # Document components (DocumentList)
│   │   ├── employee/             # Employee components (GlobalSearch, QuickView)
│   │   ├── org-chart/            # Organization chart (OrgChartViewer)
│   │   ├── security/             # Security components (SecureField)
│   │   └── succession/           # Succession components (SuccessionPlanCard)
│   ├── hooks/                    # Custom React hooks
│   │   ├── use-permissions.tsx   # RBAC permission checks
│   │   ├── use-enhanced-permissions.tsx  # Scope and tier-aware permissions
│   │   ├── use-field-permissions.tsx     # Field-level security
│   │   ├── use-tenant.tsx        # Tenant context and settings
│   │   ├── use-manager.tsx       # Manager portal functionality
│   │   └── use-portal.tsx        # Multi-portal navigation
│   ├── lib/                      # Shared utilities and configuration
│   │   ├── api-client.ts         # HTTP client with tenant/idempotency support
│   │   ├── query-client.ts       # React Query client and key factory
│   │   ├── auth.ts               # Auth hooks (useAuth, useSession, useMfa)
│   │   ├── auth-client.ts        # Better Auth client instance
│   │   ├── better-auth.ts        # Better Auth integration wrapper
│   │   ├── theme.tsx             # Theme provider (light/dark/system)
│   │   ├── utils.ts              # Utility functions (cn, formatters, etc.)
│   │   ├── client-only.tsx       # Client-side only rendering wrapper
│   │   └── hydration.ts          # SSR hydration utilities
│   └── styles/
│       └── globals.css           # Global Tailwind CSS imports
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── react-router.config.ts
```

---

## Route Groups and Layout Nesting

The application uses React Router v7's layout nesting to organize routes into three main groups, each with its own layout wrapper and authentication/authorization requirements.

```
root.tsx (QueryClientProvider, ThemeProvider, ToastProvider)
├── (auth)/layout.tsx         # Centered card layout, no auth required
│   ├── /login
│   ├── /mfa
│   ├── /forgot-password
│   └── /reset-password
├── (app)/layout.tsx          # Sidebar layout with self-service nav, auth required
│   ├── /dashboard
│   ├── /me/*                 # Employee self-service
│   └── /manager/*            # Manager portal (manager role required)
└── (admin)/layout.tsx        # Admin sidebar layout, admin permission required
    └── /admin/*              # All admin module routes
```

### Route Group Details

| Group | Layout | Auth Required | Permission Required | Purpose |
|---|---|---|---|---|
| `(auth)` | `AuthLayout` | No | None | Login, MFA, password reset |
| `(app)` | `AppLayout` | Yes | None (authenticated) | Employee self-service, manager portal |
| `(admin)` | `AdminLayout` | Yes | Admin role or specific module permissions | HR administration, system settings |

### Layout Component Hierarchy

Each layout provides specific UI chrome and guard logic:

1. **AuthLayout** -- Centered card with branding, theme toggle, no navigation sidebar
2. **AppLayout** -- Full sidebar with self-service navigation (My Profile, Time, Leave, etc.), header with global search, notifications, user menu, tenant switcher
3. **AdminLayout** -- Admin sidebar with module navigation (HR, Time, Leave, Talent, etc.), breadcrumbs, permission-gated menu items
4. **ManagerLayout** -- Team-focused sidebar with approval queue badges, embedded within the `(app)` route group

---

## State Management

Staffora follows a clear separation between server state and UI state:

### Server State (React Query)

All data from the API is managed by React Query. This includes:

- **Queries**: Fetching employee lists, leave balances, dashboard data, permissions
- **Mutations**: Creating employees, approving leave, updating records
- **Cache invalidation**: Coordinated through `invalidationPatterns` in `query-client.ts`
- **Tenant-scoped keys**: All query keys include the tenant ID to prevent cross-tenant cache pollution

See [Data Fetching Patterns](./data-fetching.md) for detailed documentation.

### UI State (Local React State)

Local component state handles:

- Sidebar open/close state
- Modal visibility
- Form field values (via React Hook Form)
- Theme preference
- Search input values
- Table sort/filter state

### Context Providers

The following React contexts are used for cross-cutting concerns:

| Provider | Location | Purpose |
|---|---|---|
| `QueryClientProvider` | `root.tsx` | React Query cache |
| `ThemeProvider` | `root.tsx` | Light/dark/system theme |
| `ToastProvider` | `root.tsx` | Toast notification system |
| `FieldPermissionProvider` | Layout components | Field-level security |
| `PortalProvider` | Layout components | Multi-portal navigation |
| `EnhancedPermissionProvider` | Layout components | Scope/tier permission context |

---

## Build Tooling

### Development

```bash
bun run dev:web        # Start Vite dev server on port 5173
```

The dev server proxies API requests to `http://localhost:3000` (the Elysia.js API server). The `VITE_API_URL` environment variable controls the API target.

### Building

```bash
bun run build:web      # Production build via react-router build
```

React Router v7 in framework mode produces both client and server bundles for SSR support. The production server is started with:

```bash
bun run start          # react-router-serve ./build/server/index.js
```

### Testing

```bash
bun run test:web       # Run vitest (NOT bun test)
bun run test:web -- --watch   # Watch mode
bun run --filter @staffora/web test:coverage  # Coverage report
```

The web package uses **vitest** (not bun's built-in test runner). This is important -- running `bun test` in the web package will not work correctly.

### Type Checking

```bash
bun run typecheck      # react-router typegen && tsc --noEmit
```

React Router v7 generates route types automatically via `react-router typegen`. These types provide type-safe access to route params, loaders, and actions.

---

## Fonts and Theming

### Fonts

The application loads three font families from Google Fonts:

- **Plus Jakarta Sans** (400-700): Primary UI font
- **Inter** (400-700): Secondary font
- **JetBrains Mono** (400-500): Monospace font for code/data

### Theme System

Theme support is provided by `ThemeProvider` in `lib/theme.tsx`:

- Three modes: `light`, `dark`, `system`
- Persisted in `localStorage` under key `staffora-theme`
- Also stored in a cookie (`staffora-theme`) for SSR access
- A flash-prevention script in `root.tsx` applies the theme class before first paint
- Toggle is available globally via `useTheme()` hook

### Tailwind Configuration

The design system uses semantic color tokens:

- `primary-*` -- Brand colors
- `success-*`, `warning-*`, `error-*` -- Semantic status colors
- All components support dark mode via Tailwind's `dark:` variant

---

## SSR Considerations

React Router v7 in framework mode supports server-side rendering. Key considerations:

1. **Auth is client-side only** -- The `AuthGuard` component uses `useEffect` for redirects because SSR does not have access to browser cookies
2. **ReactQueryDevtools** is wrapped in `ClientOnly` to avoid hydration mismatches
3. **API client** detects SSR via `typeof window === "undefined"` and uses `INTERNAL_API_URL` (Docker-internal hostname) for server-side requests
4. **Theme flash prevention** -- An inline script in `<head>` reads the theme from `localStorage` before React hydrates

---

## Key Conventions

1. **File organization**: Routes use the `routes/(group)/module/route.tsx` pattern
2. **Import aliases**: Use `~/` prefix for imports from `app/` directory (via `vite-tsconfig-paths`)
3. **Component patterns**: UI components use `forwardRef` for DOM ref forwarding, `React.memo` for performance-critical pure components
4. **Icons**: Use `lucide-react` exclusively for all iconography
5. **Styling**: All styling via Tailwind CSS utility classes; use `cn()` for conditional class merging
6. **Forms**: Use `react-hook-form` with `zod` for validation
7. **Error boundaries**: Both global (`root.tsx ErrorBoundary`) and route-level (`RouteErrorBoundary`) error handling
