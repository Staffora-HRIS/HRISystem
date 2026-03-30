# Component Library

*Last updated: 2026-03-17*

This document catalogues all reusable components, layout components, feature components, and custom hooks in the Staffora frontend.

**Related documentation:**

- [Frontend Architecture Overview](./README.md)
- [Complete Route Map](./routes.md)
- [Data Fetching Patterns](./data-fetching.md)

---

## UI Components (`packages/web/app/components/ui/`)

These are the foundational UI primitives used throughout the application. They are module-agnostic, style-consistent, and follow Tailwind CSS conventions. All components support dark mode.

### Button

**File:** `app/components/ui/button.tsx`

A versatile button with multiple variants, sizes, and loading state. Uses `forwardRef` for ref forwarding.

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `"primary" \| "secondary" \| "outline" \| "ghost" \| "danger" \| "success"` | `"primary"` | Visual style variant |
| `size` | `"xs" \| "sm" \| "md" \| "lg" \| "xl"` | `"md"` | Button size |
| `loading` | `boolean` | `false` | Shows spinner and "Loading..." text, disables interaction |
| `disabled` | `boolean` | `false` | Disables the button |
| `fullWidth` | `boolean` | `false` | Makes the button fill its container |
| `leftIcon` | `ReactNode` | -- | Icon rendered before the label |
| `rightIcon` | `ReactNode` | -- | Icon rendered after the label |
| `type` | `string` | `"button"` | HTML button type |

```tsx
import { Button, IconButton, ButtonGroup } from "~/components/ui/button";
import { Plus, Trash } from "lucide-react";

<Button variant="primary" leftIcon={<Plus className="h-4 w-4" />}>
  Add Employee
</Button>

<Button variant="danger" loading={isDeleting}>
  Delete
</Button>

<Button variant="outline" size="sm" fullWidth>
  View Details
</Button>
```

**Also exports:**

- `IconButton` -- Icon-only button (requires `icon` and `aria-label`). Default variant is `"ghost"`.
- `ButtonGroup` -- Groups buttons with connected borders (first/last child rounding).

```tsx
<IconButton
  icon={<Trash className="h-4 w-4" />}
  aria-label="Delete"
  variant="danger"
  size="sm"
/>

<ButtonGroup>
  <Button variant="outline">Left</Button>
  <Button variant="outline">Centre</Button>
  <Button variant="outline">Right</Button>
</ButtonGroup>
```

### Input

**File:** `app/components/ui/input.tsx`

Comprehensive input component with labels, errors, icons, and addon support. Integrates with React Hook Form via `forwardRef`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | -- | Input label text |
| `error` | `string` | -- | Error message (shown below input in red) |
| `hint` | `string` | -- | Help text (shown below input) |
| `leftIcon` | `ReactNode` | -- | Icon inside input (left) |
| `rightIcon` | `ReactNode` | -- | Icon inside input (right) |
| `leftAddon` | `string` | -- | Text addon (left, e.g., currency symbol) |
| `rightAddon` | `string` | -- | Text addon (right, e.g., unit) |
| `inputSize` | `"sm" \| "md" \| "lg"` | `"md"` | Input height |
| `fullWidth` | `boolean` | `true` | Fill container width |

Required fields display a red asterisk after the label when `required` is set.

Also exports: `Textarea`, `Select`, `Checkbox`, `RadioGroup`.

```tsx
import { Input, Select, Checkbox } from "~/components/ui/input";

<Input
  label="Employee Name"
  error={errors.name?.message}
  required
  {...register("name")}
/>

<Select label="Department" {...register("departmentId")}>
  <option value="">Select department</option>
  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
</Select>
```

### DataTable

**File:** `app/components/ui/table.tsx`

Full-featured data table with sorting, cursor-based pagination, row selection, and custom cell rendering.

| Prop | Type | Default | Description |
|---|---|---|---|
| `columns` | `ColumnDef<T>[]` | -- | Column definitions with header, cell renderer, and sort config |
| `data` | `T[]` | -- | Row data array |
| `loading` | `boolean` | `false` | Show loading skeleton |
| `sorting` | `SortState` | -- | Current sort state |
| `onSortingChange` | `(sort: SortState) => void` | -- | Sort change handler |
| `pagination` | `PaginationState` | -- | Cursor-based pagination state |
| `onPaginationChange` | `(pagination: PaginationState) => void` | -- | Page change handler |
| `hasMore` | `boolean` | -- | Whether more pages exist |
| `totalCount` | `number` | -- | Total row count |
| `selectable` | `boolean` | `false` | Enable row selection checkboxes |
| `selectedRows` | `Set<string>` | -- | Currently selected row IDs |
| `onSelectionChange` | `(selectedRows: Set<string>) => void` | -- | Selection change handler |
| `getRowId` | `(row: T) => string` | -- | Extract row ID for selection |
| `onRowClick` | `(row: T, index: number) => void` | -- | Row click handler |
| `striped` | `boolean` | -- | Alternating row colours |
| `hoverable` | `boolean` | -- | Row hover highlight |
| `bordered` | `boolean` | -- | Cell borders |
| `compact` | `boolean` | -- | Reduced padding |
| `emptyMessage` | `ReactNode` | -- | Message when no data |
| `emptyIcon` | `ReactNode` | -- | Icon for empty state |

