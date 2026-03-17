/**
 * Pension Compliance Dashboard
 *
 * Displays compliance overview metric cards and a compliance rate
 * progress bar with contribution totals.
 */

import {
  Users,
  ShieldCheck,
  UserCheck,
  UserX,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Card, CardBody, Button } from "~/components/ui";
import type { ComplianceSummary } from "./types";
import { formatPence } from "./types";

interface PensionComplianceDashboardProps {
  compliance: ComplianceSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function PensionComplianceDashboard({
  compliance,
  isLoading,
  isError,
  onRetry,
}: PensionComplianceDashboardProps) {
  return (
    <section aria-label="Compliance overview">
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardBody className="animate-pulse">
                <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="mt-2 h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-error-600 dark:text-error-400">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>Failed to load compliance data.</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Total Employees
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {compliance?.total_employees ?? 0}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                <ShieldCheck className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Eligible
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {compliance?.eligible_count ?? 0}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                <UserCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Enrolled
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {compliance?.enrolled_count ?? 0}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <UserX className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Opted Out
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {compliance?.opted_out_count ?? 0}
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Pending Assessment
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {compliance?.postponed_count ?? 0}
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Compliance rate bar */}
      {compliance && !isError && (
        <Card className="mt-4">
          <CardBody>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Compliance Rate
              </span>
              <span className="font-bold text-gray-900 dark:text-white">
                {compliance.compliance_rate.toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full rounded-full transition-all ${
                  compliance.compliance_rate >= 90
                    ? "bg-green-500"
                    : compliance.compliance_rate >= 70
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
                style={{
                  width: `${Math.min(100, compliance.compliance_rate)}%`,
                }}
                role="progressbar"
                aria-valuenow={compliance.compliance_rate}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Compliance rate: ${compliance.compliance_rate.toFixed(1)}%`}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>
                Total contributions:{" "}
                {formatPence(
                  compliance.total_employer_contributions +
                    compliance.total_employee_contributions
                )}
              </span>
              <span>
                Employer: {formatPence(compliance.total_employer_contributions)}{" "}
                | Employee:{" "}
                {formatPence(compliance.total_employee_contributions)}
              </span>
            </div>
          </CardBody>
        </Card>
      )}
    </section>
  );
}
