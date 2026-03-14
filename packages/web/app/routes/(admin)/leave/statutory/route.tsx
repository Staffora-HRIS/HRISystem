/**
 * Family / Statutory Leave Management Page
 *
 * Dashboard and list view for managing UK family leave entitlements:
 * maternity, paternity, shared parental, and adoption leave.
 *
 * Fetches data from GET /api/v1/family-leave/entitlements
 * and GET /api/v1/family-leave/dashboard
 */

export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Baby,
  Search,
  Users,
  Clock,
  CalendarCheck,
  AlertTriangle,
  Plus,
  PoundSterling,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntitlementListItem {
  id: string;
  employee_id: string;
  employee_name: string | null;
  employee_number: string | null;
  leave_type: "maternity" | "paternity" | "shared_parental" | "adoption";
  expected_date: string;
  start_date: string;
  end_date: string;
  total_weeks: number;
  status: "planned" | "active" | "completed" | "cancelled";
  kit_days_used: number;
  qualifies_for_statutory_pay: boolean;
}

interface EntitlementListResponse {
  items: EntitlementListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface DashboardData {
  active_leaves: {
    maternity: number;
    paternity: number;
    shared_parental: number;
    adoption: number;
    total: number;
  };
  planned_leaves: {
    maternity: number;
    paternity: number;
    shared_parental: number;
    adoption: number;
    total: number;
  };
  upcoming_returns: Array<{
    id: string;
    employee_id: string;
    employee_name: string | null;
    leave_type: "maternity" | "paternity" | "shared_parental" | "adoption";
    expected_return_date: string;
    days_until_return: number;
  }>;
  compliance_alerts: Array<{
    type: string;
    severity: "info" | "warning" | "critical";
    message: string;
    leave_record_id?: string;
    employee_id?: string;
  }>;
}

interface CreateEntitlementPayload {
  employee_id: string;
  leave_type: "maternity" | "paternity" | "shared_parental" | "adoption";
  expected_date: string;
  start_date: string;
  end_date?: string;
  average_weekly_earnings?: number;
  notes?: string;
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

const LEAVE_TYPE_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  maternity: "error",
  paternity: "info",
  shared_parental: "primary",
  adoption: "warning",
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

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const familyLeaveKeys = {
  all: () => ["family-leave"] as const,
  dashboard: () => [...familyLeaveKeys.all(), "dashboard"] as const,
  entitlements: (filters?: Record<string, string>) =>
    [...familyLeaveKeys.all(), "entitlements", filters] as const,
  entitlement: (id: string) =>
    [...familyLeaveKeys.all(), "entitlement", id] as const,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminFamilyLeavePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // -- Form state for new entitlement ---
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formLeaveType, setFormLeaveType] = useState<string>("");
  const [formExpectedDate, setFormExpectedDate] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formEarnings, setFormEarnings] = useState("");

  // -- Dashboard query --
  const { data: dashboardData } = useQuery({
    queryKey: familyLeaveKeys.dashboard(),
    queryFn: () => api.get<DashboardData>("/family-leave/dashboard"),
  });

  // -- Entitlements list query --
  const { data: entitlementsData, isLoading } = useQuery({
    queryKey: familyLeaveKeys.entitlements({
      leave_type: typeFilter,
      status: statusFilter,
    }),
    queryFn: () => {
      const params: Record<string, string> = {};
      if (typeFilter) params.leave_type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      return api.get<EntitlementListResponse>("/family-leave/entitlements", {
        params,
      });
    },
  });