Key types:

```typescript
interface ColumnDef<T> {
  id: string;
  header: ReactNode | ((props: { column: ColumnDef<T> }) => ReactNode);
  cell: (props: { row: T; rowIndex: number }) => ReactNode;
  accessorKey?: keyof T;
  sortable?: boolean;
  width?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  align?: "left" | "center" | "right";
  className?: string;
  headerClassName?: string;
}

interface SortState {
  column: string;
  direction: "asc" | "desc";
}

interface PaginationState {
  cursor: string | null;
  limit: number;
}
```

### Modal

**File:** `app/components/ui/modal.tsx`

Accessible modal dialog rendered via React portal. Prevents body scroll when open and supports keyboard navigation.

| Prop | Type | Default | Description |
|---|---|---|---|
| `open` | `boolean` | -- | Controls visibility |
| `onClose` | `() => void` | -- | Close handler |
| `size` | `"sm" \| "md" \| "lg" \| "xl" \| "full"` | `"md"` | Modal width (`sm`=max-w-md, `lg`=max-w-2xl, `xl`=max-w-4xl) |
| `closeOnOverlayClick` | `boolean` | `true` | Close when clicking overlay |
| `closeOnEscape` | `boolean` | `true` | Close on Escape key |
| `showCloseButton` | `boolean` | `true` | Show X button |
| `preventScroll` | `boolean` | `true` | Prevent body scroll when open |

Also exports: `ModalHeader`, `ModalBody`, `ModalFooter` sub-components.

### Card

**File:** `app/components/ui/card.tsx`

Flexible card container with header, body, and footer sections.

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `"default" \| "bordered" \| "elevated" \| "flat"` | `"default"` | Visual style |
| `padding` | `"none" \| "sm" \| "md" \| "lg"` | `"none"` | Internal padding |
| `hoverable` | `boolean` | `false` | Hover shadow effect |
| `clickable` | `boolean` | `false` | Click effect with scale |
| `selected` | `boolean` | `false` | Selected ring indicator (primary colour) |

**Sub-components:**

- `CardHeader` -- Header section with optional `title`, `subtitle`, and `action` props. Supports `bordered` prop for bottom border.
- `CardBody` -- Content section with configurable `padding` (`"none" | "sm" | "md" | "lg"`, default `"md"`).
- `CardFooter` -- Footer section with `bordered` (top border) and `justify` (`"start" | "end" | "center" | "between"`) props.

**Pre-built card variants:**

- `StatCard` -- Displays a KPI with `title`, `value`, `change` (with `value`/`type` for trend), `icon`, and `description`. Wrapped with `React.memo`.
- `ListCard<T>` -- Generic list card with `title`, `items`, `renderItem`, `emptyMessage`, `action`, and `maxItems`.

```tsx
import { Card, CardHeader, CardBody, CardFooter, StatCard } from "~/components/ui/card";

<Card variant="default">
  <CardHeader title="Employee Details" subtitle="Personal information" bordered />
  <CardBody>
    {/* content */}
  </CardBody>
  <CardFooter bordered justify="end">
    <Button variant="primary">Save</Button>
  </CardFooter>
</Card>

<StatCard
  title="Total Employees"
  value={1234}
  change={{ value: 5.2, type: "increase" }}
  icon={<Users className="h-5 w-5" />}
/>
```

### Badge

**File:** `app/components/ui/badge.tsx`

Badge/tag component for status labels and counts. Wrapped with `React.memo`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `"default" \| "primary" \| "secondary" \| "success" \| "warning" \| "error" \| "info" \| "destructive" \| "outline"` | `"default"` | Colour variant |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Badge size |
| `rounded` | `boolean` | `false` | Fully rounded (pill shape) |
| `dot` | `boolean` | `false` | Show status dot |
| `dotColor` | `string` | auto | Custom dot colour class |
| `removable` | `boolean` | `false` | Show remove button |
| `onRemove` | `() => void` | -- | Remove handler |

**Also exports:**

- `StatusBadge` -- Maps common statuses (`active`, `inactive`, `pending`, `approved`, `rejected`, `draft`, `published`, `archived`, `processing`, `completed`, `failed`, `cancelled`) to appropriate variant with dot indicator.
- `CountBadge` -- Notification count badge with `count`, `max` (default 99), and overflow display (e.g., "99+").
- `PriorityBadge` -- Maps priority levels (`low`, `medium`, `high`, `urgent`) to coloured badges.
- `TypeBadge` -- Generic categorisation badge with custom `type` string.
- `BadgeGroup` -- Flex wrapper for grouping badges with consistent spacing.

```tsx
import { Badge, StatusBadge, PriorityBadge, CountBadge } from "~/components/ui/badge";

<StatusBadge status="active" />
<PriorityBadge priority="high" />
<CountBadge count={12} />

<Badge variant="success" dot rounded>Active</Badge>
<Badge variant="outline" removable onRemove={() => {}}>Tag</Badge>
```

### Alert

**File:** `app/components/ui/alert.tsx`

