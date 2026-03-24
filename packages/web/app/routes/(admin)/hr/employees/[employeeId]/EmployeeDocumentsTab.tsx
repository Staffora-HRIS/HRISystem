/**
 * Employee Documents Tab
 *
 * Displays a list of documents associated with the employee.
 */

import { FileText } from "lucide-react";
import { Card, CardHeader, CardBody, Badge } from "~/components/ui";
import type { EmployeeDocument } from "./types";

interface EmployeeDocumentsTabProps {
  documents: EmployeeDocument[];
  isLoading: boolean;
}

export function EmployeeDocumentsTab({ documents, isLoading }: EmployeeDocumentsTabProps) {
  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold">Documents</h3>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No documents</h3>
            <p className="text-gray-500">No documents have been uploaded for this employee.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {documents.map((doc) => (
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
  );
}
