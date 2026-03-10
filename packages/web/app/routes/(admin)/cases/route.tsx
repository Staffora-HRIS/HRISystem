import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  MessageSquare,
  Plus,
  Search,
  Clock,
  AlertTriangle,
  MoreHorizontal,
} from "lucide-react";
import {
  Card,
  CardBody,
  StatCard,
  Button,
  Badge,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface CaseListItem {
  id: string;
  caseNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  requesterId: string;
  requesterName: string | null;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CaseListResponse {
  cases: CaseListItem[];
  count: number;
  nextCursor: string | null;
  hasMore: boolean;
}

const PRIORITY_BADGE_VARIANTS: Record<string, string> = {
  urgent: "destructive",
  high: "warning",
  medium: "info",
  low: "secondary",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const STATUS_BADGE_VARIANTS: Record<string, string> = {
  open: "info",
  in_progress: "warning",
  pending_info: "secondary",
  escalated: "destructive",
  resolved: "success",
  closed: "secondary",
  cancelled: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  pending_info: "Pending Info",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
  cancelled: "Cancelled",
};

const CATEGORY_LABELS: Record<string, string> = {
  payroll: "Payroll",
  benefits: "Benefits",
  leave: "Leave",
  policy: "Policy",
  it_access: "IT Access",
  harassment: "Harassment",
  grievance: "Grievance",
  general: "General",
  onboarding: "Onboarding",
  offboarding: "Offboarding",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CasesListPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const { data: casesData, isLoading } = useQuery({
    queryKey: ["admin-cases", search, statusFilter, priorityFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      params.set("limit", "50");
      return api.get<CaseListResponse>(`/cases?${params}`);
    },
  });

  const cases = casesData?.cases ?? [];

  const stats = {
    total: cases.length,
    open: cases.filter((c) => c.status === "open").length,
    inProgress: cases.filter((c) => c.status === "in_progress").length,
    escalated: cases.filter((c) => c.status === "escalated").length,
  };

  const columns: ColumnDef<CaseListItem>[] = [
    {
      id: "caseNumber",
      header: "Case #",
      cell: ({ row }) => (
        <button
          type="button"
          className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/admin/cases/${row.id}`);
          }}
        >
          {row.caseNumber}
        </button>
      ),
    },
    {
      id: "subject",
      header: "Subject",
      cell: ({ row }) => (
        <div className="max-w-xs truncate text-sm text-gray-900 dark:text-gray-100">
          {row.subject}
        </div>
      ),
    },
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.requesterName || "Unknown"}
        </div>
      ),
    },
    {
      id: "category",
      header: "Category",
      cell: ({ row }) => (
        <Badge variant="outline">
          {CATEGORY_LABELS[row.category] || row.category}
        </Badge>
      ),
    },
    {
      id: "priority",
      header: "Priority",
      cell: ({ row }) => (
        <Badge variant={(PRIORITY_BADGE_VARIANTS[row.priority] || "default") as any}>
          {PRIORITY_LABELS[row.priority] || row.priority}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={(STATUS_BADGE_VARIANTS[row.status] || "default") as any}>
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
    {
      id: "assignee",
      header: "Assignee",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.assigneeName || "Unassigned"}
        </div>
      ),
    },
    {
      id: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.createdAt)}
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/admin/cases/${row.id}`);
          }}
          aria-label={`View case ${row.caseNumber}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cases</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage employee support cases
          </p>
        </div>
        <Button
          onClick={() =>
            toast.info("Coming Soon", {
              message: "Case creation will be available in a future update.",
            })
          }
        >
          <Plus className="h-4 w-4 mr-2" />
          New Case
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Cases"
          value={stats.total}
          icon={<MessageSquare className="h-5 w-5" />}
        />
        <StatCard
          title="Open"
          value={stats.open}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="In Progress"
          value={stats.inProgress}
          icon={<MessageSquare className="h-5 w-5" />}
        />
        <StatCard
          title="Escalated"
          value={stats.escalated}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search cases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All Statuses" },
            { value: "open", label: "Open" },
            { value: "in_progress", label: "In Progress" },
            { value: "pending_info", label: "Pending Info" },
            { value: "escalated", label: "Escalated" },
            { value: "resolved", label: "Resolved" },
            { value: "closed", label: "Closed" },
          ]}
        />
        <Select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          options={[
            { value: "", label: "All Priorities" },
            { value: "urgent", label: "Urgent" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          options={[
            { value: "", label: "All Categories" },
            { value: "payroll", label: "Payroll" },
            { value: "benefits", label: "Benefits" },
            { value: "leave", label: "Leave" },
            { value: "policy", label: "Policy" },
            { value: "it_access", label: "IT Access" },
            { value: "harassment", label: "Harassment" },
            { value: "grievance", label: "Grievance" },
            { value: "general", label: "General" },
          ]}
        />
      </div>

      {/* Cases Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : cases.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No cases found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {search || statusFilter || priorityFilter || categoryFilter
                  ? "Try adjusting your filters"
                  : "Cases submitted by employees will appear here."}
              </p>
            </div>
          ) : (
            <DataTable
              data={cases}
              columns={columns}
              onRowClick={(row) => navigate(`/admin/cases/${row.id}`)}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