Alert messages for success, error, warning, and info states. Wrapped with `React.memo`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `"success" \| "error" \| "warning" \| "info"` | `"info"` | Alert type |
| `title` | `string` | -- | Optional alert title |
| `icon` | `ReactNode` | auto | Custom icon (defaults to variant-appropriate lucide-react icon) |
| `dismissible` | `boolean` | `false` | Show dismiss button |
| `onDismiss` | `() => void` | -- | Dismiss handler |

**Also exports:**

- `AlertBanner` -- Compact inline alert with an optional `action` prop for rendering an action button alongside the message.

```tsx
import { Alert, AlertBanner } from "~/components/ui/alert";

<Alert variant="error" title="Validation Failed">
  Please correct the highlighted fields.
</Alert>

<AlertBanner variant="info" action={<Button size="xs">Upgrade</Button>}>
  Your trial expires in 7 days.
</AlertBanner>
```

### Toast

**File:** `app/components/ui/toast.tsx`

Toast notification system with stacking support. Renders via React portal.

| Toast Option | Type | Default | Description |
|---|---|---|---|
| `type` | `"success" \| "error" \| "warning" \| "info"` | -- | Notification type |
| `title` | `string` | -- | Toast title |
| `message` | `string` | -- | Optional body text |
| `duration` | `number` | varies | Auto-dismiss delay (success: 4s, error: 6s, warning: 5s, info: 4s) |
| `dismissible` | `boolean` | `true` | Show dismiss button |
| `action` | `{ label: string; onClick: () => void }` | -- | Optional action button |

**Setup:** `ToastProvider` (with optional `maxToasts`, default 5) and `ToastViewport` are mounted in `root.tsx`.

**Usage via `useToast()` hook:**

```tsx
import { useToast } from "~/components/ui/toast";

function MyComponent() {
  const toast = useToast();

  const handleSave = async () => {
    try {
      await api.post("/employees", data);
      toast.success("Employee created", {
        message: "John Smith has been added to the system.",
      });
    } catch (error) {
      toast.error("Failed to create employee", {
        message: error.message,
      });
    }
  };
}
```

The `useToast()` hook returns convenience methods: `toast.success()`, `toast.error()`, `toast.warning()`, `toast.info()`, `toast.custom()`, `toast.dismiss(id)`, `toast.clearAll()`, and `toast.toasts` (current toast array).

A standalone `toast` object is also exported for use outside React components (requires `ToastProvider` in the tree).

### Tabs

**File:** `app/components/ui/tabs.tsx`

Tab navigation with multiple visual variants. Uses React Context for state management.

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `"line" \| "pills" \| "enclosed" \| "soft"` | `"line"` | Tab style |
| `defaultValue` | `string` | -- | Initially active tab (uncontrolled) |
| `value` | `string` | -- | Controlled active tab |
| `onValueChange` | `(value: string) => void` | -- | Tab change handler |

Sub-components: `TabsList`, `TabsTrigger` (with optional `icon` and `disabled` props), `TabsContent`.

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";

<Tabs defaultValue="personal" variant="line">
  <TabsList>
    <TabsTrigger value="personal">Personal</TabsTrigger>
    <TabsTrigger value="employment">Employment</TabsTrigger>
    <TabsTrigger value="documents" disabled>Documents</TabsTrigger>
  </TabsList>
  <TabsContent value="personal">Personal details...</TabsContent>
  <TabsContent value="employment">Employment details...</TabsContent>
</Tabs>
```

### Avatar

**File:** `app/components/ui/avatar.tsx`

User avatar with image and fallback initials. Wrapped with `React.memo`. Background colour is deterministically generated from the name via a hash function.

| Prop | Type | Default | Description |
|---|---|---|---|
| `src` | `string \| null` | -- | Image URL (falls back to initials on load error) |
| `name` | `string` | -- | Name for initials fallback and background colour |
| `alt` | `string` | -- | Alt text for image |
| `size` | `"xs" \| "sm" \| "md" \| "lg" \| "xl" \| "2xl"` | `"md"` | Avatar size |
| `showStatus` | `boolean` | `false` | Show online status indicator |
| `status` | `"online" \| "offline" \| "away" \| "busy"` | `"offline"` | Status type |

**Also exports:**

- `AvatarGroup` -- Overlapping avatar group with `avatars` array, `max` count (default 4), and "+N" overflow indicator.

```tsx
import { Avatar, AvatarGroup } from "~/components/ui/avatar";

<Avatar name="John Smith" size="lg" showStatus status="online" />

<AvatarGroup
  avatars={[
    { name: "Alice" },
    { name: "Bob", src: "/photos/bob.jpg" },
    { name: "Charlie" },
  ]}
  max={3}
