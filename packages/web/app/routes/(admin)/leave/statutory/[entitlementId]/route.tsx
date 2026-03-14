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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Baby,
  Calendar,
  CheckCircle,
  FileText,
  PoundSterling,
  Scissors,
  AlertTriangle,
  Plus,
  ClipboardCheck,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  type BadgeVariant,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Select,
  Textarea,
  useToast,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PayPeriod {
  id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  rate_type: string;
  amount: number;
}

interface KITDay {
  id: string;
  leave_record_id: string;
  work_date: string;
  hours_worked: number;
  notes: string | null;
  created_at: string;
}

interface Notice {
  id: string;
  leave_record_id: string;
  employee_id: string;
  notice_type: string;
  notice_date: string;
  received_date: string | null;
  acknowledged_by: string | null;
  acknowledged_date: string | null;
  document_reference: string | null;
  notes: string | null;
  created_at: string;
}

interface EntitlementDetail {
  id: string;
  tenant_id: string;
  employee_id: string;
  leave_type: "maternity" | "paternity" | "shared_parental" | "adoption";
  expected_date: string;
  actual_date: string | null;
  start_date: string;
  end_date: string;
  total_weeks: number;
  status: "planned" | "active" | "completed" | "cancelled";
  average_weekly_earnings: number | null;
  qualifies_for_statutory_pay: boolean;
  earnings_above_lel: boolean;
  notice_given_date: string | null;
  qualifying_week: string | null;
  matb1_received: boolean;
  matb1_date: string | null;
  partner_employee_id: string | null;
  curtailment_date: string | null;
  paternity_block_number: number | null;
  spl_weeks_available: number | null;
  spl_pay_weeks_available: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  kit_days_used?: number;
  kit_days_remaining?: number;
  pay_periods?: PayPeriod[];
  kit_days?: KITDay[];
  notices?: Notice[];
}

interface PayScheduleData {
  leave_record_id: string;
  leave_type: string;
  total_weeks: number;
  paid_weeks: number;
  unpaid_weeks: number;
  total_statutory_pay: number;
  periods: PayPeriod[];
}

interface EligibilityData {
  employee_id: string;
  leave_type: string;
  eligible: boolean;
  continuous_service_weeks: number;
  required_weeks: number;
  qualifying_week: string | null;
  earnings_above_lel: boolean | null;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAVE_TYPE_LABELS: Record<string, string> = {
  maternity: "Maternity",
  paternity: "Paternity",
  shared_parental: "Shared Parental",
  adoption: "Adoption",
};

const STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  planned: "secondary",
  active: "success",
  completed: "default",
  cancelled: "error",
};

const STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const RATE_TYPE_LABELS: Record<string, string> = {
  earnings_related: "90% of AWE",
  flat_rate: "Flat Rate",
  nil: "Unpaid",
};

