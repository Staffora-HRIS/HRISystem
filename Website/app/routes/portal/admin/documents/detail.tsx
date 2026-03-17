import { useState, useEffect, useCallback, useRef, type FormEvent, type DragEvent } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { ArrowLeft, ChevronRight, Save, Upload, Loader2, AlertTriangle, RefreshCw, CheckCircle, FileText, Download, Trash2, EyeOff, Eye, X, Users } from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

interface AckRecord { userId: string; userName: string; acknowledgedAt: string }

interface AdminDocDetail {
  id: string;
  title: string;
  description: string;
  category: string;
  visibility: string;
  isPublished: boolean;
  version: number;
  fileSize: number;
  fileName: string;
  downloadUrl: string;
  requiresAcknowledgement: boolean;
  acknowledgements: AckRecord[];
  createdAt: string;
}

const CATEGORIES = [
  { value: "contract", label: "Contract" }, { value: "sla", label: "SLA" }, { value: "policy", label: "Policy" },
  { value: "guide", label: "Guide" }, { value: "release_notes", label: "Release Notes" },
  { value: "training", label: "Training" }, { value: "compliance", label: "Compliance" }, { value: "other", label: "Other" },
];

function formatDate(d: string): string { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
function formatFileSize(b: number): string { if (b < 1024) return `${b} B`; if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`; return `${(b / 1048576).toFixed(1)} MB`; }

export function meta() { return [{ title: "Edit Document - Admin - Staffora Client Portal" }]; }

export default function AdminDocumentDetailPage() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [doc, setDoc] = useState<AdminDocDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [visibility, setVisibility] = useState("all");
  const [requiresAck, setRequiresAck] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newVersionFile, setNewVersionFile] = useState<File | null>(null);

  const fetchDoc = useCallback(async () => {
    if (!documentId) return;
    setIsLoading(true); setError(null);
    try {
      const res = (await portalApi.documents.get(documentId)) as { data: AdminDocDetail };
      setDoc(res.data); setTitle(res.data.title); setDescription(res.data.description);
      setCategory(res.data.category); setVisibility(res.data.visibility); setRequiresAck(res.data.requiresAcknowledgement);
    } catch { setError("Failed to load document."); }
    finally { setIsLoading(false); }
  }, [documentId]);

  useEffect(() => { fetchDoc(); }, [fetchDoc]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!documentId || !title.trim()) return;
    setIsSaving(true);
    try {
      await portalApi.admin.documents.update(documentId, { title: title.trim(), description: description.trim(), category, visibility, requiresAcknowledgement: requiresAck });
      setToast("Document updated"); setTimeout(() => setToast(null), 3000); fetchDoc();
    } catch { setError("Failed to save."); }
    finally { setIsSaving(false); }
  }

  async function handleTogglePublish() {
    if (!documentId || !doc) return;
    try {
      await portalApi.admin.documents.update(documentId, { isPublished: !doc.isPublished });
      setToast(doc.isPublished ? "Unpublished" : "Published"); setTimeout(() => setToast(null), 3000); fetchDoc();
    } catch { setError("Failed to update."); }
  }

  async function handleDelete() {
    if (!documentId || !window.confirm("Are you sure you want to delete this document?")) return;
    try { await portalApi.admin.documents.delete(documentId); setToast("Deleted"); setTimeout(() => navigate("/portal/admin/documents"), 1500); }
    catch { setError("Failed to delete."); }
  }

  if (isLoading) return <div className="space-y-4 animate-pulse"><div className="h-6 w-48 rounded bg-gray-200" /><div className="h-64 rounded-2xl bg-gray-200" /></div>;
  if (error && !doc) return <div className="text-center py-16"><AlertTriangle className="mx-auto h-12 w-12 text-red-400" /><p className="mt-4 text-gray-600">{error}</p><button onClick={fetchDoc} className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"><RefreshCw className="mr-1 inline h-4 w-4" />Retry</button></div>;
  if (!doc) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      {toast && <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down"><CheckCircle className="h-5 w-5 text-green-500" />{toast}</div>}

      <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/portal/admin/documents" className="inline-flex items-center gap-1 hover:text-brand-600 transition"><ArrowLeft className="h-3.5 w-3.5" />Documents</Link>
        <ChevronRight className="h-3.5 w-3.5" /><span className="font-medium text-gray-900 truncate max-w-xs">{doc.title}</span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900">Edit Document</h1>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</div>}

      {/* Edit form */}
      <form onSubmit={handleSave} className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
        <div><label htmlFor="t" className="mb-1.5 block text-sm font-medium text-gray-700">Title <span className="text-red-500">*</span></label><input id="t" type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" /></div>
        <div><label htmlFor="d" className="mb-1.5 block text-sm font-medium text-gray-700">Description</label><textarea id="d" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="block w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" /></div>
        <div><label htmlFor="c" className="mb-1.5 block text-sm font-medium text-gray-700">Category</label><select id="c" value={category} onChange={(e) => setCategory(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200">{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
        <fieldset><legend className="mb-2 text-sm font-medium text-gray-700">Visibility</legend><div className="space-y-2">{[{v:"all",l:"All Clients"},{v:"specific",l:"Specific Tenants"},{v:"admins",l:"Admins Only"}].map((o) => <label key={o.v} className="flex items-center gap-3 cursor-pointer"><input type="radio" name="vis" value={o.v} checked={visibility===o.v} onChange={(e) => setVisibility(e.target.value)} className="h-4 w-4 border-gray-300 text-brand-600" /><span className="text-sm text-gray-700">{o.l}</span></label>)}</div></fieldset>
        <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600" /><span className="text-sm text-gray-700">Requires acknowledgement</span></label>
        <div className="flex justify-end"><button type="submit" disabled={isSaving} className={cn("inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition", isSaving ? "cursor-not-allowed bg-brand-400" : "bg-brand-600 hover:bg-brand-700")}>{isSaving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><Save className="h-4 w-4" />Save Changes</>}</button></div>
      </form>

      {/* Current file + upload new version */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Current File</h2>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <FileText className="h-5 w-5 text-gray-400" />
          <div className="flex-1"><p className="text-sm font-medium text-gray-700">{doc.fileName}</p><p className="text-xs text-gray-400">v{doc.version} -- {formatFileSize(doc.fileSize)}</p></div>
          <a href={doc.downloadUrl} download className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Download className="h-4 w-4" /></a>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Upload New Version</p>
          <div onClick={() => fileInputRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter") fileInputRef.current?.click(); }} role="button" tabIndex={0} className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-300 px-6 py-6 transition hover:border-gray-400 hover:bg-gray-50">
            <Upload className="mr-2 h-5 w-5 text-gray-400" /><span className="text-sm text-gray-600">Click to upload a new version</span>
          </div>
          <input ref={fileInputRef} type="file" onChange={(e) => { if (e.target.files?.[0]) setNewVersionFile(e.target.files[0]); e.target.value = ""; }} className="hidden" />
          {newVersionFile && <div className="mt-2 flex items-center gap-2 text-sm text-gray-600"><FileText className="h-4 w-4" />{newVersionFile.name} ({formatFileSize(newVersionFile.size)})<button onClick={() => setNewVersionFile(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button></div>}
        </div>
      </div>

      {/* Acknowledgement report */}
      {doc.requiresAcknowledgement && (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4 flex items-center gap-2"><Users className="h-4 w-4 text-gray-400" /><h2 className="text-base font-semibold text-gray-900">Acknowledgements ({doc.acknowledgements.length})</h2></div>
          {doc.acknowledgements.length === 0 ? <p className="p-5 text-sm text-gray-500">No acknowledgements yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50/80"><th className="px-5 py-3 text-left font-semibold text-gray-600">User</th><th className="px-5 py-3 text-left font-semibold text-gray-600">Date</th></tr></thead><tbody className="divide-y divide-gray-100">{doc.acknowledgements.map((a) => <tr key={a.userId}><td className="px-5 py-2.5 text-gray-900">{a.userName}</td><td className="px-5 py-2.5 text-gray-500">{formatDate(a.acknowledgedAt)}</td></tr>)}</tbody></table></div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button onClick={handleTogglePublish} className={cn("inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition", doc.isPublished ? "border-gray-200 text-gray-700 hover:bg-gray-50" : "border-green-200 text-green-700 hover:bg-green-50")}>
          {doc.isPublished ? <><EyeOff className="h-4 w-4" />Unpublish</> : <><Eye className="h-4 w-4" />Publish</>}
        </button>
        <button onClick={handleDelete} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50"><Trash2 className="h-4 w-4" />Delete</button>
      </div>
    </div>
  );
}