/>
```

### SearchInput

**File:** `app/components/ui/search-input.tsx`

Search input with icon, clear button, and built-in debounce.

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `string` | -- | Controlled value |
| `defaultValue` | `string` | -- | Uncontrolled initial value |
| `onChange` | `(value: string) => void` | -- | Change handler (debounced if `debounceMs` set) |
| `onSearch` | `(value: string) => void` | -- | Search submit handler |
| `debounceMs` | `number` | -- | Debounce delay in milliseconds |
| `loading` | `boolean` | `false` | Show loading indicator |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Input size |
| `showClearButton` | `boolean` | -- | Show clear button when value is present |

### FileUpload

**File:** `app/components/ui/file-upload.tsx`

Drag-and-drop file upload with progress tracking and file type icons.

| Prop | Type | Default | Description |
|---|---|---|---|
| `onFilesSelected` | `(files: File[]) => void` | -- | Called when files are selected |
| `onUpload` | `(files: File[]) => Promise<void>` | -- | Upload handler |
| `accept` | `string` | -- | Accepted file types (MIME) |
| `multiple` | `boolean` | `false` | Allow multiple files |
| `maxFiles` | `number` | `10` | Maximum number of files |
| `maxSize` | `number` | `10MB` | Maximum file size in bytes |

### Calendar

**File:** `app/components/ui/calendar.tsx`

Monthly calendar component with event display, date selection, and month navigation.

| Prop | Type | Description |
|---|---|---|
| `events` | `CalendarEvent[]` | Events to display (with `id`, `title`, `start`, `end?`, `color?`, `allDay?`) |
| `onDateClick` | `(date: Date) => void` | Date click handler |
| `onEventClick` | `(event: CalendarEvent) => void` | Event click handler |
| `selectedDate` | `Date` | Currently selected date |

### DatePicker

**File:** `app/components/ui/date-picker.tsx`

Date picker input with inline calendar dropdown and month/year navigation.

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `Date \| null` | -- | Selected date |
| `onChange` | `(date: Date \| null) => void` | -- | Change handler |
| `placeholder` | `string` | `"Select date"` | Placeholder text |
| `disabled` | `boolean` | `false` | Disabled state |
| `minDate` | `Date` | -- | Minimum selectable date |
| `maxDate` | `Date` | -- | Maximum selectable date |
| `error` | `boolean` | -- | Error state styling |

### Spinner

**File:** `app/components/ui/spinner.tsx`

Loading spinner with size and colour variants. Wrapped with `React.memo`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `size` | `"xs" \| "sm" \| "md" \| "lg" \| "xl"` | `"md"` | Spinner size |
| `variant` | `"primary" \| "white" \| "gray"` | `"primary"` | Colour variant |
| `label` | `string` | `"Loading..."` | Accessible label (screen reader) |

**Also exports:**

- `FullPageSpinner` -- Centred spinner for full-page loading states. Occupies `min-h-screen`.
- `InlineSpinner` -- Spinner with text label for inline loading states.
- `OverlaySpinner` -- Semi-transparent overlay spinner for covering sections during loading.
- `ButtonSpinner` -- Small white spinner sized for use inside buttons.

### Skeleton

**File:** `app/components/ui/skeleton.tsx`

Loading placeholder. Wrapped with `React.memo`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `width` | `string \| number` | -- | Skeleton width |
| `height` | `string \| number` | -- | Skeleton height |
| `rounded` | `"none" \| "sm" \| "md" \| "lg" \| "full"` | `"md"` | Border radius |
| `animate` | `boolean` | `true` | Pulse animation |

**Also exports:**

- `SkeletonText` -- Multi-line text placeholder with `lines` prop (default 3). Last line is 75% width.
- `SkeletonCard` -- Card skeleton with avatar, heading, and body text.
- `SkeletonTable` -- Table skeleton with configurable `rows` (default 5) and `columns` (default 4).
- `SkeletonAvatar` -- Circular skeleton for avatar placeholders with `size` prop.

### ErrorBoundary

**File:** `app/components/ui/ErrorBoundary.tsx`

React class component error boundary for catching render errors in component subtrees. Shows an error message with retry and navigation options.

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | -- | Content to render |
| `fallback` | `ReactNode` | -- | Custom fallback UI |
| `sectionLabel` | `string` | -- | Label for the failed section |
| `level` | `"section" \| "page"` | -- | Error display level |

```tsx
<ErrorBoundary sectionLabel="Employee Details" level="page">
  <EmployeeForm />
</ErrorBoundary>
```

### RouteErrorBoundary

**File:** `app/components/ui/RouteErrorBoundary.tsx`

Route-level error boundary using React Router's `useRouteError()` hook. Shows different UIs for 404, 403, 500, and network/runtime errors. Includes retry, back, and home navigation buttons.

Usage: export as `ErrorBoundary` from any route file:

```tsx
export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
```

### RouteLoadingSkeleton

**File:** `app/components/ui/RouteLoadingSkeleton.tsx`

Full-page loading skeleton used as route-level `Suspense` fallback. Mimics a typical page layout with header, stat cards, and table area.

```tsx
import { Suspense } from "react";
import { RouteLoadingSkeleton } from "~/components/ui/RouteLoadingSkeleton";

<Suspense fallback={<RouteLoadingSkeleton />}>
  <Outlet />
