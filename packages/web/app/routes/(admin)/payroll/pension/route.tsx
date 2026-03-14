/**
 * Pension Auto-Enrolment Management
 *
 * Manages UK workplace pension auto-enrolment (Pensions Act 2008):
 * - Compliance dashboard with key metrics
 * - Pension scheme management (CRUD)
 * - Enrolment management with eligibility assessment and auto-enrol actions
 * - Bulk re-enrolment trigger (3-year cycle)
 *
 * All monetary values from the API are in pence -- displayed as GBP pounds.
 */

import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Plus,
  Users,
  ShieldCheck,
  UserCheck,
  UserX,
  Clock,
  RefreshCw,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { Card, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "~/components/ui/modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { useToast } from "~/components/ui/toast";
import { api, ApiError } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

// ---------------------------------------------------------------------------
// Types (mirroring backend response schemas)
// ---------------------------------------------------------------------------

interface PensionScheme {
  id: string;
  tenant_id: string;
  name: string;
  provider: string;
  scheme_type: "defined_contribution" | "master_trust";
  employer_contribution_pct: number;
  employee_contribution_pct: number;
  qualifying_earnings_lower: number;
  qualifying_earnings_upper: number;
  is_default: boolean;
  status: "active" | "closed" | "suspended";
  created_at: string;
  updated_at: string;
}

interface PensionEnrolment {
  id: string;
  tenant_id: string;
  employee_id: string;
  scheme_id: string;
  worker_category:
    | "eligible_jobholder"
    | "non_eligible_jobholder"
    | "entitled_worker"
    | "not_applicable";
  status:
    | "eligible"
    | "enrolled"
    | "opted_out"
    | "ceased"
    | "re_enrolled"
    | "postponed";
  enrolment_date: string | null;
  opt_out_deadline: string | null;
  opted_out_at: string | null;
  opt_out_reason: string | null;
  re_enrolment_date: string | null;
  postponement_end_date: string | null;
  contributions_start_date: string | null;
  assessed_annual_earnings: number | null;
  assessed_age: number | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  scheme_name?: string;
}

interface ComplianceSummary {
  total_employees: number;
  eligible_count: number;
  enrolled_count: number;
  opted_out_count: number;
  postponed_count: number;
  ceased_count: number;
  re_enrolled_count: number;
  pending_re_enrolment_count: number;
  total_employer_contributions: number;
  total_employee_contributions: number;
  schemes_count: number;
  compliance_rate: number;
}

interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Form types
// ---------------------------------------------------------------------------

interface CreateSchemeForm {
  name: string;
  provider: string;
  scheme_type: "defined_contribution" | "master_trust";
  employer_contribution_pct: string;
  employee_contribution_pct: string;
  qualifying_earnings_lower: string;
  qualifying_earnings_upper: string;
  is_default: boolean;
}

const initialSchemeForm: CreateSchemeForm = {
  name: "",
  provider: "",
  scheme_type: "defined_contribution",
  employer_contribution_pct: "3",
  employee_contribution_pct: "5",
  qualifying_earnings_lower: "",
  qualifying_earnings_upper: "",
  is_default: false,
};

// ---------------------------------------------------------------------------
// Query keys (pension-specific, scoped under payroll)
// ---------------------------------------------------------------------------

const pensionKeys = {
  all: () => [...queryKeys.payroll.all(), "pension"] as const,
  schemes: () => [...pensionKeys.all(), "schemes"] as const,
  enrolments: (status?: string) =>
    [...pensionKeys.all(), "enrolments", status] as const,
  compliance: () => [...pensionKeys.all(), "compliance"] as const,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert pence (integer) to pounds with currency symbol */
function formatPence(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

/** Format a percentage value */
function formatPct(value: number): string {
  return `${value}%`;
}

/** Format a date string for display */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Enrolment status to badge variant mapping */
function getEnrolmentBadgeVariant(
  status: PensionEnrolment["status"]
): "info" | "success" | "warning" | "secondary" {
  switch (status) {
    case "eligible":
      return "info";
    case "enrolled":
    case "re_enrolled":
      return "success";
    case "opted_out":
      return "warning";
    case "ceased":
      return "secondary";
    case "postponed":
      return "info";
    default:
      return "secondary";
  }
}

/** Scheme status to badge variant mapping */
function getSchemeBadgeVariant(
  status: PensionScheme["status"]
): "success" | "secondary" | "warning" {
  switch (status) {
    case "active":
      return "success";
    case "closed":
      return "secondary";
    case "suspended":
      return "warning";
    default:
      return "secondary";
  }
}

/** Human-readable label for enrolment status */
function formatEnrolmentStatus(status: PensionEnrolment["status"]): string {
  switch (status) {
    case "eligible":
      return "Eligible";
    case "enrolled":
      return "Enrolled";
    case "opted_out":
      return "Opted Out";
    case "ceased":
      return "Ceased";
    case "re_enrolled":
      return "Re-enrolled";
    case "postponed":
      return "Postponed";
    default:
      return status;
  }
}

/** Human-readable label for scheme type */
function formatSchemeType(type: PensionScheme["scheme_type"]): string {
  switch (type) {
    case "defined_contribution":
      return "Defined Contribution";
    case "master_trust":
      return "Master Trust";
    default:
      return type;
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PensionManagementPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState("schemes");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateSchemeModal, setShowCreateSchemeModal] = useState(false);
  const [schemeForm, setSchemeForm] =
    useState<CreateSchemeForm>(initialSchemeForm);
  const [assessEmployeeId, setAssessEmployeeId] = useState("");
  const [showAssessModal, setShowAssessModal] = useState(false);
  const [enrolEmployeeId, setEnrolEmployeeId] = useState("");
  const [showEnrolModal, setShowEnrolModal] = useState(false);

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  const {
    data: compliance,
    isLoading: complianceLoading,
    isError: complianceError,
    refetch: refetchCompliance,
  } = useQuery({
    queryKey: pensionKeys.compliance(),
    queryFn: () => api.get<ComplianceSummary>("/pension/compliance"),
  });

  const {
    data: schemesData,
    isLoading: schemesLoading,
    isError: schemesError,
    refetch: refetchSchemes,
  } = useQuery({
    queryKey: pensionKeys.schemes(),
    queryFn: () =>
      api.get<PaginatedResponse<PensionScheme>>("/pension/schemes"),
  });

  const {
    data: enrolmentsData,
    isLoading: enrolmentsLoading,
    isError: enrolmentsError,
    refetch: refetchEnrolments,
  } = useQuery({
    queryKey: pensionKeys.enrolments(statusFilter || undefined),
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      const qs = params.toString();
      return api.get<PaginatedResponse<PensionEnrolment>>(
        `/pension/enrolments${qs ? `?${qs}` : ""}`
      );
    },
  });

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const createSchemeMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<PensionScheme>("/pension/schemes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pensionKeys.all() });
      toast.success("Pension scheme created successfully");
      setShowCreateSchemeModal(false);
      setSchemeForm(initialSchemeForm);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to create pension scheme";
      toast.error(message);
    },
  });

  const assessMutation = useMutation({
    mutationFn: (employeeId: string) =>
      api.post<Record<string, unknown>>(`/pension/assess/${employeeId}`),
    onSuccess: (data) => {
      toast.success(
        `Assessment complete. Worker category: ${(data as Record<string, unknown>).worker_category}`
      );
      queryClient.invalidateQueries({ queryKey: pensionKeys.all() });
      setShowAssessModal(false);
      setAssessEmployeeId("");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to assess employee eligibility";
      toast.error(message);
    },
  });

  const enrolMutation = useMutation({
    mutationFn: (employeeId: string) =>
      api.post<PensionEnrolment>(`/pension/enrol/${employeeId}`),
    onSuccess: () => {
      toast.success("Employee enrolled into pension scheme");
      queryClient.invalidateQueries({ queryKey: pensionKeys.all() });
      setShowEnrolModal(false);
      setEnrolEmployeeId("");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to enrol employee";
      toast.error(message);
    },
  });

  const reEnrolmentMutation = useMutation({
    mutationFn: () =>
      api.post<{ re_enrolled_count: number; skipped_count: number }>(
        "/pension/re-enrolment"
      ),
    onSuccess: (data) => {
      toast.success(
        `Re-enrolment complete: ${data.re_enrolled_count} re-enrolled, ${data.skipped_count} skipped`
      );
      queryClient.invalidateQueries({ queryKey: pensionKeys.all() });
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to trigger re-enrolment";
      toast.error(message);
    },
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleCreateSchemeSubmit = () => {
    if (!schemeForm.name.trim()) {
      toast.error("Scheme name is required");
      return;
    }
    if (!schemeForm.provider.trim()) {
      toast.error("Provider is required");
      return;
    }

    const employerPct = Number(schemeForm.employer_contribution_pct);
    const employeePct = Number(schemeForm.employee_contribution_pct);

    if (Number.isNaN(employerPct) || employerPct < 3) {
      toast.error("Employer contribution must be at least 3%");
      return;
    }
    if (Number.isNaN(employeePct) || employeePct < 0) {
      toast.error("Employee contribution must be 0% or more");
      return;
    }

    const payload: Record<string, unknown> = {
      name: schemeForm.name.trim(),
      provider: schemeForm.provider.trim(),
      scheme_type: schemeForm.scheme_type,
      employer_contribution_pct: employerPct,
      employee_contribution_pct: employeePct,
      is_default: schemeForm.is_default,
    };

    if (schemeForm.qualifying_earnings_lower) {
      payload.qualifying_earnings_lower = Number(
        schemeForm.qualifying_earnings_lower
      );
    }
    if (schemeForm.qualifying_earnings_upper) {
      payload.qualifying_earnings_upper = Number(
        schemeForm.qualifying_earnings_upper
      );
    }

    createSchemeMutation.mutate(payload);
  };

  const handleAssessSubmit = () => {
    const id = assessEmployeeId.trim();
    if (!id) {
      toast.error("Employee ID is required");
      return;
    }
    assessMutation.mutate(id);
  };

  const handleEnrolSubmit = () => {
    const id = enrolEmployeeId.trim();
    if (!id) {
      toast.error("Employee ID is required");
      return;
    }
    enrolMutation.mutate(id);
  };

  // Derived data
  const schemes = schemesData?.items ?? [];
  const enrolments = enrolmentsData?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Pension Auto-Enrolment
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage workplace pension schemes and auto-enrolment compliance
            (Pensions Act 2008)
          </p>
        </div>
      </div>

      {/* Compliance Dashboard Cards */}
      <section aria-label="Compliance overview">
        {complianceLoading ? (
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
        ) : complianceError ? (
          <Card>
            <CardBody className="flex items-center gap-3 text-sm text-error-600 dark:text-error-400">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <span>Failed to load compliance data.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchCompliance()}
              >
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
        {compliance && !complianceError && (
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

      {/* Tabs: Schemes and Enrolments */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
      >
        <TabsList>
          <TabsTrigger value="schemes">Schemes</TabsTrigger>
          <TabsTrigger value="enrolments">Enrolments</TabsTrigger>
        </TabsList>

        {/* Schemes Tab */}
        <TabsContent value="schemes">
          <div className="space-y-4">
            {/* Schemes toolbar */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Pension Schemes
              </h2>
              <Button onClick={() => setShowCreateSchemeModal(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Scheme
              </Button>
            </div>

            {/* Schemes table */}
            {schemesLoading ? (
              <Card>
                <CardBody className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                  Loading pension schemes...
                </CardBody>
              </Card>
            ) : schemesError ? (
              <Card>
                <CardBody className="flex items-center gap-3 text-sm text-error-600 dark:text-error-400">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <span>Failed to load pension schemes.</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchSchemes()}
                  >
                    Retry
                  </Button>
                </CardBody>
              </Card>
            ) : schemes.length === 0 ? (
              <Card>
                <CardBody className="py-12 text-center">
                  <Building2 className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                    No pension schemes
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Create your first pension scheme to start auto-enrolment.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => setShowCreateSchemeModal(true)}
                  >
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
        </TabsContent>

        {/* Enrolments Tab */}
        <TabsContent value="enrolments">
          <div className="space-y-4">
            {/* Enrolments toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Pension Enrolments
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAssessModal(true)}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Assess Employee
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEnrolModal(true)}
                >
                  <UserCheck className="mr-2 h-4 w-4" />
                  Auto-Enrol
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reEnrolmentMutation.mutate()}
                  disabled={reEnrolmentMutation.isPending}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${reEnrolmentMutation.isPending ? "animate-spin" : ""}`}
                  />
                  {reEnrolmentMutation.isPending
                    ? "Processing..."
                    : "Trigger Re-enrolment"}
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
                onChange={(e) => setStatusFilter(e.target.value)}
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

            {/* Enrolments table */}
            {enrolmentsLoading ? (
              <Card>
                <CardBody className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                  Loading enrolments...
                </CardBody>
              </Card>
            ) : enrolmentsError ? (
              <Card>
                <CardBody className="flex items-center gap-3 text-sm text-error-600 dark:text-error-400">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <span>Failed to load enrolments.</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchEnrolments()}
                  >
                    Retry
                  </Button>
                </CardBody>
              </Card>
            ) : enrolments.length === 0 ? (
              <Card>
                <CardBody className="py-12 text-center">
                  <UserCheck className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
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
                              {enrolment.employee_name ||
                                enrolment.employee_id}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                            {enrolment.scheme_name || enrolment.scheme_id}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <Badge
                              variant={getEnrolmentBadgeVariant(
                                enrolment.status
                              )}
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
        </TabsContent>
      </Tabs>

      {/* Create Scheme Modal */}
      {showCreateSchemeModal && (
        <Modal
          open
          onClose={() => {
            if (!createSchemeMutation.isPending) {
              setShowCreateSchemeModal(false);
              setSchemeForm(initialSchemeForm);
            }
          }}
          size="lg"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Create Pension Scheme
            </h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="scheme-name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Scheme Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="scheme-name"
                  type="text"
                  placeholder="e.g. Standard Workplace Pension"
                  value={schemeForm.name}
                  onChange={(e) =>
                    setSchemeForm({ ...schemeForm, name: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="scheme-provider"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Provider <span className="text-red-500">*</span>
                </label>
                <input
                  id="scheme-provider"
                  type="text"
                  placeholder="e.g. NEST, The People's Pension"
                  value={schemeForm.provider}
                  onChange={(e) =>
                    setSchemeForm({ ...schemeForm, provider: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="scheme-type"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Scheme Type
                </label>
                <select
                  id="scheme-type"
                  value={schemeForm.scheme_type}
                  onChange={(e) =>
                    setSchemeForm({
                      ...schemeForm,
                      scheme_type: e.target.value as CreateSchemeForm["scheme_type"],
                    })
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                >
                  <option value="defined_contribution">
                    Defined Contribution
                  </option>
                  <option value="master_trust">Master Trust</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="employer-pct"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Employer Contribution (%)
                    <span className="text-red-500"> *</span>
                  </label>
                  <input
                    id="employer-pct"
                    type="number"
                    min={3}
                    step="0.1"
                    placeholder="3"
                    value={schemeForm.employer_contribution_pct}
                    onChange={(e) =>
                      setSchemeForm({
                        ...schemeForm,
                        employer_contribution_pct: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Statutory minimum: 3%
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="employee-pct"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Employee Contribution (%)
                    <span className="text-red-500"> *</span>
                  </label>
                  <input
                    id="employee-pct"
                    type="number"
                    min={0}
                    step="0.1"
                    placeholder="5"
                    value={schemeForm.employee_contribution_pct}
                    onChange={(e) =>
                      setSchemeForm({
                        ...schemeForm,
                        employee_contribution_pct: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Total minimum (employer + employee): 8%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="qe-lower"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    QE Lower Limit (pence)
                  </label>
                  <input
                    id="qe-lower"
                    type="number"
                    min={0}
                    placeholder="624000"
                    value={schemeForm.qualifying_earnings_lower}
                    onChange={(e) =>
                      setSchemeForm({
                        ...schemeForm,
                        qualifying_earnings_lower: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Default: 624000 (£6,240)
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="qe-upper"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    QE Upper Limit (pence)
                  </label>
                  <input
                    id="qe-upper"
                    type="number"
                    min={1}
                    placeholder="5027000"
                    value={schemeForm.qualifying_earnings_upper}
                    onChange={(e) =>
                      setSchemeForm({
                        ...schemeForm,
                        qualifying_earnings_upper: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Default: 5027000 (£50,270)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="is-default"
                  type="checkbox"
                  checked={schemeForm.is_default}
                  onChange={(e) =>
                    setSchemeForm({
                      ...schemeForm,
                      is_default: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label
                  htmlFor="is-default"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Set as default scheme for auto-enrolment
                </label>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateSchemeModal(false);
                setSchemeForm(initialSchemeForm);
              }}
              disabled={createSchemeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSchemeSubmit}
              disabled={
                !schemeForm.name.trim() ||
                !schemeForm.provider.trim() ||
                !schemeForm.employer_contribution_pct ||
                !schemeForm.employee_contribution_pct ||
                createSchemeMutation.isPending
              }
            >
              {createSchemeMutation.isPending
                ? "Creating..."
                : "Create Scheme"}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Assess Employee Modal */}
      {showAssessModal && (
        <Modal
          open
          onClose={() => {
            if (!assessMutation.isPending) {
              setShowAssessModal(false);
              setAssessEmployeeId("");
            }
          }}
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Assess Employee Eligibility
            </h3>
          </ModalHeader>
          <ModalBody>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Assess an employee's auto-enrolment eligibility based on age and
              annualised earnings. The system will determine their worker
              category.
            </p>
            <div>
              <label
                htmlFor="assess-employee-id"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Employee ID <span className="text-red-500">*</span>
              </label>
              <input
                id="assess-employee-id"
                type="text"
                placeholder="Enter employee UUID"
                value={assessEmployeeId}
                onChange={(e) => setAssessEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAssessModal(false);
                setAssessEmployeeId("");
              }}
              disabled={assessMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssessSubmit}
              disabled={!assessEmployeeId.trim() || assessMutation.isPending}
            >
              {assessMutation.isPending ? "Assessing..." : "Assess"}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Auto-Enrol Modal */}
      {showEnrolModal && (
        <Modal
          open
          onClose={() => {
            if (!enrolMutation.isPending) {
              setShowEnrolModal(false);
              setEnrolEmployeeId("");
            }
          }}
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Auto-Enrol Employee
            </h3>
          </ModalHeader>
          <ModalBody>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Enrol an eligible jobholder into the default pension scheme. The
              employee must be aged 22 to State Pension age and earning above
              £10,000/year.
            </p>
            <div>
              <label
                htmlFor="enrol-employee-id"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Employee ID <span className="text-red-500">*</span>
              </label>
              <input
                id="enrol-employee-id"
                type="text"
                placeholder="Enter employee UUID"
                value={enrolEmployeeId}
                onChange={(e) => setEnrolEmployeeId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEnrolModal(false);
                setEnrolEmployeeId("");
              }}
              disabled={enrolMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEnrolSubmit}
              disabled={!enrolEmployeeId.trim() || enrolMutation.isPending}
            >
              {enrolMutation.isPending ? "Enrolling..." : "Enrol"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
