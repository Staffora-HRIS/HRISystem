/**
 * Authentication Utilities (Better Auth)
 *
 * This module provides authentication functionality using Better Auth.
 * Uses React Query for session state instead of Better Auth's React hooks
 * to avoid duplicate React instance issues with SSR.
 */

import { useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api-client";
import { queryKeys } from "./query-client";
import {
  authClient,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  getCurrentSession,
  twoFactor,
} from "./better-auth";

// =============================================================================
// Types
// =============================================================================

export interface User {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  image: string | null;
  status?: string;
  mfaEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  isPrimary: boolean;
}

export interface UserWithTenants {
  user: User;
  session: Session;
  currentTenant: Tenant | null;
  tenants: Tenant[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignUpData {
  email: string;
  password: string;
  name: string;
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: Error | null;
}

// =============================================================================
// Auth API (Staffora-specific endpoints)
// =============================================================================

export const authApi = {
  /**
   * Get current user with tenants (Staffora-specific)
   */
  async getMe(): Promise<UserWithTenants> {
    return api.get<UserWithTenants>("/auth/me");
  },

  /**
   * Switch to a different tenant
   */
  async switchTenant(tenantId: string): Promise<{ success: boolean; tenantId: string }> {
    return api.post<{ success: boolean; tenantId: string }>("/auth/switch-tenant", { tenantId });
  },

  /**
   * Request password reset via Better Auth
   */
  async requestPasswordReset(data: { email: string }): Promise<void> {
    await (authClient as any).forgetPassword({ email: data.email });
  },

  /**
   * Confirm password reset via Better Auth
   */
  async confirmPasswordReset(data: { token: string; password: string }): Promise<void> {
    await (authClient as any).resetPassword({ newPassword: data.password });
  },
};

// =============================================================================
// React Hooks
// =============================================================================

/**
 * Session hook using React Query instead of Better Auth's React hooks
 * This avoids duplicate React instance issues with SSR
 */
export function useSession() {
  const { data, isPending, error } = useQuery({
    queryKey: queryKeys.auth.session(),
    queryFn: async () => {
      const result = await getCurrentSession();
      return result.data;
    },
    staleTime: 60 * 1000, // 1 minute
    retry: false,
  });

  return {
    session: data?.session ?? null,
    user: data?.user ?? null,
    isAuthenticated: !!data?.session,
    isLoading: isPending,
    error: error ?? null,
  };
}

/**
 * Main auth hook with login, logout, and user management
 */
export function useAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { session, user, isAuthenticated, isLoading, error } = useSession();

  // Get user with tenants (Staffora-specific data)
  const {
    data: userData,
    isLoading: isLoadingUser,
    refetch: refetchUser,
  } = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: authApi.getMe,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const result = await signInWithEmail(credentials.email, credentials.password);
      if (result.error) {
        throw new Error(result.error.message || "Login failed");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
      const redirectTo = new URLSearchParams(location.search).get("redirect") || "/dashboard";
      navigate(redirectTo);
    },
  });

  // Signup mutation
  const signupMutation = useMutation({
    mutationFn: async (data: SignUpData) => {
      const result = await signUpWithEmail(data.email, data.password, data.name);
      if (result.error) {
        throw new Error(result.error.message || "Sign up failed");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
      navigate("/dashboard");
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: signOutUser,
    onSuccess: () => {
      queryClient.clear();
      navigate("/login");
    },
  });

  // Switch tenant mutation
  const switchTenantMutation = useMutation({
    mutationFn: authApi.switchTenant,
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  // Memoized auth actions
  const login = useCallback(
    (credentials: LoginCredentials) => loginMutation.mutateAsync(credentials),
    [loginMutation]
  );

  const signup = useCallback(
    (data: SignUpData) => signupMutation.mutateAsync(data),
    [signupMutation]
  );

  const logout = useCallback(
    () => logoutMutation.mutateAsync(),
    [logoutMutation]
  );

  const switchTenant = useCallback(
    (tenantId: string) => switchTenantMutation.mutateAsync(tenantId),
    [switchTenantMutation]
  );

  // Combined auth state
  const authState = useMemo<AuthState>(
    () => ({
      user: user as User | null,
      session: session as Session | null,
      isAuthenticated,
      isLoading: isLoading || isLoadingUser,
      error: error as Error | null,
    }),
    [user, session, isAuthenticated, isLoading, isLoadingUser, error]
  );

  return {
    // State
    ...authState,
    currentTenant: userData?.currentTenant ?? null,
    tenants: userData?.tenants ?? [],

    // Actions
    login,
    signup,
    logout,
    switchTenant,
    refetchUser,

    // Mutation states
    isLoggingIn: loginMutation.isPending,
    isSigningUp: signupMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    isSwitchingTenant: switchTenantMutation.isPending,

    // Errors
    loginError: loginMutation.error,
    signupError: signupMutation.error,
    logoutError: logoutMutation.error,
  };
}

/**
 * Hook for MFA operations
 */
export function useMfa() {
  const queryClient = useQueryClient();

  const enableMfaMutation = useMutation({
    mutationFn: twoFactor.enable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });

  const verifyMfaMutation = useMutation({
    mutationFn: twoFactor.verifyTotp,
  });

  const disableMfaMutation = useMutation({
    mutationFn: twoFactor.disable,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });

  return {
    enableMfa: enableMfaMutation.mutateAsync,
    verifyMfa: verifyMfaMutation.mutateAsync,
    disableMfa: disableMfaMutation.mutateAsync,
    isEnabling: enableMfaMutation.isPending,
    isVerifying: verifyMfaMutation.isPending,
    isDisabling: disableMfaMutation.isPending,
    enableError: enableMfaMutation.error,
    verifyError: verifyMfaMutation.error,
    disableError: disableMfaMutation.error,
  };
}

// Re-export Better Auth client for direct access
export { authClient, signInWithEmail, signUpWithEmail, signOutUser };