</Suspense>
```

---

## Layout Components (`packages/web/app/components/layouts/`)

### AdminLayout

**File:** `app/components/layouts/admin-layout.tsx`

Admin console layout with sidebar navigation for all admin modules.

**Features:**
- Sidebar with collapsible module groups (Overview, HR, Time & Attendance, Leave, Talent, Recruitment, LMS, Cases, Onboarding, Documents, Benefits, Compliance, Workflows, Reports, Health & Safety, Security, Settings)
- Permission-based menu item visibility via `PermissionGate`
- Breadcrumb navigation
- User menu with avatar, name, and logout
- Theme toggle (light/dark)
- Responsive mobile sidebar with hamburger menu
- Module icons from `lucide-react`
- Navigation items defined as `NavItem` (with `name`, `href`, `icon`, `permission?`) grouped into `NavGroup` arrays

### AppLayout

**File:** `app/components/layouts/app-layout.tsx`

Main application layout for authenticated employee/manager routes.

**Features:**
- Sidebar with self-service navigation (Dashboard, My Profile, Time, Leave, Benefits, Documents, Learning, Cases, Competencies, Onboarding)
- Manager portal section (visible only to users with manager roles)
- Admin console link (visible to admin users)
- Global employee search (`GlobalEmployeeSearch`) in header
- Notification bell
- User menu with tenant switcher (via `useUserTenants` and `useSwitchTenant`)
- Theme toggle
- Responsive design with mobile hamburger menu
- Permission-gated navigation items

### AuthLayout

**File:** `app/components/layouts/auth-layout.tsx`

Centred card layout for authentication pages (login, register, forgot password, reset password).

| Prop | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | -- | Page title in the card |
| `subtitle` | `string` | -- | Subtitle below the title |
| `showLogo` | `boolean` | `true` | Show Staffora logo |
| `maxWidth` | `"sm" \| "md" \| "lg"` | `"md"` | Card maximum width |

**Features:**
- Centred card with configurable max width
- Staffora logo and branding
- Dark mode support
- Theme toggle button

### ManagerLayout

**File:** `app/components/layouts/manager-layout.tsx`

Manager portal layout with team-focused navigation.

**Features:**
- Manager role verification (redirects non-managers to `/dashboard`)
- Team overview sidebar widget (direct reports count, pending approvals, team on leave)
- Approval queue with badge count
- Navigation: Overview, Team, Approvals, Schedules, Performance
- Loading state while checking manager status

---

## Feature Components

### Auth Components (`app/components/auth/`)

| Component | File | Description |
|---|---|---|
| `AuthGuard` | `auth/AuthGuard.tsx` | Route guard that redirects unauthenticated users to login. Client-side only (SSR does not have cookie access). Accepts `redirectTo` prop (default `"/login"`). Passes `?redirect=` in the URL for post-login navigation. Shows `Spinner` while checking session. |
| `LoginForm` | `auth/LoginForm.tsx` | Email/password login form using `signInWithEmail` from BetterAuth. Supports redirect parameter from URL search params. Shows loading state and error messages. Accepts `onSuccess` and `onMfaRequired` callbacks. |

### Analytics Components (`app/components/analytics/`)

| Component | File | Description |
|---|---|---|
| `KPICard` | `analytics/KPICard.tsx` | Key performance indicator card with `title`, `value`, `subtitle`, `trend` (`"up" \| "down" \| "stable"`), `trendValue`, and `icon`. Uses lucide-react trend icons. Wrapped with `React.memo`. |
| `ExecutiveDashboard` | `analytics/ExecutiveDashboard.tsx` | Executive summary dashboard fetching data from `/analytics/executive`. Displays headcount (total, active, on leave, pending, terminated), turnover rate with trend, attendance rate, pending leave requests, and open recruitment positions. Uses `KPICard` internally. |

### Benefits Components (`app/components/benefits/`)

| Component | File | Description |
|---|---|---|
| `PlanCard` | `benefits/PlanCard.tsx` | Benefits plan display card showing coverage details and enrollment status. |
| `EnrollmentWizard` | `benefits/EnrollmentWizard.tsx` | Multi-step benefits enrollment wizard with plan selection and confirmation. |

### Competencies Components (`app/components/competencies/`)

| Component | File | Description |
|---|---|---|
| `CompetencyCard` | `competencies/CompetencyCard.tsx` | Individual competency display with proficiency level and assessment status. |
| `CompetencyGapChart` | `competencies/CompetencyGapChart.tsx` | Visual chart showing competency gaps between required and actual levels. |

### Documents Components (`app/components/documents/`)

| Component | File | Description |
|---|---|---|
| `DocumentList` | `documents/DocumentList.tsx` | Filterable document list with type icons, dates, and download actions. |

### Employee Components (`app/components/employee/`)

| Component | File | Description |
|---|---|---|
| `GlobalEmployeeSearch` | `employee/GlobalEmployeeSearch.tsx` | Global search widget with keyboard navigation and quick preview. Queries `/employees` with search parameter and debouncing. Used in the app header. Displays results with avatar, name, employee number, position, and department. Accepts `onSelect`, `onClose`, `placeholder`, and `autoFocus` props. |
| `EmployeeQuickView` | `employee/EmployeeQuickView.tsx` | Employee summary card/modal showing photo, name, email, phone, position, department, location, manager, hire date, and status. Uses `Avatar`, `Badge`, `Card`, and `Button` components. Links to full employee profile. |

### Org Chart Components (`app/components/org-chart/`)

| Component | File | Description |
|---|---|---|
| `OrgChartViewer` | `org-chart/OrgChartViewer.tsx` | Interactive organisation chart visualisation with expand/collapse, search, and zoom. |

### Security Components (`app/components/security/`)

| Component | File | Description |
|---|---|---|
| `SecureField` | `security/SecureField.tsx` | Permission-aware field wrapper that automatically hides, makes read-only, or enables editing based on field-level permissions from the `field_registry`. Uses `useFieldPermissionContext` and `useEntityFieldPermissions`. Supports `renderViewOnly`, `hiddenPlaceholder` (e.g., "***" for sensitive data), and `forcePermission` override. |

### Succession Components (`app/components/succession/`)

| Component | File | Description |
|---|---|---|
| `SuccessionPlanCard` | `succession/SuccessionPlanCard.tsx` | Succession plan card displaying position title, department, criticality level (`critical \| high \| medium \| low`), risk level, status, and candidate pipeline with readiness levels (`ready_now \| ready_1_year \| ready_2_years \| development_needed`). Accepts `onViewDetails` and `onAddCandidate` callbacks. Wrapped with `React.memo`. |

---

## Custom Hooks (`packages/web/app/hooks/`)

### usePermissions

**File:** `app/hooks/use-permissions.tsx`

Core RBAC permission hook. Fetches user permissions from `/security/my-permissions` and provides check utilities. Cached for 5 minutes.

**Returns:**

| Property | Type | Description |
|---|---|---|
| `permissions` | `string[]` | All granted permission keys |
| `roles` | `string[]` | User's active role names |
| `isLoading` | `boolean` | Loading state |
| `hasPermission(key)` | `(string) => boolean` | Check single permission (supports wildcards: `*`, `*:*`, `resource:*`, `*:action`) |
| `can(resource, action)` | `(string, string) => boolean` | Check resource:action permission |
| `canAny(keys)` | `(string[]) => boolean` | Check if user has any of the listed permissions |
| `canAll(keys)` | `(string[]) => boolean` | Check if user has all of the listed permissions |
| `hasRole(role)` | `(string) => boolean` | Check role membership |
| `hasAnyRole(roles)` | `(string[]) => boolean` | Check if user has any of the listed roles |
| `isAdmin` | `boolean` | True if `super_admin`, `tenant_admin`, `hr_admin`, or wildcard `*` |
| `isManager` | `boolean` | True if `manager`, `line_manager`, `team_leader`, `department_head`, `hr_admin`, `hr_officer`, `tenant_admin`, or `super_admin` |
| `isComplianceOfficer` | `boolean` | True if `compliance_officer`, `tenant_admin`, or `super_admin` |
| `isPayrollAdmin` | `boolean` | True if `payroll_admin`, `tenant_admin`, or `super_admin` |

**Also exports:**

- `useHasPermission(resource, action)` -- Single permission check hook.
- `useCanAccessRoute(route)` -- Route-level access check using the `ROUTE_PERMISSIONS` map. Admins bypass all checks. Returns `{ canAccess: boolean, isLoading: boolean }`.
- `useRoutePermissions(route)` -- Get required permissions for a specific route path.
- `PermissionGate` -- Component for conditional rendering based on permissions.

**PermissionGate usage:**

```tsx
import { PermissionGate } from "~/hooks/use-permissions";

