/**
 * Portal Hooks
 *
 * Manages multi-portal navigation and access.
 * Features:
 * - usePortals() - get user's available portals
 * - useCurrentPortal() - get current portal context
 * - useSwitchPortal() - switch between portals
 * - usePortalNavigation() - get portal-specific navigation
 */

import { useMemo, useCallback, createContext, useContext, ReactNode, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router";
import { api } from "../lib/api-client";
import { queryKeys } from "../lib/query-client";
import { useSession } from "../lib/auth";

// =============================================================================
// Types
// =============================================================================

export type PortalType = "admin" | "manager" | "employee";

export interface Portal {
  portalId: string;
  portalCode: PortalType;
  portalName: string;
  basePath: string;
  isDefault: boolean;
  icon: string | null;
}

export interface PortalNavigationItem {
  id: string;
  label: string;
  path?: string;
  icon?: string;
  children?: PortalNavigationItem[];
}

interface AvailablePortalsResponse {
  portals: Portal[];
}

interface PortalNavigationResponse {
  navigation: PortalNavigationItem[];
}

interface SwitchPortalResponse {
  success: boolean;
  portal: {
    code: PortalType;
    name: string;
    basePath: string;
  } | null;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchAvailablePortals(): Promise<Portal[]> {
  const response = await api.get<AvailablePortalsResponse>("/portal/available");
  return response.portals ?? [];
}

async function fetchPortalNavigation(portalCode: PortalType): Promise<PortalNavigationItem[]> {
  const response = await api.get<PortalNavigationResponse>(`/portal/${portalCode}/navigation`);
  return response.navigation ?? [];
}

async function switchPortal(portalCode: PortalType): Promise<SwitchPortalResponse> {
  return api.post<SwitchPortalResponse>("/portal/switch", { portalCode });
}

// =============================================================================
// Context
// =============================================================================

interface PortalContextType {
  portals: Portal[];
  currentPortal: PortalType | null;
  currentPortalInfo: Portal | null;
  isLoading: boolean;
  error: Error | null;
  setCurrentPortal: (portal: PortalType) => void;
  navigation: PortalNavigationItem[];
  navigationLoading: boolean;
  hasPortalAccess: (portal: PortalType) => boolean;
  defaultPortal: Portal | null;
}

const PortalContext = createContext<PortalContextType | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface PortalProviderProps {
  children: ReactNode;
}

export function PortalProvider({ children }: PortalProviderProps) {
  const { isAuthenticated } = useSession();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Determine current portal from URL
  const currentPortalFromUrl = useMemo((): PortalType | null => {
    const path = location.pathname;
    if (path.startsWith("/admin")) return "admin";
    if (path.startsWith("/manager")) return "manager";
    if (path.startsWith("/ess")) return "employee";
    return null;
  }, [location.pathname]);

  const [currentPortal, setCurrentPortalState] = useState<PortalType | null>(
    currentPortalFromUrl
  );

  // Sync current portal with URL changes
  useEffect(() => {
    if (currentPortalFromUrl) {
      setCurrentPortalState(currentPortalFromUrl);
    }
  }, [currentPortalFromUrl]);

  // Fetch available portals
  const {
    data: portals = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.portal.available(),
    queryFn: fetchAvailablePortals,
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch navigation for current portal
  const {
    data: navigation = [],
    isLoading: navigationLoading,
  } = useQuery({
    queryKey: queryKeys.portal.navigation(currentPortal ?? "admin"),
    queryFn: () => fetchPortalNavigation(currentPortal ?? "admin"),
    enabled: isAuthenticated && !!currentPortal,
    staleTime: 10 * 60 * 1000,
  });

  // Switch portal mutation
  const switchMutation = useMutation({
    mutationFn: switchPortal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portal.available() });
    },
  });

  const setCurrentPortal = useCallback(
    (portal: PortalType) => {
      setCurrentPortalState(portal);
      switchMutation.mutate(portal);
    },
    [switchMutation]
  );

  const currentPortalInfo = useMemo(() => {
    return portals.find((p) => p.portalCode === currentPortal) ?? null;
  }, [portals, currentPortal]);

  const defaultPortal = useMemo(() => {
    return portals.find((p) => p.isDefault) ?? portals[0] ?? null;
  }, [portals]);

  const hasPortalAccess = useCallback(
    (portal: PortalType): boolean => {
      return portals.some((p) => p.portalCode === portal);
    },
    [portals]
  );

  const value: PortalContextType = {
    portals,
    currentPortal,
    currentPortalInfo,
    isLoading,
    error: error as Error | null,
    setCurrentPortal,
    navigation,
    navigationLoading,
    hasPortalAccess,
    defaultPortal,
  };

  return (
    <PortalContext.Provider value={value}>
      {children}
    </PortalContext.Provider>
  );
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Use the portal context
 */
export function usePortalContext(): PortalContextType {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error("usePortalContext must be used within a PortalProvider");
  }
  return context;
}

