/**
 * Pension Enrolments Table
 *
 * Displays the list of pension enrolments with employee, scheme, status,
 * enrolment date, and opt-out deadline. Includes toolbar with assess,
 * auto-enrol, and re-enrolment actions, plus a status filter.
 */

import {
  ShieldCheck,
  UserCheck,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Card, CardBody, Badge, Button } from "~/components/ui";
import type { PensionEnrolment } from "./types";
import {
  formatDate,
  formatEnrolmentStatus,
  getEnrolmentBadgeVariant,
} from "./types";

interface PensionEnrolmentsTableProps {
  enrolments: PensionEnrolment[];
  isLoading: boolean;
  isError: boolean;
  statusFilter: string;
  isReEnrolling: boolean;
  onRetry: () => void;
  onStatusFilterChange: (value: string) => void;
  onAssessEmployee: () => void;
  onAutoEnrol: () => void;
  onTriggerReEnrolment: () => void;
}

export function PensionEnrolmentsTable({
  enrolments,
  isLoading,
  isError,
  statusFilter,
  isReEnrolling,
  onRetry,
  onStatusFilterChange,
  onAssessEmployee,
  onAutoEnrol,
  onTriggerReEnrolment,
}: PensionEnrolmentsTableProps) {
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Pension Enrolments
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onAssessEmployee}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Assess Employee
          </Button>
          <Button variant="outline" size="sm" onClick={onAutoEnrol}>
            <UserCheck className="mr-2 h-4 w-4" />
            Auto-Enrol
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onTriggerReEnrolment}
            disabled={isReEnrolling}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isReEnrolling ? "animate-spin" : ""}`}
            />
            {isReEnrolling ? "Processing..." : "Trigger Re-enrolment"}
          </Button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-4">
        <label
          htmlFor="enrolment-status-filter"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Filter by status
        </label>
        <select
          id="enrolment-status-filter"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option value="">All Statuses</option>
          <option value="eligible">Eligible</option>
          <option value="enrolled">Enrolled</option>
          <option value="opted_out">Opted Out</option>
          <option value="ceased">Ceased</option>
          <option value="re_enrolled">Re-enrolled</option>
          <option value="postponed">Postponed</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading enrolments...
          </CardBody>
        </Card>
      ) : isError ? (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-error-600 dark:text-error-400">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>Failed to load enrolments.</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </CardBody>
        </Card>
      ) : enrolments.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <UserCheck className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
              No enrolments found
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {statusFilter
                ? `No enrolments with status "${formatEnrolmentStatus(statusFilter as PensionEnrolment["status"])}". Try a different filter.`
                : "Assess and enrol employees to get started."}
            </p>
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
                    Employee
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Scheme
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Enrolment Date
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    Opt-out Deadline
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {enrolments.map((enrolment) => (
                  <tr
                    key={enrolment.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {enrolment.employee_name || enrolment.employee_id}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {enrolment.scheme_name || enrolment.scheme_id}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <Badge
                        variant={getEnrolmentBadgeVariant(enrolment.status)}
                        size="sm"
                        dot
                        rounded
                      >
                        {formatEnrolmentStatus(enrolment.status)}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(enrolment.enrolment_date)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(enrolment.opt_out_deadline)}
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