// Single permission
<PermissionGate permission="employees:write" fallback={<p>No access</p>}>
  <EditEmployeeForm />
</PermissionGate>

// Resource + action
<PermissionGate resource="cases" action="read">
  <CaseList />
</PermissionGate>

// Multiple permissions (any match)
<PermissionGate
  permissions={["cases:read", "cases:view_all"]}
  requireAll={false}
>
  <CaseList />
</PermissionGate>

// Multiple permissions (all required)
<PermissionGate
  permissions={["employees:read", "employees:write"]}
  requireAll={true}
>
  <EmployeeForm />
</PermissionGate>
```

**Route permission map:** The `ROUTE_PERMISSIONS` constant maps 80+ route paths to their required permission keys, covering employee self-service (`/me/*`), manager portal (`/manager/*`), and all admin sections (`/admin/hr/*`, `/admin/time/*`, `/admin/absence/*`, `/admin/talent/*`, `/admin/recruitment/*`, `/admin/lms/*`, `/admin/cases/*`, `/admin/compliance/*`, `/admin/security/*`, etc.).

### useEnhancedPermissions

**File:** `app/hooks/use-enhanced-permissions.tsx`

Extended permission system with data scope and sensitivity tier awareness. Builds on top of `usePermissions`. Backwards-compatible -- existing `usePermissions()` and `PermissionGate` continue to work.

**Additional capabilities over usePermissions:**

| Feature | Description |
|---|---|
| Scope checking | `canAccessScope("department")` -- checks if user's max scope includes department level |
| Tier checking | `canAccessTier(2)` -- checks if user can access sensitivity tier 2 data |
| Combined checks | `hasPermissionWithScope("employees:read", "department")` |
| Permission explanation | `explainPermission("salary:read")` -- human-readable reason for grant/denial |
| Bulk checks | `checkPermissions(["a:read", "b:write"])` -- returns `Map<string, boolean>` |

**Scope hierarchy:** `self` < `direct_reports` < `indirect_reports` < `department` < `division` < `location` < `cost_centre` < `legal_entity` < `all` < `custom`

**Also exports:**

- `EnhancedPermissionProvider` -- Context provider with `maxScope` and `maxSensitivityTier`.
- `EnhancedPermissionGate` -- Gate component with `scope` and `minTier` props.
- `SensitiveField` -- Renders field values with masking based on sensitivity tier.

```tsx
<SensitiveField
  value={employee.niNumber}
  tier={3}
  maskPattern="****{last4}"
/>
```

### useFieldPermissions

**File:** `app/hooks/use-field-permissions.tsx`

Field-level security hooks for controlling individual form fields based on the user's permissions. Fetches permissions from `/fields/my-permissions`. Cached for 5 minutes.

**Permission levels:** `"edit"` (full access), `"view"` (read-only), `"hidden"` (not visible).

**Hooks:**

| Hook | Signature | Description |
|---|---|---|
| `useFieldPermissionContext()` | `() => FieldPermissionContextType` | Access field permission context (requires `FieldPermissionProvider`) |
| `useEntityFieldPermissions(entity)` | `(string) => { fields, groups, canView, canEdit, isHidden, getFieldMeta, editableFields, visibleFields }` | Get field permissions for an entity with grouped metadata |
| `useCanEditField(entity, field)` | `(string, string) => boolean` | Check if a field is editable (returns `false` while loading) |
| `useCanViewField(entity, field)` | `(string, string) => boolean` | Check if a field is viewable (returns `false` while loading) |
| `useIsFieldHidden(entity, field)` | `(string, string) => boolean` | Check if a field is hidden (returns `true` while loading) |

**Components:**

- `FieldPermissionProvider` -- Context provider that loads all field permissions into a `Map<string, FieldPermission>`.
- `FieldPermissionGate` -- Conditional rendering based on field permissions. Accepts `entity`, `field`, `mode` (`"view"` or `"edit"`), and `fallback`.
- `FieldVisibility` -- Renders children only if the field is not hidden.

```tsx
import { FieldPermissionGate, FieldVisibility } from "~/hooks/use-field-permissions";

<FieldPermissionGate entity="employee" field="salary" mode="edit">
  <Input label="Salary" {...register("salary")} />
</FieldPermissionGate>

<FieldVisibility entity="employee" field="ni_number">
  <span>{employee.niNumber}</span>
</FieldVisibility>
```

### useTenant

**File:** `app/hooks/use-tenant.tsx`

Tenant context and settings hooks for multi-tenant support.

**Hooks:**

| Hook | Returns | Description |
|---|---|---|
| `useTenant()` | `{ tenant, tenantId, tenantName, isLoading }` | Current tenant information. Cached for 30 minutes. |
| `useTenantSettings()` | `{ settings, isLoading, isFeatureEnabled(feature) }` | Tenant configuration (timezone, dateFormat, timeFormat, currency, language, features, branding). Defaults to UTC/YYYY-MM-DD/HH:mm/GBP/en. Cached for 30 minutes. |
| `useUserTenants()` | `{ tenants, hasMutipleTenants, isLoading }` | List of tenants the user can access. Cached for 10 minutes. |
| `useSwitchTenant()` | `{ switchTenant(id), isPending, error }` | Switch between tenants. Clears all cached data, updates API client tenant ID, refetches auth data, and reloads to `/dashboard`. |
| `useFormatDate()` | `(date: Date \| string) => string` | Format date per tenant settings |
| `useFormatTime()` | `(date: Date \| string) => string` | Format time per tenant settings (24h or 12h) |
| `useFormatCurrency()` | `(amount: number) => string` | Format currency per tenant settings (uses `Intl.NumberFormat`) |

**Components:**

- `TenantFeatureGate` -- Conditional rendering based on tenant feature flags.

```tsx
import { useTenantSettings, TenantFeatureGate } from "~/hooks/use-tenant";

const { isFeatureEnabled } = useTenantSettings();
if (isFeatureEnabled("lms_enabled")) { /* ... */ }

