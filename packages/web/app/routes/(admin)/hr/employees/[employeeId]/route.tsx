export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Edit,
  MoreHorizontal,
  User,
  Briefcase,
  DollarSign,
  FileText,
  Clock,
} from "lucide-react";
import { Card, CardHeader, CardBody, Button, Badge, useToast } from "~/components/ui";
import { api } from "~/lib/api-client";
import { queryKeys, invalidationPatterns } from "~/lib/query-client";

import type { EmployeeDetail, DocumentListResponse, HistoryResponse } from "./types";
import { STATUS_COLORS, STATUS_LABELS, formatDate, formatCurrency, calculateTenure } from "./types";
import { EditEmployeeModal } from "./EditEmployeeModal";
import { EmployeeOverviewTab } from "./EmployeeOverviewTab";
import { EmployeeDocumentsTab } from "./EmployeeDocumentsTab";
import { EmployeeHistoryTab } from "./EmployeeHistoryTab";

export default function AdminEmployeeDetailsPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<"overview" | "personal" | "employment" | "compensation" | "documents" | "history">("overview");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  const qc = useQueryClient();

  const { data: employee, isLoading, error } = useQuery({
    queryKey: ["admin-employee", employeeId],
    queryFn: () => api.get<EmployeeDetail>(`/hr/employees/${employeeId}`),
    enabled: !!employeeId,
  });

  // Fetch documents for this employee
  const { data: documentsData, isLoading: documentsLoading } = useQuery({
    queryKey: queryKeys.employees.documents(employeeId!),
    queryFn: () => api.get<DocumentListResponse>(`/documents?employee_id=${employeeId}`),
    enabled: !!employeeId && activeTab === "documents",
  });

  // Fetch employment history (position dimension covers promotions/transfers)
  const [historyDimension, setHistoryDimension] = useState<string>("position");
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["admin-employee-history", employeeId, historyDimension],
    queryFn: () => api.get<HistoryResponse>(`/hr/employees/${employeeId}/history/${historyDimension}`),
    enabled: !!employeeId && activeTab === "history",
  });

  // Edit employee mutation
  const editMutation = useMutation({
    mutationFn: (data: { firstName: string; lastName: string; email: string; workPhone: string }) => {
      const today = new Date().toISOString().split("T")[0];
      return api.put(`/hr/employees/${employeeId}/personal`, {
        effective_from: today,
        first_name: data.firstName,
        last_name: data.lastName,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-employee", employeeId] });
      invalidationPatterns.employee(employeeId).forEach((key) =>
        qc.invalidateQueries({ queryKey: key })
      );
      toast.success("Employee updated successfully");
      setShowEditModal(false);
    },
    onError: (err) => {
      toast.error("Failed to update employee", {
        message: err instanceof Error ? err.message : "Please try again.",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="text-center py-12">
        <User className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900">Employee not found</h3>
        <p className="text-gray-500 mb-4">The employee you're looking for doesn't exist.</p>
        <Button onClick={() => navigate("/admin/hr/employees")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Employees
        </Button>
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview", icon: User },
    { id: "personal", label: "Personal", icon: User },
    { id: "employment", label: "Employment", icon: Briefcase },
    { id: "compensation", label: "Compensation", icon: DollarSign },
    { id: "documents", label: "Documents", icon: FileText },
    { id: "history", label: "History", icon: Clock },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/hr/employees")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-xl font-bold">
              {(employee.firstName ?? "?")[0]}{(employee.lastName ?? "?")[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">
                  {employee.firstName} {employee.lastName}
                </h1>
                <Badge variant={STATUS_COLORS[employee.status] as any}>
                  {STATUS_LABELS[employee.status] || employee.status}
                </Badge>
              </div>
              <p className="text-gray-600">
                {employee.positionTitle || "No position"} • {employee.departmentName || "No department"}
              </p>
              <p className="text-sm text-gray-500">#{employee.employeeNumber}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowEditModal(true)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setShowActionsMenu((prev) => !prev)}
              aria-label="More actions"
              aria-expanded={showActionsMenu}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {showActionsMenu && (
              <div
                className="absolute right-0 top-full mt-1 w-48 rounded-md border border-gray-200 bg-white shadow-lg z-10"
                role="menu"
              >
                <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem" onClick={() => { setShowActionsMenu(false); navigate(`/admin/hr/contracts`); }}>
                  View Contracts
                </button>
                <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem" onClick={() => { setShowActionsMenu(false); navigate(`/admin/hr/bank-details`); }}>
                  Bank Details
                </button>
                <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem" onClick={() => { setShowActionsMenu(false); navigate(`/admin/hr/emergency-contacts`); }}>
                  Emergency Contacts
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-3 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && <EmployeeOverviewTab employee={employee} />}

      {activeTab === "personal" && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Personal Information</h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500">Full Name</p>
                <p className="font-medium">{employee.firstName} {employee.middleName || ""} {employee.lastName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Preferred Name</p>
                <p className="font-medium">{employee.preferredName || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Date of Birth</p>
                <p className="font-medium">{formatDate(employee.dateOfBirth)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Gender</p>
                <p className="font-medium capitalize">{employee.gender || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Marital Status</p>
                <p className="font-medium capitalize">{employee.maritalStatus || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Nationality</p>
                <p className="font-medium">{employee.nationality || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Personal Email</p>
                <p className="font-medium">{employee.personalEmail || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Personal Phone</p>
                <p className="font-medium">{employee.personalPhone || "-"}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === "employment" && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Employment History</h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500">Employee Number</p>
                <p className="font-medium">{employee.employeeNumber}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Employment Type</p>
                <p className="font-medium capitalize">{employee.employmentType.replace("_", " ")}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <Badge variant={STATUS_COLORS[employee.status] as any}>
                  {STATUS_LABELS[employee.status] || employee.status}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500">Hire Date</p>
                <p className="font-medium">{formatDate(employee.hireDate)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Original Hire Date</p>
                <p className="font-medium">{formatDate(employee.originalHireDate)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Tenure</p>
                <p className="font-medium">{calculateTenure(employee.hireDate)}</p>
              </div>
              {employee.terminationDate && (
                <>
                  <div>
                    <p className="text-sm text-gray-500">Termination Date</p>
                    <p className="font-medium">{formatDate(employee.terminationDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Termination Reason</p>
                    <p className="font-medium">{employee.terminationReason || "-"}</p>
                  </div>
                </>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === "compensation" && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Compensation Details</h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500">Base Salary</p>
                <p className="font-medium text-xl">{formatCurrency(employee.baseSalary, employee.currency)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Currency</p>
                <p className="font-medium">{employee.currency || "GBP"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Pay Frequency</p>
                <p className="font-medium capitalize">{employee.payFrequency?.replace("_", " ") || "-"}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === "documents" && (
        <EmployeeDocumentsTab
          documents={documentsData?.items ?? []}
          isLoading={documentsLoading}
        />
      )}

      {activeTab === "history" && (
        <EmployeeHistoryTab
          records={historyData?.records ?? []}
          isLoading={historyLoading}
          dimension={historyDimension}
          onDimensionChange={setHistoryDimension}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <EditEmployeeModal
          employee={employee}
          onClose={() => setShowEditModal(false)}
          onSave={(data) => editMutation.mutate(data)}
          isPending={editMutation.isPending}
        />
      )}
    </div>
  );
}
