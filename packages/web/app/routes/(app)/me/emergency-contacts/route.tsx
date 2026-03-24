import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Phone,
  Plus,
  Star,
  Trash2,
  X,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Input,
  Select,
  ConfirmModal,
  useToast,
} from "~/components/ui";
import { Spinner } from "~/components/ui/spinner";
import { api, ApiError } from "~/lib/api-client";

type PortalMeResponse = {
  user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  employee: { id: string; firstName: string; lastName: string } | null;
  tenant: { id: string; name: string };
};

interface EmergencyContact {
  id: string;
  employeeId: string;
  name: string;
  relationship: string;
  phone: string;
  email: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EmergencyContactListResponse {
  items: EmergencyContact[];
  nextCursor: string | null;
  hasMore: boolean;
}

const RELATIONSHIP_OPTIONS = [
  { value: "spouse", label: "Spouse" },
  { value: "partner", label: "Partner" },
  { value: "parent", label: "Parent" },
  { value: "child", label: "Child" },
  { value: "sibling", label: "Sibling" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
];

const RELATIONSHIP_LABELS: Record<string, string> = Object.fromEntries(
  RELATIONSHIP_OPTIONS.map((o) => [o.value, o.label])
);

export default function EmergencyContactsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formRelationship, setFormRelationship] = useState("spouse");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formIsPrimary, setFormIsPrimary] = useState(false);

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

  // Fetch emergency contacts using the employee-scoped endpoint
  const {
    data,
    isLoading: contactsLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["my-emergency-contacts", employeeId],
    queryFn: () =>
      api.get<EmergencyContactListResponse>(
        `/employees/${employeeId}/emergency-contacts`
      ),
    enabled: Boolean(employeeId),
  });

  const createMutation = useMutation({
    mutationFn: (contactData: {
      name: string;
      relationship: string;
      phone: string;
      email?: string;
      isPrimary: boolean;
    }) =>
      api.post(`/employees/${employeeId}/emergency-contacts`, {
        name: contactData.name,
        relationship: contactData.relationship,
        phone_number: contactData.phone,
        email: contactData.email,
        is_primary: contactData.isPrimary,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["my-emergency-contacts"],
      });
      toast.success("Emergency contact added");
      resetForm();
      setShowAddForm(false);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to add emergency contact";
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (contactId: string) =>
      api.delete(`/emergency-contacts/${contactId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["my-emergency-contacts"],
      });
      toast.success("Emergency contact removed");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to remove emergency contact";
      toast.error(message);
    },
  });

  const contacts = data?.items ?? [];

  function resetForm() {
    setFormName("");
    setFormRelationship("spouse");
    setFormPhone("");
    setFormEmail("");
    setFormIsPrimary(false);
  }

  function handleAdd() {
    const trimmedName = formName.trim();
    const trimmedPhone = formPhone.trim();
    if (!trimmedName) {
      toast.error("Contact name is required");
      return;
    }
    if (!trimmedPhone) {
      toast.error("Phone number is required");
      return;
    }
    createMutation.mutate({
      name: trimmedName,
      relationship: formRelationship,
      phone: trimmedPhone,
      email: formEmail.trim() || undefined,
      isPrimary: formIsPrimary,
    });
  }

  function handleCancelForm() {
    if (!createMutation.isPending) {
      setShowAddForm(false);
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
          Emergency Contacts
        </h1>
        <p className="text-gray-500 dark:text-gray-400">{message}</p>
      </div>
    );
  }

  if (!me.employee) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Emergency Contacts
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          No employee profile is linked to your account.
        </p>
      </div>
    );
  }

  // Loading contacts
  if (contactsLoading) {
    return (
      <div className="flex items-center justify-center py-12" role="status">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="sr-only">Loading emergency contacts...</span>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-gray-700 dark:text-gray-300 font-medium">
          Failed to load emergency contacts
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
            Emergency Contacts
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your emergency contact information
          </p>
        </div>
        {!showAddForm && (
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        )}
      </div>

      {/* Inline Add Form */}
      {showAddForm && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Add Emergency Contact
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelForm}
                disabled={createMutation.isPending}
                aria-label="Close add contact form"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Full Name"
                placeholder="e.g. Jane Smith"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                id="contact-name"
              />
              <Select
                label="Relationship"
                value={formRelationship}
                onChange={(e) => setFormRelationship(e.target.value)}
                options={RELATIONSHIP_OPTIONS}
                id="contact-relationship"
              />
              <Input
                label="Phone Number"
                placeholder="e.g. 07700 900000"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                required
                id="contact-phone"
                type="tel"
              />
              <Input
                label="Email (Optional)"
                placeholder="e.g. jane.smith@email.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                id="contact-email"
                type="email"
              />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="contact-is-primary"
                checked={formIsPrimary}
                onChange={(e) => setFormIsPrimary(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="contact-is-primary"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                Set as primary emergency contact
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleCancelForm}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAdd}
                disabled={
                  !formName.trim() ||
                  !formPhone.trim() ||
                  createMutation.isPending
                }
                loading={createMutation.isPending}
              >
                {createMutation.isPending ? "Adding..." : "Add Contact"}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Contacts List */}
      {contacts.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Phone className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              No emergency contacts
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Add an emergency contact so we can reach someone in case of an
              emergency.
            </p>
            {!showAddForm && (
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Contact
              </Button>
            )}
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {contacts.map((contact) => (
            <Card
              key={contact.id}
              className={
                contact.isPrimary
                  ? "border-blue-200 dark:border-blue-800"
                  : undefined
              }
            >
              <CardBody>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                      <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100">
                          {contact.name}
                        </h3>
                        {contact.isPrimary && (
                          <Badge variant="info">
                            <Star className="h-3 w-3 mr-1" />
                            Primary
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {RELATIONSHIP_LABELS[contact.relationship] ||
                          contact.relationship}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>{contact.phone}</span>
                        {contact.email && <span>{contact.email}</span>}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirm({ id: contact.id, name: contact.name })}
                    disabled={deleteMutation.isPending}
                    aria-label={`Remove ${contact.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <ConfirmModal
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            deleteMutation.mutate(deleteConfirm.id);
          }
          setDeleteConfirm(null);
        }}
        title="Remove Emergency Contact"
        message={`Remove ${deleteConfirm?.name ?? "this contact"} as an emergency contact?`}
        confirmLabel="Remove"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