/**
 * Get user's available portals
 */
export function usePortals() {
  const { isAuthenticated } = useSession();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.portal.available(),
    queryFn: fetchAvailablePortals,
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
  });

  return {
    portals: data ?? [],
    isLoading,
    error,
    refetch,
  };
}

/**
 * Get current portal from context
 */
export function useCurrentPortal() {
  const { currentPortal, currentPortalInfo, isLoading } = usePortalContext();
  return { portal: currentPortal, portalInfo: currentPortalInfo, isLoading };
}

/**
 * Switch between portals
 */
export function useSwitchPortal() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setCurrentPortal } = usePortalContext();

  const mutation = useMutation({
    mutationFn: switchPortal,
    onSuccess: (data) => {
      if (data.portal) {
        setCurrentPortal(data.portal.code);
        queryClient.invalidateQueries({ queryKey: queryKeys.portal.available() });
        navigate(data.portal.basePath + "/dashboard");
      }
    },
  });

  return {
    switchPortal: mutation.mutate,
    isLoading: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Get navigation for current or specified portal
 */
export function usePortalNavigation(portalCode?: PortalType) {
  const { isAuthenticated } = useSession();
  const { currentPortal } = usePortalContext();

  const targetPortal = portalCode ?? currentPortal;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.portal.navigation(targetPortal ?? "admin"),
    queryFn: () => fetchPortalNavigation(targetPortal ?? "admin"),
    enabled: isAuthenticated && !!targetPortal,
    staleTime: 10 * 60 * 1000,
  });

  return {
    navigation: data ?? [],
    isLoading,
    error,
  };
}

/**
 * Check if user has access to a specific portal
 */
export function useHasPortalAccess(portal: PortalType): boolean {
  const { hasPortalAccess, isLoading } = usePortalContext();
  if (isLoading) return false;
  return hasPortalAccess(portal);
}

/**
 * Get the default portal for the user
 */
export function useDefaultPortal(): Portal | null {
  const { defaultPortal } = usePortalContext();
  return defaultPortal;
}

// =============================================================================
// Components
// =============================================================================

interface PortalGateProps {
  portal: PortalType | PortalType[];
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Only render if user has access to the specified portal(s)
 */
export function PortalGate({ portal, fallback = null, children }: PortalGateProps) {
  const { hasPortalAccess, isLoading } = usePortalContext();

  if (isLoading) {
    return null;
  }

  const portals = Array.isArray(portal) ? portal : [portal];
  const hasAccess = portals.some((p) => hasPortalAccess(p));

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// =============================================================================
// Query Key Extensions
// =============================================================================

// Extend query keys for portals
declare module "../lib/query-client" {
  interface QueryKeys {
    portal: {
      available: () => readonly ["portal", "available"];
      navigation: (portal: string) => readonly ["portal", "navigation", string];
    };
  }
}

// Add query keys if not already present
if (!queryKeys.portal) {
  (queryKeys as any).portal = {
    available: () => ["portal", "available"] as const,
    navigation: (portal: string) => ["portal", "navigation", portal] as const,
  };
}
