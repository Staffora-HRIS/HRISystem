import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Plus,
  Search,
  Download,
  MoreHorizontal,
} from "lucide-react";
import {
  Card,
  CardBody,
  StatCard,
  Button,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface BankHoliday {
  id: string;
  name: string;
  date: string;
  region: string;
  isRecurring: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BankHolidayListResponse {
  items: BankHoliday[];
  nextCursor: string | null;
  hasMore: boolean;
}

const REGION_LABELS: Record<string, string> = {
  england_wales: "England & Wales",
  scotland: "Scotland",
  northern_ireland: "Northern Ireland",
  all: "All Regions",
};

const REGION_BADGE_VARIANTS: Record<string, string> = {
  england_wales: "primary",
  scotland: "info",
  northern_ireland: "warning",
  all: "success",
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isPastDate(dateString: string): boolean {
  return new Date(dateString) < new Date();
}

export default function BankHolidaysPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formRegion, setFormRegion] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-bank-holidays", search, regionFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (regionFilter) params.set("region", regionFilter);
      params.set("limit", "50");
      return api.get<BankHolidayListResponse>(
        `/system/bank-holidays?${params}`
      );
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; date: string; region: string }) =>
      api.post("/system/bank-holidays", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-bank-holidays"],
      });
      toast.success("Bank holiday added successfully");
      resetForm();
      setShowCreateModal(false);
    },
    onError: () => {
      toast.error("Failed to add bank holiday");
    },
  });

  const importMutation = useMutation({
    mutationFn: () => api.post("/system/bank-holidays/import-uk", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-bank-holidays"],
      });
      toast.success("UK bank holidays imported successfully");
    },
    onError: () => {
      toast.error("Failed to import UK bank holidays");
    },
  });

  const holidays = data?.items ?? [];

  const now = new Date();
  const currentYear = now.getFullYear();
  const stats = {
    total: holidays.length,
    upcoming: holidays.filter((h) => new Date(h.date) >= now).length,
    thisYear: holidays.filter(
      (h) => new Date(h.date).getFullYear() === currentYear
    ).length,
  };

  function resetForm() {
    setFormName("");
    setFormDate("");
    setFormRegion("all");
  }

  function handleCreate() {
    const trimmedName = formName.trim();
    if (!trimmedName) {
      toast.error("Holiday name is required");
      return;
    }
    if (!formDate) {
      toast.error("Date is required");
      return;
    }
    createMutation.mutate({
      name: trimmedName,
      date: formDate,
      region: formRegion,
    });
  }

  function handleCloseModal() {
    if (!createMutation.isPending) {
      setShowCreateModal(false);
      resetForm();
    }
  }

  const columns: ColumnDef<BankHoliday>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {row.name}
        </div>
      ),
    },
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => (
        <div
          className={`text-sm ${isPastDate(row.date) ? "text-gray-400 dark:text-gray-400" : "text-gray-600 dark:text-gray-400"}`}
        >
          {formatDate(row.date)}
        </div>
      ),
    },
    {
      id: "region",
      header: "Region",
      cell: ({ row }) => (
        <Badge
          variant={
            (REGION_BADGE_VARIANTS[row.region] || "secondary") as BadgeVariant
          }
        >
          {REGION_LABELS[row.region] || row.region}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        isPastDate(row.date) ? (
          <Badge variant="secondary">Past</Badge>
        ) : (
          <Badge variant="success">Upcoming</Badge>
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
            toast.info(row.name, {
              message: `${formatShortDate(row.date)} | Region: ${REGION_LABELS[row.region] || row.region}`,
            });
          }}
          aria-label={`View details for ${row.name}`}
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Bank Holidays
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Configure bank holidays for absence and payroll calculations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
            loading={importMutation.isPending}
          >
            <Download className="h-4 w-4 mr-2" />
            {importMutation.isPending ? "Importing..." : "Import UK Holidays"}
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Holiday
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Holidays"
          value={stats.total}
          icon={<Calendar className="h-5 w-5" />}
        />
        <StatCard
          title="Upcoming"
          value={stats.upcoming}
          icon={<Calendar className="h-5 w-5" />}
        />
        <StatCard
          title={`In ${currentYear}`}
          value={stats.thisYear}
          icon={<Calendar className="h-5 w-5" />}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search holidays..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          options={[
            { value: "", label: "All Regions" },
            { value: "england_wales", label: "England & Wales" },
            { value: "scotland", label: "Scotland" },
            { value: "northern_ireland", label: "Northern Ireland" },
            { value: "all", label: "All Regions (shared)" },
          ]}
        />
      </div>

      {/* Data Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : holidays.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No bank holidays configured
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {search || regionFilter
                  ? "Try adjusting your filters"
                  : "Import UK holidays or add individual holidays manually."}
              </p>
              {!search && !regionFilter && (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => importMutation.mutate()}
                    disabled={importMutation.isPending}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Import UK Holidays
                  </Button>
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Holiday
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <DataTable
              data={holidays}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Holiday Modal */}
      <Modal open={showCreateModal} onClose={handleCloseModal} size="md">
        <ModalHeader title="Add Bank Holiday" />
        <ModalBody>
          <div className="space-y-4">
            <Input
              label="Holiday Name"
              placeholder="e.g. Christmas Day"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              id="holiday-name"
            />
            <Input
              label="Date"
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              required
              id="holiday-date"
            />
            <Select
              label="Region"
              value={formRegion}
              onChange={(e) => setFormRegion(e.target.value)}
              options={[
                { value: "all", label: "All Regions" },
                { value: "england_wales", label: "England & Wales" },
                { value: "scotland", label: "Scotland" },
                { value: "northern_ireland", label: "Northern Ireland" },
              ]}
              id="holiday-region"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={handleCloseModal}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              !formName.trim() || !formDate || createMutation.isPending
            }
            loading={createMutation.isPending}
          >
            {createMutation.isPending ? "Adding..." : "Add Holiday"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
