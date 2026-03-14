export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Search,
  Edit,
  Save,
  X,
  Clock,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Button,
  Input,
  Select,
  useToast,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Employee {
  id: string;
  employeeNumber: string;
  fullName: string;
  displayName: string;
  status: string;
}

interface EmployeeListResponse {
  items: Employee[];
  nextCursor: string | null;
  hasMore: boolean;
}

type StudentLoanPlan = "none" | "plan1" | "plan2" | "plan4" | "plan5" | "postgrad";

interface TaxDetails {
  id: string;
  tenantId: string;
  employeeId: string;
  taxCode: string;
  niNumber: string | null;
  niCategory: string;
  studentLoanPlan: StudentLoanPlan;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TaxDetailsResponse {
  current: TaxDetails | null;
  history: TaxDetails[];
}

interface TaxDetailsForm {
  taxCode: string;
  niNumber: string;
  niCategory: string;
  studentLoanPlan: StudentLoanPlan;
  effectiveFrom: string;
  effectiveTo: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NI_CATEGORIES = [
  { value: "A", label: "A - Standard rate" },
  { value: "B", label: "B - Married women reduced rate" },
  { value: "C", label: "C - Over state pension age" },
  { value: "F", label: "F - Freeport (standard)" },
  { value: "H", label: "H - Apprentice under 25" },
  { value: "I", label: "I - Freeport (married women)" },
  { value: "J", label: "J - Deferred rate" },
  { value: "L", label: "L - Freeport (deferred)" },
  { value: "M", label: "M - Under 21" },
  { value: "S", label: "S - Freeport (under 21)" },
  { value: "V", label: "V - Veteran" },
  { value: "Z", label: "Z - Under 21 deferred" },
];

const STUDENT_LOAN_OPTIONS = [
  { value: "none", label: "None" },
  { value: "plan1", label: "Plan 1" },
  { value: "plan2", label: "Plan 2" },
  { value: "plan4", label: "Plan 4 (Scotland)" },
  { value: "plan5", label: "Plan 5" },
  { value: "postgrad", label: "Postgraduate Loan" },
];

const STUDENT_LOAN_LABELS: Record<string, string> = {
  none: "None",
  plan1: "Plan 1",
  plan2: "Plan 2",
  plan4: "Plan 4",
  plan5: "Plan 5",
  postgrad: "Postgrad",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const INITIAL_FORM: TaxDetailsForm = {
  taxCode: "1257L",
  niNumber: "",
  niCategory: "A",
  studentLoanPlan: "none",
  effectiveFrom: new Date().toISOString().split("T")[0],
  effectiveTo: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PayrollTaxDetailsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<TaxDetailsForm>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof TaxDetailsForm, string>>>({});

  // Search employees
  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["admin-employees-search", employeeSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (employeeSearch) params.set("search", employeeSearch);
      params.set("limit", "20");
      params.set("status", "active");
      return api.get<EmployeeListResponse>(`/hr/employees?${params}`);
    },
    enabled: employeeSearch.length >= 2,
  });

  // Fetch tax details for selected employee
  const {
    data: taxData,
    isLoading: taxLoading,
    isError: taxError,
  } = useQuery({
    queryKey: queryKeys.payroll.taxDetails(selectedEmployee?.id ?? ""),
    queryFn: () =>
      api.get<TaxDetailsResponse>(
        `/payroll/employees/${selectedEmployee!.id}/tax-details`
      ),
    enabled: !!selectedEmployee,
  });

  // Update tax details mutation
  const updateMutation = useMutation({
    mutationFn: (data: TaxDetailsForm) =>
      api.put(`/payroll/employees/${selectedEmployee!.id}/tax-details`, {
        tax_code: data.taxCode.trim(),
        ni_number: data.niNumber.trim() || null,
        ni_category: data.niCategory,
        student_loan_plan: data.studentLoanPlan,
        effective_from: data.effectiveFrom,
        effective_to: data.effectiveTo || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.payroll.taxDetails(selectedEmployee!.id),
      });
      toast.success("Tax details updated successfully");
      setIsEditing(false);
      setFormErrors({});
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to update tax details";
      toast.error(message);
    },
  });

