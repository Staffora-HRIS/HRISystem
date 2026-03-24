/**
 * App Layout Wrapper
 *
 * Wraps main application pages with authentication check.
 */

import { Outlet, redirect } from "react-router";
import { AppLayout } from "../../components/layouts/app-layout";
import type { Route } from "./+types/layout";

export async function loader({ request }: Route.LoaderArgs) {
  // Check if user has a Better Auth session cookie.
  // This is a fast server-side gate — if the cookie is missing the user
  // is definitely unauthenticated and we redirect to login immediately.
  const cookies = (() => {
    for (const [key, value] of request.headers) {
      if (key.toLowerCase() === "cookie") return value;
    }
    return "";
  })();
  const hasBetterAuthSession =
    cookies.includes("staffora.session_token=") ||
    cookies.includes("__Secure-staffora.session_token=");

  // If no session cookie, redirect to login
  if (!hasBetterAuthSession) {
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
