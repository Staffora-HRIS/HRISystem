/**
 * Feature Flag React Hook
 *
 * Provides a simple hook for checking whether a feature flag is enabled
 * for the current authenticated user. Uses React Query for caching and
 * automatic background refetching.
 *
 * Usage:
 * ```tsx
 * import { useFeatureFlag, useFeatureFlags } from '~/hooks/use-feature-flag';
 *
 * function MyComponent() {
 *   const isBetaEnabled = useFeatureFlag('beta-dashboard');
 *
 *   if (!isBetaEnabled) return null;
 *   return <BetaDashboard />;
 * }
 * ```
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "~/lib/api-client";

// =============================================================================
// Types
// =============================================================================

interface FeatureFlagEvalResponse {
  flags: Record<string, boolean>;
}

// =============================================================================
// Query Key
// =============================================================================

/**
 * Query key factory for feature flags.
 * Scoped by tenant (via api.getTenantId) for correct cache isolation.
 */
export const featureFlagKeys = {
  all: () => ["feature-flags", api.getTenantId() ?? "default"] as const,
  evaluate: (flagNames?: string[]) =>
    [...featureFlagKeys.all(), "evaluate", flagNames?.sort().join(",") ?? "all"] as const,
};

// =============================================================================
// Fetch Function
// =============================================================================

/**
 * Fetch evaluated feature flags from the API.
 * If specific flag names are provided, only those flags are evaluated.
 *
 * Uses POST with a JSON body instead of GET with query params to avoid
 * leaking flag names in URL query strings, browser history, server access
 * logs, and CDN logs.
 */
async function fetchFeatureFlags(
  flagNames?: string[]
): Promise<Record<string, boolean>> {
  const body: { flags?: string[] } = {};
  if (flagNames && flagNames.length > 0) {
    body.flags = flagNames;
  }

  try {
    const response = await api.request<FeatureFlagEvalResponse>(
      "/feature-flags/evaluate",
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    return response.flags ?? {};
  } catch {
    // On error (network failure, auth issue, etc.), return empty object.
    // Flags default to disabled when unknown.
    return {};
  }
}

// =============================================================================
// Shared Query Options
// =============================================================================

const FLAG_QUERY_OPTIONS = {
  staleTime: 60 * 1000, // 1 minute — matches server-side cache TTL
  gcTime: 5 * 60 * 1000, // 5 minutes
  refetchOnWindowFocus: true,
  retry: 1,
  placeholderData: (prev: Record<string, boolean> | undefined) => prev,
} as const;

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to check if a single feature flag is enabled.
 *
 * Returns `false` while loading, on error, or if the flag does not exist.
 * This ensures features are hidden until explicitly enabled (fail-closed).
 *
 * @param flagName - The feature flag name to check
 * @returns boolean indicating whether the flag is enabled for the current user
 *
 * @example
 * ```tsx
 * const showNewUI = useFeatureFlag('new-dashboard-ui');
 * ```
 */
export function useFeatureFlag(flagName: string): boolean {
  const { data } = useQuery({
    queryKey: featureFlagKeys.evaluate([flagName]),
    queryFn: () => fetchFeatureFlags([flagName]),
    ...FLAG_QUERY_OPTIONS,
  });

  return data?.[flagName] ?? false;
}

/**
 * Hook to check multiple feature flags at once.
 *
 * More efficient than calling useFeatureFlag multiple times because
 * it batches all flags into a single API request.
 *
 * @param flagNames - Array of feature flag names to check
 * @returns Record mapping flag names to boolean enabled state
 *
 * @example
 * ```tsx
 * const flags = useFeatureFlags(['beta-dashboard', 'new-reports', 'ai-search']);
 * if (flags['beta-dashboard']) { ... }
 * ```
 */
export function useFeatureFlags(
  flagNames: string[]
): Record<string, boolean> {
  const { data } = useQuery({
    queryKey: featureFlagKeys.evaluate(flagNames),
    queryFn: () => fetchFeatureFlags(flagNames),
    ...FLAG_QUERY_OPTIONS,
    enabled: flagNames.length > 0,
  });

  // Default all requested flags to false if data is not yet available
  if (!data) {
    const defaults: Record<string, boolean> = {};
    for (const name of flagNames) {
      defaults[name] = false;
    }
    return defaults;
  }

  return data;
}

/**
 * Hook to get all feature flags for the current tenant/user.
 *
 * Fetches all flags without filtering. Useful for admin dashboards
 * or debugging panels.
 *
 * @returns Record mapping all flag names to boolean enabled state
 */
export function useAllFeatureFlags(): Record<string, boolean> {
  const { data } = useQuery({
    queryKey: featureFlagKeys.evaluate(),
    queryFn: () => fetchFeatureFlags(),
    ...FLAG_QUERY_OPTIONS,
  });

  return data ?? {};
}
