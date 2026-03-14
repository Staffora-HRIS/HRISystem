export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Shield,
  Search,
  FileDown,
  CheckCircle,
  XCircle,
  Users,
} from "lucide-react";
import {
  Card,
  CardBody,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  Button,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface NiCategory {
  id: string;
  employeeId: string;
  employeeName: string;
  categoryLetter: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

interface NiCategoryListResponse {
  items: NiCategory[];
  nextCursor: string | null;
  hasMore: boolean;
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  A: "Standard rate",
  B: "Married women / widows (reduced rate)",
  C: "Over state pension age",
  F: "Freeport (standard)",
  H: "Apprentice under 25",
  I: "Freeport (married women / widows)",
  J: "Deferred (employee pays primary only)",
  L: "Freeport (over state pension age)",
  M: "Under 21",
  S: "Freeport (under 21)",
  V: "Veteran (first 12 months)",
  Z: "Under 21 (deferred)",
};

const STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  active: "success",
  inactive: "secondary",
};

export default function AdminNiCategoriesPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: niData, isLoading } = useQuery({
    queryKey: ["admin-ni-categories", categoryFilter, statusFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (categoryFilter) params.category = categoryFilter;
      if (statusFilter) params.status = statusFilter;
      return api.get<NiCategoryListResponse>(
        "/payroll-config/ni-categories",
        { params }
      );
    },
  });

  const items = niData?.items ?? [];

  const filteredItems = search
    ? items.filter(
        (item) =>
          item.employeeName.toLowerCase().includes(search.toLowerCase()) ||
          item.categoryLetter.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const totalAssignments = items.length;
  const activeAssignments = items.filter((s) => s.status === "active").length;
  const inactiveAssignments = items.filter(
    (s) => s.status === "inactive"
  ).length;

  const handleExport = () => {
    const csvRows = [
      ["Employee", "Category Letter", "Effective From", "Effective To", "Status"],
      ...filteredItems.map((item) => [
        item.employeeName,
        item.categoryLetter,
        item.effectiveFrom,
        item.effectiveTo ?? "",
        item.status,
      ]),
    ];
    const csvContent = csvRows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ni-categories.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnDef<NiCategory>[] = [
    {
      id: "employeeName",
      header: "Employee",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
            <Users className="h-5 w-5 text-purple-600" />
          </div>
          <span className="font-medium text-gray-900">{row.employeeName}</span>
        </div>
      ),
    },
    {
      id: "categoryLetter",
      header: "Category Letter",
      cell: ({ row }) => (
        <div>
          <Badge variant="info">{row.categoryLetter}</Badge>
          {CATEGORY_DESCRIPTIONS[row.categoryLetter] && (
            <p className="text-xs text-gray-500 mt-1">
              {CATEGORY_DESCRIPTIONS[row.categoryLetter]}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "effectiveFrom",
      header: "Effective From",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {new Date(row.effectiveFrom).toLocaleDateString("en-GB")}
        </span>
      ),
    },
    {
      id: "effectiveTo",
      header: "Effective To",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.effectiveTo
            ? new Date(row.effectiveTo).toLocaleDateString("en-GB")
            : "Current"}
        </span>
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
          {row.status === "active" ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  const categoryLetterOptions = Object.keys(CATEGORY_DESCRIPTIONS).map(
    (letter) => ({
      value: letter,
      label: `${letter} - ${CATEGORY_DESCRIPTIONS[letter]}`,
    })
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">NI Categories</h1>
          <p className="text-gray-600">
            National Insurance contribution categories and employee assignments
          </p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <FileDown className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <Shield className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Assignments</p>
              <p className="text-2xl font-bold">{totalAssignments}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold">{activeAssignments}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <XCircle className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Inactive</p>
              <p className="text-2xl font-bold">{inactiveAssignments}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by employee or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          options={[
            { value: "", label: "All Categories" },
            ...categoryLetterOptions,
          ]}
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All Statuses" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
      </div>

      {/* Data Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No NI category assignments found
              </h3>
              <p className="text-gray-500 mb-4">
                {search || categoryFilter || statusFilter
                  ? "Try adjusting your filters"
                  : "NI category assignments will appear here once employees have tax details configured"}
              </p>
            </div>
          ) : (
            <DataTable
              data={filteredItems}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
