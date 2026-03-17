/**
 * Integrations Management Page
 *
 * Connect third-party services to extend Staffora functionality.
 * Displays a filterable grid of available integrations with connect,
 * configure, and disconnect actions.
 */

import { useState } from "react";
import { Search, AlertTriangle } from "lucide-react";
import { Card, CardBody, Button, Input, useToast } from "~/components/ui";

import type { IntegrationResponse } from "./types";
import { CATEGORIES } from "./types";
import { useIntegrations } from "./use-integrations";
import { IntegrationStatsCards } from "./IntegrationStatsCards";
import { IntegrationGrid } from "./IntegrationGrid";
import { IntegrationConfigModal } from "./IntegrationConfigModal";
import { IntegrationDisconnectModal } from "./IntegrationDisconnectModal";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminIntegrationsPage() {
  const toast = useToast();

  // Filter state
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  // Modal state
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [disconnectTarget, setDisconnectTarget] =
    useState<IntegrationResponse | null>(null);

  // Data hook
  const {
    mergedIntegrations,
    integrationsByProvider,
    isLoading,
    isError,
    error,
    connectedCount,
    errorCount,
    retryFetch,
    connectMutation,
    disconnectMutation,
    updateConfigMutation,
  } = useIntegrations();

  // Filter by search and category
  const filteredIntegrations = mergedIntegrations.filter((integration) => {
    const matchesSearch =
      !search ||
      integration.name.toLowerCase().includes(search.toLowerCase()) ||
      (integration.description ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "All" || integration.category === category;
    return matchesSearch && matchesCategory;
  });

  // -- Handlers --

  function openConfigModal(provider: string) {
    setSelectedProvider(provider);
    setConfigModalOpen(true);
  }

  function closeConfigModal() {
    if (!connectMutation.isPending && !updateConfigMutation.isPending) {
      setConfigModalOpen(false);
      setSelectedProvider(null);
    }
  }

  function handleDisconnectClick(provider: string) {
    const integration = integrationsByProvider.get(provider);
    if (!integration) return;
    setDisconnectTarget(integration);
    setDisconnectModalOpen(true);
  }

  function handleConfirmDisconnect() {
    if (!disconnectTarget) return;
    disconnectMutation.mutate(disconnectTarget.id, {
      onSuccess: () => {
        toast.success(
          `${disconnectTarget.name ?? "Integration"} has been disconnected.`
        );
        setDisconnectModalOpen(false);
        setDisconnectTarget(null);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Integrations
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Connect third-party services to extend your Staffora functionality
        </p>
      </div>

      {/* Stats */}
      <IntegrationStatsCards
        totalCount={mergedIntegrations.length}
        connectedCount={connectedCount}
        errorCount={errorCount}
        isLoading={isLoading}
      />

      {/* Error banner */}
      {isError && (
        <Card>
          <CardBody className="flex items-center gap-3 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">
              Failed to load integrations
              {error instanceof Error ? `: ${error.message}` : ""}.
              Showing available integrations from the catalog.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={retryFetch}
            >
              Retry
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            aria-label="Search integrations"
          />
        </div>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter by category">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={category === cat ? "primary" : "outline"}
              size="sm"
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Integration Grid */}
      <IntegrationGrid
        integrations={filteredIntegrations}
        isLoading={isLoading}
        isDisconnecting={disconnectMutation.isPending}
        onConnect={openConfigModal}
        onConfigure={openConfigModal}
        onDisconnect={handleDisconnectClick}
      />

      {/* Configuration Modal */}
      {configModalOpen && selectedProvider && (
        <IntegrationConfigModal
          provider={selectedProvider}
          existingIntegration={integrationsByProvider.get(selectedProvider)}
          isConnecting={connectMutation.isPending}
          isUpdating={updateConfigMutation.isPending}
          onConnect={(data) => {
            connectMutation.mutate(data, {
              onSuccess: () => closeConfigModal(),
            });
          }}
          onUpdateConfig={(data) => {
            updateConfigMutation.mutate(data, {
              onSuccess: () => closeConfigModal(),
            });
          }}
          onClose={closeConfigModal}
        />
      )}

      {/* Disconnect Confirmation Modal */}
      {disconnectModalOpen && disconnectTarget && (
        <IntegrationDisconnectModal
          integrationName={disconnectTarget.name}
          isPending={disconnectMutation.isPending}
          onConfirm={handleConfirmDisconnect}
          onClose={() => {
            if (!disconnectMutation.isPending) {
              setDisconnectModalOpen(false);
              setDisconnectTarget(null);
            }
          }}
        />
      )}
    </div>
  );
}
