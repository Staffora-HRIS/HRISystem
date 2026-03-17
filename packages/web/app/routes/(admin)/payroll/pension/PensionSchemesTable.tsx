/**
 * Pension Schemes Table
 *
 * Displays the list of pension schemes with name, provider, type,
 * contribution percentages, and status. Includes loading, error,
 * and empty states.
 */

import { Plus, Building2, AlertTriangle } from "lucide-react";
import { Card, CardBody, Badge, Button } from "~/components/ui";
import type { PensionScheme } from "./types";
import { formatPct, formatSchemeType, getSchemeBadgeVariant } from "./types";

interface PensionSchemesTableProps {
  schemes: PensionScheme[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onCreateScheme: () => void;
}

export function PensionSchemesTable({
  schemes,
  isLoading,
  isError,
  onRetry,
  onCreateScheme,
}: PensionSchemesTableProps) {
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Pension Schemes
        </h2>
        <Button onClick={onCreateScheme}>
          <Plus className="mr-2 h-4 w-4" />
          Create Scheme
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading pension schemes...
          </CardBody>
        </Card>
      ) : isError ? (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-error-600 dark:text-error-400">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>Failed to load pension schemes.</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </CardBody>
        </Card>
      ) : schemes.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
              No pension schemes
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Create your first pension scheme to start auto-enrolment.
            </p>
            <Button className="mt-4" onClick={onCreateScheme}>
              <Plus className="mr-2 h-4 w-4" />
              Create Scheme
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Provider
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Type
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Employer %
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Employee %
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {schemes.map((scheme) => (
                  <tr
                    key={scheme.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {scheme.name}
                        </span>
                        {scheme.is_default && (
                          <Badge variant="primary" size="sm">
                            Default
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {scheme.provider}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {formatSchemeType(scheme.scheme_type)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-gray-900 dark:text-white">
                      {formatPct(scheme.employer_contribution_pct)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-gray-900 dark:text-white">
                      {formatPct(scheme.employee_contribution_pct)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <Badge
                        variant={getSchemeBadgeVariant(scheme.status)}
                        size="sm"
                        dot
                        rounded
                      >
                        {scheme.status.charAt(0).toUpperCase() +
                          scheme.status.slice(1)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
