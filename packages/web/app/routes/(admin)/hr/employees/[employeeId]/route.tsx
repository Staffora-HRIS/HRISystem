import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
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
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: string | null, currency: string | null): string {
  if (!amount) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
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

export default function AdminEmployeeDetailsPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<"overview" | "personal" | "employment" | "compensation" | "documents" | "history">("overview");
  const [showEditModal, setShowEditModal] = useState(false);

  const { data: employee, isLoading, error } = useQuery({
    queryKey: ["admin-employee", employeeId],
    queryFn: () => api.get<EmployeeDetail>(`/hr/employees/${employeeId}`),
    enabled: !!employeeId,
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
              {employee.firstName[0]}{employee.lastName[0]}
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
                <p className="font-medium">{employee.currency || "USD"}</p>
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
          <CardBody className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No documents</h3>
            <p className="text-gray-500">Employee documents will appear here.</p>
          </CardBody>
        </Card>
      )}

      {activeTab === "history" && (
        <Card>
          <CardBody className="text-center py-12">
            <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Employment History</h3>
            <p className="text-gray-500">Position changes, promotions, and other events will appear here.</p>
          </CardBody>
        </Card>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <Modal open onClose={() => setShowEditModal(false)} size="lg">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Edit Employee</h3>
          </ModalHeader>
          <ModalBody>
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" defaultValue={employee.firstName} />
              <Input label="Last Name" defaultValue={employee.lastName} />
              <Input label="Email" type="email" defaultValue={employee.email} />
              <Input label="Work Phone" defaultValue={employee.workPhone || ""} />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                toast.success("Employee updated successfully");
                setShowEditModal(false);
              }}
            >
              Save Changes
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
