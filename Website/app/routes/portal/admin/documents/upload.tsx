import { useState, useRef, type FormEvent, type DragEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, ChevronRight, Upload, X, Loader2, CheckCircle, AlertCircle, FileText } from "lucide-react";
import { cn } from "~/lib/utils";
import { portalApi } from "~/lib/portal-api";

const CATEGORIES = [
  { value: "contract", label: "Contract" }, { value: "sla", label: "SLA" },
  { value: "policy", label: "Policy" }, { value: "guide", label: "Guide" },
  { value: "release_notes", label: "Release Notes" }, { value: "training", label: "Training" },
  { value: "compliance", label: "Compliance" }, { value: "other", label: "Other" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function meta() {
  return [{ title: "Upload Document - Staffora Client Portal" }];
}

export default function UploadDocumentPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [visibility, setVisibility] = useState("all");
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [touched, setTouched] = useState({ title: false });

  const titleError = touched.title && !title.trim() ? "Title is required" : null;
  const canSubmit = title.trim() && file;

  function handleFile(f: File) {
    if (f.size > 50 * 1024 * 1024) { setError("File must be under 50MB"); return; }
    setFile(f);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }

  async function submitForm(publish: boolean) {
    setTouched({ title: true });
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await portalApi.admin.documents.create({
        title: title.trim(),
        description: description.trim(),
        category,
        visibility,
        requiresAcknowledgement,
        isPublished: publish,
        fileName: file!.name,
        fileSize: file!.size,
      });
      setToast(publish ? "Document published!" : "Document saved as draft!");
      setTimeout(() => navigate("/portal/admin/documents"), 1500);
    } catch { setError("Failed to upload document."); }
    finally { setIsSubmitting(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      {toast && <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700 shadow-lg animate-fade-in-down"><CheckCircle className="h-5 w-5 text-green-500" />{toast}</div>}

      <nav className="flex items-center gap-1.5 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link to="/portal/admin/documents" className="inline-flex items-center gap-1 hover:text-brand-600 transition"><ArrowLeft className="h-3.5 w-3.5" />Documents</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-gray-900">Upload</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload Document</h1>
        <p className="mt-1 text-sm text-gray-500">Upload a new document for clients.</p>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4" role="alert"><AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" /><p className="text-sm text-red-700">{error}</p></div>}

      <form onSubmit={(e) => { e.preventDefault(); submitForm(true); }} noValidate>
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-6">
          <div>
            <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-gray-700">Title <span className="text-red-500">*</span></label>
            <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => setTouched({ title: true })} className={cn("block w-full rounded-xl border bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2", titleError ? "border-red-300 focus:ring-red-200" : "border-gray-200 focus:border-brand-400 focus:ring-brand-200")} placeholder="Document title" />
            {titleError && <p className="mt-1.5 text-xs text-red-600">{titleError}</p>}
          </div>

          <div>
            <label htmlFor="desc" className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
            <textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="block w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200" placeholder="Brief description..." />
          </div>

          <div>
            <label htmlFor="cat" className="mb-1.5 block text-sm font-medium text-gray-700">Category</label>
            <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)} className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">File <span className="text-red-500">*</span></label>
            <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter") fileInputRef.current?.click(); }} role="button" tabIndex={0} aria-label="Upload file" className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 transition", isDragging ? "border-brand-400 bg-brand-50" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50")}>
              <Upload className="h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm font-medium text-gray-700">Drop file here or click to browse</p>
              <p className="mt-1 text-xs text-gray-400">Max 50MB</p>
            </div>
            <input ref={fileInputRef} type="file" onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }} className="hidden" />
            {file && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
                <FileText className="h-5 w-5 text-gray-400" />
                <div className="flex-1 min-w-0"><p className="truncate text-sm font-medium text-gray-700">{file.name}</p><p className="text-xs text-gray-400">{formatFileSize(file.size)}</p></div>
                <button type="button" onClick={() => setFile(null)} className="rounded-md p-1 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
              </div>
            )}
          </div>

          <fieldset>
            <legend className="mb-3 text-sm font-medium text-gray-700">Visibility</legend>
            <div className="space-y-2">
              {[{ value: "all", label: "All Clients" }, { value: "specific", label: "Specific Tenants" }, { value: "admins", label: "Admins Only" }].map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name="visibility" value={opt.value} checked={visibility === opt.value} onChange={(e) => setVisibility(e.target.value)} className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={requiresAcknowledgement} onChange={(e) => setRequiresAcknowledgement(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            <span className="text-sm text-gray-700">Requires acknowledgement from readers</span>
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link to="/portal/admin/documents" className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</Link>
          <button type="button" onClick={() => submitForm(false)} disabled={isSubmitting} className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Save as Draft</button>
          <button type="submit" disabled={isSubmitting} className={cn("inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition", isSubmitting ? "cursor-not-allowed bg-brand-400" : "bg-brand-600 hover:bg-brand-700")}>
            {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading...</> : "Publish"}
          </button>
        </div>
      </form>
    </div>
  );
}
