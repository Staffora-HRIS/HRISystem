/**
 * Health Check Route
 *
 * Lightweight endpoint for Docker/load balancer health checks.
 * No auth checks, no redirects, no logging — just a 200 OK.
 */

export function loader() {
  return new Response("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export default function Healthz() {
  return null;
}
