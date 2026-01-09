/**
 * Home Route
 *
 * Redirects to dashboard if authenticated, otherwise to login.
 */

import { redirect } from "react-router";
import type { Route } from "./+types/home";

export async function loader({ request }: Route.LoaderArgs) {
  // Check if user is authenticated by looking for session cookie
  const cookies = request.headers.get("Cookie") || "";
  const hasSession = cookies.includes("session=");

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
