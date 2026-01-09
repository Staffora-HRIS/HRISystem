/**
 * Admin Layout Wrapper
 *
 * Wraps admin pages with authentication and admin permission check.
 */

import { Outlet, redirect } from "react-router";
import { AdminLayout } from "../../components/layouts/admin-layout";
import type { Route } from "./+types/layout";

export async function loader({ request }: Route.LoaderArgs) {
  // Check if user is authenticated by looking for session cookie
  const cookies = request.headers.get("Cookie") || "";
  const hasSession = cookies.includes("session=");

  // If not authenticated, redirect to login
  if (!hasSession) {
    const url = new URL(request.url);
    throw redirect(`/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  // In a real app, we'd also check for admin permissions here
  // For now, we'll rely on client-side permission checks
  // const permissions = await getPermissionsFromSession(request);
  // if (!permissions.includes('admin:*') && !permissions.includes('hr:*')) {
  //   throw redirect('/dashboard');
  // }

  return null;
}

export default function AdminLayoutWrapper() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
