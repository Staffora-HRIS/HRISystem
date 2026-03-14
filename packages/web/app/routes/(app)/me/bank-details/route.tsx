import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  Shield,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { Spinner } from "~/components/ui/spinner";
import { api, ApiError } from "~/lib/api-client";

type PortalMeResponse = {
  user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  employee: { id: string; firstName: string; lastName: string } | null;
  tenant: { id: string; name: string };
};

interface BankDetail {
  id: string;
  employeeId: string;
  accountHolderName: string;
  sortCode: string;
  accountNumber: string;
  bankName: string | null;
  buildingSocietyRef: string | null;
  isPrimary: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BankDetailListResponse {
  items: BankDetail[];
  nextCursor: string | null;
  hasMore: boolean;
}

function maskSortCode(sortCode: string): string {
  // Show format xx-xx-xx masked
  return "**-**-" + sortCode.slice(-2);
}

function maskAccountNumber(accountNumber: string): string {
  // Show last 4 digits
  return "****" + accountNumber.slice(-4);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BankDetailsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showFullDetails, setShowFullDetails] = useState(false);

  // Update form state
  const [formAccountHolder, setFormAccountHolder] = useState("");
  const [formSortCode, setFormSortCode] = useState("");
  const [formAccountNumber, setFormAccountNumber] = useState("");
  const [formBankName, setFormBankName] = useState("");
  const [formBuildingSocietyRef, setFormBuildingSocietyRef] = useState("");

