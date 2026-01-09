/**
 * Better Auth Elysia Handler
 *
 * Integrates Better Auth with Elysia framework.
 * Exposes auth endpoints at /api/auth/*
 *
 * FIX: Ensures all HTTP methods (GET, POST, OPTIONS, etc.) are properly handled
 * to prevent 405 Method Not Allowed errors.
 */

import { Elysia } from "elysia";
import { getBetterAuth } from "./better-auth";

/**
 * Better Auth plugin for Elysia
 *
 * Mounts Better Auth endpoints at /api/auth/*
 * Handles:
 * - POST /api/auth/sign-up/email - Register new user
 * - POST /api/auth/sign-in/email - Email/password login
 * - POST /api/auth/sign-out - Logout
 * - GET /api/auth/get-session - Get current session
 * - POST /api/auth/two-factor/* - MFA endpoints
 *
 * IMPORTANT: Uses .all() to handle ALL HTTP methods including OPTIONS for CORS preflight.
 * This prevents 405 Method Not Allowed errors when the browser sends preflight requests.
 */
export function betterAuthPlugin() {
  const auth = getBetterAuth();

  return new Elysia({ name: "better-auth" })
    // Handle all /api/auth/* routes with all HTTP methods
    // The wildcard (*) captures any path after /api/auth/
    .all("/api/auth/*", async ({ request }) => {
      try {
        const response = await auth.handler(request);
        return response;
      } catch (error) {
        console.error("Better Auth handler error:", error);
        return new Response(
          JSON.stringify({ error: "Authentication service error" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    })

    // Handle exact /api/auth path (without trailing path)
    .all("/api/auth", async ({ request }) => {
      try {
        const response = await auth.handler(request);
        return response;
      } catch (error) {
        console.error("Better Auth handler error:", error);
        return new Response(
          JSON.stringify({ error: "Authentication service error" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    });
}

/**
 * Session middleware for Elysia
 *
 * Adds session and user to request context if authenticated.
 * Use this on routes that need to check authentication.
 */
export function betterAuthSession() {
  const auth = getBetterAuth();

  return new Elysia({ name: "better-auth-session" }).derive(
    async ({ request, set }) => {
      try {
        const session = await auth.api.getSession({
          headers: request.headers,
        });

        if (!session) {
          return {
            session: null,
            user: null,
            isAuthenticated: false as const,
          };
        }

        return {
          session: session.session,
          user: session.user,
          isAuthenticated: true as const,
        };
      } catch (error) {
        console.error("Session validation error:", error);
        return {
          session: null,
          user: null,
          isAuthenticated: false as const,
        };
      }
    }
  );
}

/**
 * Auth guard for protected routes
 *
 * Returns 401 if not authenticated.
 * Must be used after betterAuthSession() middleware.
 */
export function requireBetterAuth() {
  return new Elysia({ name: "require-better-auth" }).derive(
    (ctx) => {
      const { session, user, isAuthenticated, set } = ctx as any;
      if (!isAuthenticated || !session || !user) {
        set.status = 401;
        throw new Error("Authentication required");
      }
      return { session, user };
    }
  );
}

export { getBetterAuth };