  // -- Create entitlement mutation --
  const createMutation = useMutation({
    mutationFn: (payload: CreateEntitlementPayload) =>
      api.post("/family-leave/entitlements", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyLeaveKeys.all() });
      toast.success("Family leave entitlement created");
      resetForm();
      setShowCreateModal(false);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to create entitlement. Please try again.";
      toast.error(message);
    },
  });

  function resetForm() {
    setFormEmployeeId("");
    setFormLeaveType("");
    setFormExpectedDate("");
    setFormStartDate("");
    setFormEndDate("");
    setFormEarnings("");
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formEmployeeId || !formLeaveType || !formExpectedDate || !formStartDate) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const payload: CreateEntitlementPayload = {
      employee_id: formEmployeeId,
      leave_type: formLeaveType as CreateEntitlementPayload["leave_type"],
      expected_date: formExpectedDate,
      start_date: formStartDate,
    };
    if (formEndDate) payload.end_date = formEndDate;
    if (formEarnings) payload.average_weekly_earnings = parseFloat(formEarnings);
    createMutation.mutate(payload);
  }

  const items = entitlementsData?.items ?? [];

  const filteredItems = search
    ? items.filter(
        (item) =>
          (item.employee_name ?? "")
            .toLowerCase()
            .includes(search.toLowerCase()) ||
          (item.employee_number ?? "")
            .toLowerCase()
            .includes(search.toLowerCase())
      )
    : items;

  // -- Dashboard stats --
  const activeMaternity = dashboardData?.active_leaves.maternity ?? 0;
  const activePaternity = dashboardData?.active_leaves.paternity ?? 0;
  const activeSharedParental = dashboardData?.active_leaves.shared_parental ?? 0;
  const upcomingReturns = dashboardData?.upcoming_returns ?? [];
  const alerts = dashboardData?.compliance_alerts ?? [];

  // -- Table columns --
  const columns: ColumnDef<EntitlementListItem>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-gray-900 dark:text-white">
            {row.employee_name || "Unknown"}
          </div>
          {row.employee_number && (
            <div className="text-xs text-gray-500">{row.employee_number}</div>
          )}
        </div>
      ),
    },
    {
      id: "leaveType",
      header: "Type",
      cell: ({ row }) => (
        <Badge
          variant={LEAVE_TYPE_BADGE_VARIANTS[row.leave_type] ?? "default"}
          rounded
        >
          {LEAVE_TYPE_LABELS[row.leave_type] || row.leave_type}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={STATUS_BADGE_VARIANTS[row.status] ?? "default"}
          dot
          rounded
        >
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
    {
      id: "startDate",
      header: "Start Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.start_date)}
        </span>
      ),
    },
    {
      id: "endDate",
      header: "End Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.end_date)}
        </span>
      ),
    },
    {
      id: "totalWeeks",
      header: "Weeks",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {row.total_weeks}
        </span>
      ),
    },
    {
      id: "kitDays",
      header: "KIT Days",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {row.kit_days_used}
        </span>
      ),
    },
    {
      id: "statutoryPay",
      header: "Statutory Pay",
      cell: ({ row }) => (
        <Badge variant={row.qualifies_for_statutory_pay ? "success" : "secondary"}>
          {row.qualifies_for_statutory_pay ? "Eligible" : "Not Eligible"}
        </Badge>
      ),
    },
  ];

  const criticalAlerts = alerts.filter((a) => a.severity === "critical");
  const warningAlerts = alerts.filter((a) => a.severity === "warning");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Family Leave
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage maternity, paternity, shared parental, and adoption leave
            entitlements
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Entitlement
        </Button>
      </div>

      {/* Compliance Alerts */}
      {(criticalAlerts.length > 0 || warningAlerts.length > 0) && (
        <div className="space-y-2">
          {criticalAlerts.map((alert, idx) => (
            <div
              key={`critical-${idx}`}
              className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20"
              role="alert"
            >
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
              <span className="text-sm text-red-700 dark:text-red-300">
                {alert.message}
              </span>
            </div>
          ))}
          {warningAlerts.map((alert, idx) => (
            <div
              key={`warning-${idx}`}
              className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20"
              role="alert"
            >
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm text-yellow-700 dark:text-yellow-300">
                {alert.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Dashboard Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pink-100 dark:bg-pink-900/30">
              <Baby className="h-6 w-6 text-pink-600 dark:text-pink-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Active Maternity
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {activeMaternity}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Active Paternity
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {activePaternity}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Active Shared Parental
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {activeSharedParental}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <CalendarCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Upcoming Returns
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {upcomingReturns.length}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Upcoming Returns */}
      {upcomingReturns.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Upcoming Returns
            </h2>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {upcomingReturns.map((ret) => (
                <button
                  key={ret.id}
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() =>
                    navigate(`/admin/leave/statutory/${ret.id}`)
                  }
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        LEAVE_TYPE_BADGE_VARIANTS[ret.leave_type] ?? "default"
                      }
                      rounded
                    >
                      {LEAVE_TYPE_LABELS[ret.leave_type] || ret.leave_type}
                    </Badge>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {ret.employee_name || "Unknown"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Clock className="h-4 w-4" />
                    <span>
                      {ret.days_until_return} day{ret.days_until_return !== 1 ? "s" : ""}{" "}
                      ({formatDate(ret.expected_return_date)})
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-[200px] max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            aria-label="Search family leave entitlements by employee name"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: "", label: "All Leave Types" },
            { value: "maternity", label: "Maternity" },
            { value: "paternity", label: "Paternity" },
            { value: "shared_parental", label: "Shared Parental" },
            { value: "adoption", label: "Adoption" },
          ]}
          aria-label="Filter by leave type"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All Statuses" },
            { value: "planned", label: "Planned" },
            { value: "active", label: "Active" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          aria-label="Filter by status"
        />
      </div>

      {/* Entitlements Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <Baby className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No family leave entitlements found
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {search || typeFilter || statusFilter
                  ? "Try adjusting your filters"
                  : "No family leave entitlements have been recorded yet"}
              </p>
              {!search && !typeFilter && !statusFilter && (
                <Button
                  className="mt-4"
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Entitlement
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={filteredItems}
              columns={columns}
              getRowId={(row) => row.id}
              onRowClick={(row) =>
                navigate(`/admin/leave/statutory/${row.id}`)
              }
              hoverable
            />
          )}
        </CardBody>
      </Card>

      {/* Create Entitlement Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateModal(false);
            resetForm();
          }}
          size="lg"
        >
          <form onSubmit={handleCreateSubmit}>
            <ModalHeader>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                New Family Leave Entitlement
              </h3>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="create-employee-id"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Employee ID <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="create-employee-id"
                    value={formEmployeeId}
                    onChange={(e) => setFormEmployeeId(e.target.value)}
                    placeholder="Enter employee UUID"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="create-leave-type"
                    className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Leave Type <span className="text-red-500">*</span>
                  </label>
                  <Select
                    id="create-leave-type"
                    value={formLeaveType}
                    onChange={(e) => setFormLeaveType(e.target.value)}
                    options={[
                      { value: "", label: "Select leave type..." },
                      { value: "maternity", label: "Maternity" },
                      { value: "paternity", label: "Paternity" },
                      { value: "shared_parental", label: "Shared Parental" },
                      { value: "adoption", label: "Adoption" },
                    ]}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="create-expected-date"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Expected Date <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="create-expected-date"
                      type="date"
                      value={formExpectedDate}
                      onChange={(e) => setFormExpectedDate(e.target.value)}
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Expected week of childbirth or placement date
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="create-start-date"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="create-start-date"
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="create-end-date"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      End Date
                    </label>
                    <Input
                      id="create-end-date"
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Auto-calculated if not provided
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="create-earnings"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Avg. Weekly Earnings
                    </label>
                    <div className="relative">
                      <PoundSterling className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <Input
                        id="create-earnings"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formEarnings}
                        onChange={(e) => setFormEarnings(e.target.value)}
                        className="pl-10"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Average over 8-week reference period
                    </p>
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending
                  ? "Creating..."
                  : "Create Entitlement"}
              </Button>
            </ModalFooter>
          </form>
        </Modal>
      )}
    </div>
  );
}
