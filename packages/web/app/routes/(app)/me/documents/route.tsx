import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Upload,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { DocumentList } from "~/components/documents";
import { api } from "~/lib/api-client";

interface DocumentSummary {
  totalDocuments: number;
  byCategory: Record<string, number>;
  expiringSoon: number;
}

export default function MyDocumentsPage() {
  const [showUploadModal, setShowUploadModal] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ["my-documents-summary"],
    queryFn: () => api.get<DocumentSummary>("/documents/my-summary"),
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
            <Button variant="outline" size="sm">
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
      <DocumentList onUpload={() => setShowUploadModal(true)} />

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <h3 className="font-semibold">Upload Document</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              {/* Drop Zone */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer">
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                <p className="font-medium text-gray-700">
                  Drop files here or click to upload
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  PDF, DOC, DOCX, JPG, PNG up to 10MB
                </p>
              </div>

              {/* Document Details */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Document Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Driver's License"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <option value="">Select category...</option>
                    <option value="id">ID Document</option>
                    <option value="certificate">Certificate</option>
                    <option value="contract">Contract</option>
                    <option value="tax">Tax Document</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiration Date (Optional)
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowUploadModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setShowUploadModal(false)}
                >
                  Upload
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
