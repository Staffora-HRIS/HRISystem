import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Link2,
  CheckCircle2,
  XCircle,
  Settings,
  ExternalLink,
  RefreshCw,
  Shield,
  CreditCard,
  MessageSquare,
  FileSignature,
  Briefcase,
  Calendar,
  Search,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Skeleton,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

// =============================================================================
// Types
// =============================================================================

interface IntegrationResponse {
  id: string;
  tenant_id: string;
  provider: string;
  name: string;
  description: string | null;
  category: string;
  status: "connected" | "disconnected" | "error";
  last_sync_at: string | null;
  error_message: string | null;
  webhook_url: string | null;
  enabled: boolean;
  connected_at: string | null;
  connected_by: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
}

interface IntegrationListResponse {
  items: IntegrationResponse[];
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Known provider definitions with display metadata */
const PROVIDER_CATALOG = [
  {
    provider: "azure-ad",
    name: "Azure Active Directory",
    description: "Single sign-on and user provisioning with Microsoft Azure AD",
    category: "Identity & SSO",
    icon: Shield,
  },
  {
    provider: "okta",
    name: "Okta",
    description: "Enterprise identity and access management",
    category: "Identity & SSO",
    icon: Shield,
  },
  {
    provider: "sage",
    name: "Sage Payroll",
    description: "Payroll and HR data synchronisation with Sage",
    category: "Payroll",
    icon: CreditCard,
  },
  {
    provider: "xero",
    name: "Xero Payroll",
    description: "Payroll processing and reporting integration",
    category: "Payroll",
    icon: CreditCard,
  },
  {
    provider: "slack",
    name: "Slack",
    description: "Send notifications and updates to Slack channels",
    category: "Communication",
    icon: MessageSquare,
  },
  {
    provider: "teams",
    name: "Microsoft Teams",
    description: "Integrate with Microsoft Teams for notifications",
    category: "Communication",
    icon: MessageSquare,
  },
  {
    provider: "docusign",
    name: "DocuSign",
    description: "Electronic signatures for HR documents",
    category: "E-Signature",
    icon: FileSignature,
  },
  {
    provider: "adobe-sign",
    name: "Adobe Sign",
    description: "Digital document signing and workflows",
    category: "E-Signature",
    icon: FileSignature,
  },
  {
    provider: "linkedin",
    name: "LinkedIn Recruiter",
    description: "Import candidates and sync job postings",
    category: "Recruiting",
    icon: Briefcase,
  },
  {
    provider: "indeed",
    name: "Indeed",
    description: "Post jobs and receive applications from Indeed",
    category: "Recruiting",
    icon: Briefcase,
  },
  {
    provider: "google-calendar",
    name: "Google Calendar",
    description: "Sync leave and events with Google Calendar",
    category: "Calendar",
    icon: Calendar,
  },
  {
    provider: "outlook-calendar",
    name: "Outlook Calendar",
    description: "Sync leave and events with Outlook Calendar",
    category: "Calendar",
    icon: Calendar,
  },
] as const;

const CATEGORIES = [
  "All",
  "Identity & SSO",
  "Payroll",
  "Communication",
  "E-Signature",
  "Recruiting",
  "Calendar",
];

const STATUS_CONFIG = {
  connected: {
    label: "Connected",
    variant: "success" as const,
    icon: CheckCircle2,
  },
  disconnected: {
    label: "Not Connected",
    variant: "secondary" as const,
    icon: XCircle,
  },
  error: {
    label: "Error",
    variant: "error" as const,
    icon: AlertTriangle,
  },
};

/** Map provider key to its catalog metadata, or build a fallback from the API response */
function getProviderMeta(provider: string) {
  return PROVIDER_CATALOG.find((p) => p.provider === provider);
}

/** Format a relative time string from an ISO date */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}

// =============================================================================
// Component
// =============================================================================

