/**
 * Better Auth Integration for Staffora
 *
 * This module provides Better Auth client integration with React.
 * It wraps the Better Auth client with Staffora-specific functionality
 * including multi-tenant support.
 */

import { createAuthClient } from "better-auth/react";
import { twoFactorClient, organizationClient } from "better-auth/client/plugins";
import { sentinelClient } from "@better-auth/infra/client";

/**
 * Get the API base URL
 * 
 * IMPORTANT: Always returns a valid API URL, never empty string.
 * Empty string causes requests to go to frontend origin which returns 405.
 */
function getBaseURL(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl.trim() !== "") {
    return envUrl.trim();
  }
  // Default to localhost:3000 for development
  return "http://localhost:3000";
}

/**
 * Better Auth client configured for Staffora
 * 
 * IMPORTANT: fetchOptions.credentials must be 'include' for cross-origin
 * cookie handling (API on port 3000, web on port 5173)
 */
export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  plugins: [twoFactorClient(), sentinelClient(), organizationClient()],
  fetchOptions: {
    credentials: "include",
  },
});

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string) {
  return authClient.signIn.email({
    email,
    password,
  });
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  name: string
) {
  return authClient.signUp.email({
    email,
    password,
    name,
  });
}

/**
 * Sign out the current user
 */
export async function signOutUser() {
  return authClient.signOut();
}

/**
 * Get current session
 */
export async function getCurrentSession() {
  return authClient.getSession();
}

/**
 * React hook for session state
 * Returns { data, isPending, error }
 */
export const useSession = authClient.useSession;

/**
 * Two-factor authentication methods
 */
export const twoFactor = {
  /**
   * Enable 2FA for the current user
   */
  enable: async (password: string) => {
    return authClient.twoFactor.enable({ password });
  },

  /**
   * Verify 2FA code during login
   */
  verifyTotp: async (code: string) => {
    return authClient.twoFactor.verifyTotp({ code });
  },

  /**
   * Disable 2FA for the current user
   */
  disable: async (password: string) => {
    return authClient.twoFactor.disable({ password });
  },
};

/**
 * Type exports
 */
export type Session = typeof authClient.$Infer.Session;
export type User = Session["user"];
