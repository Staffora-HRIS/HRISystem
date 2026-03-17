/**
 * Pay Schedule Table
 *
 * Displays the week-by-week statutory pay breakdown for a family leave
 * entitlement, with empty state and loading handling.
 */

import { PoundSterling, RefreshCw } from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "~/components/ui";
import type { PayPeriod, PayScheduleData } from "./types";
import { formatDate, formatCurrency, RATE_TYPE_LABELS } from "./types";

interface PayScheduleTableProps {
  paySchedule: PayScheduleData | undefined;
  periods: PayPeriod[];
  isLoading: boolean;
  onCalculatePay: () => void;
  isCalculating: boolean;
}

export function PayScheduleTable({
  paySchedule,
  periods,
  isLoading,
  onCalculatePay,
  isCalculating,
}: PayScheduleTableProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Pay Schedule
          </h2>
          {paySchedule && (
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span>
                {paySchedule.paid_weeks} paid /{" "}
                {paySchedule.unpaid_weeks} unpaid weeks
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                Total: {formatCurrency(paySchedule.total_statutory_pay)}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : periods.length === 0 ? (
          <div className="py-8 text-center">
            <PoundSterling className="mx-auto mb-3 h-10 w-10 text-gray-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No pay schedule generated yet.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onCalculatePay}
              disabled={isCalculating}
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              {isCalculating ? "Calculating..." : "Generate Pay Schedule"}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Week</TableHeader>
                  <TableHeader>Start Date</TableHeader>
                  <TableHeader>End Date</TableHeader>
                  <TableHeader>Rate Type</TableHeader>
                  <TableHeader className="text-right">Amount</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {periods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {period.week_number}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(period.start_date)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(period.end_date)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          period.rate_type === "earnings_related"
                            ? "info"
                            : period.rate_type === "flat_rate"
                              ? "primary"
                              : "default"
                        }
                      >
                        {RATE_TYPE_LABELS[period.rate_type] ||
                          period.rate_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {period.amount > 0
                          ? formatCurrency(period.amount)
                          : "-"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
