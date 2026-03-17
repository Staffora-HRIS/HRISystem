import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  CheckCircle,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Eye,
  History,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface DocumentVersion {
  version: number;
  publishedAt: string;
  fileSize: number;
  downloadUrl: string;
}

interface DocumentDetailData {
  id: string;
  title: string;
  description: string;
  category: string;
  version: number;
  mimeType: string;
  fileSize: number;
  publishedAt: string;
  downloadCount: number;
  downloadUrl: string;
  requiresAcknowledgement: boolean;
  isAcknowledged: boolean;
  acknowledgedAt: string | null;
  versions: DocumentVersion[];
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

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
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "Document - Staffora Client Portal" }];
}

export default function DocumentDetailPage() {
  const { documentId } = useParams();
  const [doc, setDoc] = useState<DocumentDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchDocument = useCallback(async () => {
    if (!documentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = (await portalApi.documents.get(documentId)) as {
        data: DocumentDetailData;
      };
      setDoc(res.data);
    } catch {
      setError("Failed to load document. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  async function handleAcknowledge() {
    if (!documentId || !doc) return;
    if (
      !window.confirm(
        "I confirm that I have read and acknowledge this document.",
      )
    )
      return;

    setAcknowledging(true);
    try {
      await portalApi.documents.acknowledge(documentId);
      setToast("Document acknowledged successfully");
      setTimeout(() => setToast(null), 3000);
      fetchDocument();
    } catch {
      setError("Failed to acknowledge document. Please try again.");
    } finally {
      setAcknowledging(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 animate-pulse">
        <div className="h-4 w-32 rounded bg-gray-200" />
        <div className="h-8 w-80 rounded bg-gray-200" />
        <div className="h-40 w-full rounded-2xl bg-gray-200" />
        <div className="h-64 w-full rounded-2xl bg-gray-200" />
      </div>
    );
  }

  if (error && !doc) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 px-6 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          Failed to load document
        </h3>
        <p className="mt-1.5 text-sm text-gray-500">{error}</p>
        <button
          onClick={fetchDocument}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!doc) return null;

  const isPdf = doc.mimeType === "application/pdf";

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      {/* Toast */}
      {toast && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down">
          <CheckCircle className="h-5 w-5 text-green-500" />
          {toast}
        </div>
      )}

      {/* Breadcrumb */}
      <nav
        className="flex items-center gap-1.5 text-sm text-gray-500"
        aria-label="Breadcrumb"
      >
        <Link
          to="/portal/documents"
          className="inline-flex items-center gap-1 hover:text-brand-600 transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Documents
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900 truncate max-w-xs">
          {doc.title}
        </span>
      </nav>

      {/* Header card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50">
              <FileText className="h-6 w-6 text-brand-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    CATEGORY_COLORS[doc.category] || "bg-gray-100 text-gray-700",
                  )}
                >
                  {formatLabel(doc.category)}
                </span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">{doc.title}</h1>
              {doc.description && (
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                  {doc.description}
                </p>
              )}
            </div>
          </div>
          <a
            href={doc.downloadUrl}
            download
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 flex-shrink-0"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>

        {/* Document info */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 rounded-xl bg-gray-50 p-4">
          <div>
            <p className="text-xs font-medium text-gray-400">Version</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">
              v{doc.version}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">File Size</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">
              {formatFileSize(doc.fileSize)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Published</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">
              {formatDate(doc.publishedAt)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400">Downloads</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-900">
              {doc.downloadCount}
            </p>
          </div>
        </div>
      </div>

      {/* Acknowledgement */}
      {doc.requiresAcknowledgement && (
        <div
          className={cn(
            "rounded-2xl border p-6",
            doc.isAcknowledged
              ? "border-green-200 bg-green-50"
              : "border-yellow-200 bg-yellow-50",
          )}
        >
          {doc.isAcknowledged ? (
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-800">
                  You acknowledged this document on{" "}
                  {doc.acknowledgedAt
                    ? formatDate(doc.acknowledgedAt)
                    : "N/A"}
                </p>
                <p className="mt-0.5 text-sm text-green-700">
                  No further action is required.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800">
                    Acknowledgement required
                  </p>
                  <p className="mt-0.5 text-sm text-yellow-700">
                    Please read this document and confirm your acknowledgement.
                  </p>
                </div>
              </div>
              <button
                onClick={handleAcknowledge}
                disabled={acknowledging}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50 flex-shrink-0"
              >
                {acknowledging ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                I have read and acknowledge this document
              </button>
            </div>
          )}
        </div>
      )}

      {/* PDF Preview */}
      {isPdf && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              Document Preview
            </span>
          </div>
          <div className="aspect-[8.5/11] w-full">
            <iframe
              src={`${doc.downloadUrl}#view=FitH`}
              title={`Preview of ${doc.title}`}
              className="h-full w-full border-0"
            />
          </div>
        </div>
      )}

      {/* Version History */}
      {doc.versions && doc.versions.length > 1 && (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4 flex items-center gap-2">
            <History className="h-4 w-4 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">
              Version History
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {doc.versions.map((v) => (
              <div
                key={v.version}
                className="flex items-center justify-between px-5 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      v.version === doc.version
                        ? "bg-brand-100 text-brand-700"
                        : "bg-gray-100 text-gray-600",
                    )}
                  >
                    v{v.version}
                    {v.version === doc.version && " (Current)"}
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatDate(v.publishedAt)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatFileSize(v.fileSize)}
                  </span>
                </div>
                <a
                  href={v.downloadUrl}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Back link */}
      <div>
        <Link
          to="/portal/documents"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to documents
        </Link>
      </div>
    </div>
  );
}
