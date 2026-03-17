/**
 * Integrations Data Hook
 *
 * Encapsulates all data fetching (queries) and mutations for the
 * integrations management page. Merges the static provider catalog
 * with backend integration data.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "~/components/ui";
import { api } from "~/lib/api-client";
import type {
  IntegrationResponse,
  IntegrationListResponse,
  MergedIntegration,
} from "./types";
import { PROVIDER_CATALOG } from "./types";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useIntegrations() {
  const toast = useToast();
  const queryClient = useQueryClient();

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  const {
    data: integrationsData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["admin-integrations"],
    queryFn: async () => {
      return api.get<IntegrationListResponse>("/integrations?limit=100");
    },
  });

  const connectedIntegrations = integrationsData?.items ?? [];

  // Build a map of provider -> integration response for quick lookup
  const integrationsByProvider = new Map<string, IntegrationResponse>();
  for (const integration of connectedIntegrations) {
    integrationsByProvider.set(integration.provider, integration);
  }

  // Merge catalog with backend data: catalog entries always show,
  // backend entries that are not in the catalog also show
  const mergedIntegrations: MergedIntegration[] = PROVIDER_CATALOG.map(
    (catalogEntry) => {
      const backendEntry = integrationsByProvider.get(catalogEntry.provider);
      return {
        provider: catalogEntry.provider,
        name: backendEntry?.name ?? catalogEntry.name,
        description: backendEntry?.description ?? catalogEntry.description,
        category: backendEntry?.category ?? catalogEntry.category,
        icon: catalogEntry.icon,
        status: (backendEntry?.status ?? "disconnected") as
          | "connected"
          | "disconnected"
          | "error",
        lastSyncAt: backendEntry?.last_sync_at ?? null,
        errorMessage: backendEntry?.error_message ?? null,
        backendId: backendEntry?.id ?? null,
      };
    }
  );

  const connectedCount = mergedIntegrations.filter(
    (i) => i.status === "connected"
  ).length;
  const errorCount = mergedIntegrations.filter(
    (i) => i.status === "error"
  ).length;

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const connectMutation = useMutation({
    mutationFn: (data: {
      provider: string;
      name: string;
      description?: string;
      category: string;
      config?: { api_key?: string; api_secret?: string; webhook_url?: string };
      webhook_url?: string;
    }) => api.post<IntegrationResponse>("/integrations/connect", data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-integrations"] });
      toast.success(`${variables.name} has been connected successfully.`);
    },
    onError: (err) => {
      toast.error(
        `Failed to connect integration: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<IntegrationResponse>(`/integrations/${id}/disconnect`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-integrations"] });
    },
    onError: (err) => {
      toast.error(
        `Failed to disconnect: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: (data: {
      id: string;
      config?: { api_key?: string; api_secret?: string; webhook_url?: string };
      webhook_url?: string;
    }) => {
      const { id, ...body } = data;
      return api.patch<IntegrationResponse>(`/integrations/${id}/config`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-integrations"] });
      toast.success("Integration configuration updated successfully.");
    },
    onError: (err) => {
      toast.error(
        `Failed to update configuration: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    },
  });

  function retryFetch() {
    queryClient.invalidateQueries({ queryKey: ["admin-integrations"] });
  }

  return {
    // Query data
    mergedIntegrations,
    integrationsByProvider,
    isLoading,
    isError,
    error,
    connectedCount,
    errorCount,
    retryFetch,

    // Mutations
    connectMutation,
    disconnectMutation,
    updateConfigMutation,
  };
}
