/**
 * Better Auth Types
 *
 * Type definitions for Better Auth integration.
 * These types are shared between frontend and backend.
 */

import type { UUID, TimestampString } from "./common";

/**
 * Better Auth User
 * Represents the authenticated user from Better Auth
 */
export interface BetterAuthUser {
  id: UUID;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  createdAt: TimestampString;
  updatedAt: TimestampString;
  status?: "pending" | "active" | "suspended" | "deleted";
  mfaEnabled?: boolean;
}

/**
 * Better Auth Session
 * Represents an authenticated session from Better Auth
 */
export interface BetterAuthSession {
  id: UUID;
  userId: UUID;
  token: string;
  expiresAt: TimestampString;
  createdAt: TimestampString;
  updatedAt: TimestampString;
  ipAddress?: string | null;
  userAgent?: string | null;
  currentTenantId?: UUID | null;
  mfaVerified?: boolean;
  mfaVerifiedAt?: TimestampString | null;
}

/**
 * Session with user data
 * Combined session and user information
 */
export interface SessionWithUser {
  session: BetterAuthSession;
  user: BetterAuthUser;
}

/**
 * Sign in request
 */
export interface SignInRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Sign in response
 */
export interface SignInResponse {
  user: BetterAuthUser;
  session: BetterAuthSession;
  redirect?: boolean;
  url?: string;
}

/**
 * Sign up request
 */
export interface SignUpRequest {
  email: string;
  password: string;
  name: string;
}

/**
 * Sign up response
 */
export interface SignUpResponse {
  user: BetterAuthUser;
  session: BetterAuthSession;
}

/**
 * Two-factor authentication setup response
 */
export interface TwoFactorSetupResponse {
  totpURI: string;
  secret: string;
  backupCodes: string[];
}

/**
 * Two-factor verification request
 */
export interface TwoFactorVerifyRequest {
  code: string;
}

/**
 * Auth error response
 */
export interface AuthErrorResponse {
  error: {
    code: string;
    message: string;
    status?: number;
  };
}
