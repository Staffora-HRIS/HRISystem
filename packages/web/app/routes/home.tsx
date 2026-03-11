/**
 * Home Route
 *
 * Redirects to dashboard if authenticated, otherwise to login.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/home";

export async function loader({ request }: Route.LoaderArgs) {
  // Check if user is authenticated by looking for session cookie
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
    console.log("[web][home] cookieCheck", {
      hasSessionToken,
      hasSessionData,
      hasLegacySession,
      cookieLength: cookies.length,
    });
  }

  if (hasSession) {
    throw redirect("/dashboard");
  } else {
    throw redirect("/login");
  }
}

export default function HomePage() {
  // This component should never render due to the redirect
  return null;
}
