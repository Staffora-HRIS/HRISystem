/**
 * Family Leave Entitlement Detail Page
 *
 * Displays a single family leave entitlement with:
 * - Header: employee, leave type, status, dates
 * - Action buttons: eligibility check, calculate pay, record KIT day, curtail
 * - Pay schedule table (week-by-week breakdown)
 * - KIT/SPLIT days list
 * - Notices section (MATB1, SC3, etc.)
 *
 * Fetches from:
 * - GET /api/v1/family-leave/entitlements/:id
 * - GET /api/v1/family-leave/entitlements/:id/pay-schedule
 * Actions:
 * - POST /api/v1/family-leave/entitlements/:id/check-eligibility
 * - POST /api/v1/family-leave/entitlements/:id/calculate-pay
 * - POST /api/v1/family-leave/entitlements/:id/kit-day
 * - PATCH /api/v1/family-leave/entitlements/:id/curtail
 * - POST /api/v1/family-leave/entitlements/:id/notices
 */

export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  Baby,
  Calendar,
  CheckCircle,
  FileText,
  PoundSterling,
  Scissors,
  AlertTriangle,
  ClipboardCheck,
} from "lucide-react";
import { Card, CardHeader, CardBody, Badge, Button } from "~/components/ui";
import { ApiError } from "~/lib/api-client";
import {
  LEAVE_TYPE_LABELS,
  STATUS_BADGE_VARIANTS,
  STATUS_LABELS,
  formatDate,
  formatCurrency,
} from "./types";
import type { EligibilityData } from "./types";
import { useFamilyLeaveEntitlement } from "./use-family-leave-entitlement";
import { EntitlementDetailCards } from "./EntitlementDetailCards";
import { PayScheduleTable } from "./PayScheduleTable";
import { KitDaysTable } from "./KitDaysTable";
import { NoticesTable } from "./NoticesTable";
import { EligibilityResultModal } from "./EligibilityResultModal";
import { KitDayFormModal } from "./KitDayFormModal";
import { CurtailFormModal } from "./CurtailFormModal";
import { NoticeFormModal } from "./NoticeFormModal";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FamilyLeaveEntitlementDetailPage() {
  const { entitlementId } = useParams<{ entitlementId: string }>();
  const navigate = useNavigate();

  // -- Data hook --
  const {
    entitlement,
    isLoading,
    isError,
    fetchError,
    paySchedule,
    payScheduleLoading,
    eligibilityMutation,
    calculatePayMutation,
    kitDayMutation,
    curtailMutation,
    noticeMutation,
  } = useFamilyLeaveEntitlement(entitlementId);

  // -- Modal state --
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [showKitDayModal, setShowKitDayModal] = useState(false);
  const [showCurtailModal, setShowCurtailModal] = useState(false);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [eligibilityResult, setEligibilityResult] =
    useState<EligibilityData | null>(null);

  // -- Loading state --
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // -- Error state --
  if (isError || !entitlement) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => navigate("/admin/leave/statutory")}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Family Leave
        </button>
        <div className="text-center py-12" role="alert">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Entitlement not found
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            {fetchError instanceof ApiError
              ? fetchError.message
              : "The requested family leave entitlement could not be loaded."}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => navigate("/admin/leave/statutory")}
          >
            Return to List
          </Button>
        </div>
      </div>
    );
  }

  // -- Derived data --
  const kitDays = entitlement.kit_days ?? [];
  const notices = entitlement.notices ?? [];
  const periods = paySchedule?.periods ?? entitlement.pay_periods ?? [];
  const canCurtail =
    (entitlement.leave_type === "maternity" ||
      entitlement.leave_type === "adoption") &&
    entitlement.status === "active" &&
    !entitlement.curtailment_date;
  const isSharedParental = entitlement.leave_type === "shared_parental";

  const kitDayMax = isSharedParental ? 20 : 10;
  const kitDaysUsed = entitlement.kit_days_used ?? kitDays.length;
  const kitDaysRemaining =
    entitlement.kit_days_remaining ?? kitDayMax - kitDaysUsed;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={() => navigate("/admin/leave/statutory")}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Family Leave
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-pink-100 dark:bg-pink-900/30">
            <Baby className="h-7 w-7 text-pink-600 dark:text-pink-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {LEAVE_TYPE_LABELS[entitlement.leave_type] || entitlement.leave_type}{" "}
                Leave
              </h1>
              <Badge
                variant={
                  STATUS_BADGE_VARIANTS[entitlement.status] ?? "default"
                }
                dot
                rounded
              >
                {STATUS_LABELS[entitlement.status] || entitlement.status}
              </Badge>
            </div>
            <p className="mt-1 text-gray-600 dark:text-gray-400">
              Employee ID: {entitlement.employee_id}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(entitlement.start_date)} &ndash;{" "}
                {formatDate(entitlement.end_date)}
              </span>
              <span>{entitlement.total_weeks} weeks</span>
              {entitlement.average_weekly_earnings != null && (
                <span className="flex items-center gap-1">
                  <PoundSterling className="h-4 w-4" />
                  AWE: {formatCurrency(entitlement.average_weekly_earnings)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              eligibilityMutation.mutate(undefined, {
                onSuccess: (data) => {
                  setEligibilityResult(data);
                  setShowEligibilityModal(true);
                },
              });
            }}
            disabled={eligibilityMutation.isPending}
          >
            <CheckCircle className="mr-1 h-4 w-4" />
            {eligibilityMutation.isPending
              ? "Checking..."
              : "Check Eligibility"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => calculatePayMutation.mutate()}
            disabled={calculatePayMutation.isPending}
          >
            <PoundSterling className="mr-1 h-4 w-4" />
            {calculatePayMutation.isPending
              ? "Calculating..."
              : "Calculate Pay"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowKitDayModal(true)}
            disabled={kitDaysRemaining <= 0}
          >
            <ClipboardCheck className="mr-1 h-4 w-4" />
            Record KIT Day
          </Button>
          {canCurtail && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCurtailModal(true)}
            >
              <Scissors className="mr-1 h-4 w-4" />
              Curtail
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNoticeModal(true)}
          >
            <FileText className="mr-1 h-4 w-4" />
            Record Notice
          </Button>
        </div>
      </div>

      {/* Detail cards */}
      <EntitlementDetailCards
        entitlement={entitlement}
        kitDaysUsed={kitDaysUsed}
        kitDayMax={kitDayMax}
        kitDaysRemaining={kitDaysRemaining}
      />

      {/* Pay Schedule */}
      <PayScheduleTable
        paySchedule={paySchedule}
        periods={periods}
        isLoading={payScheduleLoading}
        onCalculatePay={() => calculatePayMutation.mutate()}
        isCalculating={calculatePayMutation.isPending}
      />

      {/* KIT/SPLIT Days */}
      <KitDaysTable
        kitDays={kitDays}
        kitDaysUsed={kitDaysUsed}
        kitDayMax={kitDayMax}
        kitDaysRemaining={kitDaysRemaining}
        isSharedParental={isSharedParental}
        onAddKitDay={() => setShowKitDayModal(true)}
      />

      {/* Notices */}
      <NoticesTable
        notices={notices}
        onAddNotice={() => setShowNoticeModal(true)}
      />

      {/* Notes */}
      {entitlement.notes && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Notes
            </h2>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
              {entitlement.notes}
            </p>
          </CardBody>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Modals                                                            */}
      {/* ================================================================= */}

      {showEligibilityModal && eligibilityResult && (
        <EligibilityResultModal
          result={eligibilityResult}
          onClose={() => {
            setShowEligibilityModal(false);
            setEligibilityResult(null);
          }}
        />
      )}

      {showKitDayModal && (
        <KitDayFormModal
          isSharedParental={isSharedParental}
          kitDaysRemaining={kitDaysRemaining}
          kitDayMax={kitDayMax}
          isPending={kitDayMutation.isPending}
          onSubmit={(payload) => {
            kitDayMutation.mutate(payload, {
              onSuccess: () => setShowKitDayModal(false),
            });
          }}
          onClose={() => setShowKitDayModal(false)}
        />
      )}

      {showCurtailModal && (
        <CurtailFormModal
          leaveType={entitlement.leave_type}
          isPending={curtailMutation.isPending}
          onSubmit={(payload) => {
            curtailMutation.mutate(payload, {
              onSuccess: () => setShowCurtailModal(false),
            });
          }}
          onClose={() => setShowCurtailModal(false)}
        />
      )}

      {showNoticeModal && (
        <NoticeFormModal
          isPending={noticeMutation.isPending}
          onSubmit={(payload) => {
            noticeMutation.mutate(payload, {
              onSuccess: () => setShowNoticeModal(false),
            });
          }}
          onClose={() => setShowNoticeModal(false)}
        />
      )}
    </div>
  );
}
