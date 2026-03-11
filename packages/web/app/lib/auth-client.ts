/**
 * Better Auth Client Configuration
 *
 * Client-side auth utilities using Better Auth.
 * Provides type-safe auth methods and React hooks.
 *
 * IMPORTANT: baseURL must always point to the API server, not the frontend.
 * If baseURL is empty or incorrect, requests will go to the wrong server
 * and return 405 Method Not Allowed errors.
 */

import { createAuthClient } from "better-auth/react";
import { twoFactorClient, organizationClient } from "better-auth/client/plugins";
import { sentinelClient } from "@better-auth/infra/client";

/**
 * Get the API base URL from environment or default
 *
 * FIX: Always return a valid API URL, never empty string.
 * Empty string causes requests to go to frontend origin which returns 405.
 *
 * @exported for testing purposes
 */
export function getBaseURL(): string {
  // Check for environment variable first
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim() !== "") {
    return envUrl.trim();
  }

  // Default to localhost:3000 for development
  // This ensures requests always go to the API server, not the frontend
  return "http://localhost:3000";
}

/**
 * Better Auth client instance
 *
 * Provides methods for:
 * - signIn.email() - Email/password login
 * - signUp.email() - Email/password registration
 * - signOut() - Logout
 * - useSession() - React hook for session state
 * - twoFactor.* - MFA methods
 */
export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [twoFactorClient(), sentinelClient(), organizationClient()],
  // Ensure credentials are sent with cross-origin requests
  fetchOptions: {
    credentials: "include" as RequestCredentials,
  },
});

/**
 * Export individual methods for convenience
 */
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;

/**
 * Type exports
 */
export type Session = typeof authClient.$Infer.Session;
export type User = Session["user"];
