import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import {
  Plus,
  Search,
  FileText,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Upload,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface AdminDocument {
  id: string;
  title: string;
  category: string;
  visibility: string;
  isPublished: boolean;
  version: number;
  acknowledgementCount: number;
  createdAt: string;
}

interface AdminDocListResponse {
  data: AdminDocument[];
  pagination: { hasMore: boolean; nextCursor: string | null; prevCursor: string | null };
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const VISIBILITY_COLORS: Record<string, string> = {
  all: "bg-green-100 text-green-700",
  specific: "bg-blue-100 text-blue-700",
  admins: "bg-purple-100 text-purple-700",
};

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

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function meta() {
  return [{ title: "Document Management - Staffora Client Portal" }];
}

export default function AdminDocumentsPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<AdminDocListResponse["pagination"]>({ hasMore: false, nextCursor: null, prevCursor: null });
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (cursor) { params.set("cursor", cursor); params.set("direction", direction); }
      const res = (await portalApi.documents.list(params)) as AdminDocListResponse;
      setDocuments(res.data);
      setPagination(res.pagination);
    } catch { setError("Failed to load documents."); }
    finally { setIsLoading(false); }
  }, [search, cursor, direction]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);
  useEffect(() => { setCursor(null); }, [search]);

  async function handleTogglePublish(doc: AdminDocument) {
    try {
      await portalApi.admin.documents.update(doc.id, { isPublished: !doc.isPublished });
      setToast(doc.isPublished ? "Document unpublished" : "Document published");
      setTimeout(() => setToast(null), 3000);
      fetchDocuments();
    } catch { setError("Failed to update document."); }
  }

  async function handleDelete(doc: AdminDocument) {
    if (!window.confirm(`Are you sure you want to delete "${doc.title}"?`)) return;
    try {
      await portalApi.admin.documents.delete(doc.id);
      setToast("Document deleted");
      setTimeout(() => setToast(null), 3000);
      fetchDocuments();
    } catch { setError("Failed to delete document."); }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function handleBulkAction(action: "publish" | "unpublish" | "delete") {
    if (selected.size === 0) return;
    if (action === "delete" && !window.confirm(`Delete ${selected.size} document(s)?`)) return;
    try {
      for (const id of selected) {
        if (action === "delete") await portalApi.admin.documents.delete(id);
        else await portalApi.admin.documents.update(id, { isPublished: action === "publish" });
      }
      setToast(`${selected.size} document(s) ${action === "delete" ? "deleted" : action === "publish" ? "published" : "unpublished"}`);
      setTimeout(() => setToast(null), 3000);
      setSelected(new Set());
      fetchDocuments();
    } catch { setError("Bulk action failed."); }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {toast && <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down"><CheckCircle className="h-5 w-5 text-green-500" />{toast}</div>}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Management</h1>
          <p className="mt-1 text-sm text-gray-500">Upload and manage documents for clients.</p>
        </div>
        <Link to="/portal/admin/documents/upload" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"><Plus className="h-4 w-4" />Upload Document</Link>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents..." className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" aria-label="Search" />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <span className="text-sm font-medium text-brand-700">{selected.size} selected</span>
          <button onClick={() => handleBulkAction("publish")} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Publish</button>
          <button onClick={() => handleBulkAction("unpublish")} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Unpublish</button>
          <button onClick={() => handleBulkAction("delete")} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">Delete</button>
        </div>
      )}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}<button onClick={fetchDocuments} className="ml-2 font-medium underline hover:no-underline">Retry</button></div>}

      {isLoading && <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 rounded-xl border border-gray-100 bg-white animate-pulse" />)}</div>}

      {!isLoading && !error && documents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-16 text-center">
          <FolderOpen className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No documents</h3>
          <p className="mt-1.5 text-sm text-gray-500">Upload your first document to get started.</p>
          <Link to="/portal/admin/documents/upload" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"><Upload className="h-4 w-4" />Upload Document</Link>
        </div>
      )}

      {!isLoading && !error && documents.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="px-4 py-3"><input type="checkbox" checked={selected.size === documents.length} onChange={() => { if (selected.size === documents.length) setSelected(new Set()); else setSelected(new Set(documents.map((d) => d.id))); }} className="h-4 w-4 rounded border-gray-300 text-brand-600" /></th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Title</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Category</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Visibility</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Published</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Version</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Acknowledged</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3"><input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)} className="h-4 w-4 rounded border-gray-300 text-brand-600" /></td>
                    <td className="px-4 py-3 font-medium text-gray-900">{doc.title}</td>
                    <td className="px-4 py-3"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", CATEGORY_COLORS[doc.category] || "bg-gray-100 text-gray-700")}>{formatLabel(doc.category)}</span></td>
                    <td className="px-4 py-3"><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", VISIBILITY_COLORS[doc.visibility] || "bg-gray-100 text-gray-700")}>{formatLabel(doc.visibility)}</span></td>
                    <td className="px-4 py-3">{doc.isPublished ? <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Yes</span> : <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Draft</span>}</td>
                    <td className="px-4 py-3 text-gray-500">v{doc.version}</td>
                    <td className="px-4 py-3 text-gray-500">{doc.acknowledgementCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link to={`/portal/admin/documents/${doc.id}`} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition" aria-label="Edit"><Edit className="h-4 w-4" /></Link>
                        <button onClick={() => handleTogglePublish(doc)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition" aria-label={doc.isPublished ? "Unpublish" : "Publish"}>{doc.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                        <button onClick={() => handleDelete(doc)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && documents.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3">
          <button onClick={() => { if (pagination.prevCursor) { setDirection("prev"); setCursor(pagination.prevCursor); } }} disabled={!pagination.prevCursor} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition", pagination.prevCursor ? "text-gray-700 hover:bg-gray-100" : "cursor-not-allowed text-gray-300")}><ChevronLeft className="h-4 w-4" />Previous</button>
          <button onClick={() => { if (pagination.nextCursor) { setDirection("next"); setCursor(pagination.nextCursor); } }} disabled={!pagination.hasMore} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition", pagination.hasMore ? "text-gray-700 hover:bg-gray-100" : "cursor-not-allowed text-gray-300")}>Next<ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