<TenantFeatureGate feature="lms_enabled" fallback={<p>LMS is not enabled.</p>}>
  <LmsModule />
</TenantFeatureGate>
```

### useManager

**File:** `app/hooks/use-manager.tsx`

Manager portal hooks for team management and approval workflows.

**Hooks:**

| Hook | Returns | Stale Time | Description |
|---|---|---|---|
| `useIsManager()` | `{ isManager, isLoading }` | 5 min | Check if current user is a manager (via `/manager/is-manager`) |
| `useTeamOverview()` | `{ overview }` | 2 min | Team dashboard data: `totalDirectReports`, `totalSubordinates`, `pendingApprovals`, `teamOnLeave`, `upcomingLeave` |
| `useDirectReports()` | `{ team }` | 5 min | Direct report list with employee details |
| `useAllSubordinates(maxDepth?)` | `{ team }` | 5 min | All subordinates (direct and indirect), optionally limited by hierarchy depth |
| `useTeamMember(employeeId)` | `{ member }` | 5 min | Detailed info for a specific team member (extends `TeamMember` with additional fields) |
| `useIsSubordinate(employeeId)` | `{ isSubordinate }` | 10 min | Check if an employee reports to the current user (direct or indirect) |
| `usePendingApprovals(type?)` | `{ approvals }` | 1 min | Pending approval queue, optionally filtered by `ApprovalType` (`"leave" \| "timesheet" \| "expense" \| "document" \| "workflow"`) |
| `useApprovalActions()` | `{ approve, reject, isApproving, isRejecting }` | -- | Approve or reject pending requests. Invalidates approvals and overview on success. |
| `useTeamAbsence(start, end)` | `{ entries, entriesByDate, entriesByEmployee }` | 5 min | Team absence calendar data grouped by date and employee |
| `useCurrentMonthTeamAbsence()` | Same as `useTeamAbsence` | 5 min | Convenience wrapper for current calendar month |

All manager hooks are gated: they only fetch data when `isAuthenticated && isManager` are both true.

### usePortal

**File:** `app/hooks/use-portal.tsx`

Multi-portal navigation hooks for switching between admin, manager, and employee portals.

**Portal types:** `"admin" | "manager" | "employee"`

**Context setup:** `PortalProvider` wraps the application and detects the current portal from the URL path (`/admin` -> admin, `/manager` -> manager, `/ess` -> employee).

**Hooks:**

| Hook | Returns | Description |
|---|---|---|
| `usePortalContext()` | Full context | Access the portal context directly (requires `PortalProvider`) |
| `usePortals()` | `{ portals, isLoading }` | User's available portals. Cached for 10 minutes. |
| `useCurrentPortal()` | `{ portal, portalInfo, isLoading }` | Current portal context (detected from URL) |
| `useSwitchPortal()` | `{ switchPortal, isLoading }` | Switch between portals (navigates to new portal's dashboard) |
| `usePortalNavigation(code?)` | `{ navigation, isLoading }` | Get navigation items for a portal. Returns `PortalNavigationItem[]` with `id`, `label`, `path?`, `icon?`, and `children?`. |
| `useHasPortalAccess(portal)` | `boolean` | Check access to a specific portal |
| `useDefaultPortal()` | `Portal \| null` | Get the user's default portal |

**Components:**

- `PortalProvider` -- Context provider for portal state.
- `PortalGate` -- Conditional rendering based on portal access. Accepts single or array of `PortalType`.

```tsx
import { PortalGate } from "~/hooks/use-portal";

