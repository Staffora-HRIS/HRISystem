export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Plus,
  UserCheck,
  Mail,
  Phone,
  Building2,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Send,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { useToast } from "~/components/ui/toast";
import { Button } from "~/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "~/components/ui/modal";
import { api, ApiError } from "~/lib/api-client";

interface ReferenceCheck {
  id: string;
  candidateId: string | null;
  employeeId: string | null;
  refereeName: string;
  refereeEmail: string;
  refereePhone: string | null;
  refereeRelationship: "manager" | "colleague" | "academic" | "character";
  companyName: string | null;
  jobTitle: string | null;
  datesFrom: string | null;
  datesTo: string | null;
  status: "pending" | "sent" | "received" | "verified" | "failed";
  sentAt: string | null;
  receivedAt: string | null;
  verifiedBy: string | null;
  verificationNotes: string | null;
  referenceContent: string | null;
  satisfactory: boolean | null;
  createdAt: string;
}

interface CreateReferenceCheckData {
  candidateId: string;
  refereeName: string;
  refereeEmail: string;
  refereePhone: string;
  refereeRelationship: string;
  companyName: string;
  jobTitle: string;
  datesFrom: string;
  datesTo: string;
}

const emptyForm: CreateReferenceCheckData = {
  candidateId: "",
  refereeName: "",
  refereeEmail: "",
  refereePhone: "",
  refereeRelationship: "manager",
  companyName: "",
  jobTitle: "",
  datesFrom: "",
  datesTo: "",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  sent: "Sent",
  received: "Received",
  verified: "Verified",
  failed: "Failed",
};

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  received: "bg-yellow-100 text-yellow-700",
  verified: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const relationshipLabels: Record<string, string> = {
  manager: "Manager",
  colleague: "Colleague",
  academic: "Academic",
  character: "Character",
};