export default function AdminIntegrationsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<IntegrationResponse | null>(null);

  // Form fields for the configuration modal
  const [formApiKey, setFormApiKey] = useState("");
  const [formApiSecret, setFormApiSecret] = useState("");
  const [formWebhookUrl, setFormWebhookUrl] = useState("");

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

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
  const mergedIntegrations = PROVIDER_CATALOG.map((catalogEntry) => {
    const backendEntry = integrationsByProvider.get(catalogEntry.provider);
    return {
      provider: catalogEntry.provider,
      name: backendEntry?.name ?? catalogEntry.name,
      description: backendEntry?.description ?? catalogEntry.description,
      category: backendEntry?.category ?? catalogEntry.category,
      icon: catalogEntry.icon,
      status: (backendEntry?.status ?? "disconnected") as "connected" | "disconnected" | "error",
      lastSyncAt: backendEntry?.last_sync_at ?? null,
      errorMessage: backendEntry?.error_message ?? null,
      backendId: backendEntry?.id ?? null,
    };
  });

  // Filter by search and category
  const filteredIntegrations = mergedIntegrations.filter((integration) => {
    const matchesSearch =
      !search ||
      integration.name.toLowerCase().includes(search.toLowerCase()) ||
      (integration.description ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "All" || integration.category === category;
    return matchesSearch && matchesCategory;
  });

  const connectedCount = mergedIntegrations.filter((i) => i.status === "connected").length;
  const errorCount = mergedIntegrations.filter((i) => i.status === "error").length;

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

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
      closeConfigModal();
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
      toast.success(
        `${disconnectTarget?.name ?? "Integration"} has been disconnected.`
      );
      setDisconnectModalOpen(false);
      setDisconnectTarget(null);
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
      closeConfigModal();
    },
    onError: (err) => {
      toast.error(
        `Failed to update configuration: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function openConfigModal(provider: string) {
    setSelectedProvider(provider);
    setFormApiKey("");
    setFormApiSecret("");
    setFormWebhookUrl("");
    setConfigModalOpen(true);
  }

  function closeConfigModal() {
    if (!connectMutation.isPending && !updateConfigMutation.isPending) {
      setConfigModalOpen(false);
      setSelectedProvider(null);
      setFormApiKey("");
      setFormApiSecret("");
      setFormWebhookUrl("");
    }
  }

  function handleSaveConfig() {
    if (!selectedProvider) return;

    const catalogEntry = getProviderMeta(selectedProvider);
    const existingIntegration = integrationsByProvider.get(selectedProvider);

    const configPayload: { api_key?: string; api_secret?: string; webhook_url?: string } = {};
    if (formApiKey.trim()) configPayload.api_key = formApiKey.trim();
    if (formApiSecret.trim()) configPayload.api_secret = formApiSecret.trim();
    if (formWebhookUrl.trim()) configPayload.webhook_url = formWebhookUrl.trim();

    if (existingIntegration && existingIntegration.status === "connected") {
      // Update existing connected integration's config
      updateConfigMutation.mutate({
        id: existingIntegration.id,
        config: configPayload,
        webhook_url: formWebhookUrl.trim() || undefined,
      });
    } else {
      // Connect a new integration
      connectMutation.mutate({
        provider: selectedProvider,
        name: catalogEntry?.name ?? selectedProvider,
        description: catalogEntry?.description,
        category: catalogEntry?.category ?? "Other",
        config: configPayload,
        webhook_url: formWebhookUrl.trim() || undefined,
      });
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
    disconnectMutation.mutate(disconnectTarget.id);
  }

  const isSaving = connectMutation.isPending || updateConfigMutation.isPending;

  const selectedCatalogEntry = selectedProvider
    ? getProviderMeta(selectedProvider)
    : null;
  const selectedExisting = selectedProvider
    ? integrationsByProvider.get(selectedProvider)
    : null;
  const isEditMode = selectedExisting?.status === "connected";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Integrations</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Connect third-party services to extend your Staffora functionality
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Integrations</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {isLoading ? (
                  <Skeleton className="h-8 w-8 inline-block" />
                ) : (
                  mergedIntegrations.length
                )}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Connected</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {isLoading ? (
                  <Skeleton className="h-8 w-8 inline-block" />
                ) : (
                  connectedCount
                )}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
              {errorCount > 0 ? (
                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              ) : (
                <XCircle className="h-6 w-6 text-gray-600 dark:text-gray-400" />
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {errorCount > 0 ? "Errors" : "Available"}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {isLoading ? (
                  <Skeleton className="h-8 w-8 inline-block" />
                ) : errorCount > 0 ? (
                  errorCount
                ) : (
                  mergedIntegrations.length - connectedCount
                )}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Error banner */}
      {isError && (
        <Card>
          <CardBody className="flex items-center gap-3 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">
              Failed to load integrations{error instanceof Error ? `: ${error.message}` : ""}.
              Showing available integrations from the catalog.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["admin-integrations"] })
              }
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
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardBody className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div>
                      <Skeleton className="h-5 w-32 mb-1" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-8 flex-1 rounded" />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIntegrations.map((integration) => {
            const statusConfig = STATUS_CONFIG[integration.status];
            const StatusIcon = statusConfig.icon;
            const ProviderIcon = integration.icon;

            return (
              <Card key={integration.provider} className="hover:shadow-md transition-shadow">
                <CardBody className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                        <ProviderIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {integration.name}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {integration.category}
                        </p>
                      </div>
                    </div>
                    <Badge variant={statusConfig.variant}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusConfig.label}
                    </Badge>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {integration.description}
                  </p>

                  {integration.errorMessage && integration.status === "error" && (
                    <div className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md p-2">
                      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>{integration.errorMessage}</span>
                    </div>
                  )}

                  {integration.lastSyncAt && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <RefreshCw className="h-3 w-3" />
                      Last synced: {formatRelativeTime(integration.lastSyncAt)}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    {integration.status === "connected" ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => openConfigModal(integration.provider)}
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Configure
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisconnectClick(integration.provider)}
                          disabled={disconnectMutation.isPending}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        onClick={() => openConfigModal(integration.provider)}
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        Connect
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {!isLoading && filteredIntegrations.length === 0 && (
        <Card>
          <CardBody className="text-center py-12">
            <Link2 className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              No integrations found matching your criteria
            </p>
          </CardBody>
        </Card>
      )}

      {/* Configuration Modal */}
      <Modal open={configModalOpen} onClose={closeConfigModal} size="md">
        <ModalHeader>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditMode ? "Configure" : "Connect"} {selectedCatalogEntry?.name ?? selectedProvider}
          </h3>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {selectedCatalogEntry?.description}
          </p>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="integration-api-key"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                API Key / Client ID
              </label>
              <Input
                id="integration-api-key"
                placeholder="Enter your API key or Client ID"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label
                htmlFor="integration-api-secret"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                API Secret / Client Secret
              </label>
              <Input
                id="integration-api-secret"
                type="password"
                placeholder="Enter your API secret"
                value={formApiSecret}
                onChange={(e) => setFormApiSecret(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label
                htmlFor="integration-webhook-url"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Webhook URL (Optional)
              </label>
              <Input
                id="integration-webhook-url"
                placeholder="https://your-domain.com/webhook"
                value={formWebhookUrl}
                onChange={(e) => setFormWebhookUrl(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <ExternalLink className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-blue-800 dark:text-blue-300">Need help?</p>
                <p className="text-blue-700 dark:text-blue-400">
                  Visit the {selectedCatalogEntry?.name ?? selectedProvider} documentation for setup
                  instructions.
                </p>
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={closeConfigModal} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveConfig}
            disabled={isSaving}
            loading={isSaving}
          >
            {isSaving
              ? isEditMode
                ? "Saving..."
                : "Connecting..."
              : isEditMode
                ? "Save Configuration"
                : "Save & Connect"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Disconnect Confirmation Modal */}
      <Modal
        open={disconnectModalOpen}
        onClose={() => {
          if (!disconnectMutation.isPending) {
            setDisconnectModalOpen(false);
            setDisconnectTarget(null);
          }
        }}
        size="sm"
      >
        <ModalHeader>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Disconnect {disconnectTarget?.name}?
          </h3>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This will remove the connection and clear stored credentials for{" "}
            <strong>{disconnectTarget?.name}</strong>. You can reconnect at any time.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setDisconnectModalOpen(false);
              setDisconnectTarget(null);
            }}
            disabled={disconnectMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmDisconnect}
            disabled={disconnectMutation.isPending}
            loading={disconnectMutation.isPending}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