<PortalGate portal="admin" fallback={<p>No admin access</p>}>
  <AdminPanel />
</PortalGate>

<PortalGate portal={["admin", "manager"]}>
  <AdvancedReports />
</PortalGate>
```

---

## Utility Library (`packages/web/app/lib/`)

### cn (Class Name Merge)

**File:** `app/lib/utils.ts`

Merges Tailwind CSS classes with conflict resolution using `clsx` + `tailwind-merge`:

```tsx
import { cn } from "~/lib/utils";

<div className={cn("p-4 bg-white", isActive && "bg-primary-100", className)} />
```

### Additional Utilities in `lib/utils.ts`

| Function | Description |
|---|---|
| `formatRelativeTime(date)` | Returns "2 hours ago", "3 days ago", etc. |
| `formatCompactNumber(value)` | Returns "1.2K", "3.5M", etc. |
| `truncate(str, maxLength)` | Truncates with ellipsis |
| `getInitials(name)` | Returns "JS" for "John Smith" |
| `capitalize(str)` | Capitalises first letter |
| `titleCase(str)` | Title-cases all words |
| `camelToWords(str)` | Converts camelCase to words |
| `snakeToWords(str)` | Converts snake_case to words |
| `debounce(fn, delay)` | Debounce a function |
| `throttle(fn, delay)` | Throttle a function |
| `groupBy(array, key)` | Group array by key |
| `unique(array, key?)` | Remove duplicates |
| `sortBy(array, key, order?)` | Sort array by key |
| `isEmpty(value)` | Check if null/undefined/empty string/array/object |
| `pick(obj, keys)` | Pick keys from object |
| `omit(obj, keys)` | Omit keys from object |
| `deepClone(obj)` | Deep clone via JSON |
| `parseQueryString(query)` | Parse URL query string to object |
| `buildQueryString(params)` | Build URL query string from object |

### ThemeProvider

**File:** `app/lib/theme.tsx`

Theme context provider supporting `light`, `dark`, and `system` modes. Exposes `useTheme()` hook with `{ theme, resolvedTheme, setTheme, toggleTheme }`.

### ClientOnly

**File:** `app/lib/client-only.tsx`

Wrapper component that only renders its children on the client side (not during SSR). Used for components that depend on browser APIs.

---

## Related Documents

- [Frontend Architecture Overview](./README.md)
- [Complete Route Map](./routes.md)
- [Data Fetching Patterns](./data-fetching.md)
- [API Reference](../04-api/API_REFERENCE.md)
- [Permissions System](../02-architecture/PERMISSIONS_SYSTEM.md)