export default function ReferenceChecksPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateReferenceCheckData>({ ...emptyForm });
  const [selectedCheck, setSelectedCheck] = useState<ReferenceCheck | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyData, setVerifyData] = useState({ verificationNotes: "", satisfactory: true });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-reference-checks", search, statusFilter],
    queryFn: () =>
      api.get<{ referenceChecks: ReferenceCheck[]; count: number }>(
        "/reference-checks",
        {
          params: {
            search: search || undefined,
            status: statusFilter || undefined,
          },
        }
      ),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateReferenceCheckData) =>
      api.post("/reference-checks", {
        candidateId: data.candidateId || undefined,
        refereeName: data.refereeName,
        refereeEmail: data.refereeEmail,
        refereePhone: data.refereePhone || undefined,
        refereeRelationship: data.refereeRelationship,
        companyName: data.companyName || undefined,
        jobTitle: data.jobTitle || undefined,
        datesFrom: data.datesFrom || undefined,
        datesTo: data.datesTo || undefined,
      }),
    onSuccess: () => {
      toast.success("Reference check created");
      queryClient.invalidateQueries({ queryKey: ["admin-reference-checks"] });
      setShowCreateModal(false);
      setFormData({ ...emptyForm });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to create reference check");
    },
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/reference-checks/${id}/send`, {}),
    onSuccess: () => {
      toast.success("Reference request sent");
      queryClient.invalidateQueries({ queryKey: ["admin-reference-checks"] });
      setSelectedCheck(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to send reference request");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { verificationNotes?: string; satisfactory: boolean } }) =>
      api.post(`/reference-checks/${id}/verify`, data),
    onSuccess: () => {
      toast.success("Reference check verified");
      queryClient.invalidateQueries({ queryKey: ["admin-reference-checks"] });
      setShowVerifyModal(false);
      setSelectedCheck(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to verify reference check");
    },
  });

  const checks = data?.referenceChecks || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "verified": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-600" />;
      case "sent": return <Send className="h-4 w-4 text-blue-600" />;
      case "received": return <Mail className="h-4 w-4 text-yellow-600" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const isFormValid =
    formData.refereeName.trim() !== "" &&
    formData.refereeEmail.trim() !== "" &&
    (formData.candidateId.trim() !== "");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/talent/recruitment")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Reference Checks</h1>
          <p className="text-gray-600">
            Manage employment reference checks for candidates
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Reference Check
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by referee name, email, or company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg"
            >
              <option value="">All Statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </CardBody>
      </Card>

      {/* Reference Checks List */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-blue-600" />
              Reference Checks
            </h3>
            <span className="text-sm text-gray-500">{checks.length} checks</span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : checks.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <UserCheck className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              <p>No reference checks found</p>
              <p className="text-sm">Create a new reference check to get started</p>
            </div>
          ) : (
            <div className="divide-y">
              {checks.map((check) => (
                <div
                  key={check.id}
                  className="p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedCheck(check)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                        {getStatusIcon(check.status)}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">{check.refereeName}</h4>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {check.refereeEmail}
                          </span>
                          {check.refereePhone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {check.refereePhone}
                            </span>
                          )}
                        </div>
                        {check.companyName && (
                          <div className="flex items-center gap-1 mt-1 text-sm text-gray-400">
                            <Building2 className="h-3 w-3" />
                            {check.companyName}
                            {check.jobTitle && ` - ${check.jobTitle}`}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[check.status]}`}>
                        {statusLabels[check.status]}
                      </span>
                      <Badge variant="secondary">
                        {relationshipLabels[check.refereeRelationship]}
                      </Badge>
                      {check.satisfactory !== null && (
                        <span className={`text-xs font-medium ${check.satisfactory ? "text-green-600" : "text-red-600"}`}>
                          {check.satisfactory ? "Satisfactory" : "Unsatisfactory"}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(check.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create Reference Check Modal */}
      {showCreateModal && (
        <Modal open onClose={() => setShowCreateModal(false)} size="md">
          <ModalHeader>
            <h3 className="text-lg font-semibold">New Reference Check</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label htmlFor="ref-candidate" className="block text-sm font-medium text-gray-700 mb-1">
                  Candidate ID <span className="text-red-500">*</span>
                </label>
                <input
                  id="ref-candidate"
                  type="text"
                  value={formData.candidateId}
                  onChange={(e) => setFormData({ ...formData, candidateId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Enter candidate UUID"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ref-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Referee Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="ref-name"
                    type="text"
                    value={formData.refereeName}
                    onChange={(e) => setFormData({ ...formData, refereeName: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label htmlFor="ref-email" className="block text-sm font-medium text-gray-700 mb-1">
                    Referee Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="ref-email"
                    type="email"
                    value={formData.refereeEmail}
                    onChange={(e) => setFormData({ ...formData, refereeEmail: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                    placeholder="jane.smith@company.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ref-phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    id="ref-phone"
                    type="tel"
                    value={formData.refereePhone}
                    onChange={(e) => setFormData({ ...formData, refereePhone: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                    placeholder="+44 7700 900000"
                  />
                </div>
                <div>
                  <label htmlFor="ref-relationship" className="block text-sm font-medium text-gray-700 mb-1">
                    Relationship
                  </label>
                  <select
                    id="ref-relationship"
                    value={formData.refereeRelationship}
                    onChange={(e) => setFormData({ ...formData, refereeRelationship: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  >
                    {Object.entries(relationshipLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ref-company" className="block text-sm font-medium text-gray-700 mb-1">
                    Company
                  </label>
                  <input
                    id="ref-company"
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                    placeholder="Acme Ltd"
                  />
                </div>
                <div>
                  <label htmlFor="ref-jobtitle" className="block text-sm font-medium text-gray-700 mb-1">
                    Job Title
                  </label>
                  <input
                    id="ref-jobtitle"
                    type="text"
                    value={formData.jobTitle}
                    onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                    placeholder="Software Engineer"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ref-from" className="block text-sm font-medium text-gray-700 mb-1">
                    Dates From
                  </label>
                  <input
                    id="ref-from"
                    type="date"
                    value={formData.datesFrom}
                    onChange={(e) => setFormData({ ...formData, datesFrom: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  />
                </div>
                <div>
                  <label htmlFor="ref-to" className="block text-sm font-medium text-gray-700 mb-1">
                    Dates To
                  </label>
                  <input
                    id="ref-to"
                    type="date"
                    value={formData.datesTo}
                    onChange={(e) => setFormData({ ...formData, datesTo: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  />
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate(formData)} disabled={!isFormValid || createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Reference Check Detail Modal */}
      {selectedCheck && !showVerifyModal && (
        <Modal open onClose={() => setSelectedCheck(null)} size="md">
          <ModalHeader>
            <h3 className="text-lg font-semibold">{selectedCheck.refereeName}</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[selectedCheck.status]}`}>
                  {statusLabels[selectedCheck.status]}
                </span>
                <Badge variant="secondary">
                  {relationshipLabels[selectedCheck.refereeRelationship]}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Email</div>
                  <a href={`mailto:${selectedCheck.refereeEmail}`} className="text-sm text-blue-600 hover:underline">
                    {selectedCheck.refereeEmail}
                  </a>
                </div>
                {selectedCheck.refereePhone && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Phone</div>
                    <div className="text-sm">{selectedCheck.refereePhone}</div>
                  </div>
                )}
                {selectedCheck.companyName && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Company</div>
                    <div className="text-sm">{selectedCheck.companyName}</div>
                  </div>
                )}
                {selectedCheck.jobTitle && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Job Title</div>
                    <div className="text-sm">{selectedCheck.jobTitle}</div>
                  </div>
                )}
              </div>

              {selectedCheck.referenceContent && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Reference Content</div>
                  <div className="text-sm whitespace-pre-wrap">{selectedCheck.referenceContent}</div>
                </div>
              )}

              {selectedCheck.verificationNotes && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Verification Notes</div>
                  <div className="text-sm">{selectedCheck.verificationNotes}</div>
                </div>
              )}

              {/* Actions */}
              <div className="border-t pt-4 flex flex-wrap gap-2">
                {selectedCheck.status === "pending" && (
                  <Button
                    onClick={() => sendMutation.mutate(selectedCheck.id)}
                    disabled={sendMutation.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {sendMutation.isPending ? "Sending..." : "Send Request"}
                  </Button>
                )}
                {selectedCheck.status === "received" && (
                  <Button
                    onClick={() => {
                      setVerifyData({ verificationNotes: "", satisfactory: true });
                      setShowVerifyModal(true);
                    }}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Verify Reference
                  </Button>
                )}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setSelectedCheck(null)}>Close</Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Verify Modal */}
      {showVerifyModal && selectedCheck && (
        <Modal open onClose={() => setShowVerifyModal(false)} size="sm">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Verify Reference</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label htmlFor="verify-satisfactory" className="block text-sm font-medium text-gray-700 mb-1">
                  Result
                </label>
                <select
                  id="verify-satisfactory"
                  value={verifyData.satisfactory ? "true" : "false"}
                  onChange={(e) => setVerifyData({ ...verifyData, satisfactory: e.target.value === "true" })}
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  <option value="true">Satisfactory</option>
                  <option value="false">Unsatisfactory</option>
                </select>
              </div>
              <div>
                <label htmlFor="verify-notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  id="verify-notes"
                  value={verifyData.verificationNotes}
                  onChange={(e) => setVerifyData({ ...verifyData, verificationNotes: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  rows={3}
                  placeholder="Add verification notes..."
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowVerifyModal(false)} disabled={verifyMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                verifyMutation.mutate({
                  id: selectedCheck.id,
                  data: {
                    verificationNotes: verifyData.verificationNotes || undefined,
                    satisfactory: verifyData.satisfactory,
                  },
                })
              }
              disabled={verifyMutation.isPending}
            >
              {verifyMutation.isPending ? "Verifying..." : "Verify"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
