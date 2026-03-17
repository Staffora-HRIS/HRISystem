import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  User,
  Pencil,
  Shield,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Select,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { Spinner } from "~/components/ui/spinner";
import { api, ApiError } from "~/lib/api-client";

// =============================================================================
// Types
// =============================================================================

type PortalMeResponse = {
  user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  employee:
    | {
        id: string;
        employeeNumber: string;
        firstName: string;
        lastName: string;
        positionTitle?: string | null;
        orgUnitName?: string | null;
        status: string;
        hireDate?: string | null;
      }
    | null;
  tenant: { id: string; name: string };
};

interface ChangeRequestResponse {
  id: string;
  field_category: string;
  field_name: string;
  old_value: string | null;
  new_value: string;
  requires_approval: boolean;
  status: string;
  created_at: string;
}

interface ChangeRequestListResponse {
  items: ChangeRequestResponse[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Sensitive fields requiring approval - mapped to user-friendly labels
 */
const SENSITIVE_FIELD_LABELS: Record<string, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  middle_name: "Middle Name",
  date_of_birth: "Date of Birth",
  nationality: "Nationality",
};

/**
 * Non-sensitive fields that can be updated directly
 */
const NON_SENSITIVE_FIELD_LABELS: Record<string, string> = {
  preferred_name: "Preferred Name",
  marital_status: "Marital Status",
  gender: "Gender",
};

const GENDER_OPTIONS = [
  { value: "", label: "Prefer not to say" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const MARITAL_STATUS_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
  { value: "domestic_partnership", label: "Domestic Partnership" },
];

const STATUS_BADGE_MAP: Record<string, "info" | "success" | "danger" | "warning"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "info",
};

// =============================================================================
// Component
// =============================================================================

export default function MyProfilePage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  // Modal and form state
  const [showNameChangeModal, setShowNameChangeModal] = useState(false);
  const [showEditNonSensitive, setShowEditNonSensitive] = useState(false);

  // Name change form (sensitive)
  const [formFirstName, setFormFirstName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formMiddleName, setFormMiddleName] = useState("");

  // Non-sensitive form
  const [formPreferredName, setFormPreferredName] = useState("");
  const [formGender, setFormGender] = useState("");
  const [formMaritalStatus, setFormMaritalStatus] = useState("");

