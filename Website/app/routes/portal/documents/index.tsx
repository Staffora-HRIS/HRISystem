import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import {
  Search,
  Download,
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  Grid3X3,
  List,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FolderOpen,
  CheckCircle,
  Eye,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DocumentSummary {
  id: string;
  title: string;
  description: string;
  category: string;
  version: number;
  mimeType: string;
  fileSize: number;
  publishedAt: string;
  downloadCount: number;
  requiresAcknowledgement: boolean;
  isAcknowledged: boolean;
  acknowledgedAt: string | null;
}

interface DocumentListResponse {
  data: DocumentSummary[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    prevCursor: string | null;
  };
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "contract", label: "Contract" },
  { value: "sla", label: "SLA" },
  { value: "policy", label: "Policy" },
  { value: "guide", label: "Guide" },
  { value: "release_notes", label: "Release Notes" },
  { value: "training", label: "Training" },
  { value: "compliance", label: "Compliance" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS: Record<string, string> = {
  contract: "bg-blue-100 text-blue-700",
  sla: "bg-purple-100 text-purple-700",
  policy: "bg-indigo-100 text-indigo-700",
  guide: "bg-green-100 text-green-700",
  release_notes: "bg-cyan-100 text-cyan-700",
  training: "bg-amber-100 text-amber-700",
  compliance: "bg-red-100 text-red-700",
  other: "bg-gray-100 text-gray-700",
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv"))
    return FileSpreadsheet;
  if (mimeType.includes("pdf")) return FileText;
  return File;
}

function getFileIconColor(mimeType: string): string {
  if (mimeType.includes("pdf")) return "text-red-500";
  if (mimeType.includes("word") || mimeType.includes("document"))
    return "text-blue-500";
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv"))
    return "text-green-500";
  if (mimeType.startsWith("image/")) return "text-purple-500";
  return "text-gray-400";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-5 py-4 animate-pulse"
        >
          <div className="h-10 w-10 rounded-lg bg-gray-200" />
          <div className="h-4 w-48 rounded bg-gray-200 flex-1" />
          <div className="h-5 w-20 rounded-full bg-gray-200" />
          <div className="h-4 w-10 rounded bg-gray-200" />
          <div className="h-4 w-16 rounded bg-gray-200" />
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="h-8 w-24 rounded-lg bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "Documents - Staffora Client Portal" }];
}

export default function DocumentListPage() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<DocumentListResponse["pagination"]>({
    hasMore: false,
    nextCursor: null,
    prevCursor: null,
  });

  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (search.trim()) params.set("search", search.trim());
      if (cursor) {
        params.set("cursor", cursor);
        params.set("direction", direction);
      }
      const res = (await portalApi.documents.list(params)) as DocumentListResponse;
      setDocuments(res.data);
      setPagination(res.pagination);
    } catch {
      setError("Failed to load documents. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [category, search, cursor, direction]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    setCursor(null);
  }, [category, search]);

  async function handleAcknowledge(docId: string) {
    if (!window.confirm("I confirm that I have read and acknowledge this document."))
      return;

    setAcknowledging(docId);
    try {
      await portalApi.documents.acknowledge(docId);
      setToast("Document acknowledged successfully");
      setTimeout(() => setToast(null), 3000);
      fetchDocuments();
    } catch {
      setError("Failed to acknowledge document. Please try again.");
    } finally {
      setAcknowledging(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Toast */}
      {toast && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down">
          <CheckCircle className="h-5 w-5 text-green-500" />
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="mt-1 text-sm text-gray-500">
            Access contracts, policies, guides, and other important documents
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "rounded-md p-2 transition",
              viewMode === "list"
                ? "bg-brand-50 text-brand-600"
                : "text-gray-400 hover:text-gray-600",
            )}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "rounded-md p-2 transition",
              viewMode === "grid"
                ? "bg-brand-50 text-brand-600"
                : "text-gray-400 hover:text-gray-600",
            )}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Category tabs + Search */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Document categories">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              role="tab"
              aria-selected={category === c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition",
                category === c.value
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or description..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            aria-label="Search documents"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
          <button onClick={fetchDocuments} className="ml-2 font-medium underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && <TableSkeleton />}

      {/* Empty */}
      {!isLoading && !error && documents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
            <FolderOpen className="h-8 w-8 text-brand-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No documents found</h3>
          <p className="mt-1.5 max-w-sm text-sm text-gray-500">
            {search || category
              ? "Try adjusting your filters to find what you're looking for."
              : "No documents have been published yet. Check back later."}
          </p>
        </div>
      )}

      {/* List View */}
      {!isLoading && !error && documents.length > 0 && viewMode === "list" && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Document</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Category</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Version</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Size</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Published</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Downloads</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {documents.map((doc) => {
                  const Icon = getFileIcon(doc.mimeType);
                  const iconColor = getFileIconColor(doc.mimeType);
                  return (
                    <tr key={doc.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/portal/documents/${doc.id}`}
                          className="flex items-center gap-3 group"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50">
                            <Icon className={cn("h-5 w-5", iconColor)} />
                          </div>
                          <div>
                            <span className="font-medium text-gray-900 group-hover:text-brand-600 transition">
                              {doc.title}
                            </span>
                            {doc.requiresAcknowledgement && !doc.isAcknowledged && (
                              <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                                Action Required
                              </span>
                            )}
                            {doc.isAcknowledged && (
                              <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                Acknowledged
                              </span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium",
                            CATEGORY_COLORS[doc.category] || "bg-gray-100 text-gray-700",
                          )}
                        >
                          {formatLabel(doc.category)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">v{doc.version}</td>
                      <td className="px-5 py-3.5 text-gray-500">
                        {formatFileSize(doc.fileSize)}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">
                        {formatDate(doc.publishedAt)}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">{doc.downloadCount}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/portal/documents/${doc.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Link>
                          {doc.requiresAcknowledgement && !doc.isAcknowledged && (
                            <button
                              onClick={() => handleAcknowledge(doc.id)}
                              disabled={acknowledging === doc.id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                            >
                              {acknowledging === doc.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3.5 w-3.5" />
                              )}
                              Acknowledge
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="space-y-3 lg:hidden">
            {documents.map((doc) => {
              const Icon = getFileIcon(doc.mimeType);
              const iconColor = getFileIconColor(doc.mimeType);
              return (
                <div
                  key={doc.id}
                  className="rounded-xl border border-gray-200 bg-white p-4"
                >
                  <Link
                    to={`/portal/documents/${doc.id}`}
                    className="flex items-start gap-3"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 flex-shrink-0">
                      <Icon className={cn("h-5 w-5", iconColor)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{doc.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            CATEGORY_COLORS[doc.category] || "bg-gray-100 text-gray-700",
                          )}
                        >
                          {formatLabel(doc.category)}
                        </span>
                        <span className="text-xs text-gray-400">
                          v{doc.version} -- {formatFileSize(doc.fileSize)}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {doc.requiresAcknowledgement && !doc.isAcknowledged && (
                        <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                          Action Required
                        </span>
                      )}
                      {doc.isAcknowledged && (
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          Acknowledged
                        </span>
                      )}
                    </div>
                    {doc.requiresAcknowledgement && !doc.isAcknowledged && (
                      <button
                        onClick={() => handleAcknowledge(doc.id)}
                        disabled={acknowledging === doc.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Grid View */}
      {!isLoading && !error && documents.length > 0 && viewMode === "grid" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {documents.map((doc) => {
            const Icon = getFileIcon(doc.mimeType);
            const iconColor = getFileIconColor(doc.mimeType);
            return (
              <div
                key={doc.id}
                className="group rounded-xl border border-gray-200 bg-white p-5 transition hover:shadow-lg hover:border-gray-300"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50">
                    <Icon className={cn("h-6 w-6", iconColor)} />
                  </div>
                  {doc.requiresAcknowledgement && !doc.isAcknowledged && (
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                      Action Required
                    </span>
                  )}
                  {doc.isAcknowledged && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                </div>
                <Link to={`/portal/documents/${doc.id}`}>
                  <h3 className="font-medium text-gray-900 group-hover:text-brand-600 transition line-clamp-2">
                    {doc.title}
                  </h3>
                </Link>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      CATEGORY_COLORS[doc.category] || "bg-gray-100 text-gray-700",
                    )}
                  >
                    {formatLabel(doc.category)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatFileSize(doc.fileSize)}
                  </span>
                </div>
                <div className="mt-4">
                  <Link
                    to={`/portal/documents/${doc.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !error && documents.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3">
          <button
            onClick={() => {
              if (pagination.prevCursor) {
                setDirection("prev");
                setCursor(pagination.prevCursor);
              }
            }}
            disabled={!pagination.prevCursor}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition",
              pagination.prevCursor
                ? "text-gray-700 hover:bg-gray-100"
                : "cursor-not-allowed text-gray-300",
            )}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <button
            onClick={() => {
              if (pagination.nextCursor) {
                setDirection("next");
                setCursor(pagination.nextCursor);
              }
            }}
            disabled={!pagination.hasMore}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition",
              pagination.hasMore
                ? "text-gray-700 hover:bg-gray-100"
                : "cursor-not-allowed text-gray-300",
            )}
            aria-label="Next page"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
