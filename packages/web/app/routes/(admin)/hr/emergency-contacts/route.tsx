export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "~/components/ui";
import { api } from "~/lib/api-client";

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
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-hr-emergency-contacts", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("limit", "50");
      return api.get<EmergencyContactListResponse>(`/emergency-contacts?${params}`);
    },
  });

  const contacts = data?.items ?? [];

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
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search employees or contacts..."
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
                {search
                  ? "Try adjusting your search"
                  : "No emergency contacts have been recorded"}
              </p>
              {!search && (
                <Button>
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
    </div>
  );
}