  const validateForm = useCallback((): boolean => {
    const errors: Partial<Record<keyof TaxDetailsForm, string>> = {};
    if (!formData.taxCode.trim()) errors.taxCode = "Tax code is required";
    if (!formData.niCategory) errors.niCategory = "NI category is required";
    if (!formData.effectiveFrom)
      errors.effectiveFrom = "Effective date is required";
    if (
      formData.niNumber.trim() &&
      !/^[A-CEGHJ-PR-TW-Z]{2}[0-9]{6}[A-D]$/.test(formData.niNumber.trim().toUpperCase())
    ) {
      errors.niNumber = "Invalid NI number format (e.g. AB123456C)";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(() => {
    if (!validateForm()) return;
    updateMutation.mutate(formData);
  }, [validateForm, updateMutation, formData]);

  const handleStartEdit = useCallback(() => {
    if (taxData?.current) {
      setFormData({
        taxCode: taxData.current.taxCode,
        niNumber: taxData.current.niNumber || "",
        niCategory: taxData.current.niCategory,
        studentLoanPlan: taxData.current.studentLoanPlan,
        effectiveFrom: new Date().toISOString().split("T")[0],
        effectiveTo: "",
      });
    } else {
      setFormData(INITIAL_FORM);
    }
    setFormErrors({});
    setIsEditing(true);
  }, [taxData]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setFormErrors({});
  }, []);

  const handleSelectEmployee = useCallback((emp: Employee) => {
    setSelectedEmployee(emp);
    setEmployeeSearch("");
    setIsEditing(false);
    setFormErrors({});
  }, []);

  const searchResults = employeesData?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Employee Tax Details
        </h1>
        <p className="text-gray-600">
          View and update employee tax codes, NI details, and student loan plans
        </p>
      </div>

      {/* Employee Search */}
      <Card>
        <CardBody>
          <label
            htmlFor="employee-search"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Search Employee
          </label>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              id="employee-search"
              placeholder="Type at least 2 characters to search..."
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Search Results Dropdown */}
          {employeeSearch.length >= 2 && (
            <div className="mt-2 max-w-md">
              {employeesLoading ? (
                <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-500">
                  Searching...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-500">
                  No employees found
                </div>
              ) : (
                <ul
                  className="rounded-lg border border-gray-200 bg-white shadow-sm divide-y divide-gray-100 max-h-60 overflow-y-auto"
                  role="listbox"
                  aria-label="Employee search results"
                >
                  {searchResults.map((emp) => (
                    <li key={emp.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                        onClick={() => handleSelectEmployee(emp)}
                        role="option"
                        aria-selected={selectedEmployee?.id === emp.id}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-900">
                              {emp.displayName || emp.fullName}
                            </span>
                            <span className="ml-2 text-sm text-gray-500">
                              {emp.employeeNumber}
                            </span>
                          </div>
                          <Badge
                            variant={emp.status === "active" ? "success" : "secondary"}
                            size="sm"
                          >
                            {emp.status}
                          </Badge>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Selected Employee Display */}
          {selectedEmployee && employeeSearch.length < 2 && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 max-w-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-medium">
                {(selectedEmployee.displayName || selectedEmployee.fullName)
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900">
                  {selectedEmployee.displayName || selectedEmployee.fullName}
                </div>
                <div className="text-sm text-gray-500">
                  {selectedEmployee.employeeNumber}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedEmployee(null);
                  setIsEditing(false);
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                aria-label="Clear selected employee"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Tax Details Content */}
      {selectedEmployee && (
        <>
          {taxLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : taxError ? (
            <Card>
              <CardBody className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">
                  Failed to load tax details
                </h3>
                <p className="text-gray-500">
                  An error occurred while fetching tax details for this employee.
                </p>
              </CardBody>
            </Card>
          ) : (
            <>
              {/* Current Tax Details */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Current Tax Details
                  </h2>
                  {!isEditing && (
                    <Button variant="outline" size="sm" onClick={handleStartEdit}>
                      <Edit className="h-4 w-4 mr-2" />
                      {taxData?.current ? "Update" : "Add Tax Details"}
                    </Button>
                  )}
                </CardHeader>
                <CardBody>
                  {isEditing ? (
                    /* Edit Form */
                    <div className="space-y-4 max-w-2xl">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                          label="Tax Code"
                          placeholder="e.g. 1257L"
                          required
                          value={formData.taxCode}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              taxCode: e.target.value.toUpperCase(),
                            }))
                          }
                          error={formErrors.taxCode}
                        />
                        <Input
                          label="NI Number"
                          placeholder="e.g. AB123456C"
                          value={formData.niNumber}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              niNumber: e.target.value.toUpperCase(),
                            }))
                          }
                          error={formErrors.niNumber}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Select
                          label="NI Category"
                          value={formData.niCategory}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              niCategory: e.target.value,
                            }))
                          }
                          options={NI_CATEGORIES}
                          error={formErrors.niCategory}
                          required
                        />
                        <Select
                          label="Student Loan Plan"
                          value={formData.studentLoanPlan}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              studentLoanPlan: e.target.value as StudentLoanPlan,
                            }))
                          }
                          options={STUDENT_LOAN_OPTIONS}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                          label="Effective From"
                          type="date"
                          required
                          value={formData.effectiveFrom}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              effectiveFrom: e.target.value,
                            }))
                          }
                          error={formErrors.effectiveFrom}
                        />
                        <Input
                          label="Effective To (optional)"
                          type="date"
                          value={formData.effectiveTo}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              effectiveTo: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          onClick={handleSubmit}
                          disabled={updateMutation.isPending}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {updateMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleCancelEdit}
                          disabled={updateMutation.isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : taxData?.current ? (
                    /* Current Details Display */
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <p className="text-sm text-gray-500">Tax Code</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {taxData.current.taxCode}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">NI Number</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {taxData.current.niNumber || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">NI Category</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {taxData.current.niCategory}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Student Loan</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {STUDENT_LOAN_LABELS[taxData.current.studentLoanPlan] ||
                            taxData.current.studentLoanPlan}
                        </p>
                      </div>
                      <div className="col-span-2 md:col-span-4 pt-2 border-t border-gray-100">
                        <p className="text-sm text-gray-500">
                          Effective from{" "}
                          <span className="font-medium text-gray-700">
                            {formatDate(taxData.current.effectiveFrom)}
                          </span>
                          {taxData.current.effectiveTo && (
                            <>
                              {" "}to{" "}
                              <span className="font-medium text-gray-700">
                                {formatDate(taxData.current.effectiveTo)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* No Tax Details */
                    <div className="text-center py-8">
                      <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900">
                        No tax details on record
                      </h3>
                      <p className="text-gray-500 mb-4">
                        Add tax details for this employee to include them in payroll calculations.
                      </p>
                      <Button onClick={handleStartEdit}>
                        Add Tax Details
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* History */}
              {taxData?.history && taxData.history.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-gray-400" />
                      <h2 className="text-lg font-semibold text-gray-900">
                        Tax Detail History
                      </h2>
                    </div>
                  </CardHeader>
                  <CardBody className="p-0">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th
                              scope="col"
                              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                            >
                              Tax Code
                            </th>
                            <th
                              scope="col"
                              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                            >
                              NI Number
                            </th>
                            <th
                              scope="col"
                              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                            >
                              NI Category
                            </th>
                            <th
                              scope="col"
                              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                            >
                              Student Loan
                            </th>
                            <th
                              scope="col"
                              className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                            >
                              Effective Period
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {taxData.history.map((record) => {
                            const isCurrent =
                              taxData.current?.id === record.id;
                            return (
                              <tr
                                key={record.id}
                                className={
                                  isCurrent ? "bg-blue-50" : "hover:bg-gray-50"
                                }
                              >
                                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                                  {record.taxCode}
                                  {isCurrent && (
                                    <Badge
                                      variant="info"
                                      size="sm"
                                      className="ml-2"
                                    >
                                      Current
                                    </Badge>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                                  {record.niNumber || "-"}
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                                  {record.niCategory}
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                                  {STUDENT_LOAN_LABELS[record.studentLoanPlan] ||
                                    record.studentLoanPlan}
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                                  {formatDate(record.effectiveFrom)}
                                  {record.effectiveTo
                                    ? ` to ${formatDate(record.effectiveTo)}`
                                    : " onwards"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardBody>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* Initial State - No Employee Selected */}
      {!selectedEmployee && (
        <Card>
          <CardBody className="text-center py-16">
            <Search className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">
              Select an employee
            </h3>
            <p className="text-gray-500 mt-1">
              Search for an employee above to view and manage their tax details.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