  // First fetch the employee profile to get the employee ID
  const {
    data: me,
    isLoading: meLoading,
    error: meError,
  } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => api.get<PortalMeResponse>("/portal/me"),
  });

  const employeeId = me?.employee?.id ?? null;

  // Fetch bank details using the employee-scoped endpoint
  const {
    data,
    isLoading: detailsLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["my-bank-details", employeeId],
    queryFn: () =>
      api.get<BankDetailListResponse>(
        `/employees/${employeeId}/bank-details`
      ),
    enabled: Boolean(employeeId),
  });

  // The primary or first bank detail is the "current" one
  const bankDetails =
    data?.items?.find((d) => d.isPrimary) ?? data?.items?.[0] ?? null;

  const createMutation = useMutation({
    mutationFn: (createData: {
      account_holder_name: string;
      sort_code: string;
      account_number: string;
      bank_name?: string;
      building_society_ref?: string;
      is_primary: boolean;
      effective_from: string;
    }) => api.post(`/employees/${employeeId}/bank-details`, createData),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["my-bank-details"],
      });
      toast.success("Bank details updated successfully");
      resetForm();
      setShowUpdateModal(false);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to update bank details";
      toast.error(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (updateData: {
      id: string;
      account_holder_name?: string;
      sort_code?: string;
      account_number?: string;
      bank_name?: string;
      building_society_ref?: string;
    }) =>
      api.put(
        `/employees/${employeeId}/bank-details/${updateData.id}`,
        updateData
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["my-bank-details"],
      });
      toast.success("Bank details updated successfully");
      resetForm();
      setShowUpdateModal(false);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to update bank details";
      toast.error(message);
    },
  });

  const isMutating = createMutation.isPending || updateMutation.isPending;

  function resetForm() {
    setFormAccountHolder("");
    setFormSortCode("");
    setFormAccountNumber("");
    setFormBankName("");
    setFormBuildingSocietyRef("");
  }

  function handleOpenUpdateModal() {
    if (bankDetails) {
      setFormAccountHolder(bankDetails.accountHolderName);
      setFormSortCode("");
      setFormAccountNumber("");
      setFormBankName(bankDetails.bankName || "");
      setFormBuildingSocietyRef(bankDetails.buildingSocietyRef || "");
    }
    setShowUpdateModal(true);
  }

  function handleUpdate() {
    const trimmedHolder = formAccountHolder.trim();
    const trimmedSortCode = formSortCode.trim().replace(/[^0-9]/g, "");
    const trimmedAccountNumber = formAccountNumber.trim().replace(/[^0-9]/g, "");

    if (!trimmedHolder) {
      toast.error("Account holder name is required");
      return;
    }
    if (trimmedSortCode.length !== 6) {
      toast.error("Sort code must be 6 digits");
      return;
    }
    if (trimmedAccountNumber.length !== 8) {
      toast.error("Account number must be 8 digits");
      return;
    }

    if (bankDetails) {
      // Update existing bank detail
      updateMutation.mutate({
        id: bankDetails.id,
        account_holder_name: trimmedHolder,
        sort_code: trimmedSortCode,
        account_number: trimmedAccountNumber,
        bank_name: formBankName.trim() || undefined,
        building_society_ref: formBuildingSocietyRef.trim() || undefined,
      });
    } else {
      // Create new bank detail
      createMutation.mutate({
        account_holder_name: trimmedHolder,
        sort_code: trimmedSortCode,
        account_number: trimmedAccountNumber,
        bank_name: formBankName.trim() || undefined,
        building_society_ref: formBuildingSocietyRef.trim() || undefined,
        is_primary: true,
        effective_from: new Date().toISOString().split("T")[0],
      });
    }
  }

  function handleCloseModal() {
    if (!isMutating) {
      setShowUpdateModal(false);
      resetForm();
    }
  }

  // Loading profile state
  if (meLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]" role="status">
        <Spinner size="lg" />
        <span className="sr-only">Loading profile...</span>
      </div>
    );
  }

  // Profile error or no employee
  if (!me) {
    const message =
      meError instanceof ApiError
        ? meError.message
        : meError instanceof Error
          ? meError.message
          : "Unable to load your profile.";
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Bank Details
        </h1>
        <p className="text-gray-500 dark:text-gray-400">{message}</p>
      </div>
    );
  }

  if (!me.employee) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Bank Details
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          No employee profile is linked to your account.
        </p>
      </div>
    );
  }

  // Loading bank details
  if (detailsLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="sr-only">Loading bank details...</span>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-gray-700 dark:text-gray-300 font-medium">
          Failed to load bank details
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {error instanceof ApiError
            ? error.message
            : "An unexpected error occurred."}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Bank Details
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            View and manage your bank account details for payroll
          </p>
        </div>
        <Button onClick={handleOpenUpdateModal}>
          <CreditCard className="h-4 w-4 mr-2" />
          Update Bank Details
        </Button>
      </div>

      {/* Security Notice */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
        <CardBody className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-blue-800 dark:text-blue-200">
              Your bank details are encrypted and stored securely
            </p>
            <p className="text-blue-700 dark:text-blue-300">
              Only authorised payroll administrators can access your full bank
              details. Changes to bank details may require additional
              verification.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Bank Details Card */}
      {bankDetails ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  Current Bank Details
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFullDetails(!showFullDetails)}
                aria-label={
                  showFullDetails ? "Hide full details" : "Show full details"
                }
              >
                {showFullDetails ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-1" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-1" />
                    Show
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Account Holder
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {bankDetails.accountHolderName}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Sort Code
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono">
                  {showFullDetails
                    ? bankDetails.sortCode.replace(
                        /(\d{2})(\d{2})(\d{2})/,
                        "$1-$2-$3"
                      )
                    : maskSortCode(bankDetails.sortCode)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Account Number
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono">
                  {showFullDetails
                    ? bankDetails.accountNumber
                    : maskAccountNumber(bankDetails.accountNumber)}
                </dd>
              </div>
              {bankDetails.bankName && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Bank Name
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    {bankDetails.bankName}
                  </dd>
                </div>
              )}
              {bankDetails.buildingSocietyRef && (
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Building Society Reference
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    {bankDetails.buildingSocietyRef}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Last Updated
                </dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {formatDate(bankDetails.updatedAt)}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="text-center py-12">
            <CreditCard className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              No bank details on file
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Add your bank details so your employer can process your salary
              payments.
            </p>
            <Button onClick={handleOpenUpdateModal}>
              <CreditCard className="h-4 w-4 mr-2" />
              Add Bank Details
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Update Modal */}
      <Modal open={showUpdateModal} onClose={handleCloseModal} size="lg">
        <ModalHeader
          title={
            bankDetails ? "Update Bank Details" : "Add Bank Details"
          }
        />
        <ModalBody>
          <div className="space-y-4">
            <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
              <CardBody className="flex items-start gap-3 py-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Please double-check all details before submitting. Incorrect
                  bank details may cause a delay in your salary payment.
                </p>
              </CardBody>
            </Card>
            <Input
              label="Account Holder Name"
              placeholder="e.g. John Smith"
              value={formAccountHolder}
              onChange={(e) => setFormAccountHolder(e.target.value)}
              required
              id="bank-account-holder"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Sort Code"
                placeholder="e.g. 12-34-56"
                value={formSortCode}
                onChange={(e) => setFormSortCode(e.target.value)}
                required
                id="bank-sort-code"
                maxLength={8}
              />
              <Input
                label="Account Number"
                placeholder="e.g. 12345678"
                value={formAccountNumber}
                onChange={(e) => setFormAccountNumber(e.target.value)}
                required
                id="bank-account-number"
                maxLength={8}
              />
            </div>
            <Input
              label="Bank Name (Optional)"
              placeholder="e.g. Barclays"
              value={formBankName}
              onChange={(e) => setFormBankName(e.target.value)}
              id="bank-name"
            />
            <Input
              label="Building Society Reference (Optional)"
              placeholder="If applicable"
              value={formBuildingSocietyRef}
              onChange={(e) => setFormBuildingSocietyRef(e.target.value)}
              id="bank-building-society-ref"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={handleCloseModal}
            disabled={isMutating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={
              !formAccountHolder.trim() ||
              !formSortCode.trim() ||
              !formAccountNumber.trim() ||
              isMutating
            }
            loading={isMutating}
          >
            {isMutating
              ? "Saving..."
              : bankDetails
                ? "Update Details"
                : "Add Details"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
