/**
 * Tenant Hooks
 *
 * Features:
 * - useTenant() - get current tenant
 * - useSwitchTenant() - switch between tenants
 */

import { useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { queryKeys } from "../lib/query-client";
import { useSession } from "../lib/auth";

// Types
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  logoUrl?: string;
  status: "active" | "inactive" | "suspended";
  settings: TenantSettings;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettings {
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  currency: string;
  language: string;
  features: Record<string, boolean>;
  branding: {
    primaryColor?: string;
    secondaryColor?: string;
    logoUrl?: string;
    faviconUrl?: string;
  };
}

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  role: string;
}

// API functions
async function fetchCurrentTenant(): Promise<Tenant> {
  return api.get<Tenant>("/tenant/current");
}

async function fetchTenantSettings(): Promise<TenantSettings> {
  return api.get<TenantSettings>("/tenant/settings");
}

async function fetchUserTenants(): Promise<TenantListItem[]> {
  return api.get<TenantListItem[]>("/auth/tenants");
}

async function switchTenant(tenantId: string): Promise<{ success: boolean; tenantId: string }> {
  return api.post<{ success: boolean; tenantId: string }>("/auth/switch-tenant", { tenantId });
}

/**
 * useTenant hook - get current tenant information
 */
export function useTenant() {
  const { isAuthenticated } = useSession();

  const {
    data: tenant,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tenant.current(),
    queryFn: fetchCurrentTenant,
    enabled: isAuthenticated,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  // Computed values - Better Auth user doesn't have tenantId/tenantName
  const tenantId = tenant?.id ?? null;
  const tenantName = tenant?.name ?? null;

  return {
    tenant,
    tenantId,
    tenantName,
    isLoading,
    error,
    refetch,
  };
}

/**
 * useTenantSettings hook - get tenant settings
 */
export function useTenantSettings() {
  const { isAuthenticated } = useSession();

  const {
    data: settings,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tenant.settings(),
    queryFn: fetchTenantSettings,
    enabled: isAuthenticated,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  // Provide default settings
  const mergedSettings = useMemo<TenantSettings>(() => {
    return {
      timezone: settings?.timezone ?? "UTC",
      dateFormat: settings?.dateFormat ?? "YYYY-MM-DD",
      timeFormat: settings?.timeFormat ?? "HH:mm",
      currency: settings?.currency ?? "GBP",
      language: settings?.language ?? "en",
      features: settings?.features ?? {},
      branding: settings?.branding ?? {},
    };
  }, [settings]);

  /**
   * Check if a feature is enabled
   */
  const isFeatureEnabled = useCallback(
    (feature: string): boolean => {
      return mergedSettings.features[feature] ?? false;
    },
    [mergedSettings.features]
  );

  return {
    settings: mergedSettings,
    isLoading,
    error,
    refetch,
    isFeatureEnabled,
  };
}

/**
 * useUserTenants hook - get list of tenants user can access
 */
export function useUserTenants() {
  const { isAuthenticated } = useSession();

  const {
    data: tenants,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.tenant.list(),
    queryFn: fetchUserTenants,
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const hasMutipleTenants = (tenants?.length ?? 0) > 1;

  return {
    tenants: tenants ?? [],
    hasMutipleTenants,
    isLoading,
    error,
    refetch,
  };
}

/**
 * useSwitchTenant hook - switch between tenants
 */
export function useSwitchTenant() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: switchTenant,
    onSuccess: async (data) => {
      // Update tenant ID in API client
      // API returns { success: boolean; tenantId: string }, not a nested tenant object
      if (data?.tenantId) {
        api.setTenantId(data.tenantId);
      }

      // Clear all cached data (different tenant = different data)
      await queryClient.clear();

      // Refetch critical data
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.permissions() });

      // Force page reload to ensure clean state
      window.location.href = "/dashboard";
    },
  });

  const switchTo = useCallback(
    async (tenantId: string) => {
      return mutation.mutateAsync(tenantId);
    },
    [mutation]
  );

  return {
    switchTenant: switchTo,
    isPending: mutation.isPending,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
  };
}

/**
 * TenantFeatureGate component - conditionally render based on tenant feature
 */
interface TenantFeatureGateProps {
  feature: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function TenantFeatureGate({
  feature,
  fallback = null,
  children,
}: TenantFeatureGateProps) {
  const { isFeatureEnabled, isLoading } = useTenantSettings();

  if (isLoading) {
    return null;
  }

  return isFeatureEnabled(feature) ? <>{children}</> : <>{fallback}</>;
}

/**
 * Format date according to tenant settings
 */
export function useFormatDate() {
  const { settings } = useTenantSettings();

  return useCallback(
    (date: Date | string): string => {
      const d = typeof date === "string" ? new Date(date) : date;

      // Simple formatting - in production, use date-fns or similar
      const format = settings.dateFormat;

      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");

      return format
        .replace("YYYY", String(year))
        .replace("MM", month)
        .replace("DD", day);
    },
    [settings.dateFormat]
  );
}

/**
 * Format time according to tenant settings
 */
export function useFormatTime() {
  const { settings } = useTenantSettings();

  return useCallback(
    (date: Date | string): string => {
      const d = typeof date === "string" ? new Date(date) : date;

      const hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, "0");

      if (settings.timeFormat === "HH:mm") {
        return `${String(hours).padStart(2, "0")}:${minutes}`;
      }

      // 12-hour format
      const period = hours >= 12 ? "PM" : "AM";
      const hours12 = hours % 12 || 12;
      return `${hours12}:${minutes} ${period}`;
    },
    [settings.timeFormat]
  );
}

/**
 * Format currency according to tenant settings
 */
export function useFormatCurrency() {
  const { settings } = useTenantSettings();

  return useCallback(
    (amount: number): string => {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: settings.currency,
      }).format(amount);
    },
    [settings.currency]
  );
}
