export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Phone,
  Plus,
  Search,
  ChevronLeft,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
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
import { api, ApiError } from "~/lib/api-client";

interface EmergencyContact {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  contactName: string;
  relationship: string;
  phoneNumber: string;
  alternatePhone: string | null;
  isPrimary: boolean;
}

interface EmergencyContactListResponse {
  items: EmergencyContact[];
  nextCursor: string | null;
  hasMore: boolean;
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  spouse: "Spouse",
  partner: "Partner",
  parent: "Parent",
  child: "Child",
  sibling: "Sibling",
  friend: "Friend",
  other: "Other",
};

export default function EmergencyContactsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [employeeIdFilter, setEmployeeIdFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create form state
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formContactName, setFormContactName] = useState("");
  const [formRelationship, setFormRelationship] = useState("");
  const [formPhoneNumber, setFormPhoneNumber] = useState("");
  const [formAlternatePhone, setFormAlternatePhone] = useState("");
  const [formIsPrimary, setFormIsPrimary] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-hr-emergency-contacts", employeeIdFilter, search],
    queryFn: async () => {
      if (!employeeIdFilter.trim()) return { items: [], nextCursor: null, hasMore: false } as EmergencyContactListResponse;
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("limit", "50");
      return api.get<EmergencyContactListResponse>(`/employees/${employeeIdFilter.trim()}/emergency-contacts?${params}`);
    },
    enabled: !!employeeIdFilter.trim(),
  });

  const contacts = data?.items ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: {
      employeeId: string;
      contactName: string;
      relationship: string;
      phoneNumber: string;
      alternatePhone?: string;
      isPrimary: boolean;
    }) => api.post(`/employees/${payload.employeeId}/emergency-contacts`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-hr-emergency-contacts"],
      });
      toast.success("Emergency contact created successfully");
      resetForm();
      setShowCreateModal(false);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to create emergency contact";
      toast.error(message);
    },
  });

  function resetForm() {
    setFormEmployeeId("");
    setFormContactName("");
    setFormRelationship("");
    setFormPhoneNumber("");
    setFormAlternatePhone("");
    setFormIsPrimary(false);
  }

  function handleCreate() {
    const trimmedEmployeeId = formEmployeeId.trim();
    const trimmedContactName = formContactName.trim();
    const trimmedPhoneNumber = formPhoneNumber.trim();
    const trimmedAlternatePhone = formAlternatePhone.trim();

    if (!trimmedEmployeeId) {
      toast.error("Employee ID is required");
      return;
    }
    if (!trimmedContactName) {
      toast.error("Contact name is required");
      return;
    }
    if (!formRelationship) {
      toast.error("Relationship is required");
      return;
    }
    if (!trimmedPhoneNumber) {
      toast.error("Phone number is required");
      return;
    }

    createMutation.mutate({
      employeeId: trimmedEmployeeId,
      contactName: trimmedContactName,
      relationship: formRelationship,
      phoneNumber: trimmedPhoneNumber,
      alternatePhone: trimmedAlternatePhone || undefined,
      isPrimary: formIsPrimary,
    });
  }

  function handleCloseModal() {
    if (!createMutation.isPending) {
      setShowCreateModal(false);
      resetForm();
    }
  }

  const columns: ColumnDef<EmergencyContact>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => {
        const initials = (row.employeeName || "")
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-medium">
              {initials || "?"}
            </div>
            <div>
              <div className="font-medium text-gray-900">{row.employeeName}</div>
              <div className="text-sm text-gray-500">{row.employeeNumber}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: "contactName",
      header: "Contact Name",
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">{row.contactName}</span>
      ),
    },
    {
      id: "relationship",
      header: "Relationship",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {RELATIONSHIP_LABELS[row.relationship] || row.relationship}
        </span>
      ),
    },
    {
      id: "phoneNumber",
      header: "Phone Number",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 font-mono">{row.phoneNumber}</span>
      ),
    },
    {
      id: "alternatePhone",
      header: "Alternate Phone",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 font-mono">{row.alternatePhone || "-"}</span>
      ),
    },
    {
      id: "isPrimary",
      header: "Primary",
      cell: ({ row }) => (
        <Badge variant={row.isPrimary ? "success" : "default"}>
          {row.isPrimary ? "Primary" : "Secondary"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/admin/hr"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to HR
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Emergency Contacts</h1>
            <p className="text-gray-600">View and manage employee emergency contact information</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <Input
          placeholder="Employee ID"
          value={employeeIdFilter}
          onChange={(e) => setEmployeeIdFilter(e.target.value)}
          className="max-w-[280px]"
        />
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-12">
              <Phone className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No emergency contacts found</h3>
              <p className="text-gray-500 mb-4">
                {!employeeIdFilter.trim()
                  ? "Enter an employee ID above to view emergency contacts"
                  : search
                    ? "Try adjusting your search"
                    : "No emergency contacts found for this employee"}
              </p>
              {!search && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={contacts}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Modal */}
      <Modal open={showCreateModal} onClose={handleCloseModal} size="lg">
        <ModalHeader title="Add Emergency Contact" />
        <ModalBody>
          <div className="space-y-4">
            <Input
              label="Employee ID"
              placeholder="Enter employee ID"
              value={formEmployeeId}
              onChange={(e) => setFormEmployeeId(e.target.value)}
              required
              id="ec-employee-id"
            />
            <Input
              label="Contact Name"
              placeholder="e.g. Jane Smith"
              value={formContactName}
              onChange={(e) => setFormContactName(e.target.value)}
              required
              id="ec-contact-name"
            />
            <Select
              label="Relationship"
              value={formRelationship}
              onChange={(e) => setFormRelationship(e.target.value)}
              options={Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              placeholder="Select relationship"
              required
              id="ec-relationship"
            />
            <Input
              label="Phone Number"
              placeholder="e.g. 07700 900000"
              value={formPhoneNumber}
              onChange={(e) => setFormPhoneNumber(e.target.value)}
              required
              id="ec-phone-number"
            />
            <Input
              label="Alternate Phone (Optional)"
              placeholder="e.g. 07700 900001"
              value={formAlternatePhone}
              onChange={(e) => setFormAlternatePhone(e.target.value)}
              id="ec-alternate-phone"
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formIsPrimary}
                onChange={(e) => setFormIsPrimary(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                id="ec-is-primary"
              />
              <span className="text-sm font-medium text-gray-700">Primary contact</span>
            </label>
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
              !formEmployeeId.trim() ||
              !formContactName.trim() ||
              !formRelationship ||
              !formPhoneNumber.trim() ||
              createMutation.isPending
            }
            loading={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Add Contact"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
