import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Plus,
  Shield,
  Search,
  CheckCircle,
  AlertTriangle,
  Clock,
  FileText,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { useToast } from "~/components/ui/toast";
import { Button } from "~/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "~/components/ui/modal";
import { api, ApiError } from "~/lib/api-client";

interface DbsCheck {
  id: string;
  employeeId: string;
  checkLevel: "basic" | "standard" | "enhanced" | "enhanced_barred";
  certificateNumber: string | null;
  issueDate: string | null;
  dbsUpdateServiceRegistered: boolean;
  updateServiceId: string | null;
  status: "pending" | "submitted" | "received" | "clear" | "flagged" | "expired";
  result: string | null;
  expiryDate: string | null;
  checkedBy: string | null;
  notes: string | null;
  createdAt: string;
  employeeName?: string;
}

interface CreateDbsCheckData {
  employeeId: string;
  checkLevel: string;
  notes: string;
}

const emptyForm: CreateDbsCheckData = {
  employeeId: "",
  checkLevel: "basic",
  notes: "",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  submitted: "Submitted",
  received: "Received",
  clear: "Clear",
  flagged: "Flagged",
  expired: "Expired",
};

const statusColors: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  received: "bg-yellow-100 text-yellow-700",
  clear: "bg-green-100 text-green-700",
  flagged: "bg-red-100 text-red-700",
  expired: "bg-orange-100 text-orange-700",
};

const levelLabels: Record<string, string> = {
  basic: "Basic",
  standard: "Standard",
  enhanced: "Enhanced",
  enhanced_barred: "Enhanced + Barred",
};