  // Fetch profile
  const {
    data: me,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => api.get<PortalMeResponse>("/portal/me"),
  });

  // Fetch pending change requests
  const { data: pendingRequests } = useQuery({
    queryKey: ["portal", "change-requests", "pending"],
    queryFn: () =>
      api.get<ChangeRequestListResponse>("/portal/change-requests", {
        params: { status: "pending", limit: 10 },
      }),
    enabled: Boolean(me?.employee),
  });

  // Mutation: submit bulk change request (for name changes)
  const bulkChangeMutation = useMutation({
    mutationFn: (changes: Array<{
      field_category: string;
      field_name: string;
      old_value: string | null;
      new_value: string;
    }>) => api.post("/portal/change-requests/bulk", { changes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "change-requests"] });
      toast.success("Change request submitted for approval");
      setShowNameChangeModal(false);
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to submit change request";
      toast.error(message);
    },
  });

  // Mutation: submit single change request (for non-sensitive direct update)
  const singleChangeMutation = useMutation({
    mutationFn: (data: {
      field_category: string;
      field_name: string;
      old_value: string | null;
      new_value: string;
    }) => api.post<ChangeRequestResponse>("/portal/change-requests", data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["portal", "change-requests"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "me"] });
      if (data && !data.requires_approval) {
        toast.success("Details updated successfully");
      } else {
        toast.success("Change request submitted");
      }
      setShowEditNonSensitive(false);
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to update details";
      toast.error(message);
    },
  });

  // ===========================================================================
  // Handlers
  // ===========================================================================

  function handleOpenNameChange() {
    if (me?.employee) {
      setFormFirstName(me.employee.firstName);
      setFormLastName(me.employee.lastName);
      setFormMiddleName("");
    }
    setShowNameChangeModal(true);
  }

  function handleSubmitNameChange() {
    if (!me?.employee) return;

    const changes: Array<{
      field_category: string;
      field_name: string;
      old_value: string | null;
      new_value: string;
    }> = [];

    const trimmedFirst = formFirstName.trim();
    const trimmedLast = formLastName.trim();
    const trimmedMiddle = formMiddleName.trim();

    if (!trimmedFirst || !trimmedLast) {
      toast.error("First name and last name are required");
      return;
    }

    if (trimmedFirst !== me.employee.firstName) {
      changes.push({
        field_category: "personal",
        field_name: "first_name",
        old_value: me.employee.firstName,
        new_value: trimmedFirst,
      });
    }

    if (trimmedLast !== me.employee.lastName) {
      changes.push({
        field_category: "personal",
        field_name: "last_name",
        old_value: me.employee.lastName,
        new_value: trimmedLast,
      });
    }

    if (trimmedMiddle) {
      changes.push({
        field_category: "personal",
        field_name: "middle_name",
        old_value: null,
        new_value: trimmedMiddle,
      });
    }

    if (changes.length === 0) {
      toast.error("No changes detected");
      return;
    }

    bulkChangeMutation.mutate(changes);
  }

  function handleOpenNonSensitiveEdit() {
    setFormPreferredName("");
    setFormGender("");
    setFormMaritalStatus("");
    setShowEditNonSensitive(true);
  }

  function handleSubmitNonSensitive() {
    const trimmedPreferredName = formPreferredName.trim();
    const trimmedGender = formGender.trim();
    const trimmedMaritalStatus = formMaritalStatus.trim();

    // Submit each changed field separately
    const mutations: Array<{
      field_category: string;
      field_name: string;
      old_value: string | null;
      new_value: string;
    }> = [];

    if (trimmedPreferredName) {
      mutations.push({
        field_category: "personal",
        field_name: "preferred_name",
        old_value: null,
        new_value: trimmedPreferredName,
      });
    }

    if (trimmedGender) {
      mutations.push({
        field_category: "personal",
        field_name: "gender",
        old_value: null,
        new_value: trimmedGender,
      });
    }

    if (trimmedMaritalStatus) {
      mutations.push({
        field_category: "personal",
        field_name: "marital_status",
        old_value: null,
        new_value: trimmedMaritalStatus,
      });
    }

    if (mutations.length === 0) {
      toast.error("Please fill in at least one field to update");
      return;
    }

    // Submit the first change; if there are more, submit them sequentially
    // For simplicity, submit them all as a bulk request
    if (mutations.length === 1) {
      singleChangeMutation.mutate(mutations[0]);
    } else {
      bulkChangeMutation.mutate(mutations);
    }
  }

  const isMutating = bulkChangeMutation.isPending || singleChangeMutation.isPending;

  // ===========================================================================
  // Render
  // ===========================================================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]" role="status">
        <Spinner size="lg" />
        <span className="sr-only">Loading profile...</span>
      </div>
    );
  }

  if (!me) {
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load your profile.";

    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
        <p className="text-gray-500 dark:text-gray-400">{message}</p>
      </div>
    );
  }

  const name = [me.user.firstName, me.user.lastName].filter(Boolean).join(" ") || me.user.email;
  const pendingCount = pendingRequests?.items?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
          <p className="text-gray-500 dark:text-gray-400">{name}</p>
        </div>
        {me.employee && (
          <div className="flex items-center gap-2">
            <Link to="/me/change-requests">
              <Button variant="outline" size="sm">
                <Clock className="h-4 w-4 mr-1" />
                Change Requests
                {pendingCount > 0 && (
                  <Badge variant="warning" className="ml-1">{pendingCount}</Badge>
                )}
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Pending change requests notice */}
      {pendingCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <CardBody className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                You have {pendingCount} pending change request{pendingCount !== 1 ? "s" : ""}
              </p>
              <p className="text-amber-700 dark:text-amber-300">
                These changes are waiting for manager/HR approval.{" "}
                <Link to="/me/change-requests" className="underline font-medium">
                  View details
                </Link>
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Account Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Account</h2>
            </div>
          </CardHeader>
          <CardBody>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
                <dd className="text-sm text-gray-900 dark:text-gray-100">{me.user.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Organisation</dt>
                <dd className="text-sm text-gray-900 dark:text-gray-100">{me.tenant.name}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        {/* Employee Profile Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white">Employee Details</h2>
              </div>
              {me.employee && (
                <Button variant="ghost" size="sm" onClick={handleOpenNameChange}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit Name
                </Button>
              )}
            </div>
          </CardHeader>
          <CardBody>
            {!me.employee ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No employee profile is linked to your account.
              </p>
            ) : (
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Full Name</dt>
                  <dd className="text-sm text-gray-900 dark:text-gray-100">
                    {me.employee.firstName} {me.employee.lastName}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Employee Number</dt>
                  <dd className="text-sm text-gray-900 dark:text-gray-100">{me.employee.employeeNumber}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
                  <dd className="text-sm text-gray-900 dark:text-gray-100 capitalize">{me.employee.status}</dd>
                </div>
                {me.employee.positionTitle && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Position</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{me.employee.positionTitle}</dd>
                  </div>
                )}
                {me.employee.orgUnitName && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Department</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">{me.employee.orgUnitName}</dd>
                  </div>
                )}
                {me.employee.hireDate && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Hire Date</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">
                      {new Date(me.employee.hireDate).toLocaleDateString("en-GB", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </CardBody>
        </Card>

        {/* Personal Preferences Card (Non-Sensitive) */}
        {me.employee && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-gray-500" />
                  <h2 className="font-semibold text-gray-900 dark:text-white">Personal Preferences</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={handleOpenNonSensitiveEdit}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                These details can be updated directly without approval.
              </p>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Preferred Name</dt>
                  <dd className="text-sm text-gray-900 dark:text-gray-100 italic">Click Edit to set</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Gender</dt>
                  <dd className="text-sm text-gray-900 dark:text-gray-100 italic">Click Edit to set</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Marital Status</dt>
                  <dd className="text-sm text-gray-900 dark:text-gray-100 italic">Click Edit to set</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        )}

        {/* Quick Links Card */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-white">Related Pages</h2>
          </CardHeader>
          <CardBody>
            <div className="space-y-2">
              <Link
                to="/me/emergency-contacts"
                className="block text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                Emergency Contacts
              </Link>
              <Link
                to="/me/bank-details"
                className="block text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                Bank Details
              </Link>
              <Link
                to="/me/documents"
                className="block text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                Documents
              </Link>
              <Link
                to="/me/change-requests"
                className="block text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                Change Requests
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Name Change Modal (Sensitive - requires approval) */}
      <Modal
        open={showNameChangeModal}
        onClose={() => !isMutating && setShowNameChangeModal(false)}
        size="lg"
      >
        <ModalHeader title="Request Name Change" />
        <ModalBody>
          <div className="space-y-4">
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
              <CardBody className="flex items-start gap-3 py-3">
                <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Name changes require manager/HR approval. Your request will be reviewed and you will
                  be notified of the outcome.
                </p>
              </CardBody>
            </Card>
            <Input
              label="First Name"
              value={formFirstName}
              onChange={(e) => setFormFirstName(e.target.value)}
              required
              id="name-first"
            />
            <Input
              label="Middle Name (Optional)"
              value={formMiddleName}
              onChange={(e) => setFormMiddleName(e.target.value)}
              id="name-middle"
            />
            <Input
              label="Last Name"
              value={formLastName}
              onChange={(e) => setFormLastName(e.target.value)}
              required
              id="name-last"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowNameChangeModal(false)}
            disabled={isMutating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmitNameChange}
            disabled={!formFirstName.trim() || !formLastName.trim() || isMutating}
            loading={bulkChangeMutation.isPending}
          >
            Submit for Approval
          </Button>
        </ModalFooter>
      </Modal>

      {/* Non-Sensitive Edit Modal (Direct Update) */}
      <Modal
        open={showEditNonSensitive}
        onClose={() => !isMutating && setShowEditNonSensitive(false)}
        size="lg"
      >
        <ModalHeader title="Update Personal Preferences" />
        <ModalBody>
          <div className="space-y-4">
            <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <CardBody className="flex items-start gap-3 py-3">
                <AlertCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-green-700 dark:text-green-300">
                  These preferences are updated immediately without requiring approval.
                  Only fill in the fields you want to change.
                </p>
              </CardBody>
            </Card>
            <Input
              label="Preferred Name"
              placeholder="e.g. Jim"
              value={formPreferredName}
              onChange={(e) => setFormPreferredName(e.target.value)}
              id="pref-preferred-name"
            />
            <Select
              label="Gender"
              value={formGender}
              onChange={(e) => setFormGender(e.target.value)}
              options={GENDER_OPTIONS}
              id="pref-gender"
            />
            <Select
              label="Marital Status"
              value={formMaritalStatus}
              onChange={(e) => setFormMaritalStatus(e.target.value)}
              options={MARITAL_STATUS_OPTIONS}
              id="pref-marital-status"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowEditNonSensitive(false)}
            disabled={isMutating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmitNonSensitive}
            disabled={
              (!formPreferredName.trim() && !formGender && !formMaritalStatus) || isMutating
            }
            loading={singleChangeMutation.isPending || bulkChangeMutation.isPending}
          >
            Update
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
