/**
 * Auth Layout Wrapper
 *
 * Wraps authentication pages and redirects if already authenticated.
 */

import { Outlet, redirect } from "react-router";
import { AuthLayout } from "../../components/layouts/auth-layout";
import type { Route } from "./+types/layout";

export async function loader({ request }: Route.LoaderArgs) {
  // Check if user is already authenticated by looking for session cookie
  // In a real app, this would validate the session server-side
  const cookies = request.headers.get("Cookie") || "";
  const hasSession = cookies.includes("session=");

  // If already authenticated, redirect to dashboard
  if (hasSession) {
    throw redirect("/dashboard");
  }

  return null;
}

export default function AuthLayoutWrapper() {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  );
}