export default function DbsChecksPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateDbsCheckData>({ ...emptyForm });
  const [selectedCheck, setSelectedCheck] = useState<DbsCheck | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultData, setResultData] = useState({
    certificateNumber: "",
    issueDate: "",
    result: "",
    expiryDate: "",
    dbsUpdateServiceRegistered: false,
    updateServiceId: "",
    clear: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dbs-checks", search, statusFilter, levelFilter],
    queryFn: () =>
      api.get<{ dbsChecks: DbsCheck[]; count: number }>(
        "/dbs-checks",
        {
          params: {
            search: search || undefined,
            status: statusFilter || undefined,
            checkLevel: levelFilter || undefined,
          },
        }
      ),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateDbsCheckData) =>
      api.post("/dbs-checks", {
        employeeId: data.employeeId,
        checkLevel: data.checkLevel,
        notes: data.notes || undefined,
      }),
    onSuccess: () => {
      toast.success("DBS check created");
      queryClient.invalidateQueries({ queryKey: ["admin-dbs-checks"] });
      setShowCreateModal(false);
      setFormData({ ...emptyForm });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to create DBS check");
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => api.post(`/dbs-checks/${id}/submit`, {}),
    onSuccess: () => {
      toast.success("DBS check submitted");
      queryClient.invalidateQueries({ queryKey: ["admin-dbs-checks"] });
      setSelectedCheck(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit DBS check");
    },
  });

  const recordResultMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof resultData }) =>
      api.post(`/dbs-checks/${id}/record-result`, {
        certificateNumber: data.certificateNumber,
        issueDate: data.issueDate,
        result: data.result || undefined,
        expiryDate: data.expiryDate || undefined,
        dbsUpdateServiceRegistered: data.dbsUpdateServiceRegistered,
        updateServiceId: data.updateServiceId || undefined,
        clear: data.clear,
      }),
    onSuccess: () => {
      toast.success("DBS result recorded");
      queryClient.invalidateQueries({ queryKey: ["admin-dbs-checks"] });
      setShowResultModal(false);
      setSelectedCheck(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to record DBS result");
    },
  });

  const checks = data?.dbsChecks || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "clear": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "flagged": return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case "expired": return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case "submitted": return <FileText className="h-4 w-4 text-blue-600" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/talent/recruitment")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">DBS Checks</h1>
          <p className="text-gray-600">
            Manage Disclosure and Barring Service checks
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New DBS Check
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
                placeholder="Search by certificate number..."
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
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg"
            >
              <option value="">All Levels</option>
              {Object.entries(levelLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </CardBody>
      </Card>

      {/* DBS Checks List */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              DBS Checks
            </h3>
            <span className="text-sm text-gray-500">{checks.length} checks</span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : checks.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Shield className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              <p>No DBS checks found</p>
              <p className="text-sm">Create a new DBS check to get started</p>
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
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                        {getStatusIcon(check.status)}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {check.employeeName || check.employeeId}
                        </h4>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                          <Badge variant="secondary">
                            {levelLabels[check.checkLevel]}
                          </Badge>
                          {check.certificateNumber && (
                            <span>Cert: {check.certificateNumber}</span>
                          )}
                          {check.dbsUpdateServiceRegistered && (
                            <Badge variant="secondary">Update Service</Badge>
                          )}
                        </div>
                        {check.expiryDate && (
                          <p className="text-xs text-gray-400 mt-1">
                            Expires: {new Date(check.expiryDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[check.status]}`}>
                        {statusLabels[check.status]}
                      </span>
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

      {/* Create DBS Check Modal */}
      {showCreateModal && (
        <Modal open onClose={() => setShowCreateModal(false)} size="md">
          <ModalHeader>
            <h3 className="text-lg font-semibold">New DBS Check</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label htmlFor="dbs-employee" className="block text-sm font-medium text-gray-700 mb-1">
                  Employee ID <span className="text-red-500">*</span>
                </label>
                <input
                  id="dbs-employee"
                  type="text"
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Enter employee UUID"
                />
              </div>
              <div>
                <label htmlFor="dbs-level" className="block text-sm font-medium text-gray-700 mb-1">
                  Check Level <span className="text-red-500">*</span>
                </label>
                <select
                  id="dbs-level"
                  value={formData.checkLevel}
                  onChange={(e) => setFormData({ ...formData, checkLevel: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  {Object.entries(levelLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="dbs-notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  id="dbs-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  rows={3}
                  placeholder="Additional notes..."
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(formData)}
              disabled={!formData.employeeId.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* DBS Check Detail Modal */}
      {selectedCheck && !showResultModal && (
        <Modal open onClose={() => setSelectedCheck(null)} size="md">
          <ModalHeader>
            <h3 className="text-lg font-semibold">DBS Check Details</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[selectedCheck.status]}`}>
                  {statusLabels[selectedCheck.status]}
                </span>
                <Badge variant="secondary">{levelLabels[selectedCheck.checkLevel]}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Employee</div>
                  <div className="text-sm">{selectedCheck.employeeName || selectedCheck.employeeId}</div>
                </div>
                {selectedCheck.certificateNumber && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Certificate Number</div>
                    <div className="text-sm">{selectedCheck.certificateNumber}</div>
                  </div>
                )}
                {selectedCheck.issueDate && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Issue Date</div>
                    <div className="text-sm">{new Date(selectedCheck.issueDate).toLocaleDateString()}</div>
                  </div>
                )}
                {selectedCheck.expiryDate && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Expiry Date</div>
                    <div className="text-sm">{new Date(selectedCheck.expiryDate).toLocaleDateString()}</div>
                  </div>
                )}
              </div>

              {selectedCheck.result && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Result</div>
                  <div className="text-sm">{selectedCheck.result}</div>
                </div>
              )}

              {selectedCheck.notes && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Notes</div>
                  <div className="text-sm">{selectedCheck.notes}</div>
                </div>
              )}

              {/* Actions */}
              <div className="border-t pt-4 flex flex-wrap gap-2">
                {selectedCheck.status === "pending" && (
                  <Button
                    onClick={() => submitMutation.mutate(selectedCheck.id)}
                    disabled={submitMutation.isPending}
                  >
                    {submitMutation.isPending ? "Submitting..." : "Submit to DBS"}
                  </Button>
                )}
                {(selectedCheck.status === "submitted" || selectedCheck.status === "received") && (
                  <Button
                    onClick={() => {
                      setResultData({
                        certificateNumber: selectedCheck.certificateNumber || "",
                        issueDate: "",
                        result: "",
                        expiryDate: "",
                        dbsUpdateServiceRegistered: selectedCheck.dbsUpdateServiceRegistered,
                        updateServiceId: selectedCheck.updateServiceId || "",
                        clear: true,
                      });
                      setShowResultModal(true);
                    }}
                  >
                    Record Result
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

      {/* Record Result Modal */}
      {showResultModal && selectedCheck && (
        <Modal open onClose={() => setShowResultModal(false)} size="md">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Record DBS Result</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label htmlFor="result-cert" className="block text-sm font-medium text-gray-700 mb-1">
                  Certificate Number <span className="text-red-500">*</span>
                </label>
                <input
                  id="result-cert"
                  type="text"
                  value={resultData.certificateNumber}
                  onChange={(e) => setResultData({ ...resultData, certificateNumber: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                />
              </div>
              <div>
                <label htmlFor="result-issue" className="block text-sm font-medium text-gray-700 mb-1">
                  Issue Date <span className="text-red-500">*</span>
                </label>
                <input
                  id="result-issue"
                  type="date"
                  value={resultData.issueDate}
                  onChange={(e) => setResultData({ ...resultData, issueDate: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                />
              </div>
              <div>
                <label htmlFor="result-outcome" className="block text-sm font-medium text-gray-700 mb-1">
                  Outcome <span className="text-red-500">*</span>
                </label>
                <select
                  id="result-outcome"
                  value={resultData.clear ? "clear" : "flagged"}
                  onChange={(e) => setResultData({ ...resultData, clear: e.target.value === "clear" })}
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  <option value="clear">Clear - No relevant information disclosed</option>
                  <option value="flagged">Flagged - Information disclosed</option>
                </select>
              </div>
              <div>
                <label htmlFor="result-expiry" className="block text-sm font-medium text-gray-700 mb-1">
                  Expiry Date
                </label>
                <input
                  id="result-expiry"
                  type="date"
                  value={resultData.expiryDate}
                  onChange={(e) => setResultData({ ...resultData, expiryDate: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="result-update-service"
                  type="checkbox"
                  checked={resultData.dbsUpdateServiceRegistered}
                  onChange={(e) => setResultData({ ...resultData, dbsUpdateServiceRegistered: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="result-update-service" className="text-sm text-gray-700">
                  DBS Update Service Registered
                </label>
              </div>
              {resultData.dbsUpdateServiceRegistered && (
                <div>
                  <label htmlFor="result-update-id" className="block text-sm font-medium text-gray-700 mb-1">
                    Update Service ID
                  </label>
                  <input
                    id="result-update-id"
                    type="text"
                    value={resultData.updateServiceId}
                    onChange={(e) => setResultData({ ...resultData, updateServiceId: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  />
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowResultModal(false)} disabled={recordResultMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => recordResultMutation.mutate({ id: selectedCheck.id, data: resultData })}
              disabled={
                !resultData.certificateNumber.trim() ||
                !resultData.issueDate.trim() ||
                recordResultMutation.isPending
              }
            >
              {recordResultMutation.isPending ? "Recording..." : "Record Result"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
