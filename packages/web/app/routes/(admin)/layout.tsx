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
  const cookies = (() => {
    for (const [key, value] of request.headers) {
      if (key.toLowerCase() === "cookie") return value;
    }
    return "";
  })();
  const hasSessionToken = cookies.includes("hris.session_token=");
  const hasSessionData = cookies.includes("hris.session_data=");
  const hasLegacySession = cookies.includes("session=");
  const hasSession = hasSessionToken || hasSessionData || hasLegacySession;

  if (process.env["NODE_ENV"] !== "production") {
    console.log("[web][(admin) layout] cookieCheck", {
      hasSessionToken,
      hasSessionData,
      hasLegacySession,
      cookieLength: cookies.length,
    });
  }

  // If not authenticated, redirect to login
  if (!hasSession) {
    const url = new URL(request.url);
    throw redirect(`/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  const apiOrigin =
    process.env["API_URL"] ||
    process.env["BETTER_AUTH_URL"] ||
    "http://localhost:3000";

  const permissionsResp = await fetch(`${apiOrigin}/api/v1/security/my-permissions`, {
    method: "GET",
    headers: {
      cookie: cookies,
    },
  });

  if (!permissionsResp.ok) {
    const url = new URL(request.url);
    throw redirect(`/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  const body = (await permissionsResp.json()) as
    | { permissions: string[]; roles: string[] }
    | { error: { code: string; message: string } };

  if ("error" in body) {
    throw redirect("/dashboard");
  }

  const permissions = new Set(body.permissions ?? []);
  const roles = new Set(body.roles ?? []);

  const hasPermission = (key: string) => {
    if (permissions.has("*") || permissions.has("*:*")) return true;
    if (permissions.has(key)) return true;

    const parts = key.split(":");
    if (parts.length >= 2) {
      const resource = parts.slice(0, -1).join(":");
      const action = parts[parts.length - 1];
      if (permissions.has(`${resource}:*`)) return true;
      if (permissions.has(`*:${action}`)) return true;
    }

    return false;
  };

  const isAdmin =
    roles.has("super_admin") || roles.has("tenant_admin") || roles.has("hr_admin") || hasPermission("*");

  const canAccessAdminConsole =
    isAdmin ||
    hasPermission("dashboards:read") ||
    hasPermission("employees:read") ||
    hasPermission("org:read") ||
    hasPermission("positions:read") ||
    hasPermission("users:read") ||
    hasPermission("roles:read") ||
    hasPermission("audit:read") ||
    hasPermission("reports:read") ||
    hasPermission("tenant:read") ||
    hasPermission("settings:read") ||
    hasPermission("workflows:read") ||
    hasPermission("courses:read");

  if (!canAccessAdminConsole) {
    throw redirect("/dashboard");
  }

  return null;
}

export default function AdminLayoutWrapper() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
