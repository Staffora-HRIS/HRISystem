export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Search,
  Plus,
  Download,
  FileText,
  MapPin,
} from "lucide-react";
import {
  Card,
  CardBody,
  Badge,
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
import { api } from "~/lib/api-client";

interface BankHoliday {
  id: string;
  name: string;
  date: string;
  country: string;
  region: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BankHolidayListResponse {
  items: BankHoliday[];
  nextCursor: string | null;
  hasMore: boolean;
}

const COUNTRY_LABELS: Record<string, string> = {
  GB: "United Kingdom",
  "GB-ENG": "England",
  "GB-WLS": "Wales",
  "GB-SCT": "Scotland",
  "GB-NIR": "Northern Ireland",
};

const REGION_LABELS: Record<string, string> = {
  "england-and-wales": "England & Wales",
  scotland: "Scotland",
  "northern-ireland": "Northern Ireland",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getDayOfWeek(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    weekday: "long",
  });
}

interface CreateHolidayForm {
  name: string;
  date: string;
  country: string;
  region: string;
}

const INITIAL_FORM: CreateHolidayForm = {
  name: "",
  date: "",
  country: "GB",
  region: "",
};

export default function AdminBankHolidaysPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateHolidayForm>(INITIAL_FORM);

  const { data: holidaysData, isLoading } = useQuery({
    queryKey: ["admin-bank-holidays", countryFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (countryFilter) params.country = countryFilter;
      return api.get<BankHolidayListResponse>("/bank-holidays", {
        params,
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/bank-holidays", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-bank-holidays"] });
      toast.success("Bank holiday added successfully");
      setShowCreateModal(false);
      setFormData(INITIAL_FORM);
    },
    onError: () => {
      toast.error("Failed to add bank holiday");
    },
  });

  const importMutation = useMutation({
    mutationFn: () => api.post("/bank-holidays/import-uk"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-bank-holidays"] });
      toast.success("UK bank holidays imported successfully");
    },
    onError: () => {
      toast.error("Failed to import UK bank holidays");
    },
  });

  const items = holidaysData?.items ?? [];

  const filteredItems = search
    ? items.filter((item) =>
        item.name.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const totalHolidays = items.length;
  const upcomingHolidays = items.filter(
    (h) => new Date(h.date) >= new Date()
  ).length;
  const uniqueRegions = new Set(items.map((h) => h.region).filter(Boolean))
    .size;

  const handleCreateSubmit = () => {
    if (!formData.name.trim() || !formData.date) {
      toast.warning("Please fill in the required fields");
      return;
    }
    createMutation.mutate({
      name: formData.name.trim(),
      date: formData.date,
      country: formData.country,
      region: formData.region || undefined,
    });
  };

  const columns: ColumnDef<BankHoliday>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
            <CalendarDays className="h-5 w-5 text-emerald-600" />
          </div>
          <span className="font-medium text-gray-900">{row.name}</span>
        </div>
      ),
    },
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => (
        <div>
          <div className="text-sm text-gray-900">{formatDate(row.date)}</div>
          <div className="text-xs text-gray-500">{getDayOfWeek(row.date)}</div>
        </div>
      ),
    },
    {
      id: "country",
      header: "Country",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {COUNTRY_LABELS[row.country] || row.country}
        </span>
      ),
    },
    {
      id: "region",
      header: "Region",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.region
            ? REGION_LABELS[row.region] || row.region
            : "-"}
        </span>
      ),
    },
    {
      id: "upcoming",
      header: "",
      cell: ({ row }) => {
        const isUpcoming = new Date(row.date) >= new Date();
        return isUpcoming ? (
          <Badge variant="info" rounded>
            Upcoming
          </Badge>
        ) : null;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bank Holidays</h1>
          <p className="text-gray-600">
            Manage bank holiday calendars by country and region
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
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
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Holidays</p>
              <p className="text-2xl font-bold">{totalHolidays}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CalendarDays className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Upcoming</p>
              <p className="text-2xl font-bold">{upcomingHolidays}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <MapPin className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Regions Covered</p>
              <p className="text-2xl font-bold">{uniqueRegions}</p>
            </div>
          </CardBody>
        </Card>
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
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          options={[
            { value: "", label: "All Countries" },
            { value: "GB", label: "United Kingdom" },
            { value: "GB-ENG", label: "England" },
            { value: "GB-WLS", label: "Wales" },
            { value: "GB-SCT", label: "Scotland" },
            { value: "GB-NIR", label: "Northern Ireland" },
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
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <CalendarDays className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No bank holidays found
              </h3>
              <p className="text-gray-500 mb-4">
                {search || countryFilter
                  ? "Try adjusting your filters"
                  : "Import UK holidays or add holidays manually"}
              </p>
              {!search && !countryFilter && (
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
              data={filteredItems}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateModal(false);
            setFormData(INITIAL_FORM);
          }}
          size="md"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Add Bank Holiday</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Holiday Name"
                placeholder="e.g. Christmas Day"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
              <Input
                label="Date"
                type="date"
                required
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
              />
              <Select
                label="Country"
                value={formData.country}
                onChange={(e) =>
                  setFormData({ ...formData, country: e.target.value })
                }
                options={[
                  { value: "GB", label: "United Kingdom" },
                  { value: "GB-ENG", label: "England" },
                  { value: "GB-WLS", label: "Wales" },
                  { value: "GB-SCT", label: "Scotland" },
                  { value: "GB-NIR", label: "Northern Ireland" },
                ]}
              />
              <Select
                label="Region (optional)"
                value={formData.region}
                onChange={(e) =>
                  setFormData({ ...formData, region: e.target.value })
                }
                options={[
                  { value: "", label: "All Regions" },
                  { value: "england-and-wales", label: "England & Wales" },
                  { value: "scotland", label: "Scotland" },
                  { value: "northern-ireland", label: "Northern Ireland" },
                ]}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setFormData(INITIAL_FORM);
              }}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={
                !formData.name.trim() ||
                !formData.date ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Adding..." : "Add Holiday"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
