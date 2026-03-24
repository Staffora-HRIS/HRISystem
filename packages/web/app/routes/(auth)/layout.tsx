/**
 * Auth Layout Wrapper
 *
 * Wraps authentication pages and redirects if already authenticated.
 */

import { Outlet, redirect } from "react-router";
import { AuthLayout } from "../../components/layouts/auth-layout";
import type { Route } from "./+types/layout";

export async function loader({ request }: Route.LoaderArgs) {
  // Check if user has a Better Auth session cookie.
  // This is a fast, server-side check — the cookie's existence doesn't guarantee
  // the session is valid (it may be expired), but if it's missing the user
  // definitely isn't authenticated. The client-side session query handles the
  // expired-session case by showing the login form.
  const cookies = (() => {
    for (const [key, value] of request.headers) {
      if (key.toLowerCase() === "cookie") return value;
    }
    return "";
  })();
  const hasBetterAuthSession =
    cookies.includes("staffora.session_token=") ||
    cookies.includes("__Secure-staffora.session_token=");

  // Only redirect to dashboard if Better Auth cookie is present.
  // If the session is actually expired, the dashboard's API calls will
  // return 401 and the client-side interceptor will redirect back here.
  if (hasBetterAuthSession) {
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