const NOTICE_TYPE_LABELS: Record<string, string> = {
  maternity_notification: "Maternity Notification",
  maternity_leave_dates: "Maternity Leave Dates",
  maternity_return_early: "Early Return Notice",
  matb1_certificate: "MATB1 Certificate",
  paternity_notification: "Paternity Notification",
  spl_opt_in: "ShPL Opt-in Notice",
  spl_period_of_leave: "ShPL Period of Leave Notice",
  spl_curtailment: "Curtailment Notice",
  adoption_notification: "Adoption Notification",
  adoption_matching_cert: "Matching Certificate",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const familyLeaveKeys = {
  all: () => ["family-leave"] as const,
  entitlement: (id: string) =>
    [...familyLeaveKeys.all(), "entitlement", id] as const,
  paySchedule: (id: string) =>
    [...familyLeaveKeys.all(), "pay-schedule", id] as const,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FamilyLeaveEntitlementDetailPage() {
  const { entitlementId } = useParams<{ entitlementId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  // -- Modal state --
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [showKitDayModal, setShowKitDayModal] = useState(false);
  const [showCurtailModal, setShowCurtailModal] = useState(false);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [eligibilityResult, setEligibilityResult] =
    useState<EligibilityData | null>(null);

  // -- KIT day form state --
  const [kitDate, setKitDate] = useState("");
  const [kitHours, setKitHours] = useState("");
  const [kitNotes, setKitNotes] = useState("");

  // -- Curtail form state --
  const [curtailDate, setCurtailDate] = useState("");

  // -- Notice form state --
  const [noticeType, setNoticeType] = useState("");
  const [noticeDate, setNoticeDate] = useState("");
  const [noticeRef, setNoticeRef] = useState("");
  const [noticeNotes, setNoticeNotes] = useState("");

  // -- Entitlement detail query --
  const {
    data: entitlement,
    isLoading,
    isError,
    error: fetchError,
  } = useQuery({
    queryKey: familyLeaveKeys.entitlement(entitlementId!),
    queryFn: () =>
      api.get<EntitlementDetail>(
        `/family-leave/entitlements/${entitlementId}`
      ),
    enabled: !!entitlementId,
  });

  // -- Pay schedule query --
  const { data: paySchedule, isLoading: payScheduleLoading } = useQuery({
    queryKey: familyLeaveKeys.paySchedule(entitlementId!),
    queryFn: () =>
      api.get<PayScheduleData>(
        `/family-leave/entitlements/${entitlementId}/pay-schedule`
      ),
    enabled: !!entitlementId,
  });

  // -- Check eligibility mutation --
  const eligibilityMutation = useMutation({
    mutationFn: () =>
      api.post<EligibilityData>(
        `/family-leave/entitlements/${entitlementId}/check-eligibility`,
        { leave_type: entitlement?.leave_type }
      ),
    onSuccess: (data) => {
      setEligibilityResult(data);
      setShowEligibilityModal(true);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to check eligibility.";
      toast.error(message);
    },
  });

  // -- Calculate pay mutation --
  const calculatePayMutation = useMutation({
    mutationFn: () =>
      api.post(
        `/family-leave/entitlements/${entitlementId}/calculate-pay`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: familyLeaveKeys.entitlement(entitlementId!),
      });
      queryClient.invalidateQueries({
        queryKey: familyLeaveKeys.paySchedule(entitlementId!),
      });
      toast.success("Statutory pay calculated successfully");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to calculate statutory pay.";
      toast.error(message);
    },
  });

  // -- Record KIT day mutation --
  const kitDayMutation = useMutation({
    mutationFn: (payload: {
      work_date: string;
      hours_worked: number;
      notes?: string;
    }) =>
      api.post(
        `/family-leave/entitlements/${entitlementId}/kit-day`,
        payload
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: familyLeaveKeys.entitlement(entitlementId!),
      });
      toast.success("KIT day recorded");
      setShowKitDayModal(false);
      setKitDate("");
      setKitHours("");
      setKitNotes("");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to record KIT day.";
      toast.error(message);
    },
  });

  // -- Curtail mutation --
  const curtailMutation = useMutation({
    mutationFn: (payload: { curtailment_date: string }) =>
      api.patch(
        `/family-leave/entitlements/${entitlementId}/curtail`,
        payload
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: familyLeaveKeys.entitlement(entitlementId!),
      });
      queryClient.invalidateQueries({
        queryKey: familyLeaveKeys.paySchedule(entitlementId!),
      });
      toast.success("Leave curtailed for shared parental leave");
      setShowCurtailModal(false);
      setCurtailDate("");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to curtail leave.";
      toast.error(message);
    },
  });

  // -- Record notice mutation --
  const noticeMutation = useMutation({
    mutationFn: (payload: {
      notice_type: string;
      notice_date: string;
      document_reference?: string;
      notes?: string;
    }) =>
      api.post(
        `/family-leave/entitlements/${entitlementId}/notices`,
        payload
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: familyLeaveKeys.entitlement(entitlementId!),
      });
      toast.success("Notice recorded");
      setShowNoticeModal(false);
      setNoticeType("");
      setNoticeDate("");
      setNoticeRef("");
      setNoticeNotes("");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to record notice.";
      toast.error(message);
    },
  });

  // -- Event handlers --
  function handleRecordKitDay(e: React.FormEvent) {
    e.preventDefault();
    if (!kitDate || !kitHours) {
      toast.error("Please fill in the date and hours.");
      return;
    }
    kitDayMutation.mutate({
      work_date: kitDate,
      hours_worked: parseFloat(kitHours),
      notes: kitNotes || undefined,
    });
  }

  function handleCurtail(e: React.FormEvent) {
    e.preventDefault();
    if (!curtailDate) {
      toast.error("Please enter a curtailment date.");
      return;
    }
    curtailMutation.mutate({ curtailment_date: curtailDate });
  }

  function handleRecordNotice(e: React.FormEvent) {
    e.preventDefault();
    if (!noticeType || !noticeDate) {
      toast.error("Please fill in all required fields.");
      return;
    }
    noticeMutation.mutate({
      notice_type: noticeType,
      notice_date: noticeDate,
      document_reference: noticeRef || undefined,
      notes: noticeNotes || undefined,
    });
  }

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

  const kitDays = entitlement.kit_days ?? [];
  const notices = entitlement.notices ?? [];
  const periods = paySchedule?.periods ?? entitlement.pay_periods ?? [];
  const canCurtail =
    (entitlement.leave_type === "maternity" ||
      entitlement.leave_type === "adoption") &&
    entitlement.status === "active" &&
    !entitlement.curtailment_date;

  const kitDayMax =
    entitlement.leave_type === "shared_parental" ? 20 : 10;
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
            onClick={() => eligibilityMutation.mutate()}
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

      {/* Detail cards row */}
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

      {/* Additional info row for maternity / curtailment */}
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

      {/* Pay Schedule */}
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
          {payScheduleLoading ? (
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
                onClick={() => calculatePayMutation.mutate()}
                disabled={calculatePayMutation.isPending}
              >
                <RefreshCw className="mr-1 h-4 w-4" />
                {calculatePayMutation.isPending
                  ? "Calculating..."
                  : "Generate Pay Schedule"}
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

      {/* KIT/SPLIT Days */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {entitlement.leave_type === "shared_parental"
                ? "SPLIT Days"
                : "KIT Days"}
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {kitDaysUsed} of {kitDayMax} used
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowKitDayModal(true)}
                disabled={kitDaysRemaining <= 0}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {kitDays.length === 0 ? (
            <div className="py-8 text-center">
              <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-gray-400" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No{" "}
                {entitlement.leave_type === "shared_parental"
                  ? "SPLIT"
                  : "KIT"}{" "}
                days recorded yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Date</TableHeader>
                    <TableHeader>Hours Worked</TableHeader>
                    <TableHeader>Notes</TableHeader>
                    <TableHeader>Recorded</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {kitDays.map((day) => (
                    <TableRow key={day.id}>
                      <TableCell>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {formatDate(day.work_date)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {day.hours_worked}h
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                          {day.notes || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(day.created_at)}
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

      {/* Notices */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Formal Notices
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNoticeModal(true)}
            >
              <Plus className="mr-1 h-4 w-4" />
              Record Notice
            </Button>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {notices.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-gray-400" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No formal notices recorded yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Notice Type</TableHeader>
                    <TableHeader>Notice Date</TableHeader>
                    <TableHeader>Received</TableHeader>
                    <TableHeader>Reference</TableHeader>
                    <TableHeader>Notes</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {notices.map((notice) => (
                    <TableRow key={notice.id}>
                      <TableCell>
                        <Badge variant="info">
                          {NOTICE_TYPE_LABELS[notice.notice_type] ||
                            notice.notice_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {formatDate(notice.notice_date)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {formatDate(notice.received_date)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                          {notice.document_reference || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                          {notice.notes || "-"}
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

      {/* Eligibility Result Modal */}
      {showEligibilityModal && eligibilityResult && (
        <Modal
          open
          onClose={() => {
            setShowEligibilityModal(false);
            setEligibilityResult(null);
          }}
          size="md"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Eligibility Check Result
            </h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {eligibilityResult.eligible ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                )}
                <div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {eligibilityResult.eligible ? "Eligible" : "Not Eligible"}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {LEAVE_TYPE_LABELS[eligibilityResult.leave_type] ||
                      eligibilityResult.leave_type}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Continuous Service
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {eligibilityResult.continuous_service_weeks} weeks
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Required
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {eligibilityResult.required_weeks} weeks
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Qualifying Week
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatDate(eligibilityResult.qualifying_week)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Earnings Above LEL
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {eligibilityResult.earnings_above_lel == null
                      ? "Unknown"
                      : eligibilityResult.earnings_above_lel
                        ? "Yes"
                        : "No"}
                  </p>
                </div>
              </div>

              {eligibilityResult.reasons.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Details
                  </p>
                  <ul className="space-y-1">
                    {eligibilityResult.reasons.map((reason, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
                      >
                        <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-400" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              onClick={() => {
                setShowEligibilityModal(false);
                setEligibilityResult(null);
              }}
            >
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Record KIT Day Modal */}
      {showKitDayModal && (
        <Modal
          open
          onClose={() => setShowKitDayModal(false)}
          size="md"
        >
          <form onSubmit={handleRecordKitDay}>
            <ModalHeader>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Record{" "}
                {entitlement.leave_type === "shared_parental"
                  ? "SPLIT"
                  : "KIT"}{" "}
                Day
              </h3>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {kitDaysRemaining} of {kitDayMax}{" "}
                  {entitlement.leave_type === "shared_parental"
                    ? "SPLIT"
                    : "KIT"}{" "}
                  days remaining.
                </p>
                <div>
                  <label
                    htmlFor="kit-date"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Work Date <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="kit-date"
                    type="date"
                    value={kitDate}
                    onChange={(e) => setKitDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="kit-hours"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Hours Worked <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="kit-hours"
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="24"
                    value={kitHours}
                    onChange={(e) => setKitHours(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="kit-notes"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Notes
                  </label>
                  <Textarea
                    id="kit-notes"
                    value={kitNotes}
                    onChange={(e) => setKitNotes(e.target.value)}
                    rows={2}
                    placeholder="Optional notes about the KIT day"
                  />
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setShowKitDayModal(false)}
                disabled={kitDayMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={kitDayMutation.isPending}>
                {kitDayMutation.isPending ? "Recording..." : "Record"}
              </Button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Curtail Modal */}
      {showCurtailModal && (
        <Modal
          open
          onClose={() => setShowCurtailModal(false)}
          size="md"
        >
          <form onSubmit={handleCurtail}>
            <ModalHeader>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Curtail{" "}
                {LEAVE_TYPE_LABELS[entitlement.leave_type] ||
                  entitlement.leave_type}{" "}
                Leave
              </h3>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div
                  className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20"
                  role="alert"
                >
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
                  <div className="text-sm text-yellow-700 dark:text-yellow-300">
                    <p className="font-medium">
                      Curtailing leave enables Shared Parental Leave
                    </p>
                    <p className="mt-1">
                      {entitlement.leave_type === "maternity"
                        ? "Maternity leave must retain a minimum 2-week compulsory period after birth."
                        : "Adoption leave can be curtailed to convert remaining entitlement to Shared Parental Leave."}
                    </p>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="curtail-date"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Curtailment Date <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="curtail-date"
                    type="date"
                    value={curtailDate}
                    onChange={(e) => setCurtailDate(e.target.value)}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    The date when{" "}
                    {LEAVE_TYPE_LABELS[
                      entitlement.leave_type
                    ]?.toLowerCase()}{" "}
                    leave will end. Remaining weeks convert to ShPL
                    entitlement.
                  </p>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setShowCurtailModal(false)}
                disabled={curtailMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={curtailMutation.isPending}
              >
                {curtailMutation.isPending
                  ? "Curtailing..."
                  : "Curtail Leave"}
              </Button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Record Notice Modal */}
      {showNoticeModal && (
        <Modal
          open
          onClose={() => setShowNoticeModal(false)}
          size="md"
        >
          <form onSubmit={handleRecordNotice}>
            <ModalHeader>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Record Formal Notice
              </h3>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="notice-type"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Notice Type <span className="text-red-500">*</span>
                  </label>
                  <Select
                    id="notice-type"
                    value={noticeType}
                    onChange={(e) => setNoticeType(e.target.value)}
                    options={[
                      { value: "", label: "Select notice type..." },
                      {
                        value: "maternity_notification",
                        label: "Maternity Notification",
                      },
                      {
                        value: "maternity_leave_dates",
                        label: "Maternity Leave Dates",
                      },
                      {
                        value: "maternity_return_early",
                        label: "Early Return Notice",
                      },
                      {
                        value: "matb1_certificate",
                        label: "MATB1 Certificate",
                      },
                      {
                        value: "paternity_notification",
                        label: "Paternity Notification (SC3)",
                      },
                      {
                        value: "spl_opt_in",
                        label: "ShPL Opt-in Notice",
                      },
                      {
                        value: "spl_period_of_leave",
                        label: "ShPL Period of Leave Notice",
                      },
                      {
                        value: "spl_curtailment",
                        label: "Curtailment Notice",
                      },
                      {
                        value: "adoption_notification",
                        label: "Adoption Notification",
                      },
                      {
                        value: "adoption_matching_cert",
                        label: "Matching Certificate",
                      },
                    ]}
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="notice-date"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Notice Date <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="notice-date"
                    type="date"
                    value={noticeDate}
                    onChange={(e) => setNoticeDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="notice-ref"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Document Reference
                  </label>
                  <Input
                    id="notice-ref"
                    value={noticeRef}
                    onChange={(e) => setNoticeRef(e.target.value)}
                    placeholder="e.g. MATB1-2026-001"
                  />
                </div>
                <div>
                  <label
                    htmlFor="notice-notes"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Notes
                  </label>
                  <Textarea
                    id="notice-notes"
                    value={noticeNotes}
                    onChange={(e) => setNoticeNotes(e.target.value)}
                    rows={2}
                    placeholder="Optional notes about this notice"
                  />
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => setShowNoticeModal(false)}
                disabled={noticeMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={noticeMutation.isPending}>
                {noticeMutation.isPending ? "Recording..." : "Record Notice"}
              </Button>
            </ModalFooter>
          </form>
        </Modal>
      )}
    </div>
  );
}
