export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { Navigate } from "react-router";

/**
 * Manager index route - redirects to the full manager dashboard.
 *
 * The /manager/dashboard route has the real API-integrated implementation
 * with live team overview data, pending approvals, and team member list.
 * This index simply redirects so that navigating to /manager goes to the
 * proper dashboard instead of showing a stale mock page.
 */
export default function ManagerIndexPage() {
  return <Navigate to="/manager/dashboard" replace />;
}
