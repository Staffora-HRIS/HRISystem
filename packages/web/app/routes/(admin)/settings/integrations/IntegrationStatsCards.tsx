/**
 * Integration Stats Cards
 *
 * Displays summary statistics: total integrations, connected count,
 * and error/available count.
 */

import {
  Link2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Card, CardBody, Skeleton } from "~/components/ui";

interface IntegrationStatsCardsProps {
  totalCount: number;
  connectedCount: number;
  errorCount: number;
  isLoading: boolean;
}

export function IntegrationStatsCards({
  totalCount,
  connectedCount,
  errorCount,
  isLoading,
}: IntegrationStatsCardsProps) {
  return (
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
                totalCount
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
                totalCount - connectedCount
              )}
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
