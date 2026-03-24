import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/toast";
import { DocumentList } from "~/components/documents";
import { api, ApiError } from "~/lib/api-client";

interface DocumentSummary {
  totalDocuments: number;
  byCategory: Record<string, number>;
  expiringSoon: number;
}

export default function MyDocumentsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentListRef = useRef<HTMLDivElement>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({ name: "", category: "payslip", expirationDate: "" });

  const { data: summary } = useQuery({
    queryKey: ["my-documents-summary"],
    queryFn: () => api.get<DocumentSummary>("/documents/my-summary"),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("No file selected");

      // Step 1: Get a presigned upload URL from the backend
      const uploadUrlResponse = await api.get<{
        upload_url: string;
        file_key: string;
        expires_at: string;
      }>("/documents/upload-url", {
        params: {
          file_name: uploadFile.name,
          mime_type: uploadFile.type || "application/octet-stream",
        },
      });

      // Step 2: Upload the file to the presigned URL
      const putResponse = await fetch(uploadUrlResponse.upload_url, {
        method: "PUT",
        body: uploadFile,
        headers: { "Content-Type": uploadFile.type || "application/octet-stream" },
      });
      if (!putResponse.ok) throw new Error("File upload failed");

      // Step 3: Create the document record in the backend
      return api.post("/documents", {
        file_key: uploadUrlResponse.file_key,
        name: uploadForm.name.trim() || uploadFile.name,
        category: uploadForm.category,
        file_name: uploadFile.name,
        file_size: uploadFile.size,
        mime_type: uploadFile.type || "application/octet-stream",
        expires_at: uploadForm.expirationDate || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-documents-summary"] });
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
      toast.success("Document uploaded successfully");
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadForm({ name: "", category: "payslip", expirationDate: "" });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to upload document";
      toast.error(message);
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Documents</h1>
          <p className="text-gray-600">
            View and manage your personal documents
          </p>
        </div>
        <Button onClick={() => setShowUploadModal(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Alerts */}
      {summary?.expiringSoon && summary.expiringSoon > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardBody className="flex items-center gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div className="flex-1">
              <p className="font-medium text-yellow-900">
                Documents Expiring Soon
              </p>
              <p className="text-sm text-yellow-700">
                You have {summary.expiringSoon} document
                {summary.expiringSoon !== 1 ? "s" : ""} expiring within the
                next 30 days.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                documentListRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              View
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {summary?.totalDocuments || 0}
            </p>
            <p className="text-sm text-gray-500">Total Documents</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {summary?.byCategory?.contract || 0}
            </p>
            <p className="text-sm text-gray-500">Contracts</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {summary?.byCategory?.certificate || 0}
            </p>
            <p className="text-sm text-gray-500">Certificates</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-purple-600">
              {summary?.byCategory?.id || 0}
            </p>
            <p className="text-sm text-gray-500">ID Documents</p>
          </CardBody>
        </Card>
      </div>

      {/* Document List */}
      <div ref={documentListRef}>
        <DocumentList onUpload={() => setShowUploadModal(true)} />
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <h3 className="font-semibold">Upload Document</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              {/* Drop Zone */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f); }}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  uploadFile ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-500"
                }`}
              >
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                {uploadFile ? (
                  <p className="font-medium text-gray-900">{uploadFile.name}</p>
                ) : (
                  <p className="font-medium text-gray-700">Drop files here or click to upload</p>
                )}
                <p className="text-sm text-gray-500 mt-1">PDF, DOC, DOCX, JPG, PNG up to 10MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFile(f); }}
              />

              {/* Document Details */}
              <div className="space-y-3">
                <div>
                  <label htmlFor="doc-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Document Name
                  </label>
                  <input
                    id="doc-name"
                    type="text"
                    value={uploadForm.name}
                    onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                    placeholder="e.g., Driver's License"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="doc-category" className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    id="doc-category"
                    value={uploadForm.category}
                    onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="payslip">Payslip</option>
                    <option value="id">ID Document</option>
                    <option value="certificate">Certificate</option>
                    <option value="contract">Contract</option>
                    <option value="tax">Tax Document</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="doc-expiry" className="block text-sm font-medium text-gray-700 mb-1">
                    Expiration Date (Optional)
                  </label>
                  <input
                    id="doc-expiry"
                    type="date"
                    value={uploadForm.expirationDate}
                    onChange={(e) => setUploadForm({ ...uploadForm, expirationDate: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setShowUploadModal(false); setUploadFile(null); }}
                  disabled={uploadMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    if (!uploadFile) { toast.error("Please select a file"); return; }
                    uploadMutation.mutate();
                  }}
                  disabled={!uploadFile || uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
