/**
 * Integration Grid
 *
 * Displays a filterable grid of integration cards showing provider
 * name, description, status, last sync time, and connect/configure
 * actions.
 */

import {
  Link2,
  Settings,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Card, CardBody, Badge, Skeleton, Button } from "~/components/ui";
import type { MergedIntegration } from "./types";
import { STATUS_CONFIG, formatRelativeTime } from "./types";

interface IntegrationGridProps {
  integrations: MergedIntegration[];
  isLoading: boolean;
  isDisconnecting: boolean;
  onConnect: (provider: string) => void;
  onConfigure: (provider: string) => void;
  onDisconnect: (provider: string) => void;
}

export function IntegrationGrid({
  integrations,
  isLoading,
  isDisconnecting,
  onConnect,
  onConfigure,
  onDisconnect,
}: IntegrationGridProps) {
  if (isLoading) {
    return (
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
    );
  }

  if (integrations.length === 0) {
    return (
      <Card>
        <CardBody className="text-center py-12">
          <Link2 className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            No integrations found matching your criteria
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {integrations.map((integration) => {
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
                      onClick={() => onConfigure(integration.provider)}
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      Configure
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDisconnect(integration.provider)}
                      disabled={isDisconnecting}
                    >
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    onClick={() => onConnect(integration.provider)}
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
  );
}
