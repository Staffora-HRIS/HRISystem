/**
 * Document List Component
 *
 * Displays a list of documents with filtering and actions.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Download,
  Trash2,
  Upload,
  Search,
  AlertCircle,
} from "lucide-react";
import { cn } from "~/lib/utils";

interface Document {
  id: string;
  tenant_id: string;
  employee_id: string | null;
  employee_name?: string;
  category: string;
  name: string;
  description: string | null;
  file_key: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  version: number;
  status: string;
  expires_at: string | null;
  tags: string[];
  uploaded_by: string;
  uploaded_by_name?: string;
  created_at: string;
  updated_at: string;
}

interface DocumentListProps {
  employeeId?: string;
  className?: string;
  onUpload?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    contract: "bg-blue-100 text-blue-700",
    id: "bg-purple-100 text-purple-700",
    certificate: "bg-green-100 text-green-700",
    policy: "bg-yellow-100 text-yellow-700",
    onboarding: "bg-orange-100 text-orange-700",
    performance: "bg-pink-100 text-pink-700",
    training: "bg-cyan-100 text-cyan-700",
    tax: "bg-red-100 text-red-700",
    other: "bg-gray-100 text-gray-700",
  };
  return colors[category] || colors.other;
}

export function DocumentList({ employeeId, className, onUpload }: DocumentListProps) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const { data, isLoading, error } = useQuery<{ items: Document[]; hasMore: boolean }>({
    queryKey: ["documents", { employeeId, search: searchTerm, category: categoryFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeId) params.set("employee_id", employeeId);
      if (searchTerm) params.set("search", searchTerm);
      if (categoryFilter) params.set("category", categoryFilter);

      const response = await fetch(`/api/v1/documents?${params}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch documents");
      }
      return response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await fetch(`/api/v1/documents/${documentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to delete document");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const downloadDocument = async (doc: Document) => {
    try {
      const response = await fetch(`/api/v1/documents/${doc.id}/download-url`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to get download URL");
      const { download_url } = await response.json();
      window.open(download_url, "_blank");
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  const categories = [
    { value: "", label: "All Categories" },
    { value: "contract", label: "Contracts" },
    { value: "id", label: "ID Documents" },
    { value: "certificate", label: "Certificates" },
    { value: "policy", label: "Policies" },
    { value: "onboarding", label: "Onboarding" },
    { value: "performance", label: "Performance" },
    { value: "training", label: "Training" },
    { value: "tax", label: "Tax Documents" },
    { value: "other", label: "Other" },
  ];

  if (isLoading) {
    return (
      <div className={cn("animate-pulse space-y-4", className)}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-gray-200" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("text-center py-8 text-red-500", className)}>
        Failed to load documents
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          {categories.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>

        {onUpload && (
          <button
            onClick={onUpload}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Upload className="h-4 w-4" />
            Upload
          </button>
        )}
      </div>

      {/* Document List */}
      <div className="rounded-lg border bg-white">
        {data?.items.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <FileText className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2">No documents found</p>
          </div>
        ) : (
          <div className="divide-y">
            {data?.items.map((doc) => {
              const isExpiringSoon =
                doc.expires_at &&
                new Date(doc.expires_at) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50"
                >
                  {/* Icon */}
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                    <FileText className="h-5 w-5 text-gray-500" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 truncate">{doc.name}</p>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          getCategoryColor(doc.category)
                        )}
                      >
                        {doc.category}
                      </span>
                      {isExpiringSoon && (
                        <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                          <AlertCircle className="h-3 w-3" />
                          Expires soon
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
                      <span>{doc.file_name}</span>
                      <span>{formatFileSize(doc.file_size)}</span>
                      {doc.uploaded_by_name && <span>by {doc.uploaded_by_name}</span>}
                      <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => downloadDocument(doc)}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this document?")) {
                          deleteMutation.mutate(doc.id);
                        }
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentList;
