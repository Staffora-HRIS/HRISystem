export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
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
  Mail,
  Phone,
  MapPin,
  Calendar,
  Building2,
  Users,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";
import { queryKeys, invalidationPatterns } from "~/lib/query-client";

interface EmployeeDocument {
  id: string;
  name: string;
  fileName: string;
  category: string;
  status: string;
  fileSize: number;
  mimeType: string;
  version: number;
  expiresAt: string | null;
  createdAt: string;
  uploadedByName?: string;
}

interface DocumentListResponse {
  items: EmployeeDocument[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface HistoryRecord {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  createdBy: string | null;
}

interface HistoryResponse {
  employeeId: string;
  dimension: string;
  records: HistoryRecord[];
}

interface EmployeeDetail {
  id: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  email: string;
  workPhone: string | null;
  personalEmail: string | null;
  personalPhone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  status: string;
  employmentType: string;
  hireDate: string;
  originalHireDate: string | null;
  terminationDate: string | null;
  terminationReason: string | null;
  positionId: string | null;
  positionTitle: string | null;
  orgUnitId: string | null;
  departmentName: string | null;
  managerId: string | null;
  managerName: string | null;
  locationId: string | null;
  locationName: string | null;
  workAddress: Record<string, unknown> | null;
  homeAddress: Record<string, unknown> | null;
  baseSalary: string | null;
  currency: string | null;
  payFrequency: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "success",
  on_leave: "warning",
  terminated: "danger",
  pending: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_leave: "On Leave",
  terminated: "Terminated",
  pending: "Pending",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: string | null, currency: string | null): string {
  if (!amount) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
  }).format(parseFloat(amount));
}

function calculateTenure(hireDate: string): string {
  const hire = new Date(hireDate);
  const now = new Date();
  const years = Math.floor((now.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  const months = Math.floor(((now.getTime() - hire.getTime()) % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
  
  if (years > 0) {
    return `${years} year${years > 1 ? "s" : ""}, ${months} month${months !== 1 ? "s" : ""}`;
  }
  return `${months} month${months !== 1 ? "s" : ""}`;
}

function EditEmployeeModal({
  employee,
  onClose,
  onSave,
  isPending,
}: {
  employee: EmployeeDetail;
  onClose: () => void;
  onSave: (data: { firstName: string; lastName: string; email: string; workPhone: string }) => void;
  isPending: boolean;
}) {
  const [firstName, setFirstName] = useState(employee.firstName);
  const [lastName, setLastName] = useState(employee.lastName);
  const [email, setEmail] = useState(employee.email);
  const [workPhone, setWorkPhone] = useState(employee.workPhone || "");

  return (
    <Modal open onClose={onClose} size="lg">
      <ModalHeader>
        <h3 className="text-lg font-semibold">Edit Employee</h3>
      </ModalHeader>
      <ModalBody>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Input
            label="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Work Phone"
            value={workPhone}
            onChange={(e) => setWorkPhone(e.target.value)}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          disabled={!firstName || !lastName || isPending}
          loading={isPending}
          onClick={() => onSave({ firstName, lastName, email, workPhone })}
        >
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default function AdminEmployeeDetailsPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<"overview" | "personal" | "employment" | "compensation" | "documents" | "history">("overview");
  const [showEditModal, setShowEditModal] = useState(false);

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
          <Button variant="outline">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
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
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contact Info */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Contact Information</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Work Email</p>
                  <p className="font-medium">{employee.email}</p>
                </div>
              </div>
              {employee.workPhone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Work Phone</p>
                    <p className="font-medium">{employee.workPhone}</p>
                  </div>
                </div>
              )}
              {employee.locationName && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <p className="font-medium">{employee.locationName}</p>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Employment Info */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Employment Details</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex items-center gap-3">
                <Briefcase className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Position</p>
                  <p className="font-medium">{employee.positionTitle || "-"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Department</p>
                  <p className="font-medium">{employee.departmentName || "-"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Manager</p>
                  <p className="font-medium">
                    {employee.managerName ? (
                      <Link
                        to={`/admin/hr/employees/${employee.managerId}`}
                        className="text-blue-600 hover:underline"
                      >
                        {employee.managerName}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Hire Date</p>
                  <p className="font-medium">{formatDate(employee.hireDate)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Tenure</p>
                  <p className="font-medium">{calculateTenure(employee.hireDate)}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Compensation Summary */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold">Compensation</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Base Salary</p>
                  <p className="font-medium text-lg">
                    {formatCurrency(employee.baseSalary, employee.currency)}
                  </p>
                </div>
              </div>
              {employee.payFrequency && (
                <div>
                  <p className="text-sm text-gray-500">Pay Frequency</p>
                  <p className="font-medium capitalize">{employee.payFrequency.replace("_", " ")}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Employment Type</p>
                <p className="font-medium capitalize">{employee.employmentType.replace("_", " ")}</p>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === "personal" && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Personal Information</h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500">Full Name</p>
                <p className="font-medium">
                  {employee.firstName} {employee.middleName || ""} {employee.lastName}
                </p>
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
                <p className="font-medium text-xl">
                  {formatCurrency(employee.baseSalary, employee.currency)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Currency</p>
                <p className="font-medium">{employee.currency || "GBP"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Pay Frequency</p>
                <p className="font-medium capitalize">
                  {employee.payFrequency?.replace("_", " ") || "-"}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === "documents" && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Documents</h3>
          </CardHeader>
          <CardBody>
            {documentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (documentsData?.items ?? []).length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No documents</h3>
                <p className="text-gray-500">No documents have been uploaded for this employee.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {(documentsData?.items ?? []).map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-5 w-5 shrink-0 text-gray-400" />
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{doc.name}</p>
                        <p className="text-sm text-gray-500">
                          {doc.fileName} &middot; {(doc.fileSize / 1024).toFixed(1)} KB
                          {doc.uploadedByName ? ` &middot; Uploaded by ${doc.uploadedByName}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={doc.status === "active" ? "success" : "secondary"}>
                        {doc.status}
                      </Badge>
                      {doc.expiresAt && (
                        <span className="text-xs text-gray-500">
                          Expires {new Date(doc.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {activeTab === "history" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Employment History</h3>
              <div className="flex gap-2">
                {(["position", "compensation", "contract", "personal", "manager", "status"] as const).map((dim) => (
                  <button
                    key={dim}
                    onClick={() => setHistoryDimension(dim)}
                    className={`px-3 py-1 text-xs font-medium rounded-full capitalize transition-colors ${
                      historyDimension === dim
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {dim}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardBody>
            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (historyData?.records ?? []).length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No history records</h3>
                <p className="text-gray-500">
                  No {historyDimension} history records found for this employee.
                </p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" aria-hidden="true" />
                <div className="space-y-6">
                  {(historyData?.records ?? []).map((record) => (
                    <div key={record.id} className="relative flex gap-4 pl-10">
                      <div className="absolute left-2.5 top-1 h-3 w-3 rounded-full border-2 border-blue-500 bg-white" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            Effective {formatDate(record.effectiveFrom)}
                          </span>
                          {record.effectiveTo && (
                            <span className="text-sm text-gray-500">
                              to {formatDate(record.effectiveTo)}
                            </span>
                          )}
                          {!record.effectiveTo && (
                            <Badge variant="success" size="sm">Current</Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {Object.entries(record.data).map(([key, value]) => (
                            <div key={key}>
                              <p className="text-xs text-gray-500 capitalize">
                                {key.replace(/_/g, " ")}
                              </p>
                              <p className="text-sm text-gray-900">
                                {value != null ? String(value) : "-"}
                              </p>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          Recorded {new Date(record.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
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
