/**
 * Entitlement Detail Cards
 *
 * Displays summary metric cards for a family leave entitlement:
 * expected date, qualifying week, KIT days, statutory pay status,
 * plus optional maternity/curtailment/ShPL info.
 */

import { Card, CardBody, Badge } from "~/components/ui";
import type { EntitlementDetail } from "./types";
import { formatDate } from "./types";

interface EntitlementDetailCardsProps {
  entitlement: EntitlementDetail;
  kitDaysUsed: number;
  kitDayMax: number;
  kitDaysRemaining: number;
}

export function EntitlementDetailCards({
  entitlement,
  kitDaysUsed,
  kitDayMax,
  kitDaysRemaining,
}: EntitlementDetailCardsProps) {
  return (
    <>
      {/* Primary metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Expected Date
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {formatDate(entitlement.expected_date)}
            </p>
            {entitlement.actual_date && (
              <p className="mt-0.5 text-xs text-gray-500">
                Actual: {formatDate(entitlement.actual_date)}
              </p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Qualifying Week
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {formatDate(entitlement.qualifying_week)}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              KIT Days
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {kitDaysUsed} / {kitDayMax}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {kitDaysRemaining} remaining
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Statutory Pay
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {entitlement.qualifies_for_statutory_pay ? (
                <Badge variant="success">Eligible</Badge>
              ) : (
                <Badge variant="secondary">Not Eligible</Badge>
              )}
            </p>
            {!entitlement.earnings_above_lel && (
              <p className="mt-0.5 text-xs text-yellow-600 dark:text-yellow-400">
                Earnings below LEL
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Additional info row for maternity / curtailment / ShPL */}
      {(entitlement.matb1_received ||
        entitlement.curtailment_date ||
        entitlement.spl_weeks_available != null) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {entitlement.leave_type === "maternity" && (
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  MATB1 Certificate
                </p>
                <p className="mt-1">
                  {entitlement.matb1_received ? (
                    <Badge variant="success">Received</Badge>
                  ) : (
                    <Badge variant="warning">Not Received</Badge>
                  )}
                </p>
                {entitlement.matb1_date && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    Date: {formatDate(entitlement.matb1_date)}
                  </p>
                )}
              </CardBody>
            </Card>
          )}
          {entitlement.curtailment_date && (
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Curtailment Date
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {formatDate(entitlement.curtailment_date)}
                </p>
              </CardBody>
            </Card>
          )}
          {entitlement.spl_weeks_available != null && (
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  ShPL Available
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {entitlement.spl_weeks_available} weeks leave
                </p>
                {entitlement.spl_pay_weeks_available != null && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {entitlement.spl_pay_weeks_available} weeks paid
                  </p>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
