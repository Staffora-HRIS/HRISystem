/**
 * Home Route
 *
 * Redirects to dashboard if authenticated, otherwise to login.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/home";

export async function loader({ request }: Route.LoaderArgs) {
  // Check if user has a Better Auth session cookie
  const cookies = (() => {
    for (const [key, value] of request.headers) {
      if (key.toLowerCase() === "cookie") return value;
    }
    return "";
  })();
  const hasSession =
    cookies.includes("staffora.session_token=") ||
    cookies.includes("__Secure-staffora.session_token=");

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
