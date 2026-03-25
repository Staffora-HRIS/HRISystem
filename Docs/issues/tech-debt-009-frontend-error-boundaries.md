# [TECH-DEBT] Single Root-Level Error Boundary in Frontend

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** MEDIUM
**Labels:** tech-debt, enhancement
**Effort:** MEDIUM

## Description
The frontend has only one `ErrorBoundary` at the root level (`app/root.tsx:100`). Individual route modules have no error boundaries, meaning any data-fetching error in a sub-route crashes the entire application view rather than showing a localized error. This provides a poor user experience for an enterprise application where partial failures should degrade gracefully.

## Current State
- `packages/web/app/root.tsx` (line 100): single root-level ErrorBoundary
- 84 route files with zero error boundaries
- Any uncaught error in any route crashes the entire view

## Expected State
- Route-level error boundaries in layout routes (`(admin)/layout.tsx`, `(app)/layout.tsx`)
- Individual route error boundaries for critical pages (employee detail, dashboard)
- Graceful degradation showing error only in the affected section

## Acceptance Criteria
- [ ] Reusable `RouteErrorBoundary` component created
- [ ] Error boundary added to `(admin)/layout.tsx`
- [ ] Error boundary added to `(app)/layout.tsx`
- [ ] Error boundary added to `(auth)/layout.tsx`
- [ ] Error message shows user-friendly text with retry option
- [ ] Error details logged for debugging
- [ ] Tests verify error boundary rendering

## Implementation Notes
Create a `RouteErrorBoundary` component that catches errors and renders a user-friendly fallback with a retry button. Use React Router v7's `errorElement` prop on layout routes. Log error details including the route path and error message.

## Affected Files
- New: `packages/web/app/components/ui/RouteErrorBoundary.tsx`
- `packages/web/app/routes/(admin)/layout.tsx`
- `packages/web/app/routes/(app)/layout.tsx`
- `packages/web/app/routes/(auth)/layout.tsx`

## Related Issues
- None
