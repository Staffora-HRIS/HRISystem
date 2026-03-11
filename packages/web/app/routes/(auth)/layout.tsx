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
  const cookies = (() => {
    for (const [key, value] of request.headers) {
      if (key.toLowerCase() === "cookie") return value;
    }
    return "";
  })();
  const hasSessionToken = cookies.includes("staffora.session_token=");
  const hasSessionData = cookies.includes("staffora.session_data=");
  const hasLegacySession = cookies.includes("session=");
  const hasSession = hasSessionToken || hasSessionData || hasLegacySession;

  if (process.env["NODE_ENV"] !== "production") {
    console.log("[web][(auth) layout] cookieCheck", {
      hasSessionToken,
      hasSessionData,
      hasLegacySession,
      cookieLength: cookies.length,
    });
  }

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
