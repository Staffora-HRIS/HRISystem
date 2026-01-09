/**
 * App Layout Wrapper
 *
 * Wraps main application pages with authentication check.
 */

import { Outlet, redirect } from "react-router";
import { AppLayout } from "../../components/layouts/app-layout";
import type { Route } from "./+types/layout";

export async function loader({ request }: Route.LoaderArgs) {
  // Check if user is authenticated by looking for session cookie
  // In a real app, this would validate the session server-side
  const cookies = request.headers.get("Cookie") || "";
  const hasSession = cookies.includes("session=");

  // If not authenticated, redirect to login
  if (!hasSession) {
    const url = new URL(request.url);
    throw redirect(`/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  return null;
}

export default function AppLayoutWrapper() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
